// Phase C — NPC believability (GAP-3/GAP-5, S-3/S-5/S-6).
//
// C1 recency-weighted NPC planning slice,
// C2 reflection synthesis gated on evidence and tagged as inference,
// C3 widened thread detection + correct OPEN-thread ranking.
import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeMemoryLifecycle } from '../server/domain/narrativeMemoryLifecycle';
import {
  buildNpcPlanningSlice,
  scoreNpcMemorySalience,
  NPC_MEMORY_PERSISTENT_FLOOR,
} from '../server/domain/npcPlanningSlice';
import {
  synthesizeNpcReflections,
  NPC_REFLECTION_MIN_EVIDENCE,
} from '../server/domain/npcReflectionEngine';

const STORY = 'phaseC-story';
const NPC_ID = 'npc_kaelen';

function seedNpc(repo: InMemoryWorldRepository, storyId: string, npcId: string, locationId: string, name = 'Kaelen'): void {
  repo.saveEntityCard(storyId, {
    id: npcId,
    storyId,
    worldId: 'default_world',
    name,
    kind: 'NPC',
    templateId: undefined,
    isTemplate: false,
    identity: { aliases: [name] },
    classification: { tags: [], role: 'NPC' },
    personality: { traits: [], values: [], motivations: [], fears: [], desires: [] },
    behavior: { priorities: [] },
    social: { factionIds: [], reputation: {}, relationships: {} },
    worldState: {
      locationId,
      currentActivity: 'guarding the observatory stairs',
      currentGoal: 'guarding the observatory stairs',
      isAlive: true,
      presence: 'present',
    },
    traits: [],
    capabilities: [],
    feats: [],
    equipment: [],
    memoryRefs: [],
    lifecycle: { status: 'ACTIVE' },
    provenance: { source: 'PHASE_C_TEST', createdBy: 'SYSTEM', confidence: 1 },
    metadata: {},
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  } as any);
}

function setup(options?: { turnCount?: number }) {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  repository.seedStory(STORY);
  const player = repository.getPlayerLifecycle(STORY)!;
  seedNpc(repository, STORY, NPC_ID, player.locationId);
  if (options?.turnCount) {
    const run = repository.getStoryRun(STORY)!;
    run.canonicalEvents = Array.from({ length: options.turnCount }, (_, index) => ({
      eventId: 'event_' + index,
      commandId: 'command_' + index,
    }));
  }
  const situation = CurrentSituationBuilder.build({
    storyId: STORY,
    playerAction: 'I speak with Kaelen.',
    viewerActorId: player.actorId,
    worldRepo: repository,
  });
  return { repository, player, situation };
}

function storeMemory(
  repository: InMemoryWorldRepository,
  id: string,
  params: { content: string; importance: number; confidence?: number; lastRecalledTurn?: number; isPersistentCritical?: boolean },
) {
  repository.getMemoryEngine(STORY).storeMemory({
    id,
    storyId: STORY,
    memoryClass: 'EPISODIC',
    subjectEntityId: NPC_ID,
    relatedEntityIds: [],
    content: params.content,
    importance: params.importance,
    confidence: params.confidence ?? 1,
    status: 'active',
    visibility: 'PUBLIC',
    isPersistentCritical: params.isPersistentCritical ?? false,
    provenance: 'phaseC_test',
    sourceEventId: 'event_' + id,
    perspective: 'SUBJECTIVE',
    validFromTurn: 1,
    lastRecalledTurn: params.lastRecalledTurn ?? 1,
    triggerConditionTags: [],
  } as any);
}

