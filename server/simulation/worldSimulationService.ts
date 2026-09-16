import { WorldRepository } from '../repositories/worldRepository';
import {
  TravelJourney,
  TravelMode,
  JourneyStatus,
  InjuryRecord,
  TransformationRecord,
  DeathRecord,
  PossessionRecord,
} from '../domain/types';
import { PlayerLifecycleState } from '../domain/playerLifecycleState';
import { HistoricalEvidence } from '../domain/historicalEvidence';

export class WorldSimulationService {
  constructor(private worldRepo: WorldRepository) {}

  /**
   * Initiates a deterministic travel journey for the player.
   * DreamBook §307, §338, §339 & Decision 1.
   * Invariant: locationId remains originLocationId while travel is in progress.
   */
  public startPlayerTravel(
    storyId: string,
    destinationLocationId: string,
    mode: TravelMode = 'Foot'
  ): {
    success: boolean;
    message: string;
    journey?: TravelJourney;
  } {
    const player = this.worldRepo.getPlayerLifecycle(storyId);
    if (!player) {
      return { success: false, message: `No active player lifecycle found for story ${storyId}.` };
    }

    if (player.isTraveling) {
      return {
        success: false,
        message: `Player is already traveling to ${player.activeJourney?.destinationLocationId}.`,
      };
    }

    const geography = this.worldRepo.getGeographyGraph();
    const destNode = geography.getNode(destinationLocationId);
    if (!destNode) {
      return { success: false, message: `Destination ${destinationLocationId} does not exist.` };
    }

    if (!destNode.discovered) {
      return { success: false, message: `Destination ${destNode.name} is uncharted and undiscovered.` };
    }

    if (!destNode.accessible) {
      return { success: false, message: `Destination ${destNode.name} is currently inaccessible.` };
    }

    const pathResult = geography.findPath(player.locationId, destinationLocationId, mode);
    if (!pathResult.found) {
      return {
        success: false,
        message: `No traversable route found between ${player.locationId} and ${destNode.name}.`,
      };
    }

    const clock = this.worldRepo.getWorldClock(storyId);
    const departureTime = clock.getTimestamp();

    // Clone clock to compute estimated arrival timestamp
    const arrivalClock = new (clock.constructor as any)({ timestamp: departureTime });
    arrivalClock.advanceSeconds(pathResult.estimatedDurationSeconds);
    const estimatedArrivalTime = arrivalClock.getTimestamp();

    const journey: TravelJourney = {
      id: `journey_${Date.now()}`,
      actorId: player.actorId,
      originLocationId: player.locationId,
      destinationLocationId,
      routeLocationIds: pathResult.routeLocationIds,
      currentWaypointIndex: 0,
      totalDistanceKm: pathResult.totalDistanceKm,
      traveledDistanceKm: 0,
      speedKmPerHour: pathResult.totalDistanceKm / (pathResult.estimatedDurationSeconds / 3600 || 1),
      departureTime,
      estimatedArrivalTime,
      status: 'in_progress',
    };

    // Commit to canonical PlayerLifecycleState
    // Crucial invariant: locationId remains originLocationId!
    const updatedPlayer = player.copyWith({
      activeJourney: journey,
      currentActivity: 'traveling',
      lastUpdatedTime: departureTime.totalElapsedSeconds,
    });
    this.worldRepo.updatePlayerLifecycle(storyId, updatedPlayer);

    return {
      success: true,
      message: `Travel journey initiated toward ${destNode.name}. Distance: ${pathResult.totalDistanceKm.toFixed(1)} km.`,
      journey,
    };
  }

