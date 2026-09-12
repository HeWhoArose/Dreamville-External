import {
  EngineState,
  ExternalViewState,
  ExternalCharacter,
  ActionRequest,
  ActionResult,
  ActionLog,
} from '../types';
import { INITIAL_ENGINE_STATE, INITIAL_DIALOGUE_NODES } from '../data/mockEngineState';

/**
 * MockEngineAdapter
 *
 * Implements the client-side adapter boundary adhering to EXTERNAL_PROJECT_SPEC.md.
 * In production, this adapter communicates across the approved contract boundary
 * with the authoritative deterministic game engine.
 *
 * Epistemic Discipline:
 * - Maintains canonical state internally (including hidden canonical context).
 * - Sanitizes and filters every state transition before projecting ExternalViewState.
 * - Hidden information is strictly omitted from the external presentation layer.
 */
export class MockEngineAdapter {
  private coreState: EngineState;

  constructor(initialState: EngineState = INITIAL_ENGINE_STATE) {
    // Deep clone initial state so the adapter holds its own authoritative simulation instance
    this.coreState = JSON.parse(JSON.stringify(initialState));
  }

  /**
   * Epistemic Projection Filter
   * Strips all hidden canonical secrets before transmitting state to the client presentation layer.
   */
  public filterForExternalClient(state: EngineState): ExternalViewState {
    const sanitizedCharacters: Record<string, ExternalCharacter> = {};

    for (const [id, char] of Object.entries(state.characters)) {
      // Epistemic Boundary: hiddenCanonicalContext is deliberately withheld from the client
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

    const activeLocation =
      state.locations[state.activeLocationId] || Object.values(state.locations)[0];

    return {
      worldTime: { ...state.worldTime },
      activeLocationId: state.activeLocationId,
      activeLocation,
      protagonist: { ...state.protagonist },
      locations: { ...state.locations },
      characters: sanitizedCharacters,
      activeDialogue: state.activeDialogue ? { ...state.activeDialogue } : null,
      dialogueHistory: state.dialogueHistory.map((d) => ({ ...d })),
      inventory: state.inventory.map((i) => ({ ...i })),
      equipment: { ...state.equipment },
      knowledgeBase: state.knowledgeBase.map((k) => ({ ...k })),
      actionHistory: state.actionHistory.map((a) => ({ ...a })),
      engineContractVersion: state.engineContractVersion,
    };
  }

  /**
   * Returns the initial sanitized view state for the React client.
   */
  public getInitialViewState(): ExternalViewState {
    return this.filterForExternalClient(this.coreState);
  }

  /**
   * Processes an ActionRequest from the presentation layer, runs deterministic validation,
   * commits the state transition in the simulated core engine, and returns an ActionResult
   * containing the updated ExternalViewState.
   */
  public async processAction(request: ActionRequest): Promise<ActionResult> {
    // Simulate network latency / engine resolution round-trip (120ms)
    await new Promise((resolve) => setTimeout(resolve, 120));

    const now = new Date().toTimeString().split(' ')[0];
    const actionId = `act_${Date.now()}`;
    let success = true;
    let message = '';
    let authoritativeFeedback = '';
    let logEntry: ActionLog | null = null;

    switch (request.type) {
      case 'DIALOGUE_CHOICE': {
        const targetNode = INITIAL_DIALOGUE_NODES[request.targetNodeId];
        if (targetNode) {
          this.coreState.activeDialogue = targetNode;
          this.coreState.dialogueHistory = [
            {
              speaker: targetNode.speakerName,
              text: targetNode.text,
              cycle: this.coreState.worldTime.cycle,
            },
            ...this.coreState.dialogueHistory,
          ];

          // Grant knowledge if node has reward and not already known
          if (targetNode.rewardKnowledge) {
            const alreadyKnown = this.coreState.knowledgeBase.some(
              (k) => k.id === targetNode.rewardKnowledge!.id
            );
            if (!alreadyKnown) {
              this.coreState.knowledgeBase = [
                {
                  ...targetNode.rewardKnowledge,
                  acquiredAtCycle: this.coreState.worldTime.cycle,
                },
                ...this.coreState.knowledgeBase,
              ];
            }
          }

          message = `Dialogue intent committed: [${request.intent}]`;
          authoritativeFeedback = `Dialogue intent [${request.intent}] validated by mock engine adapter. Transitioned to node: ${request.targetNodeId}.`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: this.coreState.worldTime.cycle,
            actionType: 'DIALOGUE_CHOICE',
            description: `Player selected: "${request.label}"`,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        } else {
          success = false;
          message = `Target dialogue node ${request.targetNodeId} not found in engine index.`;
          authoritativeFeedback = `Rejection: Unrecognized dialogue node identifier.`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: this.coreState.worldTime.cycle,
            actionType: 'DIALOGUE_CHOICE',
            description: `Attempted dialogue selection: "${request.label}"`,
            epistemicValidation: 'REJECTED_BY_ENGINE',
            authoritativeFeedback,
          };
        }
        break;
      }

      case 'TRAVEL_REQUEST': {
        const targetLoc = this.coreState.locations[request.targetLocationId];
        if (targetLoc && targetLoc.accessible) {
          this.coreState.activeLocationId = request.targetLocationId;

          // Contextual dialogue hook for destination
          if (request.targetLocationId === 'loc_whispering_orrery') {
            this.coreState.activeDialogue = INITIAL_DIALOGUE_NODES.maren_intro;
          } else if (request.targetLocationId === 'loc_lantern_vault') {
            this.coreState.activeDialogue = INITIAL_DIALOGUE_NODES.elian_intro;
          } else {
            this.coreState.activeDialogue = null;
          }

          message = `Traveled to ${targetLoc.name} (${targetLoc.region}).`;
          authoritativeFeedback = `Movement validated against world topology. Protagonist coordinates set to [${targetLoc.coordinates.x}, ${targetLoc.coordinates.y}].`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: this.coreState.worldTime.cycle,
            actionType: 'MOVEMENT',
            description: message,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        } else {
          success = false;
          message = `Travel request rejected: Location is inaccessible or undiscovered.`;
          authoritativeFeedback = `Pathfinding failure: Destination bounds check failed.`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: this.coreState.worldTime.cycle,
            actionType: 'MOVEMENT',
            description: `Failed travel attempt to ${request.targetLocationId}.`,
            epistemicValidation: 'REJECTED_BY_ENGINE',
            authoritativeFeedback,
          };
        }
        break;
      }

      case 'EQUIP_REQUEST': {
        const item = this.coreState.inventory.find((i) => i.id === request.itemId);
        if (item && item.equippableSlot === request.slot) {
          this.coreState.equipment = {
            ...this.coreState.equipment,
            [request.slot]: item,
          };
          message = `Equipped ${item.name} into ${request.slot} slot.`;
          authoritativeFeedback = `Item ${item.id} verified in protagonist inventory. Slot binding approved by engine.`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: this.coreState.worldTime.cycle,
            actionType: 'EQUIP_REQUEST',
            description: message,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        } else {
          success = false;
          message = `Equipment request rejected: Item or slot incompatibility.`;
          authoritativeFeedback = `Equip validation error: item either not owned or mismatching slot requirements.`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: this.coreState.worldTime.cycle,
            actionType: 'EQUIP_REQUEST',
            description: `Failed equip request for item ${request.itemId}.`,
            epistemicValidation: 'REJECTED_BY_ENGINE',
            authoritativeFeedback,
          };
        }
        break;
      }