function storeViewerMemories(repository: InMemoryWorldRepository, playerActorId: string, count: number, ids?: string[]): string[] {
  const engine = repository.getMemoryEngine(STORY);
  const memoryIds: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const id = ids?.[index] || `viewer_memory_${index}`;
    engine.storeMemory({
      id,
      storyId: STORY,
      memoryClass: 'EPISODIC',
      subjectEntityId: NPC_ID,
      relatedEntityIds: [playerActorId],
      content: `Kaelen remembers the brass key incident number ${index + 1} at the observatory stairs.`,
      importance: 60,
      confidence: 0.9,
      status: 'active',
      visibility: 'PRIVATE',
      isPersistentCritical: false,
      provenance: 'phaseC_test',
      perspective: 'SUBJECTIVE',
      validFromTurn: 1,
      lastRecalledTurn: 1,
      triggerConditionTags: [],
    } as any);
    memoryIds.push(id);
  }
  return memoryIds;
}

// ---------------------------------------------------------------------------
// C1 — recency-weighted slice
// ---------------------------------------------------------------------------

test('C1 scoring fuses recency, importance and confidence, with a persistent-critical floor', () => {
  const stale = scoreNpcMemorySalience({ importance: 95, confidence: 1, lastRecalledTurn: 1, currentTurn: 40 });
  const fresh = scoreNpcMemorySalience({ importance: 60, confidence: 1, lastRecalledTurn: 40, currentTurn: 40 });
  assert.ok(fresh > stale, `expected recent memory to outrank a stale high-importance one (${fresh} vs ${stale})`);

  const nearHorizon = scoreNpcMemorySalience({ importance: 10, confidence: 1, lastRecalledTurn: 20, currentTurn: 40 });
  const beyondHorizon = scoreNpcMemorySalience({ importance: 10, confidence: 1, lastRecalledTurn: -50, currentTurn: 40 });
  assert.ok(nearHorizon > beyondHorizon, 'recency decay should be monotonic');

  const floored = scoreNpcMemorySalience({
    importance: 5,
    confidence: 0.1,
    lastRecalledTurn: 1,
    currentTurn: 900,
    isPersistentCritical: true,
  });
  assert.ok(floored >= NPC_MEMORY_PERSISTENT_FLOOR, 'persistent-critical memories keep a protected floor');
});

test('C1 slice surfaces the most recent memory ahead of a stale higher-importance one', () => {
  const { repository, player, situation } = setup({ turnCount: 40 });
  storeMemory(repository, 'stale_high_importance', {
    content: 'Kaelen hid the brass key beneath the observatory stairs long ago.',
    importance: 95,
    lastRecalledTurn: 1,
  });
  storeMemory(repository, 'recent_dialogue', {
    content: 'Earlier today Kaelen told the player the brass key was moved to the archive.',
    importance: 60,
    lastRecalledTurn: 40,
  });

  const slice = buildNpcPlanningSlice(repository, STORY, player.actorId, situation, NPC_ID);
  assert.ok(slice, 'planning slice must be built for the addressed NPC');
  assert.equal(slice!.recentMemories[0]?.id, 'recent_dialogue');
  assert.ok(
    slice!.recentMemories.some((memory) => memory.id === 'stale_high_importance'),
    'the stale memory must remain retrievable, just lower-ranked',
  );
  assert.equal(typeof slice!.recentMemories[0]?.salienceScore, 'number');
});

// ---------------------------------------------------------------------------
// C2 — reflection synthesis
// ---------------------------------------------------------------------------

test('C2 gates reflection synthesis below the evidence threshold', () => {
  const { repository, player } = setup();
  storeViewerMemories(repository, player.actorId, NPC_REFLECTION_MIN_EVIDENCE - 1);
  const result = synthesizeNpcReflections({ repository, storyId: STORY, viewerActorId: player.actorId });
  assert.equal(result.synthesized, 0);
  assert.ok(result.gated.some((entry) => entry.npcId === NPC_ID));
  const agency = repository.getDynamicCharacterAgencyEngine(STORY);
  assert.equal(agency.getRelationshipReflections(STORY, NPC_ID, player.actorId).length, 0);
});