  /**
   * Advances the world clock and resolves pending movements or scheduled events.
   * Completes travel journeys when elapsed time >= estimated arrival time.
   */
  public advanceTime(
    storyId: string,
    secondsToAdvance: number
  ): {
    newTimestamp: ReturnType<InstanceType<typeof import('../domain/worldClock').WorldClock>['getTimestamp']>;
    completedArrivals: string[];
    livingWorldSummary?: import('../domain/livingWorldSimulation').LivingWorldSimulationSummary;
  } {
    const clock = this.worldRepo.getWorldClock(storyId);
    const updatedClockState = clock.advanceSeconds(secondsToAdvance);
    const currentElapsed = updatedClockState.timestamp.totalElapsedSeconds;
    const completedArrivals: string[] = [];

    const player = this.worldRepo.getPlayerLifecycle(storyId);
    if (player && player.isTraveling && player.activeJourney) {
      const journey = player.activeJourney;

      if (currentElapsed >= journey.estimatedArrivalTime.totalElapsedSeconds) {
        // Journey completed!
        // Invariant 7: Destination replaces locationId ONLY when JourneyStatus.completed.
        const completedJourney: TravelJourney = {
          ...journey,
          traveledDistanceKm: journey.totalDistanceKm,
          status: 'completed',
        };

        const arrivedPlayer = player.copyWith({
          locationId: journey.destinationLocationId, // Arrived at destination!
          clearActiveJourney: true,
          currentActivity: 'idle',
          lastUpdatedTime: currentElapsed,
        });

        this.worldRepo.updatePlayerLifecycle(storyId, arrivedPlayer);
        this.worldRepo.getGeographyGraph().setDiscovered(journey.destinationLocationId, true);
        completedArrivals.push(journey.destinationLocationId);

        // Record historical evidence for completed territorial transit
        const destNode = this.worldRepo.getGeographyGraph().getNode(journey.destinationLocationId);
        const chronicleEngine = this.worldRepo.getHistoricalChronicleEngine(storyId);
        chronicleEngine.recordEvidence({
          id: `ev_travel_${journey.id}_completed`,
          category: 'TERRITORIAL_TRANSIT',
          timestamp: updatedClockState.timestamp,
          primarySubjectId: arrivedPlayer.actorId,
          locationId: journey.destinationLocationId,
          summary: `${arrivedPlayer.name} completed journey to ${destNode ? destNode.name : journey.destinationLocationId}.`,
          details: `Traveled ${journey.totalDistanceKm.toFixed(1)} km from ${journey.originLocationId} to ${journey.destinationLocationId}.`,
          sourceEventId: journey.id,
          provenance: 'direct_observation',
          visibility: 'PUBLIC',
          metadata: { subjectName: arrivedPlayer.name, forcedSignificance: 'NOTABLE', significanceReason: 'Completed territorial travel across regions.' },
        });
      } else {
        // Still in progress
        const totalDuration =
          journey.estimatedArrivalTime.totalElapsedSeconds - journey.departureTime.totalElapsedSeconds;
        const elapsedSinceDeparture = currentElapsed - journey.departureTime.totalElapsedSeconds;
        const progressFraction = Math.min(1.0, Math.max(0.0, elapsedSinceDeparture / (totalDuration || 1)));

        const updatedJourney: TravelJourney = {
          ...journey,
          traveledDistanceKm: journey.totalDistanceKm * progressFraction,
          status: 'in_progress',
        };

        const updatedPlayer = player.copyWith({
          activeJourney: updatedJourney,
          lastUpdatedTime: currentElapsed,
        });
        this.worldRepo.updatePlayerLifecycle(storyId, updatedPlayer);
      }
    }

    // Authoritatively advance canonical living world simulation (DEF-CH10-03)
    const livingSim = this.worldRepo.getLivingWorldSimulation(storyId);
    const geography = this.worldRepo.getGeographyGraph();
    const playerLoc = this.worldRepo.getPlayerLifecycle(storyId)?.locationId || 'loc_whispering_orrery';

    const livingSummary = livingSim.advanceSimulation({
      elapsedSeconds: secondsToAdvance,
      currentClock: updatedClockState.timestamp,
      playerLocationId: playerLoc,
      geography,
    });

    // CH4 Historical Chronicle integration: record evidence for triggered world events
    const chronicleEngine = this.worldRepo.getHistoricalChronicleEngine(storyId);
    for (const ev of livingSummary.triggeredEvents) {
      chronicleEngine.recordEvidence({
        id: `ev_world_${ev.id}_${updatedClockState.timestamp.totalElapsedSeconds}`,
        category: 'WORLD_ANOMALY',
        timestamp: updatedClockState.timestamp,
        primarySubjectId: ev.id,
        locationId: ev.locationId,
        summary: `World Event triggered: ${ev.name}`,
        details: ev.consequenceSummary || `Scheduled world event ${ev.name} triggered.`,
        sourceEventId: ev.id,
        provenance: 'system_grant',
        visibility: 'PUBLIC',
        metadata: { eventKind: ev.kind, status: ev.status, forcedSignificance: 'NOTABLE' },
      });
    }

    for (const ev of livingSummary.missedEvents) {
      chronicleEngine.recordEvidence({
        id: `ev_world_missed_${ev.id}_${updatedClockState.timestamp.totalElapsedSeconds}`,
        category: 'WORLD_ANOMALY',
        timestamp: updatedClockState.timestamp,
        primarySubjectId: ev.id,
        locationId: ev.locationId,
        summary: `World Event missed: ${ev.name}`,
        details: ev.consequenceSummary || `Scheduled world event ${ev.name} deadline passed.`,
        sourceEventId: ev.id,
        provenance: 'system_grant',
        visibility: 'PUBLIC',
        metadata: { eventKind: ev.kind, status: ev.status },
      });
    }

    return {
      newTimestamp: updatedClockState.timestamp,
      completedArrivals,
      livingWorldSummary: livingSummary,
    };
  }

