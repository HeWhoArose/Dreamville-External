/**
 * BackgroundProcessingQueue
 *
 * Provides a bounded, priority-ordered FIFO background processing queue with
 * strict idempotency key deduplication and Snapshot CAS (Compare-And-Swap)
 * state adjudication conforming to Milestone 5 (Feature F21) and
 * UNIFIED_AUDIT_RECONCILIATION.md §5 & §8 Phase 1E.
 *
 * Implements pure in-memory execution with zero external queue dependencies.
 */

import {
  WorldSimulatorAdjudicator,
  type WorldSimulationProposal,
  type WorldSimulationAdjudicationResult,
  type SimulationWorldState,
  type AdjudicationResultCode,
  type SimulationStateTransition,
} from './worldSimulationProposal';

export type BackgroundJobType =
  | 'MEMORY_CONSOLIDATION'
  | 'MEMORY_COMPACTION'
  | 'DISTANT_SIMULATION'
  | 'NPC_PLANNING'
  | 'NPC_GOAL_PROGRESSION'
  | 'SCHEDULED_EVENT'
  | 'WORLD_MOMENTUM'
  | 'CUSTOM';

export type BackgroundJobPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | number;

export type BackgroundJobStatus =
  | 'ENQUEUED'
  | 'PENDING'
  | 'PROCESSING'
  | 'RUNNING'
  | 'COMMITTED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'REJECTED_STALE'
  | 'FAILED'
  | 'DISCARDED_DUPLICATE';

export interface BackgroundJobSnapshot {
  worldVersion: number;
  baseStateHash: string;
  worldElapsedSeconds?: number;
  capturedAt?: string;
}

export interface BackgroundJob<TPayload = Record<string, unknown>> {
  id: string;
  jobId?: string;
  storyId: string;
  type?: BackgroundJobType;
  taskType?: BackgroundJobType;
  idempotencyKey: string;
  priority: BackgroundJobPriority;
  createdAt: string;
  completedAt?: string;
  snapshot: BackgroundJobSnapshot;
  payload: TPayload;
  status: BackgroundJobStatus;
  retryCount?: number;
  maxRetries?: number;
  proposal?: WorldSimulationProposal;
  adjudicationResult?: WorldSimulationAdjudicationResult;
  errorReason?: string;
  rebasePolicy?: 'REJECT_ON_STALE' | 'SAFE_REBASE_DISJOINT';
  targetDomain?: string;
  seq?: number;
}

export interface BackgroundJobResult {
  jobId: string;
  success: boolean;
  code: AdjudicationResultCode | 'IDEMPOTENCY_DUPLICATE_IGNORED' | 'QUEUE_FULL_REJECTED' | 'JOB_COMPLETED';
  status: BackgroundJobStatus;
  message: string;
  worldVersion: number;
  stateHash: string;
  result?: WorldSimulationAdjudicationResult;
}

export interface BackgroundQueueConfig {
  maxQueueSize?: number;
}

export class BackgroundProcessingQueue {
  private queue: BackgroundJob[] = [];
  private jobIndex: Map<string, BackgroundJob> = new Map();
  private idempotencyIndex: Map<string, BackgroundJob> = new Map();
  private committedIdempotencyKeys: Set<string> = new Set();
  private readonly maxQueueSize: number;
  private enqueueSeq = 0;

  constructor(options: BackgroundQueueConfig = {}) {
    const rawMax = options.maxQueueSize;
    this.maxQueueSize =
      typeof rawMax === 'number' && Number.isFinite(rawMax) && rawMax >= 0
        ? Math.floor(rawMax)
        : 50;
  }

  private recordCommittedKey(key: string): void {
    if (!key) return;
    if (this.committedIdempotencyKeys.has(key)) return;
    if (this.committedIdempotencyKeys.size >= 2000) {
      const oldest = this.committedIdempotencyKeys.values().next().value;
      if (oldest !== undefined) this.committedIdempotencyKeys.delete(oldest);
    }
    this.committedIdempotencyKeys.add(key);
  }

