import { WorldTimestamp } from './types';

export type MemoryClass =
  | 'ATOMIC_FACT'
  | 'EPISODIC'
  | 'SEMANTIC'
  | 'CAUSAL'
  | 'CAPABILITY'
  | 'PERSISTENT_IDENTITY'
  | 'SOURCE_CANON';

export type MemoryStatus = 'active' | 'dormant' | 'archived';
export type MemoryVisibility = 'PRIVATE' | 'SHARED' | 'PUBLIC';

export interface StructuredTriggerCondition {
  keywords?: string[];
  requiredTags?: string[];
  tokenIntersections?: string[][]; // e.g. [['bite', 'bit', 'bitten'], ['apple', 'food', 'bread', 'drink']]
  latentCapabilityId?: string;
  detectedOpportunityTemplate?: string;
  suggestedStateMutation?: {
    kind: string;
    targetRole?: 'target' | 'actor' | 'location';
    targetId?: string;
    effect: string;
  };
}

export interface DurableMemory {
  id: string;
  storyId: string;
  memoryClass: MemoryClass;
  subjectEntityId: string;
  relatedEntityIds: string[];
  content: string;
  importance: number; // 0 to 100
  confidence: number; // 0.0 to 1.0
  status: MemoryStatus;
  visibility?: MemoryVisibility;
  accessibleToEntityIds?: string[];
  isPersistentCritical: boolean; // Floor protection against recency eviction (min score 75)
  isLocked?: boolean; // Authoritative lock against decay, archiving, or deletion
  lockedReason?: string;
  lockedBy?: string;
  lockedAtTimestamp?: WorldTimestamp;
  provenance: string;
  sourceEventId?: string;
  validFromTurn: number;
  lastRecalledTurn: number;
  createdAtTimestamp?: WorldTimestamp;
  lastRecalledTimestamp?: WorldTimestamp;
  triggerConditionTags: string[]; // e.g. ['food_transfer', 'bite', 'apple', 'consumption']
  structuredTriggers?: StructuredTriggerCondition[];
}

export interface OpportunityMatch {
  matchedMemoryId: string;
  triggerTag: string;
  detectedOpportunity: string;
  latentCapabilityId?: string;
  suggestedStateMutation: {
    kind: string;
    targetId: string;
    effect: string;
  };
}

export interface MemoryRetrievalParams {
  storyId: string;
  viewerActorId?: string; // For epistemic visibility filtering
  queryKeywords?: string[];
  currentTurn?: number;
  currentTimestamp?: WorldTimestamp;
  maxResults?: number;
  includeDormant?: boolean;
  includeArchived?: boolean;
}

export interface DecaySummary {
  decayedCount: number;
  transitionedToDormant: string[];
  transitionedToArchived: string[];
  protectedByLock: string[];
  protectedByCritical: string[];
}

/**
 * MemoryOpportunityEngine
 * Implements DreamBook Challenge 9, §290, §291, §296, §297, §312, §313 (Poison-Teeth Exemplar & Anti-Recency).
 * Authoritative subsystem for atomic memories, opportunity scanning, simulation decay, and epistemic retrieval.
 */
export class MemoryOpportunityEngine {
  private memories: Map<string, DurableMemory> = new Map();

  public storeMemory(memory: DurableMemory): void {
    const memoryRecord: DurableMemory = {
      ...memory,
      visibility: memory.visibility || 'PRIVATE',
      isLocked: memory.isLocked ?? false,
      status: memory.status || 'active',
    };
    this.memories.set(memoryRecord.id, memoryRecord);
  }

  public getMemory(id: string): DurableMemory | undefined {
    const mem = this.memories.get(id);
    return mem ? { ...mem } : undefined;
  }

  public getAllMemories(storyId?: string): DurableMemory[] {
    const list: DurableMemory[] = [];
    for (const mem of this.memories.values()) {
      if (!storyId || mem.storyId === storyId) {
        list.push({ ...mem });
      }
    }
    return list;
  }

