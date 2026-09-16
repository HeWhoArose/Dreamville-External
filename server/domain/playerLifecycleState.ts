import {
  IActorLifecycle,
  TravelJourney,
  InjuryRecord,
  TransformationRecord,
  DeathRecord,
  PossessionRecord,
} from './types';

/**
 * PlayerLifecycleState
 * Canonical Player Actor Lifecycle model implementing IActorLifecycle.
 * Satisfies Decision 1 & DreamBook v10.8.
 *
 * Invariants:
 * - Immutable value semantics with copyWith.
 * - locationId is canonical and anchored to originLocationId during travel.
 * - locationId updates to destination ONLY when journey completes.
 * - No NPC-specific AI systems (schedules, goal sets, autonomous routines).
 */
export class PlayerLifecycleState implements IActorLifecycle {
  public readonly actorId: string;
  public readonly name: string;
  public readonly locationId: string;
  public readonly lastUpdatedTime: number;
  public readonly currentActivity: string;
  public readonly activeJourney: TravelJourney | null;

  public readonly injuries: ReadonlyArray<InjuryRecord>;
  public readonly transformationRecord: TransformationRecord | null;
  public readonly deathRecord: DeathRecord | null;
  public readonly possessionRecord: PossessionRecord | null;
  public readonly lineage: string | null;

  constructor(params: {
    actorId: string;
    name: string;
    locationId: string;
    lastUpdatedTime: number;
    currentActivity?: string;
    activeJourney?: TravelJourney | null;
    injuries?: InjuryRecord[];
    transformationRecord?: TransformationRecord | null;
    deathRecord?: DeathRecord | null;
    possessionRecord?: PossessionRecord | null;
    lineage?: string | null;
  }) {
    this.actorId = params.actorId;
    this.name = params.name;
    this.locationId = params.locationId;
    this.lastUpdatedTime = params.lastUpdatedTime;
    this.currentActivity = params.currentActivity ?? (params.activeJourney ? 'traveling' : 'idle');
    this.activeJourney = params.activeJourney ? { ...params.activeJourney } : null;
    this.injuries = Object.freeze(params.injuries ? params.injuries.map((i) => ({ ...i })) : []);
    this.transformationRecord = params.transformationRecord
      ? { ...params.transformationRecord }
      : null;
    this.deathRecord = params.deathRecord ? { ...params.deathRecord } : null;
    this.possessionRecord = params.possessionRecord ? { ...params.possessionRecord } : null;
    this.lineage = params.lineage ?? null;

    Object.freeze(this);
  }

  public get isTraveling(): boolean {
    return this.activeJourney !== null && this.activeJourney.status === 'in_progress';
  }

  public get isDead(): boolean {
    return this.deathRecord !== null && this.deathRecord.isDead;
  }

  public get isTransformed(): boolean {
    return this.transformationRecord !== null && this.transformationRecord.active;
  }

  public get isPossessed(): boolean {
    return this.possessionRecord !== null && this.possessionRecord.isPossessed;
  }

  public copyWith(updates: {
    actorId?: string;
    name?: string;
    locationId?: string;
    lastUpdatedTime?: number;
    currentActivity?: string;
    activeJourney?: TravelJourney | null;
    clearActiveJourney?: boolean;
    injuries?: InjuryRecord[];
    transformationRecord?: TransformationRecord | null;
    deathRecord?: DeathRecord | null;
    possessionRecord?: PossessionRecord | null;
    lineage?: string | null;
  }): PlayerLifecycleState {
    return new PlayerLifecycleState({
      actorId: updates.actorId ?? this.actorId,
      name: updates.name ?? this.name,
      locationId: updates.locationId ?? this.locationId,
      lastUpdatedTime: updates.lastUpdatedTime ?? this.lastUpdatedTime,
      currentActivity: updates.currentActivity ?? this.currentActivity,
      activeJourney: updates.clearActiveJourney
        ? null
        : updates.activeJourney !== undefined
        ? updates.activeJourney
        : this.activeJourney,
      injuries: updates.injuries ?? [...this.injuries],
      transformationRecord:
        updates.transformationRecord !== undefined
          ? updates.transformationRecord
          : this.transformationRecord,
      deathRecord: updates.deathRecord !== undefined ? updates.deathRecord : this.deathRecord,
      possessionRecord:
        updates.possessionRecord !== undefined ? updates.possessionRecord : this.possessionRecord,
      lineage: updates.lineage !== undefined ? updates.lineage : this.lineage,
    });
  }

  public toJSON(): Record<string, unknown> {
    return {
      actorId: this.actorId,
      name: this.name,
      locationId: this.locationId,
      lastUpdatedTime: this.lastUpdatedTime,
      currentActivity: this.currentActivity,
      activeJourney: this.activeJourney,
      isTraveling: this.isTraveling,
      isDead: this.isDead,
      isTransformed: this.isTransformed,
      isPossessed: this.isPossessed,
      injuries: this.injuries,
      transformationRecord: this.transformationRecord,
      deathRecord: this.deathRecord,
      possessionRecord: this.possessionRecord,
      lineage: this.lineage,
    };
  }

  public static fromJSON(data: Record<string, any>): PlayerLifecycleState {
    return new PlayerLifecycleState({
      actorId: data.actorId,
      name: data.name,
      locationId: data.locationId,
      lastUpdatedTime: data.lastUpdatedTime,
      currentActivity: data.currentActivity,
      activeJourney: data.activeJourney,
      injuries: data.injuries,
      transformationRecord: data.transformationRecord,
      deathRecord: data.deathRecord,
      possessionRecord: data.possessionRecord,
      lineage: data.lineage,
    });
  }

  public equals(other: PlayerLifecycleState): boolean {
    if (!other) return false;
    return JSON.stringify(this.toJSON()) === JSON.stringify(other.toJSON());
  }
}
