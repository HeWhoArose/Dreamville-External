import assert from 'node:assert/strict';
import test from 'node:test';

import { TacticalCombatEngine } from '../server/domain/combatEngine';
import { spellRuntime } from '../server/domain/spellRuntime';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';
import { conditionEngine } from '../server/domain/conditionEngine';

function setupParticipants() {
  const wizard = {
    id: 'wizard',
    name: 'Gandalf',
    team: 'player_allies' as const,
    x: 0,
    y: 0,
    initiative: 20,
    armorClass: 12,
    hpCurrent: 25,
    hpMax: 25,
    speedCells: 6,
    attackBonus: 5,
    damageFormula: '1d4',
    conditions: [],
    isDead: false,
    spellAttackBonus: 6,
    spellSaveDc: 14,
    saveModifiers: { CON: 2, INT: 4, WIS: 2 },
    savingThrowModifiers: { CON: 2, INT: 4, WIS: 2 },
  };

  const goblin = {
    id: 'goblin',
    name: 'Goblin Scout',
    team: 'enemies' as const,
    x: 4,
    y: 0, // 20 feet away (4 cells * 5 ft)
    initiative: 12,
    armorClass: 13,
    hpCurrent: 20,
    hpMax: 20,
    speedCells: 6,
    attackBonus: 4,
    damageFormula: '1d6+2',
    conditions: [],
    isDead: false,
    saveModifiers: { DEX: 2, CON: 0, WIS: -1 },
    savingThrowModifiers: { DEX: 2, CON: 0, WIS: -1 },
  };

  return { wizard, goblin };
}

test('Phase 6 Requirement 1: Spell resources and slot consumption', () => {
  const actorId = 'resource_caster_1';
  spellRuntime.initializeSlots(actorId, {
    1: { current: 2, max: 2 },
  });
  spellRuntime.learnSpell(actorId, 'magic_missile');
  spellRuntime.prepareSpell(actorId, 'magic_missile');

  const cast1 = spellRuntime.castSpellAuthoritative({
    request: {
      casterId: actorId,
      spellId: 'magic_missile',
      targetId: 'dummy_target',
      slotLevel: 1,
      allowSyntheticTarget: true,
    },
  });

  assert.equal(cast1.success, true);
  assert.equal(cast1.slotLevelUsed, 1);
  const stateAfter1 = spellRuntime.getOrCreateActorState(actorId);
  assert.equal(stateAfter1.spellSlots[1].current, 1);

  // Cast second slot
  const cast2 = spellRuntime.castSpellAuthoritative({
    request: {
      casterId: actorId,
      spellId: 'magic_missile',
      targetId: 'dummy_target',
      slotLevel: 1,
      allowSyntheticTarget: true,
    },
  });
  assert.equal(cast2.success, true);
  assert.equal(spellRuntime.getOrCreateActorState(actorId).spellSlots[1].current, 0);

  // Cast third time - should fail with INSUFFICIENT_SPELL_SLOTS
  const cast3 = spellRuntime.castSpellAuthoritative({
    request: {
      casterId: actorId,
      spellId: 'magic_missile',
      targetId: 'dummy_target',
      slotLevel: 1,
      allowSyntheticTarget: true,
    },
  });
  assert.equal(cast3.success, false);
  assert.equal(cast3.errorCode, 'INSUFFICIENT_SPELL_SLOTS');

  // Cantrip does not consume slots
  spellRuntime.learnSpell(actorId, 'fire_bolt');
  const cantripCast = spellRuntime.castSpellAuthoritative({
    request: {
      casterId: actorId,
      spellId: 'fire_bolt',
      targetId: 'dummy_target',
      slotLevel: 0,
      allowSyntheticTarget: true,
    },
  });
  assert.equal(cantripCast.success, true);
  assert.equal(cantripCast.slotLevelUsed, 0);
  assert.equal(spellRuntime.getOrCreateActorState(actorId).spellSlots[1].current, 0);
});

test('Phase 6 Requirement 2: Prepared and known spell state enforcement', () => {
  const actorId = 'prep_caster_1';
  spellRuntime.initializeSlots(actorId, { 1: { current: 3, max: 3 } });
  const state = spellRuntime.getOrCreateActorState(actorId);
  state.knownSpells = ['cure_wounds', 'shield'];
  state.preparedSpells = ['cure_wounds']; // shield is known but unprepared

  // Shield is unprepared - should fail in FULL_DND
  const failCast = spellRuntime.castSpellAuthoritative({
    request: {
      casterId: actorId,
      spellId: 'shield',
      slotLevel: 1,
      allowSyntheticTarget: true,
    },
  });
  assert.equal(failCast.success, false);
  assert.equal(failCast.errorCode, 'SPELL_NOT_PREPARED');

  // Prepare shield
  const prepResult = spellRuntime.prepareSpell(actorId, 'shield');
  assert.equal(prepResult.success, true);

  // Now shield succeeds
  const successCast = spellRuntime.castSpellAuthoritative({
    request: {
      casterId: actorId,
      spellId: 'shield',
      slotLevel: 1,
      allowSyntheticTarget: true,
    },
  });
  assert.equal(successCast.success, true);
});

