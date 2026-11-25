import { EntityLifecycleStage } from './worldSimulationProposal';

export type { EntityLifecycleStage };

export interface TemporaryEntityMetadata {
  stage: EntityLifecycleStage;
  ttlTurns?: number;
  activeDependencies?: string[];
  interactionScope?: string;
  sourceProposalId?: string;
}

export interface TrackedLifecycleEntity {
  entityId: string;
  stage: EntityLifecycleStage;
  createdAtTurn: number;
  ttlTurns?: number;
  activeDependencies?: string[];
  locationId?: string;
  promotedAtTurn?: number;
  promotedReason?: string;
}

export interface LifecycleTransitionResult {
  success: boolean;
  stage: EntityLifecycleStage;
  errorReason?: string;
}

/**
 * 4-Stage Entity Lifecycle State Machine:
 * EPHEMERAL -> PROPOSED -> ACTIVE_TEMPORARY -> PERSISTENT
 *
 * Rules:
 * - EPHEMERAL can transition to PROPOSED or ACTIVE_TEMPORARY. Cannot jump directly to PERSISTENT.
 * - PROPOSED can transition to ACTIVE_TEMPORARY (accepted proposal) or EPHEMERAL (rejected proposal).
 * - ACTIVE_TEMPORARY can transition to PERSISTENT (promoted due to narrative significance/inventory) or EPHEMERAL (evicted when TTL reaches 0 and no active dependencies).
 * - PERSISTENT is a terminal canonical state; it has no valid forward or backward transitions in the simulation lifecycle.
 */
export class EntityLifecycleStateMachine {
  private static readonly VALID_TRANSITIONS: Record<EntityLifecycleStage, readonly EntityLifecycleStage[]> = {
    EPHEMERAL: ['PROPOSED', 'ACTIVE_TEMPORARY'],
    PROPOSED: ['ACTIVE_TEMPORARY', 'EPHEMERAL'],
    ACTIVE_TEMPORARY: ['PERSISTENT', 'EPHEMERAL'],
    PERSISTENT: [], // Terminal canonical state
  };

  /**
   * Evaluates whether a transition from one lifecycle stage to another is legal.
   */
  public static canTransition(from: EntityLifecycleStage, to: EntityLifecycleStage): boolean {
    const allowed = this.VALID_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  /**
   * Attempts to execute a lifecycle transition with optional contextual audit metadata.
   */
  public static transition(
    from: EntityLifecycleStage,
    to: EntityLifecycleStage,
    context?: { reason?: string; turnNumber?: number }
  ): LifecycleTransitionResult {
    if (!this.canTransition(from, to)) {
      return {
        success: false,
        stage: from,
        errorReason: `Invalid entity lifecycle transition from '${from}' to '${to}'.`,
      };
    }
    return {
      success: true,
      stage: to,
    };
  }

  /**
   * Determines if a temporary entity is protected from eviction by active dependencies.
   * While activeDependencies has 1 or more tokens (e.g. ['player_boarded', 'transit']), eviction is forbidden.
   */
  public static isProtectedFromEviction(entity: { activeDependencies?: string[] }): boolean {
    return Array.isArray(entity.activeDependencies) && entity.activeDependencies.length > 0;
  }

  /**
   * Determines if an ACTIVE_TEMPORARY entity should be evicted.
   * An entity is eligible for eviction if:
   * 1. It is not protected by active dependencies.
   * 2. AND either its ttlTurns <= 0 OR the player has departed its location.
   */
  public static shouldEvict(
    entity: {
      stage?: EntityLifecycleStage;
      ttlTurns?: number;
      activeDependencies?: string[];
      locationId?: string;
    },
    playerLocationId?: string
  ): boolean {
    if (entity.stage !== 'ACTIVE_TEMPORARY') return false;
    if (this.isProtectedFromEviction(entity)) return false;

    const ttl = typeof entity.ttlTurns === 'number' ? entity.ttlTurns : 0;
    if (ttl <= 0) return true;
    if (playerLocationId && entity.locationId && playerLocationId !== entity.locationId) {
      return true;
    }
    return false;
  }
}
