import { CurrentSituationBuilder, type CurrentSituation } from './currentSituation';
import type { PlayerIntent } from './playerIntentInterpreter';
import { NarrativeDirector, type EphemeralNarrativePlan } from './narrativeDirector';
import type { NarrativeResearchResult } from './narrativeResearchPipeline';
import { WorkingContextEngine, type AssembledTurnContext } from './workingContextEngine';
import { EpistemicBoundaryEnforcer } from './epistemicBoundary';
import type { ActionResolution } from './actionResolution';
import { buildActionResolutionPromptContext } from './actionResolution';
import { NarrativeQualityContractEngine, type NarrativeQualityControls, type NarrativeQualityContract } from './narrativeQualityContract';
import { NarratorVoiceEngine, type NarratorVoiceControls, type NarratorVoiceState } from './narratorVoiceEngine';
import { NarrativeContinuityStateEngine, type NarrativeContinuityState } from './narrativeContinuityState';
import { NarrativeNoveltyEngine, type NarrativeNoveltyState } from './narrativeNoveltyEngine';
import { NarrativeProviderHandoffEngine, type NarrativeProviderHandoffContract } from './narrativeProviderHandoff';
import { NarrativePacingEngine, type NarrativePacingContract, type NarrativePacingControls } from './narrativePacingEngine';
import { SceneCompositionEngine, type SceneCompositionContract } from './sceneComposition';
import { EntitySceneRelevanceEngine } from './entitySceneRelevance';
import { NarrativeEpisodeProjectionEngine, type NarrativeEpisodeProjection } from './narrativeEpisodeProjection';
import { StoryBeatDirector, type StoryBeatContract } from './storyBeatDirector';

export interface NarrationPromptInput {
	situation: CurrentSituation;
	intent: PlayerIntent;
	research: NarrativeResearchResult;
	plan: EphemeralNarrativePlan;
	workingContext?: string;
	globalInstruction?: string;
	styleInstruction?: string;
	canonicalOutcome?: string;
	actionResolution?: ActionResolution;
	maxPromptTokens?: number;
	narrativeQualityControls?: Partial<NarrativeQualityControls>;
	narratorVoiceState?: NarratorVoiceState;
	narratorVoiceControls?: NarratorVoiceControls;
	narrativeContinuityState?: NarrativeContinuityState;
	narrativeNoveltyState?: NarrativeNoveltyState;
	narrativePacingContract?: NarrativePacingContract;
	narrativePacingControls?: Partial<NarrativePacingControls>;
	narrativeProviderHandoff?: NarrativeProviderHandoffContract;
	sceneComposition?: SceneCompositionContract;
	episodeProjection?: NarrativeEpisodeProjection;
	storyBeat?: StoryBeatContract;
}

export interface NarrationPromptResult {
	prompt: string;
	styleInstruction: string;
	totalTokens: number;
	narrativeQualityContract: NarrativeQualityContract;
	narratorVoiceState?: NarratorVoiceState;
	narrativeContinuityState?: NarrativeContinuityState;
	narrativePacingContract?: NarrativePacingContract;
	narrativeProviderHandoff?: NarrativeProviderHandoffContract;
	sceneComposition?: SceneCompositionContract;
	episodeProjection?: NarrativeEpisodeProjection;
	storyBeat?: StoryBeatContract;
}

export function projectSupportingWorkingContext(context: AssembledTurnContext): string {
	const duplicateSourceIds = new Set([
		'b1_current_situation',
		'b2_player_intent',
		'b3_narrative_research',
		'b2_narrative_plan',
		'canonical_scene_anchor',
		'current_scene_factual_context',
		'b2_campaign_opening',
	]);
	return context.includedChunks
		.filter((chunk) => {
			if (duplicateSourceIds.has(chunk.id || '')) return false;
			// Phase 5 deliberately excludes broad B3-B5 context here. Research is the
			// curated source for lore, memories, threads, and plot; re-injecting those
			// blocks would bypass Phase 3 relevance selection.
			if (chunk.band === 'B3_CAUSAL_OPPORTUNITY' || chunk.band === 'B4_EPISODIC' || chunk.band === 'B5_SEMANTIC_LORE') return false;
			if (/campaign opening|starting situation|world bible|plot & continuity|narrative plot & plan|unresolved story threads|research: authorized knowledge/i.test(chunk.label)) return false;
			return true;
		})
		.map((chunk) => '[' + chunk.label + ']\n' + chunk.content)
		.join('\n\n') || '[no additional working context]';
}

