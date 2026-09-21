import type {
	DndRulesMode,
	RuleOverride,
	RuleProfileResolution,
	RulesProfile,
} from '../../src/types';

const IMPLICIT_ABILITY_CHECKS = 'implicit_ability_checks';
const IMPLICIT_SAVING_THROWS = 'implicit_saving_throws';
const STANDARD_DND_SPELL_RULES = 'standard_dnd_spell_rules';
const DND_TACTICAL_COMBAT = 'dnd_tactical_combat';
const REST_RECOVERY_RULES = 'rest_recovery_rules';
const KNOWN_MECHANICS = new Set([
	IMPLICIT_ABILITY_CHECKS,
	IMPLICIT_SAVING_THROWS,
	STANDARD_DND_SPELL_RULES,
	DND_TACTICAL_COMBAT,
	REST_RECOVERY_RULES,
]);

export interface RulesProfileSource {
	mode?: DndRulesMode | string;
	rulesProfile?: Partial<RulesProfile>;
	worldRules?: any[];
	ruleConstraints?: string[];
	canonicalCapabilities?: any[];
}

function normalizeMode(value: unknown): DndRulesMode {
	if (value === 'HYBRID_DND' || value === 'CUSTOM_HOMEBREW_DND' || value === 'FULL_DND') {
		return value;
	}
	return 'FULL_DND';
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value));
}

function baseProfile(mode: DndRulesMode): RulesProfile {
	if (mode === 'CUSTOM_HOMEBREW_DND') {
		return {
			profileId: 'rules-profile-custom-homebrew-v1',
			version: 1,
			mode,
			policy: 'CUSTOM_EXPLICIT_RULES',
			baseRuleset: 'NONE',
			allowImplicitAbilityChecks: false,
			allowImplicitSavingThrows: false,
			allowStandardDndSpellRules: false,
			requireAuthoredChallengeForCustomChecks: true,
			allowWorldRuleOverrides: true,
			allowCapabilityOverrides: true,
			enabledMechanics: [],
			disabledMechanics: [
				IMPLICIT_ABILITY_CHECKS,
				IMPLICIT_SAVING_THROWS,
				STANDARD_DND_SPELL_RULES,
				DND_TACTICAL_COMBAT,
				REST_RECOVERY_RULES,
			],
			parameterOverrides: {},
			overrides: [],
		};
	}

	if (mode === 'HYBRID_DND') {
		return {
			profileId: 'rules-profile-hybrid-v1',
			version: 1,
			mode,
			policy: 'DND_WITH_EXPLICIT_OVERRIDES',
			baseRuleset: 'DND_5E',
			allowImplicitAbilityChecks: true,
			allowImplicitSavingThrows: true,
			allowStandardDndSpellRules: true,
			requireAuthoredChallengeForCustomChecks: false,
			allowWorldRuleOverrides: true,
			allowCapabilityOverrides: true,
			enabledMechanics: [
				IMPLICIT_ABILITY_CHECKS,
				IMPLICIT_SAVING_THROWS,
				STANDARD_DND_SPELL_RULES,
				DND_TACTICAL_COMBAT,
				REST_RECOVERY_RULES,
			],
			disabledMechanics: [],
			parameterOverrides: {},
			overrides: [],
		};
	}

	return {
		profileId: 'rules-profile-full-dnd-v1',
		version: 1,
		mode: 'FULL_DND',
		policy: 'DND_STANDARD',
		baseRuleset: 'DND_5E',
		allowImplicitAbilityChecks: true,
		allowImplicitSavingThrows: true,
		allowStandardDndSpellRules: true,
		requireAuthoredChallengeForCustomChecks: false,
		allowWorldRuleOverrides: false,
		allowCapabilityOverrides: true,
		enabledMechanics: [
			IMPLICIT_ABILITY_CHECKS,
			IMPLICIT_SAVING_THROWS,
			STANDARD_DND_SPELL_RULES,
			DND_TACTICAL_COMBAT,
			REST_RECOVERY_RULES,
		],
		disabledMechanics: [],
		parameterOverrides: {},
		overrides: [],
	};
}

