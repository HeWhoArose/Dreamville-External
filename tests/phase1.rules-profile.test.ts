import test from 'node:test';
import assert from 'node:assert/strict';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';
import { dndSpellRulesEvaluator } from '../server/domain/dndSpellRulesModel';

test('Phase 1: FULL_DND uses the standard D&D profile and rejects executable world overrides', () => {
	const resolved = rulesProfileEngine.resolve({
		mode: 'FULL_DND',
		rulesProfile: {
			overrides: [{
				ruleId: 'implicit_ability_checks',
				operation: 'DISABLE',
				reason: 'World text attempted to disable checks.',
			}],
		},
	});

	assert.equal(resolved.profile.mode, 'FULL_DND');
	assert.equal(resolved.profile.baseRuleset, 'DND_5E');
	assert.equal(resolved.profile.allowImplicitAbilityChecks, true);
	assert.equal(resolved.profile.allowImplicitSavingThrows, true);
	assert.equal(resolved.profile.allowStandardDndSpellRules, true);
	assert.equal(resolved.profile.overrides.length, 0);
});

test('Phase 1: HYBRID_DND keeps D&D baseline and applies explicit overrides', () => {
	const resolved = rulesProfileEngine.resolve({
		mode: 'HYBRID_DND',
		rulesProfile: {
			overrides: [{
				ruleId: 'implicit_ability_checks',
				operation: 'DISABLE',
				reason: 'This world resolves routine checks narratively.',
			}],
		},
	});

	assert.equal(resolved.profile.mode, 'HYBRID_DND');
	assert.equal(resolved.profile.baseRuleset, 'DND_5E');
	assert.equal(resolved.profile.allowImplicitAbilityChecks, false);
	assert.equal(resolved.profile.allowImplicitSavingThrows, true);
	assert.equal(resolved.profile.allowStandardDndSpellRules, true);
	assert.equal(resolved.profile.overrides.length, 1);
});

test('Phase 1: CUSTOM_HOMEBREW_DND never silently inherits D&D mechanics', () => {
	const resolved = rulesProfileEngine.resolve({
		mode: 'CUSTOM_HOMEBREW_DND',
		rulesProfile: {
			baseRuleset: 'DND_5E',
			allowImplicitAbilityChecks: false,
			allowImplicitSavingThrows: false,
			allowStandardDndSpellRules: false,
			enabledMechanics: [],
			disabledMechanics: ['implicit_ability_checks', 'implicit_saving_throws'],
		},
	});

	assert.equal(resolved.profile.mode, 'CUSTOM_HOMEBREW_DND');
	assert.equal(resolved.profile.baseRuleset, 'NONE');
	assert.equal(resolved.profile.allowImplicitAbilityChecks, false);
	assert.equal(resolved.profile.allowImplicitSavingThrows, false);
	assert.equal(resolved.profile.allowStandardDndSpellRules, false);
	assert.equal(resolved.profile.requireAuthoredChallengeForCustomChecks, true);
	assert.deepEqual(rulesProfileEngine.validate(resolved.profile), []);
});

test('Phase 1: explicit mode takes precedence over a conflicting supplied profile mode', () => {
	const resolved = rulesProfileEngine.resolve({
		mode: 'CUSTOM_HOMEBREW_DND',
		rulesProfile: {
			mode: 'FULL_DND',
		},
	});

	assert.equal(resolved.profile.mode, 'CUSTOM_HOMEBREW_DND');
	assert.ok(resolved.warnings.some((warning) => warning.includes('did not match')));
});

test('Phase 1: CUSTOM_HOMEBREW_DND does not apply D&D spell-slot legality implicitly', () => {
	const profile = rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND');
	const result = dndSpellRulesEvaluator.evaluateSpellProposal({
		proposal: { spellName: 'Homebrew Burst', spellLevel: 9 },
		characterLevel: 1,
		dndMode: 'CUSTOM_HOMEBREW_DND',
		rulesProfile: profile,
	});

	assert.equal(result.approved, false);
	assert.equal(result.requiresCustomRule, true);
	assert.equal(result.modeApplied, 'CUSTOM_HOMEBREW_DND');
	assert.equal(result.maxAvailableLevel, 0);
});

