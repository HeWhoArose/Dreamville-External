// Phase A-B-C-D system audit: cross-phase seams.
//
// Locks two defects found by auditing the phases *together* (each phase's own suite
// passed; the seam between them was wrong):
//   B-FIND-1 — keyword-baseline retrieval parity: with no embeddings the order must be
//              byte-identical to the pre-Phase-B keyword baseline (stable insertion order
//              for tied scores), not re-sorted by id.
//   C-FIND-4 — reflection synthesis must reach production-shaped memories, where NPC
//              involvement lives in `relatedEntityIds` (subject is the player), not
//              `subjectEntityId == npcId`.
import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { MemoryOpportunityEngine } from '../server/domain/memoryOpportunityEngine';
import { synthesizeNpcReflections } from '../server/domain/npcReflectionEngine';
import { NarrativeSummaryLifecycle } from '../server/domain/narrativeSummaryLifecycle';

const STORY = 'phase_abcd_system';
const NPC_ID = 'npc_system_audit';

function storeMemory(
  repo: InMemoryWorldRepository,
  id: string,
  overrides: Record<string, unknown> = {},
): void {
  repo.getMemoryEngine(STORY).storeMemory({
    id,
    storyId: STORY,
    memoryClass: 'EPISODIC',
    subjectEntityId: `player_actor_${STORY}`,
    relatedEntityIds: [],
    content: 'A durable memory with identical retrieval signals.',
    importance: 50,
    confidence: 0.7,
    status: 'active',
    visibility: 'PUBLIC',
    accessibleToEntityIds: [],
    isPersistentCritical: false,
    provenance: 'phase_abcd_system',
    perspective: 'SUBJECTIVE',
    validFromTurn: 1,
    lastRecalledTurn: 1,
    createdAtTimestamp: 1,
    lastRecalledTimestamp: 1,
    triggerConditionTags: [],
    ...overrides,
  } as any);
}

test('B-FIND-1: keyword-baseline retrieval keeps stable insertion order for tied scores (no embeddings)', () => {
  const engine = new MemoryOpportunityEngine();
  // Two memories with identical scoring signals, inserted z-then-a.
  engine.storeMemory({
    id: 'zzz_mem', storyId: 's', memoryClass: 'EPISODIC', subjectEntityId: 'player',
    relatedEntityIds: [], content: 'same content tokens', importance: 50, confidence: 0.7,
    status: 'active', visibility: 'PUBLIC', accessibleToEntityIds: ['player'],
    isPersistentCritical: false, provenance: 't', perspective: 'SUBJECTIVE', validFromTurn: 1,
    lastRecalledTurn: 1, createdAtTimestamp: 1, lastRecalledTimestamp: 1, triggerConditionTags: [],
  } as any);
  engine.storeMemory({
    id: 'aaa_mem', storyId: 's', memoryClass: 'EPISODIC', subjectEntityId: 'player',
    relatedEntityIds: [], content: 'same content tokens', importance: 50, confidence: 0.7,
    status: 'active', visibility: 'PUBLIC', accessibleToEntityIds: ['player'],
    isPersistentCritical: false, provenance: 't', perspective: 'SUBJECTIVE', validFromTurn: 1,
    lastRecalledTurn: 1, createdAtTimestamp: 1, lastRecalledTimestamp: 1, triggerConditionTags: [],
  } as any);

  const order = engine
    .retrieveMemories({ storyId: 's', viewerActorId: 'player', queryKeywords: [], maxResults: 5 })
    .map((memory) => memory.id);
  assert.deepEqual(order, ['zzz_mem', 'aaa_mem'], 'baseline parity: insertion order must survive tied scores');

  // The evidence view keeps the same baseline order and score labels.
  const evidence = engine.retrieveMemoriesWithEvidence({ storyId: 's', viewerActorId: 'player', queryKeywords: [], maxResults: 5 });
  assert.deepEqual(evidence.map((entry) => entry.memory.id), order);
  for (const entry of evidence) assert.equal(entry.score, entry.baselineScore);
});