  /**
   * Cancels player travel, anchoring back at origin location.
   */
  public cancelPlayerTravel(storyId: string): boolean {
    const player = this.worldRepo.getPlayerLifecycle(storyId);
    if (!player || !player.isTraveling || !player.activeJourney) {
      return false;
    }

    const updatedPlayer = player.copyWith({
      clearActiveJourney: true,
      currentActivity: 'idle',
      lastUpdatedTime: this.worldRepo.getWorldClock(storyId).getTimestamp().totalElapsedSeconds,
    });
    this.worldRepo.updatePlayerLifecycle(storyId, updatedPlayer);
    return true;
  }

  /**
   * Sets the canonical player activity state.
   */
  public setPlayerActivity(storyId: string, activity: string): PlayerLifecycleState | null {
    const player = this.worldRepo.getPlayerLifecycle(storyId);
    if (!player) return null;
    const clock = this.worldRepo.getWorldClock(storyId);
    const updated = player.copyWith({
      currentActivity: activity,
      lastUpdatedTime: clock.getTimestamp().totalElapsedSeconds,
    });
    this.worldRepo.updatePlayerLifecycle(storyId, updated);
    return updated;
  }

  /**
   * Commits a deterministic injury record to canonical player lifecycle.
   */
  public applyPlayerInjury(
    storyId: string,
    injuryData: {
      id?: string;
      type: string;
      severity: 'Minor' | 'Moderate' | 'Severe' | 'Critical';
      location: string;
      description: string;
    }
  ): { success: boolean; injury?: InjuryRecord; player?: PlayerLifecycleState; message: string } {
    const player = this.worldRepo.getPlayerLifecycle(storyId);
    if (!player) {
      return { success: false, message: `Player lifecycle not found for story ${storyId}.` };
    }
    const clock = this.worldRepo.getWorldClock(storyId);
    const timestamp = clock.getTimestamp();
    const injury: InjuryRecord = {
      id: injuryData.id || `inj_${Date.now()}`,
      type: injuryData.type,
      severity: injuryData.severity,
      location: injuryData.location,
      description: injuryData.description,
      acquiredAtTimestamp: timestamp,
      healed: false,
    };
    const updatedPlayer = player.copyWith({
      injuries: [...player.injuries, injury],
      lastUpdatedTime: timestamp.totalElapsedSeconds,
    });
    this.worldRepo.updatePlayerLifecycle(storyId, updatedPlayer);

    // Record historical evidence
    const chronicleEngine = this.worldRepo.getHistoricalChronicleEngine(storyId);
    chronicleEngine.recordEvidence({
      id: `ev_inj_${injury.id}`,
      category: 'INJURY_OR_RECOVERY',
      timestamp,
      primarySubjectId: updatedPlayer.actorId,
      locationId: updatedPlayer.locationId,
      summary: `${updatedPlayer.name} suffered a ${injury.severity.toLowerCase()} ${injury.type.toLowerCase()} injury (${injury.location}).`,
      details: injury.description,
      sourceEventId: injury.id,
      provenance: 'witnessed_event',
      visibility: 'PUBLIC',
      metadata: { subjectName: updatedPlayer.name },
    });

    return {
      success: true,
      injury,
      player: updatedPlayer,
      message: `Applied ${injury.severity} ${injury.type} injury at ${injury.location}.`,
    };
  }

