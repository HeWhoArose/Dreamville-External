import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TacticalCombatEngine,
} from '../server/domain/combatEngine';
import {
  SpellRuntime,
  SpellDefinition,
} from '../server/domain/spellRuntime';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { captureCanonicalStateSnapshot } from '../server/domain/canonicalSnapshot';
import { canonicalCommandEngine } from '../server/domain/canonicalCommandEngine';
import { HistoricalChronicleEngine } from '../server/domain/historicalChronicleEngine';

HistoricalChronicleEngine.bypassTransactionCheck = false;

function participant(
  id: string,
  initiative: number,
  hp = 30
): import('../server/domain/combatEngine').BattlefieldParticipant {
  return {
    id,
    name: id,
    x: id === 'caster' ? 0 : 2,
    y: 0,
    initiative,
    team: id === 'caster' ? 'player_allies' : 'enemies',
    hpCurrent: hp,
    hpMax: hp,
    armorClass: 12,
    speedCells: 6,
    attackBonus: 5,
    damageFormula: '1d6',
    damageType: 'bludgeoning',
    conditions: [],
    isDead: false,
  };
}

function seedRepo(storyId: string): InMemoryWorldRepository {
  const repo = new InMemoryWorldRepository({ disablePersistence: true });
  repo.seedStory(storyId);
  repo.saveStoryRun({
    storyId,
    id: storyId,
    worldId: 'world_solar_archive',
    characterName: 'Phase 6 Audit Hero',
    storyMode: 'PROTAGONIST',
    dndRulesMode: 'FULL_DND',
    ruleset: 'FULL_DND',
    rulesProfile: rulesProfileEngine.createDefault('FULL_DND'),
    generationSeed: 'phase6-authority-audit',
  });
  return repo;
}

function registerTestFireSpell(runtime: SpellRuntime): SpellDefinition {
  const spell: SpellDefinition = {
    id: 'phase6_audit_fire',
    name: 'Phase 6 Audit Fire',
    level: 1,
    school: 'evocation',
    castingTime: 'ACTION',
    range: 60,
    rangeType: 'RANGED',
    targetType: 'SINGLE_ENEMY',
    durationRounds: 0,
    requiresConcentration: false,
    isRitual: false,
    defenseModel: 'AUTOMATIC',
    damageFormula: '2d10+3',
    damageType: 'fire',
    description: 'Test-only deterministic fire damage spell.',
  };
  runtime.registerSpell(spell);
  return spell;
}

test('Phase 6 audit: resistance and death use canonical combat damage authority', () => {
  const engine = new TacticalCombatEngine(1337);
  const caster = participant('caster', 20, 30);
  const target = participant('target', 10, 3);
  target.resistances = ['fire'];

  engine.addParticipant(caster);
  engine.addParticipant(target);
  engine.rollInitiative();

  const runtime = engine.getSpellRuntime();
  const spell = registerTestFireSpell(runtime);
  runtime.initializeSlots(caster.id, { 1: { current: 1, max: 1 } });
  runtime.learnSpell(caster.id, spell.id);
  runtime.prepareSpell(caster.id, spell.id);

  const result = engine.executeSpellCast({
    actorId: caster.id,
    spellId: spell.id,
    targetId: target.id,
    slotLevel: 1,
  });

  assert.equal(result.success, true);
  assert.equal(result.result?.targetResisted, true);
  assert.ok((result.result?.damageInflicted || 0) >= 2);
  assert.equal(result.result?.targetDied, true);
  assert.equal(engine.getParticipant(target.id)?.isDead, true);
});

test('Phase 6 audit: concentration is interrupted by canonical zero-HP death', () => {
  const engine = new TacticalCombatEngine(1337);
  const caster = participant('caster', 20, 5);

  engine.addParticipant(caster);
  engine.rollInitiative();

  const runtime = engine.getSpellRuntime();
  runtime.initializeSlots(caster.id, { 2: { current: 1, max: 1 } });
  runtime.learnSpell(caster.id, 'invisibility');
  runtime.prepareSpell(caster.id, 'invisibility');

  const cast = engine.executeSpellCast({
    actorId: caster.id,
    spellId: 'invisibility',
    targetId: caster.id,
    slotLevel: 2,
  });

  assert.equal(cast.success, true);
  assert.equal(runtime.getActorState(caster.id)?.activeConcentration?.spellId, 'invisibility');

  const damage = engine.resolveAuthoritativeSpellDamage(caster, 99, 'force');
  assert.equal(damage.targetDied, true);
  assert.equal(caster.isDead, true);
  assert.equal(runtime.getActorState(caster.id)?.activeConcentration, null);
});

