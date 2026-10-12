/**
 * Phase D2 (GAP-7 / S-7) — golden-set narrative judge evaluation.
 *
 * The release process had no automated narrative-quality regression gate: the
 * incident's social-question case could only be caught by a human reading turns.
 * This module scores a golden fixture set against a rubric whose items are
 * anchored to the project's existing validators:
 *
 *   - Reliability   -> the structured turn-package contract (`validateTurnPackage`)
 *   - Consistency   -> golden player-agency / epistemic boundaries
 *                      (`NarrativeGoldenRegressionEngine` forbidden patterns)
 *   - CanonFidelity -> golden scenario anchors + forbidden canon patterns
 *   - Interest      -> prose richness signals (`NarrativeRichnessEvaluator`)
 *
 * The deterministic scorer below is offline and dependency-free so it can run in
 * the release gate. A REVIEW-pool model judge (see `buildJudgePrompt` /
 * `parseJudgeResponse` / `runLiveJudge`) can be layered on top; it is opt-in and
 * disabled by default. Per the plan, promotion to a *blocking* gate (D3) requires
 * one human calibration pass over >=20 turns, so `JUDGE_BLOCKING_THRESHOLDS` is
 * defined but only applied behind an explicit flag.
 */

import { NARRATIVE_GOLDEN_SCENARIOS, type NarrativeGoldenScenario } from './narrativeGoldenRegression';

export type JudgeDimension = 'Reliability' | 'Consistency' | 'CanonFidelity' | 'Interest';

export const JUDGE_DIMENSIONS: readonly JudgeDimension[] = [
	'Reliability',
	'Consistency',
	'CanonFidelity',
	'Interest',
];

export interface NarrativeJudgeFixture {
	/** Stable fixture id, e.g. G02_INFORMATION or F20_INCIDENT_SOCIAL. */
	id: string;
	title: string;
	playerAction: string;
	/** Raw provider response text exactly as it would be validated. */
	raw: string;
	/** Links the fixture to a golden scenario so anchors/boundaries come from it. */
	scenarioId?: string;
	/** Extra canonical anchors required in the narration (augments scenario). */
	anchors?: RegExp[];
	/** Extra forbidden patterns (augments scenario). */
	forbidden?: RegExp[];
	/** When true, any emitted state change is a consistency violation. */
	requireNoStateChanges?: boolean;
	/** Human-labelled ground truth: should the judge PASS or FAIL this response? */
	expect: 'PASS' | 'FAIL';
	/** Human note describing why this fixture exists (incident provenance). */
	notes?: string;
}

export interface JudgeDimensionScore {
	dimension: JudgeDimension;
	score: number; // 1..5
	issues: string[];
}

export interface NarrativeJudgeFixtureResult {
	id: string;
	title: string;
	scenarioId?: string;
	dimensionScores: JudgeDimensionScore[];
	overall: number;
	notes?: string;
}

export interface NarrativeJudgeReport {
	fixtures: NarrativeJudgeFixtureResult[];
	aggregate: Record<JudgeDimension, number> & { overall: number };
	lowest: { id: string; overall: number }[];
	/** Fixtures where the judge's PASS/FAIL verdict disagreed with the human label. */
	mismatches: Array<{ id: string; expected: 'PASS' | 'FAIL'; judged: 'PASS' | 'FAIL'; overall: number }>;
	/** Share of fixtures correctly classified (1 = perfect). */
	agreementRate: number;
	blocking: boolean;
	generatedAt: string;
}

export const JUDGE_BLOCKING_THRESHOLDS: Record<JudgeDimension, number> & { overall: number; agreementRate: number } = {
	overall: 3.5,
	Reliability: 4,
	Consistency: 3.5,
	CanonFidelity: 3.5,
	Interest: 2.5,
	/** Minimum share of golden fixtures the judge must classify in line with the human label. */
	agreementRate: 1,
};

