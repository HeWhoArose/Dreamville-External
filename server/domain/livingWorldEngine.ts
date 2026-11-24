/**
 * LivingWorldEngine
 *
 * Implements the Unified Living-World Simulation Tick for Milestone 5 (Feature F20)
 * conforming to DreamBook §333, §334, §343, §355 and UNIFIED_AUDIT_RECONCILIATION.md Phase 1E.
 *
 * Executes strictly bounded (< 5ms) synchronous ticks for active/co-located entities
 * during player turns, advancing the world clock monotonically, updating co-located
 * NPC daily schedule windows, evicting expired temporary entities, ticking condition
 * engines, and generating background work descriptors for asynchronous processing.
 */

import type { WorldRepository } from '../repositories/worldRepository';
import type { WorldTimestamp } from './types';
import type { EntityCard } from './entityCard';
import { EntityLifecycleStateMachine } from './entityLifecycle';
import { TimeBudgetGovernor, type ActionTimeBudget } from './timeBudgetGovernor';
import type { WorldSimulationCommitRecord } from './worldSimulationProposal';
import { WorldActivityDirector } from './worldActivityDirector';
import { formatCanonicalTimestamp } from './deterministicRng';

export interface LivingWorldTickResult {
  success: boolean;
  elapsedSeconds: number;
  budgetCategory: string;
  previousTimestamp: WorldTimestamp;
  currentTimestamp: WorldTimestamp;
  activeEntityUpdates: Array<{
    entityId: string;
    name: string;
    previousActivity?: string;
    newActivity: string;
    locationId: string;
  }>;
  evictedEntityIds: string[];
  commitRecords: WorldSimulationCommitRecord[];
  backgroundWorkNeeded?: {
    storyId: string;
    snapshotWorldVersion: number;
    baseStateHash: string;
    distantLocationIds: string[];
  };
}

export class LivingWorldEngine {
  /**
   * Decrements TTL and evicts expired or departed ACTIVE_TEMPORARY entities.
   * Shared between synchronous turn ticks and explicit time jumps.
   */
  public static evictTemporaryEntities(
    repository: WorldRepository,
    storyId: string,
    playerLocationId: string,
    currentTimestamp: WorldTimestamp
  ): { evictedEntityIds: string[]; commitRecords: WorldSimulationCommitRecord[] } {
    const evictedEntityIds: string[] = [];
    const commitRecords: WorldSimulationCommitRecord[] = [];
    const candidates: ReadonlyArray<EntityCard> =
      typeof (repository as any).getEntityRegistry === 'function'
        ? (repository.getEntityRegistry(storyId).listReadOnly({ status: 'ACTIVE' }) as ReadonlyArray<EntityCard>)
        : repository.getEntityCards(storyId, { status: 'ACTIVE' });

    for (const card of candidates) {
      if (card.lifecycle?.stage !== 'ACTIVE_TEMPORARY') continue;
      const outcome = this.processTemporaryCard(repository, storyId, card, playerLocationId, currentTimestamp);
      if (outcome.evicted) {
        evictedEntityIds.push(card.id);
        if (outcome.commitRecord) commitRecords.push(outcome.commitRecord);
      }
    }
    return { evictedEntityIds, commitRecords };
  }

  private static processTemporaryCard(
    repository: WorldRepository,
    storyId: string,
    card: Readonly<EntityCard>,
    playerLocationId: string,
    currentTimestamp: WorldTimestamp
  ): { evicted: boolean; commitRecord?: WorldSimulationCommitRecord } {
    let newTtl = card.lifecycle?.ttlTurns;
    let ttlUpdated = false;
    if (typeof card.lifecycle?.ttlTurns === 'number') {
      newTtl = Math.max(0, card.lifecycle.ttlTurns - 1);
      if (newTtl !== card.lifecycle.ttlTurns) {
        ttlUpdated = true;
      }
    }

    const departed = Boolean(
      playerLocationId &&
      card.worldState?.locationId &&
      playerLocationId !== card.worldState.locationId
    );
    const shouldEvict = EntityLifecycleStateMachine.shouldEvict(
      {
        ...card.lifecycle,
        ttlTurns: newTtl,
        locationId: card.worldState?.locationId,
      },
      playerLocationId
    );

    if (shouldEvict) {
      if (card.lifecycle) {
        card.lifecycle.ttlTurns = newTtl;
        card.lifecycle.stage = 'EPHEMERAL';
        card.lifecycle.status = 'DORMANT';
      }
      if (card.worldState) {
        card.worldState.presence = 'absent';
      }
      const mutableCard: EntityCard = {
        ...card,
        lifecycle: {
          ...card.lifecycle,
          ttlTurns: newTtl,
          stage: 'EPHEMERAL',
          status: 'DORMANT',
        },
        worldState: {
          ...card.worldState,
          presence: 'absent',
        },
        updatedAt: formatCanonicalTimestamp(currentTimestamp),
      };
      repository.saveEntityCard(storyId, mutableCard);
      return {
        evicted: true,
        commitRecord: {
          kind: 'TEMPORARY_ENTITY_EVICTION',
          targetId: card.id,
          operation: 'DELETE',
          provenance: departed
            ? 'LIVING_WORLD_ENGINE:LOCATION_DEPARTED'
            : 'LIVING_WORLD_ENGINE:TTL_EXPIRED',
        },
      };
    }

    if (ttlUpdated) {
      if (card.lifecycle) {
        card.lifecycle.ttlTurns = newTtl;
      }
      const mutableCard: EntityCard = {
        ...card,
        lifecycle: {
          ...card.lifecycle,
          ttlTurns: newTtl,
        },
        updatedAt: formatCanonicalTimestamp(currentTimestamp),
      };
      repository.saveEntityCard(storyId, mutableCard);
    }

    return { evicted: false };
  }

