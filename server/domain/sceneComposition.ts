import type { CurrentSituation } from './currentSituation';
import type { PlayerIntent } from './playerIntentInterpreter';
import type { NarrativeContinuityState } from './narrativeContinuityState';
import type { NarrativePacingContract } from './narrativePacingEngine';
import type { InformationReveal } from './narrativeDirector';

export type SceneCompositionBeatType =
	| 'OBSERVATION'
	| 'REACTION'
	| 'DIALOGUE'
	| 'DISCOVERY'
	| 'REVELATION'
	| 'THREAT'
	| 'NEGOTIATION'
	| 'CONFLICT'
	| 'TRANSITION'
	| 'CONSEQUENCE'
	| 'EMOTIONAL_TURN'
	| 'MICRO_ACTION';

export type SceneEmotionalMovement = 'HOLD' | 'RISE' | 'ESCALATE' | 'TURN' | 'RELEASE' | 'STABILIZE';
export type SceneDialogueAct = 'NONE' | 'OPEN' | 'RESPOND' | 'ASK' | 'ANSWER' | 'LISTEN' | 'OBSERVE' | 'NEGOTIATE' | 'PERSUADE' | 'REFUSE' | 'THREATEN';
export type ScenePacingShape = 'MICRO_BEAT' | 'TIGHT_RESPONSE' | 'STANDARD_BEAT' | 'EXPANSIVE_GROUNDING' | 'KINETIC_BEATS' | 'CONSEQUENCE_LANDING';

export interface SceneCompositionContract {
	version: 1;
	turnId: string;
	sceneObjective: string;
	beatType: SceneCompositionBeatType;
	narrativeFocus: string[];
	focalEntityId?: string;
	focalEntityRole?: string;
	emotionalBeat: string;
	emotionalMovement: SceneEmotionalMovement;
	physicalBeat: string;
	sensoryAnchor?: string;
	dialogueAct: SceneDialogueAct;
	subtext: string[];
	reveal: string[];
	withhold: string[];
	reactionPriority: string[];
	tensionDirection: string;
	pacingShape: ScenePacingShape;
	closingBeat: string;
	optionalHook?: string;
	compositionConfidence: number;
	fallbackReason?: string;
	expiresAfterNarration: true;
}

function text(value: unknown): string {
	return String(value ?? '').trim();
}

function firstMeaningfulTarget(intent: PlayerIntent): { id?: string; name?: string } | undefined {
	return (intent.explicitTargets || [])[0] || intent.target || (intent.impliedTargets || [])[0];
}

function beatType(params: { intent: PlayerIntent; informationToReveal: InformationReveal[] }): SceneCompositionBeatType {
	const { intent, informationToReveal } = params;
	if (intent.interactionMode === 'COMBAT') return 'CONFLICT';
	if (intent.interactionMode === 'DIALOGUE' || intent.speechIntent) return 'DIALOGUE';
	if (intent.movementIntent) return 'TRANSITION';
	if (intent.interactionMode === 'MANIPULATION') return 'MICRO_ACTION';
	if (intent.interactionMode === 'INFORMATION_SEEKING') return informationToReveal.some((item) => item.requirement === 'REVEAL') ? 'REVELATION' : 'DISCOVERY';
	if (intent.interactionMode === 'PASSIVE_OBSERVATION' || intent.observationIntent) return 'OBSERVATION';
	if (informationToReveal.some((item) => item.requirement === 'REVEAL')) return 'REVELATION';
	if (informationToReveal.length > 0) return 'DISCOVERY';
	return 'REACTION';
}

function emotionalMovement(continuity?: NarrativeContinuityState): SceneEmotionalMovement {
	const momentum = continuity?.sceneMomentum || 'STEADY';
	if (momentum === 'ESCALATING') return 'ESCALATE';
	if (momentum === 'BUILDING') return 'RISE';
	if (momentum === 'RELEASING') return 'RELEASE';
	if (momentum === 'STALLING') return 'STABILIZE';
	return 'HOLD';
}

