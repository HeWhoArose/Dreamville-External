import type { RulesProfile } from '../../src/types';
import { rulesProfileEngine } from './rulesProfileEngine';

// Standard D&D 5e Spell Slot progression table for full casters
export const DND_5E_MAX_SPELL_SLOT_BY_LEVEL: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 2,
  5: 3,
  6: 3,
  7: 4,
  8: 4,
  9: 5,
  10: 5,
  11: 6,
  12: 6,
  13: 7,
  14: 7,
  15: 8,
  16: 8,
  17: 9,
  18: 9,
  19: 9,
  20: 9,
};

export interface SpellProposalInput {
  proposal: {
    spellName: string;
    spellLevel: number;
    school?: string;
  };
  characterLevel: number;
  dndMode: 'FULL_DND' | 'HYBRID_DND' | 'CUSTOM_HOMEBREW_DND';
  overrideCapabilities?: string[];
  customRulesOverrides?: {
    maxAllowedSpellLevel?: number;
  };
  rulesProfile?: RulesProfile;
}

export interface SpellEvaluationResult {
  approved: boolean;
  spellName: string;
  requestedLevel: number;
  maxAvailableLevel: number;
  modeApplied: string;
  overrideGranted: boolean;
  requiresCustomRule?: boolean;
  downgradeRequirement?: {
    requiredCasterLevel: number;
    suggestedDowngradeLevel: number;
    reason: string;
  };
}

export class DndSpellRulesEvaluator {
	public evaluateSpellProposal(input: SpellProposalInput): SpellEvaluationResult {
		const { proposal, characterLevel, dndMode, overrideCapabilities = [], customRulesOverrides } = input;
		const requestedLevel = proposal.spellLevel;
		const profile = input.rulesProfile || rulesProfileEngine.createDefault(dndMode);
		const effectiveMode = profile.mode;
		const level = Math.max(1, Math.min(20, characterLevel));

		// The profile and the requested mode are two views of the same policy. They
		// must agree before any mechanic is executed.
		if (effectiveMode !== dndMode) {
			return {
				approved: false,
				spellName: proposal.spellName,
				requestedLevel,
				maxAvailableLevel: 0,
				modeApplied: effectiveMode,
				overrideGranted: false,
				requiresCustomRule: true,
			};
		}

		// FULL_DND is authoritative. An ad-hoc custom cap cannot replace the
		// standard D&D spell-slot system.
		const standardMaxAvailableLevel = DND_5E_MAX_SPELL_SLOT_BY_LEVEL[level] || 1;
		if (effectiveMode === 'FULL_DND' && customRulesOverrides?.maxAllowedSpellLevel !== undefined) {
			return {
				approved: requestedLevel >= 0 && requestedLevel <= standardMaxAvailableLevel,
				spellName: proposal.spellName,
				requestedLevel,
				maxAvailableLevel: standardMaxAvailableLevel,
				modeApplied: effectiveMode,
				overrideGranted: false,
				requiresCustomRule: false,
			};
		}

		// Explicit custom spell rules are permitted in modes that allow explicit
		// overrides, including a hybrid world that disables standard spell rules.
		if (
			customRulesOverrides?.maxAllowedSpellLevel !== undefined &&
			effectiveMode !== 'FULL_DND'
		) {
			const rawAllowed = Number(customRulesOverrides.maxAllowedSpellLevel);
			const allowed = Number.isFinite(rawAllowed)
				? Math.max(0, Math.min(9, Math.floor(rawAllowed)))
				: -1;

			if (allowed < 0) {
				return {
					approved: false,
					spellName: proposal.spellName,
					requestedLevel,
					maxAvailableLevel: 0,
					modeApplied: effectiveMode,
					overrideGranted: false,
					requiresCustomRule: true,
				};
			}

			return {
				approved: requestedLevel >= 0 && requestedLevel <= allowed,
				spellName: proposal.spellName,
				requestedLevel,
				maxAvailableLevel: allowed,
				modeApplied: effectiveMode,
				overrideGranted: false,
				requiresCustomRule: false,
				downgradeRequirement: requestedLevel > allowed ? {
					requiredCasterLevel: level,
					suggestedDowngradeLevel: allowed,
					reason: `Spell level ${requestedLevel} exceeds custom maximum of ${allowed}.`,
				} : undefined,
			};
		}

		// If the standard D&D spell mechanic is disabled, this evaluator must not
		// invent D&D legality. An explicit custom rule is required.
		if (!rulesProfileEngine.allowsStandardDndSpellRules(profile)) {
			return {
				approved: false,
				spellName: proposal.spellName,
				requestedLevel,
				maxAvailableLevel: 0,
				modeApplied: effectiveMode,
				overrideGranted: false,
				requiresCustomRule: true,
			};
		}

		// Standard D&D spell-slot progression.
		const maxAvailableLevel = standardMaxAvailableLevel;

		const hasCapabilityOverride = overrideCapabilities.some(
			(cap) =>
				cap.toLowerCase().includes(proposal.spellName.toLowerCase()) ||
				cap.toLowerCase().includes('override_spell_slots')
		);

		if (effectiveMode === 'HYBRID_DND' && hasCapabilityOverride) {
			return {
				approved: true,
				spellName: proposal.spellName,
				requestedLevel,
				maxAvailableLevel,
				modeApplied: effectiveMode,
				overrideGranted: true,
			};
		}

		if (requestedLevel <= maxAvailableLevel) {
			return {
				approved: true,
				spellName: proposal.spellName,
				requestedLevel,
				maxAvailableLevel,
				modeApplied: effectiveMode,
				overrideGranted: false,
			};
		}

		let requiredCasterLevel = 20;
		for (let l = 1; l <= 20; l++) {
			if ((DND_5E_MAX_SPELL_SLOT_BY_LEVEL[l] || 1) >= requestedLevel) {
				requiredCasterLevel = l;
				break;
			}
		}

		return {
			approved: false,
			spellName: proposal.spellName,
			requestedLevel,
			maxAvailableLevel,
			modeApplied: effectiveMode,
			overrideGranted: false,
			downgradeRequirement: {
				requiredCasterLevel,
				suggestedDowngradeLevel: maxAvailableLevel,
				reason: `Level ${level} caster cannot cast level ${requestedLevel} spell. Max slot level available is ${maxAvailableLevel}.`,
			},
		};
	}
}

export const dndSpellRulesEvaluator = new DndSpellRulesEvaluator();