  /**
   * Executes one authoritative living-world simulation tick for a story turn.
   * Strictly bounds synchronous execution to active and co-located entities (< 5ms).
   */
  public static tickTurn(
    repository: WorldRepository,
    params: {
      storyId: string;
      actionType?: string;
      actionText?: string;
      isQueryOnly?: boolean;
      explicitSeconds?: number;
      travelSeconds?: number;
      alreadyElapsedThisTurnSeconds?: number;
    }
  ): LivingWorldTickResult {
    const { storyId } = params;
    const clock = repository.getWorldClock(storyId);
    const previousTimestamp = clock.getTimestamp();

    // 1. Calculate deterministic time budget
    const budget: ActionTimeBudget = TimeBudgetGovernor.calculateTimeBudget(params);
    let elapsedSeconds = budget.durationSeconds;
    let externallyAdvanced = 0;

    // Detect external clock advance since last turn (e.g. from manual test advance or external time skips)
    if (
      params.explicitSeconds === undefined &&
      typeof (repository as any).getLastTurnElapsedSeconds === 'function'
    ) {
      const lastRecorded = (repository as any).getLastTurnElapsedSeconds(storyId);
      externallyAdvanced = Math.max(0, previousTimestamp.totalElapsedSeconds - lastRecorded);
      if (externallyAdvanced > 0) {
        elapsedSeconds = Math.max(0, elapsedSeconds - externallyAdvanced);
      }
    }

    // Only subtract time already advanced within this same turn (e.g. from processAction travel/advance)
    if (
      params.explicitSeconds === undefined &&
      typeof params.alreadyElapsedThisTurnSeconds === 'number' &&
      Number.isFinite(params.alreadyElapsedThisTurnSeconds) &&
      params.alreadyElapsedThisTurnSeconds > 0
    ) {
      elapsedSeconds = Math.max(0, elapsedSeconds - params.alreadyElapsedThisTurnSeconds);
    }

    // 2. Advance world clock monotonically
    const updatedState = clock.advanceSeconds(elapsedSeconds);
    const currentTimestamp = updatedState.timestamp;

    if (typeof (repository as any).setLastTurnElapsedSeconds === 'function') {
      (repository as any).setLastTurnElapsedSeconds(storyId, currentTimestamp.totalElapsedSeconds);
    }

    const commitRecords: WorldSimulationCommitRecord[] = [];
    const activeEntityUpdates: LivingWorldTickResult['activeEntityUpdates'] = [];
    const evictedEntityIds: string[] = [];

    // Return early if no time elapsed and no external advance occurred (e.g. read-only query)
    if (budget.durationSeconds <= 0 && externallyAdvanced <= 0) {
      return {
        success: true,
        elapsedSeconds: 0,
        budgetCategory: budget.category,
        previousTimestamp,
        currentTimestamp,
        activeEntityUpdates,
        evictedEntityIds,
        commitRecords,
        backgroundWorkNeeded: undefined,
      };
    }

    if (elapsedSeconds > 0 || externallyAdvanced > 0) {
      commitRecords.push({
        kind: 'WORLD_CLOCK_ADVANCE',
        targetId: storyId,
        operation: 'UPDATE',
        provenance: `TIME_BUDGET_GOVERNOR:${budget.category}`,
      });
    }

    const player = repository.getPlayerLifecycle(storyId);
    const playerLocationId = player?.locationId || 'loc_crimson_office';
    const geography = repository.getGeographyGraph(storyId);
    const livingSim = repository.getLivingWorldSimulation(storyId);

    // 3. Synchronous Tick: ACTIVE co-located entities + ACTIVE_TEMPORARY entities
    const activeCandidates: ReadonlyArray<EntityCard> =
      typeof (repository as any).getEntityRegistry === 'function'
        ? (repository.getEntityRegistry(storyId).listReadOnly({
            status: 'ACTIVE',
            locationIdOrTemporary: playerLocationId,
          }) as ReadonlyArray<EntityCard>)
        : repository.getEntityCards(storyId, {
            status: 'ACTIVE',
            locationIdOrTemporary: playerLocationId,
          });

    for (const card of activeCandidates) {
      const isCoLocated = card.worldState.locationId === playerLocationId;

      // Handle ACTIVE_TEMPORARY TTL countdown and eviction
      if (card.lifecycle?.stage === 'ACTIVE_TEMPORARY') {
        const tempOutcome = this.processTemporaryCard(
          repository,
          storyId,
          card,
          playerLocationId,
          currentTimestamp
        );
        if (tempOutcome.evicted) {
          evictedEntityIds.push(card.id);
          if (tempOutcome.commitRecord) commitRecords.push(tempOutcome.commitRecord);
          continue;
        }
      }

      // Synchronous schedule / activity update for co-located NPCs
      if (isCoLocated && card.worldState.isAlive && card.worldState.presence === 'present') {
        let newActivity = card.worldState.currentActivity || 'idle';
        let newLocationId = card.worldState.locationId;

        const scheduleLookup =
          typeof (livingSim as any).determineActiveActivityReadOnly === 'function'
            ? livingSim.determineActiveActivityReadOnly(
                card.id,
                currentTimestamp.hour,
                currentTimestamp.minute
              )
            : (() => {
                const npcProfile = livingSim.getNpcSchedule(card.id);
                if (!npcProfile) return { found: false as const };
                const activeEntry = livingSim.determineActiveScheduleEntry(
                  npcProfile,
                  currentTimestamp.hour,
                  currentTimestamp.minute
                );
                return {
                  found: true as const,
                  activity: activeEntry ? activeEntry.activity : npcProfile.fallbackActivity,
                  locationId: activeEntry ? activeEntry.targetLocationId : npcProfile.fallbackLocationId,
                };
              })();

        if (scheduleLookup.found) {
          if (scheduleLookup.activity) {
            newActivity = scheduleLookup.activity;
          }
          if (scheduleLookup.locationId) {
            newLocationId = scheduleLookup.locationId;
          }
        } else if (card.behavior?.routines && card.behavior.routines.length > 0) {
          const routineIndex = currentTimestamp.hour % card.behavior.routines.length;
          newActivity = card.behavior.routines[routineIndex];
        }

        if (
          card.worldState.currentActivity !== newActivity ||
          (newLocationId && card.worldState.locationId !== newLocationId)
        ) {
          activeEntityUpdates.push({
            entityId: card.id,
            name: card.name,
            previousActivity: card.worldState.currentActivity,
            newActivity,
            locationId: newLocationId || playerLocationId,
          });

          const mutableCard: EntityCard = {
            ...card,
            worldState: {
              ...card.worldState,
              currentActivity: newActivity,
              ...(newLocationId && newLocationId !== card.worldState.locationId
                ? {
                    locationId: newLocationId,
                    presence: newLocationId !== playerLocationId ? 'absent' : card.worldState.presence,
                  }
                : {}),
            },
            updatedAt: formatCanonicalTimestamp(currentTimestamp),
          };
          repository.saveEntityCard(storyId, mutableCard);

          commitRecords.push({
            kind: 'ENTITY_ACTIVITY_UPDATE',
            targetId: card.id,
            operation: 'UPDATE',
            provenance: 'LIVING_WORLD_ENGINE:SCHEDULE_WINDOW',
          });
        }
      }
    }

    // 4. Tick player condition engine for persistent effects
    if (player) {
      const conditionEngine = repository.getConditionEngine(storyId);
      conditionEngine.tickActor(player.actorId, 'WORLD_TIME', currentTimestamp.totalElapsedSeconds);
    }

    // 5. Evaluate scheduled world events in LivingWorldSimulation
    const eventResults = livingSim.evaluateScheduledEvents(currentTimestamp);
    for (const ev of eventResults.triggeredEvents) {
      commitRecords.push({
        kind: 'SCHEDULED_EVENT_TRIGGERED',
        targetId: ev.id,
        operation: 'UPDATE',
        provenance: `LIVING_WORLD_ENGINE:EVENT_${ev.kind}`,
      });
    }
    for (const ev of eventResults.missedEvents) {
      commitRecords.push({
        kind: 'SCHEDULED_EVENT_MISSED',
        targetId: ev.id,
        operation: 'UPDATE',
        provenance: 'LIVING_WORLD_ENGINE:EVENT_DEADLINE_PASSED',
      });
    }

    // 6. Ensure ambient population for current location
    WorldActivityDirector.ensureAmbientPopulation(repository, storyId, playerLocationId);

    // 7. Signal background work requirements for F21 queue
    const backgroundWorkNeeded = {
      storyId,
      snapshotWorldVersion: (repository as any).getWorldVersion ? (repository as any).getWorldVersion(storyId) : 1,
      baseStateHash: (repository as any).getCanonicalStateHash ? (repository as any).getCanonicalStateHash(storyId) : '',
      distantLocationIds: geography.getAllNodeIds().filter((id) => id !== playerLocationId),
    };

    return {
      success: true,
      elapsedSeconds,
      budgetCategory: budget.category,
      previousTimestamp,
      currentTimestamp,
      activeEntityUpdates,
      evictedEntityIds,
      commitRecords,
      backgroundWorkNeeded,
    };
  }
}