const PLAYER_AGENCY_PATTERNS = [/you decide to/i, /you choose to/i, /you decide that/i];
const EPISTEMIC_OVERREACH_PATTERNS = [/definitely/i, /without doubt/i, /certainly the case/i];

const CONCRETE_DETAIL_PATTERNS =
	/\b(?:red|blue|green|black|white|silver|golden|pale|faint|narrow|broad|cracked|worn|wet|cold|warm|rough|sharp|quiet|loud|dust|shadow|glow|stone|iron|amber|whisper|echo|smell|taste|touch|light|dark)\b/gi;

interface StructuralCheck {
	valid: boolean;
	narrative: string;
	issue?: string;
}

/** Mirrors the shape requirements of `MultiModelOrchestrator.validateTurnPackage`. */
export function structuralTurnPackageCheck(raw: string): StructuralCheck {
	const trimmed = (raw || '').trim();
	if (!trimmed) return { valid: false, narrative: '', issue: 'Response was empty.' };
	let parsed: any;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		// Mirror the validator's tolerance: attempt to salvage an embedded JSON
		// envelope before declaring the response invalid.
		const objectStart = trimmed.indexOf('{');
		const objectEnd = trimmed.lastIndexOf('}');
		if (objectStart >= 0 && objectEnd > objectStart) {
			try {
				parsed = JSON.parse(trimmed.slice(objectStart, objectEnd + 1));
			} catch {
				return { valid: false, narrative: '', issue: 'Response is not valid JSON.' };
			}
		} else {
			return { valid: false, narrative: '', issue: 'Response is not valid JSON.' };
		}
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return { valid: false, narrative: '', issue: 'Response JSON is not an object envelope.' };
	}
	if (!Array.isArray(parsed.narrative) || parsed.narrative.length === 0) {
		return { valid: false, narrative: '', issue: 'Response is missing a non-empty narrative array.' };
	}
	const narrative = parsed.narrative.filter((entry: unknown) => typeof entry === 'string').join(' ').trim();
	if (narrative.length === 0) {
		return { valid: false, narrative: '', issue: 'Narrative array contained no string content.' };
	}
	for (const key of ['dialogue', 'events', 'stateChanges', 'memoryCandidates', 'audioCues']) {
		if (parsed[key] !== undefined && !Array.isArray(parsed[key])) {
			return { valid: false, narrative, issue: `Field '${key}' must be an array when present.` };
		}
	}
	// State changes are strictly validated (mirrors the allowed-kind guard in
	// MultiModelOrchestrator.validateTurnPackage) even when prose is tolerated.
	const allowedKinds = new Set(['INVENTORY', 'CAPABILITY', 'LOCATION', 'COMBAT', 'CHRONICLE', 'PHYSIOLOGY', 'HEALTH', 'ALIGNMENT']);
	for (const change of parsed.stateChanges || []) {
		if (!change || typeof change !== 'object') {
			return { valid: false, narrative, issue: 'State change item must be an object.' };
		}
		const kind = String(change.kind || '').toUpperCase();
		if (!allowedKinds.has(kind)) {
			return { valid: false, narrative, issue: `Illegal state change kind '${change.kind}'.` };
		}
		if (!change.targetId || typeof change.targetId !== 'string' || change.targetId.trim().length === 0) {
			return { valid: false, narrative, issue: 'State change is missing a targetId.' };
		}
	}
	return { valid: true, narrative };
}

function scenarioFor(fixture: NarrativeJudgeFixture): NarrativeGoldenScenario | undefined {
	return fixture.scenarioId
		? NARRATIVE_GOLDEN_SCENARIOS.find((scenario) => scenario.id === fixture.scenarioId)
		: undefined;
}

function collectAnchors(fixture: NarrativeJudgeFixture): RegExp[] {
	const scenario = scenarioFor(fixture);
	return [...(scenario?.requiredAnchors || []), ...(fixture.anchors || [])];
}

