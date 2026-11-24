import { WorldRepository } from '../repositories/worldRepository';
import { LocationSceneObject } from './types';
import { AffordancePlausibilityEngine } from './affordancePlausibilityEngine';
import {
  WorldSimulationProposal,
  WorldSimulatorAdjudicator,
  EntityLifecycleStage,
} from './worldSimulationProposal';
import { EntityLifecycleStateMachine } from './entityLifecycle';
import { deterministicId } from './deterministicRng';
import { worldSimulationService } from '../simulation/worldSimulationService';

export interface VehicleInteractionResult {
  success: boolean;
  errorCode?: string;
  message: string;
  vehicle?: LocationSceneObject;
  proposal?: WorldSimulationProposal;
  stage?: EntityLifecycleStage;
  journey?: unknown;
}

const STREET_ARCHETYPES = new Set([
  'URBAN_DISTRICT',
  'RESIDENTIAL_STREET',
  'MARKET',
  'STREET',
  'AVENUE',
  'BOULEVARD',
  'DOCKS',
  'HARBOR',
]);

const NON_STREET_ARCHETYPES = new Set([
  'WORKPLACE',
  'OFFICE',
  'ROOM',
  'SEWER',
  'ROOFTOP',
  'DUNGEON',
  'BASEMENT',
  'CAVE',
  'VAULT',
  'CORRIDOR',
]);

/**
 * VehicleInteractionAuthority
 * Governs dynamic street vehicle interactions: hailing, boarding, transit, and eviction.
 * Enforces:
 * 1. Street affordance gating (CANNOT_HAIL_VEHICLE_WITHOUT_STREET_ACCESS).
 * 2. 4-Stage lifecycle progression (EPHEMERAL -> PROPOSED -> ACTIVE_TEMPORARY).
 * 3. Boarding gate before transit (NO_VEHICLE_PRESENT, NOT_IN_VEHICLE).
 * 4. Invariant 6 preservation during vehicle travel.
 * 5. Automatic eviction of temporary vehicles upon journey completion to prevent store pollution.
 */
export class VehicleInteractionAuthority {
  /**
   * Evaluates if a given location has valid street access for vehicle traffic.
   */
  public static isStreetLocation(
    repository: WorldRepository,
    storyId: string,
    locationId: string
  ): boolean {
    const graph = repository.getGeographyGraph(storyId);
    const node = graph.getNode(locationId);
    if (!node) return false;

    const anyNode = node as any;
    // Direct check of terrain if present on node or properties
    if (anyNode.terrain === 'Road' || anyNode.properties?.terrain === 'Road') return true;

    // Check archetype from node or properties
    const rawArchetype =
      anyNode.archetype ||
      anyNode.properties?.archetype ||
      anyNode.properties?.locationType ||
      anyNode.name;

    const normalized = (typeof rawArchetype === 'string' ? rawArchetype : '').toUpperCase().trim();

    if (NON_STREET_ARCHETYPES.has(normalized)) return false;
    if (STREET_ARCHETYPES.has(normalized)) return true;

    // Check tags
    if (Array.isArray(node.tags)) {
      if (node.tags.some((t) => STREET_ARCHETYPES.has(t.toUpperCase()))) return true;
      if (node.tags.some((t) => NON_STREET_ARCHETYPES.has(t.toUpperCase()))) return false;
    }

    // Check connected edges for Road terrain
    const edges = graph.getAllEdges().filter((e) => e.fromLocationId === locationId || e.toLocationId === locationId);
    if (edges.some((e) => e.terrain === 'Road')) return true;

    // Fall back to AffordancePlausibilityEngine
    return AffordancePlausibilityEngine.isPlausibleAffordance('taxi', normalized || node.name);
  }