test('Phase 6 audit: canonical save/load preserves spell slots and concentration state', () => {
  const storyId = 'phase6_save_load_audit';
  const repo = seedRepo(storyId);
  const combat = repo.getCombatEngine(storyId);
  const caster = participant('caster', 20, 30);

  combat.addParticipant(caster);
  combat.rollInitiative();

  const runtime = combat.getSpellRuntime();
  runtime.initializeSlots(caster.id, { 2: { current: 2, max: 2 } });
  runtime.learnSpell(caster.id, 'invisibility');
  runtime.prepareSpell(caster.id, 'invisibility');

  const cast = combat.executeSpellCast({
    actorId: caster.id,
    spellId: 'invisibility',
    targetId: caster.id,
    slotLevel: 2,
  });
  assert.equal(cast.success, true);

  const before = captureCanonicalStateSnapshot(storyId, repo);
  const restored = new InMemoryWorldRepository({ disablePersistence: true });
  restored.seedStory(storyId);
  restored.saveStoryRun({
    storyId,
    id: storyId,
    worldId: 'world_solar_archive',
    characterName: 'Phase 6 Audit Hero',
    storyMode: 'PROTAGONIST',
    dndRulesMode: 'FULL_DND',
    ruleset: 'FULL_DND',
    rulesProfile: rulesProfileEngine.createDefault('FULL_DND'),
    generationSeed: 'phase6-authority-audit',
  });
  restored.restoreCanonicalStateSnapshot(before, { persist: false });

  const originalSpellState = repo.getCombatEngine(storyId).exportState().spellRuntimeState;
  const restoredSpellState = restored.getCombatEngine(storyId).exportState().spellRuntimeState;

  assert.deepEqual(restoredSpellState, originalSpellState);
  assert.equal(
    restored.getCombatEngine(storyId).getSpellRuntime().getActorState(caster.id)?.activeConcentration?.spellId,
    'invisibility'
  );
  assert.equal(
    restored.getCombatEngine(storyId).getSpellRuntime().getActorState(caster.id)?.spellSlots[2].current,
    1
  );
});

test('Phase 6 audit: FULL, HYBRID, and CUSTOM rules modes do not silently cross semantic boundaries', () => {
  const full = rulesProfileEngine.createDefault('FULL_DND');
  const fullRuntime = new SpellRuntime();
  fullRuntime.initializeSlots('full', { 1: { current: 1, max: 1 } });
  const fullState = fullRuntime.getOrCreateActorState('full');
  fullState.knownSpells = ['magic_missile'];
  fullState.preparedSpells = [];

  const fullCast = fullRuntime.castSpellAuthoritative({
    request: {
      casterId: 'full',
      spellId: 'magic_missile',
      targetId: 'dummy',
      slotLevel: 1,
      rulesProfile: full,
      allowSyntheticTarget: true,
    },
  });
  assert.equal(fullCast.success, false);
  assert.equal(fullCast.errorCode, 'SPELL_NOT_PREPARED');

  const hybrid = rulesProfileEngine.createDefault('HYBRID_DND');
  const hybridRuntime = new SpellRuntime();
  hybridRuntime.initializeSlots('hybrid', { 1: { current: 0, max: 0 } });
  const hybridState = hybridRuntime.getOrCreateActorState('hybrid');
  hybridState.knownSpells = ['magic_missile'];
  hybridState.preparedSpells = [];
  hybrid.parameterOverrides = {
    standard_dnd_spell_rules: {
      unlimitedSpellSlots: true,
      allowUnpreparedCasting: true,
    },
  };

  const hybridCast = hybridRuntime.castSpellAuthoritative({
    request: {
      casterId: 'hybrid',
      spellId: 'magic_missile',
      targetId: 'dummy',
      slotLevel: 1,
      rulesProfile: hybrid,
      allowSyntheticTarget: true,
    },
  });
  assert.equal(hybridCast.success, true);

  const custom = rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND');
  custom.parameterOverrides = {
    standard_dnd_spell_rules: {
      unlimitedSpellSlots: false,
      allowUnpreparedCasting: false,
    },
  };
  const customRuntime = new SpellRuntime();
  customRuntime.initializeSlots('custom', { 1: { current: 0, max: 0 } });
  const customState = customRuntime.getOrCreateActorState('custom');
  customState.knownSpells = [];
  customState.preparedSpells = [];

  const customCast = customRuntime.castSpellAuthoritative({
    request: {
      casterId: 'custom',
      spellId: 'magic_missile',
      targetId: 'dummy',
      slotLevel: 1,
      rulesProfile: custom,
      allowSyntheticTarget: true,
    },
  });

  assert.equal(customCast.success, true);
  assert.equal(customRuntime.getActorState('custom')?.spellSlots[1].current, 0);
});