function collectForbidden(fixture: NarrativeJudgeFixture): RegExp[] {
	const scenario = scenarioFor(fixture);
	return [
		...(scenario?.forbiddenPatterns || []),
		...PLAYER_AGENCY_PATTERNS,
		...(fixture.forbidden || []),
	];
}

function scoreReliability(fixture: NarrativeJudgeFixture, structure: StructuralCheck): JudgeDimensionScore {
	const issues: string[] = [];
	if (!structure.valid) {
		return { dimension: 'Reliability', score: 1, issues: [structure.issue || 'Invalid structured response.'] };
	}
	// Valid envelope: reward complete, non-trivial narration.
	if (structure.narrative.length < 80) {
		issues.push('Narrative is structurally valid but too thin (<80 chars).');
		return { dimension: 'Reliability', score: 3, issues };
	}
	return { dimension: 'Reliability', score: 5, issues };
}

function scoreConsistency(fixture: NarrativeJudgeFixture, structure: StructuralCheck): JudgeDimensionScore {
	const issues: string[] = [];
	let score = 5;
	if (!structure.valid) return { dimension: 'Consistency', score: 1, issues: ['Cannot assess consistency of an invalid response.'] };

	for (const pattern of collectForbidden(fixture)) {
		if (pattern.test(structure.narrative)) {
			issues.push(`Player-agency/canon boundary violated: /${pattern.source}/.`);
			score -= 2;
		}
	}
	// Epistemic overreach only penalised when the fixture expects hedging.
	const scenario = scenarioFor(fixture);
	const expectsUncertainty = scenarioIdImpliesUncertainty(fixture);
	if (expectsUncertainty) {
		for (const pattern of EPISTEMIC_OVERREACH_PATTERNS) {
			if (pattern.test(structure.narrative)) {
				issues.push(`Epistemic overreach in an uncertainty fixture: /${pattern.source}/.`);
				score -= 2;
			}
		}
	}
	const requireNoStateChanges = fixture.requireNoStateChanges ?? Boolean(scenario?.requireNoStateChanges);
	if (requireNoStateChanges) {
		try {
			const parsed = JSON.parse(fixture.raw.trim());
			if (Array.isArray(parsed?.stateChanges) && parsed.stateChanges.length > 0) {
				issues.push('Fixture expects no canonical state mutation but state changes were emitted.');
				score -= 2;
			}
		} catch {
			/* structural failure already handled by reliability */
		}
	}
	return { dimension: 'Consistency', score: Math.max(1, score), issues };
}

function scenarioIdImpliesUncertainty(fixture: NarrativeJudgeFixture): boolean {
	return fixture.id.includes('INFORMATION') || fixture.scenarioId === 'G02_INFORMATION' || /uncertain/i.test(fixture.title);
}

function scoreCanonFidelity(fixture: NarrativeJudgeFixture, structure: StructuralCheck): JudgeDimensionScore {
	const issues: string[] = [];
	if (!structure.valid) return { dimension: 'CanonFidelity', score: 1, issues: ['Cannot assess canon fidelity of an invalid response.'] };
	let score = 5;
	const missing = collectAnchors(fixture).filter((pattern) => !pattern.test(structure.narrative));
	for (const pattern of missing) {
		issues.push(`Required canon anchor missing: /${pattern.source}/.`);
		score -= 1.5;
	}
	return { dimension: 'CanonFidelity', score: Math.max(1, score), issues };
}

function scoreInterest(structure: StructuralCheck): JudgeDimensionScore {
	if (!structure.valid) return { dimension: 'Interest', score: 1, issues: ['Cannot assess interest of an invalid response.'] };
	const text = structure.narrative;
	const issues: string[] = [];
	const length = text.length;
	let score = length < 120 ? 1 : length < 240 ? 2 : length < 400 ? 3 : length < 600 ? 4 : 5;
	if (length < 240) issues.push('Prose is terse; the golden set expects at least a developed beat.');
	const concrete = (text.match(CONCRETE_DETAIL_PATTERNS) || []).length;
	if (concrete >= 2) score += 1;
	else issues.push('Few concrete/sensory details detected.');
	return { dimension: 'Interest', score: Math.min(5, Math.max(1, score)), issues };
}

