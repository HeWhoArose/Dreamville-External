import type {
  WorldTime,
  Location,
  DialogueNode,
  Item,
  PlayerKnowledge,
  ActionLog,
  ProtagonistProfile,
  ExternalViewState,
  ExternalCharacter,
  ActionRequest,
  ActionResult,
} from '../../src/types';

/**
 * Full canonical character representation inside the server-side mock engine.
 * Contains sensitive canonical secrets withheld from the external client.
 */
export interface CanonicalCharacter {
  id: string;
  name: string;
  title: string;
  role: string;
  locationId: string;
  presence: 'present' | 'absent' | 'unknown';
  disposition: 'Friendly' | 'Cautious' | 'Enigmatic' | 'Reverent';
  playerVisibleKnowledge: string[];
  hiddenCanonicalContext: string; // Server-only secret; NEVER sent to external client
  portraitEmoji: string;
}

/**
 * Server-only canonical engine state.
 * Maintained in-memory as EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE.
 */
export interface EngineState {
  worldTime: WorldTime;
  activeLocationId: string;
  protagonist: ProtagonistProfile;
  characters: Record<string, CanonicalCharacter>;
  activeDialogue: DialogueNode | null;
  dialogueHistory: { speaker: string; text: string; cycle: number }[];
  inventory: Item[];
  equipment: Record<string, Item | null>;
  knowledgeBase: PlayerKnowledge[];
  actionHistory: ActionLog[];
  engineContractVersion: string;
  // Boundary verification test secret
  serverBoundarySecret: string;
}

export type {
  WorldTime,
  Location,
  DialogueNode,
  Item,
  PlayerKnowledge,
  ActionLog,
  ProtagonistProfile,
  ExternalViewState,
  ExternalCharacter,
  ActionRequest,
  ActionResult,
};