function applyOverrides(profile: RulesProfile, rawOverrides: unknown): RulesProfile {
	const overrides = Array.isArray(rawOverrides) ? rawOverrides : [];
	const next = clone(profile);
	next.overrides = [];
	next.parameterOverrides = { ...(next.parameterOverrides || {}) };

	for (const raw of overrides) {
		if (!raw || typeof raw !== 'object') continue;
		const override = raw as RuleOverride;
		if (!override.ruleId || !override.operation || !override.reason) continue;
		if (override.operation !== 'ENABLE' && override.operation !== 'DISABLE' && override.operation !== 'SET') continue;
		if (!KNOWN_MECHANICS.has(override.ruleId)) continue;
		if (!next.allowWorldRuleOverrides && next.mode === 'FULL_DND') continue;

		if (override.operation === 'SET') {
			if (!override.value || typeof override.value !== 'object') continue;

			if (override.ruleId === STANDARD_DND_SPELL_RULES) {
				const value = override.value as { maxAllowedSpellLevel?: unknown };
				const rawMax = Number(value.maxAllowedSpellLevel);
				if (!Number.isFinite(rawMax) || rawMax < 0 || rawMax > 9) continue;

				next.parameterOverrides[STANDARD_DND_SPELL_RULES] = {
					maxAllowedSpellLevel: Math.floor(rawMax),
				};
				next.overrides.push(override);
				continue;
			}

			if (override.ruleId === REST_RECOVERY_RULES) {
				const value = override.value as Record<string, unknown>;
				const normalized: Record<string, number | boolean | string> = {};
				const numericBounds: Record<string, { min: number; max?: number }> = {
					shortRestSeconds: { min: 1 },
					longRestSeconds: { min: 1 },
					longRestHitDiceRecoveryFraction: { min: 0, max: 1 },
					longRestExhaustionRecovery: { min: 0, max: 6 },
					shortRestFatigueRecovery: { min: 0, max: 100 },
					shortRestStressRecovery: { min: 0, max: 100 },
					longRestFatigueRecovery: { min: 0, max: 100 },
					longRestStressRecovery: { min: 0, max: 100 },
					shortRestPhysicalStrainRecoveryFraction: { min: 0, max: 1 },
					longRestPhysicalStrainRecoveryFraction: { min: 0, max: 1 },
					shortRestMagicalEnergyRecoveryFraction: { min: 0, max: 1 },
					longRestMagicalEnergyRecoveryFraction: { min: 0, max: 1 },
				};
				let invalidNumericOverride = false;
				for (const [key, bounds] of Object.entries(numericBounds)) {
					if (value[key] === undefined) continue;
					if (
						typeof value[key] !== 'number' ||
						!Number.isFinite(value[key]) ||
						value[key] < bounds.min ||
						(bounds.max !== undefined && value[key] > bounds.max)
					) {
						invalidNumericOverride = true;
						break;
					}
					normalized[key] = value[key] as number;
				}
				if (invalidNumericOverride) continue;

				const booleanKeys = [
					'longRestRestoreHp',
					'longRestRestoreSpellSlots',
					'longRestBreakConcentration',
					'allowRestWhileTraveling',
					'allowRestInCombat',
					'clearConditionsOnLongRest',
				];
				for (const key of booleanKeys) {
					if (value[key] === undefined) continue;
					if (typeof value[key] !== 'boolean') continue;
					normalized[key] = value[key] as boolean;
				}

				if (value.shortRestRecoveryModel !== undefined) {
					if (value.shortRestRecoveryModel !== 'HIT_DICE' && value.shortRestRecoveryModel !== 'NONE') continue;
					normalized.shortRestRecoveryModel = value.shortRestRecoveryModel as string;
				}

				if (value.conditionIdsToClearOnLongRest !== undefined) {
					if (
						!Array.isArray(value.conditionIdsToClearOnLongRest) ||
						!value.conditionIdsToClearOnLongRest.every((item) => typeof item === 'string' && item.trim())
					) {
						continue;
					}
					normalized.conditionIdsToClearOnLongRest =
						(value.conditionIdsToClearOnLongRest as string[]).map((item) => item.trim()).join('|');
				}

				if (Object.keys(normalized).length === 0) continue;
				next.parameterOverrides[REST_RECOVERY_RULES] = normalized;
				next.overrides.push(override);
				continue;
			}

			continue;
		}

		next.overrides.push(override);

		if (override.operation === 'DISABLE') {
			if (!next.disabledMechanics.includes(override.ruleId)) {
				next.disabledMechanics.push(override.ruleId);
			}
			next.enabledMechanics = next.enabledMechanics.filter((id) => id !== override.ruleId);
		} else if (override.operation === 'ENABLE') {
			if (!next.enabledMechanics.includes(override.ruleId)) {
				next.enabledMechanics.push(override.ruleId);
			}
			next.disabledMechanics = next.disabledMechanics.filter((id) => id !== override.ruleId);
		}
	}

	next.allowImplicitAbilityChecks = next.enabledMechanics.includes(IMPLICIT_ABILITY_CHECKS)
		&& !next.disabledMechanics.includes(IMPLICIT_ABILITY_CHECKS);
	next.allowImplicitSavingThrows = next.enabledMechanics.includes(IMPLICIT_SAVING_THROWS)
		&& !next.disabledMechanics.includes(IMPLICIT_SAVING_THROWS);
	next.allowStandardDndSpellRules = next.enabledMechanics.includes(STANDARD_DND_SPELL_RULES)
		&& !next.disabledMechanics.includes(STANDARD_DND_SPELL_RULES);

	return next;
}

export class RulesProfileEngine {
	public createDefault(mode: DndRulesMode = 'FULL_DND'): RulesProfile {
		return baseProfile(mode);
	}

