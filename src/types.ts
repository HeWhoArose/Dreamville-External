export type EpistemicLayer = 'CANONICAL_WORLD_TRUTH' | 'PLAYER_KNOWLEDGE' | 'NPC_KNOWLEDGE' | 'AI_CONTEXT';

export interface WorldTime {
  cycle: number;
  period: 'Dawn' | 'Morning' | 'Zenith' | 'Dusk' | 'Starlight';
  era: string;
}

export interface Location {
  id: string;
  name: string;
  region: string;
  description: string;
  coordinates: { x: number; y: number };
  accessible: boolean;
  ambientSensory: string;
  discovered: boolean;
}

/**
 * Full canonical character representation inside the engine core.
 * May contain sensitive canonical secrets withheld from the external client.
 */
export interface Character {
  id: string;
  name: string;
  title: string;
  role: string;
  locationId: string;
  presence: 'present' | 'absent' | 'unknown';
  disposition: 'Friendly' | 'Cautious' | 'Enigmatic' | 'Reverent';
  playerVisibleKnowledge: string[];
  hiddenCanonicalContext?: string; // Kept segregated per epistemic separation spec
  portraitEmoji: string;
}

/**
 * Epistemically sanitized character representation for downstream external presentation.
 * Hidden canonical context is strictly excluded from this type to prevent client leaks.
 */
export interface ExternalCharacter {
  id: string;
  name: string;
  title: string;
  role: string;
  locationId: string;
  presence: 'present' | 'absent' | 'unknown';
  disposition: 'Friendly' | 'Cautious' | 'Enigmatic' | 'Reverent';
  playerVisibleKnowledge: string[];
  portraitEmoji: string;
}

export interface DialogueChoice {
  id: string;
  label: string;
  intent: string;
  targetNodeId: string;
  requiredItem?: string;
  epistemicContext?: string;
}

export interface DialogueNode {
  nodeId: string;
  speakerId: string;
  speakerName: string;
  text: string;
  epistemicNote: string;
  choices: DialogueChoice[];
  rewardKnowledge?: {
    id: string;
    category: 'Lore' | 'Clue' | 'Person' | 'Location';
    title: string;
    summary: string;
    source: string;
  };
}

export interface Item {
  id: string;
  name: string;
  category: 'Artifact' | 'Tome' | 'Reagent' | 'Key' | 'Relic';
  description: string;
  quantity: number;
  weight: number;
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Mythic';
  equippableSlot?: 'Head' | 'Cloak' | 'Hands' | 'Relic' | 'Footwear';
  icon: string;
}

export interface EquipmentSlot {
  slot: 'Head' | 'Cloak' | 'Hands' | 'Relic' | 'Footwear';
  item: Item | null;
}

export interface PlayerKnowledge {
  id: string;
  category: 'Lore' | 'Clue' | 'Person' | 'Location';
  title: string;
  acquiredAtCycle: number;
  summary: string;
  source: string;
}

export type EpistemicValidationStatus =
  | 'MOCK_ENGINE_COMMITTED'
  | 'PROPOSAL_VALIDATED'
  | 'REJECTED_BY_ENGINE';

export interface ActionLog {
  id: string;
  timestamp: string;
  cycle: number;
  actionType: 'MOVEMENT' | 'DIALOGUE_CHOICE' | 'INSPECTION' | 'EQUIP_REQUEST' | 'NOTE_RECORD';
  description: string;
  epistemicValidation: EpistemicValidationStatus;
  authoritativeFeedback: string;
}

export interface ProtagonistProfile {
  name: string;
  title: string;
  vitality: string;
  currentFocus: string;
}

/**
 * Internal state maintained by the authoritative engine (or mock engine adapter).
 */
export interface EngineState {
  worldTime: WorldTime;
  activeLocationId: string;
  protagonist: ProtagonistProfile;
  locations: Record<string, Location>;
  characters: Record<string, Character>;
  activeDialogue: DialogueNode | null;
  dialogueHistory: { speaker: string; text: string; cycle: number }[];
  inventory: Item[];
  equipment: Record<string, Item | null>;
  knowledgeBase: PlayerKnowledge[];
  actionHistory: ActionLog[];
  engineContractVersion: string;
}

/**
 * External View State: The sanitized projection of the world delivered to the React presentation layer.
 * All hidden canonical secrets are strictly filtered out before reaching this layer.
 */
export interface ExternalViewState {
  worldTime: WorldTime;
  activeLocationId: string;
  activeLocation: Location;
  protagonist: ProtagonistProfile;
  locations: Record<string, Location>;
  characters: Record<string, ExternalCharacter>;
  activeDialogue: DialogueNode | null;
  dialogueHistory: { speaker: string; text: string; cycle: number }[];
  inventory: Item[];
  equipment: Record<string, Item | null>;
  knowledgeBase: PlayerKnowledge[];
  actionHistory: ActionLog[];
  engineContractVersion: string;
}

/**
 * Action Requests submitted by the external client to the authoritative engine adapter.
 */
export type ActionRequest =
  | {
      type: 'DIALOGUE_CHOICE';
      choiceId: string;
      targetNodeId: string;
      intent: string;
      label: string;
    }
  | {
      type: 'TRAVEL_REQUEST';
      targetLocationId: string;
    }
  | {
      type: 'EQUIP_REQUEST';
      itemId: string;
      slot: 'Head' | 'Cloak' | 'Hands' | 'Relic' | 'Footwear';
    }
  | {
      type: 'UNEQUIP_REQUEST';
      slot: 'Head' | 'Cloak' | 'Hands' | 'Relic' | 'Footwear';
    }
  | {
      type: 'INSPECT_ITEM';
      itemId: string;
    }
  | {
      type: 'INSPECT_SURROUNDINGS';
    }
  | {
      type: 'ADVANCE_CYCLE';
    }
  | {
      type: 'ENGAGE_DIALOGUE';
      characterId: string;
    };

/**
 * Result returned by the engine adapter after validating and processing an action request.
 */
export interface ActionResult {
  success: boolean;
  actionId: string;
  requestType: ActionRequest['type'];
  status: 'MOCK_ENGINE_COMMITTED' | 'MOCK_ENGINE_REJECTED';
  message: string;
  authoritativeFeedback: string;
  viewState: ExternalViewState;
}

