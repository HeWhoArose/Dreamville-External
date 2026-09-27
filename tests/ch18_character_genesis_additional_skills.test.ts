import test from 'node:test';
import assert from 'node:assert/strict';
import { characterGenesisService } from '../server/services/characterGenesisService';
import { worldRepository } from '../server/repositories/worldRepository';
import { WorldTemplate } from '../src/types';

const testWorld: WorldTemplate = {
  worldId: 'world_additional_skill_test',
  worldManifestVersion: 1,
  title: 'Arcane Testing Grounds',
  description: 'A controlled world for Character Genesis regression tests.',
  genreTags: ['Fantasy'],
  toneTags: ['Arcane'],
  mediumTags: ['Text'],
  defaultEra: 'Test Era',
  setting: 'Testing Grounds',
  canonMode: 'CANON_COMPLIANT',
  rulesetId: 'rules_test',
  dndRulesMode: 'FULL_DND',
  capabilities: [],
  geography: {
    nodes: [],
    connections: [],
  },
  worldRules: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

test('Character Genesis — additional AI skill discovery', async (t) => {
  worldRepository.saveWorldTemplate(testWorld);

  const originalGetAiOrchestrator = worldRepository.getAiOrchestrator;
  const response = {
    text: JSON.stringify({
      skills: [
        {
          name: 'Lightning',
          governingAbility: 'Intelligence',
          description: 'Launches a focused arc of elemental lightning.',
          mechanicalDescription: 'Deals lightning damage to one target at range.',
          checkFormula: '2d6',
          tags: ['Magic', 'Elemental'],
          worldCompatibility: 'Compatible with an arcane mage.',
        },
        {
          name: 'Lightning',
          governingAbility: 'Intelligence',
          description: 'Duplicate suggestion that must be removed.',
          mechanicalDescription: 'Duplicate.',
          checkFormula: '1d20',
          tags: ['Magic'],
          worldCompatibility: 'Compatible.',
        },
        {
          name: 'Lightning Chain',
          governingAbility: 'Intelligence',
          description: 'Chains an electrical attack from one target to nearby targets.',
          mechanicalDescription: 'Jumps to up to three additional legal targets after the first hit.',
          checkFormula: '1d20',
          tags: ['Magic', 'Chain'],
          worldCompatibility: 'Compatible with an arcane mage.',
        },
        {
          name: 'Fog Mist',
          governingAbility: 'Wisdom',
          description: 'Creates a localized mist that obscures vision.',
          mechanicalDescription: 'Creates a short-duration visibility obstruction in the target area.',
          checkFormula: '1d20',
          tags: ['Magic', 'Control'],
          worldCompatibility: 'Compatible with the active world.',
        },
        {
          name: 'Glass Mirror',
          governingAbility: 'Intelligence',
          description: 'Creates a reflective magical pane.',
          mechanicalDescription: 'Can redirect or reflect qualifying attacks according to canonical rules.',
          checkFormula: '1d20',
          tags: ['Magic', 'Defense'],
          worldCompatibility: 'Compatible with the active world.',
        },
      ],
      }),
    source: 'AI_PRIMARY',
    providerId: 'provider_test',
    modelId: 'model_test',
    attempts: 1,
  };

  worldRepository.getAiOrchestrator = () => ({
    executeTaskGeneration: async () => response,
  } as any);

  t.after(() => {
    worldRepository.getAiOrchestrator = originalGetAiOrchestrator;
  });

  await t.test('returns distinct skill proposals and excludes existing skills', async () => {
    const suggestions = await characterGenesisService.suggestAdditionalSkills(
      {
        worldId: testWorld.worldId,
        characterConcept: 'A battle mage who manipulates storms and reflective glass barriers.',
        existingSkills: [
          {
            id: 'skill_existing_fireball',
            name: 'Fireball',
            governingAbility: 'Intelligence',
            proficiency: 'NONE',
            isCustom: true,
            description: 'Launches a fireball.',
            provenance: 'USER_EDITED',
          },
        ],
        characterContext: {
          name: 'Astra',
          species: 'Human',
          role: 'PROTAGONIST',
          profession: 'Mage',
          background: 'Studied elemental magic and defensive wards.',
          personality: ['curious'],
          motivations: ['master elemental magic'],
          capabilities: ['Storm magic', 'Arcane barriers'],
        },
        desiredCount: 4,
      },
      testWorld,
    );

    assert.equal(suggestions.length, 4);
    assert.deepEqual(
      suggestions.map((skill) => skill.name),
      ['Lightning', 'Lightning Chain', 'Fog Mist', 'Glass Mirror'],
    );
    assert.ok(suggestions.every((skill) => skill.provenance === 'AI_GENERATED'));
    assert.ok(suggestions.every((skill) => skill.checkFormula === '1d20'));
    assert.equal(
      new Set(suggestions.map((skill) => skill.name.toLowerCase())).size,
      suggestions.length,
    );
  });

  await t.test('does not auto-create suggestions when the model produces no usable output', async () => {
    const original = worldRepository.getAiOrchestrator;
    worldRepository.getAiOrchestrator = () => ({
      executeTaskGeneration: async () => ({
        text: JSON.stringify({ skills: [] }),
        source: 'AI_PRIMARY',
        providerId: 'provider_test',
        modelId: 'model_test',
        attempts: 1,
      }),
    } as any);

    try {
      await assert.rejects(
        () =>
          characterGenesisService.suggestAdditionalSkills(
            {
              worldId: testWorld.worldId,
              characterConcept: 'A mage.',
              existingSkills: [],
              characterContext: { profession: 'Mage' },
              desiredCount: 3,
            },
            testWorld,
          ),
        (error: any) => {
          assert.equal(error?.code, 'AI_UNAVAILABLE');
          return true;
        },
      );
    } finally {
      worldRepository.getAiOrchestrator = original;
    }
  });
});