test('C-FIND-4: production-shaped memories (subject=player, NPC in relatedEntityIds) synthesize a reflection', () => {
  const repo = new InMemoryWorldRepository({ disablePersistence: true });
  repo.seedStory(STORY);
  const player = repo.getPlayerLifecycle(STORY)!;
  repo.saveEntityCard(STORY, {
    id: NPC_ID, storyId: STORY, worldId: 'default_world', name: 'Maren',
    kind: 'NPC', templateId: undefined, isTemplate: false,
    identity: { aliases: ['Maren'] },
    classification: { tags: [], role: 'NPC' },
    personality: { traits: [], values: [], motivations: [], fears: [], desires: [] },
    behavior: { priorities: [] },
    social: { factionIds: [], reputation: {}, relationships: {} },
    worldState: { locationId: player.locationId, currentActivity: 'sorting charts', currentGoal: 'sorting charts', isAlive: true, presence: 'present' },
    traits: [], capabilities: [], feats: [], equipment: [], memoryRefs: [],
    lifecycle: { status: 'ACTIVE' },
    provenance: { source: 'PHASE_ABCD_SYSTEM', createdBy: 'SYSTEM', confidence: 1 },
    metadata: {}, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  } as any);

  // Exactly how NarrativeMemoryLifecycle writes a real turn: subject is the player, the
  // NPC is referenced through relatedEntityIds.
  for (let index = 0; index < 6; index += 1) {
    storeMemory(repo, `turn_memory_${index}`, {
      subjectEntityId: player.actorId,
      relatedEntityIds: [NPC_ID],
      accessibility: undefined,
      accessibleToEntityIds: [player.actorId],
      content: `Maren watched the player handle the ledger entry ${index + 1} at the reading desk.`,
      visibility: 'SHARED',
    });
  }

  const result = synthesizeNpcReflections({ repository: repo, storyId: STORY, viewerActorId: player.actorId });
  assert.ok(result.synthesized >= 1, 'a reflection must form from production-shaped memories');
  const reflections = repo.getDynamicCharacterAgencyEngine(STORY).getRelationshipReflections(STORY, NPC_ID, player.actorId);
  assert.ok(reflections.length >= 1);
  assert.equal(reflections[0].confidence < 1, true);
  assert.ok(reflections[0].tags.includes('NPC_REFLECTION'));
});

test('A-C seam: a scene-summary chunk and a reflection can persist side by side (no lost update)', async () => {
  const repo = new InMemoryWorldRepository({ disablePersistence: true });
  repo.seedStory(STORY);
  const run = repo.getStoryRun(STORY)!;
  run.runtimeState = {
    ...(run.runtimeState || {}),
    narrativeContextHistory: [1, 2, 3].map((n) => ({
      turnNumber: n,
      playerAction: `Player action ${n}`,
      narration: `Maren sorts the Iron Citadel ledgers on turn ${n}.`,
      locationId: 'loc_whispering_orrery',
    })),
  };
  repo.saveStoryRun(run);
  const player = repo.getPlayerLifecycle(STORY)!;
  repo.saveEntityCard(STORY, {
    id: NPC_ID, storyId: STORY, worldId: 'default_world', name: 'Maren', kind: 'NPC',
    templateId: undefined, isTemplate: false, identity: { aliases: ['Maren'] },
    classification: { tags: [], role: 'NPC' },
    personality: { traits: [], values: [], motivations: [], fears: [], desires: [] },
    behavior: { priorities: [] }, social: { factionIds: [], reputation: {}, relationships: {} },
    worldState: { locationId: player.locationId, currentActivity: 'sorting', currentGoal: 'sorting', isAlive: true, presence: 'present' },
    traits: [], capabilities: [], feats: [], equipment: [], memoryRefs: [], lifecycle: { status: 'ACTIVE' },
    provenance: { source: 'PHASE_ABCD_SYSTEM', createdBy: 'SYSTEM', confidence: 1 },
    metadata: {}, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  } as any);

  for (let index = 0; index < 6; index += 1) {
    storeMemory(repo, `seam_memory_${index}`, {
      subjectEntityId: player.actorId,
      relatedEntityIds: [NPC_ID],
      accessibleToEntityIds: [player.actorId],
      content: `Maren discussed the Iron Citadel gate record with the player, run ${index + 1}.`,
      visibility: 'SHARED',
    });
  }
  synthesizeNpcReflections({ repository: repo, storyId: STORY, viewerActorId: player.actorId });

  const summary = await NarrativeSummaryLifecycle.maybeGenerateSummary({ repository: repo, storyId: STORY, force: true });
  assert.equal(summary.generated, true);

  const after = repo.getStoryRun(STORY)!;
  assert.ok((after.runtimeState as any)?.plot?.chunkSummaries?.length >= 1, 'summary chunk persisted');
  const reflections = repo.getDynamicCharacterAgencyEngine(STORY).getRelationshipReflections(STORY, NPC_ID, player.actorId);
  assert.ok(reflections.length >= 1, 'the earlier reflection survived the summary write');
});