test('Phase 1: FULL_DND still applies standard spell-slot progression', () => {
	const profile = rulesProfileEngine.createDefault('FULL_DND');
	const result = dndSpellRulesEvaluator.evaluateSpellProposal({
		proposal: { spellName: 'Fireball', spellLevel: 3 },
		characterLevel: 1,
		dndMode: 'FULL_DND',
		rulesProfile: profile,
	});

	assert.equal(result.approved, false);
	assert.equal(result.modeApplied, 'FULL_DND');
	assert.equal(result.maxAvailableLevel, 1);
});

test('Phase 1: synthesized-world fields preserve the canonical mode and profile contract', () => {
	const resolved = rulesProfileEngine.resolve({
		mode: 'HYBRID_DND',
		rulesProfile: {
			overrides: [{
				ruleId: 'standard_dnd_spell_rules',
				operation: 'DISABLE',
				reason: 'This hybrid world uses custom spell legality.',
			}],
		},
	});

	assert.equal(resolved.profile.mode, 'HYBRID_DND');
	assert.equal(resolved.profile.allowStandardDndSpellRules, false);
	assert.equal(resolved.profile.overrides.length, 1);

	const spellResult = dndSpellRulesEvaluator.evaluateSpellProposal({
		proposal: { spellName: 'Hybrid Burst', spellLevel: 3 },
		characterLevel: 1,
		dndMode: 'HYBRID_DND',
		rulesProfile: resolved.profile,
	});

	assert.equal(spellResult.requiresCustomRule, true);
	assert.equal(spellResult.modeApplied, 'HYBRID_DND');
	assert.equal(spellResult.maxAvailableLevel, 0);
});

test('Phase 1: unsupported rule override operations are ignored rather than reported as executable', () => {
	const resolved = rulesProfileEngine.resolve({
		mode: 'HYBRID_DND',
		rulesProfile: {
			overrides: [{
				ruleId: 'implicit_ability_checks',
				operation: 'REPLACE' as any,
				value: { strategy: 'narrative' },
				reason: 'Unsupported operation should not silently execute.',
			}],
		},
	});

	assert.equal(resolved.profile.allowImplicitAbilityChecks, true);
	assert.equal(resolved.profile.overrides.length, 0);
});

test('Phase 1: custom homebrew does not silently inherit D&D tactical combat', () => {
	const profile = rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND');
	assert.equal(rulesProfileEngine.allowsDndTacticalCombat(profile), false);
});

test('Phase 1: FULL_DND and HYBRID_DND retain D&D tactical combat baseline', () => {
	assert.equal(
		rulesProfileEngine.allowsDndTacticalCombat(rulesProfileEngine.createDefault('FULL_DND')),
		true
	);
	assert.equal(
		rulesProfileEngine.allowsDndTacticalCombat(rulesProfileEngine.createDefault('HYBRID_DND')),
		true
	);
});

test('Phase 1: custom homebrew can explicitly enable the legacy D&D tactical mechanic', () => {
	const resolved = rulesProfileEngine.resolve({
		mode: 'CUSTOM_HOMEBREW_DND',
		rulesProfile: {
			overrides: [{
				ruleId: 'dnd_tactical_combat',
				operation: 'ENABLE',
				reason: 'This homebrew explicitly opts into the D&D tactical combat subsystem.',
			}],
		},
	});

	assert.equal(rulesProfileEngine.allowsDndTacticalCombat(resolved.profile), true);
	assert.equal(resolved.profile.overrides.length, 1);
});

