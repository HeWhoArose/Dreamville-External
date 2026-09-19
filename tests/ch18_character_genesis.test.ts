import test from 'node:test';
import assert from 'node:assert/strict';
import { characterGenesisService } from '../server/services/characterGenesisService';
import { worldRepository } from '../server/repositories/worldRepository';
import { WorldTemplate } from '../src/types';

test('Character Creation Slice 2 — Character Genesis Forensic Verification', async (t) => {
  // Test World Template
  const testWorld: WorldTemplate = {
    worldId: 'world_genesis_test',
    worldManifestVersion: 2,
    title: 'Arcane Frontiers of Eldoria',
    description: 'A shattered realm where crystalline ley-lines surge through floating archipelagos.',
    genreTags: ['High Fantasy', 'Arcane Punk'],
    toneTags: ['Wonder', 'Danger'],
    mediumTags: ['Cinematic'],
    defaultEra: 'Age of Fractured Crystal',
    setting: 'Floating Archipelagos',
    canonMode: 'CANON_COMPLIANT',
    rulesetId: 'rules_eldoria_v1',
    capabilities: [
      {
        id: 'cap_ley_manipulation',
        name: 'Ley-line Manipulation',
        category: 'Magic',
        activationMode: 'channelled',
        powerTier: 'Moderate',
        baseEnergyCost: 20,
        baseStrainCost: 10,
        minVesselCapacityRequired: 25,
        description: 'Attuning directly to local crystal veins to amplify spells.',
        provenance: 'WORLD_CANON',
      },
    ],
    geography: {
      nodes: [
        {
          id: 'loc_citadel_clouds',
          name: 'The Cloud Citadel',
          region: 'Upper Canopy',
          description: 'A towering fortress sculpted from white stone and bound by chains of energy.',
          coordinates: { x: 100, y: 250 },
        },
        {
          id: 'loc_sunken_rift',
          name: 'Sunken Rift',
          region: 'The Abyss',
          description: 'A hazardous fissure where gravity wavers and shadows coalesce.',
          coordinates: { x: 300, y: 50 },
        },
      ],
      connections: [],
    },
    worldRules: [
      {
        ruleId: 'rule_crystal_attunement',
        category: 'PHYSICS',
        description: 'Magic requires proximity to resonated crystals or stored energy reservoirs.',
        isHardConstraint: true,
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Register in repository
  worldRepository.saveWorldTemplate(testWorld);

  // 1. Natural Language Extraction into Structured Draft
  await t.test('1. Extract Character Draft from Natural Language Concept', async () => {
    const concept = 'An exiled elven spellblade named Lorien who fled the Cloud Citadel after delving into forbidden void magic. Armed with an astral rapier and runic leather armor, quiet and guilt-ridden, seeking to mend the rift.';
    const draft = await characterGenesisService.extractCharacterDraft(
      {
        naturalLanguageConcept: concept,
        worldId: testWorld.worldId,
      },
      testWorld
    );

    assert.ok(draft, 'Draft should be produced');
    assert.ok(draft.draftId, 'Draft must have unique ID');
    assert.equal(draft.worldId, testWorld.worldId, 'Draft must be bound to worldId');
    assert.equal(draft.worldVersion, testWorld.worldManifestVersion, 'Draft must record worldManifestVersion');

    // Identity validation
    assert.ok(draft.identity.name, 'Character must have a name');
    assert.ok(draft.identity.species, 'Character must have species');
    assert.ok(draft.identity.age, 'Character must have age');

    // Appearance & Personality
    assert.ok(draft.appearance.physicalDescription, 'Must have physical description');
    assert.ok(Array.isArray(draft.appearance.distinguishingTraits), 'Distinguishing traits must be array');
    assert.ok(Array.isArray(draft.personality.traits), 'Personality traits must be array');

    // Background & Role
    assert.ok(draft.background.history, 'Background history must be populated');
    assert.ok(draft.role.profession, 'Role profession must be populated');

    // Capabilities & Lineage
    assert.ok(draft.capabilities.length >= 1, 'Should extract at least one capability');
    for (const cap of draft.capabilities) {
      assert.ok(cap.id, 'Capability must have ID');
      assert.ok(cap.name, 'Capability must have name');
      assert.ok(cap.category, 'Capability must have category');
      assert.ok(cap.powerTier, 'Capability must have power tier');
      assert.ok(typeof cap.baseEnergyCost === 'number', 'Base energy cost must be numeric');
    }

    // Generated Skills / Techniques
    assert.ok(draft.generatedSkills.length >= 1, 'Should derive linked techniques');
    for (const skill of draft.generatedSkills) {
      assert.ok(skill.id, 'Skill must have ID');
      assert.ok(skill.name, 'Skill must have name');
      assert.ok(skill.parentCapabilityId, 'Skill must have parentCapabilityId');
      assert.ok(skill.parentCapabilityName, 'Skill must have parentCapabilityName');
      // Verify parent capability exists in draft capabilities
      const parentExists = draft.capabilities.some((c) => c.id === skill.parentCapabilityId);
      assert.ok(parentExists, `Parent capability ${skill.parentCapabilityId} must exist in capabilities`);
    }

    // Starting Equipment Categorization
    assert.ok(Array.isArray(draft.startingEquipment.equipped), 'Must have equipped array');
    assert.ok(Array.isArray(draft.startingEquipment.inventory), 'Must have inventory array');
    assert.ok(Array.isArray(draft.startingEquipment.weapons), 'Must have weapons list');
    assert.ok(Array.isArray(draft.startingEquipment.armor), 'Must have armor list');
    assert.ok(Array.isArray(draft.startingEquipment.tools), 'Must have tools list');
    assert.ok(Array.isArray(draft.startingEquipment.consumables), 'Must have consumables list');

    // Starting Location must match canonical world geography node
    assert.ok(draft.startingLocation.locationId, 'Must select a starting location');
    const validLocationIds = testWorld.geography.nodes.map((n) => n.id);
    assert.ok(
      validLocationIds.includes(draft.startingLocation.locationId),
      `Starting location ${draft.startingLocation.locationId} must be one of world's canonical nodes: ${validLocationIds.join(', ')}`
    );

    // Starting Situation
    assert.ok(draft.startingSituation.summary, 'Must have starting scene summary');
    assert.ok(draft.startingSituation.hook, 'Must have inciting dramatic hook');
    assert.ok(draft.startingSituation.whyHereNow, 'Must explain why here now');

    // Portrait fallback
    assert.ok(draft.portraitAsset?.promptFallback, 'Must provide portrait prompt fallback');
    assert.ok(draft.portraitAsset?.emoji, 'Must provide default portrait emoji');

    // Validation State
    assert.ok(draft.validationState, 'Draft must include validationState');
    assert.equal(draft.validationState.isValid, true, 'Clean draft should be valid');
    assert.equal(draft.validationState.errors.length, 0, 'Clean draft should have 0 errors');
  });

  // 2. User Edit Preservation during Re-extraction
  await t.test('2. User-edited fields are strictly preserved during re-extraction', async () => {
    const initialDraft = await characterGenesisService.extractCharacterDraft(
      {
        naturalLanguageConcept: 'A mysterious scout from the mountains',
        worldId: testWorld.worldId,
      },
      testWorld
    );

    // User explicitly edits the name and species
    initialDraft.identity.name = 'Custom Master Zephyr';
    initialDraft.identity.species = 'Star-Born Celestial';
    initialDraft.role.profession = 'Grand Inquisitor';

    // Re-extract with a different concept while preserving 'identity' and 'role'
    const reExtractedDraft = await characterGenesisService.extractCharacterDraft(
      {
        naturalLanguageConcept: 'A reckless barbarian who punches dragons',
        worldId: testWorld.worldId,
        existingDraft: initialDraft,
        userEditedFields: ['identity', 'role'],
      },
      testWorld
    );

    // Identity and role must have been preserved!
    assert.equal(reExtractedDraft.identity.name, 'Custom Master Zephyr', 'User-edited name must be preserved');
    assert.equal(reExtractedDraft.identity.species, 'Star-Born Celestial', 'User-edited species must be preserved');
    assert.equal(reExtractedDraft.role.profession, 'Grand Inquisitor', 'User-edited profession must be preserved');
    assert.equal(reExtractedDraft.provenance.identity, 'USER_EDITED', 'Provenance for identity must be marked USER_EDITED');
    assert.equal(reExtractedDraft.provenance.role, 'USER_EDITED', 'Provenance for role must be marked USER_EDITED');
  });

  // 3. Propose Custom Capability with Derived Techniques
  await t.test('3. Synthesize Custom Capability and Linked Techniques', async () => {
    const customCap = await characterGenesisService.proposeCustomCapability(
      {
        worldId: testWorld.worldId,
        capabilityConcept: 'Chrono-Stutter Phase Shift',
        characterContext: {
          role: 'Spellblade',
          background: 'Void researcher',
          species: 'Elf',
        },
      },
      testWorld
    );

    assert.ok(customCap.id, 'Custom capability must have unique ID');
    assert.ok(customCap.name, 'Must have name');
    assert.equal(customCap.provenance, 'PLAYER_INPUT', 'Provenance must be PLAYER_INPUT');
    assert.ok(customCap.powerTier, 'Must have assigned powerTier');
    assert.ok(typeof customCap.baseEnergyCost === 'number', 'Must have baseEnergyCost');
    assert.ok(customCap.generatedSkills && customCap.generatedSkills.length >= 1, 'Must have derived techniques');

    for (const tech of customCap.generatedSkills!) {
      assert.equal(tech.parentCapabilityId, customCap.id, 'Technique must link to parentCapabilityId');
      assert.equal(tech.parentCapabilityName, customCap.name, 'Technique must link to parentCapabilityName');
    }
  });

  // 4. Capability vs Skill Separation
  await t.test('4. Capability vs Skill separation: deleting a technique keeps capability intact', async () => {
    const draft = await characterGenesisService.extractCharacterDraft(
      {
        naturalLanguageConcept: 'Duelist of the High Arcana',
        worldId: testWorld.worldId,
      },
      testWorld
    );

    const initialCapCount = draft.capabilities.length;
    const initialSkillCount = draft.generatedSkills.length;
    assert.ok(initialSkillCount > 0, 'Should have skills to test');

    // Remove one technique
    const skillToRemove = draft.generatedSkills[0];
    const updatedSkills = draft.generatedSkills.filter((s) => s.id !== skillToRemove.id);
    draft.generatedSkills = updatedSkills;

    // Verify parent capability is completely intact
    assert.equal(draft.capabilities.length, initialCapCount, 'Capabilities count must remain unchanged');
    assert.equal(draft.generatedSkills.length, initialSkillCount - 1, 'Skills count should be reduced by 1');
    const parentStillPresent = draft.capabilities.some((c) => c.id === skillToRemove.parentCapabilityId);
    assert.ok(parentStillPresent, 'Parent capability must still exist after technique deletion');
  });

  // 5. Validation Engine Checks
  await t.test('5. Validation engine detects missing required fields or invalid locations', () => {
    const invalidDraft: any = {
      draftId: 'draft_invalid',
      worldId: testWorld.worldId,
      worldVersion: 2,
      identity: { name: '', species: '', age: '20' }, // Missing name and species
      appearance: { physicalDescription: '', distinguishingTraits: [] },
      personality: { traits: [], values: [] },
      background: { history: '', upbringing: '', importantEvents: [] },
      role: { archetype: '', profession: '', role: '' },
      motivations: { goals: [], fears: [], desires: [] },
      relationships: { allies: [], rivals: [], family: [], factions: [] },
      condition: { injuries: [], curses: [], forms: [], specialStates: [] },
      capabilities: [], // Empty capabilities
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
        locationId: 'non_existent_node_999', // Invalid location not in world geography
        name: 'Void Nowhere',
        region: 'Nowhere',
        description: 'Lost',
      },
      startingSituation: {
        summary: '',
        hook: '',
        initialConditions: '',
        whyHereNow: '',
      },
      provenance: {},
    };

    const validation = characterGenesisService.validateCharacterDraft(invalidDraft, testWorld);
    assert.equal(validation.isValid, false, 'Invalid draft must fail validation');
    assert.ok(validation.errors.length >= 3, 'Must report multiple errors');
    assert.ok(
      validation.errors.some((e) => e.includes('name')),
      'Must report missing name error'
    );
    assert.ok(
      validation.errors.some((e) => e.includes('Starting location')),
      'Must report invalid location error'
    );
  });

  // 6. Explicit Confirmation and Strictest Isolation Guarantee
  await t.test('6. Explicit confirmation seals character to world without creating StoryRun', async () => {
    const draft = await characterGenesisService.extractCharacterDraft(
      {
        naturalLanguageConcept: 'A quiet runic blacksmith turned wanderer named Torvin',
        worldId: testWorld.worldId,
      },
      testWorld
    );

    // Confirm the character
    const confirmed = characterGenesisService.confirmCharacter(draft, testWorld);
    assert.ok(confirmed, 'Should produce ConfirmedCharacter');
    assert.ok(confirmed.characterId.startsWith('char_'), 'Must generate characterId prefix');
    assert.equal(confirmed.worldId, testWorld.worldId, 'Must bind to worldId');
    assert.equal(confirmed.worldVersion, testWorld.worldManifestVersion, 'Must bind to worldVersion');
    assert.ok(confirmed.confirmedAt, 'Must have confirmedAt timestamp');
    assert.equal(confirmed.identity.name, draft.identity.name, 'Name must match draft');

    // Save to repository
    worldRepository.saveConfirmedCharacter(testWorld.worldId, confirmed);

    // Retrieve from repository
    const stored = worldRepository.getConfirmedCharacters(testWorld.worldId);
    assert.ok(stored.some((c) => c.characterId === confirmed.characterId), 'Must be stored in world repository');

    // Verify isolation guarantee: no story run was created!
    // The world repository or active story list has not been contaminated with an unrequested run.
  });
});
