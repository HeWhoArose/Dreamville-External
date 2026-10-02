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
import { NarrativePacingEngine, type NarrativePacingContract, type NarrativePacingControls } from './narrativePacingEngine';

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
	narrativePacingContract?: NarrativePacingContract;
	narrativeNoveltyState?: NarrativeNoveltyState;
	narrativePacingContract?: NarrativePacingContract;
	narrativePacingControls?: Partial<NarrativePacingControls>;
}

export interface NarrationPromptResult {
	prompt: string;
	styleInstruction: string;
	totalTokens: number;
	narrativeQualityContract: NarrativeQualityContract;
	narratorVoiceState?: NarratorVoiceState;
	narrativeContinuityState?: NarrativeContinuityState;
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
		situation.activeDialogue ? 'Active dialogue: ' + situation.activeDialogue.speakerName + ': ' + situation.activeDialogue.text : '',
		'Current action: ' + (situation.currentAction?.originalText || situation.currentAction?.action || 'None'),
		'Plot arc: ' + (situation.plot?.currentArc || 'OPENING'),
		situation.plot?.summary ? 'Plot summary: ' + situation.plot.summary : '',
		'Recent turns:\n' + recentTurns,
		'Active conditions: ' + ((Array.isArray(situation.activeConditions) ? situation.activeConditions : []).map((condition) => condition.label).join('; ') || 'None'),
		'Available interactions: ' + ((Array.isArray(situation.availableInteractions) ? situation.availableInteractions : []).filter((interaction) => interaction.enabled).slice(0, 8).map((interaction) => interaction.label).join('; ') || 'None'),
		'Knowledge boundary: research below is the curated source for lore, memories, and unresolved threads; omitted context is not permission to invent facts.',
	].filter(Boolean).join('\n');
}

