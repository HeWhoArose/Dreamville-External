import { CurrentSituationBuilder, type CurrentSituation } from './currentSituation';
import type { PlayerIntent } from './playerIntentInterpreter';
import { NarrativeDirector, type EphemeralNarrativePlan } from './narrativeDirector';
import type { NarrativeResearchResult } from './narrativeResearchPipeline';
import { WorkingContextEngine, type AssembledTurnContext } from './workingContextEngine';

export interface NarrationPromptInput {
	situation: CurrentSituation;
	intent: PlayerIntent;
	research: NarrativeResearchResult;
	plan: EphemeralNarrativePlan;
	workingContext?: string;
	globalInstruction?: string;
	styleInstruction?: string;
	canonicalOutcome?: string;
	maxPromptTokens?: number;
}

export interface NarrationPromptResult {
	prompt: string;
	styleInstruction: string;
	totalTokens: number;
}

export function projectSupportingWorkingContext(context: AssembledTurnContext): string {
	const duplicateSourceIds = new Set([
		'b1_current_situation',
		'b2_player_intent',
		'b3_narrative_research',
		'b2_narrative_plan',
		'canonical_scene_anchor',
		'current_scene_factual_context',
	]);
	return context.includedChunks
		.filter((chunk) => !duplicateSourceIds.has(chunk.id || ''))
		.map((chunk) => '[' + chunk.label + ']\n' + chunk.content)
		.join('\n\n') || '[no additional working context]';
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
		'Remain in the canonical scene and world time unless the supplied canonical state explicitly says they changed.',
		'Do not dump research or internal engine terminology into the player-facing narration.',
		'Normally write 2–3 concise paragraphs; tiny actions may use one paragraph.',
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
	const globalInstruction = input.globalInstruction || 'You are the narrative presentation engine for Dreamville. Generate only the player-facing narrative turn. Canonical state, player intent, bounded research, and the ephemeral plan are authoritative inputs; prose is not canonical truth.';
	const styleInstruction = input.styleInstruction || defaultNarrationStyle();
	const situationContext = input.situation ? CurrentSituationBuilder.toPromptContext(input.situation) : '[current situation unavailable]';
	const intentContext = JSON.stringify(input.intent);
	const planContext = NarrativeDirector.toPromptContext(input.plan);
	const canonicalConstraints = [
		'Canonical constraints:',
		'- The current location and time in Current Situation are authoritative.',
		'- Player Intent is the semantic description of what the player meant to attempt.',
		'- Research is bounded evidence. Omitted or excluded information is not permission to invent it.',
		'- The Narrative Director Plan is ephemeral guidance for this turn only; it does not create canonical state.',
		'- State changes must come from canonical engines/commands, not from prose.',
		input.canonicalOutcome ? '- A canonical outcome has already been resolved: ' + input.canonicalOutcome : '- No canonical mechanical outcome is supplied; describe the attempt and observable response without resolving hidden mechanics.',
	].join('\n');
	const outputContract = [
		'Return ONLY valid JSON in the existing StructuredTurnPackage shape:',
		'{"narrative":["..."],"dialogue":[{"speaker":"...","text":"..."}],"events":["..."],"stateChanges":[],"memoryCandidates":["..."],"audioCues":["..."],"visualCues":["..."]}',
		'Narrative should contain only the player-facing prose for this turn.',
		'Do not include markdown fences, commentary, analysis, implementation details, model names, or debug information.',
	].join('\n');

	const compose = (researchContext: string, workingContext: string): string => [
		section('GLOBAL NARRATION INSTRUCTIONS', globalInstruction),
		section('NARRATIVE STYLE', styleInstruction),
		section('CURRENT SITUATION', situationContext),
		section('PLAYER INTENT', intentContext),
		section('NARRATIVE RESEARCH', researchContext),
		section('NARRATIVE DIRECTOR PLAN', planContext),
		section('SUPPORTING WORKING CONTEXT', workingContext),
		canonicalConstraints,
		section('OUTPUT CONTRACT', outputContract),
	].join('\n\n');

	const initialResearch = input.research?.promptContext || '[research unavailable; use current situation only and preserve uncertainty]';
	const initialWorking = input.workingContext || '[no additional working context]';
	const maxPromptTokens = input.maxPromptTokens;
	if (!maxPromptTokens) {
		const prompt = compose(initialResearch, initialWorking);
		return { prompt, styleInstruction, totalTokens: WorkingContextEngine.estimateTokens(prompt) };
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

	// A very small maxPromptTokens value cannot preserve the mandatory contract sections.
	// In that case keep the complete semantic contract rather than producing a malformed prompt.
	if (totalTokens > maxPromptTokens && researchContext !== '[research unavailable; use current situation only and preserve uncertainty]') {
		researchContext = truncatePromptSection(researchContext, 650);
		workingContext = '[supporting working context omitted to preserve the semantic contract]';
		prompt = compose(researchContext, workingContext);
		totalTokens = WorkingContextEngine.estimateTokens(prompt);
	}

	return { prompt, styleInstruction, totalTokens };
}

