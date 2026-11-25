import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';
import {
  RULES_CATALOGUE,
  RULE_GROUPS,
  isRuleEnabled,
  isRuleLocked,
  listRulesInGroup,
  sanitizeRuleToggles,
} from '../src/data/rulesCatalogue';

test('the catalogue has unique ids, known groups, and valid parents', () => {
  const ids = new Set<string>();
  const groups = new Set(RULE_GROUPS.map((group) => group.id));
  for (const entry of RULES_CATALOGUE) {
    assert.ok(!ids.has(entry.id), `duplicate id ${entry.id}`);
    ids.add(entry.id);
    assert.ok(groups.has(entry.group), `${entry.id} has an unknown group`);
    assert.ok(entry.label && entry.description, `${entry.id} needs text`);
    assert.ok(entry.id.startsWith(`${entry.group.toLowerCase()}.`), `${entry.id} must be prefixed by its group`);
  }
  for (const entry of RULES_CATALOGUE) {
    if (entry.requires) {
      assert.ok(ids.has(entry.requires), `${entry.id} requires unknown ${entry.requires}`);
      assert.notEqual(entry.requires, entry.id);
    }
  }
});

test('conditions, equipment, exploration and core are locked; combat, casting, rest and class are not', () => {
  for (const group of ['CORE', 'CONDITIONS', 'EQUIPMENT', 'EXPLORATION'] as const) {
    assert.ok(RULE_GROUPS.find((entry) => entry.id === group)?.locked, group);
    assert.ok(listRulesInGroup(group).length > 0, `${group} has rules`);
  }
  for (const group of ['COMBAT', 'CASTING', 'REST', 'CLASS'] as const) {
    assert.equal(RULE_GROUPS.find((entry) => entry.id === group)?.locked, false, group);
    assert.ok(listRulesInGroup(group).length > 0, `${group} has rules`);
  }
  assert.equal(isRuleLocked('core.dice'), true);
  assert.equal(isRuleLocked('casting.spell_slots'), false);
});

test('Full D&D keeps every standard rule on and ignores switches', () => {
  const profile = rulesProfileEngine.resolve({
    mode: 'FULL_DND',
    rulesProfile: { mode: 'FULL_DND', ruleToggles: { 'casting.spell_slots': false } } as any,
  }).profile;
  assert.deepEqual(profile.ruleToggles, {});
  for (const entry of RULES_CATALOGUE) {
    assert.equal(rulesProfileEngine.isRuleEnabled(profile, entry.id), entry.defaultOn !== false, entry.id);
  }
  assert.equal(rulesProfileEngine.isRuleEnabled(profile, 'combat.flanking'), false, 'optional variants stay off in Full D&D');
});

test('Hybrid: locked groups stay on, other rules default on and can be switched off', () => {
  const resolution = rulesProfileEngine.resolve({
    mode: 'HYBRID_DND',
    rulesProfile: { mode: 'HYBRID_DND', ruleToggles: { 'casting.spell_slots': false, 'core.dice': false, 'conditions.exhaustion': false } } as any,
  });
  const profile = resolution.profile;
  assert.equal(rulesProfileEngine.isRuleEnabled(profile, 'casting.spell_slots'), false, 'spell slots switched off');
  assert.equal(rulesProfileEngine.isRuleEnabled(profile, 'core.dice'), true, 'dice are locked on');
  assert.equal(rulesProfileEngine.isRuleEnabled(profile, 'conditions.exhaustion'), true, 'conditions are locked on');
  assert.equal(rulesProfileEngine.isRuleEnabled(profile, 'combat.cover'), true, 'unlisted rules default on');
  assert.equal(profile.ruleToggles?.['core.dice'], undefined, 'locked switches are dropped');
  assert.ok(resolution.warnings.some((warning) => /ignored/i.test(warning)));
});

test('a rule is off when its parent is off', () => {
  const profile = rulesProfileEngine.resolve({
    mode: 'HYBRID_DND',
    rulesProfile: { mode: 'HYBRID_DND', ruleToggles: { 'casting.spell_slots': false } } as any,
  }).profile;
  assert.equal(rulesProfileEngine.isRuleEnabled(profile, 'casting.upcasting'), false, 'upcasting needs slots');
  assert.equal(rulesProfileEngine.isRuleEnabled(profile, 'class.divine_smite'), false, 'smite spends a slot');
  assert.equal(rulesProfileEngine.isRuleEnabled(profile, 'casting.concentration'), true, 'concentration does not need slots');
});