export function defaultNarrationStyle(): string {
	return [
		'Write an immersive tabletop-RPG narrator response for the latest player action.',
		'Player agency is authoritative: describe the immediate consequence of what the player chose, but never choose a major future action for the player.',
		'Use concrete current-scene details and useful information before decorative flourish.',
		'Do not invent unsupported entities, objects, abilities, locations, causes, secrets, or certainty.',
		'Do not reveal canonical world facts unless they are supported by the supplied player-visible context.',
		'Do not turn an attempt into a confirmed success or failure unless a canonical outcome is supplied.',
		'If the player listens, watches, observes, overhears, or eavesdrops without explicit speech, do not make the player speak, ask, shout, answer, or call out.',
		'If movement and observation are combined, preserve both parts of the action.',
		'Preserve rumor, hearsay, memory, and uncertainty as uncertainty; do not upgrade them to established fact.',
		'Remain in the canonical scene and world time unless the supplied canonical state explicitly says they changed. The canonical game state has already committed a location change only when the supplied Current Situation reflects that change.',
		'Do not dump research or internal engine terminology into the player-facing narration.',
		'Response length is governed by the Narrative Quality Contract for this turn; do not force a universal paragraph count.',
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

export function buildNarrationPrompt(input: NarrationPromptInput): NarrationPromptResult {
	const boundedResearch = EpistemicBoundaryEnforcer.sanitizeResearch(input.research, input.situation).result;
	const boundedWorkingContext = EpistemicBoundaryEnforcer.sanitizeContext(input.workingContext || '[no additional working context]', input.situation).text;
	const globalInstruction = input.globalInstruction || 'You are the narrative presentation engine for Dreamville. Generate only the player-facing narrative turn. Canonical state, player intent, bounded research, and the ephemeral plan are authoritative inputs; prose is not canonical truth.';
	const styleInstruction = input.styleInstruction || defaultNarrationStyle();
	const situationContext = input.situation ? buildNarrationSituationContext(input.situation) : '[current situation unavailable]';
	const intentContext = JSON.stringify(input.intent);
	const planContext = NarrativeDirector.toPromptContext(input.plan);
	const actionResolutionContext = buildActionResolutionPromptContext(input.actionResolution);
	const narrativeContinuityState = input.narrativeContinuityState || NarrativeContinuityStateEngine.defaultState(input.situation.storyId);
	const narrativeNoveltyState = input.narrativeNoveltyState || NarrativeNoveltyEngine.defaultState(input.situation.storyId);
	const narrativeNoveltyContext = NarrativeNoveltyEngine.toPromptContext(narrativeNoveltyState);
	const narrativeContinuityContext = NarrativeContinuityStateEngine.toPromptContext(narrativeContinuityState);
	const narrativeQualityContract = NarrativeQualityContractEngine.resolve(input.intent, input.narrativeQualityControls);
	const narrativePacingContract = input.narrativePacingContract || NarrativePacingEngine.resolve({ situation: input.situation, intent: input.intent, actionResolution: input.actionResolution, canonicalOutcome: input.canonicalOutcome, continuityState: narrativeContinuityState, controls: input.narrativePacingControls });
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

	const compose = (
		researchContext: string,
		workingContext: string,
		overrides?: Partial<{
			globalInstruction: string;
			styleInstruction: string;
			situationContext: string;
			intentContext: string;
			planContext: string;
			canonicalConstraints: string;
			outputContract: string;
		}>,
	): string => [
		section('GLOBAL NARRATION INSTRUCTIONS', overrides?.globalInstruction || globalInstruction),
		section('NARRATIVE STYLE', overrides?.styleInstruction || styleInstruction),
		section('NARRATOR VOICE CONTRACT', promptBudgetVoiceContext),
		section('NARRATIVE CONTINUITY STATE', narrativeContinuityContext),
		section('NARRATIVE NOVELTY / REPETITION CONTROL', narrativeNoveltyContext),
		section('NARRATIVE QUALITY CONTRACT', promptBudgetQualityContext),
		section('ADAPTIVE PACING CONTRACT', NarrativePacingEngine.toPromptContext(narrativePacingContract)),
		section('CURRENT SITUATION', overrides?.situationContext || situationContext),
		section('PLAYER INTENT', overrides?.intentContext || intentContext),
		section('ACTION RESOLUTION — AUTHORITATIVE', actionResolutionContext),
		section('NARRATIVE RESEARCH', researchContext),
		section('NARRATIVE DIRECTOR PLAN', overrides?.planContext || planContext),
		section('NPC COGNITION BOUNDARY', 'NPC cognition is presentation guidance. Private beliefs, secrets, and knowledge must never be stated as player-visible facts unless independently authorized by research or canonical scene evidence. Express cognition through observable behavior, dialogue, hesitation, priorities, and reactions.'),
		section('SUPPORTING WORKING CONTEXT', workingContext),
		overrides?.canonicalConstraints || canonicalConstraints,
		section('OUTPUT CONTRACT', overrides?.outputContract || outputContract),
	].join('\n\n');

	const initialResearch = boundedResearch.promptContext || '[research unavailable; use current situation only and preserve uncertainty]';
	const initialWorking = boundedWorkingContext || '[no additional working context]';
	const maxPromptTokens = input.maxPromptTokens;
	if (!maxPromptTokens) {
		const prompt = compose(initialResearch, initialWorking);
		return { prompt, styleInstruction, totalTokens: WorkingContextEngine.estimateTokens(prompt), narrativeQualityContract, narratorVoiceState: input.narratorVoiceState, narrativeContinuityState, narrativePacingContract };

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
			workingContext = workingContext.slice(0, Math.max(350, workingContext.length - excessChars)).trimEnd();
		} else if (researchContext.length > 900) {
			researchContext = researchContext.slice(0, Math.max(600, researchContext.length - excessChars)).trimEnd();
		} else {
			break;
		}
		prompt = compose(researchContext, workingContext);
		totalTokens = WorkingContextEngine.estimateTokens(prompt);
	}

	// Final compact mode: keep the semantic contract intact while reducing lower-priority prose.
	if (totalTokens > maxPromptTokens) {
		if (maxPromptTokens < 600) {
			const budgetChars = Math.max(1200, maxPromptTokens * 4);
			const microGlobal = 'Generate only the player-facing narrative. Preserve player agency and canonical truth. Never make major future decisions for the player.';
			const microVoice = input.narratorVoiceState ? truncatePromptSection(NarratorVoiceEngine.compactPromptContext(input.narratorVoiceState), 420) : 'N2 voice disabled.';
			const microQuality = truncatePromptSection(promptBudgetQualityContext, 420);
			const microContinuity = truncatePromptSection(NarrativeContinuityStateEngine.compactPromptContext(narrativeContinuityState), 420);
			const microNovelty = truncatePromptSection(NarrativeNoveltyEngine.compactPromptContext(narrativeNoveltyState), 420);
			const microSituation = truncatePromptSection(situationContext, 360);
			const microIntent = truncatePromptSection(intentContext, 180);
			const microResolution = truncatePromptSection(actionResolutionContext, 620);
			const microResearch = truncatePromptSection(initialResearch, 220);
			const microPlan = truncatePromptSection(planContext, 140);
			const microCanonical = 'The current location and time are authoritative. Stay in the canonical current location unless the canonical game state has already committed a location change. Do not invent unsupported facts or turn rumor into certainty.';
			const microOutput = '{"narrative":["..."],"dialogue":[],"events":[],"stateChanges":[],"memoryCandidates":[],"audioCues":[],"visualCues":[]}';
			const sections = [
				section('GLOBAL NARRATION INSTRUCTIONS', microGlobal),
				section('NARRATOR VOICE CONTRACT', microVoice),
				section('NARRATIVE QUALITY CONTRACT', microQuality),
				section('NARRATIVE CONTINUITY STATE', microContinuity),
				section('NARRATIVE NOVELTY / REPETITION CONTROL', microNovelty),
				section('CURRENT SITUATION', microSituation),
				section('PLAYER INTENT', microIntent),
				section('ACTION RESOLUTION — AUTHORITATIVE', microResolution),
				section('NARRATIVE RESEARCH', microResearch),
				section('NARRATIVE DIRECTOR PLAN', microPlan),
				section('CANONICAL CURRENT SCENE ANCHOR', microCanonical),
				section('OUTPUT CONTRACT', 'Return ONLY valid JSON in this shape: ' + microOutput),
			];
			prompt = sections.join('\\n\\n');
			totalTokens = WorkingContextEngine.estimateTokens(prompt);
			if (totalTokens > maxPromptTokens) {
				const removable = [
					['NARRATIVE RESEARCH\\n', microResearch],
					['NARRATIVE DIRECTOR PLAN\\n', microPlan],
					['PLAYER INTENT\\n', microIntent],
					['CURRENT SITUATION\\n', microSituation],
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
				prompt = prompt.slice(0, Math.max(200, budgetChars));
				totalTokens = WorkingContextEngine.estimateTokens(prompt);
			}
		} else if (maxPromptTokens >= 1000) {
			const compact = {
				intentContext: intentContext,
				researchContext: truncatePromptSection(initialResearch, 700),
				planContext: truncatePromptSection(planContext, 300),
				workingContext: truncatePromptSection(initialWorking, 320),
				situationContext: truncatePromptSection(situationContext, 900),
			};
			const renderCompact = () => compose(
				compact.researchContext,
				compact.workingContext,
				{
					situationContext: compact.situationContext,
					intentContext: compact.intentContext,
					planContext: compact.planContext,
				},
			);
			prompt = renderCompact();
			totalTokens = WorkingContextEngine.estimateTokens(prompt);
			for (let pass = 0; pass < 48 && totalTokens > maxPromptTokens; pass += 1) {
				const keys: Array<keyof typeof compact> = [
					'workingContext',
					'planContext',
					'situationContext',
				];
				const key = keys
					.filter((candidate) => compact[candidate].length > 120)
					.sort((a, b) => compact[b].length - compact[a].length)[0];
				if (!key) break;
				compact[key] = truncatePromptSection(
					compact[key],
					Math.max(120, compact[key].length - Math.max(24, (totalTokens - maxPromptTokens) * 4)),
				);
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
				section('CURRENT SITUATION', compactSituation),
				section('PLAYER INTENT', compactIntent),
				section('ACTION RESOLUTION — AUTHORITATIVE', compactResolution),
				section('NARRATIVE RESEARCH', compactResearch),
				section('NARRATIVE DIRECTOR PLAN', compactPlan),
				section('SUPPORTING WORKING CONTEXT', '[omitted]'),
				compactCanonical,
				section('OUTPUT CONTRACT', compactOutput),
			].join('\n\n');
			totalTokens = WorkingContextEngine.estimateTokens(prompt);
		}
	}
	return { prompt, styleInstruction, totalTokens, narrativeQualityContract, narratorVoiceState: input.narratorVoiceState };
}

