import {
  EngineState,
  ExternalViewState,
  ExternalCharacter,
  ActionRequest,
  ActionResult,
  ActionLog,
  Location,
} from './serverTypes';
import {
  INITIAL_ENGINE_STATE,
  INITIAL_DIALOGUE_NODES,
  SERVER_BOUNDARY_TEST_SECRET,
} from './serverInitialState';
import { worldRepository } from '../repositories/worldRepository';
import { worldSimulationService } from '../simulation/worldSimulationService';
import { PlayerLifecycleState } from '../domain/playerLifecycleState';

/**
 * ServerMockAuthority
 *
 * Runs exclusively inside the server-side Node.js environment.
 * Owns the simulated canonical EngineState (including hidden secrets).
 *
 * Epistemic Separation Guarantee:
 * - Maintains canonical state in-memory (EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE).
 * - All outbound data passes through filterForExternalClient().
 * - hiddenCanonicalContext and serverBoundarySecret are NEVER returned to the client.
 */
export class ServerMockAuthority {
  // Labelled clearly per user specification: in-memory state for development experiment
  private EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE: EngineState;

  constructor() {
    this.EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE = JSON.parse(
      JSON.stringify(INITIAL_ENGINE_STATE)
    );
  }

  /**
   * Epistemic Projection Filter
   * Projects server-side canonical EngineState into a client-safe ExternalViewState.
   * Strips all hidden secrets, canonical character secrets, and server test secrets.
   */
  public filterForExternalClient(state: EngineState, storyId: string = 'default_story'): ExternalViewState {
    const sanitizedCharacters: Record<string, ExternalCharacter> = {};
    for (const [id, char] of Object.entries(state.characters)) {
      sanitizedCharacters[id] = {
        id: char.id,
        name: char.name,
        title: char.title,
        role: char.role,
        locationId: char.locationId,
        presence: char.presence,
        disposition: char.disposition,
        playerVisibleKnowledge: [...char.playerVisibleKnowledge],
        portraitEmoji: char.portraitEmoji,
      };
    }

    const player = worldRepository.getPlayerLifecycle(storyId);
    const canonicalLocationId = player ? player.locationId : state.activeLocationId;
    const isTraveling = player ? player.isTraveling : false;
    const activeJourney = player ? player.activeJourney : null;
    const clock = worldRepository.getWorldClock(storyId);
    const canonicalClockState = clock.getState();

    state.activeLocationId = canonicalLocationId;
    const phaseMapping: Record<string, 'Dawn' | 'Morning' | 'Zenith' | 'Dusk' | 'Starlight'> = {
      Predawn: 'Dawn',
      Dawn: 'Dawn',
      Morning: 'Morning',
      Afternoon: 'Zenith',
      Dusk: 'Dusk',
      Night: 'Starlight',
    };
    state.worldTime = {
      cycle: canonicalClockState.timestamp.day,
      period: phaseMapping[canonicalClockState.currentDayPhase] || 'Zenith',
      era: 'Age of Resonances',
    };

    const actorDiscoveredSet = new Set(
      player?.discoveredLocationIds || ['loc_whispering_orrery', 'loc_lantern_vault', 'loc_glasswood_verge']
    );

    const graphNodes = worldRepository.getGeographyGraph().getAllNodes();
    const projectedLocations: Record<string, Location> = {};
    for (const node of graphNodes) {
      const isCurrentLocation = node.id === canonicalLocationId;
      const isKnownInKnowledgeBase = state.knowledgeBase.some(
        (k) => k.id.includes(node.id) || k.summary.toLowerCase().includes(node.name.toLowerCase())
      );
      const isPartOfActiveJourney =
        activeJourney !== null &&
        (activeJourney.originLocationId === node.id || activeJourney.destinationLocationId === node.id);
      const isActorDiscovered = actorDiscoveredSet.has(node.id);

      if (isActorDiscovered || isCurrentLocation || isKnownInKnowledgeBase || isPartOfActiveJourney) {
        projectedLocations[node.id] = {
          id: node.id,
          name: node.name,
          region: node.regionId,
          description: node.description,
          coordinates: node.coordinates,
          accessible: node.accessible,
          ambientSensory: node.ambientSensory,
          discovered: true,
        };
      }
    }

    const activeLocation =
      projectedLocations[canonicalLocationId] ||
      Object.values(projectedLocations)[0];

    // Canonical Inventory & Equipment Projection from InventoryItemEngine (CH5)
    const invEngine = worldRepository.getInventoryEngine('default_story');
    const actorId = player ? player.actorId : 'player_actor_default_story';
    const canonicalItems = invEngine.getActorInventory(actorId);
    const canonicalPaperDoll = invEngine.getActorPaperDoll(actorId);
    const iconMap: Record<string, string> = {
      def_iron_sword: '⚔️',
      def_steel_cuirass: '🛡️',
      def_brass_astrolabe: '🧭',
      def_luminary_veil: '🧣',
      def_leather_boots: '👢',
      def_iron_shield: '🛡️',
      def_iron_ingot: '🧱',
      def_healing_salve: '🧪',
      def_scribed_vellum: '📜',
      def_glasswood_spore_flask: '🧪',
    };
    const projectedInventory = canonicalItems.map((item) => {
      const def = invEngine.getItemDefinition(item.defId);
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        description: def?.description || `${item.name} (${item.provenance})`,
        quantity: item.quantity,
        weight: def?.weightKg ?? 1.0,
        rarity: item.rarity,
        equippableSlot: item.equippedSlot || (def?.allowedSlots?.[0] ? def.allowedSlots[0].charAt(0).toUpperCase() + def.allowedSlots[0].slice(1) : undefined),
        icon: iconMap[item.defId] || '📦',
        durability: item.durability,
        maxDurability: item.maxDurability,
        isBroken: item.isBroken,
      };
    });
    const projectedEquipment: Record<string, any> = {
      Head: canonicalPaperDoll.head ? { ...canonicalPaperDoll.head, icon: iconMap[canonicalPaperDoll.head.defId] || '🧣' } : null,
      Cloak: canonicalPaperDoll.cloak ? { ...canonicalPaperDoll.cloak, icon: iconMap[canonicalPaperDoll.cloak.defId] || '🧣' } : null,
      Hands: canonicalPaperDoll.hands ? { ...canonicalPaperDoll.hands, icon: iconMap[canonicalPaperDoll.hands.defId] || '🧭' } : null,
      Relic: canonicalPaperDoll.relic ? { ...canonicalPaperDoll.relic, icon: iconMap[canonicalPaperDoll.relic.defId] || '🧪' } : null,
      Footwear: canonicalPaperDoll.feet ? { ...canonicalPaperDoll.feet, icon: iconMap[canonicalPaperDoll.feet.defId] || '👢' } : null,
      Body: canonicalPaperDoll.body ? { ...canonicalPaperDoll.body, icon: iconMap[canonicalPaperDoll.body.defId] || '🛡️' } : null,
      MainHand: canonicalPaperDoll.mainHand ? { ...canonicalPaperDoll.mainHand, icon: iconMap[canonicalPaperDoll.mainHand.defId] || '⚔️' } : null,
      OffHand: canonicalPaperDoll.offHand ? { ...canonicalPaperDoll.offHand, icon: iconMap[canonicalPaperDoll.offHand.defId] || '🛡️' } : null,
    };