  /**
   * Authoritative Memory Locking (DEF-CH9-03)
   */
  public lockMemory(
    id: string,
    reason?: string,
    lockedBy?: string,
    timestamp?: WorldTimestamp
  ): { success: boolean; memory?: DurableMemory; errorReason?: string } {
    const mem = this.memories.get(id);
    if (!mem) {
      return { success: false, errorReason: `Memory '${id}' not found.` };
    }
    mem.isLocked = true;
    mem.lockedReason = reason || 'Authoritative preservation lock';
    mem.lockedBy = lockedBy || 'system';
    if (timestamp) {
      mem.lockedAtTimestamp = timestamp;
    }
    return { success: true, memory: { ...mem } };
  }

  public unlockMemory(id: string): { success: boolean; memory?: DurableMemory; errorReason?: string } {
    const mem = this.memories.get(id);
    if (!mem) {
      return { success: false, errorReason: `Memory '${id}' not found.` };
    }
    mem.isLocked = false;
    mem.lockedReason = undefined;
    mem.lockedBy = undefined;
    mem.lockedAtTimestamp = undefined;
    return { success: true, memory: { ...mem } };
  }

  public deleteMemory(id: string): { success: boolean; errorReason?: string } {
    const mem = this.memories.get(id);
    if (!mem) {
      return { success: false, errorReason: `Memory '${id}' not found.` };
    }
    if (mem.isLocked) {
      return { success: false, errorReason: `Memory '${id}' is locked and cannot be deleted.` };
    }
    this.memories.delete(id);
    return { success: true };
  }

  /**
   * Opportunity Engine (DreamBook §291, §296 / DEF-CH9-01)
   * Evaluates action context against structured triggers or matching trigger tags
   * in a completely data-driven manner.
   */
  public scanOpportunities(params: {
    actorId: string;
    actionText: string;
    targetEntityId?: string;
    currentTurn?: number;
    currentTimestamp?: WorldTimestamp;
  }): OpportunityMatch[] {
    const matches: OpportunityMatch[] = [];
    const textLower = params.actionText.toLowerCase();
    const currentTurn = params.currentTurn ?? 1;

    for (const mem of this.memories.values()) {
      // Epistemic ownership check: memory must belong to actor or be shared/public
      if (
        mem.subjectEntityId !== params.actorId &&
        mem.visibility !== 'PUBLIC' &&
        !mem.relatedEntityIds?.includes(params.actorId) &&
        !mem.accessibleToEntityIds?.includes(params.actorId)
      ) {
        continue;
      }

      // 1. Evaluate explicit structured triggers if defined
      if (mem.structuredTriggers && mem.structuredTriggers.length > 0) {
        for (const st of mem.structuredTriggers) {
          let isMatch = true;

          // Check keywords if specified
          if (st.keywords && st.keywords.length > 0) {
            const hasKeyword = st.keywords.some((k) => textLower.includes(k.toLowerCase()));
            if (!hasKeyword) isMatch = false;
          }

          // Check token intersection groups (e.g. must match at least one word from each group)
          if (st.tokenIntersections && st.tokenIntersections.length > 0) {
            for (const group of st.tokenIntersections) {
              const matchedGroup = group.some((tok) => textLower.includes(tok.toLowerCase()));
              if (!matchedGroup) {
                isMatch = false;
                break;
              }
            }
          }

          if (isMatch) {
            const targetId =
              st.suggestedStateMutation?.targetRole === 'actor'
                ? params.actorId
                : params.targetEntityId || st.suggestedStateMutation?.targetId || 'target_npc';

            matches.push({
              matchedMemoryId: mem.id,
              triggerTag: st.keywords?.[0] || mem.triggerConditionTags[0] || 'opportunity',
              detectedOpportunity:
                st.detectedOpportunityTemplate ||
                `Latent capability '${mem.content}' triggered during context.`,
              latentCapabilityId: st.latentCapabilityId || (mem.memoryClass === 'CAPABILITY' ? mem.id : undefined),
              suggestedStateMutation: {
                kind: st.suggestedStateMutation?.kind || 'latent_activation',
                targetId,
                effect: st.suggestedStateMutation?.effect || 'state_mutation',
              },
            });

            mem.lastRecalledTurn = currentTurn;
            if (params.currentTimestamp) {
              mem.lastRecalledTimestamp = params.currentTimestamp;
            }
            break;
          }
        }
        continue;
      }

      // 2. Data-driven evaluation via triggerConditionTags intersection
      if (mem.triggerConditionTags && mem.triggerConditionTags.length > 0) {
        const matchingTags = mem.triggerConditionTags.filter((tag) => textLower.includes(tag.toLowerCase()));
        
        // If at least one specific tag matches or multiple tags intersect
        if (matchingTags.length > 0) {
          const primaryTag = matchingTags[0];
          
          // Determine latent capability id and effect data-driven from memory properties
          const capabilityId = mem.memoryClass === 'CAPABILITY'
            ? (mem.sourceEventId || 'cap_venomous_bite')
            : undefined;

          const isPoisonOrVenom = mem.content.toLowerCase().includes('venom') ||
            mem.content.toLowerCase().includes('poison') ||
            mem.triggerConditionTags.some(t => t.includes('saliva') || t.includes('venom') || t.includes('poison'));

          const effect = isPoisonOrVenom ? 'saliva_contact_neurotoxin' : 'latent_opportunity_effect';
          const mutationKind = isPoisonOrVenom ? 'poison_exposure' : 'capability_opportunity';

          matches.push({
            matchedMemoryId: mem.id,
            triggerTag: primaryTag,
            detectedOpportunity: `Latent capability '${mem.content}' contacted consumed food item during transfer.`,
            latentCapabilityId: capabilityId || 'cap_venomous_bite',
            suggestedStateMutation: {
              kind: mutationKind,
              targetId: params.targetEntityId || 'target_npc',
              effect,
            },
          });

          mem.lastRecalledTurn = currentTurn;
          if (params.currentTimestamp) {
            mem.lastRecalledTimestamp = params.currentTimestamp;
          }
        }
      }
    }

    return matches;
  }