  /**
   * Heals an injury record on the canonical player lifecycle.
   */
  public healPlayerInjury(
    storyId: string,
    injuryId: string
  ): { success: boolean; player?: PlayerLifecycleState; message: string } {
    const player = this.worldRepo.getPlayerLifecycle(storyId);
    if (!player) {
      return { success: false, message: `Player lifecycle not found for story ${storyId}.` };
    }
    const clock = this.worldRepo.getWorldClock(storyId);
    const timestamp = clock.getTimestamp();
    const remainingInjuries = player.injuries.filter((i: InjuryRecord) => i.id !== injuryId);
    if (remainingInjuries.length === player.injuries.length) {
      return { success: false, message: `Injury ${injuryId} not found on player.` };
    }
    const updatedPlayer = player.copyWith({
      injuries: remainingInjuries,
      lastUpdatedTime: timestamp.totalElapsedSeconds,
    });
    this.worldRepo.updatePlayerLifecycle(storyId, updatedPlayer);

    // Record historical evidence
    const chronicleEngine = this.worldRepo.getHistoricalChronicleEngine(storyId);
    chronicleEngine.recordEvidence({
      id: `ev_heal_${injuryId}_${timestamp.totalElapsedSeconds}`,
      category: 'INJURY_OR_RECOVERY',
      timestamp,
      primarySubjectId: updatedPlayer.actorId,
      locationId: updatedPlayer.locationId,
      summary: `${updatedPlayer.name} recovered from injury (${injuryId}).`,
      details: `Injury successfully healed and cleansed.`,
      sourceEventId: injuryId,
      provenance: 'witnessed_event',
      visibility: 'PUBLIC',
      metadata: { subjectName: updatedPlayer.name },
    });

    return {
      success: true,
      player: updatedPlayer,
      message: `Healed injury ${injuryId}.`,
    };
  }

  /**
   * Commits a transformation record to canonical player lifecycle.
   */
  public applyPlayerTransformation(
    storyId: string,
    transformData: {
      id?: string;
      formName: string;
      vesselType: string;
      expiresAtTimestamp?: ReturnType<InstanceType<typeof import('../domain/worldClock').WorldClock>['getTimestamp']> | null;
    }
  ): { success: boolean; record?: TransformationRecord; player?: PlayerLifecycleState; message: string } {
    const player = this.worldRepo.getPlayerLifecycle(storyId);
    if (!player) {
      return { success: false, message: `Player lifecycle not found for story ${storyId}.` };
    }
    const clock = this.worldRepo.getWorldClock(storyId);
    const timestamp = clock.getTimestamp();
    const record: TransformationRecord = {
      id: transformData.id || `trans_${Date.now()}`,
      formName: transformData.formName,
      vesselType: transformData.vesselType,
      active: true,
      beganAtTimestamp: timestamp,
      expiresAtTimestamp: transformData.expiresAtTimestamp || null,
    };
    const updatedPlayer = player.copyWith({
      transformationRecord: record,
      lastUpdatedTime: timestamp.totalElapsedSeconds,
    });
    this.worldRepo.updatePlayerLifecycle(storyId, updatedPlayer);

    // Record historical evidence
    const chronicleEngine = this.worldRepo.getHistoricalChronicleEngine(storyId);
    chronicleEngine.recordEvidence({
      id: `ev_trans_${record.id}`,
      category: 'LIFECYCLE_TRANSITION',
      timestamp,
      primarySubjectId: updatedPlayer.actorId,
      locationId: updatedPlayer.locationId,
      summary: `${updatedPlayer.name} underwent transformation into ${record.formName} (${record.vesselType}).`,
      details: `Vessel shifted to form: ${record.formName}.`,
      sourceEventId: record.id,
      provenance: 'direct_observation',
      visibility: 'PUBLIC',
      metadata: { subjectName: updatedPlayer.name },
    });

    return {
      success: true,
      record,
      player: updatedPlayer,
      message: `Player transformed into ${record.formName}.`,
    };
  }