export function scoreNarrativeJudgeFixture(fixture: NarrativeJudgeFixture): NarrativeJudgeFixtureResult {
	const structure = structuralTurnPackageCheck(fixture.raw);
	const dimensionScores = [
		scoreReliability(fixture, structure),
		scoreConsistency(fixture, structure),
		scoreCanonFidelity(fixture, structure),
		scoreInterest(structure),
	];
	const overall = round2(dimensionScores.reduce((sum, entry) => sum + entry.score, 0) / dimensionScores.length);
	return {
		id: fixture.id,
		title: fixture.title,
		scenarioId: fixture.scenarioId,
		dimensionScores,
		overall,
		notes: fixture.notes,
	};
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

export function judgeFixtureVerdict(
	result: NarrativeJudgeFixtureResult,
	thresholds: typeof JUDGE_BLOCKING_THRESHOLDS,
): 'PASS' | 'FAIL' {
	if (result.overall < thresholds.overall) return 'FAIL';
	if (result.dimensionScores.some((entry) => entry.score < thresholds[entry.dimension])) return 'FAIL';
	return 'PASS';
}

export function runNarrativeJudgeEval(options?: {
	fixtures?: readonly NarrativeJudgeFixture[];
	blocking?: boolean;
	thresholds?: Partial<typeof JUDGE_BLOCKING_THRESHOLDS>;
	now?: () => Date;
}): NarrativeJudgeReport {
	const fixtures = options?.fixtures ?? NARRATIVE_JUDGE_FIXTURES;
	const blocking = Boolean(options?.blocking);
	const thresholds = { ...JUDGE_BLOCKING_THRESHOLDS, ...(options?.thresholds || {}) };
	const results = fixtures.map((fixture) => scoreNarrativeJudgeFixture(fixture));
	const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

	const aggregate = {} as Record<JudgeDimension, number> & { overall: number };
	for (const dimension of JUDGE_DIMENSIONS) {
		const values = results.map((result) => result.dimensionScores.find((entry) => entry.dimension === dimension)?.score ?? 0);
		aggregate[dimension] = round2(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length));
	}
	aggregate.overall = round2(results.reduce((sum, result) => sum + result.overall, 0) / Math.max(1, results.length));

	const mismatches = results
		.map((result) => ({ result, fixture: byId.get(result.id)! }))
		.map(({ result, fixture }) => ({ expected: fixture.expect, judged: judgeFixtureVerdict(result, thresholds), result }))
		.filter(({ expected, judged }) => expected !== judged)
		.map(({ expected, judged, result }) => ({ id: result.id, expected, judged, overall: result.overall }));

	const agreementRate = round2((results.length - mismatches.length) / Math.max(1, results.length));

	const lowest = [...results]
		.sort((a, b) => a.overall - b.overall || a.id.localeCompare(b.id))
		.slice(0, 5)
		.map((result) => ({ id: result.id, overall: result.overall }));

	return {
		fixtures: results,
		aggregate,
		lowest,
		mismatches,
		agreementRate,
		blocking,
		generatedAt: (options?.now ? options.now() : new Date()).toISOString(),
	};
}

/** Whether a blocking run should fail the gate (D3 — requires a human calibration pass first). */
export function judgeReportFails(report: NarrativeJudgeReport): boolean {
	if (!report.blocking) return false;
	if (report.agreementRate < JUDGE_BLOCKING_THRESHOLDS.agreementRate) return true;
	return report.mismatches.length > 0;
}

/**
 * Live REVIEW-pool judge prompt (GAP-7). Opt-in; not exercised without a provider.
 * Returns a strict-JSON instruction so the response can be parsed deterministically.
 */