test('A-FIND-2: a concurrent committed write during the awaited summary provider call is not clobbered', async () => {
  const repo = new InMemoryWorldRepository({ disablePersistence: true });
  repo.seedStory(STORY);
  const run = repo.getStoryRun(STORY)!;
  run.runtimeState = {
    ...(run.runtimeState || {}),
    narrativeContextHistory: [1, 2, 3].map((n) => ({
      turnNumber: n,
      playerAction: `Player action ${n}`,
      narration: `The Iron Citadel ledger is reviewed on turn ${n}.`,
      locationId: 'loc_whispering_orrery',
    })),
  };
  repo.saveStoryRun(run);

  // The provider call awaits; during that window a concurrent turn commits and mutates
  // runtime state. The summary writer must merge, not overwrite the stale snapshot.
  const orchestrator = {
    async executeTaskGeneration() {
      const concurrent = repo.getStoryRun(STORY)!;
      concurrent.runtimeState = {
        ...(concurrent.runtimeState || {}),
        concurrentMarker: 'must-survive',
        plot: {
          ...((concurrent.runtimeState as any).plot || {}),
          beats: [{ id: 'beat_concurrent', text: 'A concurrent turn committed mid-summary.', tags: [], timestamp: '2026-10-01T00:00:00.000Z' }],
        },
      };
      repo.saveStoryRun(concurrent);
      return {
        text: 'The player reviewed the Iron Citadel ledger across three turns with Maren while the latest scene remained quiet.',
        providerId: 'test_provider',
        modelId: 'test_model',
        source: 'AI',
      };
    },
  } as any;

  const result = await NarrativeSummaryLifecycle.maybeGenerateSummary({
    repository: repo,
    storyId: STORY,
    orchestrator,
    force: true,
  });
  assert.equal(result.generated, true);

  const after = repo.getStoryRun(STORY)!;
  const state = after.runtimeState as any;
  assert.equal(state.concurrentMarker, 'must-survive', 'concurrent top-level write must survive');
  assert.ok(
    Array.isArray(state.plot?.beats) && state.plot.beats.some((beat: any) => beat.id === 'beat_concurrent'),
    'concurrent plot beat must survive the summary write',
  );
  assert.ok(Array.isArray(state.plot?.chunkSummaries) && state.plot.chunkSummaries.length >= 1, 'summary chunk persisted');
});

