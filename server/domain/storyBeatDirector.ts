import type { CurrentSituation } from './currentSituation';
import type { PlayerIntent } from './playerIntentInterpreter';
import type { NarrativeResearchResult } from './narrativeResearchPipeline';
import type { ActionResolution } from './actionResolution';

export type StoryBeatType =
	| 'APPROACH'
	| 'DEPARTURE'
	| 'DISCOVERY'
	| 'OBSERVATION'
	| 'INTERACTION'
	| 'DIALOGUE'
	| 'REACTION'
	| 'CONFRONTATION'
	| 'ATTEMPT'
	| 'CONSEQUENCE'
	| 'ESCALATION'
	| 'RESOLUTION'
	| 'TRANSITION'
	| 'AFTERMATH'
	| 'PAUSED';

export interface StoryBeatContract {
	version: 1;
	turnId: string;
	beatType: StoryBeatType;
	primaryAction: string;
	meaningfulChange: string;
	playerVisibleChange: string[];
	newInformation: string[];
	affectedEntityIds: string[];
	reactionOpportunities: string[];
	narrativeFocus: string[];
	causalLink: string;
	unresolvedConsequence?: string;
	continuityAnchors: string[];
	mustMention: string[];
	mustNotInvent: string[];
	evidenceIds: string[];
	confidence: number;
	fallbackReason?: string;
	expiresAfterNarration: true;
}

function text(value: unknown): string {
	return String(value ?? '').trim();
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values.map(text).filter(Boolean)));
}

function lower(value: unknown): string {
	return text(value).toLowerCase();
}

function isMovement(intent: PlayerIntent): boolean {
	return Boolean(intent.movementIntent || intent.action === 'move' || intent.action === 'approach_and_listen');
}

function isQuietAction(intent: PlayerIntent, resolution?: ActionResolution): boolean {
	const action = lower(intent.originalText || intent.action);
	return /^(i\s+)?(?:wait|rest|breathe|stand|sit|pause)\.?$/i.test(action)
		&& !resolution?.playerVisibleConsequences?.length
		&& !resolution?.physicalConsequences?.length;
}

function targetNames(situation: CurrentSituation, intent: PlayerIntent): string[] {
	const refs = [
		...(intent.explicitTargets || []),
		...(intent.target ? [intent.target] : []),
		...(intent.impliedTargets || []),
	];
	return unique(refs.map((ref) => ref.name));
}

function visibleEntityNameById(situation: CurrentSituation, id: string): string | undefined {
	return situation.nearbyEntities.find((entity) => entity.id === id && entity.visibleToPlayer)?.name;
}

function visibleChanges(resolution: Pick<ActionResolution, 'playerVisibleConsequences' | 'physicalConsequences' | 'canonicalStateChanges'>, situation: CurrentSituation): string[] {
	const values = [
		...(resolution.playerVisibleConsequences || []),
		...(resolution.physicalConsequences || []),
	];
	const spatial = resolution.canonicalStateChanges.find((change) => change.kind.toUpperCase() === 'SPATIAL');
	if (spatial) {
		const spatialValue = spatial.value as any;
		const band = text(spatialValue?.localSpatialState?.proximityBand).toLowerCase();
		const focus = text(spatialValue?.localSpatialState?.focusLabel);
		if (band) {
			values.push(
				focus
					? 'The player is now ' + band.replace(/_/g, ' ') + ' relative to ' + focus + '.'
					: 'The player is now positioned ' + band.replace(/_/g, ' ') + ' within the current location.',
			);
		}
	}
	return unique(values).slice(0, 6);
}

function deriveBeatType(intent: PlayerIntent, resolution: ActionResolution | undefined, changes: string[], newInformation: string[]): StoryBeatType {
	const tier = lower(resolution?.outcomeTier);
	if (isQuietAction(intent, resolution)) return 'PAUSED';
	if (tier === 'critical_success' || tier === 'critical_failure' || tier === 'success_with_cost' || tier === 'failure_with_cost') return 'CONSEQUENCE';
	if (intent.speechIntent || intent.interactionMode === 'DIALOGUE') return 'DIALOGUE';
	if (intent.interactionMode === 'COMBAT') return 'CONFRONTATION';
	if (intent.interactionMode === 'INFORMATION_SEEKING' || intent.observationIntent) {
		return newInformation.length ? 'DISCOVERY' : 'OBSERVATION';
	}
	if (isMovement(intent)) {
		return newInformation.length ? 'DISCOVERY' : (changes.length ? 'APPROACH' : 'TRANSITION');
	}
	if (changes.length) return 'CONSEQUENCE';
	if (resolution && resolution.outcomeTier !== 'NO_CHECK') return 'ATTEMPT';
	return 'INTERACTION';
}