test('Phase 1: mismatched persisted profile overrides cannot leak across selected rules modes', () => {
	const resolved = rulesProfileEngine.resolve({
		mode: 'CUSTOM_HOMEBREW_DND',
		rulesProfile: {
			mode: 'HYBRID_DND',
			overrides: [{
				ruleId: 'standard_dnd_spell_rules',
				operation: 'ENABLE',
				reason: 'Hybrid world override must not leak into a custom story.',
			}],
		},
	});

	assert.equal(resolved.profile.mode, 'CUSTOM_HOMEBREW_DND');
	assert.equal(resolved.profile.allowStandardDndSpellRules, false);
	assert.equal(resolved.profile.overrides.length, 0);
	assert.ok(resolved.warnings.some((warning) => warning.includes('mismatched profile overrides were ignored')));
});

test('Phase 1: explicit custom spell rules are honored when standard D&D spell rules are disabled', () => {
	const profile = rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND');
	const result = dndSpellRulesEvaluator.evaluateSpellProposal({
		proposal: { spellName: 'Custom Burst', spellLevel: 5 },
		characterLevel: 1,
		dndMode: 'CUSTOM_HOMEBREW_DND',
		rulesProfile: profile,
		customRulesOverrides: { maxAllowedSpellLevel: 5 },
	});

	assert.equal(result.approved, true);
	assert.equal(result.maxAvailableLevel, 5);
	assert.equal(result.requiresCustomRule, false);
});

test('Phase 1: unknown rule identifiers are not executable overrides', () => {
	const resolved = rulesProfileEngine.resolve({
		mode: 'HYBRID_DND',
		rulesProfile: {
			overrides: [{
				ruleId: 'invented_runtime_rule',
				operation: 'DISABLE',
				reason: 'This identifier is not implemented by the rules engine.',
			}],
		},
	});

	assert.equal(resolved.profile.overrides.length, 0);
});

test('Phase 1: HYBRID_DND supports an explicit spell parameter override', () => {
	const resolved = rulesProfileEngine.resolve({
		mode: 'HYBRID_DND',
		rulesProfile: {
			overrides: [{
				ruleId: 'standard_dnd_spell_rules',
				operation: 'SET',
				value: { maxAllowedSpellLevel: 5 },
				reason: 'This hybrid world caps spell levels at five.',
			}],
		},
	});

	assert.deepEqual(
		resolved.profile.parameterOverrides.standard_dnd_spell_rules,
		{ maxAllowedSpellLevel: 5 }
	);
	assert.equal(resolved.profile.overrides.length, 1);

	const spellResult = dndSpellRulesEvaluator.evaluateSpellProposal({
		proposal: { spellName: 'Hybrid Burst', spellLevel: 5 },
		characterLevel: 1,
		dndMode: 'HYBRID_DND',
		rulesProfile: resolved.profile,
	});

	assert.equal(spellResult.approved, true);
	assert.equal(spellResult.maxAvailableLevel, 5);
});

test('Phase 1: FULL_DND cannot execute spell parameter overrides', () => {
	const resolved = rulesProfileEngine.resolve({
		mode: 'FULL_DND',
		rulesProfile: {
			overrides: [{
				ruleId: 'standard_dnd_spell_rules',
				operation: 'SET',
				value: { maxAllowedSpellLevel: 9 },
				reason: 'This must not alter Full D&D.',
			}],
		},
	});

	assert.equal(resolved.profile.overrides.length, 0);
	assert.deepEqual(resolved.profile.parameterOverrides, {});
});

test('Phase 1: FULL_DND ignores client-style custom spell caps', () => {
	const profile = rulesProfileEngine.createDefault('FULL_DND');
	const result = dndSpellRulesEvaluator.evaluateSpellProposal({
		proposal: { spellName: 'Fireball', spellLevel: 9 },
		characterLevel: 1,
		dndMode: 'FULL_DND',
		rulesProfile: profile,
		customRulesOverrides: { maxAllowedSpellLevel: 9 },
	});

	assert.equal(result.approved, false);
	assert.equal(result.maxAvailableLevel, 1);
	assert.equal(result.modeApplied, 'FULL_DND');
});