test('Phase 6 audit: area spells resolve multiple authoritative targets', () => {
  const engine = new TacticalCombatEngine(1337);
  const caster = participant('caster', 20, 30);
  const firstTarget = participant('target_a', 10, 20);
  const secondTarget = participant('target_b', 5, 20);
  firstTarget.x = 10;
  secondTarget.x = 11;
  engine.addParticipant(caster);
  engine.addParticipant(firstTarget);
  engine.addParticipant(secondTarget);
  engine.rollInitiative();

  const runtime = engine.getSpellRuntime();
  runtime.initializeSlots(caster.id, { 3: { current: 1, max: 1 } });
  runtime.learnSpell(caster.id, 'fireball');
  runtime.prepareSpell(caster.id, 'fireball');

  const cast = engine.executeSpellCast({
    actorId: caster.id,
    spellId: 'fireball',
    targetPosition: { x: 10, y: 0 },
    slotLevel: 3,
  });

  assert.equal(cast.success, true);
  assert.ok((cast.result?.damageInflicted || 0) > 0);
  assert.notEqual(engine.getParticipant(firstTarget.id)?.hpCurrent, firstTarget.hpMax);
  assert.notEqual(engine.getParticipant(secondTarget.id)?.hpCurrent, secondTarget.hpMax);
  assert.match(cast.result?.headline || '', /affecting 2 creatures/);
});

test('Phase 6 audit: concentration buffs are reverted when concentration breaks', () => {
  const engine = new TacticalCombatEngine(1337);
  const caster = participant('caster', 20, 30);
  const ally = participant('ally', 10, 30);
  ally.team = 'player_allies';
  ally.x = 5;
  ally.armorClass = 14;
  ally.speedCells = 6;
  engine.addParticipant(caster);
  engine.addParticipant(ally);
  engine.rollInitiative();

  const runtime = engine.getSpellRuntime();
  runtime.initializeSlots(caster.id, { 3: { current: 1, max: 1 } });
  runtime.learnSpell(caster.id, 'haste');
  runtime.prepareSpell(caster.id, 'haste');

  const cast = engine.executeSpellCast({
    actorId: caster.id,
    spellId: 'haste',
    targetId: ally.id,
    slotLevel: 3,
  });

  assert.equal(cast.success, true);
  assert.equal(engine.getParticipant(ally.id)?.armorClass, 16);
  assert.equal(engine.getParticipant(ally.id)?.speedCells, 12);
  assert.equal(runtime.getActorState(caster.id)?.activeConcentration?.spellId, 'haste');

  const interrupted = engine.interruptConcentration(caster.id, 'Phase 6 audit');
  assert.equal(interrupted.interrupted, true);
  assert.equal(engine.getParticipant(ally.id)?.armorClass, 14);
  assert.equal(engine.getParticipant(ally.id)?.speedCells, 6);
  assert.equal(runtime.getActorState(caster.id)?.activeConcentration, null);
});