function buildNarrationSituationContext(situation: CurrentSituation): string {
	const visibleEntities = (Array.isArray(situation.nearbyEntities) ? situation.nearbyEntities : [])
		.filter((entity) => entity.visibleToPlayer)
		.slice(0, 8)
		.map((entity) => entity.name + ' [' + entity.kind + '; ' + entity.distanceBand + ']')
		.join('; ') || 'None';

	const visibleObjects = (Array.isArray(situation.sceneObjects) ? situation.sceneObjects : [])
		.filter((object) => object.visibleToPlayer)
		.slice(0, 20)
		.map((object) => [
			object.name,
			'[' + object.kind + '; ' + object.source + '; interactable=' + String(object.interactable) + ']',
			object.description ? object.description : '',
		].filter(Boolean).join(' '))
		.join('; ') || 'None';

	const recentTurns = (Array.isArray(situation.recentTurns) ? situation.recentTurns : [])
		.slice(-2)
		.map((turn) => [
			turn.playerAction ? 'Player: ' + turn.playerAction : '',
			turn.narration ? 'Narration: ' + turn.narration : '',
			turn.unresolvedConsequence ? 'Unresolved consequence: ' + turn.unresolvedConsequence : '',
		].filter(Boolean).join(' | '))
		.join('\n') || 'No recent turns.';

	return [
		'CURRENT SCENE — bounded presentation view',
		'World: ' + (situation.worldId || 'Unknown World'),
		'Time: ' + (situation.worldTime || 'Unknown Time'),
		'Location: ' + (situation.location?.name || 'Unknown Location') + ' (' + (situation.location?.id || 'unknown') + ')',
		'Region: ' + (situation.location?.regionId || 'Unknown Region'),
		'Location description: ' + (situation.location?.description || ''),
		situation.location?.ambientSensory ? 'Ambient: ' + situation.location.ambientSensory : '',
		'Visible entities: ' + visibleEntities,
		'Canonical visible scene objects: ' + visibleObjects,
		'Canonical location occupancy: ' + JSON.stringify(situation.sceneEvidence?.occupancy || { status: 'UNKNOWN', accessControlled: false, provenance: 'UNKNOWN' }),
		'Occupancy rule: UNKNOWN does not mean ABANDONED. Do not assert a location is empty, deserted, evacuated, or populated unless canonical occupancy, visible entities, sensory evidence, or a committed event supports that claim. If occupancy is unknown, preserve uncertainty and let observation/search actions investigate.',
		'Canonical scene structures/features: ' + ((situation.sceneEvidence?.structures || []).join('; ') || 'None explicitly registered.'),
		'Canonical visible scene entities/events are authoritative; do not infer additional concrete people, structures, props, or environmental features from descriptive prose.',
		'Scene-grounding rule: only treat a discrete physical object as present when it appears in canonical visible scene objects or another explicitly supplied authoritative fact. Location prose is environmental description and does not create discrete objects.',
		situation.activeDialogue ? 'Active dialogue: ' + situation.activeDialogue.speakerName + ': ' + situation.activeDialogue.text : '',
		'Current action: ' + (situation.currentAction?.originalText || situation.currentAction?.action || 'None'),
		'Plot arc: ' + (situation.plot?.currentArc || 'OPENING'),
		situation.plot?.summary ? 'Plot summary: ' + situation.plot.summary : '',
		situation.plot?.recentSceneSummaries && situation.plot.recentSceneSummaries.length > 0
			? 'Recent scene summaries:\n' + situation.plot.recentSceneSummaries.map((summary) => '- ' + summary).join('\n')
			: '',
		'Recent turns:\n' + recentTurns,
		'Active conditions: ' + ((Array.isArray(situation.activeConditions) ? situation.activeConditions : []).map((condition) => condition.label).join('; ') || 'None'),
		'Available interactions: ' + ((Array.isArray(situation.availableInteractions) ? situation.availableInteractions : []).filter((interaction) => interaction.enabled).slice(0, 8).map((interaction) => interaction.label).join('; ') || 'None'),
		'Knowledge boundary: research below is the curated source for lore, memories, and unresolved threads; omitted context is not permission to invent facts.',
	].filter(Boolean).join('\n');
}

export function defaultNarrationStyle(): string {
	return [
		'Write immersive tabletop-RPG narration for the latest player action.',
		'Show the immediate canonical consequence; never choose a major future action for the player.',
		'Prioritize action, NPC behavior/dialogue, useful information, and consequence. Atmosphere is optional.',
		'Avoid repeating sensory/location details unless newly relevant, changed, actionable, or a clue.',
		'For search/observation/preparation, lead with visible people, objects, resources, work, exits, and obstacles; briefly say when none are evident.',
		'Keep leads as leads. Never invent board contents, jobs, prices, rules, rewards, object details, or location contents without canonical evidence.',
		'For questions, give grounded knowledge from present NPCs or state the limit; do not pad with scenery.',
		'Invent no unsupported entities, objects, abilities, locations, causes, secrets, or certainty. Player-visible context bounds what may be revealed.',
		'Do not turn attempts into success/failure without a canonical outcome.',
		'Listening, watching, observing, overhearing, or eavesdropping without speech must not make the player speak. Preserve both movement and observation when combined.',
		'Keep rumor/hearsay uncertain and stay in the canonical scene/time unless supplied state confirms a change.',
		'Do not expose research or engine terminology. Follow this turn’s Narrative Quality Contract for length.',
	].join(' ');
}

function section(title: string, body: string): string {
	const normalized = String(body || '').trim();
	return normalized ? title + '\n' + normalized : title + '\n[none]';
}

function truncatePromptSection(value: string, maxChars: number): string {
	const normalized = String(value || '').trim();
	return normalized.length > maxChars
		? normalized.slice(0, maxChars - 1).trimEnd() + '…'
		: normalized;
}