export function buildJudgePrompt(fixture: NarrativeJudgeFixture): string {
	return [
		'You are a narrative-quality judge for a text RPG. Score the response 1-5 on each rubric item.',
		'The rubric items are anchored to the engine validators: Reliability (structured turn-package contract),',
		'Consistency (player-agency and epistemic boundaries), CanonFidelity (scene/lore anchors), Interest (prose richness).',
		'Return ONLY JSON: {"Reliability":n,"Consistency":n,"CanonFidelity":n,"Interest":n,"rationale":"..."}.',
		`Player action: ${fixture.playerAction}`,
		`Model response: ${fixture.raw}`,
	].join('\n');
}

export function parseJudgeResponse(text: string): Partial<Record<JudgeDimension, number>> | undefined {
	try {
		const parsed = JSON.parse(text);
		const out: Partial<Record<JudgeDimension, number>> = {};
		for (const dimension of JUDGE_DIMENSIONS) {
			const value = Number(parsed?.[dimension]);
			if (Number.isFinite(value) && value >= 1 && value <= 5) out[dimension] = value;
		}
		return Object.keys(out).length === JUDGE_DIMENSIONS.length ? out : undefined;
	} catch {
		return undefined;
	}
}

export function liveJudgeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return env.DREAMVILLE_JUDGE_LIVE === '1';
}

function pkg(
	narrative: string[],
	extra: Partial<{ dialogue: unknown[]; events: unknown[]; stateChanges: unknown[]; memoryCandidates: unknown[]; audioCues: unknown[] }> = {},
): string {
	return JSON.stringify({
		narrative,
		dialogue: extra.dialogue ?? [],
		events: extra.events ?? [],
		stateChanges: extra.stateChanges ?? [],
		memoryCandidates: extra.memoryCandidates ?? [],
		audioCues: extra.audioCues ?? [],
	});
}

/**
 * Golden fixture set (S-7: 15-25 canonical turns, including the incident
 * phrasings). `expect` is the human label; the judge must reproduce it.
 */