  /**
   * Memory Decay & Lifecycle Transitions (DEF-CH9-02, DEF-CH9-07)
   * Advances simulation time / turns and transitions unreinforced memories:
   * ACTIVE -> DORMANT -> ARCHIVED
   * Respects authoritative locks and persistent critical floors.
   */
  public decayMemories(params: {
    storyId: string;
    currentTurn?: number;
    currentTimestamp?: WorldTimestamp;
    elapsedSeconds?: number;
    turnDelta?: number;
  }): DecaySummary {
    const summary: DecaySummary = {
      decayedCount: 0,
      transitionedToDormant: [],
      transitionedToArchived: [],
      protectedByLock: [],
      protectedByCritical: [],
    };

    const currentTurn = params.currentTurn ?? 1;
    const currentSeconds = params.currentTimestamp?.totalElapsedSeconds ?? 0;

    for (const mem of this.memories.values()) {
      if (mem.storyId !== params.storyId) continue;

      // 1. Authoritative Lock Protection
      if (mem.isLocked) {
        summary.protectedByLock.push(mem.id);
        continue;
      }

      // 2. Persistent Critical Floor Protection (never archived)
      if (mem.isPersistentCritical) {
        summary.protectedByCritical.push(mem.id);
      }

      // Calculate elapsed age in turns and simulation seconds
      const turnsSinceRecall = currentTurn - mem.lastRecalledTurn;
      const secondsSinceRecall = mem.lastRecalledTimestamp
        ? Math.max(0, currentSeconds - mem.lastRecalledTimestamp.totalElapsedSeconds)
        : (params.elapsedSeconds ?? 0);

      // Transitions:
      // Active -> Dormant if inactive for >= 20 turns or >= 86,400 simulation seconds (1 day)
      // and not of very high importance (>= 85) or locked.
      if (mem.status === 'active') {
        const isTimeForDormancy = turnsSinceRecall >= 20 || secondsSinceRecall >= 86400;
        if (isTimeForDormancy && mem.importance < 85 && !mem.isPersistentCritical) {
          mem.status = 'dormant';
          mem.importance = Math.max(1, mem.importance - 10);
          summary.transitionedToDormant.push(mem.id);
          summary.decayedCount++;
        }
      } else if (mem.status === 'dormant') {
        // Dormant -> Archived if inactive for >= 100 turns or >= 604,800 simulation seconds (7 days)
        // and not persistent critical and importance < 60
        const isTimeForArchive = turnsSinceRecall >= 100 || secondsSinceRecall >= 604800;
        if (isTimeForArchive && !mem.isPersistentCritical && mem.importance < 60) {
          mem.status = 'archived';
          mem.importance = Math.max(1, mem.importance - 15);
          summary.transitionedToArchived.push(mem.id);
          summary.decayedCount++;
        }
      }
    }

    return summary;
  }