/**
 * S-4 boundary-aware truncation for the working context: cut at the last sentence/clause
 * boundary (or word boundary) within a small window of the limit, so shed context never
 * ends mid-sentence, while retaining as much content as possible.
 */
function truncateWorkingContextAtBoundary(value: string, maxChars: number): string {
	const normalized = String(value || '').trim();
	if (normalized.length <= maxChars) return normalized;
	const budget = Math.max(1, maxChars - 1);
	const head = normalized.slice(0, budget);
	const windowStart = Math.max(0, head.length - 48);
	let cut = -1;
	for (let index = head.length - 1; index >= windowStart; index -= 1) {
		const char = head[index];
		if (char === '\n' || char === '.' || char === '!' || char === '?' || char === ';') { cut = index + 1; break; }
	}
	if (cut === -1) {
		const lastSpace = head.lastIndexOf(' ');
		cut = lastSpace > windowStart ? lastSpace : head.length;
	}
	return head.slice(0, cut).trimEnd() + '…';
}

/** Low-priority sections whose bodies may be dropped (never the authoritative content). */
const PROMPT_SHED_ORDER = [
	'SUPPORTING WORKING CONTEXT',
	'NARRATIVE DIRECTOR PLAN',
	'N17 NARRATIVE EPISODE PROJECTION',
	'N13 SCENE COMPOSITION',
	'N15 SOCIAL ATTENTION / CONVERSATION TOPOLOGY',
	'ADAPTIVE PACING CONTRACT',
	'PROVIDER HANDOFF CONTRACT',
	'NARRATIVE NOVELTY / REPETITION CONTROL',
];

/** Sections that may be shortened but are never dropped (scene / intent / resolution / research / format). */
const PROMPT_PROTECTED_HEADERS = [
	'GLOBAL NARRATION INSTRUCTIONS',
	'OUTPUT CONTRACT',
	'CURRENT SITUATION',
	'PLAYER INTENT',
	'ACTION RESOLUTION — AUTHORITATIVE',
	'NARRATIVE RESEARCH',
	'SESSION ESSENCE',
];

/** Sections whose bodies are the first candidates for proportional shortening. */
const PROMPT_REDUCIBLE_HEADERS = [
	'NARRATIVE STYLE',
	'NARRATIVE QUALITY CONTRACT',
	'ADAPTIVE PACING CONTRACT',
	'PROVIDER HANDOFF CONTRACT',
	'NARRATIVE CONTINUITY STATE',
	'NARRATIVE NOVELTY / REPETITION CONTROL',
	'NARRATIVE DIRECTOR PLAN',
	'N13 SCENE COMPOSITION',
	'N15 SOCIAL ATTENTION / CONVERSATION TOPOLOGY',
	'N17 NARRATIVE EPISODE PROJECTION',
	'CURRENT STORY BEAT — MEANINGFUL TURN CONTRACT',
	'CURRENT STORY BEAT',
	'SUPPORTING WORKING CONTEXT',
	'SESSION ESSENCE',
];

/**
 * S-4 budget reduction: the caller's budget is never knowingly blown by *expendable*
 * material. Bodies are shortened largest-first, then low-priority sections are dropped;
 * the authoritative scene / intent / resolution, research, session essence, and output
 * contract are always preserved, and prose is never cut mid-sentence.
 */
function enforceHardPromptBudget(prompt: string, maxPromptTokens: number): string {
	let working = prompt;
	const tokens = () => WorkingContextEngine.estimateTokens(working);
	if (tokens() <= maxPromptTokens) return working;
	const bodyRange = (header: string): { start: number; end: number } | null => {
		const index = working.indexOf(header);
		if (index < 0) return null;
		const lineStart = working.indexOf('\n', index);
		if (lineStart < 0) return null;
		const next = working.indexOf('\n\n', lineStart);
		return { start: lineStart + 1, end: next < 0 ? working.length : next };
	};
	// Pass 1: proportionally shorten the largest expendable bodies.
	for (let pass = 0; pass < 24 && tokens() > maxPromptTokens; pass += 1) {
		let best: { header: string; start: number; end: number } | null = null;
		let bestLength = 0;
		for (const header of PROMPT_REDUCIBLE_HEADERS) {
			const range = bodyRange(header);
			if (!range) continue;
			const length = range.end - range.start;
			if (length > bestLength) { bestLength = length; best = { header, start: range.start, end: range.end }; }
		}
		if (!best || bestLength <= 60) break;
		const body = working.slice(best.start, best.end);
		const bodyBudget = Math.max(40, Math.floor(body.length * 0.6));
		if (bodyBudget >= body.length) break;
		working = working.slice(0, best.start) + truncateWorkingContextAtBoundary(body, bodyBudget) + working.slice(best.end);
	}
	// Pass 2: drop low-priority sections entirely (never a protected header).
	for (const header of PROMPT_SHED_ORDER) {
		if (tokens() <= maxPromptTokens) break;
		if (PROMPT_PROTECTED_HEADERS.includes(header)) continue;
		const range = bodyRange(header);
		if (!range) continue;
		working = working.slice(0, range.start) + '[omitted for hard token budget]' + working.slice(range.end);
	}
	return working;
}