test('Phase 6 audit: authoritative target rejection is side-effect free', () => {
  const runtime = new SpellRuntime();
  runtime.initializeSlots('caster', { 1: { current: 1, max: 1 } });
  runtime.learnSpell('caster', 'magic_missile');
  runtime.prepareSpell('caster', 'magic_missile');

  const before = runtime.getActorState('caster');
  const rejected = runtime.castSpellAuthoritative({
    request: {
      casterId: 'caster',
      spellId: 'magic_missile',
      targetId: 'missing_authoritative_target',
      slotLevel: 1,
      requireAuthoritativeTarget: true,
    },
  });

  assert.equal(rejected.success, false);
  assert.equal(rejected.errorCode, 'TARGET_NOT_FOUND');
  assert.deepEqual(runtime.getActorState('caster'), before);
});

test('Phase 6 audit: canonical cast commits Chronicle evidence once and idempotent replay does not double-spend', async () => {
  const storyId = 'phase6_canonical_cast_audit';
  const repo = seedRepo(storyId);
  const combat = repo.getCombatEngine(storyId);
  const caster = participant('caster', 20, 30);
  const target = participant('target', 10, 30);
  combat.addParticipant(caster);
  combat.addParticipant(target);
  combat.rollInitiative();

  const runtime = combat.getSpellRuntime();
  runtime.initializeSlots(caster.id, { 1: { current: 1, max: 1 } });
  runtime.learnSpell(caster.id, 'magic_missile');
  runtime.prepareSpell(caster.id, 'magic_missile');

  const commandId = 'phase6_canonical_cast_001';
  const run = async () => canonicalCommandEngine.execute(
    repo,
    {
      commandId,
      storyId,
      actorId: caster.id,
      type: 'CAST',
      payload: { spellId: 'magic_missile', targetId: target.id, slotLevel: 1 },
      source: 'PLAYER',
      transactionMode: 'STAGED',
    },
    async (_command, context) => {
      const transactionCombat = context.repository.getCombatEngine(storyId);
      const spellResult = transactionCombat.executeSpellCast({
        actorId: caster.id,
        spellId: 'magic_missile',
        targetId: target.id,
        slotLevel: 1,
      });
      if (!spellResult.success || !spellResult.result) {
        return { success: false, errorReason: spellResult.errorReason || 'Spell cast rejected.' };
      }

      const clock = context.repository.getWorldClock(storyId);
      context.repository.getHistoricalChronicleEngine(storyId).recordEvidence({
        id: 'phase6_spell_evidence_001',
        sourceEventId: commandId,
        category: 'SACRED_OR_HISTORIC',
        timestamp: clock.getTimestamp(),
        primarySubjectId: caster.id,
        secondarySubjectId: target.id,
        locationId: 'loc_whispering_orrery',
        summary: spellResult.result.headline,
        details: spellResult.result.headline,
        provenance: 'canonical_spell_runtime',
        visibility: 'PUBLIC',
      });

      return {
        success: true,
        data: spellResult.result,
        summary: 'Canonical spell cast committed.',
      };
    }
  );

  const first = await run();
  assert.equal(first.success, true);
  assert.equal(repo.getCombatEngine(storyId).getSpellRuntime().getActorState(caster.id)?.spellSlots[1].current, 0);

  const evidenceAfterFirst = repo.getHistoricalChronicleEngine(storyId).getEpistemicEvidence();
  assert.ok(evidenceAfterFirst.some((e) => e.id === 'phase6_spell_evidence_001'));
  const committedEvidence = evidenceAfterFirst.find((e) => e.id === 'phase6_spell_evidence_001');
  assert.equal(committedEvidence?.metadata?.canonicalEventId, first.event?.eventId);
  assert.equal(committedEvidence?.metadata?.canonicalCommandId, commandId);

  const second = await run();
  assert.equal(second.success, true);
  assert.equal(second.event?.eventId, first.event?.eventId);
  assert.equal(repo.getHistoricalChronicleEngine(storyId).getEpistemicEvidence().filter((e) => e.id === 'phase6_spell_evidence_001').length, 1);
  assert.equal(repo.getCombatEngine(storyId).getSpellRuntime().getActorState(caster.id)?.spellSlots[1].current, 0);
});

