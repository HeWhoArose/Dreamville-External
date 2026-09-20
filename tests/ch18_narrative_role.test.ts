import test from 'node:test';
import assert from 'node:assert/strict';
import { characterGenesisService } from '../server/services/characterGenesisService';
import { worldRepository } from '../server/repositories/worldRepository';
import { WorldTemplate } from '../src/types';

const world: WorldTemplate = {
  worldId: 'world_narrative_roles',
  title: 'Role Test World',
  summary: 'A test world.',
  description: 'A test world.',
  genreTags: ['Fantasy'],
  toneTags: ['Dramatic'],
  mediumTags: ['Interactive'],
  canonMode: 'CANON_COMPLIANT',
  rulesetId: 'test',
  visibility: 'PRIVATE',
  creatorId: 'test',
  sourcePolicy: 'PLAYER_CREATED',
  defaultEra: 'Current',
  worldManifestVersion: 1,
  versionHash: 'test',
  canonicalCapabilities: [],
  capabilities: [],
  worldRules: [],
  ruleConstraints: [],
  worldFacts: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  geography: {
    nodes: [{ id: 'loc_test', name: 'Test Village', region: 'North', description: 'A village.' }],
    connections: [],
  },
};

const minimalValidCharacter = () => ({
  identity: { name: 'Role Tester', species: 'Human', age: 25, gender: 'Unknown' },
  appearance: { physicalDescription: 'A test character.', distinguishingTraits: [] },
  personality: { traits: ['Focused'], temperament: 'Calm', values: ['Agency'] },
  background: { history: 'A test history.', upbringing: 'A test upbringing.', importantEvents: [] },
  role: { archetype: 'Adventurer', profession: 'Test Specialist', role: 'Protagonist' },
  motivations: { goals: ['Explore'], fears: [], desires: ['Freedom'] },
  relationships: { allies: [], rivals: [], family: [], factions: [] },
  condition: { injuries: [], curses: [], forms: ['Normal'], specialStates: [] },
  attributes: [],
  stats: [],
  traits: ['Focused'],
  capabilities: [{ id: 'cap_test', name: 'Test Capability', category: 'Combat', activationMode: 'immediate', powerTier: 'Minor', baseEnergyCost: 1, baseStrainCost: 1, minVesselCapacityRequired: 1, description: 'Test.' }],
  generatedSkills: [],
  feats: [],
  titles: [],
  startingEquipment: { weapons: [], armor: [], tools: [], consumables: [], inventory: [] },
  startingLocation: { locationId: 'loc_test', name: 'Test Village', region: 'North', description: 'A village.' },
  startingSituation: { summary: 'A beginning.', hook: 'A hook.', initialConditions: 'Calm.', whyHereNow: 'Testing.' },
  portraitAsset: { promptFallback: 'Test portrait.', emoji: '👤' },
  aiExtractionSummary: { interpretation: 'Test', keyFacts: [], proposedHighlights: [], uncertainties: [] },
});

function installMockOrchestrator() {
  const repository = worldRepository as any;
  const original = repository.getAiOrchestrator;
  const prompts: string[] = [];
  repository.getAiOrchestrator = () => ({
    executeTaskGeneration: async (_task: string, prompt: string) => {
      prompts.push(prompt);
      return {
        text: JSON.stringify(minimalValidCharacter()),
        source: 'AI_PRIMARY',
        providerId: 'test-provider',
        modelId: 'test-model',
        attempts: 1,
      };
    },
  });
  return {
    prompts,
    restore: () => { repository.getAiOrchestrator = original; },
  };
}

test('Character Genesis narrative role modes', async (t) => {
  await t.test('supports all three canonical modes and injects their semantic contract into the AI prompt', async () => {
    for (const [mode, requiredPhrase] of [
      ['PROTAGONIST', 'central viewpoint and primary driver'],
      ['SIDE_CHARACTER', 'exists inside a larger story rather than being its central hero'],
      ['FREE_ROAM', 'autonomous participant in an open-ended sandbox'],
    ] as const) {
      const mock = installMockOrchestrator();
      try {
        const draft = await characterGenesisService.extractCharacterDraft(
          { naturalLanguageConcept: 'A wandering test character.', worldId: world.worldId, narrativeRole: mode },
          world
        );
        assert.equal(draft.storyMode, mode);
        assert.equal(draft.aiExtractionSummary?.generationSource, 'AI_PRIMARY');
        assert.match(mock.prompts[0], new RegExp(mode));
        assert.match(mock.prompts[0], new RegExp(requiredPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      } finally {
        mock.restore();
      }
    }
  });

  await t.test('existing draft narrative role is preserved when no explicit mode is supplied', async () => {
    const mock = installMockOrchestrator();
    try {
      const existingDraft: any = { storyMode: 'SIDE_CHARACTER' };
      const draft = await characterGenesisService.extractCharacterDraft(
        { naturalLanguageConcept: 'A wandering test character.', worldId: world.worldId, existingDraft },
        world
      );
      assert.equal(draft.storyMode, 'SIDE_CHARACTER');
    } finally {
      mock.restore();
    }
  });
});

test('Character Genesis does not silently use deterministic fallback before player consent', async () => {
  const repository = worldRepository as any;
  const original = repository.getAiOrchestrator;
  repository.getAiOrchestrator = () => ({
    executeTaskGeneration: async () => ({
      text: '',
      source: 'DETERMINISTIC_FALLBACK',
      providerId: 'none',
      modelId: 'none',
      attempts: 1,
      fallbackReason: 'No AI provider returned a usable response.',
    }),
  });

  try {
    await assert.rejects(
      () =>
        characterGenesisService.extractCharacterDraft(
          {
            naturalLanguageConcept: 'A shinobi carrying a strange device.',
            worldId: world.worldId,
          },
          world
        ),
      (error: any) => {
        assert.equal(error?.code, 'AI_UNAVAILABLE');
        assert.equal(error?.requiresDeterministicConfirmation, true);
        return true;
      }
    );

    const draft = await characterGenesisService.extractCharacterDraft(
      {
        naturalLanguageConcept: 'A shinobi carrying a strange device.',
        worldId: world.worldId,
        allowDeterministicFallback: true,
      },
      world
    );

    assert.equal(draft.aiExtractionSummary?.generationSource, 'DETERMINISTIC_FALLBACK');
    assert.match(
      draft.aiExtractionSummary?.interpretation || '',
      /AI extraction unavailable/i
    );
  } finally {
    repository.getAiOrchestrator = original;
  }
});
