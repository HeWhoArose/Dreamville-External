import type { CurrentSituation } from './currentSituation';
import type { PlayerIntent, IntentEntityReference } from './playerIntentInterpreter';
import type { NarrativeResearchResult } from './narrativeResearchPipeline';
import type { WorldRepository } from '../repositories/worldRepository';
import { buildNpcPlanningSlice } from './npcPlanningSlice';
import { NpcExpressiveIdentityEngine, type NpcExpressiveIdentity } from './npcExpressiveIdentity';

export interface InformationReveal {
	topic: string;
	sourceBlockIds: string[];
	presentation: 'FACT' | 'RUMOR' | 'UNCERTAIN' | 'NO_RELIABLE_ANSWER';
	requirement: 'REVEAL' | 'PRESERVE_UNCERTAINTY';
}


export interface NpcCognitionContract {
	actorId: string;
	name: string;
	currentActivity?: string;
	immediateGoal?: string;
	desires: string[];
	fears: string[];
	traits: string[];
	values: string[];
	dialogueStyle?: string;
	expressiveIdentity: NpcExpressiveIdentity;
	relationshipStance?: string;
	relationshipMetrics?: { trust: number; affection: number; respect: number; fear: number; hostility: number };
	activeBeliefSummaries: string[];
	relevantMemorySummaries: string[];
	motivatedAction?: string;
	privateKnowledgeBoundary: string;
	presentationRules: string[];
}

function buildNpcCognitionContract(repository: WorldRepository, storyId: string, situation: CurrentSituation, target: IntentEntityReference): NpcCognitionContract | undefined {
	const actor = situation.nearbyEntities.find((entity) => entity.id === target.id);
	if (!actor) return undefined;
	const agency = repository.getDynamicCharacterAgencyEngine(storyId);
	const profile = agency.getCharacter(storyId, actor.id);
	const relationship = agency.getRelationship(storyId, situation.player.actorId, actor.id);
	const npcSlice = buildNpcPlanningSlice(repository, storyId, situation.player.actorId, situation, actor.id);
	const memories = (npcSlice?.recentMemories || []).slice(0, 8).map((memory) => memory.content);
	const authorizedKnowledge = (npcSlice?.authorizedKnowledge || []).slice(0, 6).map((fact: any) => String(fact.summary || fact.description || fact.predicate || '')) .filter(Boolean);
	return {
		actorId: actor.id,
		name: actor.name,
		currentActivity: npcSlice?.currentActivity || actor.currentActivity,
		immediateGoal: profile?.canonicalGoal || npcSlice?.immediateGoal,
		desires: (profile?.desires || []).slice(0, 5),
		fears: (profile?.fears || []).slice(0, 5),
		traits: (profile?.traits || []).slice(0, 6),
		values: (profile?.values || []).slice(0, 6),
		dialogueStyle: profile?.dialogueStyle,
		expressiveIdentity,
		relationshipStance: relationship?.stance,
		relationshipMetrics: relationship ? { trust: relationship.trust, affection: relationship.affection, respect: relationship.respect, fear: relationship.fear, hostility: relationship.hostility } : undefined,
		activeBeliefSummaries: authorizedKnowledge.slice(0, 6),
		relevantMemorySummaries: memories,
		motivatedAction: profile?.goals.find((goal) => goal.goalId === profile.currentGoalId && goal.active)?.description,
		privateKnowledgeBoundary: npcSlice?.knowledgeBoundary || 'Private NPC knowledge must never be presented as player-visible fact.',
		presentationRules: [
			'Express personality through observable behavior, word choice, hesitation, priorities, and reactions rather than exposing private thoughts.',
			'NPC goals and fears influence responses but never override canonical outcomes or player agency.',
			'Use only authorized NPC knowledge; do not transfer player knowledge into NPC behavior.',
			'Preserve relationship stance without inventing a relationship change.',
		],
	};
}

export interface ExpectedStateEffect {
	kind: string;
	description: string;
	required: boolean;
}

export interface EphemeralNarrativePlan {
	npcCognition?: NpcCognitionContract[];
	turnId: string;
	objective: string;
	immediateSteps: string[];
	informationToReveal: InformationReveal[];
	entitiesToReact: IntentEntityReference[];
	unresolvedThread?: string;
	continuityRequirements: string[];
	forbiddenAssumptions: string[];
	stateEffectsExpected: ExpectedStateEffect[];
	sceneComposition?: import('./sceneComposition').SceneCompositionContract;
	createdAt: string;
	expiresAfterNarration: true;
}