  /**
   * Reverts active transformation on canonical player lifecycle.
   */
  public revertPlayerTransformation(
    storyId: string
  ): { success: boolean; player?: PlayerLifecycleState; message: string } {
    const player = this.worldRepo.getPlayerLifecycle(storyId);
    if (!player) {
      return { success: false, message: `Player lifecycle not found for story ${storyId}.` };
    }
    const clock = this.worldRepo.getWorldClock(storyId);
    const timestamp = clock.getTimestamp();
    const updatedPlayer = player.copyWith({
      transformationRecord: null,
      lastUpdatedTime: timestamp.totalElapsedSeconds,
    });
    this.worldRepo.updatePlayerLifecycle(storyId, updatedPlayer);

    // Record historical evidence
    const chronicleEngine = this.worldRepo.getHistoricalChronicleEngine(storyId);
    chronicleEngine.recordEvidence({
      id: `ev_revert_trans_${updatedPlayer.actorId}_${timestamp.totalElapsedSeconds}`,
      category: 'LIFECYCLE_TRANSITION',
      timestamp,
      primarySubjectId: updatedPlayer.actorId,
      locationId: updatedPlayer.locationId,
      summary: `${updatedPlayer.name} reverted from transformation to natural form.`,
      details: `Active transformation dispelled.`,
      sourceEventId: `revert_trans_${timestamp.totalElapsedSeconds}`,
      provenance: 'direct_observation',
      visibility: 'PUBLIC',
      metadata: { subjectName: updatedPlayer.name },
    });

    return {
      success: true,
      player: updatedPlayer,
      message: 'Player reverted to natural form.',
    };
  }

  /**
   * Commits a death record to canonical player lifecycle.
   */
  public recordPlayerDeath(
    storyId: string,
    cause: string,
    revivalPossible: boolean = false
  ): { success: boolean; deathRecord?: DeathRecord; player?: PlayerLifecycleState; message: string } {
    const player = this.worldRepo.getPlayerLifecycle(storyId);
    if (!player) {
      return { success: false, message: `Player lifecycle not found for story ${storyId}.` };
    }
    const clock = this.worldRepo.getWorldClock(storyId);
    const timestamp = clock.getTimestamp();
    const deathRecord: DeathRecord = {
      isDead: true,
      diedAtTimestamp: timestamp,
      cause,
      revivalPossible,
    };
    const updatedPlayer = player.copyWith({
      deathRecord,
      currentActivity: 'deceased',
      lastUpdatedTime: timestamp.totalElapsedSeconds,
    });
    this.worldRepo.updatePlayerLifecycle(storyId, updatedPlayer);

    // Record historical evidence
    const chronicleEngine = this.worldRepo.getHistoricalChronicleEngine(storyId);
    chronicleEngine.recordEvidence({
      id: `ev_death_${updatedPlayer.actorId}_${timestamp.totalElapsedSeconds}`,
      category: 'LIFECYCLE_TRANSITION',
      timestamp,
      primarySubjectId: updatedPlayer.actorId,
      locationId: updatedPlayer.locationId,
      summary: `${updatedPlayer.name} was slain: ${cause}`,
      details: `Lethal cessation recorded at ${updatedPlayer.locationId}. Cause: ${cause}.`,
      sourceEventId: `death_${timestamp.totalElapsedSeconds}`,
      provenance: 'witnessed_event',
      visibility: 'PUBLIC',
      metadata: { subjectName: updatedPlayer.name },
    });

    return {
      success: true,
      deathRecord,
      player: updatedPlayer,
      message: `Player death recorded: ${cause}.`,
    };
  }

  /**
   * Revives player, clearing death record on canonical player lifecycle.
   */
  public revivePlayer(
    storyId: string
  ): { success: boolean; player?: PlayerLifecycleState; message: string } {
    const player = this.worldRepo.getPlayerLifecycle(storyId);
    if (!player) {
      return { success: false, message: `Player lifecycle not found for story ${storyId}.` };
    }
    if (!player.isDead) {
      return { success: false, message: 'Player is not dead.' };
    }
    const clock = this.worldRepo.getWorldClock(storyId);
    const timestamp = clock.getTimestamp();
    const updatedPlayer = player.copyWith({
      deathRecord: null,
      currentActivity: 'idle',
      lastUpdatedTime: timestamp.totalElapsedSeconds,
    });
    this.worldRepo.updatePlayerLifecycle(storyId, updatedPlayer);

    // Record historical evidence
    const chronicleEngine = this.worldRepo.getHistoricalChronicleEngine(storyId);
    chronicleEngine.recordEvidence({
      id: `ev_revive_${updatedPlayer.actorId}_${timestamp.totalElapsedSeconds}`,
      category: 'LIFECYCLE_TRANSITION',
      timestamp,
      primarySubjectId: updatedPlayer.actorId,
      locationId: updatedPlayer.locationId,
      summary: `${updatedPlayer.name} was restored to life from death.`,
      details: `Vital spark rekindled and animated.`,
      sourceEventId: `revive_${timestamp.totalElapsedSeconds}`,
      provenance: 'witnessed_event',
      visibility: 'PUBLIC',
      metadata: { subjectName: updatedPlayer.name },
    });

    return {
      success: true,
      player: updatedPlayer,
      message: 'Player revived.',
    };
  }

