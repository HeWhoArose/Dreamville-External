// P9: long-session verification driver. Runs a coherent 100-turn scenario through the
// REAL HTTP action pipeline with deterministic mock providers (same contract the
// marathon integration test uses), segmented so sandbox memory limits don't kill it.
// Turns are dependency-chained: exploration → dialogue → memory → travel → degradation.
import express from 'express';
import { gameRouter } from '../server/api/gameRoutes';
import { worldRepository } from '../server/repositories/worldRepository';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';

const STORY = 'audit_longsession_story';
const PORT_BASE = process.env.LONGSESS_PORT || '0';
const START = Number(process.env.LONGSESS_START || '1');
const END = Number(process.env.LONGSESS_END || '100');
const OUT = process.env.LONGSESS_OUT || 'tests/artifacts/longsession_progress.json';

let baseUrl = '';
let server: any;

function actionLine(turn: number): string {
  // Dependency-chained narrative: each block builds on prior turns.
  const blocks: Array<(t: number) => string> = [
    (t) => ['Survey theorery chamber and note the halted astral rings.',
            'Inspect the third prism ring fractures closely.',
            'Listen for the mechanical hum near the spindle.',
            'Study resonance fractures recorded in the ledger.'][t % 4],
    (t) => ['Speak with Maren the Archivist about the stopped rings.',
            'Ask Maren what she believes caused the resonance pulse.',
            'Ask Maren whether the vault seals held during the tremor.',
            'Promise Maren you will help restore calibration.'][t % 4],
    (t) => ['Ask Maren to recall the exact sound the rings made when they stopped.',
            'Reference the fractures from earlier and ask what follows.',
            'Ask the archivist whether she trusts the subterranean seals.',
            'Wonder aloud what could silence the great orrery.'][t % 4],
    (t) => ['Walk to the central exchange through the main conduit.',
            'Move to the Lantern Vault entrance and observe the seals.',
            'Search the terrace for traces of the absent master.',
            'Return to the archive chamber to report your findings.'][t % 4],
    (t) => ['Ask Maren for her archive signet as proof of authority.',
            'Examine the subterranean conduit pressure gauges with Maren.',
            'Attempt to purchase a tallow lamp at the exchange.',
            'Wait by the orrery and watch the evening cycle.'][t % 4],
  ];
  return blocks[Math.floor((turn - 1) / 20) % blocks.length](turn - 1);
}

async function boot() {
  const app = express();
  app.use(express.json());
  app.use('/api/game', gameRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(Number(PORT_BASE), '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
  worldRepository.seedStory(STORY);
  const orchestrator = worldRepository.getAiOrchestrator();
  for (const model of orchestrator.getAllModels()) {
    if (!model.isEmergencyFloor) orchestrator.updateModelHealth(model.providerId, model.modelId, 'DisabledByUser');
  }
  // Deterministic varied narration provider so turns are realistic without live APIs.
  const mock = {
    providerId: 'provider_longsession_mock',
    async generate(task: string, prompt: string, opts?: any) {
      const action = String(opts?.playerAction || prompt).slice(0, 160);
      const text = JSON.stringify({
        narrative: [`The turn resolves: ${action}. The scene holds its committed canonical state and the city hums around it.`],
        dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [],
      });
      return { text, latencyMs: 2, inputTokens: 10, outputTokens: 30, modelId: 'longsession-mock', providerId: 'provider_longsession_mock' };
    },
    async validateCredentials() { return true; },
  };
  (orchestrator as any).registerAdapter(mock);
  const record = {
    providerId: 'provider_longsession_mock', modelId: 'longsession-mock', displayName: 'long-session mock',
    pool: 'fast', capabilities: ['text_generation'], contextWindow: 128000, health: 'Healthy',
    quota: 'Healthy', latencyMs: 2, roleEligibility: ['narrative.generate', 'narrative.review'],
  };
  (orchestrator as any).registerModel(record);
  orchestrator.setFallbackChain('narrative.generate', ['provider_longsession_mock::longsession-mock', 'provider_deterministic_emergency::emergency-fallback-local'] as any);
}

async function postAction(actionText: string) {
  const res = await fetch(`${baseUrl}/api/game/action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'CUSTOM_ACTION', storyId: STORY, actionText }),
  });
  return { status: res.status, data: await res.json() };
}

async function main() {
  await boot();
  const progress: any[] = [];
  for (let turn = START; turn <= END; turn += 1) {
    const line = actionLine(turn);
    const { status, data } = await postAction(line);
    const ok = status === 200 && data.success === true;
    progress.push({ turn, ok, narrative: (data.narrativeResponse || '').slice(0, 120), generation: data.narrativeGeneration });
    if (!ok) { console.error(`TURN ${turn} FAILED: HTTP ${status} ${JSON.stringify(data).slice(0,300)}`); break; }
    if (turn % 10 === 0) {
      (await import("node:fs")).default.writeFileSync(OUT, JSON.stringify({ lastTurn: turn, progress: progress.slice(-10) }, null, 2));
      console.log(`turn ${turn}/${END} ok`);
    }
  }
  const failed = progress.filter((p: any) => !p.ok);
  console.log(`LONGSESSION RESULT: attempted=${progress.length} ok=${progress.length - failed.length} failed=${failed.length}`);
  (await import("node:fs")).default.writeFileSync(OUT, JSON.stringify({ lastTurn: START + progress.length - 1, total: progress.length, failures: failed.length, tail: progress.slice(-6) }, null, 2));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.exit(failed.length > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
