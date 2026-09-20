import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSynthesisService } from '../server/services/worldSynthesisService';

test('world synthesis preserves authored challenges from events and top-level input', async () => {
  const orchestrator = {
    async executeTaskGeneration() {
      return {
        source: 'AI_PRIMARY',
        providerId: 'test-provider',
        modelId: 'test-model',
        fallbackReason: undefined,
        attempts: 1,
        text: JSON.stringify({
          title: 'The Shattered Vale',
          summary: 'A valley shaped by recurring arcane collapses.',
          description: 'A structured test world.',
          genreTags: ['Fantasy'],
          toneTags: ['Ominous'],
          mediumTags: ['Original'],
          era: 'Age of Ruin',
          setting: 'Shattered Vale',
          geography: {
            locations: [
              { id: 'loc_gate', name: 'Collapsed Gate', description: 'Stone gate.' },
            ],
          },
          factions: [{ id: 'fac_wardens', name: 'Wardens', description: 'Keepers.' }],
          characters: [{ id: 'char_keeper', name: 'Keeper', role: 'Watcher', locationId: 'loc_gate', motivation: 'Protect the gate.' }],
          capabilities: [],
          worldRules: [],
          events: [
            {
              id: 'evt_trap',
              title: 'Gate Collapse',
              description: 'The gate gives way.',
              category: 'DISASTER',
              locationId: 'loc_gate',
              scheduledTime: { year: 42, month: 10, day: 15, hour: 12, minute: 0, second: 0 },
              participatingActors: ['char_keeper'],
              preconditions: { requiredEvents: [], requiredWorldFacts: [] },
              plannedConsequences: [{ type: 'location_state_change', targetId: 'loc_gate', detail: 'Debris blocks the passage.' }],
              storyCheckChallenges: [{
                id: 'collapse_save',
                label: 'Falling masonry',
                sourceType: 'EVENT',
                sourceId: 'evt_trap',
                keywords: ['walk forward', 'debris'],
                testType: 'SAVING_THROW',
                savingThrowAbility: 'Dexterity',
                difficultyClass: 15,
                onFailure: { damageFormula: '1d6', damageType: 'bludgeoning' },
              }],
              visibility: 'PUBLIC',
              status: 'PLANNED',
            },
          ],
        }),
      };
    },
  };

  const service = new WorldSynthesisService(() => orchestrator as any);
  const inputChallenge = {
    id: 'world_poison_save',
    label: 'Poison cloud',
    sourceType: 'HAZARD' as const,
    sourceId: 'hazard_poison',
    keywords: ['inhale'],
    testType: 'SAVING_THROW' as const,
    savingThrowAbility: 'Constitution' as const,
    difficultyClass: 14,
    onFailure: { conditions: [{ definitionIdOrName: 'Poisoned' }] },
  };

  const world = await service.synthesizeWorldFromPremise({
    naturalLanguagePremise: 'A ruined magical valley with dangerous collapsing ruins.',
    storyCheckChallenges: [inputChallenge],
  });

  const event = world.events?.[0] as any;
  assert.ok(event.storyCheckChallenges?.some((challenge: any) => challenge.id === 'collapse_save'));
  assert.ok(world.storyCheckChallenges?.some((challenge: any) => challenge.id === 'collapse_save'));
  assert.ok(world.storyCheckChallenges?.some((challenge: any) => challenge.id === 'world_poison_save'));
  assert.equal(world.storyCheckChallenges?.find((challenge: any) => challenge.id === 'world_poison_save')?.difficultyClass, 14);
});