function clean(value: unknown): string {
	return String(value ?? '').trim();
}

function entityTargets(situation: CurrentSituation, intent: PlayerIntent): IntentEntityReference[] {
	const refs: IntentEntityReference[] = [];
	for (const ref of [...(intent.explicitTargets || []), ...(intent.target ? [intent.target] : []), ...(intent.impliedTargets || [])]) {
		if (!ref?.name) continue;
		if (refs.some((item) => (item.id && ref.id && item.id === ref.id) || item.name.toLowerCase() === ref.name.toLowerCase())) continue;
		refs.push(ref);
	}
	if (refs.length > 0) return refs.slice(0, 4);
	const informationSeeking =
		Boolean(intent.informationGoal) ||
		intent.interactionMode === 'INFORMATION_SEEKING' ||
		intent.interactionMode === 'PASSIVE_OBSERVATION';
	if (informationSeeking && situation.activeDialogue) {
		return [{
			id: situation.activeDialogue.speakerId,
			name: situation.activeDialogue.speakerName,
			kind: 'NPC',
			source: 'IMPLIED' as const,
		}];
	}
	return [];
}

function informationReveals(intent: PlayerIntent, research: NarrativeResearchResult): InformationReveal[] {
	if (!intent.informationGoal && intent.interactionMode !== 'PASSIVE_OBSERVATION') return [];
	const goalTokens = clean(intent.informationGoal || intent.originalText).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4);
	const selected = research.blocks
		.filter((block) => block.kind === 'SCENE' || block.kind === 'KNOWLEDGE' || block.kind === 'MEMORY' || block.kind === 'THREAD')
		.map((block) => {
			const haystack = (block.content + ' ' + block.reason).toLowerCase();
			const overlap = goalTokens.filter((token) => haystack.includes(token)).length;
			return { block, overlap };
		})
		.sort((a, b) => (b.overlap - a.overlap) || (b.block.relevanceScore - a.block.relevanceScore))
		.slice(0, 3);
	if (selected.length === 0) {
		return [{
			topic: intent.informationGoal || 'the requested information',
			sourceBlockIds: [],
			presentation: 'NO_RELIABLE_ANSWER',
			requirement: 'PRESERVE_UNCERTAINTY',
		}];
	}
	return selected.map(({ block }) => ({
		topic: intent.informationGoal || 'the current information goal',
		sourceBlockIds: [block.id],
		presentation: block.kind === 'MEMORY' || /rumou?r|hearsay|whisper|gossip/i.test(block.content) ? 'RUMOR' : block.kind === 'KNOWLEDGE' ? 'FACT' : 'UNCERTAIN',
		requirement: block.kind === 'KNOWLEDGE' ? 'REVEAL' : 'PRESERVE_UNCERTAINTY',
	}));
}

function topThread(research: NarrativeResearchResult): string | undefined {
	return research.blocks.filter((block) => block.kind === 'THREAD').sort((a, b) => b.relevanceScore - a.relevanceScore)[0]?.content;
}

