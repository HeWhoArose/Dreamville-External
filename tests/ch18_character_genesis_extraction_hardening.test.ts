import test from 'node:test';
import assert from 'node:assert/strict';
import { characterGenesisService } from '../server/services/characterGenesisService';
import { worldRepository } from '../server/repositories/worldRepository';
import { WorldTemplate } from '../src/types';

const testWorld: WorldTemplate = {
  worldId: 'world_genesis_extraction_hardening',
  worldManifestVersion: 1,
  title: 'Ashfall Meridian',
  summary: 'A post-collapse world of ruined cities and hostile anomalies.',
  description: 'A post-collapse world of ruined cities and hostile anomalies.',
  genreTags: ['Post-Apocalyptic', 'Supernatural'],
  toneTags: ['Tense', 'Cinematic'],
  mediumTags: ['Interactive'],
  canonMode: 'CANON_COMPLIANT',
  rulesetId: 'rules_custom_v1',
  visibility: 'PRIVATE',
  creatorId: 'test',
  sourcePolicy: 'PLAYER_CREATED',
  defaultEra: 'Year 1',
  versionHash: 'test-hash',
  canonicalCapabilities: [],
  capabilities: [],
  worldRules: [],
  ruleConstraints: [],
  worldFacts: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  setting: 'Ruined Meridian',
  geography: {
    nodes: [
      {
        id: 'loc_ruined_gate',
        name: 'Ruined Gate',
        region: 'Ash District',
        description: 'A fortified gate overlooking the ruined capital.',
        coordinates: { x: 10, y: 20 },
      },
    ],
    connections: [],
  },
};

function makeAiCharacterResponse() {
  return JSON.stringify({
    identity: {
      name: 'Rin Arclight',
      species: 'Soul Reaper',
      age: 21,
      gender: 'Female',
    },
    appearance: {
      physicalDescription: 'A disciplined spiritual swordswoman in black robes carrying a soul-cutting blade.',
      distinguishingTraits: ['Spirit-sensitive eyes', 'Zanpakuto'],
    },
    personality: {
      traits: ['Resolute', 'Observant'],
      temperament: 'Controlled under pressure',
      values: ['Duty', 'Survival'],
    },
    background: {
      history: 'A Soul Reaper displaced from a spiritual society into the Ashfall Meridian.',
      upbringing: 'Spiritual military academy',
      importantEvents: ['Dimensional displacement'],
    },
    role: {
      archetype: 'Spiritual Swordswoman',
      profession: 'Soul Reaper',
      role: 'Protagonist',
    },
    motivations: {
      goals: ['Find a way home', 'Protect survivors'],
      fears: ['Losing spiritual identity'],
      desires: ['Master the new world'],
    },
    relationships: {
      allies: ['A ruined-city scout'],
      rivals: ['An anomaly cult'],
      family: [],
      factions: ['Soul Society remnants'],
    },
    condition: {
      injuries: [],
      curses: [],
      forms: ['Spiritual Form'],
      specialStates: ['Displaced'],
    },
    attributes: [
      {
        name: 'Spiritual Pressure',
        value: 16,
        baseValue: 16,
        description: 'Density of spiritual force.',
      },
    ],
    stats: [
      {
        name: 'Agility',
        value: 14,
        baseValue: 14,
        description: 'Movement and reaction speed.',
      },
    ],
    traits: ['Soul Perception'],
    capabilities: [
      {
        id: 'cap_zanpakuto',
        name: 'Zanpakuto Manifestation',
        category: 'Combat',
        activationMode: 'immediate',
        powerTier: 'Major',
        baseEnergyCost: 20,
        baseStrainCost: 8,
        minVesselCapacityRequired: 10,
        description: 'Manifest and wield a soul-cutting blade.',
        effects: [
          {
            type: 'combat_modifier',
            target: 'self',
            scope: 'combat',
            modifier: 2,
            description: 'Improves spiritual blade attacks.',
          },
        ],
      },
    ],
    generatedSkills: [
      {
        id: 'skill_flash_step',
        name: 'Flash Step',
        description: 'A burst of spiritual movement.',
        parentCapabilityName: 'Zanpakuto Manifestation',
        activationType: 'Action',
        energyCost: 12,
        cooldownTurns: 1,
        range: 'Self',
      },
    ],
    feats: [
      {
        id: 'feat_spiritual_awareness',
        name: 'Spiritual Awareness',
        description: 'Detects spiritual anomalies.',
        prerequisites: [],
        tags: ['PERCEPTION'],
        effects: [],
      },
    ],
    titles: [
      {
        id: 'title_displaced_reaper',
        name: 'Displaced Reaper',
        description: 'Carries an origin beyond this world.',
        effects: [],
      },
    ],
    startingEquipment: {
      weapons: ['Zanpakuto'],
      armor: ['Black Shihakusho'],
      tools: ['Spiritual Tracker'],
      consumables: ['Recovery Pill'],
      inventory: [
        {
          name: 'Zanpakuto',
          category: 'Weapon',
          description: 'Soul-cutting blade.',
          quantity: 1,
          isEquipped: true,
          slot: 'mainHand',
          rarity: 'Rare',
          weightKg: 1.2,
          durability: 100,
          maxDurability: 100,
          properties: { spiritual: true },
        },
      ],
    },
    startingLocation: {
      locationId: 'loc_ruined_gate',
      name: 'Ruined Gate',
      region: 'Ash District',
      description: 'A fortified gate.',
    },
    startingSituation: {
      summary: 'Rin arrives at the ruined gate.',
      hook: 'A spiritual anomaly opens nearby.',
      initialConditions: 'Ash falls across the district.',
      whyHereNow: 'Searching for survivors and a route home.',
    },
    portraitAsset: {
      promptFallback: 'Cinematic portrait of Rin Arclight in black spiritual robes.',
      emoji: '⚔️',
    },
    aiExtractionSummary: {
      interpretation: 'A Soul Reaper displaced into an apocalyptic world and adapting to survive.',
      keyFacts: ['Soul Reaper', 'Displaced', 'Apocalyptic setting'],
      proposedHighlights: ['Zanpakuto Manifestation', 'Flash Step'],
      uncertainties: [],
    },
  });
}