test('C-FIND-4 guard: public world-event memories about an NPC do not seed beliefs about the viewer', () => {
  const repo = new InMemoryWorldRepository({ disablePersistence: true });
  repo.seedStory(STORY);
  const player = repo.getPlayerLifecycle(STORY)!;
  repo.saveEntityCard(STORY, {
    id: NPC_ID, storyId: STORY, worldId: 'default_world', name: 'Maren', kind: 'NPC',
    templateId: undefined, isTemplate: false, identity: { aliases: ['Maren'] },
    classification: { tags: [], role: 'NPC' },
    personality: { traits: [], values: [], motivations: [], fears: [], desires: [] },
    behavior: { priorities: [] }, social: { factionIds: [], reputation: {}, relationships: {} },
    worldState: { locationId: player.locationId, currentActivity: 'sorting', currentGoal: 'sorting', isAlive: true, presence: 'present' },
    traits: [], capabilities: [], feats: [], equipment: [], memoryRefs: [], lifecycle: { status: 'ACTIVE' },
    provenance: { source: 'PHASE_ABCD_SYSTEM', createdBy: 'SYSTEM', confidence: 1 },
    metadata: {}, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  } as any);

  // Six distinct public world-event memories: subject is the event, the NPC is only a
  // witness, and the viewer is not referenced at all.
  for (let index = 0; index < 6; index += 1) {
    storeMemory(repo, `world_event_memory_${index}`, {
      subjectEntityId: `world_event_${index}`,
      relatedEntityIds: [NPC_ID, player.locationId],
      accessibleToEntityIds: [],
      content: `A scheduled tournament concludes in the courtyard, recorded as world event ${index + 1}.`,
      visibility: 'PUBLIC',
    });
  }

  const result = synthesizeNpcReflections({ repository: repo, storyId: STORY, viewerActorId: player.actorId });
  assert.equal(result.synthesized, 0, 'public world-event memories must not seed beliefs about the viewer');
  assert.equal(repo.getDynamicCharacterAgencyEngine(STORY).getRelationshipReflections(STORY, NPC_ID, player.actorId).length, 0);
});

// ---------------------------------------------------------------------------
// ABCD system audit (ESC-FIND) — prompt assembly must use real newlines.
// A double-escaped `\\n` (escaped backslash + n) silently joined prompt sections
// with the literal text "\n" instead of line breaks. Behavioural lock: the built
// prompt must contain real newlines and no literal backslash-n.
// ---------------------------------------------------------------------------
test('ESC-FIND: narration prompt sections are separated by real newlines, never literal backslash-n', async () => {
  const { CurrentSituationBuilder } = await import('../server/domain/currentSituation');
  const { PlayerIntentInterpreter } = await import('../server/domain/playerIntentInterpreter');
  const { NarrativeResearchPipeline } = await import('../server/domain/narrativeResearchPipeline');
  const { NarrativeDirector } = await import('../server/domain/narrativeDirector');
  const { buildNarrationPrompt } = await import('../server/domain/narrativePromptBuilder');

  const storyId = 'phase_abcd_prompt_newlines';
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  repository.seedStory(storyId);

  for (const budget of [2000, 300, 120]) {
    const playerAction = 'I observe the archivists and ask about the northern gate.';
    const situation = CurrentSituationBuilder.build({ storyId, playerAction, worldRepo: repository });
    const intent = PlayerIntentInterpreter.deterministic({ playerAction, currentAction: situation.currentAction });
    const research = NarrativeResearchPipeline.research({ repository, storyId, currentSituation: situation, playerIntent: intent, playerAction });
    const plan = NarrativeDirector.create({ situation, intent, research });
    const result = buildNarrationPrompt({ situation, intent, research, plan, workingContext: 'WORKING_CONTEXT_SENTINEL', maxPromptTokens: budget });
    assert.ok(result.prompt.includes('\n'), 'prompt must use real newlines');
    assert.equal(result.prompt.includes('\\n'), false, `prompt must not contain a literal backslash-n at budget ${budget}`);
  }
});