test('C2 synthesizes one tagged inference at the threshold and never invents canonical fact', () => {
  const { repository, player } = setup();
  const evidenceIds = storeViewerMemories(repository, player.actorId, NPC_REFLECTION_MIN_EVIDENCE);
  const result = synthesizeNpcReflections({ repository, storyId: STORY, viewerActorId: player.actorId });
  assert.equal(result.synthesized, 1, 'one reflection per changed evidence set');

  const agency = repository.getDynamicCharacterAgencyEngine(STORY);
  const reflections = agency.getRelationshipReflections(STORY, NPC_ID, player.actorId);
  assert.equal(reflections.length, 1);
  const reflection = reflections[0];
  assert.ok(reflection.confidence > 0 && reflection.confidence < 1, 'reflections are inferences, never certain');
  assert.ok(reflection.tags.includes('reflection') && reflection.tags.includes('inference'));
  assert.ok(reflection.evidenceMemoryIds.length >= NPC_REFLECTION_MIN_EVIDENCE);
  assert.match(reflection.summary, /Inference \(not witnessed fact\)/);
  for (const id of evidenceIds) assert.ok(reflection.evidenceMemoryIds.includes(id));
});

test('C2 de-duplicates an unchanged evidence set and re-synthesizes only when evidence changes', () => {
  const { repository, player } = setup();
  storeViewerMemories(repository, player.actorId, NPC_REFLECTION_MIN_EVIDENCE);
  const first = synthesizeNpcReflections({ repository, storyId: STORY, viewerActorId: player.actorId });
  assert.equal(first.synthesized, 1);

  const repeat = synthesizeNpcReflections({ repository, storyId: STORY, viewerActorId: player.actorId });
  assert.equal(repeat.synthesized, 0, 'identical evidence must not produce a duplicate reflection');

  storeViewerMemories(repository, player.actorId, NPC_REFLECTION_MIN_EVIDENCE + 1);
  const grown = synthesizeNpcReflections({ repository, storyId: STORY, viewerActorId: player.actorId });
  assert.equal(grown.synthesized, 1, 'new evidence yields a refreshed reflection');
  assert.equal(
    repository.getDynamicCharacterAgencyEngine(STORY).getRelationshipReflections(STORY, NPC_ID, player.actorId).length,
    2,
  );
});

test('C2 persists through the agency state round-trip and reaches the NPC planning slice', () => {
  const { repository, player, situation } = setup();
  storeViewerMemories(repository, player.actorId, NPC_REFLECTION_MIN_EVIDENCE);
  synthesizeNpcReflections({ repository, storyId: STORY, viewerActorId: player.actorId });

  const run = repository.getStoryRun(STORY)!;
  const persisted = run.runtimeState?.characterAgency;
  assert.ok(persisted, 'the agency mutation listener must persist reflections into the StoryRun');
  const serialized = JSON.stringify(persisted);
  assert.match(serialized, /NPC_REFLECTION/);
  assert.match(serialized, /confidence<1/);

  const slice = buildNpcPlanningSlice(repository, STORY, player.actorId, situation, NPC_ID);
  assert.ok((slice?.reflections?.length || 0) >= 1, 'reflections must surface in the planning slice');
  assert.ok((slice!.reflections![0].confidence || 0) < 1);

  // Fresh engine importing the persisted state must keep reflections.
  const second = new InMemoryWorldRepository({ disablePersistence: true });
  second.seedStory(STORY);
  const secondRun = second.getStoryRun(STORY)!;
  secondRun.runtimeState = { ...(secondRun.runtimeState || {}), characterAgency: JSON.parse(JSON.stringify(persisted)) };
  const rehydrated = second.getDynamicCharacterAgencyEngine(STORY);
  assert.equal(rehydrated.getRelationshipReflections(STORY, NPC_ID, player.actorId).length >= 1, true);
});