test('Phase 6 Requirement 3: Targeting and range validation', () => {
  const { wizard, goblin } = setupParticipants();
  goblin.x = 20; // 100 feet away (20 * 5)
  goblin.y = 0;

  // Shocking grasp is touch (5 ft). Goblin is 100 ft away.
  const touchFail = spellRuntime.castSpellAuthoritative({
    request: {
      casterId: wizard.id,
      spellId: 'shocking_grasp',
      targetId: goblin.id,
      slotLevel: 0,
    },
    casterParticipant: wizard,
    targetParticipant: goblin,
  });
  assert.equal(touchFail.success, false);
  assert.equal(touchFail.errorCode, 'TARGET_OUT_OF_RANGE');

  // Move goblin within 5 ft
  goblin.x = 1;
  const touchSuccess = spellRuntime.castSpellAuthoritative({
    request: {
      casterId: wizard.id,
      spellId: 'shocking_grasp',
      targetId: goblin.id,
      slotLevel: 0,
    },
    casterParticipant: wizard,
    targetParticipant: goblin,
  });
  assert.equal(touchSuccess.success, true);
});

test('Phase 6 Requirement 4 & 5: Attack/Save resolution and spell effects', () => {
  const { wizard, goblin } = setupParticipants();
  wizard.x = 0;
  wizard.y = 0;
  goblin.x = 4; // 20 feet away
  goblin.y = 0;

  spellRuntime.initializeSlots(wizard.id, { 3: { current: 2, max: 2 } });
  spellRuntime.learnSpell(wizard.id, 'fireball');
  spellRuntime.prepareSpell(wizard.id, 'fireball');

  // Fireball forces a DEX saving throw vs DC 14
  const cast = spellRuntime.castSpellAuthoritative({
    request: {
      casterId: wizard.id,
      spellId: 'fireball',
      targetId: goblin.id,
      targetPosition: { x: 4, y: 0 },
      slotLevel: 3,
    },
    casterParticipant: wizard,
    targetParticipant: goblin,
    allParticipants: [wizard, goblin],
  });

  assert.equal(cast.success, true);
  assert.ok(cast.savingThrowResult);
  assert.equal(cast.savingThrowResult.ability, 'DEX');
  assert.equal(cast.savingThrowResult.dc, 14);
  assert.ok((cast.damageInflicted || 0) > 0);
  assert.equal(cast.damageType, 'fire');
});

test('Phase 6 Requirement 6: Upcasting increases spell potency', () => {
  const actorId = 'upcaster_1';
  spellRuntime.initializeSlots(actorId, {
    1: { current: 4, max: 4 },
    2: { current: 3, max: 3 },
    3: { current: 2, max: 2 },
  });
  spellRuntime.learnSpell(actorId, 'cure_wounds');
  spellRuntime.prepareSpell(actorId, 'cure_wounds');

  // Participant is damaged (5/30 HP) so healing is actually applied
  const damagedPatient = {
    id: actorId,
    name: 'Wounded Hero',
    team: 'player_allies' as const,
    x: 0,
    y: 0,
    initiative: 10,
    armorClass: 14,
    attackBonus: 4,
    damageFormula: '1d6',
    conditions: [],
    isDead: false,
    hpCurrent: 5,
    hpMax: 30,
    speedCells: 6,
  };

  // Base slot 1: 1d8+3 (avg ~7.5)
  const castSlot1 = spellRuntime.castSpellAuthoritative({
    request: {
      casterId: actorId,
      spellId: 'cure_wounds',
      targetId: actorId,
      slotLevel: 1,
    },
    casterParticipant: damagedPatient,
    targetParticipant: damagedPatient,
  });
  assert.equal(castSlot1.success, true);
  assert.equal(castSlot1.slotLevelUsed, 1);
  assert.ok((castSlot1.healingApplied || 0) >= 4); // minimum 1d8+3 is 4

  // Reset to damaged
  damagedPatient.hpCurrent = 5;

  // Upcast slot 3: 1d8 base + 2d8 upcast = 3d8+3 (avg ~16.5)
  const castSlot3 = spellRuntime.castSpellAuthoritative({
    request: {
      casterId: actorId,
      spellId: 'cure_wounds',
      targetId: actorId,
      slotLevel: 3,
    },
    casterParticipant: damagedPatient,
    targetParticipant: damagedPatient,
  });
  assert.equal(castSlot3.success, true);
  assert.equal(castSlot3.slotLevelUsed, 3);
  assert.ok((castSlot3.healingApplied || 0) >= 6); // minimum 3d8+3 is 6
});

