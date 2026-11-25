/**
 * Named combat animation compositions built from reusable primitives.
 *
 * The AI (or the deterministic fallback) chooses a composition and tunes it; it never draws frames, and a composition never
 * changes what happened. Every composition renders the same canonical combat events in all four presentation modes.
 */
import type { CombatEffectDefinition } from '../types';

export const ANIMATION_PRIMITIVES = [
  'BEAM', 'PROJECTILE', 'SLASH', 'IMPACT', 'EXPLOSION', 'FLASH', 'SHOCKWAVE', 'TRAIL',
  'AURA', 'SHIELD', 'TELEPORT', 'DISSOLUTION', 'DISTORTION', 'SUMMONING', 'SCREEN_SHAKE',
] as const;
export type AnimationPrimitive = (typeof ANIMATION_PRIMITIVES)[number];

export interface AnimationCompositionSpec {
  id: string;
  label: string;
  primitives: AnimationPrimitive[];
  sequence: 'INSTANT' | 'SEQUENTIAL' | 'PARALLEL';
  origin: string;
  impact: string;
  criticalImpact: string;
  missBehavior: string;
}

const spec = (
  id: string,
  label: string,
  primitives: AnimationPrimitive[],
  sequence: AnimationCompositionSpec['sequence'],
  impact: string,
  criticalImpact: string,
  missBehavior = 'PASS_TARGET',
  origin = 'ABILITY_ORIGIN',
): AnimationCompositionSpec => ({ id, label, primitives, sequence, origin, impact, criticalImpact, missBehavior });

/** The nine named compositions of the combat design, plus the four generic ones used as fallbacks. */
export const ANIMATION_COMPOSITIONS: Readonly<Record<string, AnimationCompositionSpec>> = {
  FIREBALL: spec('FIREBALL', 'Fireball', ['PROJECTILE', 'TRAIL', 'EXPLOSION', 'SHOCKWAVE', 'FLASH'], 'SEQUENTIAL', 'FIRE_BURST', 'FIRE_BURST_LARGE', 'FIZZLE_AT_RANGE'),
  LASER: spec('LASER', 'Laser', ['BEAM', 'FLASH', 'IMPACT'], 'INSTANT', 'BEAM_IMPACT', 'BEAM_IMPACT_FLARE', 'BEAM_PASSES_TARGET'),
  MULTI_BEAM: spec('MULTI_BEAM', 'Multi-beam', ['BEAM', 'IMPACT', 'FLASH'], 'SEQUENTIAL', 'BEAM_IMPACT', 'BEAM_IMPACT_FLARE', 'BEAM_PASSES_TARGET'),
  CHAIN_LIGHTNING: spec('CHAIN_LIGHTNING', 'Chain lightning', ['BEAM', 'FLASH', 'IMPACT', 'SCREEN_SHAKE'], 'SEQUENTIAL', 'ARC_IMPACT', 'ARC_IMPACT_FORKED', 'ARC_FADES'),
  SWORD_COMBO: spec('SWORD_COMBO', 'Sword combo', ['SLASH', 'IMPACT', 'TRAIL', 'SCREEN_SHAKE'], 'SEQUENTIAL', 'SLASH_IMPACT', 'SLASH_IMPACT_HEAVY', 'WHIFF'),
  TELEPORT: spec('TELEPORT', 'Teleport', ['TELEPORT', 'DISSOLUTION', 'FLASH', 'DISTORTION'], 'SEQUENTIAL', 'ARRIVAL_FLASH', 'ARRIVAL_FLASH', 'NONE'),
  SUMMON: spec('SUMMON', 'Summon', ['SUMMONING', 'AURA', 'FLASH', 'SHOCKWAVE'], 'SEQUENTIAL', 'ARRIVAL_PULSE', 'ARRIVAL_PULSE', 'NONE'),
  EXPLOSION: spec('EXPLOSION', 'Explosion', ['EXPLOSION', 'SHOCKWAVE', 'FLASH', 'SCREEN_SHAKE'], 'INSTANT', 'BLAST_IMPACT', 'BLAST_IMPACT_LARGE', 'NEAR_MISS_BLAST'),
  HEALING: spec('HEALING', 'Healing', ['AURA', 'FLASH', 'SHIELD'], 'INSTANT', 'HEAL_GLOW', 'HEAL_GLOW_RADIANT', 'NONE'),
  // Generic fallbacks (kept so older plans still validate).
  SINGLE_EFFECT: spec('SINGLE_EFFECT', 'Single effect', ['PROJECTILE', 'IMPACT'], 'INSTANT', 'IMPACT', 'CRITICAL_IMPACT'),
  CHAIN: spec('CHAIN', 'Chain', ['BEAM', 'IMPACT'], 'SEQUENTIAL', 'IMPACT', 'CRITICAL_IMPACT'),
  AREA_BURST: spec('AREA_BURST', 'Area burst', ['EXPLOSION', 'SHOCKWAVE'], 'INSTANT', 'IMPACT', 'CRITICAL_IMPACT'),
  WORLD_CINEMATIC: spec('WORLD_CINEMATIC', 'World cinematic', ['DISTORTION', 'SHOCKWAVE', 'FLASH', 'SCREEN_SHAKE'], 'SEQUENTIAL', 'IMPACT', 'CRITICAL_IMPACT'),
};

export const ANIMATION_COMPOSITION_IDS = Object.keys(ANIMATION_COMPOSITIONS);

export function getAnimationComposition(id: string): AnimationCompositionSpec | undefined {
  return ANIMATION_COMPOSITIONS[id];
}

const text = (definition: CombatEffectDefinition) =>
  `${definition.name || ''} ${definition.id || ''} ${(definition.tags || []).join(' ')} ${definition.damageType || ''} ${definition.visualStyle || ''}`.toLowerCase();

/** Picks the most specific named composition for an effect; the generic fallbacks apply when nothing specific fits. */
export function selectAnimationComposition(definition: CombatEffectDefinition): string {
  const label = text(definition);
  if (definition.resolutionMode === 'OUTCOME' || definition.resolutionMode === 'WORLD_EFFECT') {
    if (definition.outcome === 'SUMMONED') return 'SUMMON';
    if (definition.outcome === 'TELEPORTED') return 'TELEPORT';
    if (definition.resolutionMode === 'WORLD_EFFECT') return 'WORLD_CINEMATIC';
  }
  if (/heal|mend|restor|cure|regenerat/.test(label)) return 'HEALING';
  if (definition.resolutionMode === 'SEQUENCE') return 'SWORD_COMBO';
  if (definition.resolutionMode === 'CHAIN') return /lightning|arc|shock|storm/.test(label) ? 'CHAIN_LIGHTNING' : 'CHAIN';
  if (definition.resolutionMode === 'AREA' || definition.resolutionMode === 'SAVE') {
    if (/fire|flame|inferno|burn|blaze/.test(label)) return 'FIREBALL';
    if (/explo|blast|burst|shockwave|bomb/.test(label)) return 'EXPLOSION';
    return definition.resolutionMode === 'AREA' ? 'AREA_BURST' : 'SINGLE_EFFECT';
  }
  if (definition.resolutionMode === 'MULTI_INSTANCE') return 'MULTI_BEAM';
  if (/laser|beam|ray|radiant|force/.test(label)) return 'LASER';
  return 'SINGLE_EFFECT';
}
