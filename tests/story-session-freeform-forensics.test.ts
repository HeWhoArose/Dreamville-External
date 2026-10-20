import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { Server } from 'http';
import { gameRouter } from '../server/api/gameRoutes';
import { worldRepository } from '../server/repositories/worldRepository';
import { DeterministicMockAdapter } from '../server/domain/aiOrchestrator';
import type { ModelRegistryRecord, ProviderGenerateOptions, ProviderGenerateResult, TaskId } from '../server/domain/aiOrchestrator';

/**
 * Phase 0 recorder coverage (X5a). A freeform narration turn used to be recorded without its
 * forensic payload (intent, situation, plan, research, prompt, attempts), and an export after a
 * failed-narration turn failed integrity validation. This test locks in both fixes and proves
 * the forensic payload is never returned to the client.
 */
const STORY = 'forensics_freeform_story';
const GOOD_ACTION = 'I move closer and listen to the disturbance.';
let server!: Server;
let baseUrl = '';

class GoodAdapter extends DeterministicMockAdapter {
  public async generate(task: TaskId, prompt: string, options?: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
    const previous = this.defaultResponse;
    this.defaultResponse = JSON.stringify({
      narrative: [
        `${options?.playerAction || GOOD_ACTION} Inside The Whispering Orrery, the largest brass ring grinds a quarter turn and a thin plume of dust drops from the vault ceiling; Maren the Archivist lifts her head sharply, pen frozen above her ledger.`,
      ],
      dialogue: [], events: ['FORENSICS_TURN'], stateChanges: [], memoryCandidates: [], audioCues: [],
    });
    try { return await super.generate(task, prompt, options); } finally { this.defaultResponse = previous; }
  }
}

class BadAdapter extends DeterministicMockAdapter {
  public async generate(task: TaskId, prompt: string, options?: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
    const previous = this.defaultResponse;
    this.defaultResponse = 'not valid json {{{';
    try { return await super.generate(task, prompt, options); } finally { this.defaultResponse = previous; }
  }
}

function model(providerId: string, modelId: string, priority: number): ModelRegistryRecord {
  return {
    providerId, modelId, displayName: modelId, pool: 'creative',
    capabilities: ['text_generation', 'structured_output', 'creative_writing'], contextWindow: 128000,
    health: 'Healthy', quota: 'Healthy', latencyMs: 1, userPriority: priority,
    roleEligibility: ['narrative.generate', 'character.dialogue', 'intent.interpret', 'memory.extract', 'narrative.review'],
    fallbackEligibility: true, accessStatus: 'accessible', lifecycleState: 'active',
    supportedInputTypes: ['text'], supportedOutputTypes: ['text', 'json'], hasStructuredOutput: true,
  } as unknown as ModelRegistryRecord;
}