function compactRelevantResearch(value: string, maxChars: number, priorities: string[]): string {
	const normalized = String(value || '').trim();
	if (normalized.length <= maxChars) return normalized;
	const segments = normalized
		.split(/\n+|(?<=[.!?])\s+|;\s+/)
		.map((segment) => segment.trim())
		.filter(Boolean);
	const terms = Array.from(new Set(priorities
		.flatMap((priority) => String(priority || '').toLowerCase().split(/[^a-z0-9]+/))
		.filter((term) => term.length >= 4)));
	const ranked = segments.map((segment, index) => ({
		segment,
		index,
		score: terms.reduce((score, term) => score + (segment.toLowerCase().includes(term) ? 1 : 0), 0),
	}));
	const relevant = ranked
		.filter((entry) => entry.score > 0)
		.sort((left, right) => right.score - left.score || left.index - right.index)
		.slice(0, 6)
		.sort((left, right) => left.index - right.index)
		.map((entry) => entry.segment);
	const chosen = Array.from(new Set([...segments.slice(0, 2), ...relevant, ...segments.slice(-1)]));
	const compact = chosen.join('\n');
	return truncatePromptSection(compact || normalized, maxChars);
}

export function buildNarrationPrompt(input: NarrationPromptInput): NarrationPromptResult {
	const boundedResearch = EpistemicBoundaryEnforcer.sanitizeResearch(input.research, input.situation).result;
	const boundedWorkingContext = EpistemicBoundaryEnforcer.sanitizeContext(input.workingContext || '[no additional working context]', input.situation).text;
	const globalInstruction = input.globalInstruction || 'You are the narrative presentation engine for Dreamville. Generate only the player-facing narrative turn. Canonical state, player intent, bounded research, and the ephemeral plan are authoritative inputs; prose is not canonical truth.';
	const styleInstruction = input.styleInstruction || defaultNarrationStyle();
	const situationContext = input.situation ? buildNarrationSituationContext(input.situation) : '[current situation unavailable]';
	const intentContext = JSON.stringify(input.intent);
	const actionResolutionContext = buildActionResolutionPromptContext(input.actionResolution);
	const narrativeContinuityState = input.narrativeContinuityState || NarrativeContinuityStateEngine.defaultState(input.situation.storyId);
	const narrativeNoveltyState = input.narrativeNoveltyState || NarrativeNoveltyEngine.defaultState(input.situation.storyId);
	const narrativeNoveltyContext = NarrativeNoveltyEngine.toPromptContext(narrativeNoveltyState);
	const narrativeContinuityContext = NarrativeContinuityStateEngine.toPromptContext(narrativeContinuityState);
	const narrativeQualityContract = NarrativeQualityContractEngine.resolve(input.intent, input.narrativeQualityControls);
	const narrativePacingContract = input.narrativePacingContract || NarrativePacingEngine.resolve({ situation: input.situation, intent: input.intent, actionResolution: input.actionResolution, canonicalOutcome: input.canonicalOutcome, continuityState: narrativeContinuityState, controls: input.narrativePacingControls });
	const storyBeat = input.storyBeat || input.plan.storyBeat;
	const sceneComposition = input.sceneComposition || SceneCompositionEngine.resolve({ situation: input.situation, intent: input.intent, informationToReveal: input.plan.informationToReveal, entitiesToReact: input.plan.entitiesToReact, unresolvedThread: input.plan.unresolvedThread, continuityState: narrativeContinuityState, pacingContract: narrativePacingContract, storyBeat });
	const presentationPlan: EphemeralNarrativePlan = { ...input.plan, sceneComposition };
	const planContext = NarrativeDirector.toPromptContext(presentationPlan);
	const sceneCompositionContext = SceneCompositionEngine.toPromptContext(sceneComposition);
	const socialTopologyContext = EntitySceneRelevanceEngine.toConversationPromptContext(presentationPlan.socialTopology);
	const episodeProjectionContext = NarrativeEpisodeProjectionEngine.toPromptContext(presentationPlan.episodeProjection);
	const storyBeatContext = StoryBeatDirector.toPromptContext(storyBeat);
	const narrativeProviderHandoff = input.narrativeProviderHandoff || NarrativeProviderHandoffEngine.resolve({ storyId: input.situation.storyId, turnId: input.situation.turnId, voice: input.narratorVoiceState || NarratorVoiceEngine.resolve({ getUserData: () => null, saveUserData: () => undefined }, input.situation.storyId), quality: narrativeQualityContract, pacing: narrativePacingContract, continuity: narrativeContinuityState, novelty: narrativeNoveltyState });
	const narrativeQualityContext = NarrativeQualityContractEngine.toPromptContext(narrativeQualityContract);
	const promptBudgetVoiceContext = input.narratorVoiceState ? NarratorVoiceEngine.toPromptContext(input.narratorVoiceState) : 'Narrator Voice Contract: disabled for this turn.';
	const promptBudgetQualityContext = input.maxPromptTokens && input.maxPromptTokens <= 1500
		? 'N1 profile=' + narrativeQualityContract.profile + '; enforcement=' + narrativeQualityContract.controls.enforcement + '; preferred paragraphs=' + narrativeQualityContract.controls.preferredParagraphs + '; max paragraphs=' + narrativeQualityContract.controls.maxParagraphs + '; preserve scene grounding, specificity, pacing, novelty, character voice, emotional continuity, coherence, and player agency.'
		: narrativeQualityContext;
	const canonicalConstraints = [
		'CANONICAL CURRENT SCENE ANCHOR:',
		'Canonical constraints:',
		'- The current location and time in Current Situation are authoritative.',
		'- Stay in the canonical current location unless the canonical game state has already committed a location change.',
		'- Player Intent is the semantic description of what the player meant to attempt.',
		'- The structured Action Resolution is authoritative for mechanics, outcome tier, effects, and consequences; never reconstruct hidden mechanics from prose.',
		'- Research is bounded evidence. Omitted or excluded information is not permission to invent it.',
		'- Do not invent unsupported entities or unsupported objects without canonical evidence.',
		'- Use entity names exactly as spelled in Current Situation and Visible entities; never respell, abbreviate, or rename them.',
		'- Preserve rumor, hearsay, memory, and uncertainty as uncertainty.',
		'- The Narrative Director Plan is ephemeral guidance for this turn only; it does not create canonical state.',
		'- State changes must come from canonical engines/commands, not from prose.',
		'- If the player listens, watches, observes, overhears, or eavesdrops without explicit speech, do not make the player speak, ask, shout, answer, or call out.',
		input.canonicalOutcome ? '- A canonical outcome has already been resolved: ' + input.canonicalOutcome : '- No canonical mechanical outcome is supplied; describe the attempt and observable response without resolving hidden mechanics.',
	].join('\n');
	const outputContract = [
		'Return ONLY valid JSON in the existing StructuredTurnPackage shape:',
		'{"narrative":["..."],"dialogue":[{"speaker":"...","text":"..."}],"events":["..."],"stateChanges":[],"memoryCandidates":["..."],"audioCues":["..."],"visualCues":["..."]}',
		'Narrative should contain only the player-facing prose for this turn.',
		'Do not include markdown fences, commentary, analysis, implementation details, model names, or debug information.',
	].join('\n');

	const topOpenThread =
		(typeof input.plan?.unresolvedThread === 'string' && input.plan.unresolvedThread) ||
		(Array.isArray(input.situation.openThreads) && input.situation.openThreads[0] ? String((input.situation.openThreads[0] as any).title || input.situation.openThreads[0]) : '') ||
		'';
	// S-4: preserve a compact session essence under tight budgets instead of a terse one-liner.
	const sessionEssence = [
		'Session essence:',
		'Location=' + (input.situation.location?.name || 'Unknown Location'),
		'Goal=' + (input.plan?.objective || input.intent?.informationGoal || input.intent?.originalText || 'Continue the current story arc.'),
		topOpenThread ? 'Open thread=' + String(topOpenThread).slice(0, 160) : '',
	].filter(Boolean).join(' ');

	const compose = (
		researchContext: string,
		workingContext: string,
		overrides?: Partial<{
			globalInstruction: string;
			styleInstruction: string;
			situationContext: string;
			intentContext: string;
			planContext: string;
			sceneCompositionContext: string;
			socialTopologyContext: string;
			episodeProjectionContext: string;
			storyBeatContext: string;
			canonicalConstraints: string;
			outputContract: string;
			sessionEssence: string;
		}>,
	): string => [
		section('GLOBAL NARRATION INSTRUCTIONS', overrides?.globalInstruction || globalInstruction),
		section('NARRATIVE STYLE', overrides?.styleInstruction || styleInstruction),
		section('NARRATOR VOICE CONTRACT', promptBudgetVoiceContext),
		section('NARRATIVE CONTINUITY STATE', narrativeContinuityContext),
		section('NARRATIVE NOVELTY / REPETITION CONTROL', narrativeNoveltyContext),
		section('NARRATIVE QUALITY CONTRACT', promptBudgetQualityContext),
		section('ADAPTIVE PACING CONTRACT', NarrativePacingEngine.toPromptContext(narrativePacingContract)),
		section('PROVIDER HANDOFF CONTRACT', NarrativeProviderHandoffEngine.toPromptContext(narrativeProviderHandoff)),
		section('NARRATIVE RESEARCH', researchContext),
		section('CURRENT STORY BEAT — MEANINGFUL TURN CONTRACT', overrides?.storyBeatContext || storyBeatContext),
		section('NARRATIVE DIRECTOR PLAN', overrides?.planContext || planContext),
		section('N13 SCENE COMPOSITION', overrides?.sceneCompositionContext || sceneCompositionContext),
		section('N15 SOCIAL ATTENTION / CONVERSATION TOPOLOGY', overrides?.socialTopologyContext || socialTopologyContext),
		section('N17 NARRATIVE EPISODE PROJECTION', overrides?.episodeProjectionContext || episodeProjectionContext),
		section('NPC COGNITION BOUNDARY', 'NPC cognition is presentation guidance. Private beliefs, secrets, and knowledge must never be stated as player-visible facts unless independently authorized by research or canonical scene evidence. Express cognition through observable behavior, dialogue, hesitation, priorities, and reactions.'),
		section('SUPPORTING WORKING CONTEXT', workingContext),
		section('SESSION ESSENCE', overrides?.sessionEssence || sessionEssence),
		overrides?.canonicalConstraints || canonicalConstraints,
		// S-4: the authoritative scene / intent / resolution sit nearest the generation point.
		section('CURRENT SITUATION', overrides?.situationContext || situationContext),
		section('PLAYER INTENT', overrides?.intentContext || intentContext),
		section('ACTION RESOLUTION — AUTHORITATIVE', actionResolutionContext),
		section('OUTPUT CONTRACT', overrides?.outputContract || outputContract),
	].join('\n\n');

	const initialResearch = boundedResearch.promptContext || '[research unavailable; use current situation only and preserve uncertainty]';
	const initialWorking = boundedWorkingContext || '[no additional working context]';
	const maxPromptTokens = input.maxPromptTokens;
	if (!maxPromptTokens) {
		const prompt = compose(initialResearch, initialWorking);
		return { prompt, styleInstruction: [styleInstruction, narrativeProviderHandoff.providerIndependentInstruction].join('\n\n'), totalTokens: WorkingContextEngine.estimateTokens(prompt), narrativeQualityContract, narratorVoiceState: input.narratorVoiceState, narrativeContinuityState, narrativePacingContract, narrativeProviderHandoff, sceneComposition, episodeProjection: presentationPlan.episodeProjection, storyBeat };

	}

	let researchContext = initialResearch;
	let workingContext = initialWorking;
	let prompt = compose(researchContext, workingContext);
	let totalTokens = WorkingContextEngine.estimateTokens(prompt);

	// Preserve the high-value sections and deterministically shed supporting material first.
	// The final prompt must not knowingly exceed the requested budget.
	for (let pass = 0; pass < 12 && totalTokens > maxPromptTokens; pass += 1) {
		const excessChars = Math.max(400, (totalTokens - maxPromptTokens) * 4);
		if (workingContext.length > 700) {
			workingContext = truncateWorkingContextAtBoundary(workingContext, Math.max(350, workingContext.length - excessChars));
		} else if (researchContext.length > 900) {
			researchContext = truncateWorkingContextAtBoundary(researchContext, Math.max(600, researchContext.length - excessChars));
		} else {
			break;
		}
		prompt = compose(researchContext, workingContext);
		totalTokens = WorkingContextEngine.estimateTokens(prompt);
	}

	// Final compact mode: keep the semantic contract intact while reducing lower-priority prose.
	if (totalTokens > maxPromptTokens) {
		if (maxPromptTokens < 600) {
			const microGlobal = 'Generate only the player-facing narrative. Preserve player agency and canonical truth. Never make major future decisions for the player.';
			const microVoice = input.narratorVoiceState ? truncatePromptSection(NarratorVoiceEngine.compactPromptContext(input.narratorVoiceState), 420) : 'N2 voice disabled.';
			const microQuality = truncatePromptSection(promptBudgetQualityContext, 420);
			const microContinuity = truncatePromptSection(NarrativeContinuityStateEngine.compactPromptContext(narrativeContinuityState), 420);
			const microNovelty = truncatePromptSection(NarrativeNoveltyEngine.compactPromptContext(narrativeNoveltyState), 420);
			const microSituation = truncatePromptSection(situationContext, 360);
			const microIntent = truncatePromptSection(intentContext, 180);
			const microResolution = truncatePromptSection(actionResolutionContext, 620);
			const microResearch = truncatePromptSection(initialResearch, 220);
			const microPlan = truncatePromptSection(planContext, 180);
			const microComposition = SceneCompositionEngine.toCompactPromptContext(sceneComposition);
			const microSocialTopology = truncatePromptSection(socialTopologyContext, 420);
			const microEpisodeProjection = truncatePromptSection(NarrativeEpisodeProjectionEngine.toCompactPromptContext(presentationPlan.episodeProjection), 500);
			const microStoryBeat = StoryBeatDirector.toCompactPromptContext(storyBeat);
			const microEssence = truncatePromptSection(sessionEssence, 200);
			const microCanonical = 'The current location and time are authoritative. Stay in the canonical current location unless the canonical game state has already committed a location change. Do not invent unsupported facts or turn rumor into certainty.';
			const microOutput = '{"narrative":["..."],"dialogue":[],"events":[],"stateChanges":[],"memoryCandidates":[],"audioCues":[],"visualCues":[]}';
			const sections = [
				section('GLOBAL NARRATION INSTRUCTIONS', microGlobal),
				section('NARRATOR VOICE CONTRACT', microVoice),
				section('NARRATIVE QUALITY CONTRACT', microQuality),
				section('NARRATIVE CONTINUITY STATE', microContinuity),
				section('NARRATIVE NOVELTY / REPETITION CONTROL', microNovelty),
				section('NARRATIVE RESEARCH', microResearch),
				section('NARRATIVE DIRECTOR PLAN', microPlan),
				section('N13 SCENE COMPOSITION', microComposition),
				section('N15 SOCIAL ATTENTION / CONVERSATION TOPOLOGY', microSocialTopology),
				section('CURRENT STORY BEAT', microStoryBeat),
				section('N17 NARRATIVE EPISODE PROJECTION', microEpisodeProjection),
				section('SESSION ESSENCE', microEssence),
				section('CANONICAL CURRENT SCENE ANCHOR', microCanonical),
				// S-4: authoritative tail nearest the generation point.
				section('CURRENT SITUATION', microSituation),
				section('PLAYER INTENT', microIntent),
				section('ACTION RESOLUTION — AUTHORITATIVE', microResolution),
				section('OUTPUT CONTRACT', 'Return ONLY valid JSON in this shape: ' + microOutput),
			];
			prompt = sections.join('\n\n');
			totalTokens = WorkingContextEngine.estimateTokens(prompt);
			if (totalTokens > maxPromptTokens) {
				const removable = [
					['NARRATIVE RESEARCH\n', microResearch],
					['NARRATIVE DIRECTOR PLAN\n', microPlan],
					['PLAYER INTENT\n', microIntent],
					['CURRENT SITUATION\n', microSituation],
					['N17 NARRATIVE EPISODE PROJECTION\n', microEpisodeProjection],
					['N13 SCENE COMPOSITION\n', microComposition],
					['N15 SOCIAL ATTENTION / CONVERSATION TOPOLOGY\n', microSocialTopology],
				];
				for (const [, value] of removable) {
					if (totalTokens <= maxPromptTokens) break;
					const idx = prompt.indexOf(value);
					if (idx >= 0) {
						prompt = prompt.slice(0, idx) + '[omitted for hard token budget]' + prompt.slice(idx + value.length);
						totalTokens = WorkingContextEngine.estimateTokens(prompt);
					}
				}
			}
			if (totalTokens > maxPromptTokens) {
				// Phase B system-audit (B-FIND-2): this used to blind-slice the prompt by
				// characters (`prompt.slice(0, budgetChars)`). S-4 moved the authoritative
				// CURRENT SITUATION / PLAYER INTENT / ACTION RESOLUTION / OUTPUT CONTRACT to
				// the end of the prompt, so that slice deleted exactly the content the budget
				// must preserve. Reduce expendable sections instead.
				prompt = enforceHardPromptBudget(prompt, maxPromptTokens);
				totalTokens = WorkingContextEngine.estimateTokens(prompt);
			}
		} else if (maxPromptTokens >= 1000) {
			const tightEpisodeBudget = Boolean(presentationPlan.episodeProjection) && maxPromptTokens <= 2000;
			const compact = {
				styleContext: [
					'Prioritize the player action, NPC behavior/dialogue, useful information, and immediate consequence; atmosphere is optional.',
					'Never invent unsupported entities or unsupported objects. Do not invent notice-board contents, jobs, prices, rules, rewards, or unobserved details without canonical evidence.',
					'Preserve rumor, hearsay, memory, and uncertainty as uncertainty. Player-visible context bounds what may be revealed.',
					'For questions, give grounded information or clearly state the limit; do not pad with scenery.',
					'Never choose a major future action for the player or turn an attempt into success/failure without a canonical outcome.',
				].join(' '),
				intentContext: JSON.stringify({
					speechIntent: input.intent.speechIntent,
					observationIntent: input.intent.observationIntent,
					movementIntent: input.intent.movementIntent,
					interactionMode: input.intent.interactionMode,
					informationGoal: input.intent.informationGoal,
					explicitTargets: input.intent.explicitTargets,
					target: input.intent.target,
					locationTarget: input.intent.locationTarget,
					originalText: input.intent.originalText,
				}),
				researchContext: compactRelevantResearch(initialResearch, tightEpisodeBudget ? 180 : 700, [
					input.intent.originalText,
					String(input.intent.informationGoal || ''),
					...(input.plan.informationToReveal || []).map((reveal) => typeof reveal === 'string' ? reveal : reveal.topic),
					...(input.plan.continuityRequirements || []),
					String(input.plan.unresolvedThread || ''),
				]),
				planContext: truncatePromptSection(planContext, tightEpisodeBudget ? 40 : 300),
				sceneCompositionContext: truncatePromptSection(SceneCompositionEngine.toCompactPromptContext(sceneComposition), tightEpisodeBudget ? 160 : 520),
				socialTopologyContext: truncatePromptSection(socialTopologyContext, tightEpisodeBudget ? 160 : 520),
				episodeProjectionContext: truncatePromptSection(NarrativeEpisodeProjectionEngine.toCompactPromptContext(presentationPlan.episodeProjection), tightEpisodeBudget ? 90 : 180),
				storyBeatContext: truncatePromptSection(StoryBeatDirector.toCompactPromptContext(storyBeat), tightEpisodeBudget ? 220 : 520),
				workingContext: truncatePromptSection(initialWorking, tightEpisodeBudget ? 60 : 320),
				situationContext: 'Location: ' + (input.situation.location?.name || 'Unknown Location') + '; Time: ' + (input.situation.worldTime || 'Unknown Time') + '; ' + truncatePromptSection(situationContext, tightEpisodeBudget ? 360 : 900),
				sessionEssence: truncatePromptSection(sessionEssence, tightEpisodeBudget ? 140 : 240),
			};
			const renderCompact = () => compose(
				compact.researchContext,
				compact.workingContext,
				{
					styleInstruction: compact.styleContext,
					situationContext: compact.situationContext,
					intentContext: compact.intentContext,
					planContext: compact.planContext,
					sceneCompositionContext: compact.sceneCompositionContext,
					socialTopologyContext: compact.socialTopologyContext,
					episodeProjectionContext: compact.episodeProjectionContext,
					storyBeatContext: compact.storyBeatContext,
					sessionEssence: compact.sessionEssence,
				},
			);
			prompt = renderCompact();
			totalTokens = WorkingContextEngine.estimateTokens(prompt);
			for (let pass = 0; pass < 48 && totalTokens > maxPromptTokens; pass += 1) {
				const keys: Array<keyof typeof compact> = [
					'workingContext',
					'planContext',
					'situationContext',
					'episodeProjectionContext',
					'storyBeatContext',
					'sceneCompositionContext',
				];
				const key = keys
					.filter((candidate) => compact[candidate].length > (candidate === 'researchContext' ? 300 : 40))
					.sort((a, b) => compact[b].length - compact[a].length)[0];
				if (!key) break;
				compact[key] = truncatePromptSection(
					compact[key],
					Math.max(key === 'researchContext' ? 300 : 40, compact[key].length - Math.max(24, (totalTokens - maxPromptTokens) * 4)),
				);
				prompt = renderCompact();
				totalTokens = WorkingContextEngine.estimateTokens(prompt);
			}
			// Hard-budget recovery sheds supporting context, never the N15 contract/header.
			if (totalTokens > maxPromptTokens) {
				compact.workingContext = '[omitted for hard token budget]';
				compact.planContext = '[plan omitted for hard token budget]';
				prompt = renderCompact();
				totalTokens = WorkingContextEngine.estimateTokens(prompt);
			}
		} else {
			const compactGlobal = 'Generate only the player-facing narrative. Never choose a major future action for the player. The structured Action Resolution is authoritative for mechanics and consequences.';
			const compactStyle = 'Depict the current action and observable response; preserve player agency and canonical truth. Stay in the canonical current location unless the canonical game state has already committed a location change.';
			const compactQuality = truncatePromptSection(promptBudgetQualityContext, 420);
			const compactSituation = truncatePromptSection(situationContext, 520);
			const compactIntent = truncatePromptSection(intentContext, 180);
			const compactResolution = truncatePromptSection(actionResolutionContext, 700);
			const compactResearch = truncatePromptSection(initialResearch, 180);
			const compactPlan = truncatePromptSection(planContext, 140);
			const compactComposition = SceneCompositionEngine.toCompactPromptContext(sceneComposition);
			const compactSocialTopology = truncatePromptSection(socialTopologyContext, 360);
			const compactEpisodeProjection = truncatePromptSection(NarrativeEpisodeProjectionEngine.toCompactPromptContext(presentationPlan.episodeProjection), 420);
			const compactStoryBeat = StoryBeatDirector.toCompactPromptContext(storyBeat);
			const compactCanonical = [
				'State changes must come from canonical engines/commands.',
				'Preserve rumor, hearsay, memory, and uncertainty as uncertainty.',
				'Omitted or excluded information is not permission to invent it.',
				'Stay in the canonical scene unless the canonical game state has already committed a location change.',
			].join(' ');
			const compactOutput = 'Return ONLY valid JSON with narrative, dialogue, events, stateChanges, memoryCandidates, audioCues, and visualCues.';
			prompt = [
				section('GLOBAL NARRATION INSTRUCTIONS', compactGlobal),
				section('NARRATIVE STYLE', compactStyle),
				section('NARRATIVE QUALITY CONTRACT', compactQuality),
				section('NARRATIVE RESEARCH', compactResearch),
				section('NARRATIVE DIRECTOR PLAN', compactPlan),
				section('N13 SCENE COMPOSITION', compactComposition),
				section('N15 SOCIAL ATTENTION / CONVERSATION TOPOLOGY', compactSocialTopology),
				section('CURRENT STORY BEAT', compactStoryBeat),
				section('N17 NARRATIVE EPISODE PROJECTION', compactEpisodeProjection),
				section('SUPPORTING WORKING CONTEXT', '[omitted]'),
				section('SESSION ESSENCE', truncatePromptSection(sessionEssence, 200)),
				compactCanonical,
				// S-4: authoritative tail nearest the generation point.
				section('CURRENT SITUATION', compactSituation),
				section('PLAYER INTENT', compactIntent),
				section('ACTION RESOLUTION — AUTHORITATIVE', compactResolution),
				section('OUTPUT CONTRACT', compactOutput),
			].join('\n\n');
			totalTokens = WorkingContextEngine.estimateTokens(prompt);
		}
	}
	// Final S-4 guarantee: never knowingly exceed the caller's hard budget.
	if (totalTokens > maxPromptTokens) {
		prompt = enforceHardPromptBudget(prompt, maxPromptTokens);
		totalTokens = WorkingContextEngine.estimateTokens(prompt);
	}
	return { prompt, styleInstruction: [styleInstruction, narrativeProviderHandoff.providerIndependentInstruction].join('\n\n'), totalTokens, narrativeQualityContract, narratorVoiceState: input.narratorVoiceState, narrativeContinuityState, narrativePacingContract, narrativeProviderHandoff, sceneComposition, episodeProjection: presentationPlan.episodeProjection };
}

