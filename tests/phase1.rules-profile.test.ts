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