test('C2 is invoked from the accepted-turn lifecycle', () => {
  const { repository, player, situation } = setup();
  storeViewerMemories(repository, player.actorId, NPC_REFLECTION_MIN_EVIDENCE);
  const result = NarrativeMemoryLifecycle.processTurn({
    repository,
    storyId: STORY,
    turnId: 'turn-reflect',
    playerAction: 'I speak with Kaelen.',
    currentSituation: situation,
    turnPackage: {
      narrative: ['Kaelen studies you without answering.'],
      dialogue: [],
      events: [],
      stateChanges: [],
      memoryCandidates: [],
      audioCues: [],
    },
  });
  assert.equal(result.npcReflectionIds?.length, 1, 'processTurn must synthesize reflections post-save');
});

// ---------------------------------------------------------------------------
// C3 — widened thread detection + ranking
// ---------------------------------------------------------------------------

test('C3 opens a thread from an attitude verb anchored to a canonical place, without magic vocabulary', () => {
  const { repository, situation } = setup();
  const anchor = situation.location.name || 'the observatory';
  NarrativeMemoryLifecycle.processTurn({
    repository,
    storyId: STORY,
    turnId: 'turn-attitude-thread',
    playerAction: 'I listen.',
    currentSituation: situation,
    turnPackage: {
      narrative: ['Kaelen says nothing and watches the stair.'],
      dialogue: [],
      events: [],
      stateChanges: [],
      memoryCandidates: [`Kaelen vows to protect ${anchor} from intruders.`],
      audioCues: [],
    },
  });
  const threads = repository.getStoryRun(STORY)?.runtimeState?.openNarrativeThreads || [];
  assert.ok(
    threads.some((thread: any) => thread.status === 'OPEN' && thread.title.includes('vows to protect')),
    'an attitude-verb candidate with a canonical anchor must become an OPEN thread',
  );
});

test('C3 honours an explicit thread/promise commit kind', () => {
  const { repository, situation } = setup();
  const anchor = situation.location.name || 'the observatory';
  NarrativeMemoryLifecycle.processTurn({
    repository,
    storyId: STORY,
    turnId: 'turn-explicit-thread',
    playerAction: 'I accept.',
    currentSituation: situation,
    stateAdjudication: {
      turnId: 'turn-explicit-thread',
      storyId: STORY,
      actorId: situation.player.actorId,
      allApproved: true,
      approvedCount: 1,
      rejectedCount: 0,
      committedCount: 1,
      rolledBack: false,
      outcomes: [],
      commitRecords: [{
        commandId: 'canonical-promise',
        kind: 'PROMISE',
        targetId: situation.player.actorId,
        transactionMode: 'OUTER_STAGED_TRANSACTION',
        source: 'AI_PROPOSAL',
      }],
    } as any,
    turnPackage: {
      narrative: ['Kaelen hears the offer.'],
      dialogue: [],
      events: [],
      stateChanges: [],
      memoryCandidates: [`Kaelen accepts the binding arrangement regarding ${anchor}.`],
      audioCues: [],
    },
  });
  const threads = repository.getStoryRun(STORY)?.runtimeState?.openNarrativeThreads || [];
  assert.ok(
    threads.some((thread: any) => thread.status === 'OPEN' && thread.title.includes('binding arrangement')),
    'a PROMISE commit kind must be authoritative for OPEN threads',
  );
});

test('C3 still refuses a candidate with no intent, attitude or commitment signal', () => {
  const { repository, situation } = setup();
  NarrativeMemoryLifecycle.processTurn({
    repository,
    storyId: STORY,
    turnId: 'turn-no-thread',
    playerAction: 'I look around.',
    currentSituation: situation,
    turnPackage: {
      narrative: ['The lantern hums beside the doorway.'],
      dialogue: [],
      events: [],
      stateChanges: [],
      memoryCandidates: ['The lantern hums beside the doorway.'],
      audioCues: [],
    },
  });
  const threads = repository.getStoryRun(STORY)?.runtimeState?.openNarrativeThreads || [];
  assert.equal(threads.length, 0, 'widening must not turn every observation into a thread');
});

