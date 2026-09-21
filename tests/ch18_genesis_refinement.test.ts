import test from 'node:test';
import assert from 'node:assert/strict';
import { characterGenesisService } from '../server/services/characterGenesisService';
import { worldRepository } from '../server/repositories/worldRepository';
import { WorldTemplate } from '../src/types';

const world: WorldTemplate = {
  worldId: 'world_genesis_refinement',
  worldManifestVersion: 1,
  title: 'The Living Frontier',
  summary: 'A world where reputation and achievement shape social reality.',
  description: 'A frontier of villages, academies, wildlands, and old ruins.',
  genreTags: ['Fantasy'],
  toneTags: ['Adventurous'],
  mediumTags: ['RPG'],
  canonMode: 'CANON_COMPLIANT',
  rulesetId: 'CUSTOM',
  visibility: 'PUBLIC',
  creatorId: 'test',
  sourcePolicy: 'ORIGINAL_CANON',
  defaultEra: 'Current Era',
  versionHash: 'test',
  canonicalCapabilities: [],
  capabilities: [],
  worldRules: [],
  ruleConstraints: [],
  worldFacts: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  geography: {
    nodes: [
      { id: 'loc_village', name: 'Bright Village', region: 'North', description: 'A frontier town.', coordinates: { x: 1, y: 1 } },
      { id: 'loc_academy', name: 'Aether Academy', region: 'East', description: 'A renowned academy.', coordinates: { x: 2, y: 2 } },
    ],
    connections: [],
  },
};

// Global mock for AI orchestrator in refinement tests
const originalGetAiOrchestrator = worldRepository.getAiOrchestrator;
worldRepository.getAiOrchestrator = () => {
  return {
    executeTaskGeneration: async (task: string, prompt: string, systemInstruction?: string, options?: any) => {
      const mockDraft = {
        draftId: 'draft_mock_refinement',
        worldId: 'world_genesis_refinement',
        worldVersion: 1,
        identity: {
          name: 'Astraea',
          species: 'Cosmic Entity',
          age: 'Eternal',
        },
        appearance: {
          physicalDescription: 'A shifting constellation of starlight.',
          distinguishingTraits: ['Glows in the dark'],
        },
        personality: {
          traits: ['Curious', 'Detached'],
        },
        background: {
          history: 'Arrived from the cosmos to observe mortals.',
        },
        role: {
          profession: 'Scholar',
          archetype: 'Investigator',
        },
        capabilities: [],
        generatedSkills: [],
        startingEquipment: {
          equipped: [],
          inventory: [],
          weapons: [],
          armor: [],
          tools: [],
          consumables: [],
        },
        startingLocation: {
          locationId: 'loc_village',
        },
        startingSituation: {
          summary: 'Observing local customs.',
          hook: 'A bright flash of light.',
          whyHereNow: 'Curiosity.',
        },
        attributes: [],
        stats: [],
        feats: [],
        titles: [],
        traits: [],
        startingState: {
          health: 10,
          maxHealth: 10,
        },
        fieldLocks: [],
        revision: 1,
        aiExtractionSummary: {
          keyFacts: ['Is a cosmic entity'],
          proposedHighlights: ['Loves stargazing'],
          uncertainties: [],
          generationSource: 'AI_PRIMARY',
        },
      };

      return {
        text: JSON.stringify(mockDraft),
        source: 'AI_PRIMARY',
        providerId: 'google_gemini',
        modelId: 'gemini-3.5-flash',
        attempts: 1,
      };
    },
  } as any;
};

test('Character Genesis refinement: canonical structured character survives confirmation and StoryRun creation', async () => {
  worldRepository.saveWorldTemplate(world);

  const draft = await characterGenesisService.extractCharacterDraft({
    naturalLanguageConcept: 'A cosmic entity that landed here to study mortals. It saved Bright Village and later graduated from Aether Academy.',
    worldId: world.worldId,
  }, world);

  assert.ok(Array.isArray(draft.attributes));
  assert.ok(Array.isArray(draft.stats));
  assert.ok(Array.isArray(draft.feats));
  assert.ok(Array.isArray(draft.titles));
  assert.ok(Array.isArray(draft.traits));
  assert.ok(draft.startingState);
  assert.equal(draft.startingLocationMode, 'AI_SUGGEST');
  assert.equal(draft.startingSituationMode, 'AI_SUGGEST');
  assert.ok(Array.isArray(draft.fieldLocks));
  assert.equal(draft.revision, 1);
  assert.ok(draft.aiExtractionSummary);

  const customFeat = {
    id: 'feat_town_saver',
    name: 'Town Saver',
    description: 'Saved Bright Village from destruction.',
    effects: [{
      id: 'effect_town_saver',
      type: 'reputation_modifier',
      scope: 'Bright Village',
      modifier: 10,
      description: 'Residents of Bright Village begin with improved disposition.',
      provenance: 'PLAYER_INPUT' as const,
    }],
    tags: ['WORLD_EARNED'],
    provenance: 'PLAYER_INPUT' as const,
    worldId: world.worldId,
  };

  draft.feats.push(customFeat);
  draft.fieldLocks.push('feats');

  const confirmed = characterGenesisService.confirmCharacter(draft, world);
  assert.equal(confirmed.feats.length, draft.feats.length);
  assert.equal(confirmed.feats.find((feat) => feat.id === 'feat_town_saver')?.effects[0].modifier, 10);
  assert.ok(confirmed.startingState);
  assert.ok(confirmed.fieldLocks.includes('feats'));

  worldRepository.saveConfirmedCharacter(world.worldId, confirmed);
  const created = worldRepository.createStoryRunFromConfirmedCharacter({
    worldId: world.worldId,
    confirmedCharacter: confirmed,
    storyMode: 'PROTAGONIST',
    dndRulesMode: 'CUSTOM_HOMEBREW_DND',
  });

  assert.equal(created.run.activeCharacterId, confirmed.characterId);
  assert.deepEqual(created.run.characterFeats, confirmed.feats);
  assert.deepEqual(created.run.characterTitles, confirmed.titles);
  assert.deepEqual(created.run.characterAttributes, confirmed.attributes);
  assert.deepEqual(created.run.characterStats, confirmed.stats);
  assert.ok(created.run.characterEffects.some((effect: any) => effect.id === 'effect_town_saver'));
  assert.deepEqual(created.run.startingState, JSON.parse(JSON.stringify(confirmed.startingState)));

  worldRepository.deleteStoryRun(created.storyId);
});

test('Character Genesis refinement: player-owned fields remain preserved during re-extraction', async () => {
  worldRepository.saveWorldTemplate(world);

  const first = await characterGenesisService.extractCharacterDraft({
    naturalLanguageConcept: 'A scholar who studies cosmic anomalies.',
    worldId: world.worldId,
  }, world);

  first.identity.name = 'Player Chosen Name';
  first.identity.species = 'Moonborn';
  first.fieldLocks.push('identity');
  first.provenance.identity = 'USER_EDITED';

  const second = await characterGenesisService.extractCharacterDraft({
    naturalLanguageConcept: 'A reckless dragon hunter.',
    worldId: world.worldId,
    existingDraft: first,
    userEditedFields: ['identity'],
  }, world);

  assert.equal(second.identity.name, 'Player Chosen Name');
  assert.equal(second.identity.species, 'Moonborn');
  assert.equal(second.provenance.identity, 'USER_EDITED');
  
  // Clean up mock
  worldRepository.getAiOrchestrator = originalGetAiOrchestrator;
});
