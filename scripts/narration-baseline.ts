/**
 * Narration baseline: plays a scripted set of turns on the authored Ren world pack through the real /action
 * pipeline and reports, per turn, whether narration was accepted, why it was rejected, and whether the fact that
 * answers the question actually reached the model's prompt.
 *
 *   npm run narration:baseline                      # stub mode: no network, checks prompt contents only
 *   BASELINE_MODE=live GEMINI_API_KEY=... GROQ_KEY=... \
 *     BASELINE_MODELS=gemini-3.5-flash-lite,groq::qwen/qwen3.8-27b npm run narration:baseline
 *
 * Environment (all optional): BASELINE_MODE=stub|live (default stub), BASELINE_MODELS (comma list; bare ids are Gemini,
 * `provider::model` otherwise), GEMINI_API_KEY, GROQ_KEY, BASELINE_CALL_CAP (live provider requests, default 120),
 * BASELINE_OUT (JSON report path), BASELINE_TURNS (JSON array of action strings), NARRATION_RECENT_TURNS (prompt history window).
 *
 * Safety: the tracked orchestrator config is backed up first and restored afterwards, and the temporary
 * provider credential file is removed. Keys are read from the environment only and never written to the report.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

const ROOT = process.cwd();
const CONFIG = path.join(ROOT, 'server/data/orchestrator_config.json');
const CREDENTIALS = path.join(ROOT, 'server/data/.provider_credentials.json');
const MODE = process.env.BASELINE_MODE === 'live' ? 'live' : 'stub';
const CALL_CAP = Number(process.env.BASELINE_CALL_CAP || 120);
const OUT = process.env.BASELINE_OUT || path.join(ROOT, 'tests/artifacts/narration_baseline_latest.json');

/** Each scripted turn, with the substrings that a correct answer (and therefore the prompt) must contain. */
const DEFAULT_TURNS: Array<{ action: string; expectFacts?: string[]; moveTo?: string }> = [
	{ action: 'I look around the office and check my desk for anything about the Pendelton case.' },
	{ action: 'Who found the body?', expectFacts: ['Okafor'] },
	{ action: 'Where exactly was he found?', expectFacts: ['Pier 4'] },
	{ action: 'I ask Mei what the police have said so far.', expectFacts: ['Calder'] },
	{ action: 'What did they say about the bullet casing?', expectFacts: ['.38'] },
	{ action: 'I head out to the docks.' },
	{ action: 'I examine the bloodstain.', moveTo: 'loc_warehouse_docks' },
	{ action: 'So who found the body again?', expectFacts: ['Okafor'] },
];

function turnsFromEnv(): Array<{ action: string; expectFacts?: string[]; moveTo?: string }> {
	if (!process.env.BASELINE_TURNS) return DEFAULT_TURNS;
	return (JSON.parse(process.env.BASELINE_TURNS) as string[]).map((action) => ({ action }));
}

const requestBodies: string[] = [];
let providerCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
	const url = typeof input === 'string' ? input : input?.url || String(input);
	const isGeminiChat = url.includes('generativelanguage.googleapis.com') && /:(stream)?generateContent/i.test(url);
	const isGroqChat = url.includes('api.groq.com') && url.includes('/chat/completions');
	if (isGeminiChat || isGroqChat) {
		requestBodies.push(String(init?.body || ''));
		if (MODE === 'stub') {
			const canned = JSON.stringify({ narrative: ['STUB'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [], visualCues: [] });
			const payload = isGeminiChat
				? { candidates: [{ content: { role: 'model', parts: [{ text: canned }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } }
				: { id: 'stub', choices: [{ index: 0, message: { role: 'assistant', content: canned }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
			return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
		}
		if (providerCalls >= CALL_CAP) throw new Error(`BASELINE_CALL_CAP (${CALL_CAP}) reached`);
		providerCalls += 1;
	}
	return realFetch(input, init);
}) as typeof fetch;

async function main(): Promise<void> {
	const configBackup = fs.existsSync(CONFIG) ? fs.readFileSync(CONFIG) : null;
	const restore = () => {
		if (configBackup) fs.writeFileSync(CONFIG, configBackup);
		if (fs.existsSync(CREDENTIALS)) fs.rmSync(CREDENTIALS);
	};
	try {
		if (MODE === 'stub') process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'stub-key';
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

		const models = (process.env.BASELINE_MODELS || 'gemini-3.5-flash-lite').split(',').map((entry) => entry.trim()).filter(Boolean);
		const full = (id: string) => (id.includes('::') ? id : `google_gemini::${id}`);
		if (process.env.GEMINI_API_KEY) await post('/orchestrator/providers/google_gemini/key', { apiKey: process.env.GEMINI_API_KEY });
		if (process.env.GROQ_KEY) await post('/orchestrator/providers/groq/key', { apiKey: process.env.GROQ_KEY });

		const orchestrator = worldRepository.getAiOrchestrator();
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

		const turns = turnsFromEnv();
		const report: any[] = [];
		for (const turn of turns) {
			if (turn.moveTo) {
				const player = worldRepository.getPlayerLifecycle(storyId);
				if (player) worldRepository.updatePlayerLifecycle(storyId, player.copyWith({ locationId: turn.moveTo }));
			}
			const firstBody = requestBodies.length;
			const response = await post('/action', { storyId, type: 'CUSTOM_ACTION', actionText: turn.action });
			const body = response.json || {};
			const prompts = requestBodies.slice(firstBody);
			const factsInPrompt = (turn.expectFacts || []).map((fact) => ({ fact, inPrompt: prompts.some((prompt) => prompt.includes(fact)) }));
			const error = body.narrativeError;
			report.push({
				action: turn.action,
				accepted: !error && Boolean(body.narrativeResponse),
				reason: error ? `${error.code}: ${String(error.fallbackReason || error.message || '').slice(0, 220)}` : undefined,
				providerAttempts: prompts.length,
				route: body.narrativeGeneration ? `${body.narrativeGeneration.providerId}/${body.narrativeGeneration.modelId}` : undefined,
				factsInPrompt,
				narration: String(body.narrativeResponse || '').slice(0, 600),
			});
		}

		const accepted = report.filter((entry) => entry.accepted).length;
		const withFacts = report.filter((entry) => entry.factsInPrompt.length > 0);
		const factsDelivered = withFacts.filter((entry) => entry.factsInPrompt.every((f: any) => f.inPrompt)).length;
		const summary = { mode: MODE, models, turns: report.length, accepted, informationTurnsWithFactInPrompt: `${factsDelivered}/${withFacts.length}`, providerCalls: MODE === 'live' ? providerCalls : 0 };

		fs.mkdirSync(path.dirname(OUT), { recursive: true });
		fs.writeFileSync(OUT, JSON.stringify({ summary, report }, null, 2));
		console.log('\nNarration baseline');
		for (const [index, entry] of report.entries()) {
			const facts = entry.factsInPrompt.length ? ` facts-in-prompt=${entry.factsInPrompt.map((f: any) => (f.inPrompt ? 'yes' : 'NO')).join(',')}` : '';
			console.log(`${String(index + 1).padStart(2)}. ${entry.accepted ? 'ACCEPT' : 'reject'}${facts}  ${entry.action.slice(0, 52)}${entry.reason ? '  <- ' + entry.reason.slice(0, 90) : ''}`);
		}
		console.log('\n' + JSON.stringify(summary));
		console.log('Report written to', path.relative(ROOT, OUT));
		server.close();
	} finally {
		restore();
	}
}

main().then(() => process.exit(0)).catch((error) => {
	console.error('Baseline failed:', error?.message || error);
	process.exit(1);
});