  /**
   * Commits a possession record to canonical player lifecycle.
   */
  public recordPlayerPossession(
    storyId: string,
    entityName: string
  ): { success: boolean; possessionRecord?: PossessionRecord; player?: PlayerLifecycleState; message: string } {
    const player = this.worldRepo.getPlayerLifecycle(storyId);
    if (!player) {
      return { success: false, message: `Player lifecycle not found for story ${storyId}.` };
    }
    const clock = this.worldRepo.getWorldClock(storyId);
    const timestamp = clock.getTimestamp();
    const possessionRecord: PossessionRecord = {
      isPossessed: true,
      entityName,
      beganAtTimestamp: timestamp,
    };
    const updatedPlayer = player.copyWith({
      possessionRecord,
      lastUpdatedTime: timestamp.totalElapsedSeconds,
    });
    this.worldRepo.updatePlayerLifecycle(storyId, updatedPlayer);

    // Record historical evidence
    const chronicleEngine = this.worldRepo.getHistoricalChronicleEngine(storyId);
    chronicleEngine.recordEvidence({
      id: `ev_possession_${updatedPlayer.actorId}_${timestamp.totalElapsedSeconds}`,
      category: 'LIFECYCLE_TRANSITION',
      timestamp,
      primarySubjectId: updatedPlayer.actorId,
      locationId: updatedPlayer.locationId,
      summary: `${updatedPlayer.name} fell under possession by ${entityName}.`,
      details: `Vessel entity control superseded by ${entityName}.`,
      sourceEventId: `poss_${timestamp.totalElapsedSeconds}`,
      provenance: 'witnessed_event',
      visibility: 'PUBLIC',
      metadata: { subjectName: updatedPlayer.name },
    });

    return {
      success: true,
      possessionRecord,
      player: updatedPlayer,
      message: `Player possessed by ${entityName}.`,
    };
  }

  /**
   * Releases active possession on canonical player lifecycle.
   */
  public releasePlayerPossession(
    storyId: string
  ): { success: boolean; player?: PlayerLifecycleState; message: string } {
    const player = this.worldRepo.getPlayerLifecycle(storyId);
    if (!player) {
      return { success: false, message: `Player lifecycle not found for story ${storyId}.` };
    }
    const clock = this.worldRepo.getWorldClock(storyId);
    const timestamp = clock.getTimestamp();
    const updatedPlayer = player.copyWith({
      possessionRecord: null,
      lastUpdatedTime: timestamp.totalElapsedSeconds,
    });
    this.worldRepo.updatePlayerLifecycle(storyId, updatedPlayer);

    // Record historical evidence
    const chronicleEngine = this.worldRepo.getHistoricalChronicleEngine(storyId);
    chronicleEngine.recordEvidence({
      id: `ev_rel_poss_${updatedPlayer.actorId}_${timestamp.totalElapsedSeconds}`,
      category: 'LIFECYCLE_TRANSITION',
      timestamp,
      primarySubjectId: updatedPlayer.actorId,
      locationId: updatedPlayer.locationId,
      summary: `${updatedPlayer.name} was released from entity possession.`,
      details: `Autonomous will restored.`,
      sourceEventId: `rel_poss_${timestamp.totalElapsedSeconds}`,
      provenance: 'witnessed_event',
      visibility: 'PUBLIC',
      metadata: { subjectName: updatedPlayer.name },
    });

    return {
      success: true,
      player: updatedPlayer,
      message: 'Player possession released.',
    };
  }
}

import { worldRepository } from '../repositories/worldRepository';
export const worldSimulationService = new WorldSimulationService(worldRepository);