  /**
   * Hails a dynamic vehicle at the specified location.
   */
  public static hailVehicle(params: {
    repository: WorldRepository;
    storyId: string;
    locationId: string;
    vehicleType?: string;
  }): VehicleInteractionResult {
    const { repository, storyId, locationId, vehicleType = 'taxi' } = params;

    // 1. Street affordance validation
    if (!this.isStreetLocation(repository, storyId, locationId)) {
      return {
        success: false,
        errorCode: 'CANNOT_HAIL_VEHICLE_WITHOUT_STREET_ACCESS',
        message: 'Cannot hail a vehicle without street access.',
      };
    }

    const graph = repository.getGeographyGraph(storyId);
    const node = graph.getNode(locationId);
    if (!node) {
      return {
        success: false,
        errorCode: 'LOCATION_NOT_FOUND',
        message: `Location '${locationId}' does not exist in geography.`,
      };
    }

    // 2. Check if an active temporary vehicle is already waiting at kerb
    const existingVehicle = (node.sceneObjects || []).find(
      (obj) =>
        (obj.tags?.includes('vehicle') || obj.tags?.includes('taxi')) &&
        obj.properties?.vehicleState === 'STOPPED_AT_KERB'
    );
    if (existingVehicle) {
      return {
        success: true,
        message: `A ${existingVehicle.name} is already waiting at the kerb.`,
        vehicle: existingVehicle,
        stage: existingVehicle.lifecycleStage || 'ACTIVE_TEMPORARY',
      };
    }

    // 3. Create WorldSimulationProposal (PROPOSED stage)
    const vehicleId = deterministicId('vehicle', storyId, locationId, vehicleType);
    const proposal: WorldSimulationProposal = {
      proposalId: deterministicId('prop_hail', storyId, locationId, Date.now()),
      idempotencyKey: `hail_${storyId}_${locationId}_${vehicleType}`,
      worldVersion: 1,
      baseStateHash: WorldSimulatorAdjudicator.calculateStateHash({ streetAccess: true }),
      entityType: 'PROPOSED',
      proposedStateTransition: {
        type: 'SPAWN_TEMPORARY_VEHICLE',
        targetId: vehicleId,
        payload: {
          vehicleType,
          status: 'STOPPED_AT_KERB',
          capacity: 4,
          driver: 'Cab Driver',
        },
      },
      requiredPreconditions: [
        {
          predicate: 'streetAccess',
          expected: true,
        },
      ],
      provenance: {
        source: 'DETERMINISTIC_ARCHETYPE',
        timestamp: new Date().toISOString(),
      },
      safeFallback: {
        message: 'No vehicles are currently available on this street.',
      },
    };

    // 4. Deterministic CAS Adjudication
    const currentWorldState = {
      worldVersion: 1,
      state: { streetAccess: true },
      stateHash: WorldSimulatorAdjudicator.calculateStateHash({ streetAccess: true }),
    };

    const adjudication = WorldSimulatorAdjudicator.adjudicate(currentWorldState, proposal);
    if (!adjudication.accepted) {
      return {
        success: false,
        errorCode: adjudication.code,
        message: adjudication.message,
      };
    }

    // 5. Transition PROPOSED -> ACTIVE_TEMPORARY
    const transitionCheck = EntityLifecycleStateMachine.transition('PROPOSED', 'ACTIVE_TEMPORARY', {
      reason: 'Vehicle proposal accepted and committed to street scene',
    });

    if (!transitionCheck.success) {
      return {
        success: false,
        errorCode: 'LIFECYCLE_TRANSITION_FAILED',
        message: transitionCheck.errorReason || 'Failed to transition vehicle to ACTIVE_TEMPORARY.',
      };
    }

    // 6. Materialize ACTIVE_TEMPORARY LocationSceneObject in GeographyGraph
    const vehicleName = vehicleType === 'taxi' ? 'Yellow Cab' : 'Vehicle';
    const temporaryVehicle: LocationSceneObject = {
      id: vehicleId,
      name: vehicleName,
      kind: 'STRUCTURE',
      description: 'A licensed yellow city cab waiting at the kerb with its engine running.',
      visible: true,
      interactable: true,
      tags: ['vehicle', 'taxi', 'boardable', 'temporary'],
      properties: {
        vehicleType,
        vehicleState: 'STOPPED_AT_KERB',
        capacity: 4,
        occupants: [],
        lifecycle: 'ACTIVE_TEMPORARY',
        isVehicle: true,
        boardable: true,
        activeDependencies: [],
        ttlTurns: 3,
      },
      provenance: 'VEHICLE_INTERACTION_AUTHORITY',
      lifecycleStage: 'ACTIVE_TEMPORARY',
      ttlTurns: 3,
      activeDependencies: [],
    };

    graph.addSceneObject(locationId, temporaryVehicle);

    return {
      success: true,
      message: `A ${vehicleName} pulls up to the kerb and idles, waiting for passengers.`,
      vehicle: temporaryVehicle,
      proposal,
      stage: 'ACTIVE_TEMPORARY',
    };
  }