function pacingShape(profile: NarrativePacingContract['profile']): ScenePacingShape {
	switch (profile) {
		case 'MICRO': return 'MICRO_BEAT';
		case 'COMPACT': return 'TIGHT_RESPONSE';
		case 'EXPANDED': return 'EXPANSIVE_GROUNDING';
		case 'KINETIC': return 'KINETIC_BEATS';
		case 'CONSEQUENCE': return 'CONSEQUENCE_LANDING';
		default: return 'STANDARD_BEAT';
	}
}

function dialogueAct(intent: PlayerIntent, situation: CurrentSituation): SceneDialogueAct {
	if (intent.interactionMode === 'PASSIVE_OBSERVATION' || intent.observationIntent) return 'OBSERVE';
	if (!intent.speechIntent && intent.interactionMode !== 'DIALOGUE') return 'NONE';
	if (intent.interactionMode !== 'DIALOGUE' && intent.speechIntent) return 'OPEN';
	if (situation.activeDialogue) return intent.informationGoal ? 'ASK' : 'RESPOND';
	return 'OPEN';
}

function focalEntity(situation: CurrentSituation, intent: PlayerIntent, reactionPriority: string[]): { id?: string; role?: string } {
	const target = firstMeaningfulTarget(intent);
	if (target?.id) return { id: target.id, role: 'EXPLICIT_PLAYER_TARGET' };
	if (situation.activeDialogue?.speakerId) return { id: situation.activeDialogue.speakerId, role: 'ACTIVE_DIALOGUE_SPEAKER' };
	if (reactionPriority.length > 0) {
		const entity = situation.nearbyEntities.find((candidate) => candidate.name === reactionPriority[0]);
		if (entity) return { id: entity.id, role: 'PRIMARY_REACTION' };
	}
	return { role: 'PROTAGONIST_ACTION' };
}

export class SceneCompositionEngine {
	public static resolve(params: {
		situation: CurrentSituation;
		intent: PlayerIntent;
		informationToReveal: InformationReveal[];
		entitiesToReact: Array<{ id?: string; name: string }>;
		unresolvedThread?: string;
		continuityState?: NarrativeContinuityState;
		pacingContract: NarrativePacingContract;
	}): SceneCompositionContract {
		const { situation, intent, informationToReveal, entitiesToReact, unresolvedThread, continuityState, pacingContract } = params;
		const reactionPriority = entitiesToReact.map((entity) => text(entity.name)).filter(Boolean).slice(0, 6);
		const focus = [
			intent.informationGoal ? 'Information goal: ' + intent.informationGoal : '',
			intent.action ? 'Player action: ' + intent.action : '',
			reactionPriority.length ? 'Primary reactions: ' + reactionPriority.slice(0, 3).join(', ') : '',
		].filter(Boolean).slice(0, 4);
		const focal = focalEntity(situation, intent, reactionPriority);
		const reveals = informationToReveal.filter((item) => item.requirement === 'REVEAL').map((item) => item.topic).filter(Boolean).slice(0, 4);
		const withhold = informationToReveal.filter((item) => item.requirement !== 'REVEAL').map((item) => item.topic).filter(Boolean).slice(0, 4);
		if (unresolvedThread) withhold.push('Unresolved thread: ' + unresolvedThread);
		const movement = emotionalMovement(continuityState);
		const emotionalBeat = continuityState
			? 'Emotional temperature is ' + continuityState.emotionalTemperature.toLowerCase() + ' with ' + continuityState.sceneMomentum.toLowerCase() + ' scene momentum.'
			: 'No prior continuity state supplied; preserve the current emotional temperature and avoid unsupported escalation.';
		const physicalBeat = intent.movementIntent
			? 'Keep the physical movement visible before secondary description.'
			: intent.interactionMode === 'COMBAT'
				? 'Show the attempted physical action and only the canon-grounded immediate response.'
				: 'Anchor the beat in what physically changes, is observed, or remains still because of the player action.';
		const sensoryAnchor = text(situation.location?.ambientSensory) || undefined;
		const fallbackReason = [
			!continuityState ? 'continuity unavailable' : '',
			!sensoryAnchor ? 'no ambient sensory anchor supplied' : '',
			!reactionPriority.length ? 'no explicit reaction participants supplied' : '',
		].filter(Boolean).join('; ') || undefined;
		const closingBeat = reveals.length
			? 'Land the requested reveal and its immediate observable implication without inventing aftermath.'
			: unresolvedThread
				? 'Close on the immediate consequence while leaving the unresolved thread available without forcing a player choice.'
				: 'Close on the immediate consequence, observation, or response that belongs to this turn.';
		const optionalHook = unresolvedThread ? 'Keep this unresolved thread available as a future possibility; do not force pursuit in the current turn.' : undefined;
		return {
			version: 1,
			turnId: situation.turnId,
			sceneObjective: intent.goal ? intent.goal + ': ' + (intent.informationGoal || intent.action) : 'Faithfully resolve the player action in the current scene.',
			beatType: beatType({ intent, informationToReveal }),
			narrativeFocus: focus.length ? focus : ['Current player action and its immediate scene response.'],
			focalEntityId: focal.id,
			focalEntityRole: focal.role,
			emotionalBeat,
			emotionalMovement: movement,
			physicalBeat,
			sensoryAnchor,
			dialogueAct: dialogueAct(intent, situation),
			subtext: (continuityState?.unresolvedSubtext || []).slice(0, 4),
			reveal: reveals,
			withhold,
			reactionPriority,
			tensionDirection: continuityState?.sceneMomentum || 'STEADY',
			pacingShape: pacingShape(pacingContract.profile),
			closingBeat,
			optionalHook,
			compositionConfidence: 0.92,
			fallbackReason,
			expiresAfterNarration: true,
		};
	}