export const NARRATIVE_JUDGE_FIXTURES: readonly NarrativeJudgeFixture[] = [
	{
		id: 'G01_OBSERVATION', title: 'Quiet scene observation', scenarioId: 'G01_OBSERVATION',
		playerAction: 'I observe the archivists.', expect: 'PASS',
		raw: pkg([
			'You observe the archivists at work inside the Whispering Orrery, keeping to the edge of the chamber as you take in the quiet rhythm of the place.',
			'Dust drifts through the amber light and settles over the worn stone lecterns while the archivist nearest you sorts a stack of brittle charts without looking up. Nothing about the scene changes because you are watching, and no one acknowledges you yet.',
		]),
	},
	{
		id: 'G02_INFORMATION', title: 'Information-seeking uncertainty', scenarioId: 'G02_INFORMATION',
		playerAction: 'I find out whether the starlight fissures are real.', expect: 'PASS',
		raw: pkg([
			'You ask after the starlight fissures, and the archivist answers only with hearsay: the fissures are unverified, she says, and no reliable account has ever been logged inside the Whispering Orrery.',
			'You search the reading room for a firmer answer but the records are contradictory, so the question stays open. Nothing you find turns the rumour into a certainty, and you are free to keep investigating.',
		]),
	},
	{
		id: 'G03_MOVEMENT', title: 'Scene-bound movement', scenarioId: 'G03_MOVEMENT',
		playerAction: 'I move closer to Archivist Maren.', expect: 'PASS',
		raw: pkg([
			'You move closer to Archivist Maren across the floor of the Whispering Orrery, narrowing the distance between you without changing the room.',
			'Her low voice carries a little more clearly now, and the faint scratch of her stylus against parchment becomes audible. The scene holds around the two of you; the step you took does not carry you anywhere new.',
		]),
	},
	{
		id: 'G04_COMBAT', title: 'Kinetic immediate action', scenarioId: 'G04_COMBAT',
		playerAction: 'I strike at the creature.', expect: 'PASS',
		raw: pkg([
			'You strike at the creature inside the Whispering Orrery, throwing your weight behind the attack as the archivists scatter back.',
			'The impact lands and the thing recoils, its movement sudden and sharp, but the narration stops at the immediate beat: no follow-through and no next choice is decided for you. The moment stays kinetic, and what you do after this is still yours to pick.',
		]),
	},
	{
		id: 'F05_SOCIAL_GOOD', title: 'In-scene social answer', expect: 'PASS',
		playerAction: 'Excuse me, what do you think of the archives?',
		anchors: [/archive/i, /maren|archivist/i],
		raw: pkg([
			'You put the question to Maren directly, and she pauses over her charts before answering. "The archives?" she says, tilting her head toward the shelves. "They are my whole life, and I suspect they will outlast me."',
			'Her tone is dry but not unkind, and nothing in the exchange claims more than she actually says. The Whispering Orrery settles back into its usual quiet.',
		], { dialogue: [{ speaker: 'Archivist Maren', text: 'The archives? They are my whole life.' }] }),
	},
	{
		id: 'F06_SOCIAL_BAD', title: 'Social answer that decides the player action', expect: 'FAIL',
		playerAction: 'Excuse me, what do you think of me?',
		anchors: [/maren|archivist/i],
		raw: pkg([
			'Maren looks up, and you decide to press her about her feelings before she can change the subject.',
			'She admits she loves the archives more than anything, and you choose to believe this settles the matter entirely. The room around you falls silent as the conversation ends.',
		]),
	},
	{
		id: 'F07_INFORMATION_BAD', title: 'Information turn that over-claims certainty', scenarioId: 'G02_INFORMATION', expect: 'FAIL',
		playerAction: 'I find out whether the starlight fissures are real.',
		raw: pkg([
			'You investigate the starlight fissures and quickly confirm that the fissures are definitely real, a fact the archivists have simply failed to write down.',
			'The definite answer resolves the matter at once, and there is no ambiguity left for anyone to dispute. You leave the Whispering Orrery satisfied that the question is closed.',
		]),
	},
	{
		id: 'F08_MALFORMED_JSON', title: 'Truncated structured response', expect: 'FAIL',
		playerAction: 'I observe the archivists.',
		raw: '{"narrative": ["Incomplete, and the model stopped before closing the envelope',
	},
	{
		id: 'F09_PLAIN_PROSE', title: 'Unstructured prose response', expect: 'FAIL',
		playerAction: 'I observe the archivists.',
		raw: 'The scene simply continues without a structured turn package or any canonical detail worth keeping.',
	},
	{
		id: 'F10_EMPTY_NARRATIVE', title: 'Structured response with no narration', expect: 'FAIL',
		playerAction: 'I observe the archivists.',
		raw: pkg([]),
	},
	{
		id: 'F11_COMBAT_AGENCY_BAD', title: 'Combat narration that plays the player forward', scenarioId: 'G04_COMBAT', expect: 'FAIL',
		playerAction: 'I strike at the creature.',
		raw: pkg([
			'You strike at the creature and the blow lands cleanly.',
			'After that you decide to finish it off, swinging again before it can recover, and you choose to press the advantage until nothing is left standing.',
		]),
	},
	{
		id: 'F12_STATE_CHANGE_VIOLATION', title: 'Observation that mutates canonical state', scenarioId: 'G01_OBSERVATION', expect: 'FAIL',
		playerAction: 'I observe the archivists.',
		raw: pkg([
			'You observe the archivists at work inside the Whispering Orrery, and the room quietly rearranges itself around you as a heavy stone door grinds open at your back.',
			'The archivist nearest you glances up, startled, and the scene shifts with the new opening.',
		], { stateChanges: [{ kind: 'LOCATION', targetId: 'player', value: 'loc_new' }] }),
	},
	{
		id: 'F13_RICH_OBSERVATION', title: 'Sensory-rich observation', expect: 'PASS',
		playerAction: 'I observe the archivists.',
		anchors: [/whispering orrery/i, /archivist/i],
		raw: pkg([
			'You settle at the lip of the Whispering Orrery and simply watch, letting the cold amber light fall across the cracked stone floor.',
			'An archivist turns a yellowed page with a soft, dry rasp; another taps a stylus against iron shelving. Dust hangs in the warm shafts, and somewhere below the chamber a faint hum rises and falls like slow breathing.',
			'No one notices you, and nothing you see demands an answer yet.',
		]),
	},
	{
		id: 'F14_CANON_TELEPORT_BAD', title: 'Movement that leaves the scene', scenarioId: 'G03_MOVEMENT', expect: 'FAIL',
		playerAction: 'I move closer to Archivist Maren.',
		raw: pkg([
			'You move closer to Archivist Maren and then you enter a new chamber entirely, the Whispering Orrery falling away behind you as fresh architecture closes in.',
		]),
	},
	{
		id: 'F15_DIALOGUE_SOCIAL', title: 'Dialogue-bearing social exchange', expect: 'PASS',
		playerAction: 'May I ask what you are working on?',
		anchors: [/maren|archivist/i, /orrery|archive/i],
		raw: pkg([
			'Maren does not stop working, but she answers without hesitation. "Indexing the eastern star-charts," she says, sliding a brittle sheet toward the light. "Half of them disagree with the other half."',
			'She waits, plainly willing to say more if you ask, and the question of what the charts mean stays open rather than resolving itself.',
		], { dialogue: [{ speaker: 'Archivist Maren', text: 'Indexing the eastern star-charts.' }] }),
	},
	{
		id: 'F16_TERSE_VALID', title: 'Structurally valid but too thin', expect: 'FAIL',
		playerAction: 'I observe the archivists.',
		raw: pkg(['You observe the archivists.']),
	},
	{
		id: 'F17_LORE_RECALL', title: 'Canon-grounded lore recall', expect: 'PASS',
		playerAction: 'I recall what the Whispering Orrery is for.',
		anchors: [/whispering orrery/i],
		raw: pkg([
			'You take a moment to place what you know of the Whispering Orrery: an archive built around a listening chamber, where records are kept of things that were heard rather than seen.',
			'The name comes from the ambient hum, not from any rumour of prophecy, and nothing in the room suggests otherwise. The stone keeps its cold quiet, and the archivists keep their work.',
		]),
	},
	{
		id: 'F18_OMNISCIENT_BAD', title: 'Omniscient narration bundling boundaries', expect: 'FAIL',
		playerAction: 'Excuse me, what do you think of me?',
		anchors: [/maren|archivist/i],
		raw: pkg([
			'Maren looks up, and you decide to ask how she really feels, so you definitely get the truth out of her in one exchange.',
			'She admits that you choose to stay, and the matter is certainly the case before you even finish the sentence.',
		]),
	},
	{
		id: 'F19_UNKNOWN_LOCATION_BAD', title: 'Narration that cannot place the scene', expect: 'FAIL',
		playerAction: 'I observe the archivists.',
		anchors: [/whispering orrery/i, /archivist/i],
		raw: pkg([
			'You look around at whatever there is to see in this place and wait for something to happen, uncertain where you are or who else might be nearby.',
			'After a while the moment passes and nothing in particular has changed about your situation.',
		]),
	},
	{
		id: 'F20_INCIDENT_SOCIAL', title: 'Incident repro: direct social question', expect: 'PASS',
		playerAction: 'Excuse me, what do you think of me?',
		anchors: [/maren|archivist/i],
		notes: 'Reproduces the incident phrasing whose mishandling motivated GAP-7.',
		raw: pkg([
			'Maren sets down her stylus and considers the question honestly. "I do not know you well enough to say," she answers, "and I would not invent an opinion just to be polite."',
			'Her answer stays within what she can actually judge, and the exchange does not pretend to reveal anything more than she chose to share. She returns to her charts, leaving the door open for you to answer.',
		], { dialogue: [{ speaker: 'Archivist Maren', text: 'I do not know you well enough to say.' }] }),
	},
];