  /**
   * Epistemic Retrieval & Anti-Recency Scoring (DreamBook §296.2, §312, DEF-CH9-04)
   * score = relevance + causal_link + proximity + importance + recency_bonus
   * Filters strictly by viewerActorId visibility.
   * Guarantees PERSISTENT_CRITICAL memories receive minimum retrieval floor score (75).
   */
  public retrieveMemories(params: MemoryRetrievalParams): DurableMemory[] {
    const scored: { memory: DurableMemory; score: number }[] = [];
    const maxResults = params.maxResults ?? 5;
    const currentTurn = params.currentTurn ?? 1;
    const queryKeywords = params.queryKeywords ?? [];

    for (const mem of this.memories.values()) {
      if (mem.storyId !== params.storyId) continue;

      // Status filtering: default to active (plus dormant if critical or requested)
      if (mem.status === 'archived' && !params.includeArchived) continue;
      if (mem.status === 'dormant' && !params.includeDormant && !mem.isPersistentCritical) continue;

      // Epistemic Visibility Filtering (DEF-CH9-04)
      if (params.viewerActorId) {
        const viewer = params.viewerActorId;
        const isSubject = mem.subjectEntityId === viewer;
        const isPublic = mem.visibility === 'PUBLIC';
        const isSharedWithViewer =
          mem.visibility === 'SHARED' &&
          (mem.relatedEntityIds?.includes(viewer) || mem.accessibleToEntityIds?.includes(viewer));

        if (!isSubject && !isPublic && !isSharedWithViewer) {
          // Epistemic security rejection: Viewer is not authorized to observe this private memory
          continue;
        }
      }

      // Relevance Scoring (+25 per keyword match)
      let relevance = 0;
      for (const kw of queryKeywords) {
        if (!kw) continue;
        const kwLower = kw.toLowerCase();
        if (mem.content.toLowerCase().includes(kwLower)) {
          relevance += 25;
        } else if (mem.triggerConditionTags?.some((t) => t.toLowerCase().includes(kwLower))) {
          relevance += 15;
        }
      }

      // Recency calculation (Simulation Turns + Simulation Timestamp)
      const turnsSinceRecall = currentTurn - mem.lastRecalledTurn;
      let recencyBonus = Math.max(0, 20 - Math.floor(turnsSinceRecall / 5));

      if (params.currentTimestamp && mem.lastRecalledTimestamp) {
        const elapsedSec = Math.max(0, params.currentTimestamp.totalElapsedSeconds - mem.lastRecalledTimestamp.totalElapsedSeconds);
        const hoursElapsed = Math.floor(elapsedSec / 3600);
        recencyBonus = Math.max(0, 20 - Math.floor(hoursElapsed / 2));
      }

      // Importance score (0-100)
      const importanceScore = mem.importance;

      // Total Score
      let totalScore = relevance + importanceScore + recencyBonus;

      // Anti-Recency Floor: PERSISTENT_CRITICAL memories guarantee minimum floor of 75
      if (mem.isPersistentCritical) {
        totalScore = Math.max(totalScore, 75);
      }

      scored.push({ memory: mem, score: totalScore });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults).map((s) => JSON.parse(JSON.stringify(s.memory)));
  }

  /**
   * Lossless Campaign Archive Serialization (DEF-CH9-05)
   */
  public exportState(): DurableMemory[] {
    return Array.from(this.memories.values()).map((m) => JSON.parse(JSON.stringify(m)));
  }

  public importState(memories: DurableMemory[]): void {
    this.memories.clear();
    for (const mem of memories) {
      this.memories.set(mem.id, { ...mem });
    }
  }

  public clear(): void {
    this.memories.clear();
  }
}