	public resolve(source: RulesProfileSource): RuleProfileResolution {
		const warnings: string[] = [];
		const mode = normalizeMode(source.mode || source.rulesProfile?.mode);

		const defaults = baseProfile(mode);
		const supplied = source.rulesProfile;
		const suppliedMode = supplied?.mode ? normalizeMode(supplied.mode) : mode;
		const suppliedModeMatches = suppliedMode === mode;
		let profile = defaults;

		if (supplied && typeof supplied === 'object') {
			// Only identity/version and explicit overrides are accepted from persisted
			// profile data. Executable mechanic flags always come from the canonical
			// mode defaults plus explicit RuleOverride records.
			profile = {
				...defaults,
				profileId: String(supplied.profileId || defaults.profileId),
				version: Number(supplied.version || defaults.version),
				overrides: suppliedModeMatches && Array.isArray(supplied.overrides)
					? clone(supplied.overrides)
					: [],
				mode,
			};
		}

		if (!suppliedModeMatches) {
			warnings.push('Rules profile mode did not match requested mode; mismatched profile overrides were ignored.');
		}

		// Mode is authoritative. A supplied profile may customize metadata and
		// explicit overrides, but it cannot silently turn a mode into another rules policy.
		if (mode === 'CUSTOM_HOMEBREW_DND') {
			profile = {
				...profile,
				policy: 'CUSTOM_EXPLICIT_RULES',
				baseRuleset: 'NONE',
				allowImplicitAbilityChecks: false,
				allowImplicitSavingThrows: false,
				allowStandardDndSpellRules: false,
				requireAuthoredChallengeForCustomChecks: true,
			};
		} else if (mode === 'FULL_DND') {
			profile = {
				...profile,
				policy: 'DND_STANDARD',
				baseRuleset: 'DND_5E',
				allowWorldRuleOverrides: false,
			};
		} else {
			profile = {
				...profile,
				policy: 'DND_WITH_EXPLICIT_OVERRIDES',
				baseRuleset: 'DND_5E',
				allowWorldRuleOverrides: true,
			};
		}

		profile = applyOverrides(profile, profile.overrides);

		if (mode === 'CUSTOM_HOMEBREW_DND' && profile.baseRuleset === 'DND_5E') {
			warnings.push('CUSTOM_HOMEBREW_DND cannot silently inherit the D&D 5e base ruleset; forcing baseRuleset to NONE.');
			profile.baseRuleset = 'NONE';
			profile.allowStandardDndSpellRules = false;
			profile.allowImplicitAbilityChecks = false;
			profile.allowImplicitSavingThrows = false;
		}

		if (mode === 'FULL_DND' && profile.allowWorldRuleOverrides) {
			warnings.push('FULL_DND ignores world-authored rule overrides; use HYBRID_DND for explicit overrides.');
		}

		return {
			profile: clone(profile),
			source: source.rulesProfile ? 'WORLD' : source.mode ? 'WORLD' : 'DEFAULT',
			warnings,
		};
	}

	public allowsImplicitAbilityChecks(profile: RulesProfile): boolean {
		return profile.allowImplicitAbilityChecks && !profile.disabledMechanics.includes(IMPLICIT_ABILITY_CHECKS);
	}

	public allowsImplicitSavingThrows(profile: RulesProfile): boolean {
		return profile.allowImplicitSavingThrows && !profile.disabledMechanics.includes(IMPLICIT_SAVING_THROWS);
	}

	public allowsStandardDndSpellRules(profile: RulesProfile): boolean {
		return profile.allowStandardDndSpellRules && !profile.disabledMechanics.includes(STANDARD_DND_SPELL_RULES);
	}

	public allowsDndTacticalCombat(profile: RulesProfile): boolean {
		return !profile.disabledMechanics.includes(DND_TACTICAL_COMBAT);
	}

	public allowsStandardRestRules(profile: RulesProfile): boolean {
		return profile.enabledMechanics.includes(REST_RECOVERY_RULES)
			&& !profile.disabledMechanics.includes(REST_RECOVERY_RULES);
	}

	public validate(profile: RulesProfile): string[] {
		const errors: string[] = [];
		if (!profile.profileId) errors.push('profileId is required.');
		if (profile.version < 1) errors.push('version must be at least 1.');
		if (!['FULL_DND', 'HYBRID_DND', 'CUSTOM_HOMEBREW_DND'].includes(profile.mode)) {
			errors.push('Unknown rules mode.');
		}
		if (profile.mode === 'FULL_DND' && profile.overrides.length > 0) {
			errors.push('FULL_DND cannot contain executable world overrides.');
		}
		if (profile.mode === 'CUSTOM_HOMEBREW_DND' && profile.baseRuleset !== 'NONE') {
			errors.push('CUSTOM_HOMEBREW_DND must use baseRuleset NONE.');
		}
		if (profile.mode === 'CUSTOM_HOMEBREW_DND' && !profile.requireAuthoredChallengeForCustomChecks) {
			errors.push('CUSTOM_HOMEBREW_DND must require authored/custom challenges for mechanical checks.');
		}
		return errors;
	}
}

export const rulesProfileEngine = new RulesProfileEngine();

export {
	IMPLICIT_ABILITY_CHECKS,
	IMPLICIT_SAVING_THROWS,
	STANDARD_DND_SPELL_RULES,
	DND_TACTICAL_COMBAT,
	REST_RECOVERY_RULES,
};