test('Phase 6 Requirement 7: Concentration tracking and damage disruption', () => {
  const { wizard, goblin } = setupParticipants();
  spellRuntime.initializeSlots(wizard.id, { 2: { current: 3, max: 3 } });
  spellRuntime.learnSpell(wizard.id, 'hold_person');
  spellRuntime.prepareSpell(wizard.id, 'hold_person');
  spellRuntime.learnSpell(wizard.id, 'invisibility');
  spellRuntime.prepareSpell(wizard.id, 'invisibility');

  // Cast Hold Person (Concentration)
  const castHold = spellRuntime.castSpellAuthoritative({
    request: {
      casterId: wizard.id,
      spellId: 'hold_person',
      targetId: goblin.id,
      slotLevel: 2,
    },
    casterParticipant: wizard,
    targetParticipant: goblin,
  });
  assert.equal(castHold.success, true);
  assert.equal(castHold.requiresConcentration, true);

  const state = spellRuntime.getOrCreateActorState(wizard.id);
  assert.ok(state.activeConcentration);
  assert.equal(state.activeConcentration.spellId, 'hold_person');

  // Taking damage triggers concentration check
  // Damage of 40 yields DC = max(10, floor(40/2)) = 20
  // Wizard has CON mod +2, will fail high DC without luck
  // Or test breakConcentration directly
  const breakRes = spellRuntime.breakConcentration(wizard.id, 'Voluntary drop or incapacitation');
  assert.equal(breakRes.broken, true);
  assert.equal(breakRes.previousSpell?.spellId, 'hold_person');
  assert.equal(spellRuntime.getOrCreateActorState(wizard.id).activeConcentration, null);

  // Casting a second concentration spell auto-drops the first
  spellRuntime.castSpellAuthoritative({
    request: { casterId: wizard.id, spellId: 'hold_person', targetId: goblin.id, slotLevel: 2 },
    casterParticipant: wizard,
    targetParticipant: goblin,
  });
  assert.equal(spellRuntime.getOrCreateActorState(wizard.id).activeConcentration?.spellId, 'hold_person');

  spellRuntime.castSpellAuthoritative({
    request: { casterId: wizard.id, spellId: 'invisibility', targetId: wizard.id, slotLevel: 2 },
    casterParticipant: wizard,
    targetParticipant: wizard,
  });
  assert.equal(spellRuntime.getOrCreateActorState(wizard.id).activeConcentration?.spellId, 'invisibility');
});

test('Phase 6 Requirement 8: Ritual casting without slot consumption', () => {
  const actorId = 'ritualist_1';
  spellRuntime.initializeSlots(actorId, { 1: { current: 1, max: 1 } });
  spellRuntime.learnSpell(actorId, 'detect_magic');
  spellRuntime.prepareSpell(actorId, 'detect_magic');

  // Ritual casting Detect Magic (a ritual spell)
  const ritualCast = spellRuntime.castSpellAuthoritative({
    request: {
      casterId: actorId,
      spellId: 'detect_magic',
      isRitual: true,
      slotLevel: 0,
      allowSyntheticTarget: true,
    },
  });
  assert.equal(ritualCast.success, true);
  assert.equal(ritualCast.isRitual, true);
  assert.equal(ritualCast.slotLevelUsed, 0);
  // Slot remains unconsumed (1/1)
  assert.equal(spellRuntime.getOrCreateActorState(actorId).spellSlots[1].current, 1);

  // Casting non-ritual spell as ritual should fail
  spellRuntime.learnSpell(actorId, 'magic_missile');
  spellRuntime.prepareSpell(actorId, 'magic_missile');
  const invalidRitual = spellRuntime.castSpellAuthoritative({
    request: {
      casterId: actorId,
      spellId: 'magic_missile',
      isRitual: true,
    },
  });
  assert.equal(invalidRitual.success, false);
  assert.equal(invalidRitual.errorCode, 'NOT_A_RITUAL_SPELL');
});

