export type SfxPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type SfxCategory = 'combat' | 'magic' | 'monster' | 'ui' | 'movement' | 'environment' | 'general';

export interface SfxDefinition {
  key: string;
  category: SfxCategory;
  defaultVolume: number;
  priority: SfxPriority;
  defaultHaptic: 'off' | 'light' | 'medium' | 'heavy';
  syntheticPreset: string;
  description: string;
}

export class SfxRegistry {
  private static registry: Map<string, SfxDefinition> = new Map([
    [
      'combat.stab',
      {
        key: 'combat.stab',
        category: 'combat',
        defaultVolume: 0.9,
        priority: 'HIGH',
        defaultHaptic: 'heavy',
        syntheticPreset: 'blade_slash',
        description: 'Sharp piercing blade contact',
      },
    ],
    [
      'combat.sword_hit',
      {
        key: 'combat.sword_hit',
        category: 'combat',
        defaultVolume: 0.85,
        priority: 'HIGH',
        defaultHaptic: 'heavy',
        syntheticPreset: 'metallic_strike',
        description: 'Resonant steel impact against armor or shield',
      },
    ],
    [
      'combat.shield_block',
      {
        key: 'combat.shield_block',
        category: 'combat',
        defaultVolume: 0.8,
        priority: 'HIGH',
        defaultHaptic: 'medium',
        syntheticPreset: 'shield_deflect',
        description: 'Heavy wooden/iron shield deflection',
      },
    ],
    [
      'magic.heal',
      {
        key: 'magic.heal',
        category: 'magic',
        defaultVolume: 0.75,
        priority: 'NORMAL',
        defaultHaptic: 'light',
        syntheticPreset: 'holy_chime',
        description: 'Soothing harmonic restorative chime',
      },
    ],
    [
      'magic.fire',
      {
        key: 'magic.fire',
        category: 'magic',
        defaultVolume: 0.85,
        priority: 'HIGH',
        defaultHaptic: 'medium',
        syntheticPreset: 'fireball',
        description: 'Roaring flame ignition and detonation',
      },
    ],
    [
      'monster.roar',
      {
        key: 'monster.roar',
        category: 'monster',
        defaultVolume: 0.95,
        priority: 'HIGH',
        defaultHaptic: 'heavy',
        syntheticPreset: 'monster_growl',
        description: 'Bestial guttural acoustic roar',
      },
    ],
    [
      'monster.shout',
      {
        key: 'monster.shout',
        category: 'monster',
        defaultVolume: 0.8,
        priority: 'NORMAL',
        defaultHaptic: 'light',
        syntheticPreset: 'vocal_shout',
        description: 'Humanoid aggressive shout or battlecry',
      },
    ],
    [
      'ui.quest_complete',
      {
        key: 'ui.quest_complete',
        category: 'ui',
        defaultVolume: 0.8,
        priority: 'NORMAL',
        defaultHaptic: 'medium',
        syntheticPreset: 'chime_victory',
        description: 'Triumphant fanfare and harmonic chime',
      },
    ],
    [
      'ui.click',
      {
        key: 'ui.click',
        category: 'ui',
        defaultVolume: 0.5,
        priority: 'LOW',
        defaultHaptic: 'light',
        syntheticPreset: 'click',
        description: 'Subtle mechanical tactile interface click',
      },
    ],
    [
      'movement.footsteps',
      {
        key: 'movement.footsteps',
        category: 'movement',
        defaultVolume: 0.4,
        priority: 'LOW',
        defaultHaptic: 'off',
        syntheticPreset: 'footstep',
        description: 'Rhythmic soft footsteps on stone or soil',
      },
    ],
    [
      'general.death',
      {
        key: 'general.death',
        category: 'general',
        defaultVolume: 1.0,
        priority: 'CRITICAL',
        defaultHaptic: 'heavy',
        syntheticPreset: 'death_toll',
        description: 'Ominous bell toll marking mortality event',
      },
    ],
    [
      'general.divergence',
      {
        key: 'general.divergence',
        category: 'general',
        defaultVolume: 0.9,
        priority: 'CRITICAL',
        defaultHaptic: 'heavy',
        syntheticPreset: 'reality_warp',
        description: 'Uncanny temporal or reality distortion hum',
      },
    ],
  ]);

  public static get(key: string): SfxDefinition | null {
    return this.registry.get(key) || null;
  }

  public static has(key: string): boolean {
    return this.registry.has(key);
  }

  public static getAll(): SfxDefinition[] {
    return Array.from(this.registry.values());
  }

  /**
   * Resolves a key or structured cue to an SfxDefinition.
   */
  public static resolve(keyOrCue: string): SfxDefinition | null {
    if (!keyOrCue || typeof keyOrCue !== 'string') return null;
    const trimmed = keyOrCue.trim().toLowerCase();
    if (this.registry.has(trimmed)) {
      return this.registry.get(trimmed)!;
    }
    // Check if key is prefixed (e.g. 'sfx:combat.stab')
    const stripped = trimmed.replace(/^(sfx|cue|sound):/, '');
    if (this.registry.has(stripped)) {
      return this.registry.get(stripped)!;
    }
    return null;
  }
}