      case 'UNEQUIP_REQUEST': {
        const currentItem = this.coreState.equipment[request.slot];
        if (currentItem) {
          this.coreState.equipment = {
            ...this.coreState.equipment,
            [request.slot]: null,
          };
          message = `Unequipped ${currentItem.name} from ${request.slot} slot.`;
          authoritativeFeedback = `Slot ${request.slot} released and item returned to dormant inventory carrier state.`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: this.coreState.worldTime.cycle,
            actionType: 'EQUIP_REQUEST',
            description: message,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        } else {
          success = false;
          message = `Unequip rejected: Slot ${request.slot} is already vacant.`;
          authoritativeFeedback = `No equipped artifact found in ${request.slot}.`;
        }
        break;
      }

      case 'INSPECT_ITEM': {
        const item = this.coreState.inventory.find((i) => i.id === request.itemId);
        if (item) {
          message = `Inspected artifact: ${item.name}.`;
          authoritativeFeedback = `Standard physical inspection yields authorized lore: "${item.description}"`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: this.coreState.worldTime.cycle,
            actionType: 'INSPECTION',
            description: message,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        }
        break;
      }

      case 'INSPECT_SURROUNDINGS': {
        const activeLocation =
          this.coreState.locations[this.coreState.activeLocationId] ||
          Object.values(this.coreState.locations)[0];
        message = `Scanned surrounding environment at ${activeLocation.name}.`;
        authoritativeFeedback = `Sensory evaluation confirmed: "${activeLocation.ambientSensory}"`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: this.coreState.worldTime.cycle,
          actionType: 'INSPECTION',
          description: message,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      case 'ADVANCE_CYCLE': {
        const periods: ('Dawn' | 'Morning' | 'Zenith' | 'Dusk' | 'Starlight')[] = [
          'Dawn',
          'Morning',
          'Zenith',
          'Dusk',
          'Starlight',
        ];
        const currentIdx = periods.indexOf(this.coreState.worldTime.period);
        const nextPeriod = periods[(currentIdx + 1) % periods.length];
        const nextCycle =
          nextPeriod === 'Dawn'
            ? this.coreState.worldTime.cycle + 1
            : this.coreState.worldTime.cycle;

        this.coreState.worldTime = {
          ...this.coreState.worldTime,
          cycle: nextCycle,
          period: nextPeriod,
        };

        message = `Advanced world clock to Cycle ${nextCycle} (${nextPeriod}).`;
        authoritativeFeedback = `Deterministic chronometer advanced. Illumination shifted to ${nextPeriod}.`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: nextCycle,
          actionType: 'NOTE_RECORD',
          description: message,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      case 'ENGAGE_DIALOGUE': {
        if (request.characterId === 'char_elian') {
          this.coreState.activeDialogue = INITIAL_DIALOGUE_NODES.elian_intro;
        } else if (request.characterId === 'char_maren') {
          this.coreState.activeDialogue = INITIAL_DIALOGUE_NODES.maren_intro;
        }
        const char = this.coreState.characters[request.characterId];
        message = `Engaged in dialogue with ${char ? char.name : request.characterId}.`;
        authoritativeFeedback = `Dialogue channel opened with verified NPC entity.`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: this.coreState.worldTime.cycle,
          actionType: 'DIALOGUE_CHOICE',
          description: message,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }
    }

    if (logEntry) {
      this.coreState.actionHistory = [logEntry, ...this.coreState.actionHistory];
    }

    const updatedViewState = this.filterForExternalClient(this.coreState);

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
   * Epistemic Audit Helper
   * Allows developer/architectural inspector to verify that the core engine holds canonical secrets,
   * but that the client view state has them stripped.
   */
  public getEpistemicAudit(): {
    canonicalSecretsHeld: { characterId: string; characterName: string; secret: string }[];
    filtrationRule: string;
  } {
    const secrets: { characterId: string; characterName: string; secret: string }[] = [];

    for (const [id, char] of Object.entries(this.coreState.characters)) {
      if (char.hiddenCanonicalContext) {
        secrets.push({
          characterId: id,
          characterName: char.name,
          secret: char.hiddenCanonicalContext,
        });
      }
    }

    return {
      canonicalSecretsHeld: secrets,
      filtrationRule:
        'filterForExternalClient() strips hiddenCanonicalContext from all characters before emitting ExternalViewState.',
    };
  }
}

// Export default singleton instance
export const mockEngineAdapter = new MockEngineAdapter();
