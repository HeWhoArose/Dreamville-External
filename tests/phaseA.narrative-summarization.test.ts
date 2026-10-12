// Phase A — long-session summarization regression coverage.
//
// Verifies the durable scene-summary pipeline: cadence gating, AI summary.scene
// usage with strict entity-anchored validation, deterministic fallback when the
// AI path is unavailable/invalid, durable PLOT_CHUNK memory persistence, and
// prompt surfacing through the situation context and research pipeline.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import {
  NarrativeSummaryLifecycle,
  SCENE_SUMMARY_CADENCE_TURNS,
  extractAnchors,
  parseSummaryResponse,
  type SummaryOrchestrator,
} from '../server/domain/narrativeSummaryLifecycle';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeContinuityEngine } from '../server/domain/narrativeContinuityEngine';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';

const STORY = 'summary_lifecycle_story';
const TURNS = [
  'Beren Ashdown watches the Iron Citadel ramparts at dusk.',
  'The player asks Beren Ashdown about the northern gate.',
  'Beren Ashdown warns that the northern gate has not been sealed.',
  'A courier names the Glasswood Verge as the next waypoint.',
  'Beren Ashdown studies a brass astrolabe recovered from the vault.',
  'The player agrees to inspect the Iron Citadel northern gate at dawn.',
];