test('Phase 6 audit: rejected canonical spell transaction rolls back spell state, combat state, and Chronicle evidence', async () => {
  const storyId = 'phase6_canonical_cast_rollback_audit';
  const repo = seedRepo(storyId);
  const combat = repo.getCombatEngine(storyId);
  const caster = participant('caster', 20, 30);
  const target = participant('target', 10, 30);
  combat.addParticipant(caster);
  combat.addParticipant(target);
  combat.rollInitiative();

  const runtime = combat.getSpellRuntime();
  runtime.initializeSlots(caster.id, { 1: { current: 1, max: 1 } });
  runtime.learnSpell(caster.id, 'magic_missile');
  runtime.prepareSpell(caster.id, 'magic_missile');

  const beforeCombat = combat.exportState();
  const beforeEvidenceCount = repo.getHistoricalChronicleEngine(storyId).getEpistemicEvidence().length;

  const result = await canonicalCommandEngine.execute(
    repo,
    {
      commandId: 'phase6_spell_rollback_001',
      storyId,
      actorId: caster.id,
      type: 'CAST',
      payload: { spellId: 'magic_missile', targetId: target.id, slotLevel: 1 },
      source: 'PLAYER',
      transactionMode: 'STAGED',
    },
    async (_command, context) => {
      const transactionCombat = context.repository.getCombatEngine(storyId);
      const spellResult = transactionCombat.executeSpellCast({
        actorId: caster.id,
        spellId: 'magic_missile',
        targetId: target.id,
        slotLevel: 1,
      });
      assert.equal(spellResult.success, true);

      context.repository.getHistoricalChronicleEngine(storyId).recordEvidence({
        id: 'phase6_spell_rollback_evidence',
        sourceEventId: 'phase6_spell_rollback_001',
        category: 'SACRED_OR_HISTORIC',
        timestamp: context.repository.getWorldClock(storyId).getTimestamp(),
        primarySubjectId: caster.id,
        secondarySubjectId: target.id,
        locationId: 'loc_whispering_orrery',
        summary: 'This evidence must roll back.',
        details: 'This evidence must roll back.',
        provenance: 'canonical_spell_runtime',
        visibility: 'PUBLIC',
      });

      return { success: false, errorReason: 'Intentional Phase 6 rollback audit.' };
    }
  );

  assert.equal(result.success, false);
  assert.equal(result.rolledBack, true);
  assert.deepEqual(repo.getCombatEngine(storyId).exportState(), beforeCombat);
  assert.equal(
    repo.getHistoricalChronicleEngine(storyId).getEpistemicEvidence().length,
    beforeEvidenceCount
  );
});


test('Phase 6 audit: rejected cast does not create spell state for a previously unseen actor', () => {
  const runtime = new SpellRuntime();

  assert.equal(runtime.getActorState('unseen_caster'), undefined);

  const rejected = runtime.castSpellAuthoritative({
    request: {
      casterId: 'unseen_caster',
      spellId: 'magic_missile',
      targetId: 'missing_target',
      slotLevel: 1,
      requireAuthoritativeTarget: true,
    },
  });

  assert.equal(rejected.success, false);
  assert.equal(rejected.errorCode, 'TARGET_NOT_FOUND');
  assert.equal(runtime.getActorState('unseen_caster'), undefined);
});

test('Phase 6 audit: invalid spell-slot ledgers are rejected atomically', () => {
  const runtime = new SpellRuntime();
  runtime.initializeSlots('slot_auditor', { 1: { current: 1, max: 2 } });
  const before = runtime.getActorState('slot_auditor');

  assert.throws(
    () => runtime.initializeSlots('slot_auditor', { 1: { current: 3, max: 2 } }),
    /current must be between 0 and max/
  );
  assert.deepEqual(runtime.getActorState('slot_auditor'), before);

  assert.throws(
    () => runtime.initializeSlots('slot_auditor', { 0: { current: 0, max: 1 } }),
    /Expected an integer from 1 to 9/
  );
  assert.deepEqual(runtime.getActorState('slot_auditor'), before);
});