test('C3 ranks OPEN threads by priority before capping, so resolved threads cannot crowd them out', () => {
  const { repository, situation } = setup();
  const run = repository.getStoryRun(STORY)!;
  run.runtimeState = {
    ...(run.runtimeState || {}),
    openNarrativeThreads: [
      {
        id: 'thread-resolved-high',
        title: 'A closed matter of the archive ledger',
        summary: 'Already settled.',
        status: 'RESOLVED',
        priority: 99,
        lastTouchedAt: 'cycle-1',
      },
      {
        id: 'thread-open-low',
        title: 'Recover the missing brass key from the archive',
        summary: 'The brass key remains missing.',
        status: 'OPEN',
        priority: 10,
        lastTouchedAt: 'cycle-1',
      },
    ],
  };
  NarrativeMemoryLifecycle.processTurn({
    repository,
    storyId: STORY,
    turnId: 'turn-thread-ranking',
    playerAction: 'I keep my promise.',
    currentSituation: situation,
    turnPackage: {
      narrative: ['Kaelen watches the stairs.'],
      dialogue: [],
      events: [],
      stateChanges: [],
      memoryCandidates: [],
      audioCues: [],
    },
  });
  const threads = repository.getStoryRun(STORY)?.runtimeState?.openNarrativeThreads || [];
  assert.ok(threads.some((thread: any) => thread.id === 'thread-open-low'), 'the OPEN thread must survive the cap');
  assert.ok(threads.every((thread: any) => thread.status === 'OPEN'), 'only OPEN threads are retained');
});

// ---------------------------------------------------------------------------
// ABCD system audit C-FIND-5 — the explicit-commit thread path must be reachable
// with a kind the adjudicator can actually emit. The adjudicator only commits the
// eight canonical StateChangeProposal kinds, so CHRONICLE (a recorded narrative
// commitment) is the realistic signal, not the never-emitted THREAD/PROMISE.
// ---------------------------------------------------------------------------
test('C-FIND-5 widens thread detection for a committed CHRONICLE state change (a reachable adjudicator kind)', () => {
  const { repository, situation } = setup();
  const anchor = situation.location.name || 'the observatory';
  NarrativeMemoryLifecycle.processTurn({
    repository,
    storyId: STORY,
    turnId: 'turn-chronicle-thread',
    playerAction: 'I take on the task.',
    currentSituation: situation,
    stateAdjudication: {
      turnId: 'turn-chronicle-thread',
      storyId: STORY,
      actorId: situation.player.actorId,
      allApproved: true,
      approvedCount: 1,
      rejectedCount: 0,
      committedCount: 1,
      rolledBack: false,
      outcomes: [],
      // The exact shape NarrativeStateAdjudicator produces: kind = allowed state-change kind.
      commitRecords: [{
        commandId: 'canonical-chronicle',
        kind: 'CHRONICLE',
        targetId: situation.player.actorId,
        transactionMode: 'OUTER_STAGED_TRANSACTION',
        source: 'AI_PROPOSAL',
      }],
    } as any,
    turnPackage: {
      narrative: ['Kaelen hears the arrangement.'],
      dialogue: [],
      events: [],
      stateChanges: [],
      // No intent vocabulary and no attitude verb — only the committed CHRONICLE widens detection.
      memoryCandidates: [`The binding arrangement concerning ${anchor} is entered into the chronicle.`],
      audioCues: [],
    },
  });
  const threads = repository.getStoryRun(STORY)?.runtimeState?.openNarrativeThreads || [];
  assert.ok(
    threads.some((thread: any) => thread.status === 'OPEN' && thread.title.includes('binding arrangement')),
    'a durable candidate on a committed CHRONICLE must become an OPEN thread',
  );
});