function seedRepository(storyId: string = STORY): InMemoryWorldRepository {
  const repo = new InMemoryWorldRepository({ disablePersistence: true });
  repo.seedStory(storyId);
  const run = repo.getStoryRun(storyId)!;
  run.runtimeState = {
    ...(run.runtimeState || {}),
    plot: {
      storyId,
      version: 1,
      currentArc: 'OPENING',
      summary: 'Beren Ashdown guards the Iron Citadel.',
      beats: [],
      openThreads: [],
      chunkSummaries: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    narrativeContextHistory: TURNS.map((narration, index) => ({
      turnNumber: index + 1,
      playerAction: `Player action ${index + 1}`,
      narration,
      worldTime: '2026-01-01T00:00:00.000Z',
      locationId: 'loc_whispering_orrery',
    })),
    summaryLifecycle: { turnsSinceLastSummary: 0, lastSummarizedTurn: 0, chunkCount: 0, updatedAt: '' },
  };
  repo.saveStoryRun(run);
  return repo;
}

describe('Phase A narrative summarization', () => {
  it('extracts entity anchors and drops single sentence-initial words', () => {
    const anchors = extractAnchors('Beren Ashdown studied the Iron Citadel. Later the gate held.');
    assert.ok(anchors.includes('Beren Ashdown'));
    assert.ok(anchors.includes('Iron Citadel'));
    assert.ok(!anchors.includes('Later'));
  });

  it('parses raw prose, fenced blocks, and JSON turn packages', () => {
    assert.equal(parseSummaryResponse('Beren Ashdown secured the gate.'), 'Beren Ashdown secured the gate.');
    assert.equal(parseSummaryResponse('```\nBeren Ashdown secured the gate.\n```'), 'Beren Ashdown secured the gate.');
    assert.equal(
      parseSummaryResponse(JSON.stringify({ narrative: ['Beren Ashdown secured the gate.'] })),
      'Beren Ashdown secured the gate.',
    );
    assert.equal(
      parseSummaryResponse(JSON.stringify({ summary: 'Beren Ashdown secured the gate.' })),
      'Beren Ashdown secured the gate.',
    );
  });

  it('emits a deterministic summary only when the cadence is reached', async () => {
    const repo = seedRepository();
    for (let call = 1; call < SCENE_SUMMARY_CADENCE_TURNS; call += 1) {
      const result = await NarrativeSummaryLifecycle.maybeGenerateSummary({ repository: repo, storyId: STORY });
      assert.equal(result.generated, false, `call ${call} should not generate`);
      assert.equal(result.due, false);
    }
    const sixth = await NarrativeSummaryLifecycle.maybeGenerateSummary({ repository: repo, storyId: STORY });
    assert.equal(sixth.generated, true);
    assert.equal(sixth.due, true);
    assert.equal(sixth.chunk?.source, 'DETERMINISTIC');
    assert.match(sixth.chunk!.text, /Iron Citadel/);

    const chunks = NarrativeSummaryLifecycle.recentChunks(repo, STORY, 2);
    assert.equal(chunks.length, 1);
    // Cadence counter reset after generation.
    assert.equal(NarrativeSummaryLifecycle.getState(repo, STORY).turnsSinceLastSummary, 0);
  });

  it('uses the AI summary.scene result when it is entity-anchored', async () => {
    const repo = seedRepository();
    const tasks: string[] = [];
    const orchestrator: SummaryOrchestrator = {
      async executeTaskGeneration(task) {
        tasks.push(task);
        return {
          text: JSON.stringify({ narrative: ['Beren Ashdown secured the Iron Citadel and warned of the unsealed northern gate.'] }),
          source: 'AI_PRIMARY',
          providerId: 'test_provider',
          modelId: 'test_model',
        };
      },
    };
    let last: Awaited<ReturnType<typeof NarrativeSummaryLifecycle.maybeGenerateSummary>> | undefined;
    for (let call = 0; call < SCENE_SUMMARY_CADENCE_TURNS; call += 1) {
      last = await NarrativeSummaryLifecycle.maybeGenerateSummary({ repository: repo, storyId: STORY, orchestrator });
    }
    assert.equal(last?.generated, true);
    assert.deepEqual(tasks, ['summary.scene']);
    const chunks = NarrativeSummaryLifecycle.recentChunks(repo, STORY, 2);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].source, 'AI');
    assert.equal(chunks[0].providerId, 'test_provider');
    assert.equal(chunks[0].modelId, 'test_model');
  });

  it('rejects the canned emergency summary and falls back deterministically', async () => {
    const repo = seedRepository();
    const orchestrator: SummaryOrchestrator = {
      async executeTaskGeneration() {
        return {
          text: JSON.stringify({ narrative: ['The ancient armatures maintain their silent vigil over the subterranean chamber.'] }),
        };
      },
    };
    const result = await NarrativeSummaryLifecycle.maybeGenerateSummary({
      repository: repo,
      storyId: STORY,
      orchestrator,
      force: true,
    });
    assert.equal(result.generated, true);
    assert.equal(result.chunk?.source, 'DETERMINISTIC');
    assert.doesNotMatch(result.chunk!.text, /ancient armatures/i);
    assert.match(result.chunk!.text, /Iron Citadel/);
  });

  it('rejects an AI summary that drops every anchored entity name', async () => {
    const repo = seedRepository();
    const orchestrator: SummaryOrchestrator = {
      async executeTaskGeneration() {
        return { text: 'A quiet interval passes without any notable incident or movement.' };
      },
    };
    const result = await NarrativeSummaryLifecycle.maybeGenerateSummary({
      repository: repo,
      storyId: STORY,
      orchestrator,
      force: true,
    });
    assert.equal(result.generated, true);
    assert.equal(result.chunk?.source, 'DETERMINISTIC');
  });

  it('stores a durable PLOT_CHUNK memory with summary.scene provenance', async () => {
    const repo = seedRepository();
    const result = await NarrativeSummaryLifecycle.maybeGenerateSummary({ repository: repo, storyId: STORY, force: true });
    assert.equal(result.generated, true);
    const memories = repo.getMemoryEngine(STORY).getAllMemories(STORY);
    const chunkMemory = memories.find((memory) => memory.provenance === 'summary.scene');
    assert.ok(chunkMemory, 'expected a durable summary.scene memory');
    assert.equal(chunkMemory!.importance, 70);
    assert.equal(chunkMemory!.isPersistentCritical, false);
    assert.ok(chunkMemory!.triggerConditionTags.includes('PLOT_CHUNK'));
    assert.match(chunkMemory!.content, /Iron Citadel/);
  });

  it('surfaces the latest chunk in the situation context and the research prompt', async () => {
    const repo = seedRepository();
    await NarrativeSummaryLifecycle.maybeGenerateSummary({ repository: repo, storyId: STORY, force: true });

    const state = NarrativeContinuityEngine.getState(repo, STORY);
    assert.equal(state.plot.chunkSummaries?.length, 1);

    const playerActorId = repo.getPlayerLifecycle(STORY)?.actorId;
    const situation = CurrentSituationBuilder.build({
      storyId: STORY,
      playerAction: 'Look around the ramparts.',
      viewerActorId: playerActorId,
      worldRepo: repo,
    });
    assert.ok(situation.plot.recentSceneSummaries && situation.plot.recentSceneSummaries.length > 0);
    assert.match(situation.plot.recentSceneSummaries![0], /Iron Citadel/);

    const research = NarrativeResearchPipeline.research({
      repository: repo,
      storyId: STORY,
      currentSituation: situation,
      playerAction: 'Look around the ramparts.',
      viewerActorId: playerActorId,
    });
    assert.match(research.promptContext, /Recent scene summary/);
  });

  it('never throws and reports NO_SUMMARIZABLE_CONTENT when there is nothing to compress', async () => {
    const repo = new InMemoryWorldRepository({ disablePersistence: true });
    repo.seedStory('empty_summary_story');
    const result = await NarrativeSummaryLifecycle.maybeGenerateSummary({
      repository: repo,
      storyId: 'empty_summary_story',
      force: true,
    });
    assert.equal(result.generated, false);
    assert.equal(result.reason, 'NO_SUMMARIZABLE_CONTENT');
  });
});
