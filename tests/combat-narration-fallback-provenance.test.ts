import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { CombatPlayerActionService } from '../server/domain/combatPlayerActionService';
import { CombatEncounterService } from '../server/domain/combatEncounterService';

type NarrativeSource = 'AI_PRIMARY' | 'AI_FALLBACK' | 'DETERMINISTIC_FALLBACK';

function repositoryFor(result: any | (() => any)) {
  return {
    getAiOrchestrator: () => ({
      generateNarrativeOnly: async () => {
        if (typeof result === 'function') return result();
        return result;
      },
    }),
  } as any;
}

async function playerNarration(result: any | (() => any)) {
  const service = new CombatPlayerActionService() as any;
  return service.generateNarration(
    {
      storyId: 'combat_narration_provenance_test',
      actorId: 'hero',
      actionText: 'I strike the Sentry',
      repository: repositoryFor(result),
    },
    'Strike resolved. Damage: 5.',
    'Sentry',
    4,
  );
}

async function encounterNarration(result: any | (() => any)) {
  const service = new CombatEncounterService() as any;
  return service.generateNarration({
    storyId: 'combat_narration_provenance_test',
    actionText: 'I ambush the Sentry',
    mechanicalSummary: 'Ambush resolved. Damage: 5.',
    targetName: 'Sentry',
    targetHp: 4,
    repository: repositoryFor(result),
  });
}

const modelResult = (source: NarrativeSource, text = 'The Sentry staggers, wounded but still standing.') => ({
  success: true,
  source,
  modelId: source === 'AI_PRIMARY' ? 'primary-model' : 'backup-model',
  turnPackage: { narrative: [text] },
});

test('combat narrators preserve primary and backup model provenance', async () => {
  const primary = modelResult('AI_PRIMARY');
  const backup = modelResult('AI_FALLBACK');

  assert.deepEqual(await playerNarration(primary), {
    text: primary.turnPackage.narrative[0],
    source: 'AI_PRIMARY',
    fallbackUsed: false,
  });
  assert.deepEqual(await encounterNarration(primary), {
    text: primary.turnPackage.narrative[0],
    source: 'AI_PRIMARY',
    fallbackUsed: false,
  });

  assert.deepEqual(await playerNarration(backup), {
    text: backup.turnPackage.narrative[0],
    source: 'AI_FALLBACK',
    fallbackUsed: true,
  });
  assert.deepEqual(await encounterNarration(backup), {
    text: backup.turnPackage.narrative[0],
    source: 'AI_FALLBACK',
    fallbackUsed: true,
  });
});

test('combat narrators use a marked deterministic summary when generation fails or returns empty prose', async () => {
  const failure = { success: false, source: 'AI_FALLBACK', error: 'provider unavailable' };
  const empty = { success: true, source: 'AI_PRIMARY', turnPackage: { narrative: ['   '] } };
  const thrown = () => { throw new Error('provider exception'); };

  assert.deepEqual(await playerNarration(failure), {
    text: 'Strike resolved. Damage: 5. Sentry has 4 HP remaining.',
    source: 'DETERMINISTIC_FALLBACK',
    fallbackUsed: true,
  });
  assert.deepEqual(await encounterNarration(failure), {
    text: 'Ambush resolved. Damage: 5. Sentry has 4 HP remaining. Combat is now initiated; roll for initiative.',
    source: 'DETERMINISTIC_FALLBACK',
    fallbackUsed: true,
  });
  assert.equal((await playerNarration(empty)).source, 'DETERMINISTIC_FALLBACK');
  assert.equal((await encounterNarration(empty)).source, 'DETERMINISTIC_FALLBACK');
  assert.equal((await playerNarration(thrown)).fallbackUsed, true);
  assert.equal((await encounterNarration(thrown)).fallbackUsed, true);
});

test('both combat views display deterministic and backup-AI narration provenance', () => {
  const tacticalView = readFileSync('src/components/TacticalCombatView.tsx', 'utf8');
  const storyView = readFileSync('src/components/StoryView.tsx', 'utf8');
  const types = readFileSync('src/types.ts', 'utf8');

  assert.ok(types.includes("narrativeSource?: 'AI_PRIMARY' | 'AI_FALLBACK' | 'DETERMINISTIC_FALLBACK'"));
  for (const source of ['AI_FALLBACK', 'DETERMINISTIC_FALLBACK']) {
    assert.ok(tacticalView.includes("narrativeSource === '" + source + "'"));
    assert.ok(storyView.includes("narrativeSource === '" + source + "'"));
  }
  assert.ok(tacticalView.includes('combatState.lastResolution.fallbackUsed && !combatState.lastResolution.narrativeSource'));
  assert.ok(storyView.includes('combatTransition.precombatResolution?.fallbackUsed && !combatTransition.precombatResolution?.narrativeSource'));
  assert.ok(tacticalView.includes('The resolved combat result is preserved.'));
  assert.ok(storyView.includes('The resolved combat result is preserved.'));
});