export class NarrativeDirector {
	public static create(params: { repository?: WorldRepository; storyId?: string; situation: CurrentSituation; intent: PlayerIntent; research: NarrativeResearchResult }): EphemeralNarrativePlan {
		const situation = params.situation;
		const intent = params.intent;
		const research = params.research;
		const npcCognition: NpcCognitionContract[] = params.repository && params.storyId
			? entityTargets(situation, intent).map((target) => buildNpcCognitionContract(params.repository!, params.storyId!, situation, target)).filter((value): value is NpcCognitionContract => Boolean(value)).slice(0, 4)
			: [];
		const isInformationSeeking = Boolean(intent.informationGoal) || intent.interactionMode === 'INFORMATION_SEEKING';
		const steps: string[] = [];
		if (intent.movementIntent) steps.push(intent.action === 'approach_and_listen' ? 'Move the protagonist physically closer to the relevant source while preserving the stated passive intent.' : 'Resolve the requested movement or positional change before any secondary observation or interaction.');
		if (intent.observationIntent) steps.push('Describe only observations the protagonist can perceive from the supplied current scene and research.');
		if (intent.speechIntent) steps.push('Allow only the communication explicitly requested by the player; do not expand it into additional player dialogue.');
		if (intent.interactionMode === 'COMBAT') steps.push('Depict the combat attempt and immediate observable response; do not invent a successful outcome without canonical adjudication.');
		if (intent.interactionMode === 'MANIPULATION') steps.push('Resolve the requested item/object interaction only to the extent supported by canonical state and immediate consequences.');
		if (isInformationSeeking) steps.push('Resolve the information-gathering objective using the selected research blocks before adding secondary atmosphere.');
		if (steps.length === 0) steps.push('Depict the player action faithfully, then show only its immediate canon-grounded consequence or observation.');

		const continuityRequirements = [
			'Remain in the canonical location: ' + situation.location.name + '.',
			'Use the canonical world time: ' + situation.worldTime + '.',
			'Treat player intent as the current-turn contract; do not substitute an older action.',
			'Keep hidden or unauthorized world knowledge outside the narration.',
		];
		if (!intent.speechIntent) continuityRequirements.push('Do not create player speech; passive actions must remain passive.');
		if (intent.movementIntent) continuityRequirements.push('Preserve movement as movement; do not replace the positional action with a conversation.');
		if (intent.observationIntent) continuityRequirements.push('Preserve observation/listening as observation; do not invent a spoken inquiry.');
		if (intent.informationGoal) continuityRequirements.push('Answer the information goal from selected research or explicitly preserve uncertainty/no-answer.');

		const forbiddenAssumptions = [
			'Do not invent hidden facts, secret locations, unavailable entities, or unsupported causal explanations.',
			'Do not convert rumor, memory, or hearsay into established certainty.',
			'Do not make major future decisions for the player.',
			'Do not create an uncommitted location or world-time change.',
			'Do not introduce unrelated quest beats merely because they exist in campaign history.',
		];

		const stateEffectsExpected: ExpectedStateEffect[] = [];
		if (intent.movementIntent && intent.locationTarget?.id) stateEffectsExpected.push({ kind: 'LOCATION', description: 'Possible movement toward ' + intent.locationTarget.name + '; canonical movement authority must determine whether it actually commits.', required: false });
		if (intent.interactionMode === 'COMBAT') stateEffectsExpected.push({ kind: 'COMBAT', description: 'Combat may require canonical combat adjudication; narration alone cannot commit the outcome.', required: false });
		if (intent.interactionMode === 'MANIPULATION') stateEffectsExpected.push({ kind: 'INVENTORY', description: 'Item/object interaction may affect canonical inventory only when a domain command authorizes it.', required: false });


		return {
			turnId: situation.turnId,
			objective: intent.goal ? intent.goal + ': ' + (intent.informationGoal || intent.action) : "Faithfully resolve the player's " + intent.action + ' in the current scene.',
			immediateSteps: steps.slice(0, 8),
			informationToReveal: informationReveals(intent, research).slice(0, 4),
			entitiesToReact: entityTargets(situation, intent),
			npcCognition: npcCognition,
			unresolvedThread: topThread(research),
			continuityRequirements: continuityRequirements.slice(0, 10),
			forbiddenAssumptions: forbiddenAssumptions.slice(0, 8),
			stateEffectsExpected: stateEffectsExpected.slice(0, 4),
			createdAt: situation.worldTime,
			expiresAfterNarration: true,
		};
	}

	public static toPromptContext(plan: EphemeralNarrativePlan): string {
		return [
			'NARRATIVE DIRECTOR PLAN (EPHEMERAL — USE FOR THIS TURN ONLY)',
			'Objective: ' + plan.objective,
			'Immediate steps:\n' + plan.immediateSteps.map((step, index) => (index + 1) + '. ' + step).join('\n'),
			plan.informationToReveal.length ? 'Information to reveal:\n' + plan.informationToReveal.map((item) => '- ' + item.topic + ' [' + item.presentation + '] [sources=' + (item.sourceBlockIds.join(', ') || 'none') + ']').join('\n') : 'Information to reveal: none.',
			plan.entitiesToReact.length ? 'Entities to react: ' + plan.entitiesToReact.map((entity) => entity.name).join(', ') : 'Entities to react: none specified.',
			plan.npcCognition?.length ? 'NPC cognition contracts:\n' + plan.npcCognition.map((npc) => JSON.stringify(npc)).join('\n') : 'NPC cognition contracts: none.',
			plan.unresolvedThread ? 'Relevant unresolved thread: ' + plan.unresolvedThread : 'Relevant unresolved thread: none.',
			'Continuity requirements:\n- ' + plan.continuityRequirements.join('\n- '),
			'Forbidden assumptions:\n- ' + plan.forbiddenAssumptions.join('\n- '),
			plan.stateEffectsExpected.length ? 'Expected state-effect guidance:\n- ' + plan.stateEffectsExpected.map((effect) => effect.kind + ': ' + effect.description).join('\n- ') : 'Expected state-effect guidance: none.',
		].join('\n');
	}
}