  private finalizeTerminalJob(job: BackgroundJob): void {
    const idx = this.queue.indexOf(job);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
    }
    this.idempotencyIndex.delete(job.idempotencyKey);
    if (this.jobIndex.size > 500) {
      const oldestJobId = this.jobIndex.keys().next().value;
      if (oldestJobId !== undefined && oldestJobId !== job.id) {
        this.jobIndex.delete(oldestJobId);
      }
    }
  }

  /**
   * Helper to normalize priority to a numeric rank for sorting (lower rank = higher priority).
   */
  public static normalizePriority(priority?: BackgroundJobPriority): number {
    if (typeof priority === 'number') return priority;
    switch (priority) {
      case 'CRITICAL':
        return 1;
      case 'HIGH':
        return 2;
      case 'NORMAL':
        return 5;
      case 'LOW':
        return 10;
      default:
        return 5;
    }
  }

  /**
   * Enqueues a new background job with bounded capacity and idempotency checking.
   */
  public enqueue<T = Record<string, unknown>>(
    params: {
      id?: string;
      jobId?: string;
      storyId: string;
      type?: BackgroundJobType;
      taskType?: BackgroundJobType;
      idempotencyKey: string;
      priority?: BackgroundJobPriority;
      snapshot?: BackgroundJobSnapshot;
      baseVersion?: number;
      baseStateHash?: string;
      worldElapsedSeconds?: number;
      payload?: T;
      proposal?: WorldSimulationProposal;
      maxRetries?: number;
      rebasePolicy?: 'REJECT_ON_STALE' | 'SAFE_REBASE_DISJOINT';
      targetDomain?: string;
    }
  ): {
    enqueued: boolean;
    success: boolean;
    code?: string;
    job?: BackgroundJob<T>;
    error?: string;
    errorReason?: string;
  } {
    const key = params.idempotencyKey;

    // 1. Strict Idempotency Check
    if (this.committedIdempotencyKeys.has(key) || this.idempotencyIndex.has(key)) {
      const existing = this.idempotencyIndex.get(key) as BackgroundJob<T> | undefined;
      return {
        enqueued: false,
        success: false,
        code: 'DUPLICATE_JOB_REJECTED',
        error: 'IDEMPOTENCY_DUPLICATE_IGNORED',
        job: existing,
        errorReason: `Duplicate job submission with idempotency key: ${key}`,
      };
    }

    // 2. Bounded Capacity Check
    const activeCount = this.queue.filter(
      (j) => j.status === 'ENQUEUED' || j.status === 'PENDING' || j.status === 'PROCESSING' || j.status === 'RUNNING'
    ).length;

    if (activeCount >= this.maxQueueSize) {
      return {
        enqueued: false,
        success: false,
        code: 'QUEUE_OVERFLOW_REJECTED',
        error: 'QUEUE_FULL_REJECTED',
        errorReason: `Background job queue capacity (${this.maxQueueSize}) exceeded.`,
      };
    }

    const id = params.id || params.jobId || `job_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const snapshot: BackgroundJobSnapshot = params.snapshot || {
      worldVersion: params.baseVersion ?? 1,
      baseStateHash: params.baseStateHash ?? '',
      worldElapsedSeconds: params.worldElapsedSeconds ?? 0,
      capturedAt: new Date().toISOString(),
    };

    const fullJob: BackgroundJob<T> = {
      id,
      jobId: id,
      storyId: params.storyId,
      type: params.type || params.taskType || 'CUSTOM',
      taskType: params.taskType || params.type || 'CUSTOM',
      idempotencyKey: key,
      priority: params.priority ?? 'NORMAL',
      createdAt: new Date().toISOString(),
      snapshot,
      payload: (params.payload ?? {}) as T,
      status: 'ENQUEUED',
      retryCount: 0,
      maxRetries: params.maxRetries ?? 2,
      proposal: params.proposal,
      rebasePolicy: params.rebasePolicy ?? 'REJECT_ON_STALE',
      targetDomain: params.targetDomain,
      seq: ++this.enqueueSeq,
    };

    this.queue.push(fullJob as BackgroundJob<any>);
    this.jobIndex.set(id, fullJob as BackgroundJob<any>);
    this.idempotencyIndex.set(key, fullJob as BackgroundJob<any>);

    this.sortQueue();

    return {
      enqueued: true,
      success: true,
      job: fullJob,
    };
  }

  public getPendingCount(): number {
    return this.queue.filter((j) => j.status === 'ENQUEUED' || j.status === 'PENDING').length;
  }

  public size(): number {
    return this.queue.length;
  }

  public getJob(jobId: string): BackgroundJob | undefined {
    return this.jobIndex.get(jobId);
  }

  public getPendingJobs(storyId?: string): BackgroundJob[] {
    return this.queue.filter(
      (j) => (j.status === 'ENQUEUED' || j.status === 'PENDING') && (!storyId || j.storyId === storyId)
    );
  }

  public getQueueSnapshot(): BackgroundJob[] {
    return JSON.parse(JSON.stringify(this.queue));
  }

  public clear(): void {
    this.queue = [];
    this.jobIndex.clear();
    this.idempotencyIndex.clear();
    this.committedIdempotencyKeys.clear();
  }

  /**
   * Sorts queue by priority ascending (1 = highest) and enqueue sequence ascending (FIFO).
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      const pA = BackgroundProcessingQueue.normalizePriority(a.priority);
      const pB = BackgroundProcessingQueue.normalizePriority(b.priority);
      if (pA !== pB) return pA - pB;
      return (a.seq ?? 0) - (b.seq ?? 0);
    });
  }

  /**
   * Processes the next runnable job in the queue using Snapshot CAS adjudication.
   */
  public async processNext(
    repo: {
      getWorldVersion: (storyId: string) => number;
      getCanonicalStateHash: (storyId: string) => string;
      getSimulationStateSlice: (storyId: string) => Record<string, unknown>;
      applySimulationStateTransition: (storyId: string, transition: SimulationStateTransition) => void;
      incrementWorldVersion: (storyId: string) => number;
      canSafelyRebaseDisjointProposal?: (
        storyId: string,
        proposal: WorldSimulationProposal,
        targetDomain?: string
      ) => { ok: boolean; reason?: string };
    },
    handler?: (job: BackgroundJob) => Promise<WorldSimulationProposal>
  ): Promise<BackgroundJobResult | null> {
    const jobIndex = this.queue.findIndex((j) => j.status === 'ENQUEUED' || j.status === 'PENDING');
    if (jobIndex === -1) return null;

    const job = this.queue[jobIndex];
    job.status = 'PROCESSING';

    if (this.committedIdempotencyKeys.has(job.idempotencyKey)) {
      job.status = 'DISCARDED_DUPLICATE';
      job.completedAt = new Date().toISOString();
      this.finalizeTerminalJob(job);
      return {
        jobId: job.id,
        success: true,
        code: 'IDEMPOTENCY_DUPLICATE_IGNORED',
        status: 'DISCARDED_DUPLICATE',
        message: 'Duplicate job skipped via idempotency key.',
        worldVersion: repo.getWorldVersion(job.storyId),
        stateHash: repo.getCanonicalStateHash(job.storyId),
      };
    }

    try {
      const proposal = handler ? await handler(job) : job.proposal;

      // If job has no proposal, treat as an operational job (e.g. telemetry or compaction)
      if (!proposal) {
        job.status = 'COMMITTED';
        job.completedAt = new Date().toISOString();
        this.recordCommittedKey(job.idempotencyKey);
        this.finalizeTerminalJob(job);
        return {
          jobId: job.id,
          success: true,
          code: 'JOB_COMPLETED',
          status: 'COMMITTED',
          message: 'Background job completed successfully without state mutation.',
          worldVersion: repo.getWorldVersion(job.storyId),
          stateHash: repo.getCanonicalStateHash(job.storyId),
        };
      }

      // Snapshot CAS Adjudication Check
      const currentVersion = repo.getWorldVersion(job.storyId);
      const currentHash = repo.getCanonicalStateHash(job.storyId);
      const currentWorld: SimulationWorldState = {
        worldVersion: currentVersion,
        stateHash: currentHash,
        state: repo.getSimulationStateSlice(job.storyId),
      };

      let adjResult = WorldSimulatorAdjudicator.adjudicate(currentWorld, proposal);
      let proposalToCommit = proposal;
      job.adjudicationResult = adjResult;
      job.completedAt = new Date().toISOString();

      if (!adjResult.accepted) {
        if (
          adjResult.code === 'STALE_PROPOSAL_REJECTED' &&
          job.rebasePolicy === 'SAFE_REBASE_DISJOINT' &&
          typeof repo.canSafelyRebaseDisjointProposal === 'function'
        ) {
          const rebaseCheck = repo.canSafelyRebaseDisjointProposal(
            job.storyId,
            proposal,
            job.targetDomain
          );
          if (rebaseCheck.ok) {
            const rebasedProposal: WorldSimulationProposal = {
              ...proposal,
              worldVersion: currentVersion,
              baseStateHash: currentHash,
            };
            const rebasedAdj = WorldSimulatorAdjudicator.adjudicate(currentWorld, rebasedProposal);
            job.adjudicationResult = rebasedAdj;
            if (rebasedAdj.accepted) {
              adjResult = rebasedAdj;
              proposalToCommit = rebasedProposal;
            } else {
              const failStatus: BackgroundJobStatus =
                rebasedAdj.code === 'STALE_PROPOSAL_REJECTED' ? 'REJECTED_STALE' : 'FAILED';
              job.status = failStatus;
              job.errorReason = rebasedAdj.message;
              this.finalizeTerminalJob(job);
              return {
                jobId: job.id,
                success: false,
                code: rebasedAdj.code,
                status: failStatus,
                message: rebasedAdj.message,
                worldVersion: currentVersion,
                stateHash: currentHash,
                result: rebasedAdj,
              };
            }
          }
        }

        if (!adjResult.accepted) {
          if (adjResult.code === 'STALE_PROPOSAL_REJECTED') {
            job.status = 'REJECTED_STALE';
            job.errorReason = adjResult.message;
            this.finalizeTerminalJob(job);
            return {
              jobId: job.id,
              success: false,
              code: 'STALE_PROPOSAL_REJECTED',
              status: 'REJECTED_STALE',
              message: adjResult.message,
              worldVersion: currentVersion,
              stateHash: currentHash,
              result: adjResult,
            };
          }

          job.status = 'FAILED';
          job.errorReason = adjResult.message;
          this.finalizeTerminalJob(job);
          return {
            jobId: job.id,
            success: false,
            code: adjResult.code,
            status: 'FAILED',
            message: adjResult.message,
            worldVersion: currentVersion,
            stateHash: currentHash,
            result: adjResult,
          };
        }
      }

      // Commit State to Canonical Repository
      repo.applySimulationStateTransition(job.storyId, proposalToCommit.proposedStateTransition);
      repo.incrementWorldVersion(job.storyId);
      this.recordCommittedKey(job.idempotencyKey);
      job.status = 'COMMITTED';
      this.finalizeTerminalJob(job);

      return {
        jobId: job.id,
        success: true,
        code: 'PROPOSAL_COMMITTED',
        status: 'COMMITTED',
        message: adjResult.message,
        worldVersion: adjResult.worldVersion,
        stateHash: adjResult.stateHash,
        result: adjResult,
      };
    } catch (err: any) {
      job.status = 'FAILED';
      job.completedAt = new Date().toISOString();
      job.errorReason = err.message || String(err);
      this.finalizeTerminalJob(job);
      return {
        jobId: job.id,
        success: false,
        code: 'FORBIDDEN_MUTATION_REJECTED',
        status: 'FAILED',
        message: err.message || 'Execution error during background job adjudication.',
        worldVersion: repo.getWorldVersion(job.storyId),
        stateHash: repo.getCanonicalStateHash(job.storyId),
      };
    }
  }

  /**
   * Drains and processes all pending jobs.
   * Supports both (repo, handler) and (currentWorld, onCommit) calling conventions.
   */
  public async drain(
    repoOrWorld: any,
    handlerOrOnCommit?: any
  ): Promise<any> {
    // Check if called as drain(currentWorld, onCommit)
    if (repoOrWorld && typeof repoOrWorld.worldVersion === 'number' && typeof repoOrWorld.stateHash === 'string') {
      const currentWorld: SimulationWorldState = repoOrWorld;
      let workingWorld: SimulationWorldState = {
        worldVersion: currentWorld.worldVersion,
        stateHash: currentWorld.stateHash,
        state: { ...(currentWorld.state || {}) },
      };
      const onCommit: ((result: WorldSimulationAdjudicationResult) => void) | undefined = handlerOrOnCommit;
      const pending = [...this.getPendingJobs()];
      let committed = 0;
      let rejected = 0;
      const results: Array<{ jobId: string; code: string; result?: WorldSimulationAdjudicationResult }> = [];

      for (const job of pending) {
        job.status = 'RUNNING';

        if (this.committedIdempotencyKeys.has(job.idempotencyKey)) {
          job.status = 'DISCARDED_DUPLICATE';
          job.completedAt = new Date().toISOString();
          this.idempotencyIndex.delete(job.idempotencyKey);
          results.push({ jobId: job.id, code: 'IDEMPOTENCY_DUPLICATE_IGNORED' });
          continue;
        }

        if (!job.proposal) {
          job.status = 'COMPLETED';
          job.completedAt = new Date().toISOString();
          this.recordCommittedKey(job.idempotencyKey);
          this.idempotencyIndex.delete(job.idempotencyKey);
          committed++;
          results.push({ jobId: job.id, code: 'JOB_COMPLETED' });
          continue;
        }

        const adjResult = WorldSimulatorAdjudicator.adjudicate(workingWorld, job.proposal);
        job.adjudicationResult = adjResult;
        job.completedAt = new Date().toISOString();

        if (adjResult.accepted) {
          job.status = 'COMPLETED';
          this.recordCommittedKey(job.idempotencyKey);
          this.idempotencyIndex.delete(job.idempotencyKey);
          workingWorld = {
            worldVersion: adjResult.worldVersion,
            stateHash: adjResult.stateHash,
            state: {
              ...workingWorld.state,
              ...(job.proposal.proposedStateTransition?.payload || {}),
            },
          };
          committed++;
          if (onCommit) onCommit(adjResult);
          results.push({ jobId: job.id, code: adjResult.code, result: adjResult });
        } else {
          job.status = 'REJECTED';
          job.errorReason = adjResult.message;
          this.idempotencyIndex.delete(job.idempotencyKey);
          rejected++;
          results.push({ jobId: job.id, code: adjResult.code, result: adjResult });
        }
      }

      this.queue = this.queue.filter((j) => j.status === 'PENDING' || j.status === 'ENQUEUED');
      return { processed: pending.length, committed, rejected, results };
    }

    // Default: called as drain(repo, handler)
    const results: BackgroundJobResult[] = [];
    while (this.getPendingCount() > 0) {
      const res = await this.processNext(repoOrWorld, handlerOrOnCommit);
      if (res) results.push(res);
      else break;
    }
    return results;
  }
}

/**
 * Backwards-compatible alias for existing tests or references.
 */
export const BackgroundJobQueue = BackgroundProcessingQueue;
export type BackgroundJobQueue = BackgroundProcessingQueue;