function installFakeOrchestrator(responseText: string, source: 'AI_PRIMARY' | 'AI_FALLBACK' | 'DETERMINISTIC_FALLBACK' = 'AI_PRIMARY') {
  const repository = worldRepository as any;
  const original = repository.getAiOrchestrator;
  repository.getAiOrchestrator = () => ({
    executeTaskGeneration: async () => ({
      text: responseText,
      source,
      providerId: 'provider_test',
      modelId: 'model_test',
      attempts: 1,
    }),
  });
  return () => {
    repository.getAiOrchestrator = original;
  };
}

test('Character Genesis extraction hardening', async (t) => {
  await t.test('parses raw, fenced and conversational JSON safely', () => {
    const raw = characterGenesisService.parseJsonFromAiResponse('{"identity":{"name":"Rin"}}');
    assert.equal(raw.identity.name, 'Rin');

    const fenced = characterGenesisService.parseJsonFromAiResponse(
      '```json\n{"identity":{"name":"Rukia"}}\n```'
    );
    assert.equal(fenced.identity.name, 'Rukia');

    const conversational = characterGenesisService.parseJsonFromAiResponse(
      'Here is the character:\n{"identity":{"name":"Byakuya","species":"Soul Reaper"}}\nDone.'
    );
    assert.equal(conversational.identity.species, 'Soul Reaper');

    const array = characterGenesisService.parseJsonFromAiResponse('Result: [{"name":"A"},{"name":"B"}]');
    assert.equal(array.length, 2);

    assert.equal(
      characterGenesisService.parseJsonFromAiResponse('not valid JSON at all'),
      null
    );
  });

  await t.test('accepts complete AI extraction and records AI provenance', async () => {
    const restore = installFakeOrchestrator('```json\n' + makeAiCharacterResponse() + '\n```', 'AI_PRIMARY');
    try {
      const concept = 'a Soul Reaper named Rin from a Bleach-like spiritual world isekai into an apocalyptic city';
      const draft = await characterGenesisService.extractCharacterDraft(
        { naturalLanguageConcept: concept, worldId: testWorld.worldId },
        testWorld
      );

      assert.equal(draft.sourceDescription, concept);
      assert.equal(draft.identity.name, 'Rin Arclight');
      assert.equal(draft.identity.species, 'Soul Reaper');
      assert.equal(draft.role.profession, 'Soul Reaper');
      assert.equal(draft.provenance.identity, 'AI_GENERATED');
      assert.equal(draft.aiExtractionSummary?.generationSource, 'AI_PRIMARY');
      assert.equal(draft.attributes[0].name, 'Spiritual Pressure');
      assert.equal(draft.stats[0].name, 'Agility');
      assert.equal(draft.traits[0], 'Soul Perception');
      assert.equal(draft.feats[0].name, 'Spiritual Awareness');
      assert.equal(draft.titles[0].name, 'Displaced Reaper');
      assert.equal(draft.capabilities[0].effects?.[0].modifier, 2);
      assert.equal(draft.startingEquipment.inventory[0].category, 'Weapon');
    } finally {
      restore();
    }
  });

  await t.test('rejects structurally incomplete AI output and uses deterministic concept fallback honestly', async () => {
    const restore = installFakeOrchestrator(
      '```json\n{"identity":{"name":"Generic Hero","species":"Human"}}\n```',
      'AI_PRIMARY'
    );
    try {
      const concept = 'a soul reaper from bleach world got isekai to an apocalyptic one';
      const draft = await characterGenesisService.extractCharacterDraft(
        { naturalLanguageConcept: concept, worldId: testWorld.worldId },
        testWorld
      );

      assert.equal(draft.sourceDescription, concept);
      assert.equal(draft.aiExtractionSummary?.generationSource, 'DETERMINISTIC_FALLBACK');
      assert.equal(draft.provenance.identity, 'DETERMINISTIC_FALLBACK');
      assert.match(
        draft.aiExtractionSummary?.interpretation || '',
        /deterministic concept extraction/i
      );
      assert.notEqual(draft.identity.name, 'Kaelen Thorne');
      assert.match(draft.identity.species.toLowerCase(), /soul reaper|otherworlder/);
      assert.match(draft.role.profession.toLowerCase(), /soul reaper/);
      assert.ok(
        draft.capabilities.some((cap) =>
          /zanpakuto|spiritual|reiatsu|flash step/i.test(cap.name)
        )
      );
      assert.ok(
        draft.startingEquipment.weapons.some((weapon) =>
          /zanpakuto|katana/i.test(weapon)
        )
      );
      assert.ok(
        draft.validationState.warnings.some((warning) =>
          /deterministic concept extraction/i.test(warning)
        )
      );
    } finally {
      restore();
    }
  });

  await t.test('preserves locked fields across re-extraction', async () => {
    const restore = installFakeOrchestrator('not valid JSON', 'AI_PRIMARY');
    try {
      const concept = 'a female cybernetic android assassin';
      const existingDraft: any = {
        draftId: 'draft_locked',
        fieldLocks: ['identity', 'capabilities'],
        identity: {
          name: 'Player Chosen Name',
          species: 'Android',
          age: 33,
          gender: 'Female',
        },
        capabilities: [
          {
            id: 'cap_locked',
            name: 'Monowire Combat',
            category: 'Combat',
            activationMode: 'immediate',
            powerTier: 'Moderate',
            baseEnergyCost: 10,
            baseStrainCost: 5,
            minVesselCapacityRequired: 10,
            description: 'Player-owned cybernetic combat style.',
            provenance: 'USER_EDITED',
          },
        ],
      };

      const draft = await characterGenesisService.extractCharacterDraft(
        {
          naturalLanguageConcept: concept,
          worldId: testWorld.worldId,
          existingDraft,
        },
        testWorld
      );

      assert.equal(draft.identity.name, 'Player Chosen Name');
      assert.equal(draft.identity.species, 'Android');
      assert.equal(draft.capabilities[0].name, 'Monowire Combat');
      assert.ok(draft.fieldLocks.includes('identity'));
      assert.ok(draft.fieldLocks.includes('capabilities'));
    } finally {
      restore();
    }
  });
});
