import type { PlayerIntent, PlayerIntentInteractionMode } from './playerIntentInterpreter';

export type NarrativeTurnProfile = 'MICRO_ACTION' | 'DIALOGUE' | 'EXPLORATION' | 'INFORMATION_SEEKING' | 'MOVEMENT' | 'COMBAT' | 'REVELATION' | 'STANDARD';
export type NarrativeQualityEnforcement = 'ADVISORY' | 'REWRITE' | 'REJECT';

export interface NarrativeQualityControls {
 enabled: boolean; enforcement: NarrativeQualityEnforcement; minimumSceneGrounding: boolean; specificity: boolean;
 pacing: boolean; sensoryVariety: boolean; characterDistinctiveness: boolean; emotionalContinuity: boolean;
 novelty: boolean; coherence: boolean; playerAgency: boolean; maxParagraphs: number; preferredParagraphs: number;
}

export interface NarrativeQualityContract { version: 1; profile: NarrativeTurnProfile; controls: NarrativeQualityControls; instructions: string[]; }

const DEFAULT_CONTROLS: NarrativeQualityControls = { enabled: true, enforcement: 'REWRITE', minimumSceneGrounding: true, specificity: true, pacing: true, sensoryVariety: true, characterDistinctiveness: true, emotionalContinuity: true, novelty: true, coherence: true, playerAgency: true, maxParagraphs: 4, preferredParagraphs: 2 };
const PROFILE_OVERRIDES: Record<NarrativeTurnProfile, Partial<NarrativeQualityControls>> = {
 MICRO_ACTION: { preferredParagraphs: 1, maxParagraphs: 2 }, DIALOGUE: { preferredParagraphs: 1, maxParagraphs: 3 },
 EXPLORATION: { preferredParagraphs: 2, maxParagraphs: 4 }, INFORMATION_SEEKING: { preferredParagraphs: 1, maxParagraphs: 3 },
 MOVEMENT: { preferredParagraphs: 1, maxParagraphs: 2 }, COMBAT: { preferredParagraphs: 1, maxParagraphs: 3 },
 REVELATION: { preferredParagraphs: 2, maxParagraphs: 4 }, STANDARD: { preferredParagraphs: 2, maxParagraphs: 3 },
};

function profileForIntent(intent: PlayerIntent): NarrativeTurnProfile {
 const mode: PlayerIntentInteractionMode = intent.interactionMode;
 if (mode === 'COMBAT') return 'COMBAT'; if (mode === 'DIALOGUE') return 'DIALOGUE';
 if (mode === 'INFORMATION_SEEKING') return 'INFORMATION_SEEKING'; if (mode === 'EXPLORATION') return 'EXPLORATION';
 if (mode === 'MOVEMENT') return 'MOVEMENT';
 if (mode === 'PASSIVE_OBSERVATION') return intent.action === 'observe' ? 'MICRO_ACTION' : 'EXPLORATION';
 if (intent.action === 'observe' || intent.action === 'listen_and_observe') return 'MICRO_ACTION';
 return 'STANDARD';
}

function instructionsFor(profile: NarrativeTurnProfile, controls: NarrativeQualityControls): string[] {
 const instructions: string[] = [];
 if (controls.minimumSceneGrounding) instructions.push('Anchor the response in the immediate current scene before adding flourish.');
 if (controls.specificity) instructions.push('Prefer concrete, scene-specific details over generic atmospheric prose.');
 if (controls.pacing) instructions.push('Use the turn profile ' + profile + '; do not force every turn into the same response length.');
 if (controls.sensoryVariety) instructions.push('Use sensory detail when it adds information or atmosphere; avoid repeating the same sensory image.');
 if (controls.characterDistinctiveness) instructions.push('Keep each character reaction consistent with their established identity, goals, relationships, and knowledge.');
 if (controls.emotionalContinuity) instructions.push('Preserve the established emotional direction unless the current event gives a grounded reason to change it.');
 if (controls.novelty) instructions.push('Avoid repeating recently used openings, gestures, metaphors, or stock atmospheric phrasing.');
 if (controls.coherence) instructions.push('Keep cause, action, observation, dialogue, and consequence coherent within this turn.');
 if (controls.playerAgency) instructions.push('Describe consequences of the player action without deciding a consequential future choice for the player.');
 instructions.push('Preferred shape: about ' + controls.preferredParagraphs + ' paragraph' + (controls.preferredParagraphs === 1 ? '' : 's') + ', never more than ' + controls.maxParagraphs + ' paragraphs unless a later quality phase explicitly permits it.');
 return instructions;
}

export class NarrativeQualityContractEngine {
 public static readonly DEFAULT_CONTROLS: NarrativeQualityControls = { ...DEFAULT_CONTROLS };
 public static resolve(intent: PlayerIntent, overrides: Partial<NarrativeQualityControls> = {}): NarrativeQualityContract {
  const profile = profileForIntent(intent); const controls: NarrativeQualityControls = { ...DEFAULT_CONTROLS, ...PROFILE_OVERRIDES[profile], ...overrides };
  if (controls.maxParagraphs < controls.preferredParagraphs) controls.maxParagraphs = controls.preferredParagraphs;
  return { version: 1, profile, controls, instructions: controls.enabled ? instructionsFor(profile, controls) : [] };
 }
 public static toPromptContext(contract: NarrativeQualityContract): string {
  if (!contract.controls.enabled) return 'Narrative Quality Contract: disabled for this turn.';
  const enabled = Object.entries(contract.controls).filter(([key, value]) => typeof value === 'boolean' && value === true).map(([key]) => key).join(', ');
  return ['Narrative Quality Contract v' + contract.version, 'Turn profile: ' + contract.profile, 'Enforcement: ' + contract.controls.enforcement, 'Enabled controls: ' + enabled, 'Preferred paragraphs: ' + contract.controls.preferredParagraphs + '; maximum paragraphs: ' + contract.controls.maxParagraphs].join('\n');
 }
 public static countParagraphs(narration: string): number { return String(narration || '').trim().split(/\n\s*\n/).filter(Boolean).length; }
 public static validate(narration: string, contract: NarrativeQualityContract): { valid: boolean; reasons: string[] } {
  if (!contract.controls.enabled) return { valid: true, reasons: [] }; const text = String(narration || '').trim(); const reasons: string[] = [];
  if (!text) reasons.push('Narrative output is empty.'); const paragraphs = this.countParagraphs(text);
  if (paragraphs > contract.controls.maxParagraphs) reasons.push('Narration has ' + paragraphs + ' paragraphs; maximum is ' + contract.controls.maxParagraphs + '.');
  return { valid: reasons.length === 0, reasons };
 }
}