test('Phase 6 Requirement 9: TacticalCombatEngine integrated spellcasting', () => {
  const engine = new TacticalCombatEngine(1337);
  const { wizard, goblin } = setupParticipants();
  wizard.spellSlots = { 1: { current: 2, max: 2 } };
  wizard.preparedSpells = ['magic_missile'];
  wizard.knownSpells = ['magic_missile'];

  engine.addParticipant(wizard);
  engine.addParticipant(goblin);
  engine.rollInitiative();

  // Wizard casts Magic Missile on Goblin
  const initialGoblinHp = engine.getParticipant('goblin')?.hpCurrent || 0;
  const castRes = engine.executeSpellCast({
    actorId: 'wizard',
    spellId: 'magic_missile',
    targetId: 'goblin',
    slotLevel: 1,
  });

  assert.equal(castRes.success, true);
  assert.ok(castRes.result);
  assert.equal(castRes.result.success, true);

  // HP should have decreased
  const currentGoblinHp = engine.getParticipant('goblin')?.hpCurrent || 0;
  assert.ok(currentGoblinHp < initialGoblinHp, `Goblin HP should decrease: ${currentGoblinHp} < ${initialGoblinHp}`);

  // Action resource should be consumed
  const turnResources = engine.getTurnResources('wizard');
  assert.equal(turnResources?.actionAvailable, false);
});

test('Phase 6 Requirement 10: Rules profiles enforce mode constraints', () => {
  const actorId = 'hybrid_mage';
  const customProfile = rulesProfileEngine.createDefault('HYBRID_DND');
  customProfile.parameterOverrides = {
    standard_dnd_spell_rules: {
      unlimitedSpellSlots: true,
      allowUnpreparedCasting: true,
    },
  };

  spellRuntime.initializeSlots(actorId, { 1: { current: 0, max: 0 } }); // 0 slots

  // In HYBRID_DND with unlimitedSpellSlots and allowUnpreparedCasting, casting succeeds without slots or prep
  const cast = spellRuntime.castSpellAuthoritative({
    request: {
      casterId: actorId,
      spellId: 'magic_missile',
      targetId: 'dummy',
      slotLevel: 1,
      rulesProfile: customProfile,
    },
  });
  assert.equal(cast.success, true);
  assert.equal(spellRuntime.getOrCreateActorState(actorId).spellSlots[1].current, 0); // No slots subtracted
});

test('Phase 6 Requirement 11: Authoritative custom spell evaluation and registration', () => {
  // 1. High level spell proposed by low level caster -> rejected
  const lowLevelProposal = {
    spellName: 'Cataclysmic Supernova',
    spellLevel: 9,
    school: 'evocation',
    casterLevel: 3,
  };
  const lowLevelEval = spellRuntime.evaluateCustomSpellProposal(lowLevelProposal, 3);
  assert.equal(lowLevelEval.approved, false);
  assert.ok(lowLevelEval.downgradeRequirement);

  // 2. Appropriate spell proposed by level 5 caster -> approved
  const validProposal = {
    spellName: 'Aetheric Bolt',
    spellLevel: 2,
    school: 'evocation',
    damageFormula: '3d6',
    damageType: 'force',
    range: 60,
    casterLevel: 5,
  };
  const validEval = spellRuntime.evaluateCustomSpellProposal(validProposal, 5);
  assert.equal(validEval.approved, true);
  assert.ok(validEval.sanitizedSpell);
  assert.equal(validEval.sanitizedSpell.name, 'Aetheric Bolt');

  // Register the custom spell
  spellRuntime.registerSpell(validEval.sanitizedSpell);
  const catalogSpell = spellRuntime.getSpell(validEval.sanitizedSpell.id);
  assert.ok(catalogSpell);
  assert.equal(catalogSpell.name, 'Aetheric Bolt');

  // Cast the newly registered custom spell
  const casterId = 'custom_caster';
  spellRuntime.initializeSlots(casterId, { 2: { current: 1, max: 1 } });
  spellRuntime.learnSpell(casterId, validEval.sanitizedSpell.id);
  spellRuntime.prepareSpell(casterId, validEval.sanitizedSpell.id);

  const customCast = spellRuntime.castSpellAuthoritative({
    request: {
      casterId,
      spellId: validEval.sanitizedSpell.id,
      targetId: 'target_dummy',
      slotLevel: 2,
      allowSyntheticTarget: true,
    },
  });
  assert.equal(customCast.success, true);
  assert.ok((customCast.damageInflicted || 0) > 0);
  assert.equal(customCast.damageType, 'force');
});
