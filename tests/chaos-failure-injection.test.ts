/**
 * DREAMVILLE — CHAOS / FAILURE-INJECTION INTEGRATION PASS (system-wide audit)
 *
 * Injects every DeterministicMockAdapter failure mode through the REAL
 * application pipeline (HTTP POST /api/game/action) and asserts the pipeline
 * degrades gracefully instead of corrupting canonical state:
 *
 *   429                  → failover hop, turn still succeeds
 *   500                  → failover hop, turn still succeeds
 *   malformed_json       → corrupt provider output never reaches the player
 *   timeout              → provider genuinely hangs (per-attempt budget ~7s),
 *                          recovery is bounded and the turn still succeeds
 *   illegal_state_change → hostile DELETE_PLAYER proposal reaches turn-package
 *                          validation, is rejected, and the player/inventory/
 *                          location stay canonically intact
 *   total outage         → both registered models disabled → emergency floor
 *                          still narrates (200, non-empty, deterministic)
 *
 * RIG NOTE: the injection is armed on BOTH registered adapters so the failing
 * payload fires no matter which candidate the selector picks (provider
 * failures trip lingering selection degradation — see recordProviderFailure —
 * so a single-adapter injection can be silently skipped). Each injected turn
 * asserts delivery via adapter callHistory, and the timeout segment asserts a
 * real hang occurred (latency floor ≈ the per-attempt provider timeout), so no
 * assertion in this file can pass vacuously.
 *
 * INTEGRATION CLASS: CONTROLLED DETERMINISTIC/MOCK. External AI credentials are
 * unavailable in the audit environment, so providers are deterministic mock
 * adapters; failure handling, validation and canonical invariants are fully
 * exercised. Real-model prose quality is NOT claimed.
 *
 * PROGRESS: each segment appends to artifacts/chaos-progress.log so partial
 * progress survives a process kill.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { Server } from 'http';
import { appendFileSync, mkdirSync } from 'node:fs';
import { gameRouter } from '../server/api/gameRoutes';
import { worldRepository } from '../server/repositories/worldRepository';
import { DeterministicMockAdapter } from '../server/domain/aiOrchestrator';
import type { ModelRegistryRecord, ProviderGenerateOptions, ProviderGenerateResult, TaskId } from '../server/domain/aiOrchestrator';

const STORY = 'chaos_story';
const PRIMARY_MODEL = 'chaos-primary';
const FALLBACK_MODEL = 'chaos-fallback';

const PROGRESS_LOG = 'artifacts/chaos-progress.log';
function logProgress(line: string): void {
  try {
    mkdirSync('artifacts', { recursive: true });
    appendFileSync(PROGRESS_LOG, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    // progress logging must never fail the run
  }
}

let primary!: DeterministicMockAdapter;
let fallback!: DeterministicMockAdapter;
let server!: Server;
let baseUrl = '';
let orchestrator!: ReturnType<typeof worldRepository.getAiOrchestrator>;

/** Mock adapter whose narration varies with the canonical prompt (stable hash),
 * mirroring the marathon rig so anti-repetition machinery is exercised. */
class VariedNarrationMockAdapter extends DeterministicMockAdapter {
  public async generate(task: TaskId, prompt: string, options?: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
    const previous = this.defaultResponse;
    this.defaultResponse = buildVariedResponse(task, prompt);
    try {
      return await super.generate(task, prompt, options);
    } finally {
      this.defaultResponse = previous;
    }
  }
}

function stableHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function buildVariedResponse(task: TaskId, prompt: string): string {
  const actionMatch = String(prompt || '').match(/(?:Latest Player Action|PLAYER ACTION|Player Input|Action Requested|Intent|Latest Action|Action):\s*([^\n]+)/i);
  const action = (actionMatch?.[1] || 'the moment passes').trim().slice(0, 180);
  const locationMatch = String(prompt || '').match(/LOCATION NAME:\s*([^\n]+)/i);
  const location = (locationMatch?.[1] || 'the chamber').trim();
  const h = stableHash(task + '|' + action + '|' + location);
  const openings = [
    `You give the attempt your full attention in ${location}. ${action} — and the moment answers.`,
    `Breath held, you commit. ${action} In ${location}, the outcome takes shape around your intent.`,
    `The work begins at once. ${action} Around you, ${location} keeps its patient rhythm.`,
    `Nothing in ${location} stands still for long. ${action} The response is immediate and concrete.`,
    `You move with intent. ${action} The details of ${location} sharpen around what you just did.`,
  ];
  return JSON.stringify({
    narrative: [openings[h % openings.length]],
    dialogue: [],
    events: ['CHAOS_TURN_PROGRESSED'],
    stateChanges: [],
    memoryCandidates: [`Player acted: ${action.slice(0, 60)}`],
    audioCues: ['soft_chime'],
  });
}

