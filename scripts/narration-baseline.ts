/**
 * Narration baseline and replay harness.
 *
 * Plays a scripted set of turns on the authored Ren world pack through the real /action pipeline and reports, per turn,
 * whether narration was accepted, why it was rejected, and whether the fact that answers the question reached the
 * model's prompt.
 *
 *   npm run narration:baseline                      stub:   no network; canned replies; checks prompt contents only
 *   BASELINE_MODE=live GEMINI_API_KEY=... GROQ_KEY=... BASELINE_MODELS=gemini-3.5-flash-lite,groq::qwen/qwen3.8-27b \
 *     BASELINE_RECORD=tests/fixtures/narration-replay/ren.json npm run narration:baseline
 *                                                     live:   real providers; optionally RECORD the raw model replies
 *   BASELINE_MODE=replay BASELINE_REPLAY=tests/fixtures/narration-replay/ren.json npm run narration:baseline
 *                                                     replay: no network; the recorded real replies are served to the real
 *                                                             pipeline, so prompt, gate and rewrite changes are scored
 *                                                             deterministically against actual model output.
 *
 * Other environment: BASELINE_MODELS (comma list; bare ids are Gemini, `provider::model` otherwise), BASELINE_CALL_CAP
 * (live provider requests, default 120), BASELINE_OUT (JSON report path), BASELINE_TURNS (JSON array of action strings),
 * NARRATION_RECENT_TURNS, NARRATION_SOFT_GATES.
 *
 * Safety: the tracked orchestrator config is backed up first and restored afterwards, the temporary provider credential
 * file is removed, and keys are read from the environment only and never written to a report or recording.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';

const ROOT = process.cwd();
const CONFIG = path.join(ROOT, 'server/data/orchestrator_config.json');
const CREDENTIALS = path.join(ROOT, 'server/data/.provider_credentials.json');

export interface BaselineTurn { action: string; expectFacts?: string[]; moveTo?: string }
export interface RecordedReply { kind: 'narrate' | 'rewrite' | 'other'; text: string }
export interface ReplayCorpus {
	version: 1;
	recordedAt: string;
	models: string[];
	turns: Array<{ action: string; moveTo?: string; replies: RecordedReply[]; recordedAccepted: boolean }>;
}
export interface BaselineOptions {
	mode: 'stub' | 'live' | 'replay';
	models?: string[];
	turns?: BaselineTurn[];
	callCap?: number;
	recordTo?: string;
	replayFrom?: string;
	outFile?: string | null;
	log?: boolean;
}
export interface BaselineTurnResult {
	action: string;
	accepted: boolean;
	reason?: string;
	providerAttempts: number;
	route?: string;
	factsInPrompt: Array<{ fact: string; inPrompt: boolean }>;
	narration: string;
	/** Guard policy outcome for the turn: quiet, rewritten, cut, kept_soft, rejected_hard, unavailable, none. */
	guardOutcome?: string;
	/** Replay only: the turn had at least one recorded narration reply, so its outcome says something about the gates. */
	scorable?: boolean;
	recordedAccepted?: boolean;
}
export interface BaselineResult {
	summary: Record<string, unknown>;
	report: BaselineTurnResult[];
}

/** Each scripted turn, with the substrings that a correct answer (and therefore the prompt) must contain. */
export const DEFAULT_TURNS: BaselineTurn[] = [
	{ action: 'I look around the office and check my desk for anything about the Pendelton case.' },
	{ action: 'Who found the body?', expectFacts: ['Okafor'] },
	{ action: 'Where exactly was he found?', expectFacts: ['Pier 4'] },
	{ action: 'I ask Mei what the police have said so far.', expectFacts: ['Calder'] },
	{ action: 'What did they say about the bullet casing?', expectFacts: ['.38'] },
	{ action: 'I head out to the docks.' },
	{ action: 'I examine the bloodstain.', moveTo: 'loc_warehouse_docks' },
	{ action: 'So who found the body again?', expectFacts: ['Okafor'] },
];