test('Phase 6 audit: concentration cleanup does not remove a pre-existing condition source', () => {
  const engine = new TacticalCombatEngine(1337);
  const caster = participant('caster', 20, 30);
  const ally = participant('ally', 10, 30);
  ally.team = 'player_allies';
  ally.x = 1;

  engine.addParticipant(caster);
  engine.addParticipant(ally);
  engine.rollInitiative();

  const runtime = engine.getSpellRuntime();

  const priorInvisible: SpellDefinition = {
    id: 'phase6_prior_invisible',
    name: 'Phase 6 Prior Invisible',
    level: 0,
    school: 'illusion',
    castingTime: 'BONUS_ACTION',
    range: 5,
    rangeType: 'TOUCH',
    targetType: 'SINGLE_ALLY',
    durationRounds: 1,
    requiresConcentration: false,
    isRitual: false,
    defenseModel: 'BUFF',
    appliedConditions: ['Invisible'],
  };
  runtime.registerSpell(priorInvisible);
  runtime.initializeSlots(caster.id, {});
  runtime.prepareSpell(caster.id, priorInvisible.id);

  const prior = engine.executeSpellCast({
    actorId: caster.id,
    spellId: priorInvisible.id,
    targetId: ally.id,
  });
  assert.equal(prior.success, true);
  assert.deepEqual(ally.conditions, ['Invisible']);

  runtime.initializeSlots(caster.id, { 2: { current: 1, max: 1 } });
  runtime.learnSpell(caster.id, 'invisibility');
  runtime.prepareSpell(caster.id, 'invisibility');

  const concentrated = engine.executeSpellCast({
    actorId: caster.id,
    spellId: 'invisibility',
    targetId: ally.id,
    slotLevel: 2,
  });
  assert.equal(concentrated.success, true);
  assert.equal(runtime.getActorState(caster.id)?.activeConcentration?.spellId, 'invisibility');

  const broken = engine.interruptConcentration(caster.id, 'Phase 6 condition ownership audit');
  assert.equal(broken.interrupted, true);
  assert.deepEqual(ally.conditions, ['Invisible']);
});

test('Phase 6 audit: canonical healing updates the damage authority before later damage', () => {
  const engine = new TacticalCombatEngine(1337);
  const caster = participant('caster', 20, 30);
  const ally = participant('ally', 10, 30);
  ally.team = 'player_allies';
  ally.x = 1;

  engine.addParticipant(caster);
  engine.addParticipant(ally);
  engine.rollInitiative();

  const wounded = engine.resolveAuthoritativeSpellDamage(ally, 15, 'force');
  assert.equal(wounded.damage, 15);
  assert.equal(ally.hpCurrent, 15);

  const runtime = engine.getSpellRuntime();
  runtime.initializeSlots(caster.id, { 1: { current: 1, max: 1 } });
  runtime.learnSpell(caster.id, 'cure_wounds');
  runtime.prepareSpell(caster.id, 'cure_wounds');

  const healed = engine.executeSpellCast({
    actorId: caster.id,
    spellId: 'cure_wounds',
    targetId: ally.id,
    slotLevel: 1,
  });
  assert.equal(healed.success, true);
  assert.ok((healed.result?.healingApplied || 0) > 0);
  const hpAfterHealing = ally.hpCurrent;
  assert.ok(hpAfterHealing > 15);

  const laterDamage = engine.resolveAuthoritativeSpellDamage(ally, 5, 'force');
  assert.equal(laterDamage.damage, 5);
  assert.equal(ally.hpCurrent, hpAfterHealing - 5);
});