test('B-FIND-2: authoritative sections survive hard-budget pressure (never blind-sliced off the tail)', async () => {
  const { CurrentSituationBuilder } = await import('../server/domain/currentSituation');
  const { PlayerIntentInterpreter } = await import('../server/domain/playerIntentInterpreter');
  const { NarrativeResearchPipeline } = await import('../server/domain/narrativeResearchPipeline');
  const { NarrativeDirector } = await import('../server/domain/narrativeDirector');
  const { buildNarrationPrompt } = await import('../server/domain/narrativePromptBuilder');

  const storyId = 'phase_abcd_prompt_budget';
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  repository.seedStory(storyId);

  for (const budget of [2000, 700, 500, 300, 120]) {
    const playerAction = 'I observe the archivists and ask about the northern gate.';
    const situation = CurrentSituationBuilder.build({ storyId, playerAction, worldRepo: repository });
    const intent = PlayerIntentInterpreter.deterministic({ playerAction, currentAction: situation.currentAction });
    const research = NarrativeResearchPipeline.research({ repository, storyId, currentSituation: situation, playerIntent: intent, playerAction });
    const plan = NarrativeDirector.create({ situation, intent, research });
    const result = buildNarrationPrompt({ situation, intent, research, plan, workingContext: 'WORKING_CONTEXT_SENTINEL', maxPromptTokens: budget });
    for (const header of ['CURRENT SITUATION', 'PLAYER INTENT', 'ACTION RESOLUTION', 'OUTPUT CONTRACT']) {
      assert.ok(result.prompt.includes(header), `${header} must survive at budget ${budget}`);
    }
  }
});

test('ESC-FIND: dialogue provided as "Speaker: line" strings is parsed, not left unparsed', async () => {
  const { MultiModelOrchestrator } = await import('../server/domain/aiOrchestrator');
  const orchestrator = new MultiModelOrchestrator();
  const result = orchestrator.validateTurnPackage(JSON.stringify({
    narrative: ['Maren looks up from the charts and answers without embellishment.'],
    dialogue: ['Archivist Maren: You should not have come here at this hour.'],
    events: [], stateChanges: [], memoryCandidates: [], audioCues: [],
  }));
  assert.equal(result.valid, true, result.errorReason);
  const dialogue = result.turnPackage?.dialogue || [];
  assert.equal(dialogue.length, 1);
  assert.equal(dialogue[0].speaker, 'Archivist Maren');
  assert.equal(dialogue[0].text, 'You should not have come here at this hour.');
});

// ---------------------------------------------------------------------------
// ABCD system audit (ESC-FIND, class lock) — no phase-touched production file may
// contain a literal double-escaped newline (`\\n` in source) inside a string join.
// The only legitimate `\\` sequences are string literals fed to `new RegExp` and
// the standard regex-escape idiom `.replace(/.../, '\\$&')`.
// ---------------------------------------------------------------------------
test('ESC-FIND: no phase-touched production file joins strings with a literal double-escaped newline', async () => {
  const fs = await import('node:fs');
  const BS = String.fromCharCode(92);
  const needle = BS + BS + 'n';
  const files = [
    'server/domain/narrativePromptBuilder.ts',
    'server/domain/workingContextEngine.ts',
    'server/domain/aiOrchestrator.ts',
    'server/domain/memoryOpportunityEngine.ts',
    'server/domain/narrativeMemoryLifecycle.ts',
    'server/domain/narrativeSummaryLifecycle.ts',
    'server/domain/npcReflectionEngine.ts',
    'server/domain/npcPlanningSlice.ts',
    'server/domain/memoryVectorIndex.ts',
    'server/domain/narrativeJudgeEval.ts',
    'server/domain/providerAttemptTrail.ts',
    'server/domain/currentSituation.ts',
    'server/domain/narrativeContinuityEngine.ts',
    'server/domain/narrativeResearchPipeline.ts',
    'server/domain/dynamicCharacterAgency.ts',
    'server/api/gameRoutes.ts',
    'server/mockEngine/serverMockAuthority.ts',
  ];
  const violations: string[] = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.includes(needle)) continue;
      if (line.includes('new RegExp')) continue;       // string → RegExp: correct
      if (line.includes('replace(') && line.includes('$&')) continue; // escape idiom: correct
      if (/(?:tests?|spec)/i.test(file)) continue;
      violations.push(`${file}:${index + 1}`);
    }
  }
  assert.deepEqual(violations, [], 'string joins must use single-backslash \\n newlines');
});