function classifyRequest(body: string): RecordedReply['kind'] {
	if (body.includes('ORIGINAL NARRATION (presentation only)')) return 'rewrite';
	if (body.includes('GLOBAL NARRATION INSTRUCTIONS')) return 'narrate';
	return 'other';
}

function extractReplyText(json: any): string {
	const gemini = json?.candidates?.[0]?.content?.parts;
	if (Array.isArray(gemini)) return gemini.map((part: any) => String(part?.text ?? '')).join('');
	const groq = json?.choices?.[0]?.message?.content;
	return typeof groq === 'string' ? groq : '';
}

function providerPayload(isGemini: boolean, text: string) {
	return isGemini
		? { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } }
		: { id: 'replay', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
}

export async function runNarrationBaseline(options: BaselineOptions): Promise<BaselineResult> {
	const mode = options.mode;
	const callCap = options.callCap ?? 120;
	const turns = options.turns ?? DEFAULT_TURNS;
	const replay: ReplayCorpus | null = mode === 'replay' && options.replayFrom
		? JSON.parse(fs.readFileSync(path.resolve(ROOT, options.replayFrom), 'utf8')) as ReplayCorpus
		: null;
	if (mode === 'replay' && !replay) throw new Error('replay mode needs replayFrom');

	const requestBodies: string[] = [];
	const recordedByTurn: RecordedReply[][] = turns.map(() => []);
	const replayCursor: Record<string, number> = {};
	let currentTurn = -1;
	let providerCalls = 0;

	const configBackup = fs.existsSync(CONFIG) ? fs.readFileSync(CONFIG) : null;
	const realFetch = globalThis.fetch;
	const previousGemini = process.env.GEMINI_API_KEY;
	const restore = () => {
		globalThis.fetch = realFetch;
		if (configBackup) fs.writeFileSync(CONFIG, configBackup);
		if (fs.existsSync(CREDENTIALS)) fs.rmSync(CREDENTIALS);
		if (previousGemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousGemini;
	};

	globalThis.fetch = (async (input: any, init?: any) => {
		const url = typeof input === 'string' ? input : input?.url || String(input);
		const isGemini = url.includes('generativelanguage.googleapis.com') && /:(stream)?generateContent/i.test(url);
		const isGroq = url.includes('api.groq.com') && url.includes('/chat/completions');
		if (!isGemini && !isGroq) return realFetch(input, init);

		const body = String(init?.body || '');
		const kind = classifyRequest(body);
		requestBodies.push(body);

		if (mode === 'stub') {
			const canned = JSON.stringify({ narrative: ['STUB'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [], visualCues: [] });
			return new Response(JSON.stringify(providerPayload(isGemini, canned)), { status: 200, headers: { 'content-type': 'application/json' } });
		}
		if (mode === 'replay') {
			const pool = (replay!.turns[currentTurn]?.replies || []).filter((reply) => reply.kind === kind);
			if (pool.length === 0) {
				return new Response(JSON.stringify({ error: { code: 503, message: 'replay: no recorded reply of this kind for this turn', status: 'UNAVAILABLE' } }), { status: 503, headers: { 'content-type': 'application/json' } });
			}
			const key = `${currentTurn}:${kind}`;
			const index = Math.min(replayCursor[key] ?? 0, pool.length - 1);
			replayCursor[key] = (replayCursor[key] ?? 0) + 1;
			return new Response(JSON.stringify(providerPayload(isGemini, pool[index].text)), { status: 200, headers: { 'content-type': 'application/json' } });
		}

		if (providerCalls >= callCap) throw new Error(`BASELINE_CALL_CAP (${callCap}) reached`);
		providerCalls += 1;
		const response = await realFetch(input, init);
		if (options.recordTo && currentTurn >= 0 && response.ok) {
			try {
				const text = extractReplyText(await response.clone().json());
				if (text.trim()) recordedByTurn[currentTurn].push({ kind, text });
			} catch { /* unreadable body: not recorded */ }
		}
		return response;
	}) as typeof fetch;

	try {
		if (mode !== 'live') process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'stub-key';
		const { gameRouter } = await import('../server/api/gameRoutes');
		const { worldRepository } = await import('../server/repositories/worldRepository');
		const { applyWorldPack, loadWorldPack } = await import('../server/domain/worldPack');

		const app = express();
		app.use(express.json({ limit: '10mb' }));
		app.use('/api/game', gameRouter);
		const server = app.listen(0);
		await new Promise<void>((resolve) => server.once('listening', resolve));
		const base = `http://127.0.0.1:${(server.address() as any).port}/api/game`;
		const post = async (route: string, body: unknown) => {
			const response = await realFetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
			let json: any = null;
			try { json = await response.json(); } catch { /* non-JSON */ }
			return { status: response.status, json };
		};

		const models = (options.models && options.models.length ? options.models : ['gemini-3.5-flash-lite']);
		const full = (id: string) => (id.includes('::') ? id : `google_gemini::${id}`);
		if (process.env.GEMINI_API_KEY) await post('/orchestrator/providers/google_gemini/key', { apiKey: process.env.GEMINI_API_KEY });
		if (process.env.GROQ_KEY) await post('/orchestrator/providers/groq/key', { apiKey: process.env.GROQ_KEY });

		const orchestrator = worldRepository.getAiOrchestrator();
		// The orchestrator is a process-wide singleton: clear cooldowns, failure counts and tripped breakers left by an
		// earlier run in this process so replay results depend only on the recording and the code under test.
		for (const model of orchestrator.getAllModels()) {
			if (model.isEmergencyFloor) continue;
			orchestrator.resetCircuitBreaker(model.providerId, model.modelId);
			const runtime = (orchestrator as any).ensureRuntimeStatus(model);
			runtime.cooldownUntil = undefined;
			runtime.consecutiveFailures = 0;
			if (model.health === 'Unavailable' || model.health === 'Degraded' || model.health === 'Throttled') model.health = 'Healthy';
		}
		const keep = new Set(models.map(full));
		for (const model of orchestrator.getAllModels()) {
			if (model.isEmergencyFloor) continue;
			if (!keep.has(`${model.providerId}::${model.modelId}`) && !models.some((m) => m.endsWith(`::${model.modelId}`) || m === model.modelId)) {
				orchestrator.updateModelHealth(model.providerId, model.modelId, 'DisabledByUser');
			}
		}
		for (const task of ['narrative.generate', 'narrative.review', 'intent.interpret', 'memory.extract', 'character.dialogue'] as const) {
			try { orchestrator.setFallbackChain(task as any, [...models.map(full), 'provider_deterministic_emergency::emergency-fallback-local']); } catch { /* task not routable */ }
		}

		const storyId = `baseline_${Date.now()}`;
		await applyWorldPack(worldRepository, storyId, loadWorldPack(path.join(ROOT, 'data/worlds/ren_crimson_eye.pack.json')));

		const report: BaselineTurnResult[] = [];
		for (const [index, turn] of turns.entries()) {
			currentTurn = index;
			if (turn.moveTo) {
				const player = worldRepository.getPlayerLifecycle(storyId);
				if (player) worldRepository.updatePlayerLifecycle(storyId, player.copyWith({ locationId: turn.moveTo }));
			}
			const firstBody = requestBodies.length;
			const response = await post('/action', { storyId, type: 'CUSTOM_ACTION', actionText: turn.action });
			const body = response.json || {};
			const prompts = requestBodies.slice(firstBody);
			const error = body.narrativeError;
			const recordedTurn = replay?.turns[index];
			report.push({
				action: turn.action,
				accepted: !error && Boolean(body.narrativeResponse),
				reason: error ? `${error.code}: ${String(error.fallbackReason || error.message || '').slice(0, 220)}` : undefined,
				providerAttempts: prompts.length,
				route: body.narrativeGeneration ? `${body.narrativeGeneration.providerId}/${body.narrativeGeneration.modelId}` : undefined,
				factsInPrompt: (turn.expectFacts || []).map((fact) => ({ fact, inPrompt: prompts.some((prompt) => prompt.includes(fact)) })),
				narration: String(body.narrativeResponse || '').slice(0, 600),
				guardOutcome: body.narrativeQuality?.outcome,
				scorable: replay ? (recordedTurn?.replies || []).some((reply) => reply.kind === 'narrate') : undefined,
				recordedAccepted: recordedTurn?.recordedAccepted,
			});
		}
		server.close();

		const accepted = report.filter((entry) => entry.accepted).length;
		const withFacts = report.filter((entry) => entry.factsInPrompt.length > 0);
		const factsDelivered = withFacts.filter((entry) => entry.factsInPrompt.every((f) => f.inPrompt)).length;
		const summary: Record<string, unknown> = { mode, models, turns: report.length, accepted, informationTurnsWithFactInPrompt: `${factsDelivered}/${withFacts.length}`, providerCalls: mode === 'live' ? providerCalls : 0 };
		const guardOutcomes: Record<string, number> = {};
		for (const entry of report) guardOutcomes[entry.guardOutcome || 'unknown'] = (guardOutcomes[entry.guardOutcome || 'unknown'] || 0) + 1;
		summary.guardOutcomes = guardOutcomes;
		if (replay) {
			const scorable = report.filter((entry) => entry.scorable);
			summary.scorableTurns = scorable.length;
			summary.acceptedOfScorable = scorable.filter((entry) => entry.accepted).length;
			summary.recordedAcceptedOfScorable = scorable.filter((entry) => entry.recordedAccepted).length;
		}

		if (options.recordTo && mode === 'live') {
			const corpus: ReplayCorpus = {
				version: 1,
				recordedAt: new Date().toISOString(),
				models,
				turns: turns.map((turn, index) => ({ action: turn.action, moveTo: turn.moveTo, replies: recordedByTurn[index], recordedAccepted: report[index].accepted })),
			};
			const target = path.resolve(ROOT, options.recordTo);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, JSON.stringify(corpus, null, 2));
		}
		if (options.outFile !== null) {
			const out = options.outFile || path.join(ROOT, 'tests/artifacts/narration_baseline_latest.json');
			fs.mkdirSync(path.dirname(out), { recursive: true });
			fs.writeFileSync(out, JSON.stringify({ summary, report }, null, 2));
		}
		if (options.log) {
			console.log('\nNarration baseline (' + mode + ')');
			for (const [index, entry] of report.entries()) {
				const facts = entry.factsInPrompt.length ? ` facts-in-prompt=${entry.factsInPrompt.map((f) => (f.inPrompt ? 'yes' : 'NO')).join(',')}` : '';
				const scored = entry.scorable === false ? ' (no recorded reply)' : '';
				console.log(`${String(index + 1).padStart(2)}. ${entry.accepted ? 'ACCEPT' : 'reject'}[${entry.guardOutcome || '-'}]${facts}${scored}  ${entry.action.slice(0, 52)}${entry.reason ? '  <- ' + entry.reason.slice(0, 90) : ''}`);
			}
			console.log('\n' + JSON.stringify(summary));
		}
		return { summary, report };
	} finally {
		restore();
	}
}

function turnsFromEnv(): BaselineTurn[] | undefined {
	if (!process.env.BASELINE_TURNS) return undefined;
	return (JSON.parse(process.env.BASELINE_TURNS) as string[]).map((action) => ({ action }));
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
	const mode = process.env.BASELINE_MODE === 'live' ? 'live' : process.env.BASELINE_MODE === 'replay' ? 'replay' : 'stub';
	runNarrationBaseline({
		mode,
		models: (process.env.BASELINE_MODELS || '').split(',').map((entry) => entry.trim()).filter(Boolean),
		turns: turnsFromEnv(),
		callCap: Number(process.env.BASELINE_CALL_CAP || 120),
		recordTo: process.env.BASELINE_RECORD,
		replayFrom: process.env.BASELINE_REPLAY,
		outFile: process.env.BASELINE_OUT,
		log: true,
	}).then(() => process.exit(0)).catch((error) => {
		console.error('Baseline failed:', error?.message || error);
		process.exit(1);
	});
}