test('Hybrid: switching off a rule that drives a legacy mechanic disables that mechanic', () => {
  const profile = rulesProfileEngine.resolve({
    mode: 'HYBRID_DND',
    rulesProfile: { mode: 'HYBRID_DND', ruleToggles: { 'casting.dnd_spell_rules': false, 'rest.recovery': false, 'combat.tactical_combat': false } } as any,
  }).profile;
  assert.equal(rulesProfileEngine.allowsStandardDndSpellRules(profile), false);
  assert.equal(rulesProfileEngine.allowsStandardRestRules(profile), false);
  assert.equal(rulesProfileEngine.allowsDndTacticalCombat(profile), false);
  assert.equal(rulesProfileEngine.allowsImplicitAbilityChecks(profile), true, 'the locked d20 rule stays on');
});

test('Hybrid with no switches behaves exactly like before', () => {
  const profile = rulesProfileEngine.resolve({ mode: 'HYBRID_DND' }).profile;
  assert.equal(rulesProfileEngine.allowsStandardDndSpellRules(profile), true);
  assert.equal(rulesProfileEngine.allowsStandardRestRules(profile), true);
  assert.equal(rulesProfileEngine.allowsDndTacticalCombat(profile), true);
});

test('Custom Homebrew: every rule is off unless switched on', () => {
  const profile = rulesProfileEngine.resolve({
    mode: 'CUSTOM_HOMEBREW_DND',
    rulesProfile: { mode: 'CUSTOM_HOMEBREW_DND', ruleToggles: { 'casting.spell_slots': true } } as any,
  }).profile;
  assert.equal(rulesProfileEngine.isRuleEnabled(profile, 'core.dice'), false);
  assert.equal(rulesProfileEngine.isRuleEnabled(profile, 'combat.cover'), false);
  assert.equal(rulesProfileEngine.isRuleEnabled(profile, 'casting.spell_slots'), false, 'ticked, but its parent (spell rules) is not');
  assert.equal(rulesProfileEngine.allowsStandardDndSpellRules(profile), false, 'Custom still cannot inherit D&D spell rules silently');
  assert.equal(profile.baseRuleset, 'NONE');
  const both = rulesProfileEngine.resolve({
    mode: 'CUSTOM_HOMEBREW_DND',
    rulesProfile: { mode: 'CUSTOM_HOMEBREW_DND', ruleToggles: { 'casting.dnd_spell_rules': true, 'casting.spell_slots': true } } as any,
  }).profile;
  assert.equal(rulesProfileEngine.isRuleEnabled(both, 'casting.spell_slots'), true);
  assert.equal(both.baseRuleset, 'NONE', 'ticking rules is an explicit choice; the base ruleset stays NONE');
});

test('switches from a profile saved under another mode are ignored', () => {
  const resolution = rulesProfileEngine.resolve({
    mode: 'HYBRID_DND',
    rulesProfile: { mode: 'CUSTOM_HOMEBREW_DND', ruleToggles: { 'casting.spell_slots': false } } as any,
  });
  assert.equal(rulesProfileEngine.isRuleEnabled(resolution.profile, 'casting.spell_slots'), true);
});

test('sanitizeRuleToggles keeps only known boolean switches', () => {
  assert.deepEqual(
    sanitizeRuleToggles({ 'combat.cover': false, 'combat.nope': true, 'casting.spell_slots': 'no', 'core.dice': false }, 'HYBRID_DND'),
    { 'combat.cover': false },
  );
  assert.deepEqual(sanitizeRuleToggles({ 'core.dice': true }, 'CUSTOM_HOMEBREW_DND'), { 'core.dice': true });
  assert.deepEqual(sanitizeRuleToggles(['x'], 'HYBRID_DND'), {});
  assert.deepEqual(sanitizeRuleToggles(null, 'HYBRID_DND'), {});
});

test('an id outside the catalogue is on except under Custom Homebrew', () => {
  assert.equal(isRuleEnabled('HYBRID_DND', {}, 'mystery.rule'), true);
  assert.equal(isRuleEnabled('CUSTOM_HOMEBREW_DND', {}, 'mystery.rule'), false);
});

test('a profile with switches passes validation and survives a resolve round trip', () => {
  const first = rulesProfileEngine.resolve({
    mode: 'HYBRID_DND',
    rulesProfile: { mode: 'HYBRID_DND', ruleToggles: { 'rest.slot_recovery': false } } as any,
  }).profile;
  assert.deepEqual(rulesProfileEngine.validate(first), []);
  const second = rulesProfileEngine.resolve({ mode: 'HYBRID_DND', rulesProfile: first }).profile;
  assert.equal(rulesProfileEngine.isRuleEnabled(second, 'rest.slot_recovery'), false);
});