    return {
      worldTime: { ...state.worldTime },
      activeLocationId: canonicalLocationId,
      activeLocation,
      protagonist: {
        ...state.protagonist,
        status: player?.isDead
          ? 'Deceased'
          : player?.isPossessed
          ? 'Possessed'
          : player?.transformationRecord?.active
          ? `Transformed (${player.transformationRecord.formName})`
          : player?.isTraveling
          ? 'In Transit'
          : 'Active',
      },
      locations: projectedLocations,
      routeEdges: worldRepository
        .getGeographyGraph()
        .getAllEdges()
        .filter((edge) => Boolean(projectedLocations[edge.fromLocationId] && projectedLocations[edge.toLocationId])),
      characters: sanitizedCharacters,
      activeDialogue: state.activeDialogue ? { ...state.activeDialogue } : null,
      dialogueHistory: state.dialogueHistory.map((d) => ({ ...d })),
      inventory: projectedInventory,
      equipment: projectedEquipment,
      knowledgeBase: state.knowledgeBase.map((k) => ({ ...k })),
      actionHistory: state.actionHistory.map((a) => ({ ...a })),
      engineContractVersion: state.engineContractVersion,
      activeJourney: activeJourney ? JSON.parse(JSON.stringify(activeJourney)) : null,
      isTraveling,
      playerLifecycle: player ? player.toJSON() : null,
    };
  }

  /**
   * Returns sanitized view state for GET /api/game/state
   */
  public getSanitizedViewState(storyId: string = 'default_story'): ExternalViewState {
    return this.filterForExternalClient(this.EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE, storyId);
  }

  /**
   * Returns canonical server-side locations (unfiltered world truth).
   */
  public getCanonicalLocations(): Record<string, Location> {
    const graphNodes = worldRepository.getGeographyGraph().getAllNodes();
    const locs: Record<string, Location> = {};
    for (const node of graphNodes) {
      locs[node.id] = {
        id: node.id,
        name: node.name,
        region: node.regionId,
        description: node.description,
        coordinates: node.coordinates,
        accessible: node.accessible,
        ambientSensory: node.ambientSensory,
        discovered: node.discovered,
      };
    }
    return locs;
  }

  /**
   * Server-authoritative resolution of player ActionRequests.
   */
  public processAction(request: ActionRequest): ActionResult {
    const state = this.EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE;
    const now = new Date().toTimeString().split(' ')[0];
    const actionId = `act_srv_${Date.now()}`;
    let success = true;
    let message = '';
    let authoritativeFeedback = '';
    let logEntry: ActionLog | null = null;

    if (!request || !request.type) {
      return {
        success: false,
        actionId,
        requestType: 'INSPECT_SURROUNDINGS',
        status: 'MOCK_ENGINE_REJECTED',
        message: 'Malformed request: missing action type.',
        authoritativeFeedback: 'Server authority rejected request without action type.',
        viewState: this.filterForExternalClient(state),
      };
    }

    switch (request.type) {
      case 'DIALOGUE_CHOICE': {
        const targetNode = INITIAL_DIALOGUE_NODES[request.targetNodeId];
        if (targetNode) {
          state.activeDialogue = targetNode;
          state.dialogueHistory = [
            {
              speaker: targetNode.speakerName,
              text: targetNode.text,
              cycle: state.worldTime.cycle,
            },
            ...state.dialogueHistory,
          ];

          // Grant knowledge if node has reward and not already known
          if (targetNode.rewardKnowledge) {
            const alreadyKnown = state.knowledgeBase.some(
              (k) => k.id === targetNode.rewardKnowledge!.id
            );
            if (!alreadyKnown) {
              state.knowledgeBase = [
                {
                  ...targetNode.rewardKnowledge,
                  acquiredAtCycle: state.worldTime.cycle,
                },
                ...state.knowledgeBase,
              ];
            }
          }

          message = `Dialogue intent committed: [${request.intent}]`;
          authoritativeFeedback = `Server authority validated intent [${request.intent}]. Transitioned to node: ${request.targetNodeId}.`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'DIALOGUE_CHOICE',
            description: `Player selected: "${request.label}"`,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        } else {
          success = false;
          message = `Target dialogue node ${request.targetNodeId} not recognized by server engine.`;
          authoritativeFeedback = `Rejection: Dialogue node identifier invalid on server.`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'DIALOGUE_CHOICE',
            description: `Attempted dialogue selection: "${request.label}"`,
            epistemicValidation: 'REJECTED_BY_ENGINE',
            authoritativeFeedback,
          };
        }
        break;
      }

      case 'TRAVEL_REQUEST': {
        const mode = (request as any).mode || 'Foot';
        const travelResult = worldSimulationService.startPlayerTravel(
          'default_story',
          request.targetLocationId,
          mode
        );

        if (travelResult.success) {
          const targetLoc = worldRepository.getGeographyGraph().getAllNodes().find(n => n.id === request.targetLocationId);
          const destName = targetLoc ? targetLoc.name : request.targetLocationId;
          message = travelResult.message;
          authoritativeFeedback = `WorldSimulationService validated route and initiated travel to ${destName}. Invariant 6: Location remains origin while journey is in progress.`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'MOVEMENT',
            description: `Initiated travel to ${destName} (Distance: ${travelResult.journey?.totalDistanceKm.toFixed(1)} km).`,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        } else {
          success = false;
          message = travelResult.message;
          authoritativeFeedback = `Server rejected movement request: ${travelResult.message}`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'MOVEMENT',
            description: `Attempted travel to ${request.targetLocationId}: ${travelResult.message}`,
            epistemicValidation: 'REJECTED_BY_ENGINE',
            authoritativeFeedback,
          };
        }
        break;
      }

      case 'CANCEL_TRAVEL': {
        const cancelled = worldSimulationService.cancelPlayerTravel('default_story');
        if (cancelled) {
          message = 'Travel cancelled. Player anchored at origin location.';
          authoritativeFeedback = 'WorldSimulationService cancelled active journey. Destination was not committed.';
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'MOVEMENT',
            description: 'Cancelled active travel journey.',
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        } else {
          success = false;
          message = 'No active journey in progress to cancel.';
          authoritativeFeedback = 'Server noted no active journey.';
        }
        break;
      }

      case 'DISCOVER_LOCATION': {
        const targetId = request.targetLocationId;
        const targetStoryId = (request as any).storyId || 'default_story';
        const graphNodes = worldRepository.getGeographyGraph().getAllNodes();
        const targetNode = graphNodes.find(n => n.id === targetId);
        if (targetNode) {
          const player = worldRepository.getPlayerLifecycle(targetStoryId);
          if (player) {
            const currentList = player.discoveredLocationIds || [];
            if (!currentList.includes(targetId)) {
              const updatedPlayer = player.copyWith({
                discoveredLocationIds: [...currentList, targetId],
              });
              worldRepository.updatePlayerLifecycle(targetStoryId, updatedPlayer);
            }
          }
          const targetLoc = targetNode;
          message = `Location charted: ${targetLoc.name}.`;
          authoritativeFeedback = `Server epistemic authority charted new location in player knowledge.`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'INSPECTION',
            description: `Charted new location: ${targetLoc.name}.`,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        } else {
          success = false;
          message = `Cannot discover unknown location.`;
          authoritativeFeedback = `Server rejected exploration: target location does not exist in canonical world.`;
        }
        break;
      }

      case 'EQUIP_REQUEST': {
        const player = worldRepository.getPlayerLifecycle('default_story');
        const actorId = player ? player.actorId : 'player_actor_default_story';
        const invEngine = worldRepository.getInventoryEngine('default_story');

        const slotMapping: Record<string, string> = {
          head: 'head',
          cloak: 'cloak',
          hands: 'hands',
          relic: 'relic',
          footwear: 'feet',
          feet: 'feet',
          body: 'body',
          waist: 'waist',
          legs: 'legs',
          mainhand: 'mainHand',
          offhand: 'offHand',
          ring1: 'ring1',
          ring2: 'ring2',
          neck: 'neck',
        };
        const canonicalSlot = slotMapping[request.slot.toLowerCase()] || request.slot;

        const result = invEngine.equipItem(actorId, request.itemId, canonicalSlot as any);
        if (result.success) {
          message = `Equipped ${result.equippedItem?.name} into ${request.slot} slot.`;
          authoritativeFeedback = `Server verified item ${request.itemId} ownership and slot compatibility (${canonicalSlot}) via InventoryItemEngine.`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'EQUIP_REQUEST',
            description: `Equipped ${result.equippedItem?.name} to ${canonicalSlot} slot.`,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        } else {
          success = false;
          message = result.errorReason || `Cannot equip item: inventory mismatch or slot incompatible.`;
          authoritativeFeedback = `Server rejected equip request via InventoryItemEngine: ${result.errorReason}`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'EQUIP_REQUEST',
            description: `Attempted to equip item ${request.itemId} to ${request.slot}.`,
            epistemicValidation: 'REJECTED_BY_ENGINE',
            authoritativeFeedback,
          };
        }
        break;
      }

      case 'UNEQUIP_REQUEST': {
        const player = worldRepository.getPlayerLifecycle('default_story');
        const actorId = player ? player.actorId : 'player_actor_default_story';
        const invEngine = worldRepository.getInventoryEngine('default_story');

        const slotMapping: Record<string, string> = {
          head: 'head',
          cloak: 'cloak',
          hands: 'hands',
          relic: 'relic',
          footwear: 'feet',
          feet: 'feet',
          body: 'body',
          waist: 'waist',
          legs: 'legs',
          mainhand: 'mainHand',
          offhand: 'offHand',
          ring1: 'ring1',
          ring2: 'ring2',
          neck: 'neck',
        };
        const canonicalSlot = slotMapping[request.slot.toLowerCase()] || request.slot;

        const result = invEngine.unequipItem(actorId, canonicalSlot as any);
        if (result.success) {
          message = `Unequipped ${result.unequippedItem?.name || 'item'} from ${request.slot} slot.`;
          authoritativeFeedback = `Server unbound item from slot ${canonicalSlot} via InventoryItemEngine.`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'EQUIP_REQUEST',
            description: `Unequipped item from ${canonicalSlot} slot.`,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        } else {
          success = false;
          message = result.errorReason || `Slot ${request.slot} was already empty.`;
          authoritativeFeedback = `Server noted unequip rejection via InventoryItemEngine: ${result.errorReason}`;
        }
        break;
      }

      case 'INSPECT_ITEM': {
        const player = worldRepository.getPlayerLifecycle('default_story');
        const actorId = player ? player.actorId : 'player_actor_default_story';
        const invEngine = worldRepository.getInventoryEngine('default_story');
        const item = invEngine.getItemInstance(request.itemId) || invEngine.getActorInventory(actorId).find((i) => i.id === request.itemId);
        const def = item ? invEngine.getItemDefinition(item.defId) : undefined;
        if (item) {
          message = `Inspected ${item.name}.`;
          authoritativeFeedback = `Server authorized presentation of sensory lore: "${def?.description || item.name}"`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'INSPECTION',
            description: `Inspected artifact: ${item.name}.`,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        } else {
          success = false;
          message = `Artifact not found in inventory.`;
          authoritativeFeedback = `Server inspection failed: item not found in canonical inventory.`;
        }
        break;
      }

      case 'INSPECT_SURROUNDINGS': {
        const activeLoc =
          worldRepository.getGeographyGraph().getAllNodes().find(n => n.id === state.activeLocationId) || worldRepository.getGeographyGraph().getAllNodes()[0];
        message = `Inspected surroundings at ${activeLoc.name}.`;
        authoritativeFeedback = `Server emitted ambient sensory narrative: "${activeLoc.ambientSensory}"`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: state.worldTime.cycle,
          actionType: 'INSPECTION',
          description: `Scanned surrounding environment at ${activeLoc.name}.`,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      case 'ADVANCE_CYCLE':
      case 'ADVANCE_TIME': {
        const secondsToAdvance =
          request.type === 'ADVANCE_TIME' && typeof (request as any).seconds === 'number'
            ? (request as any).seconds
            : 14400; // 4 hours per cycle step

        const advanceResult = worldSimulationService.advanceTime('default_story', secondsToAdvance);
        const clock = worldRepository.getWorldClock('default_story');
        const ts = clock.getTimestamp();
        const phase = clock.getState().currentDayPhase;

        message = `World clock advanced to Day ${ts.day} (${phase}, ${ts.hour.toString().padStart(2, '0')}:${ts.minute.toString().padStart(2, '0')}).`;
        if (advanceResult.completedArrivals.length > 0) {
          const completedDest = advanceResult.completedArrivals[0];
          const destLoc = worldRepository.getGeographyGraph().getAllNodes().find(n => n.id === completedDest);
          const destName = destLoc ? destLoc.name : completedDest;
          message += ` Arrived at destination: ${destName}.`;

          // Contextual dialogue hook for destination
          if (completedDest === 'loc_whispering_orrery') {
            state.activeDialogue = INITIAL_DIALOGUE_NODES.maren_intro;
          } else if (completedDest === 'loc_lantern_vault') {
            state.activeDialogue = INITIAL_DIALOGUE_NODES.elian_intro;
          } else {
            state.activeDialogue = null;
          }
        }

        authoritativeFeedback = `WorldSimulationService advanced canonical clock by ${secondsToAdvance}s. Completed arrivals: ${advanceResult.completedArrivals.join(', ') || 'None'}.`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: ts.day,
          actionType: 'NOTE_RECORD',
          description: `Advanced canonical WorldClock by ${secondsToAdvance}s. Completed arrivals: ${advanceResult.completedArrivals.join(', ') || 'None'}.`,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      case 'ENGAGE_DIALOGUE': {
        if (request.characterId === 'char_elian') {
          state.activeDialogue = INITIAL_DIALOGUE_NODES.elian_intro;
          message = 'Engaged Master Elian in conversation.';
          authoritativeFeedback = 'Server dialogue manager attached Elian dialogue tree.';
        } else if (request.characterId === 'char_maren') {
          state.activeDialogue = INITIAL_DIALOGUE_NODES.maren_intro;
          message = 'Engaged Maren the Archivist in conversation.';
          authoritativeFeedback = 'Server dialogue manager attached Maren dialogue tree.';
        } else {
          success = false;
          message = 'Character not available for dialogue.';
          authoritativeFeedback = 'Server dialogue manager: character unavailable.';
        }
        break;
      }

      case 'APPLY_INJURY': {
        const res = worldSimulationService.applyPlayerInjury('default_story', {
          type: (request as any).injuryType || 'Wound',
          severity: (request as any).severity || 'Moderate',
          location: (request as any).location || 'Torso',
          description: (request as any).description || 'Injury sustained in world.',
        });
        success = res.success;
        message = res.message;
        authoritativeFeedback = `WorldSimulationService committed canonical injury: ${res.message}`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: state.worldTime.cycle,
          actionType: 'NOTE_RECORD',
          description: `Player suffered injury: ${(request as any).severity} ${(request as any).injuryType} (${(request as any).location}).`,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      case 'HEAL_INJURY': {
        const res = worldSimulationService.healPlayerInjury('default_story', (request as any).injuryId);
        success = res.success;
        message = res.message;
        authoritativeFeedback = `WorldSimulationService updated canonical injuries: ${res.message}`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: state.worldTime.cycle,
          actionType: 'NOTE_RECORD',
          description: `Healed player injury ${(request as any).injuryId}.`,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      case 'APPLY_TRANSFORMATION': {
        const res = worldSimulationService.applyPlayerTransformation('default_story', {
          formName: (request as any).formName,
          vesselType: (request as any).vesselType || 'Aetherial',
        });
        success = res.success;
        message = res.message;
        authoritativeFeedback = `WorldSimulationService committed canonical transformation: ${(request as any).formName}.`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: state.worldTime.cycle,
          actionType: 'NOTE_RECORD',
          description: `Player transformed into ${(request as any).formName}.`,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      case 'REVERT_TRANSFORMATION': {
        const res = worldSimulationService.revertPlayerTransformation('default_story');
        success = res.success;
        message = res.message;
        authoritativeFeedback = `WorldSimulationService reverted canonical transformation.`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: state.worldTime.cycle,
          actionType: 'NOTE_RECORD',
          description: `Player reverted to natural form.`,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      case 'RECORD_DEATH': {
        const res = worldSimulationService.recordPlayerDeath(
          'default_story',
          (request as any).cause || 'Unknown tragedy',
          (request as any).revivalPossible ?? true
        );
        success = res.success;
        message = res.message;
        authoritativeFeedback = `WorldSimulationService recorded canonical player death: ${(request as any).cause}.`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: state.worldTime.cycle,
          actionType: 'NOTE_RECORD',
          description: `Player deceased: ${(request as any).cause}.`,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      case 'REVIVE_PLAYER': {
        const res = worldSimulationService.revivePlayer('default_story');
        success = res.success;
        message = res.message;
        authoritativeFeedback = `WorldSimulationService restored player life.`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: state.worldTime.cycle,
          actionType: 'NOTE_RECORD',
          description: `Player revived.`,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      default: {
        success = false;
        message = 'Unrecognized action type.';
        authoritativeFeedback = 'Server authority rejected unrecognized action schema.';
        break;
      }
    }

    if (logEntry) {
      state.actionHistory = [logEntry, ...state.actionHistory];
    }

    const updatedViewState = this.filterForExternalClient(state);

    return {
      success,
      actionId,
      requestType: request.type,
      status: success ? 'MOCK_ENGINE_COMMITTED' : 'MOCK_ENGINE_REJECTED',
      message,
      authoritativeFeedback,
      viewState: updatedViewState,
    };
  }

  /**
   * Diagnostic summary for the Epistemic Inspector modal.
   * Returns ONLY non-sensitive audit metrics. NEVER leaks the secret text itself!
   */
  public getBoundaryAuditDiagnostics(): {
    serverHoldsCanonicalSecrets: boolean;
    countSecretsHeld: number;
    testSecretPresentOnServer: boolean;
    externalProjectionClean: boolean;
    boundaryStatus: 'PASS' | 'FAIL';
    architectureMode: string;
  } {
    let secretCount = 0;
    for (const char of Object.values(this.EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE.characters)) {
      if (char.hiddenCanonicalContext) {
        secretCount++;
      }
    }

    const testSecretPresent =
      this.EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE.serverBoundarySecret ===
      SERVER_BOUNDARY_TEST_SECRET;

    // Verify sanitized projection is free of secrets
    const projection = this.getSanitizedViewState();
    const projectionString = JSON.stringify(projection);

    const leaksTestSecret = projectionString.includes(SERVER_BOUNDARY_TEST_SECRET);
    const leaksCanonicalSecret = projectionString.includes('SERVER CANONICAL SECRET');

    const clean = !leaksTestSecret && !leaksCanonicalSecret;

    return {
      serverHoldsCanonicalSecrets: secretCount > 0,
      countSecretsHeld: secretCount,
      testSecretPresentOnServer: testSecretPresent,
      externalProjectionClean: clean,
      boundaryStatus: clean && secretCount > 0 && testSecretPresent ? 'PASS' : 'FAIL',
      architectureMode: 'Node.js Express Mock Authority Runtime',
    };
  }

  /**
   * Resets story authority state to pristine initial state for testing or restart.
   */
  public resetToCanonicalState(storyId: string = 'default_story'): void {
    this.EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE = JSON.parse(
      JSON.stringify(INITIAL_ENGINE_STATE)
    );
    const clock = worldRepository.getWorldClock(storyId);
    const initialPlayer = new PlayerLifecycleState({
      actorId: `player_actor_${storyId}`,
      name: 'Scribe Vael',
      locationId: 'loc_whispering_orrery',
      lastUpdatedTime: clock.getTimestamp().totalElapsedSeconds,
      currentActivity: 'idle',
      activeJourney: null,
      injuries: [],
    });
    worldRepository.updatePlayerLifecycle(storyId, initialPlayer);
    worldRepository.getGeographyGraph().setDiscovered('loc_sunken_scriptorium', false);
  }

  /**
   * Internal verification method (never exposed over public API).
   */
  public internalVerifySecretPresence(): boolean {
    return (
      this.EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE.serverBoundarySecret ===
      SERVER_BOUNDARY_TEST_SECRET
    );
  }
}

// Export singleton instance for server process
export const serverMockAuthority = new ServerMockAuthority();
