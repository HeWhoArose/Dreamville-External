// Phase A end-to-end: scene-summary emission through the authoritative action pipeline.
//
// Regression lock for the production wiring: `/api/game/action` runs the whole handler
// inside `canonicalCommandEngine.execute(..., transactionMode: 'ROLLBACK')`, so a summary
// hook placed *inside* processCustomAction is silently skipped (isCanonicalCommandTransactionActive
// is true). The summary must therefore be emitted post-commit, exactly like the route does.
import test from 'node:test';
import assert from 'node:assert/strict';

import { worldRepository } from '../server/repositories/worldRepository';
import { serverMockAuthority } from '../server/mockEngine/serverMockAuthority';
import { canonicalCommandEngine } from '../server/domain/canonicalCommandEngine';
import { WorldTemplate, ConfirmedCharacter } from '../src/types';
import {
  NarrativeSummaryLifecycle,
  SCENE_SUMMARY_CADENCE_TURNS,
  narrativeSummaryLifecycle,
} from '../server/domain/narrativeSummaryLifecycle';

function createStory(worldId: string, characterName: string): string {
  const worldTemplate: WorldTemplate = {
    worldId,
    worldManifestVersion: 4,
    title: 'Verdant Archive',
    description: 'A quiet archive world for summarization verification.',
    genreTags: ['Mystery'],
    toneTags: ['Calm'],
    mediumTags: ['Text Adventure'],
    defaultEra: 'Age of Ink',
    setting: 'Archive',
    canonMode: 'CANON_COMPLIANT',
    rulesetId: 'rules_archive_v1',
    capabilities: [],
    geography: {
      nodes: [
        {
          id: 'loc_archive_hall',
          name: 'The Long Archive',
          region: 'Ink Ward',
          description: 'Endless shelves of unread manuscripts watched by Beren Ashdown.',
          coordinates: { x: 5, y: 5 },
          ambientSensory: 'The rustle of turning pages.',
        },
      ],
      connections: [],
    },
    historyTimeline: [],
    canonKnowledge: [],
    startingHooks: [],
  };
  worldRepository.saveWorldTemplate(worldTemplate);

  const character: ConfirmedCharacter = {
    characterId: `char_${worldId}`,
    identity: { name: characterName, species: 'Human' },
    role: { profession: 'Archivist', archetype: 'Scholar' },
    background: { history: 'Keeper of the Long Archive.' },
    appearance: { physicalDescription: 'Ink-stained hands.' },
    personality: { traits: ['Curious'] },
    motivations: { goals: ['Catalogue the archive'] },
    condition: { injuries: [], activeEffects: [] },
    capabilities: [],
    generatedSkills: [],
    startingEquipment: {
      equipped: [],
      inventory: [{ name: 'Ledger', category: 'Book', description: 'A tally of unread tomes.' }],
      weapons: [],
      armor: [],
      tools: [],
      consumables: [],
    },
    portraitAsset: { emoji: '📚' },
    startingLocation: { locationId: 'loc_archive_hall', name: 'The Long Archive' },
    startingSituation: { summary: 'Cataloguing the long archive with Beren Ashdown.' },
  };

  const { storyId } = worldRepository.createStoryRunFromConfirmedCharacter({
    worldId,
    confirmedCharacter: character,
  });
  return storyId;
}

/** Mirrors the canonical-command wrapper used by POST /api/game/action. */
async function runActionThroughCanonicalCommand(storyId: string, actionText: string, index: number): Promise<void> {
  const actorId = worldRepository.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`;
  const commandResult = await canonicalCommandEngine.execute(
    worldRepository as any,
    {
      commandId: `cmd_phaseA_${storyId}_${index}`,
      storyId,
      actorId,
      type: 'INTERACT',
      payload: { actionRequest: { type: 'CUSTOM_ACTION', storyId, actionText } },
      source: 'PLAYER',
      transactionMode: 'ROLLBACK',
    },
    async () => {
      const result = await serverMockAuthority.processCustomAction({
        type: 'CUSTOM_ACTION',
        actionText,
        storyId,
      } as any);
      return { success: true, data: result, errorReason: undefined, summary: 'phaseA e2e turn' };
    },
  );
  assert.equal(commandResult.success, true, `canonical command should commit for turn ${index}`);
}

const ACTIONS = [
  'I ask Beren Ashdown about the unread northern shelves.',
  'I open the ledger and note the missing volume.',
  'I search the Iron Citadel index for the northern gate record.',
  'I ask Beren Ashdown whether the northern gate was ever sealed.',
  'I walk to the far shelf and inspect the brass astrolabe.',
  'I agree to catalogue the northern gate records at dawn.',
];

test('Phase A e2e: post-commit hook emits a scene-summary chunk after a full cadence', async () => {
  const storyId = createStory('world_phaseA_summary_e2e', 'Ivara Pell');

  for (let index = 0; index < ACTIONS.length; index += 1) {
    await runActionThroughCanonicalCommand(storyId, ACTIONS[index], index);
    // Exactly what the route does after the response: post-commit, non-fatal.
    await narrativeSummaryLifecycle.onAcceptedTurn({
      repository: worldRepository,
      storyId,
      orchestrator: worldRepository.getAiOrchestrator(),
    });
  }

  const state = NarrativeSummaryLifecycle.getState(worldRepository, storyId);
  assert.equal(SCENE_SUMMARY_CADENCE_TURNS, 6);
  assert.equal(state.chunkCount >= 1, true, 'expected at least one summary chunk after a full cadence');

  const run = worldRepository.getStoryRun(storyId)!;
  const chunks = (run.runtimeState as any)?.plot?.chunkSummaries || [];
  assert.equal(chunks.length >= 1, true, 'runtime.plot.chunkSummaries must persist the chunk');
  assert.equal(chunks[chunks.length - 1].source, 'DETERMINISTIC');
  assert.match(String(chunks[chunks.length - 1].text), /Iron Citadel/);

  const memories = worldRepository.getMemoryEngine(storyId).getAllMemories(storyId);
  assert.equal(
    memories.some((memory) => memory.provenance === 'summary.scene'),
    true,
    'a durable summary.scene memory must exist',
  );
});

test('Phase A e2e: the in-transaction action handler does not emit summaries by itself', async () => {
  const storyId = createStory('world_phaseA_summary_guard', 'Marek Voss');

  // No post-commit hook: exactly the pre-fix wiring. If a summary hook is ever placed
  // back inside processCustomAction (inside the rollback transaction), this fails.
  for (let index = 0; index < ACTIONS.length; index += 1) {
    await runActionThroughCanonicalCommand(storyId, ACTIONS[index], index);
  }

  const state = NarrativeSummaryLifecycle.getState(worldRepository, storyId);
  assert.equal(state.chunkCount, 0, 'in-transaction handling must not emit summary chunks');
  const run = worldRepository.getStoryRun(storyId)!;
  const chunks = (run.runtimeState as any)?.plot?.chunkSummaries || [];
  assert.equal(chunks.length, 0);
});