function narrativeModel(providerId: string, modelId: string, priority: number): ModelRegistryRecord {
  return {
    providerId,
    modelId,
    displayName: modelId,
    pool: 'creative',
    capabilities: ['text_generation', 'structured_output', 'creative_writing'],
    contextWindow: 128000,
    health: 'Healthy',
    quota: 'Healthy',
    latencyMs: 1,
    userPriority: priority,
    roleEligibility: ['narrative.generate', 'character.dialogue', 'intent.interpret', 'memory.extract'],
    fallbackEligibility: true,
    accessStatus: 'accessible',
    lifecycleState: 'active',
    supportedInputTypes: ['text'],
    supportedOutputTypes: ['text', 'json'],
    hasStructuredOutput: true,
  } as unknown as ModelRegistryRecord;
}

async function postAction(body: Record<string, unknown>): Promise<{ status: number; data: any; latencyMs: number }> {
  const started = Date.now();
  const res = await fetch(`${baseUrl}/api/game/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, latencyMs: Date.now() - started };
}

/** Per-adapter call delta since the last measurement (callHistory only grows
 * within this process, so deltas are exact). */
let lastPrimaryCalls = 0;
let lastFallbackCalls = 0;
function takeCallDeltas(): { primary: number; fallback: number; total: number } {
  const p = primary.callHistory.length;
  const f = fallback.callHistory.length;
  const d = { primary: p - lastPrimaryCalls, fallback: f - lastFallbackCalls, total: p + f - lastPrimaryCalls - lastFallbackCalls };
  lastPrimaryCalls = p;
  lastFallbackCalls = f;
  return d;
}

/** Canonical fingerprint using the F4 O(1) event-count accessor. */
function canonicalFingerprint(storyId: string = STORY) {
  const player = worldRepository.getPlayerLifecycle(storyId);
  const inventory = worldRepository.getInventoryEngine(storyId).exportState() as any;
  const items: any[] = inventory.items || [];
  return {
    locationId: player?.locationId,
    isTraveling: player?.isTraveling,
    inventoryIds: items.map((i) => i.id).sort(),
    eventCount: worldRepository.getCanonicalCommandEventCount(storyId),
  };
}

/** Disarm both adapters and restore registered-model health. NOTE: this does
 * NOT clear transient-failure cooldowns — the orchestrator deliberately keeps
 * exponential cooldowns (5s→60s) after 429/5XX/timeout failures, and
 * updateModelHealth('Healthy') only resets health, circuit breakers and the
 * consecutive-failure map. Use recoverPipeline() for a full recovery. */
function disarmAdapters(): void {
  for (const adapter of [primary, fallback]) {
    adapter.failureMode = null;
    adapter.maxFailuresBeforeSuccess = 0;
    adapter.failureCount = 0;
  }
  orchestrator.updateModelHealth(primary.providerId, PRIMARY_MODEL, 'Healthy');
  orchestrator.updateModelHealth(fallback.providerId, FALLBACK_MODEL, 'Healthy');
}

function activeCooldownMs(): number {
  const now = Date.now();
  const statuses = orchestrator.getModelRuntimeStatus().filter((s) =>
    (s.providerId === primary.providerId || s.providerId === fallback.providerId));
  return statuses.reduce((max, s) => Math.max(max, (s.cooldownUntil ?? 0) - now), 0);
}

/** Wait out any active provider-failure cooldown (bounded; exponential backoff
 * caps at 60s by design). Fails the test if a cooldown outlives the cap —
 * that would indicate runaway backoff, which is itself a defect. */
async function waitForCooldownExpiry(label: string): Promise<void> {
  const deadline = Date.now() + 75000;
  while (Date.now() < deadline) {
    const remaining = activeCooldownMs();
    if (remaining <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, Math.min(500, remaining)));
  }
  assert.fail(`${label}: provider cooldown still active after 75s (runaway exponential backoff?).`);
}

/** Full recovery: disarm, wait out cooldowns, then run a warm-up turn and
 * REQUIRE it to be served by a registered adapter — this clears
 * consecutiveFailures/cooldown via recordProviderSuccess and proves the
 * selector is healthy again (not silently pinned to the emergency floor). */
async function recoverPipeline(label: string): Promise<void> {
  disarmAdapters();
  await waitForCooldownExpiry(label);
  const warmup = await postAction({ type: 'CUSTOM_ACTION', storyId: STORY, actionText: 'Steady yourself and review the chamber as the instruments settle.' });
  assertTurnSucceeded(warmup, `${label} warm-up`);
  const deltas = takeCallDeltas();
  assert.ok(deltas.total >= 1, `${label} warm-up must be served by a registered adapter (selector recovered), got ${deltas.total} calls.`);
}

/** Arm a failure mode on BOTH adapters so the injected payload fires no matter
 * which candidate the model selector picks. */
function armInjection(mode: NonNullable<DeterministicMockAdapter['failureMode']>, maxFailures: number): void {
  for (const adapter of [primary, fallback]) {
    adapter.failureMode = mode;
    adapter.maxFailuresBeforeSuccess = maxFailures;
  }
}

function assertTurnSucceeded(turn: { status: number; data: any }, label: string): void {
  assert.equal(turn.status, 200, `${label}: action must succeed under injected failure, got HTTP ${turn.status}: ${JSON.stringify(turn.data).slice(0, 250)}`);
  assert.equal(turn.data?.success, true, `${label}: success flag must be true: ${JSON.stringify(turn.data).slice(0, 250)}`);
  assert.match(String(turn.data?.narrativeResponse || ''), /\S+/, `${label}: player must still receive a non-empty narrative.`);
}

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/game', gameRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  worldRepository.seedStory(STORY);
  orchestrator = worldRepository.getAiOrchestrator();
  for (const model of orchestrator.getAllModels()) {
    if (!model.isEmergencyFloor) orchestrator.updateModelHealth(model.providerId, model.modelId, 'DisabledByUser');
  }
  primary = new VariedNarrationMockAdapter('provider_chaos_primary');
  fallback = new VariedNarrationMockAdapter('provider_chaos_fallback');
  const primaryRecord = narrativeModel(primary.providerId, PRIMARY_MODEL, 100);
  const fallbackRecord = narrativeModel(fallback.providerId, FALLBACK_MODEL, 90);
  orchestrator.registerModel(primaryRecord);
  orchestrator.registerModel(fallbackRecord);
  orchestrator.registerAdapter(primary);
  orchestrator.registerAdapter(fallback);
  orchestrator.pinModelForTask('narrative.generate', primaryRecord.modelId);
  orchestrator.setFallbackChain('narrative.generate', [
    `${primary.providerId}::${PRIMARY_MODEL}`,
    `${fallback.providerId}::${FALLBACK_MODEL}`,
    'provider_deterministic_emergency::emergency-fallback-local',
  ]);
  logProgress(`chaos boot complete (${baseUrl})`);
});

after(async () => {
  disarmAdapters();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('Chaos — adapter failure injection through the real action pipeline', () => {
  it('BASELINE — healthy turn before any injection', async () => {
    const before = canonicalFingerprint();
    const turn = await postAction({ type: 'CUSTOM_ACTION', storyId: STORY, actionText: 'Survey the resonance fractures recorded in the archive ledger.' });
    const deltas = takeCallDeltas();
    assertTurnSucceeded(turn, 'baseline');
    assert.ok(deltas.total >= 1, 'healthy turn must exercise the registered AI adapters.');
    const after = canonicalFingerprint();
    assert.equal(after.locationId, before.locationId, 'baseline turn must not move the player.');
    logProgress(`baseline ok (primary ${deltas.primary}, fallback ${deltas.fallback}, ${turn.latencyMs}ms)`);
  });

  it('429 BURST — rate-limited providers fail over, canonical state intact', async () => {
    const before = canonicalFingerprint();
    armInjection('429', 3);
    const turn = await postAction({ type: 'CUSTOM_ACTION', storyId: STORY, actionText: 'Ask the archivist what caused the resonance pulse.' });
    const deltas = takeCallDeltas();
    await recoverPipeline('429');
    assertTurnSucceeded(turn, '429');
    assert.ok(deltas.total >= 1, '429 injection must actually reach a provider (delivery assertion).');
    const after = canonicalFingerprint();
    assert.equal(after.locationId, before.locationId, '429 recovery must not move the player.');
    assert.deepEqual(after.inventoryIds, before.inventoryIds, '429 recovery must not mutate inventory.');
    logProgress(`429 burst ok (primary ${deltas.primary}, fallback ${deltas.fallback}, ${turn.latencyMs}ms)`);
  });

  it('500 ERRORS — provider crashes fail over without corrupting state', async () => {
    const before = canonicalFingerprint();
    armInjection('500', 2);
    const turn = await postAction({ type: 'CUSTOM_ACTION', storyId: STORY, actionText: 'Trace the armature wiring toward the zenith calibration mount.' });
    const deltas = takeCallDeltas();
    await recoverPipeline('500');
    assertTurnSucceeded(turn, '500');
    assert.ok(deltas.total >= 1, '500 injection must actually reach a provider (delivery assertion).');
    const after = canonicalFingerprint();
    assert.equal(after.locationId, before.locationId, '500 recovery must not move the player.');
    assert.deepEqual(after.inventoryIds, before.inventoryIds, '500 recovery must not mutate inventory.');
    logProgress(`500 errors ok (primary ${deltas.primary}, fallback ${deltas.fallback}, ${turn.latencyMs}ms)`);
  });

  it('MALFORMED_JSON — corrupt provider output is rejected, never shown to the player', async () => {
    const before = canonicalFingerprint();
    armInjection('malformed_json', 4);
    const turn = await postAction({ type: 'CUSTOM_ACTION', storyId: STORY, actionText: "Study the resonance fracture coordinates in the archivist's ledger." });
    const deltas = takeCallDeltas();
    await recoverPipeline('malformed_json');
    assertTurnSucceeded(turn, 'malformed_json');
    assert.ok(deltas.total >= 1, 'malformed_json injection must actually reach a provider (delivery assertion).');
    const playerText = JSON.stringify(turn.data);
    assert.equal(
      playerText.includes('<<corrupt>>'),
      false,
      'malformed_json: raw corrupt provider payload must never reach the player-visible response.',
    );
    assert.equal(
      playerText.includes('This is not valid JSON from the model'),
      false,
      'malformed_json: provider error text must never be narrated to the player.',
    );
    const after = canonicalFingerprint();
    assert.equal(after.locationId, before.locationId, 'malformed_json recovery must not move the player.');
    logProgress(`malformed_json ok (primary ${deltas.primary}, fallback ${deltas.fallback}, ${turn.latencyMs}ms)`);
  });

  it('TIMEOUT — providers genuinely hang, recovery is bounded and the turn succeeds', async () => {
    const before = canonicalFingerprint();
    armInjection('timeout', 1);
    const turn = await postAction({ type: 'CUSTOM_ACTION', storyId: STORY, actionText: 'Listen to the low mechanical hum and note anything unusual.' });
    const deltas = takeCallDeltas();
    await recoverPipeline('timeout');
    assertTurnSucceeded(turn, 'timeout');
    // Delivery + REAL-HANG assertions: the hung provider sleeps its full
    // per-attempt budget (timeoutMs + 20ms; ~7s for narrative.generate) before
    // throwing. A recovery faster than 5s would mean the hang never fired and
    // the injection was skipped (vacuous test) — that is a rig failure here.
    assert.ok(deltas.total >= 1, 'timeout injection must actually reach a provider (delivery assertion).');
    assert.ok(
      turn.latencyMs >= 5000,
      `timeout injection must produce a REAL provider hang (>= ~7s per-attempt budget); took only ${turn.latencyMs}ms — injection never fired.`,
    );
    assert.ok(turn.latencyMs < 30000, `timeout recovery must be bounded, took ${turn.latencyMs}ms.`);
    const after = canonicalFingerprint();
    assert.equal(after.locationId, before.locationId, 'timeout recovery must not move the player.');
    logProgress(`timeout ok (primary ${deltas.primary}, fallback ${deltas.fallback}, ${turn.latencyMs}ms — real hang verified)`);
  });

  it('ILLEGAL_STATE_CHANGE — hostile DELETE_PLAYER proposal is rejected, player survives', async () => {
    const before = canonicalFingerprint();
    const playerActorId = worldRepository.getPlayerLifecycle(STORY)?.actorId;
    assert.ok(playerActorId, 'player lifecycle must exist before hostile injection.');

    armInjection('illegal_state_change', 2);
    const turn = await postAction({ type: 'CUSTOM_ACTION', storyId: STORY, actionText: 'Wonder aloud about what could silence something as vast as the orrery.' });
    const deltas = takeCallDeltas();
    await recoverPipeline('illegal_state_change');

    // Delivery: the hostile payload must have actually been produced by a
    // registered adapter and reach turn-package validation — otherwise this
    // segment proves nothing.
    assert.ok(deltas.total >= 1, 'illegal_state_change injection must actually reach a provider (delivery assertion).');

    // The hostile payload ("Illegal mutation attempt." / DELETE_PLAYER) must be
    // discarded: the turn still succeeds and the hostile text is never narrated.
    assertTurnSucceeded(turn, 'illegal_state_change');
    const playerText = JSON.stringify(turn.data);
    assert.equal(
      playerText.includes('Illegal mutation attempt'),
      false,
      'illegal_state_change: hostile provider text must never be narrated to the player.',
    );

    // The player, location and inventory must be canonically intact.
    const player = worldRepository.getPlayerLifecycle(STORY);
    assert.ok(player, 'DEFECT CHECK: hostile DELETE_PLAYER removed the player lifecycle.');
    assert.equal(player.actorId, playerActorId, 'player identity must survive the hostile proposal.');
    const after = canonicalFingerprint();
    assert.equal(after.locationId, before.locationId, 'hostile proposal must not move the player.');
    assert.deepEqual(after.inventoryIds, before.inventoryIds, 'hostile proposal must not mutate inventory.');
    assert.equal(after.isTraveling, false, 'hostile proposal must not corrupt travel state.');
    logProgress(`illegal_state_change ok (primary ${deltas.primary}, fallback ${deltas.fallback}, ${turn.latencyMs}ms; player intact)`);

    // Post-injection sanity: a clean turn on the recovered pipeline still works.
    const cleanTurn = await postAction({ type: 'CUSTOM_ACTION', storyId: STORY, actionText: 'Ask the archivist whether the subterranean seals are sound.' });
    takeCallDeltas();
    assertTurnSucceeded(cleanTurn, 'post-illegal clean turn');
  });

  it('TOTAL OUTAGE — both models disabled, emergency floor keeps the game playable', async () => {
    orchestrator.updateModelHealth(primary.providerId, PRIMARY_MODEL, 'DisabledByUser');
    orchestrator.updateModelHealth(fallback.providerId, FALLBACK_MODEL, 'DisabledByUser');
    const turn = await postAction({ type: 'CUSTOM_ACTION', storyId: STORY, actionText: 'Hold the workbench and watch the chamber floor for movement.' });
    const deltas = takeCallDeltas();
    await recoverPipeline('total_outage');
    assertTurnSucceeded(turn, 'total_outage');
    assert.equal(deltas.total, 0, 'total outage must not reach the registered (disabled) providers.');
    logProgress(`total outage ok (emergency floor narrated, registered-provider calls ${deltas.total}, ${turn.latencyMs}ms)`);
  });

  it('RECOVERY — pipeline returns to fully healthy operation after all injections', async () => {
    const before = canonicalFingerprint();
    const turn = await postAction({ type: 'CUSTOM_ACTION', storyId: STORY, actionText: 'Compare tonight’s resonance readings against the chronicle baseline.' });
    const deltas = takeCallDeltas();
    assertTurnSucceeded(turn, 'recovery');
    assert.ok(deltas.total >= 1, 'recovered pipeline must exercise the registered AI adapters again.');
    const after = canonicalFingerprint();
    assert.equal(after.locationId, before.locationId, 'recovery turn must not move the player.');
    assert.ok(after.eventCount >= before.eventCount, 'canonical event ledger must keep progressing.');
    logProgress(`recovery ok (primary ${deltas.primary}, fallback ${deltas.fallback}, ${turn.latencyMs}ms)`);
  });
});
