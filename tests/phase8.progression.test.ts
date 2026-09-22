import test from 'node:test';
import assert from 'node:assert/strict';

import { CharacterProgressionEngine, type ProgressionModuleDefinition } from '../server/domain/characterProgressionEngine';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { canonicalCommandEngine } from '../server/domain/canonicalCommandEngine';
import { captureCanonicalStateSnapshot } from '../server/domain/canonicalSnapshot';
import { rulesProfileEngine, CHARACTER_PROGRESSION } from '../server/domain/rulesProfileEngine';

function seedRepo(storyId = 'phase8_test'): InMemoryWorldRepository {
  const repo = new InMemoryWorldRepository({ disablePersistence: true });
  repo.seedStory(storyId);
  repo.saveStoryRun({
    storyId,
    id: storyId,
    worldId: 'world_solar_archive',
    characterName: 'Phase 8 Test Hero',
    storyMode: 'PROTAGONIST',
    dndRulesMode: 'FULL_DND',
    rulesProfile: rulesProfileEngine.createDefault('FULL_DND'),
    ruleset: 'FULL_DND',
    generationSeed: 'phase8-tests',
    protagonist: {
      characterId: 'phase8-character',
      identity: { name: 'Phase 8 Test Hero', species: 'Human', age: 24 },
      role: { profession: 'Fighter', archetype: 'Warrior' },
      coreStats: {
        level: 1,
        armorClass: 10,
        speed: 30,
        hitDice: '1d10',
        hpCurrent: 12,
        hpMax: 12,
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      feats: [],
      progression: { classId: 'class_fighter', speciesId: 'species_human', featIds: [] },
    },
    characterCoreStats: {
      level: 1,
      armorClass: 10,
      speed: 30,
      hitDice: '1d10',
      hpCurrent: 12,
      hpMax: 12,
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    currentHp: 12,
    maxHp: 12,
  });
  return repo;
}

function actorId(repo: InMemoryWorldRepository, storyId: string): string {
  return repo.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`;
}

test('Phase 8 built-in class/species modules seed deterministically from Genesis', () => {
  const engine = new CharacterProgressionEngine();
  const state = engine.seedFromCharacter('hero', {
    identity: { name: 'Hero', species: 'Human', age: 20 },
    role: { profession: 'Fighter' },
    coreStats: { level: 1 } as any,
    feats: [],
  });
  assert.equal(state.classId, 'class_fighter');
  assert.equal(state.speciesId, 'species_human');
  assert.deepEqual(state.featIds, []);
  assert.ok(state.genesisSelectionFingerprint);
  assert.ok(state.enabledModuleIds.includes('class_fighter'));
  assert.ok(state.enabledModuleIds.includes('species_human'));
});

test('Phase 8 subclass prerequisites and minimum level are enforced', () => {
  const engine = new CharacterProgressionEngine();
  engine.seedFromCharacter('hero', { identity: { name: 'Hero', species: 'Human' }, role: { profession: 'Fighter' }, coreStats: { level: 1 } as any, feats: [] });
  assert.throws(
    () => engine.selectModule('hero', 'SUBCLASS', 'subclass_fighter_champion', 'phase8-subclass-early', rulesProfileEngine.createDefault('FULL_DND')),
    /requires level 3/
  );
  engine.levelUp('hero', 'phase8-level-2');
  engine.levelUp('hero', 'phase8-level-3');
  assert.throws(
    () => engine.selectModule('hero', 'SUBCLASS', 'subclass_fighter_champion', 'phase8-subclass-no-class', rulesProfileEngine.createDefault('FULL_DND')),
    /requires class 'class_fighter'/
  );
  engine.selectModule('hero', 'CLASS', 'class_fighter', 'phase8-class-ok', rulesProfileEngine.createDefault('FULL_DND'));
  const state = engine.selectModule('hero', 'SUBCLASS', 'subclass_fighter_champion', 'phase8-subclass-ok', rulesProfileEngine.createDefault('FULL_DND'));
  assert.equal(state.subclassId, 'subclass_fighter_champion');
  assert.ok(state.unlockedFeatureIds.includes('subclass_fighter_champion_core'));
});

test('Phase 8 feats become canonical progression modules with deterministic identity', () => {
  const engine = new CharacterProgressionEngine();
  const feat = {
    id: 'feat-alert',
    name: 'Alert',
    description: 'A canonical feat.',
    effects: [{ id: 'fx1', type: 'STAT_MODIFIER', target: 'combat.attackBonus', scope: 'combat', modifier: 1, value: 1, condition: '', description: 'Alert training.' }],
    prerequisites: [],
    tags: ['combat'],
    provenance: 'CHARACTER_GENESIS',
    worldId: 'world_solar_archive',
  } as any;
  const moduleA = engine.registerFeatModule(feat);
  const moduleB = engine.registerFeatModule(feat);
  assert.equal(moduleA.id, moduleB.id);
  engine.seedFromCharacter('hero', { identity: { name: 'Hero', species: 'Human' }, role: { profession: 'Fighter' }, coreStats: { level: 1 } as any, feats: [] });
  const state = engine.acquireFeat('hero', moduleA.id, 'phase8-feat', rulesProfileEngine.createDefault('FULL_DND'));
  assert.ok(state.featIds.includes(moduleA.id));
  assert.ok(state.unlockedFeatureIds.includes(moduleA.features[0].id));
});

test('Phase 8 modifier stacking and precedence produce deterministic source traces', () => {
  const engine = new CharacterProgressionEngine();
  engine.seedFromCharacter('hero', { identity: { name: 'Hero', species: 'Human' }, role: { profession: 'Fighter' }, coreStats: { level: 1 } as any, feats: [] });
  const module: ProgressionModuleDefinition = {
    id: 'feat_modifier_audit',
    type: 'FEAT',
    name: 'Modifier Audit',
    version: 1,
    enabled: true,
    provenance: 'CHARACTER_GENESIS',
    features: [{
      id: 'feat_modifier_audit_feature',
      name: 'Audit Feature',
      description: 'Tests precedence.',
      level: 1,
      enabled: true,
      passiveModifiers: [
        {
          id: 'set-low',
          target: 'combat.attackBonus',
          mode: 'SET',
          value: 2,
          precedence: 20,
          source: { moduleId: 'feat_modifier_audit', moduleType: 'FEAT', featureId: 'feat_modifier_audit_feature', sourceId: 'set-low', sourceName: 'Low set', precedence: 20 },
        },
        {
          id: 'set-high',
          target: 'combat.attackBonus',
          mode: 'SET',
          value: 5,
          precedence: 40,
          source: { moduleId: 'feat_modifier_audit', moduleType: 'FEAT', featureId: 'feat_modifier_audit_feature', sourceId: 'set-high', sourceName: 'High set', precedence: 40 },
        },
        {
          id: 'add-a',
          target: 'combat.attackBonus',
          mode: 'ADD',
          value: 1,
          precedence: 50,
          stackGroup: 'BONUS',
          source: { moduleId: 'feat_modifier_audit', moduleType: 'FEAT', featureId: 'feat_modifier_audit_feature', sourceId: 'add-a', sourceName: 'Add A', precedence: 50, stackGroup: 'BONUS' },
        },
        {
          id: 'add-b',
          target: 'combat.attackBonus',
          mode: 'ADD',
          value: 2,
          precedence: 50,
          stackGroup: 'BONUS',
          source: { moduleId: 'feat_modifier_audit', moduleType: 'FEAT', featureId: 'feat_modifier_audit_feature', sourceId: 'add-b', sourceName: 'Add B', precedence: 50, stackGroup: 'BONUS' },
        },
      ],
    }],
  };
  engine.registerModule(module);
  engine.acquireFeat('hero', module.id, 'phase8-modifier-enable', rulesProfileEngine.createDefault('FULL_DND'));
  const resolved = engine.resolveModifiers('hero');
  const attack = resolved.modifiers.find((entry) => entry.target === 'combat.attackBonus');
  assert.equal(attack?.value, 8);
  assert.equal(attack?.sources.length, 5);
  assert.ok(resolved.sourceTrace['combat.attackBonus'].some((source) => source.sourceId === 'set-high'));
});

test('Phase 8 triggered abilities unlock with level and enforce charges', () => {
  const engine = new CharacterProgressionEngine();
  engine.seedFromCharacter('hero', { identity: { name: 'Hero', species: 'Human' }, role: { profession: 'Fighter' }, coreStats: { level: 1 } as any, feats: [] });
  engine.levelUp('hero', 'phase8-l2');
  engine.levelUp('hero', 'phase8-l3');
  engine.levelUp('hero', 'phase8-l4');
  engine.levelUp('hero', 'phase8-l5');
  const ability = engine.getTriggeredAbilities('hero', 'REACTION').find((entry) => entry.id === 'ability_fighter_second_wind');
  assert.ok(ability);
  const first = engine.consumeTriggeredAbility('hero', ability!.id, 'phase8-trigger-1');
  assert.equal(first.success, true);
  assert.equal(engine.getState('hero')?.usage[ability!.id].chargesRemaining, 0);
  assert.throws(() => engine.consumeTriggeredAbility('hero', ability!.id, 'phase8-trigger-2'), /no charges remaining/);
});

test('Phase 8 rules profiles gate progression and allow explicit Hybrid overrides', () => {
  const full = rulesProfileEngine.createDefault('FULL_DND');
  const hybrid = rulesProfileEngine.createDefault('HYBRID_DND');
  const custom = rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND');
  assert.equal(rulesProfileEngine.allowsCharacterProgression(full), true);
  assert.equal(rulesProfileEngine.allowsCharacterProgression(hybrid), true);
  assert.equal(rulesProfileEngine.allowsCharacterProgression(custom), false);

  const hybridDisabled = rulesProfileEngine.resolve({
    mode: 'HYBRID_DND',
    rulesProfile: {
      mode: 'HYBRID_DND',
      overrides: [{ ruleId: CHARACTER_PROGRESSION, operation: 'DISABLE', reason: 'Phase 8 test disable.' }],
    },
  }).profile;
  assert.equal(rulesProfileEngine.allowsCharacterProgression(hybridDisabled), false);

  const hybridEnabled = rulesProfileEngine.resolve({
    mode: 'HYBRID_DND',
    rulesProfile: {
      mode: 'HYBRID_DND',
      overrides: [{
        ruleId: CHARACTER_PROGRESSION,
        operation: 'SET',
        reason: 'Phase 8 test module allowlist.',
        value: { maxCharacterLevel: 12, allowClassSelection: true },
      }],
    },
  }).profile;
  assert.equal(hybridEnabled.parameterOverrides[CHARACTER_PROGRESSION]['maxCharacterLevel'], 12);
});

test('Phase 8 Custom Homebrew requires explicit progression enable and custom module authority', () => {
  const engine = new CharacterProgressionEngine();
  engine.seedFromCharacter('hero', { identity: { name: 'Hero', species: 'Human' }, role: { profession: 'Fighter' }, coreStats: { level: 1 } as any, feats: [] });
  const customDefault = rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND');
  assert.throws(() => engine.levelUp('hero', 'phase8-custom-disabled', customDefault), /disabled/);

  const customEnabled = rulesProfileEngine.resolve({
    mode: 'CUSTOM_HOMEBREW_DND',
    rulesProfile: {
      mode: 'CUSTOM_HOMEBREW_DND',
      overrides: [
        { ruleId: CHARACTER_PROGRESSION, operation: 'ENABLE', reason: 'Explicitly enable homebrew progression.' },
        { ruleId: CHARACTER_PROGRESSION, operation: 'SET', reason: 'Permit custom modules.', value: { allowCustomModules: true, allowLevelUp: true } },
      ],
    },
  }).profile;
  assert.equal(rulesProfileEngine.allowsCharacterProgression(customEnabled), true);
  assert.equal(engine.levelUp('hero', 'phase8-custom-enabled', customEnabled).currentLevel, 2);
});

test('Phase 8 canonical progression level-up is staged, idempotent, and rollback-safe', async () => {
  const storyId = 'phase8_canonical';
  const repo = seedRepo(storyId);
  const id = actorId(repo, storyId);

  const execute = (commandId: string) => canonicalCommandEngine.execute(
    repo,
    {
      commandId,
      storyId,
      actorId: id,
      type: 'PROGRESSION',
      payload: { operation: 'LEVEL_UP' },
      source: 'PLAYER',
      transactionMode: 'STAGED',
    },
    async (command, context) => {
      const progression = context.repository.getCharacterProgressionEngine(storyId);
      const rules = context.repository.getRulesProfile(storyId);
      const state = progression.levelUp(id, command.commandId, rules);
      return { success: true, data: { state }, summary: 'Phase 8 level-up.' };
    }
  );

  const first = await execute('phase8-level-up-001');
  assert.equal(first.success, true);
  assert.equal(repo.getCharacterProgressionEngine(storyId).getState(id)?.currentLevel, 2);
  const replay = await execute('phase8-level-up-001');
  assert.equal(replay.success, true);
  assert.equal(repo.getCharacterProgressionEngine(storyId).getState(id)?.currentLevel, 2);
  assert.equal(replay.event?.replay.postStateHash, first.event?.replay.postStateHash);

  const before = captureCanonicalStateSnapshot(storyId, repo);
  const rejected = await canonicalCommandEngine.execute(repo, {
    commandId: 'phase8-level-up-invalid',
    storyId,
    actorId: id,
    type: 'PROGRESSION',
    payload: { operation: 'LEVEL_UP' },
    source: 'PLAYER',
    transactionMode: 'STAGED',
  }, async (command, context) => {
    context.repository.getCharacterProgressionEngine(storyId).levelUp(id, command.commandId, context.repository.getRulesProfile(storyId));
    return { success: false, errorReason: 'Forced Phase 8 rollback test.' };
  });
  assert.equal(rejected.success, false);
  const after = captureCanonicalStateSnapshot(storyId, repo);
  assert.deepEqual(after.progression, before.progression);
});

test('Phase 8 progression state survives canonical snapshot save/load', () => {
  const storyId = 'phase8_snapshot';
  const repo = seedRepo(storyId);
  const id = actorId(repo, storyId);
  const profile = rulesProfileEngine.createDefault('FULL_DND');
  const engine = repo.getCharacterProgressionEngine(storyId);

  const before = captureCanonicalStateSnapshot(storyId, repo);

  const restored = new InMemoryWorldRepository({ disablePersistence: true });
  restored.seedStory(storyId);
  restored.restoreCanonicalStateSnapshot(before);

  assert.deepEqual(restored.getCharacterProgressionEngine(storyId).getState(id), engine.getState(id));
  assert.deepEqual(restored.getCharacterProgressionEngine(storyId).resolveModifiers(id), engine.resolveModifiers(id));
});

test('Phase 8 campaign archive preserves progression state without changing legacy archives', () => {
  const storyId = 'phase8_archive';
  const repo = seedRepo(storyId);
  const id = actorId(repo, storyId);
  const engine = repo.getCharacterProgressionEngine(storyId);
  const archive = repo.exportCampaignArchive(storyId, 'Phase 8 Archive');
  assert.ok(archive.partitions['canonical/progression.json']);
  assert.ok(archive.manifest.partitionHashes['canonical/progression.json']);

  const restored = new InMemoryWorldRepository({ disablePersistence: true });
  const result = restored.restoreCampaignArchive(archive, storyId);
  assert.equal(result.success, true);
  assert.deepEqual(restored.getCharacterProgressionEngine(storyId).getState(id), engine.getState(id));
});

test('Phase 8 authoritative progression engine rejects direct runtime mutation outside canonical scope', () => {
  const storyId = 'phase8_authority';
  const repo = seedRepo(storyId);
  const id = actorId(repo, storyId);
  const engine = repo.getCharacterProgressionEngine(storyId);
  assert.throws(() => engine.levelUp(id, 'outside-command'), /active canonical command transaction/);
  assert.equal(engine.getState(id)?.currentLevel, 1);
});

test('Phase 8 Genesis/runtime divergence audit detects sealed-character progression drift', () => {
  const storyId = 'phase8_divergence';
  const repo = seedRepo(storyId);
  const id = actorId(repo, storyId);
  const engine = repo.getCharacterProgressionEngine(storyId);
  const original = repo.getStoryRun(storyId)?.protagonist;
  assert.equal(engine.detectGenesisDivergence(id, original).divergent, false);
  const drifted = { ...original, coreStats: { ...original.coreStats, level: 2 } };
  assert.equal(engine.detectGenesisDivergence(id, drifted).divergent, true);
});


test('Phase 8 module enable/disable remains singular for class/species and prevents stale modifier stacking', () => {
  const engine = new CharacterProgressionEngine();
  const full = rulesProfileEngine.createDefault('FULL_DND');
  engine.seedFromCharacter('hero', { identity: { name: 'Hero', species: 'Human' }, role: { profession: 'Fighter' }, coreStats: { level: 1 } as any, feats: [] });
  engine.setModuleEnabled('hero', 'class_rogue', true, 'phase8-switch-class', full);
  const state = engine.getState('hero')!;
  assert.equal(state.classId, 'class_rogue');
  assert.equal(state.enabledModuleIds.includes('class_fighter'), false);
  assert.equal(state.enabledModuleIds.includes('class_rogue'), true);
  const attack = engine.resolveModifiers('hero').modifiers.find((entry) => entry.target === 'combat.attackBonus');
  assert.equal(attack?.value, 1);
  engine.setModuleEnabled('hero', 'class_rogue', false, 'phase8-disable-class', full);
  assert.equal(engine.getState('hero')?.classId, undefined);
  assert.equal(engine.resolveModifiers('hero').modifiers.some((entry) => entry.target === 'combat.attackBonus'), false);
});

test('Phase 8 malformed progression rule overrides fail closed', () => {
  const profile = rulesProfileEngine.resolve({
    mode: 'HYBRID_DND',
    rulesProfile: {
      mode: 'HYBRID_DND',
      overrides: [{
        ruleId: CHARACTER_PROGRESSION,
        operation: 'SET',
        reason: 'Malformed boolean test.',
        value: { allowLevelUp: 'yes' as any, maxCharacterLevel: 12 },
      }],
    },
  }).profile;
  assert.equal(profile.parameterOverrides[CHARACTER_PROGRESSION], undefined);
  assert.equal(rulesProfileEngine.allowsCharacterProgression(profile), true);
});

test('Phase 8 ability effects require canonical scope and commit deterministic active effects', async () => {
  const storyId = 'phase8_ability_authority';
  const repo = seedRepo(storyId);
  const id = actorId(repo, storyId);
  const run = repo.getStoryRun(storyId);
  repo.saveStoryRun({ ...run, canonicalCapabilities: ['abil_arcane_shield'] });
  const { abilityService } = await import('../server/services/abilityService');

  const direct = abilityService.resolveAbilityApplication(storyId, 'abil_arcane_shield', id, {}, repo);
  assert.equal(direct.success, false);
  assert.equal(direct.statusCode, 409);

  const command = await canonicalCommandEngine.execute(repo, {
    commandId: 'phase8-ability-command-001',
    storyId,
    actorId: id,
    type: 'APPLY_ABILITY',
    payload: { abilityId: 'abil_arcane_shield', targetId: id },
    source: 'PLAYER',
    transactionMode: 'STAGED',
  }, async (_command, context) => {
    const result = abilityService.resolveAbilityApplication(storyId, 'abil_arcane_shield', id, {}, context.repository);
    return { success: result.success, data: result, errorReason: result.errorReason, summary: 'Phase 8 canonical ability effect.' };
  });
  assert.equal(command.success, true);
  assert.ok((command.data as any)?.activeEffect?.effectId);
  assert.equal(repo.getActiveEffects(storyId).length, 1);
});


test('Phase 8 regression: canonical snapshot restores progression after a committed level-up', async () => {
  const storyId = 'phase8_snapshot_mutated';
  const repo = seedRepo(storyId);
  const id = actorId(repo, storyId);

  const result = await canonicalCommandEngine.execute(repo, {
    commandId: 'phase8-snapshot-level-up',
    storyId,
    actorId: id,
    type: 'PROGRESSION',
    payload: { operation: 'LEVEL_UP' },
    source: 'PLAYER',
    transactionMode: 'STAGED',
  }, async (command, context) => {
    const progression = context.repository.getCharacterProgressionEngine(storyId);
    progression.levelUp(id, command.commandId, context.repository.getRulesProfile(storyId));
    return { success: true, data: { level: progression.getState(id)?.currentLevel }, summary: 'Level up for snapshot regression.' };
  });

  assert.equal(result.success, true);
  assert.equal(repo.getCharacterProgressionEngine(storyId).getState(id)?.currentLevel, 2);

  const snapshot = captureCanonicalStateSnapshot(storyId, repo);
  const restored = new InMemoryWorldRepository({ disablePersistence: true });
  restored.seedStory(storyId);
  restored.restoreCanonicalStateSnapshot(snapshot);

  assert.equal(restored.getCharacterProgressionEngine(storyId).getState(id)?.currentLevel, 2);
  assert.deepEqual(
    restored.getCharacterProgressionEngine(storyId).resolveModifiers(id),
    repo.getCharacterProgressionEngine(storyId).resolveModifiers(id)
  );
});

test('Phase 8 regression: progression modifiers reach authoritative combat projections and attack resolution', () => {
  const storyId = 'phase8_combat_projection';
  const repo = seedRepo(storyId);
  const id = actorId(repo, storyId);
  const combat = repo.getCombatEngine(storyId);

  combat.addParticipant({
    id,
    name: 'Hero',
    x: 0,
    y: 0,
    initiative: 10,
    team: 'player_allies',
    hpCurrent: 20,
    hpMax: 20,
    armorClass: 10,
    speedCells: 6,
    attackBonus: 0,
    damageFormula: '1d4',
    conditions: [],
    isDead: false,
  });
  combat.addParticipant({
    id: 'enemy',
    name: 'Enemy',
    x: 1,
    y: 0,
    initiative: 1,
    team: 'enemies',
    hpCurrent: 20,
    hpMax: 20,
    armorClass: 100,
    speedCells: 6,
    attackBonus: 0,
    damageFormula: '1d4',
    conditions: [],
    isDead: false,
  });

  const projected = combat.getParticipant(id)!;
  assert.equal(projected.attackBonus, 1);
  assert.equal(projected.armorClass, 10);
  assert.equal(projected.hpMax, 24);

  combat.rollInitiative();
  const result = combat.executeAttack(id, 'enemy');
  assert.equal(result.success, true);
});

test('Phase 8 regression: progression spell attack bonus and save DC are authoritative cast inputs', () => {
  const storyId = 'phase8_spell_projection';
  const repo = seedRepo(storyId);
  const id = actorId(repo, storyId);
  const combat = repo.getCombatEngine(storyId);

  combat.addParticipant({
    id,
    name: 'Wizard',
    x: 0,
    y: 0,
    initiative: 10,
    team: 'player_allies',
    hpCurrent: 20,
    hpMax: 20,
    armorClass: 10,
    speedCells: 6,
    attackBonus: 0,
    damageFormula: '1d4',
    conditions: [],
    isDead: false,
    spellAttackBonus: 0,
    spellSaveDc: 8,
  });
  combat.addParticipant({
    id: 'enemy',
    name: 'Enemy',
    x: 2,
    y: 0,
    initiative: 1,
    team: 'enemies',
    hpCurrent: 20,
    hpMax: 20,
    armorClass: 100,
    speedCells: 6,
    attackBonus: 0,
    damageFormula: '1d4',
    conditions: [],
    isDead: false,
  });
  combat.rollInitiative();

  const projected = combat.getParticipant(id)!;
  assert.equal(projected.spellAttackBonus, 0);
  assert.equal(projected.spellSaveDc, 8);

  const result = combat.executeSpellCast({
    actorId: id,
    spellId: 'fire_bolt',
    targetId: 'enemy',
  });
  assert.equal(result.success, true);
});

test('Phase 8 regression: explicit Custom Homebrew progression enables level progression without silently enabling modules', () => {
  const engine = new CharacterProgressionEngine();
  engine.seedFromCharacter('hero', {
    identity: { name: 'Hero', species: 'Human' },
    role: { profession: 'Fighter' },
    coreStats: { level: 1 } as any,
    feats: [],
  });
  const customEnabled = rulesProfileEngine.resolve({
    mode: 'CUSTOM_HOMEBREW_DND',
    rulesProfile: {
      mode: 'CUSTOM_HOMEBREW_DND',
      overrides: [
        { ruleId: CHARACTER_PROGRESSION, operation: 'ENABLE', reason: 'Explicit progression enable.' },
        { ruleId: CHARACTER_PROGRESSION, operation: 'SET', reason: 'Explicit progression policy.', value: { allowLevelUp: true } },
      ],
    },
  }).profile;

  assert.equal(engine.levelUp('hero', 'phase8-custom-explicit', customEnabled).currentLevel, 2);
  assert.throws(
    () => engine.selectModule('hero', 'CLASS', 'class_wizard', 'phase8-custom-module', customEnabled),
    /disabled by the active rules profile/
  );
});


test('Phase 8 regression: disabling a module for one actor does not disable it globally', () => {
  const engine = new CharacterProgressionEngine();
  const full = rulesProfileEngine.createDefault('FULL_DND');
  engine.seedFromCharacter('hero_a', { identity: { name: 'A', species: 'Human' }, role: { profession: 'Fighter' }, coreStats: { level: 1 } as any, feats: [] });
  engine.seedFromCharacter('hero_b', { identity: { name: 'B', species: 'Human' }, role: { profession: 'Fighter' }, coreStats: { level: 1 } as any, feats: [] });

  engine.setModuleEnabled('hero_a', 'class_fighter', false, 'phase8-disable-a', full);
  assert.equal(engine.resolveModifiers('hero_a').modifiers.some((entry) => entry.target === 'combat.attackBonus'), false);
  assert.equal(engine.resolveModifiers('hero_b').modifiers.find((entry) => entry.target === 'combat.attackBonus')?.value, 1);
  assert.equal(engine.getModule('class_fighter')?.enabled, true);
});

test('Phase 8 regression: Genesis divergence fingerprint maps character feat IDs to canonical feat module IDs', () => {
  const engine = new CharacterProgressionEngine();
  const feat = {
    id: 'feat-genesis-alert',
    name: 'Alert',
    description: 'Genesis feat',
    effects: [],
    prerequisites: [],
    provenance: 'CHARACTER_GENESIS',
    worldId: 'world_solar_archive',
  } as any;
  const character = {
    identity: { name: 'Hero', species: 'Human' },
    role: { profession: 'Fighter' },
    coreStats: { level: 1 },
    feats: [feat],
    progression: { classId: 'class_fighter', speciesId: 'species_human', featIds: [feat.id] },
  } as any;

  engine.seedFromCharacter('hero', character);
  const audit = engine.detectGenesisDivergence('hero', character);
  assert.equal(audit.divergent, false);
});