export class StoryBeatDirector {
	public static resolve(params: {
		situation: CurrentSituation;
		intent: PlayerIntent;
		actionResolution?: ActionResolution;
		research?: NarrativeResearchResult;
	}): StoryBeatContract {
		const { situation, intent, actionResolution, research } = params;
		const resolutionChanges = visibleChanges(actionResolution || {
			playerVisibleConsequences: [],
			physicalConsequences: [],
			canonicalStateChanges: [],
		}, situation);
		const targets = targetNames(situation, intent);
		const targetIds = unique([
			...(actionResolution?.targetEntityIds || []),
			...(intent.explicitTargets || []).map((target) => target.id || ''),
			...(intent.impliedTargets || []).map((target) => target.id || ''),
		]);
		const groundedTargetNames = unique(targetIds.map((id) => visibleEntityNameById(situation, id) || '').concat(targets));
		const researchChanges = research?.blocks
			.filter((block) => block.kind === 'CONSEQUENCE' || block.kind === 'SCENE' || block.kind === 'ENTITY')
			.slice(0, 4)
			.map((block) => text(block.content))
			.filter(Boolean) || [];
		const newInformation = unique([
			...(intent.observationIntent || intent.informationGoal || intent.interactionMode === 'INFORMATION_SEEKING'
				? (actionResolution?.playerVisibleConsequences || []).filter((value) => /discover|learn|notice|hear|see|reveal|find|report|observe|confirm|unknown|uncertain/i.test(value))
				: []),
			...researchChanges.filter((value) => /discover|learn|notice|hear|see|reveal|find|report|observe|confirm|unknown|uncertain/i.test(value)),
		]).slice(0, 6);
		const affectedEntityIds = unique([
			...(actionResolution?.targetEntityIds || []),
			...targetIds,
		]).slice(0, 8);
		const reactions = unique(
			affectedEntityIds
				.map((id) => visibleEntityNameById(situation, id))
				.filter(Boolean)
				.map((name) => String(name)),
		);
		const beatType = deriveBeatType(intent, actionResolution, resolutionChanges, newInformation);
		const primaryAction = text(actionResolution?.attemptedEffect) || text(intent.originalText) || text(intent.action) || 'current action';
		const meaningfulChange =
			resolutionChanges[0] ||
			(actionResolution?.actualEffect && !/ordinary deterministic world\/narrative action/i.test(actionResolution.actualEffect)
				? text(actionResolution.actualEffect)
				: '') ||
			(newInformation[0] || '') ||
			(isQuietAction(intent, actionResolution)
				? 'No material canonical change is established by this turn.'
				: 'The player attempted the requested action; no additional canonical consequence is established.');
		const playerVisibleChange = unique([
			...resolutionChanges,
			...(actionResolution?.playerVisibleConsequences || []),
		]).slice(0, 6);
		const narrativeFocus = unique([
			meaningfulChange,
			...groundedTargetNames,
			...(situation.openThreads || []).slice(0, 1).map((thread) => 'Active thread: ' + thread.title),
			...(newInformation.length ? ['newly available information'] : []),
			...(intent.observationIntent ? ['what the player can currently perceive'] : []),
			...(intent.movementIntent ? ['the resolved change in position'] : []),
		]).slice(0, 6);
		const continuityAnchors = unique([
			situation.location.name,
			situation.worldTime,
			...groundedTargetNames,
			...(situation.openThreads || []).slice(0, 2).map((thread) => thread.title),
		]).slice(0, 8);
		const mustMention = unique([
			...(groundedTargetNames.length ? groundedTargetNames : []),
			...(playerVisibleChange.length ? [playerVisibleChange[0]] : []),
		]).slice(0, 5);
		const mustNotInvent = [
			'Do not invent a consequence not present in the canonical resolution or authorized current situation.',
			'Do not reveal hidden knowledge, private NPC cognition, or inaccessible entities.',
			'Do not choose a future player action.',
			'Do not create an NPC reaction unless a canonical/visible reaction or authorized scene evidence supports it.',
			'Do not upgrade uncertainty, rumor, memory, or hearsay into fact.',
		];
		if (!actionResolution) {
			mustNotInvent.push('No structured ActionResolution was supplied; treat the action as an attempt and do not infer hidden mechanics.');
		}
		const reactionOpportunities = reactions.length
			? reactions.map((name) => 'Observe only canon-grounded response from ' + name + '.')
			: [];
		const fallbackReason = !actionResolution
			? 'structured ActionResolution unavailable'
			: !resolutionChanges.length && !newInformation.length
				? 'no explicit player-visible consequence or information delta supplied'
				: undefined;
		const confidence = actionResolution
			? (resolutionChanges.length || newInformation.length ? 0.96 : 0.82)
			: 0.62;
		return {
			version: 1,
			turnId: situation.turnId,
			beatType,
			primaryAction,
			meaningfulChange: text(meaningfulChange),
			playerVisibleChange: playerVisibleChange.length ? playerVisibleChange : [text(meaningfulChange)],
			newInformation,
			affectedEntityIds,
			reactionOpportunities,
			narrativeFocus: narrativeFocus.length ? narrativeFocus : ['the player action and its immediate observable result'],
			causalLink: actionResolution
				? 'This beat is derived from the canonical action resolution and the bounded post-resolution situation.'
				: 'This beat is derived from player intent and the bounded current situation because no structured resolution was supplied.',
			unresolvedConsequence: actionResolution?.uncertainty?.length
				? actionResolution.uncertainty.join('; ')
				: undefined,
			continuityAnchors,
			mustMention,
			mustNotInvent,
			evidenceIds: unique(actionResolution?.evidenceIds || []).slice(0, 8),
			confidence,
			fallbackReason,
			expiresAfterNarration: true,
		};
	}