test('Phase 6 audit: concentration duration decrements in authoritative state and expires at zero', () => {
  const engine = new TacticalCombatEngine(1337);
  const caster = participant('caster', 20, 30);
  const ally = participant('ally', 10, 30);
  ally.team = 'player_allies';
  ally.x = 1;

  engine.addParticipant(caster);
  engine.addParticipant(ally);
  engine.rollInitiative();

  const runtime = engine.getSpellRuntime();
  const durationSpell: SpellDefinition = {
    id: 'phase6_duration_concentration',
    name: 'Phase 6 Duration Concentration',
    level: 1,
    school: 'abjuration',
    castingTime: 'ACTION',
    range: 5,
    rangeType: 'TOUCH',
    targetType: 'SINGLE_ALLY',
    durationRounds: 1,
    requiresConcentration: true,
    isRitual: false,
    defenseModel: 'BUFF',
    appliedConditions: ['Invisible'],
    description: 'Test-only one-round concentration effect.',
  };
  runtime.registerSpell(durationSpell);
  runtime.initializeSlots(caster.id, { 1: { current: 1, max: 1 } });
  runtime.learnSpell(caster.id, durationSpell.id);
  runtime.prepareSpell(caster.id, durationSpell.id);

  const cast = engine.executeSpellCast({
    actorId: caster.id,
    spellId: durationSpell.id,
    targetId: ally.id,
    slotLevel: 1,
  });

  assert.equal(cast.success, true);
  assert.equal(runtime.getActorState(caster.id)?.activeConcentration?.remainingRounds, 1);

  engine.advanceTurn();
  assert.equal(runtime.getActorState(caster.id)?.activeConcentration?.remainingRounds, 1);

  engine.advanceTurn();
  assert.equal(runtime.getActorState(caster.id)?.activeConcentration, null);
  assert.deepEqual(ally.conditions, []);
});


test('Phase 6 audit: breaking concentration preserves independent pre-existing buff modifiers', () => {
  const engine = new TacticalCombatEngine(1337);
  const caster = participant('caster', 20, 30);
  const ally = participant('ally', 10, 30);
  ally.team = 'player_allies';
  ally.x = 1;
  ally.armorClass = 10;

  engine.addParticipant(caster);
  engine.addParticipant(ally);
  engine.rollInitiative();

  const runtime = engine.getSpellRuntime();
  const independentBuff: SpellDefinition = {
    id: 'phase6_independent_buff',
    name: 'Phase 6 Independent Buff',
    level: 0,
    school: 'abjuration',
    castingTime: 'BONUS_ACTION',
    range: 5,
    rangeType: 'TOUCH',
    targetType: 'SINGLE_ALLY',
    durationRounds: 10,
    requiresConcentration: false,
    isRitual: false,
    defenseModel: 'BUFF',
    buffEffect: { armorClassBonus: 2 },
    description: 'Test-only independent armor modifier.',
  };
  const concentrationBuff: SpellDefinition = {
    id: 'phase6_concentration_buff',
    name: 'Phase 6 Concentration Buff',
    level: 1,
    school: 'abjuration',
    castingTime: 'ACTION',
    range: 5,
    rangeType: 'TOUCH',
    targetType: 'SINGLE_ALLY',
    durationRounds: 10,
    requiresConcentration: true,
    isRitual: false,
    defenseModel: 'BUFF',
    buffEffect: { armorClassBonus: 3 },
    description: 'Test-only concentration armor modifier.',
  };
  runtime.registerSpell(independentBuff);
  runtime.registerSpell(concentrationBuff);
  runtime.initializeSlots(caster.id, { 1: { current: 1, max: 1 } });
  runtime.learnSpell(caster.id, independentBuff.id);
  runtime.learnSpell(caster.id, concentrationBuff.id);
  runtime.prepareSpell(caster.id, independentBuff.id);
  runtime.prepareSpell(caster.id, concentrationBuff.id);

  const independent = engine.executeSpellCast({
    actorId: caster.id,
    spellId: independentBuff.id,
    targetId: ally.id,
  });
  assert.equal(independent.success, true);
  assert.equal(ally.armorClass, 12);

  const concentrated = engine.executeSpellCast({
    actorId: caster.id,
    spellId: concentrationBuff.id,
    targetId: ally.id,
    slotLevel: 1,
  });
  assert.equal(concentrated.success, true);
  assert.equal(ally.armorClass, 15);

  const broken = engine.interruptConcentration(caster.id, 'Phase 6 buff ownership audit');
  assert.equal(broken.interrupted, true);
  assert.equal(ally.armorClass, 12);
});