	public static toPromptContext(contract?: SceneCompositionContract): string {
		if (!contract) return 'N13 SCENE COMPOSITION: unavailable; preserve the Narrative Director Plan and current scene directly.';
		return [
			'N13 SCENE COMPOSITION CONTRACT v' + contract.version + ' (EPHEMERAL — PRESENTATION ONLY)',
			'Scene objective: ' + contract.sceneObjective,
			'Beat type: ' + contract.beatType,
			'Narrative focus: ' + contract.narrativeFocus.join(' | '),
			contract.focalEntityId ? 'Focal entity: ' + contract.focalEntityId + ' (' + (contract.focalEntityRole || 'unspecified') + ')' : 'Focal entity: protagonist/current scene',
			'Emotional beat: ' + contract.emotionalBeat,
			'Emotional movement: ' + contract.emotionalMovement,
			'Physical beat: ' + contract.physicalBeat,
			contract.sensoryAnchor ? 'Sensory anchor: ' + contract.sensoryAnchor : 'Sensory anchor: none supplied; do not invent one.',
			'Dialogue act: ' + contract.dialogueAct,
			contract.subtext.length ? 'Subtext cues: ' + contract.subtext.join(' | ') : 'Subtext cues: none supplied.',
			contract.reveal.length ? 'Reveal: ' + contract.reveal.join(' | ') : 'Reveal: none.',
			contract.withhold.length ? 'Withhold: ' + contract.withhold.join(' | ') : 'Withhold: none.',
			contract.reactionPriority.length ? 'Reaction priority: ' + contract.reactionPriority.join(' > ') : 'Reaction priority: none supplied.',
			'Tension direction: ' + contract.tensionDirection,
			'Pacing shape: ' + contract.pacingShape,
			'Closing beat: ' + contract.closingBeat,
			contract.optionalHook ? 'Optional hook: ' + contract.optionalHook : 'Optional hook: none.',
			'Composition confidence: ' + contract.compositionConfidence.toFixed(2),
			contract.fallbackReason ? 'Fallback reason: ' + contract.fallbackReason : 'Fallback: not required.',
			'Hard boundary: this contract cannot mutate canonical state, decide player choices, reveal hidden facts, or commit an NPC action. It only directs how already-authorized events are presented.',
		].join('\n');
	}
}