	public static toPromptContext(beat?: StoryBeatContract): string {
		if (!beat) return 'STORY BEAT CONTRACT: unavailable; preserve existing Narrative Director guidance and canonical boundaries.';
		return [
			'STORY BEAT CONTRACT v' + beat.version + ' (EPHEMERAL — PRESENTATION ONLY)',
			'Beat type: ' + beat.beatType,
			'Primary action: ' + beat.primaryAction,
			'Meaningful change: ' + beat.meaningfulChange,
			'Player-visible change: ' + beat.playerVisibleChange.slice(0, 3).join(' | '),
			beat.newInformation.length ? 'New information: ' + beat.newInformation.slice(0, 3).join(' | ') : 'New information: none established.',
			'Narrative focus: ' + beat.narrativeFocus.slice(0, 3).join(' | '),
			beat.reactionOpportunities.length ? 'Reaction opportunities: ' + beat.reactionOpportunities.slice(0, 3).join(' | ') : 'Reaction opportunities: none established.',
			beat.mustMention.length ? 'Must communicate when observable: ' + beat.mustMention.slice(0, 3).join(' | ') : 'Must communicate: no additional mandatory element.',
			'Do not invent: ' + beat.mustNotInvent.slice(0, 4).join(' | '),
			beat.unresolvedConsequence ? 'Unresolved/uncertain consequence: ' + beat.unresolvedConsequence : 'Unresolved consequence: none supplied.',
			'Confidence: ' + beat.confidence.toFixed(2),
		].join('\n');
	}


	public static toCompactPromptContext(beat?: StoryBeatContract): string {
		if (!beat) return 'Story beat unavailable; follow canonical Action Resolution and Narrative Director.';
		return [
			'STORY BEAT: ' + beat.beatType,
			beat.continuityAnchors.length ? 'Continuity anchor: ' + beat.continuityAnchors.slice(-2).join(' | ').slice(0, 120) : '',
			'Meaningful change: ' + beat.meaningfulChange.slice(0, 90),
			'Focus: ' + beat.narrativeFocus.slice(0, 1).join(' | ').slice(0, 80),
			beat.mustMention.length ? 'Visible anchor: ' + beat.mustMention[0].slice(0, 70) : '',
			'No invention: unsupported consequences, hidden facts, NPC actions, and player decisions remain forbidden.',
		].filter(Boolean).join(' ').slice(0, 520);
	}}