  /**
   * Boards a vehicle waiting at the player's current location.
   */
  public static boardVehicle(params: {
    repository: WorldRepository;
    storyId: string;
    locationId: string;
    actorId?: string;
    vehicleId?: string;
  }): VehicleInteractionResult {
    const { repository, storyId, locationId, actorId = 'player', vehicleId } = params;
    const graph = repository.getGeographyGraph(storyId);
    const node = graph.getNode(locationId);

    if (!node) {
      return {
        success: false,
        errorCode: 'LOCATION_NOT_FOUND',
        message: `Location '${locationId}' not found.`,
      };
    }

    // Locate boardable vehicle at current location
    const vehicle = (node.sceneObjects || []).find((obj) => {
      if (vehicleId) return obj.id === vehicleId;
      return (
        (obj.tags?.includes('vehicle') || obj.tags?.includes('taxi')) &&
        obj.properties?.vehicleState === 'STOPPED_AT_KERB'
      );
    });

    if (!vehicle) {
      return {
        success: false,
        errorCode: 'NO_VEHICLE_PRESENT',
        message: 'No vehicle is present to board.',
      };
    }

    // Add active dependency to protect vehicle from garbage collection
    const currentDeps = vehicle.activeDependencies || (vehicle.properties?.activeDependencies as string[]) || [];
    if (!currentDeps.includes('player_boarded')) {
      currentDeps.push('player_boarded');
    }
    vehicle.activeDependencies = currentDeps;
    if (vehicle.properties) {
      vehicle.properties.activeDependencies = currentDeps;
      const occupants = Array.isArray(vehicle.properties.occupants) ? vehicle.properties.occupants : [];
      if (!occupants.includes(actorId)) occupants.push(actorId);
      vehicle.properties.occupants = occupants;
    }

    // Record boarding state in player runtime
    const run = repository.getStoryRun(storyId);
    if (run) {
      if (!run.runtimeState) run.runtimeState = {} as any;
      (run.runtimeState as any).inVehicle = true;
      (run.runtimeState as any).boardedVehicleId = vehicle.id;
    }

    return {
      success: true,
      message: `You open the door and board the ${vehicle.name}.`,
      vehicle,
      stage: vehicle.lifecycleStage || 'ACTIVE_TEMPORARY',
    };
  }

  /**
   * Initiates vehicle travel toward a destination location.
   * Enforces boarding gate and preserves Invariant 6 (locationId remains origin during travel).
   */
  public static transitVehicle(params: {
    repository: WorldRepository;
    storyId: string;
    destinationLocationId: string;
    mode?: 'Coach' | 'Foot';
  }): VehicleInteractionResult {
    const { repository, storyId, destinationLocationId, mode = 'Coach' } = params;
    const run = repository.getStoryRun(storyId);
    const inVehicle = Boolean((run?.runtimeState as any)?.inVehicle);

    if (!inVehicle) {
      return {
        success: false,
        errorCode: 'NOT_IN_VEHICLE',
        message: 'Cannot travel by vehicle without boarding first.',
      };
    }

    const vehicleId = (run?.runtimeState as any)?.boardedVehicleId as string;
    const player = repository.getPlayerLifecycle(storyId);
    if (!player) {
      return {
        success: false,
        errorCode: 'PLAYER_NOT_FOUND',
        message: 'Player lifecycle state not found.',
      };
    }

    const graph = repository.getGeographyGraph(storyId);
    const originNode = graph.getNode(player.locationId);
    const vehicle = (originNode?.sceneObjects || []).find((obj) => obj.id === vehicleId);

    if (vehicle) {
      const deps = vehicle.activeDependencies || (vehicle.properties?.activeDependencies as string[]) || [];
      if (!deps.includes('transit')) deps.push('transit');
      vehicle.activeDependencies = deps;
      if (vehicle.properties) vehicle.properties.activeDependencies = deps;
    }

    // Start player travel via WorldSimulationService
    const travelResult = worldSimulationService.startPlayerTravel(storyId, destinationLocationId, mode);
    if (!travelResult.success) {
      return {
        success: false,
        errorCode: 'TRAVEL_START_FAILED',
        message: travelResult.message,
      };
    }

    return {
      success: true,
      message: travelResult.message,
      journey: travelResult.journey,
      vehicle,
      stage: 'ACTIVE_TEMPORARY',
    };
  }

  /**
   * Completes a vehicle journey upon arrival, disembarks the passenger, and evicts the temporary vehicle.
   */
  public static completeVehicleJourney(params: {
    repository: WorldRepository;
    storyId: string;
    locationId: string;
    vehicleId?: string;
  }): VehicleInteractionResult {
    const { repository, storyId, locationId } = params;
    const run = repository.getStoryRun(storyId);
    const vehicleId = params.vehicleId || ((run?.runtimeState as any)?.boardedVehicleId as string);

    // Disembark player
    if (run?.runtimeState) {
      (run.runtimeState as any).inVehicle = false;
      (run.runtimeState as any).boardedVehicleId = undefined;
    }

    // Demote/Evict temporary vehicle from GeographyGraph so it does not pollute permanent store
    const graph = repository.getGeographyGraph(storyId);
    if (vehicleId) {
      // Check in current location and all nodes
      for (const node of graph.getAllNodes()) {
        graph.removeSceneObject(node.id, vehicleId);
      }
    }

    return {
      success: true,
      message: 'The taxi stops at your destination. You pay the fare, step out onto the kerb, and the cab pulls away.',
      stage: 'EPHEMERAL',
    };
  }
}