async function postAction(actionText: string) {
  const res = await fetch(`${baseUrl}/api/game/action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'CUSTOM_ACTION', storyId: STORY, actionText }),
  });
  return { status: res.status, raw: await res.text() };
}

async function exportRecording() {
  const res = await fetch(`${baseUrl}/api/game/story-session/export?storyId=${STORY}`);
  const body: any = await res.json();
  return { status: res.status, body };
}

describe('freeform narration turns are fully recorded without leaking forensics', () => {
  let good!: GoodAdapter;
  let bad!: BadAdapter;
  let orchestrator!: ReturnType<typeof worldRepository.getAiOrchestrator>;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/game', gameRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
    worldRepository.seedStory(STORY);
    orchestrator = worldRepository.getAiOrchestrator();
    for (const registered of orchestrator.getAllModels()) {
      if (!registered.isEmergencyFloor) orchestrator.updateModelHealth(registered.providerId, registered.modelId, 'DisabledByUser');
    }
    good = new GoodAdapter('provider_forensics_good');
    bad = new BadAdapter('provider_forensics_bad');
    orchestrator.registerModel(model(good.providerId, 'forensics-good', 90));
    orchestrator.registerAdapter(good);
    orchestrator.registerModel(model(bad.providerId, 'forensics-bad', 100));
    orchestrator.registerAdapter(bad);
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('records intent, situation, plan, research, prompt, package and attempts for a successful turn, and never returns them', async () => {
    orchestrator.setFallbackChain('narrative.generate', [`${good.providerId}::forensics-good`, 'provider_deterministic_emergency::emergency-fallback-local']);
    const response = await postAction(GOOD_ACTION);
    assert.equal(response.status, 200);
    const data = JSON.parse(response.raw);
    assert.ok(data.narrativeResponse, 'the turn must narrate for this test to be meaningful');

    // No forensic fields in the client response.
    // The response shape is unchanged by recording: same top-level keys as before the change.
    assert.deepEqual(Object.keys(data).sort(), ['actionAdvice', 'actionId', 'authoritativeFeedback', 'message', 'narrativeGeneration', 'narrativeResponse', 'requestType', 'status', 'success', 'viewState']);
    for (const forbidden of ['forensicContext', 'forensicSink', 'narrationPrompt', 'narrationStyleInstruction', 'researchPacket', 'currentSituation']) {
      const at = response.raw.indexOf(`"${forbidden}"`);
      assert.equal(at >= 0, false, `response must not contain ${forbidden}: ...${at >= 0 ? response.raw.slice(Math.max(0, at - 80), at + 120) : ''}`);
    }

    const exported = await exportRecording();
    assert.equal(exported.status, 200, JSON.stringify(exported.body));
    const turns = exported.body.recording.interactions.filter((i: any) => i.kind === 'DIRECT_TURN');
    assert.equal(turns.length, 1);
    const turn = turns[0].turn;
    assert.ok(turn, 'DIRECT_TURN must carry a forensic turn payload');
    assert.equal(turn.task, 'narrative.generate');
    assert.equal(turn.playerAction, GOOD_ACTION);
    assert.ok(turn.playerIntent && typeof turn.playerIntent === 'object', 'player intent recorded');
    assert.ok(turn.currentSituation && typeof turn.currentSituation === 'object', 'current situation recorded');
    assert.ok(turn.narrativePlan, 'narrative plan recorded');
    assert.ok(turn.researchPacket, 'research packet recorded');
    assert.equal(typeof turn.narrationPrompt, 'string');
    assert.ok(turn.narrationPrompt.length > 50, 'narration prompt recorded');
    assert.ok(turn.turnPackage?.narrative?.length, 'turn package recorded');
    assert.ok(Array.isArray(turn.attemptsTrail) && turn.attemptsTrail.length >= 1, 'attempts trail recorded');
    assert.equal(turn.attemptsTrail[0].status, 'SUCCESS');
    assert.equal(turn.telemetry.providerId, good.providerId);
    assert.equal(turn.telemetry.success, true);
  });

  it('records a failed-narration turn and still exports a valid recording', async () => {
    orchestrator.setFallbackChain('narrative.generate', [`${bad.providerId}::forensics-bad`, 'provider_deterministic_emergency::emergency-fallback-local']);
    const response = await postAction('I inspect the source of the disturbance.');
    assert.equal(response.status, 200);
    const data = JSON.parse(response.raw);
    assert.equal(Boolean(data.narrativeResponse), false);
    assert.ok(data.narrativeError, 'the failure is reported to the player as before');

    // The previous regression: a success turn followed by a failure turn broke export validation.
    const exported = await exportRecording();
    assert.equal(exported.status, 200, JSON.stringify(exported.body));
    assert.equal(exported.body.validation.valid, true);
    assert.equal(exported.body.recording.schemaVersion, '1.2.0');

    const turns = exported.body.recording.interactions.filter((i: any) => i.kind === 'DIRECT_TURN');
    assert.equal(turns.length, 2);
    const failed = turns[1].turn;
    assert.ok(failed, 'failed narration turns are recorded with their forensic payload');
    assert.equal(failed.telemetry.success, false);
    assert.ok(failed.playerIntent, 'intent is recorded even when narration fails');
    assert.ok(Array.isArray(failed.attemptsTrail) && failed.attemptsTrail.length >= 1, 'attempts recorded for the failure');
    assert.ok(failed.attemptsTrail.some((attempt: any) => attempt.status === 'FAILED' && attempt.error), 'rejection reasons are recorded');
  });

  it('consumes the staged payload exactly once', () => {
    assert.equal((worldRepository as any).stagedStorySessionTurns.size, 0);
  });
});
