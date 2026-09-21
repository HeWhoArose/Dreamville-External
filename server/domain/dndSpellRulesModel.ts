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

    const level = Math.max(1, Math.min(20, characterLevel));

    // Explicit custom spell rules take precedence over the absence of the standard
    // D&D spell-slot mechanic. They are a declared world rule, not a silent fallback.
    if (customRulesOverrides?.maxAllowedSpellLevel !== undefined) {
      const allowed = Math.max(0, Number(customRulesOverrides.maxAllowedSpellLevel));
      return {
        approved: requestedLevel >= 0 && requestedLevel <= allowed,
        spellName: proposal.spellName,
        requestedLevel,
        maxAvailableLevel: allowed,
        modeApplied: dndMode,
        overrideGranted: false,
        requiresCustomRule: false,
        downgradeRequirement: requestedLevel > allowed ? {
          requiredCasterLevel: level,
          suggestedDowngradeLevel: allowed,
          reason: `Spell level ${requestedLevel} exceeds custom maximum of ${allowed}.`,
        } : undefined,
      };
    }

    // When the standard D&D spell mechanic is disabled, the evaluator cannot invent
    // D&D legality. The caller must supply an explicit custom rule.
    if (!rulesProfileEngine.allowsStandardDndSpellRules(profile)) {
      return {
        approved: false,
        spellName: proposal.spellName,
        requestedLevel,
        maxAvailableLevel: 0,
        modeApplied: dndMode,
        overrideGranted: false,
        requiresCustomRule: true,
      };
    }

    // Determine max available slot level based on D&D 5e table
    const maxAvailableLevel = DND_5E_MAX_SPELL_SLOT_BY_LEVEL[level] || 1;

    // Check HYBRID_DND override
    const hasCapabilityOverride = overrideCapabilities.some(
      (cap) => cap.toLowerCase().includes(proposal.spellName.toLowerCase()) || cap.toLowerCase().includes('override_spell_slots')
    );

    if (dndMode === 'HYBRID_DND' && hasCapabilityOverride) {
      return {
        approved: true,
        spellName: proposal.spellName,
        requestedLevel,
        maxAvailableLevel,
        modeApplied: 'HYBRID_DND',
        overrideGranted: true,
      };
    }

    if (dndMode === 'CUSTOM_HOMEBREW_DND' && customRulesOverrides?.maxAllowedSpellLevel) {
      const allowed = customRulesOverrides.maxAllowedSpellLevel;
      return {
        approved: requestedLevel <= allowed,
        spellName: proposal.spellName,
        requestedLevel,
        maxAvailableLevel: allowed,
        modeApplied: 'CUSTOM_HOMEBREW_DND',
        overrideGranted: false,
        downgradeRequirement: requestedLevel > allowed ? {
          requiredCasterLevel: level,
          suggestedDowngradeLevel: allowed,
          reason: `Spell level ${requestedLevel} exceeds custom homebrew maximum of ${allowed}.`,
        } : undefined,
      };
    }

    // Standard FULL_DND evaluation
    if (requestedLevel <= maxAvailableLevel) {
      return {
        approved: true,
        spellName: proposal.spellName,
        requestedLevel,
        maxAvailableLevel,
        modeApplied: 'FULL_DND',
        overrideGranted: false,
      };
    }

    // Find required caster level for requested slot level
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
      modeApplied: 'FULL_DND',
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
