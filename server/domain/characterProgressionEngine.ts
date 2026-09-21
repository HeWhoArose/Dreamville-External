import { deterministicId } from './deterministicRng';
import type { CharacterFeat, CharacterEffect, CharacterGenesisDraft, ConfirmedCharacter, RulesProfile } from '../../src/types';
import type { CapabilityDefinition } from './capabilityEngine';

export type ProgressionModuleType = 'CLASS' | 'SUBCLASS' | 'SPECIES' | 'FEAT';
export type ProgressionModifierMode = 'ADD' | 'MULTIPLY' | 'SET' | 'MIN' | 'MAX';
export type ProgressionAbilityTrigger =
  | 'PASSIVE'
  | 'ON_LEVEL_UP'
  | 'ON_ATTACK'
  | 'ON_DAMAGE_TAKEN'
  | 'ON_CAST'
  | 'ON_REST_START'
  | 'REACTION';

export interface ProgressionModifierSource {
  moduleId: string;
  moduleType: ProgressionModuleType;
  featureId: string;
  sourceId: string;
  sourceName: string;
  precedence: number;
  stackGroup?: string;
}

export interface ProgressionModifier {
  id: string;
  target: string;
  mode: ProgressionModifierMode;
  value: number;
  precedence: number;
  stackGroup?: string;
  source: ProgressionModifierSource;
}

export interface ProgressionAbilityDefinition {
  id: string;
  name: string;
  description: string;
  trigger: ProgressionAbilityTrigger;
  activationMode: 'PASSIVE' | 'ACTIVE' | 'REACTION';
  capabilityId?: string;
  capabilityDefinition?: CapabilityDefinition;
  charges?: number;
  cooldownTurns?: number;
  effects?: CharacterEffect[];
  modifiers?: ProgressionModifier[];
}

export interface ProgressionFeature {
  id: string;
  name: string;
  description: string;
  level: number;
  enabled: boolean;
  passiveModifiers?: ProgressionModifier[];
  triggeredAbilities?: ProgressionAbilityDefinition[];
}

export interface ProgressionModuleDefinition {
  id: string;
  type: ProgressionModuleType;
  name: string;
  version: number;
  enabled: boolean;
  aliases?: string[];
  parentClassId?: string;
  minLevel?: number;
  prerequisites?: string[];
  features: ProgressionFeature[];
  provenance: string;
  sourceCharacterFeatId?: string;
}

export interface ProgressionUsageState {
  chargesRemaining?: number;
  cooldownRemainingTurns?: number;
  lastActivatedLevel?: number;
}

export interface ProgressionHistoryEntry {
  sequence: number;
  commandId: string;
  operation:
    | 'SELECT_CLASS'
    | 'SELECT_SUBCLASS'
    | 'SELECT_SPECIES'
    | 'ACQUIRE_FEAT'
    | 'LEVEL_UP'
    | 'ENABLE_MODULE'
    | 'DISABLE_MODULE'
    | 'TRIGGER_ABILITY';
  fromLevel: number;
  toLevel: number;
  moduleId?: string;
  featureId?: string;
  abilityId?: string;
}

export interface CharacterProgressionState {
  actorId: string;
  currentLevel: number;
  classId?: string;
  subclassId?: string;
  speciesId?: string;
  featIds: string[];
  enabledModuleIds: string[];
  unlockedFeatureIds: string[];
  usage: Record<string, ProgressionUsageState>;
  progressionHistory: ProgressionHistoryEntry[];
  genesisSelectionFingerprint?: string;
  genesisSelectionSource?: {
    classId?: string;
    subclassId?: string;
    speciesId?: string;
    featIds: string[];
  };
}

export interface ResolvedProgressionModifier {
  target: string;
  value: number;
  mode: ProgressionModifierMode;
  sources: ProgressionModifierSource[];
}

export interface ProgressionResolution {
  actorId: string;
  modifiers: ResolvedProgressionModifier[];
  sourceTrace: Record<string, ProgressionModifierSource[]>;
}

export interface CharacterProgressionConfig {
  allowCharacterProgression: boolean;
  allowClassSelection: boolean;
  allowSubclassSelection: boolean;
  allowSpeciesSelection: boolean;
  allowFeatSelection: boolean;
  allowLevelUp: boolean;
  maxCharacterLevel: number;
  allowCustomModules: boolean;
  enabledModuleIds: string[];
  disabledModuleIds: string[];
}

export const DEFAULT_CHARACTER_PROGRESSION_CONFIG: CharacterProgressionConfig = {
  allowCharacterProgression: true,
  allowClassSelection: true,
  allowSubclassSelection: true,
  allowSpeciesSelection: true,
  allowFeatSelection: true,
  allowLevelUp: true,
  maxCharacterLevel: 20,
  allowCustomModules: false,
  enabledModuleIds: [],
  disabledModuleIds: [],
};

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeLevel(value: unknown, fallback = 1): number {
  return Math.max(1, Math.min(20, Math.trunc(finiteNumber(value, fallback))));
}

function normalizeModuleId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function effectToModifier(
  effect: CharacterEffect,
  module: ProgressionModuleDefinition,
  feature: ProgressionFeature,
  index: number
): ProgressionModifier | null {
  const target = String(effect.target || effect.scope || '').trim();
  const numeric = typeof effect.modifier === 'number'
    ? effect.modifier
    : typeof effect.value === 'number'
      ? effect.value
      : Number.NaN;
  if (!target || !Number.isFinite(numeric) || numeric === 0) return null;
  return {
    id: deterministicId('prg_mod', module.id, feature.id, index, target, numeric),
    target,
    mode: 'ADD',
    value: numeric,
    precedence: module.type === 'CLASS' ? 30 : module.type === 'SUBCLASS' ? 40 : module.type === 'SPECIES' ? 20 : 50,
    stackGroup: effect.type || 'CHARACTER_EFFECT',
    source: {
      moduleId: module.id,
      moduleType: module.type,
      featureId: feature.id,
      sourceId: effect.id,
      sourceName: effect.description,
      precedence: module.type === 'CLASS' ? 30 : module.type === 'SUBCLASS' ? 40 : module.type === 'SPECIES' ? 20 : 50,
      stackGroup: effect.type || 'CHARACTER_EFFECT',
    },
  };
}

export class CharacterProgressionEngine {
  private readonly modules = new Map<string, ProgressionModuleDefinition>();
  private readonly actorStates = new Map<string, CharacterProgressionState>();
  private config: CharacterProgressionConfig = { ...DEFAULT_CHARACTER_PROGRESSION_CONFIG };
  private canonicalMutationGuard?: () => boolean;

  constructor(initialConfig?: Partial<CharacterProgressionConfig>) {
    this.registerBuiltIns();
    this.setConfig(initialConfig || {});
  }

  public setConfig(config: Partial<CharacterProgressionConfig>): void {
    const next = { ...this.config, ...clone(config) };
    next.maxCharacterLevel = Math.max(1, Math.min(20, Math.trunc(finiteNumber(next.maxCharacterLevel, 20))));
    next.enabledModuleIds = Array.isArray(next.enabledModuleIds) ? [...new Set(next.enabledModuleIds.map(normalizeModuleId).filter(Boolean))] : [];
    next.disabledModuleIds = Array.isArray(next.disabledModuleIds) ? [...new Set(next.disabledModuleIds.map(normalizeModuleId).filter(Boolean))] : [];
    this.config = next;
  }

  public getConfig(): CharacterProgressionConfig {
    return clone(this.config);
  }

  public setCanonicalMutationGuard(guard: () => boolean): void {
    this.canonicalMutationGuard = guard;
  }

  public getEffectiveConfigForRulesProfile(profile?: RulesProfile | null): CharacterProgressionConfig {
    return this.getConfigForProfile(profile);
  }


  public registerModule(module: ProgressionModuleDefinition): void {
    this.assertCanonicalMutationAuthority();
    this.registerModuleInternal(module);
  }

  public registerModules(modules: ProgressionModuleDefinition[]): void {
    this.assertCanonicalMutationAuthority();
    for (const module of modules || []) this.registerModuleInternal(module);
  }

  private registerModuleInternal(module: ProgressionModuleDefinition): void {
    this.validateModule(module);
    this.modules.set(module.id, clone(module));
  }

  public registerFeatModule(feat: CharacterFeat): ProgressionModuleDefinition {
    this.assertCanonicalMutationAuthority();
    const moduleId = deterministicId('feat_module', feat.worldId || 'world', feat.id, feat.name);
    const featureId = deterministicId('feat_feature', moduleId, feat.id);
    const sourceModifiers = (feat.effects || [])
      .map((effect, index) => effectToModifier(effect, {
        id: moduleId,
        type: 'FEAT',
        name: feat.name,
        version: 1,
        enabled: true,
        features: [],
        provenance: feat.provenance || 'CHARACTER_GENESIS',
        sourceCharacterFeatId: feat.id,
      }, {
        id: featureId,
        name: feat.name,
        description: feat.description,
        level: 1,
        enabled: true,
        passiveModifiers: [],
        triggeredAbilities: [],
      }, index))
      .filter((modifier): modifier is ProgressionModifier => Boolean(modifier));

    const module: ProgressionModuleDefinition = {
      id: moduleId,
      type: 'FEAT',
      name: feat.name,
      version: 1,
      enabled: true,
      minLevel: 1,
      prerequisites: Array.isArray(feat.prerequisites) ? [...feat.prerequisites] : [],
      features: [{
        id: featureId,
        name: feat.name,
        description: feat.description,
        level: 1,
        enabled: true,
        passiveModifiers: sourceModifiers,
        triggeredAbilities: [],
      }],
      provenance: feat.provenance || 'CHARACTER_GENESIS',
      sourceCharacterFeatId: feat.id,
    };
    this.registerModule(module);
    return clone(module);
  }

  public seedFromCharacter(
    actorId: string,
    character: Partial<ConfirmedCharacter | CharacterGenesisDraft>,
    commandId = 'GENESIS',
    options?: { progression?: Partial<CharacterProgressionState>; rulesProfile?: RulesProfile | null; worldModules?: ProgressionModuleDefinition[] }
  ): CharacterProgressionState {
    if (options?.worldModules) this.registerModules(options.worldModules);
    const registeredFeatModules = ((character.feats || []) as CharacterFeat[])
      .filter((feat) => Boolean(feat?.id && feat?.name))
      .map((feat) => this.registerFeatModule(feat));
    const featModuleByCharacterId = new Map(
      ((character.feats || []) as CharacterFeat[])
        .filter((feat) => Boolean(feat?.id))
        .map((feat, index) => [feat.id!, registeredFeatModules[index]?.id])
        .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1]))
    );

    const explicit = options?.progression || (character as any).progression || {};
    const state: CharacterProgressionState = {
      actorId,
      currentLevel: normalizeLevel(character.coreStats?.level, 1),
      classId: normalizeModuleId(explicit.classId) || this.resolveModuleAlias('CLASS', character.role?.profession || character.role?.archetype),
      subclassId: normalizeModuleId(explicit.subclassId),
      speciesId: normalizeModuleId(explicit.speciesId) || this.resolveModuleAlias('SPECIES', character.identity?.species),
      featIds: Array.isArray(explicit.featIds)
        ? [...new Set(explicit.featIds.map(normalizeModuleId).filter(Boolean).map((id) => featModuleByCharacterId.get(id) || id))]
        : [],
      enabledModuleIds: [],
      unlockedFeatureIds: [],
      usage: {},
      progressionHistory: [],
    };

    const knownFeatModuleIds = registeredFeatModules.map((module) => module.id);
    state.featIds = [...new Set([
      ...state.featIds,
      ...knownFeatModuleIds,
    ])];

    if (state.classId) state.enabledModuleIds.push(state.classId);
    if (state.subclassId) state.enabledModuleIds.push(state.subclassId);
    if (state.speciesId) state.enabledModuleIds.push(state.speciesId);
    state.enabledModuleIds.push(...state.featIds);

    state.enabledModuleIds = [...new Set(state.enabledModuleIds)]
      .filter((moduleId) => this.isModuleAllowed(moduleId, options?.rulesProfile));
    this.rebuildUnlockedFeatures(state);

    state.genesisSelectionSource = {
      classId: state.classId,
      subclassId: state.subclassId,
      speciesId: state.speciesId,
      featIds: [...state.featIds],
    };
    state.genesisSelectionFingerprint = deterministicId(
      'prg_genesis',
      actorId,
      state.currentLevel,
      state.classId || '',
      state.subclassId || '',
      state.speciesId || '',
      state.featIds.slice().sort()
    );

    state.progressionHistory.push({
      sequence: 0,
      commandId,
      operation: 'LEVEL_UP',
      fromLevel: state.currentLevel,
      toLevel: state.currentLevel,
    });

    this.actorStates.set(actorId, state);
    return clone(state);
  }

  public getState(actorId: string): CharacterProgressionState | undefined {
    return clone(this.actorStates.get(actorId));
  }

  public getAllModules(): ProgressionModuleDefinition[] {
    return Array.from(this.modules.values()).map(clone);
  }

  public getModule(moduleId: string): ProgressionModuleDefinition | undefined {
    const module = this.modules.get(moduleId);
    return module ? clone(module) : undefined;
  }

  public getEnabledModules(actorId: string): ProgressionModuleDefinition[] {
    const state = this.requireActor(actorId);
    return state.enabledModuleIds
      .map((id) => this.modules.get(id))
      .filter((module): module is ProgressionModuleDefinition => Boolean(module && module.enabled))
      .map(clone);
  }

  public selectModule(
    actorId: string,
    type: ProgressionModuleType,
    moduleId: string,
    commandId: string,
    rulesProfile?: RulesProfile | null
  ): CharacterProgressionState {
    this.assertCanonicalMutationAuthority();
    this.assertMutationAllowed(rulesProfile);
    const state = this.requireActor(actorId);
    const config = this.getConfigForProfile(rulesProfile);
    const module = this.requireModule(moduleId);
    if (module.type !== type) throw new Error(`Module '${moduleId}' is not a ${type} module.`);
    if (type === 'CLASS' && !config.allowClassSelection) throw new Error('Class selection is disabled by the active rules profile.');
    if (type === 'SUBCLASS' && !config.allowSubclassSelection) throw new Error('Subclass selection is disabled by the active rules profile.');
    if (type === 'SPECIES' && !config.allowSpeciesSelection) throw new Error('Species selection is disabled by the active rules profile.');
    if (type === 'FEAT' && !config.allowFeatSelection) throw new Error('Feat selection is disabled by the active rules profile.');
    if (!this.isModuleAllowed(moduleId, rulesProfile)) throw new Error(`Module '${moduleId}' is disabled by the active rules profile.`);
    if (module.minLevel && state.currentLevel < module.minLevel) {
      throw new Error(`Module '${moduleId}' requires level ${module.minLevel}.`);
    }
    if (module.parentClassId && state.classId !== module.parentClassId) {
      throw new Error(`Module '${moduleId}' requires class '${module.parentClassId}'.`);
    }
    this.assertPrerequisites(state, module);

    // Class, subclass, and species are singular selections. Replacing one must
    // disable the previous module so passive modifiers cannot double-stack across
    // stale selections. Feats remain additive and may coexist.
    if (type !== 'FEAT') {
      state.enabledModuleIds = state.enabledModuleIds.filter((id) => {
        const enabled = this.modules.get(id);
        return enabled?.type !== type || id === moduleId;
      });
    }
    if (type === 'CLASS') state.classId = moduleId;
    if (type === 'SUBCLASS') state.subclassId = moduleId;
    if (type === 'SPECIES') state.speciesId = moduleId;
    if (type === 'FEAT' && !state.featIds.includes(moduleId)) state.featIds.push(moduleId);
    if (!state.enabledModuleIds.includes(moduleId)) state.enabledModuleIds.push(moduleId);
    state.progressionHistory.push({
      sequence: state.progressionHistory.length,
      commandId,
      operation: type === 'CLASS' ? 'SELECT_CLASS' : type === 'SUBCLASS' ? 'SELECT_SUBCLASS' : type === 'SPECIES' ? 'SELECT_SPECIES' : 'ACQUIRE_FEAT',
      fromLevel: state.currentLevel,
      toLevel: state.currentLevel,
      moduleId,
    });
    this.rebuildUnlockedFeatures(state);
    return clone(state);
  }

  public acquireFeat(actorId: string, moduleId: string, commandId: string, rulesProfile?: RulesProfile | null): CharacterProgressionState {
    return this.selectModule(actorId, 'FEAT', moduleId, commandId, rulesProfile);
  }

  public levelUp(actorId: string, commandId: string, rulesProfile?: RulesProfile | null): CharacterProgressionState {
    this.assertCanonicalMutationAuthority();
    this.assertMutationAllowed(rulesProfile);
    if (rulesProfile && this.getConfigForProfile(rulesProfile).allowLevelUp === false) {
      throw new Error('Level-up is disabled by the active rules profile.');
    }
    const state = this.requireActor(actorId);
    const maxLevel = this.getConfigForProfile(rulesProfile).maxCharacterLevel;
    if (state.currentLevel >= maxLevel) throw new Error(`Actor is already at maximum level ${maxLevel}.`);
    const fromLevel = state.currentLevel;
    state.currentLevel += 1;
    state.progressionHistory.push({
      sequence: state.progressionHistory.length,
      commandId,
      operation: 'LEVEL_UP',
      fromLevel,
      toLevel: state.currentLevel,
    });
    this.rebuildUnlockedFeatures(state);
    return clone(state);
  }

  public setModuleEnabled(
    actorId: string,
    moduleId: string,
    enabled: boolean,
    commandId: string,
    rulesProfile?: RulesProfile | null
  ): CharacterProgressionState {
    this.assertCanonicalMutationAuthority();
    this.assertMutationAllowed(rulesProfile);
    const state = this.requireActor(actorId);
    const module = this.requireModule(moduleId);
    if (enabled && !this.isModuleAllowed(moduleId, rulesProfile)) throw new Error(`Module '${moduleId}' is disabled by the active rules profile.`);
    if (enabled) {
      if (!state.enabledModuleIds.includes(moduleId)) state.enabledModuleIds.push(moduleId);
      module.enabled = true;
    } else {
      state.enabledModuleIds = state.enabledModuleIds.filter((id) => id !== moduleId);
    }
    state.progressionHistory.push({
      sequence: state.progressionHistory.length,
      commandId,
      operation: enabled ? 'ENABLE_MODULE' : 'DISABLE_MODULE',
      fromLevel: state.currentLevel,
      toLevel: state.currentLevel,
      moduleId,
    });
    this.rebuildUnlockedFeatures(state);
    return clone(state);
  }

  public getUnlockedFeatures(actorId: string): ProgressionFeature[] {
    const state = this.requireActor(actorId);
    const byId = new Map<string, ProgressionFeature>();
    for (const moduleId of state.enabledModuleIds) {
      const module = this.modules.get(moduleId);
      if (!module || !module.enabled) continue;
      for (const feature of module.features) {
        if (feature.enabled && feature.level <= state.currentLevel && state.unlockedFeatureIds.includes(feature.id)) {
          byId.set(feature.id, clone(feature));
        }
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
  }

  public getTriggeredAbilities(actorId: string, trigger?: ProgressionAbilityTrigger): ProgressionAbilityDefinition[] {
    const abilities: ProgressionAbilityDefinition[] = [];
    for (const feature of this.getUnlockedFeatures(actorId)) {
      for (const ability of feature.triggeredAbilities || []) {
        if (!trigger || ability.trigger === trigger) abilities.push(clone(ability));
      }
    }
    return abilities.sort((a, b) => a.id.localeCompare(b.id));
  }

  public consumeTriggeredAbility(
    actorId: string,
    abilityId: string,
    commandId: string
  ): {
    this.assertCanonicalMutationAuthority(); success: boolean; ability: ProgressionAbilityDefinition; state: CharacterProgressionState } {
    const state = this.requireActor(actorId);
    const ability = this.getTriggeredAbilities(actorId).find((entry) => entry.id === abilityId);
    if (!ability) throw new Error(`Triggered progression ability '${abilityId}' is not unlocked.`);
    const usage = state.usage[abilityId] || {};
    if (usage.cooldownRemainingTurns && usage.cooldownRemainingTurns > 0) {
      throw new Error(`Progression ability '${abilityId}' is on cooldown.`);
    }
    if (ability.charges !== undefined) {
      const remaining = usage.chargesRemaining === undefined ? ability.charges : usage.chargesRemaining;
      if (remaining <= 0) throw new Error(`Progression ability '${abilityId}' has no charges remaining.`);
      usage.chargesRemaining = remaining - 1;
    }
    usage.cooldownRemainingTurns = Math.max(0, Math.trunc(ability.cooldownTurns || 0));
    usage.lastActivatedLevel = state.currentLevel;
    state.usage[abilityId] = usage;
    const feature = this.findFeature(abilityId);
    state.progressionHistory.push({
      sequence: state.progressionHistory.length,
      commandId,
      operation: 'TRIGGER_ABILITY',
      fromLevel: state.currentLevel,
      toLevel: state.currentLevel,
      featureId: feature?.id,
      abilityId,
    });
    return { success: true, ability: clone(ability), state: clone(state) };
  }

  public advanceAbilityCooldowns(actorId: string, turns = 1): CharacterProgressionState {
    this.assertCanonicalMutationAuthority();
    const state = this.requireActor(actorId);
    const decrement = Math.max(0, Math.trunc(finiteNumber(turns, 1)));
    for (const usage of Object.values(state.usage)) {
      if (usage.cooldownRemainingTurns !== undefined) {
        usage.cooldownRemainingTurns = Math.max(0, usage.cooldownRemainingTurns - decrement);
      }
    }
    return clone(state);
  }

  public resolveModifiers(actorId: string): ProgressionResolution {
    const state = this.requireActor(actorId);
    const collected: ProgressionModifier[] = [];
    for (const moduleId of state.enabledModuleIds) {
      const module = this.modules.get(moduleId);
      if (!module || !module.enabled) continue;
      for (const feature of module.features) {
        if (!feature.enabled || feature.level > state.currentLevel || !state.unlockedFeatureIds.includes(feature.id)) continue;
        for (const modifier of feature.passiveModifiers || []) collected.push(clone(modifier));
      }
    }

    const grouped = new Map<string, ProgressionModifier[]>();
    for (const modifier of collected) {
      const list = grouped.get(modifier.target) || [];
      list.push(modifier);
      grouped.set(modifier.target, list);
    }

    const modifiers: ResolvedProgressionModifier[] = [];
    const sourceTrace: Record<string, ProgressionModifierSource[]> = {};
    for (const [target, entries] of grouped.entries()) {
      const sorted = entries.slice().sort((a, b) =>
        a.precedence - b.precedence ||
        (a.stackGroup || '').localeCompare(b.stackGroup || '') ||
        a.id.localeCompare(b.id)
      );

      const setEntries = sorted
        .filter((entry) => entry.mode === 'SET')
        .sort((a, b) => b.precedence - a.precedence || a.id.localeCompare(b.id));
      const winningSet = setEntries[0];
      const hasSet = Boolean(winningSet);

      let value = winningSet ? winningSet.value : 0;
      let multiply = 1;
      let minValue: number | undefined;
      let maxValue: number | undefined;
      const sources: ProgressionModifierSource[] = [];

      for (const entry of sorted) {
        sources.push(clone(entry.source));
        if (entry.mode === 'ADD') {
          value += entry.value;
        } else if (entry.mode === 'MULTIPLY') {
          multiply *= entry.value;
        } else if (entry.mode === 'MIN') {
          minValue = minValue === undefined ? entry.value : Math.min(minValue, entry.value);
        } else if (entry.mode === 'MAX') {
          maxValue = maxValue === undefined ? entry.value : Math.max(maxValue, entry.value);
        }
      }

      value *= multiply;
      if (minValue !== undefined) value = Math.min(value, minValue);
      if (maxValue !== undefined) value = Math.max(value, maxValue);

      modifiers.push({
        target,
        value,
        mode: hasSet ? 'SET' : multiply !== 1 ? 'MULTIPLY' : 'ADD',
        sources,
      });
      sourceTrace[target] = sources;
    }

    modifiers.sort((a, b) => a.target.localeCompare(b.target));
    return { actorId, modifiers, sourceTrace };
  }

  public detectGenesisDivergence(actorId: string, character: Partial<ConfirmedCharacter | CharacterGenesisDraft>): {
    divergent: boolean;
    expectedFingerprint?: string;
    actualFingerprint?: string;
    differences: string[];
  } {
    const state = this.requireActor(actorId);
    const expected = (character as any).progression || {};
    const expectedFingerprint = deterministicId(
      'prg_genesis',
      actorId,
      normalizeLevel(character.coreStats?.level, 1),
      normalizeModuleId(expected.classId) || this.resolveModuleAlias('CLASS', character.role?.profession || character.role?.archetype) || '',
      normalizeModuleId(expected.subclassId) || '',
      normalizeModuleId(expected.speciesId) || this.resolveModuleAlias('SPECIES', character.identity?.species) || '',
      Array.isArray(expected.featIds) ? expected.featIds.slice().sort() : ((character.feats || []) as CharacterFeat[]).map((feat) => deterministicId('feat_module', feat.worldId || 'world', feat.id, feat.name)).sort()
    );
    const differences: string[] = [];
    if (state.genesisSelectionSource?.classId !== this.resolveModuleAlias('CLASS', character.role?.profession || character.role?.archetype)) differences.push('class');
    if (state.genesisSelectionSource?.speciesId !== this.resolveModuleAlias('SPECIES', character.identity?.species)) differences.push('species');
    return {
      divergent: state.genesisSelectionFingerprint !== expectedFingerprint || differences.length > 0,
      expectedFingerprint,
      actualFingerprint: state.genesisSelectionFingerprint,
      differences,
    };
  }

  public exportState(): { config: CharacterProgressionConfig; modules: ProgressionModuleDefinition[]; actors: CharacterProgressionState[] } {
    return {
      config: clone(this.config),
      modules: this.getAllModules(),
      actors: Array.from(this.actorStates.values()).map(clone),
    };
  }

  public importState(snapshot: any): void {
    this.modules.clear();
    this.actorStates.clear();
    this.config = { ...DEFAULT_CHARACTER_PROGRESSION_CONFIG };
    if (snapshot?.config) this.setConfig(snapshot.config);
    if (Array.isArray(snapshot?.modules)) {
      for (const module of snapshot.modules) this.registerModuleInternal(module);
    }
    if (!this.modules.size) this.registerBuiltIns();
    for (const actor of Array.isArray(snapshot?.actors) ? snapshot.actors : []) {
      if (!actor?.actorId) continue;
      const state: CharacterProgressionState = {
        actorId: String(actor.actorId),
        currentLevel: normalizeLevel(actor.currentLevel, 1),
        classId: normalizeModuleId(actor.classId) || undefined,
        subclassId: normalizeModuleId(actor.subclassId) || undefined,
        speciesId: normalizeModuleId(actor.speciesId) || undefined,
        featIds: Array.isArray(actor.featIds) ? [...new Set(actor.featIds.map(normalizeModuleId).filter(Boolean))] : [],
        enabledModuleIds: Array.isArray(actor.enabledModuleIds) ? [...new Set(actor.enabledModuleIds.map(normalizeModuleId).filter(Boolean))] : [],
        unlockedFeatureIds: Array.isArray(actor.unlockedFeatureIds) ? [...new Set(actor.unlockedFeatureIds.map(normalizeModuleId).filter(Boolean))] : [],
        usage: actor.usage && typeof actor.usage === 'object' ? clone(actor.usage) : {},
        progressionHistory: Array.isArray(actor.progressionHistory) ? clone(actor.progressionHistory) : [],
        genesisSelectionFingerprint: actor.genesisSelectionFingerprint,
        genesisSelectionSource: actor.genesisSelectionSource ? clone(actor.genesisSelectionSource) : undefined,
      };
      this.actorStates.set(state.actorId, state);
    }
  }

  private assertCanonicalMutationAuthority(): void {
    if (this.canonicalMutationGuard && !this.canonicalMutationGuard()) throw new Error('Character progression mutation requires an active canonical command transaction.');
  }

  private getConfigForProfile(profile?: RulesProfile | null): CharacterProgressionConfig {
    const next = { ...this.config };
    if (!profile) return next;
    const raw = profile.parameterOverrides?.['character_progression'];
    if (raw && typeof raw === 'object') {
      const value = raw as Record<string, unknown>;
      for (const key of [
        'allowCharacterProgression',
        'allowClassSelection',
        'allowSubclassSelection',
        'allowSpeciesSelection',
        'allowFeatSelection',
        'allowLevelUp',
        'allowCustomModules',
      ]) {
        if (typeof value[key] === 'boolean') (next as any)[key] = value[key];
      }
      if (typeof value.maxCharacterLevel === 'number' && Number.isFinite(value.maxCharacterLevel)) {
        next.maxCharacterLevel = Math.max(1, Math.min(20, Math.trunc(value.maxCharacterLevel)));
      }
      if (Array.isArray(value.enabledModuleIds)) next.enabledModuleIds = value.enabledModuleIds.filter((id): id is string => typeof id === 'string');
      if (Array.isArray(value.disabledModuleIds)) next.disabledModuleIds = value.disabledModuleIds.filter((id): id is string => typeof id === 'string');
    }
    if (profile.mode === 'CUSTOM_HOMEBREW_DND' && !profile.enabledMechanics.includes('character_progression')) {
      next.allowCharacterProgression = false;
    }
    return next;
  }

  private assertMutationAllowed(profile?: RulesProfile | null): void {
    const config = this.getConfigForProfile(profile);
    if (!config.allowCharacterProgression) throw new Error('Character progression is disabled by the active rules profile.');
  }

  private assertPrerequisites(state: CharacterProgressionState, module: ProgressionModuleDefinition): void {
    for (const prerequisite of module.prerequisites || []) {
      if (!state.enabledModuleIds.includes(prerequisite) && !state.featIds.includes(prerequisite)) {
        throw new Error(`Module '${module.id}' requires '${prerequisite}'.`);
      }
    }
  }

  private isModuleAllowed(moduleId: string, profile?: RulesProfile | null): boolean {
    const config = this.getConfigForProfile(profile);
    if (config.disabledModuleIds.includes(moduleId)) return false;
    if (config.enabledModuleIds.length && !config.enabledModuleIds.includes(moduleId)) return false;
    if (profile?.mode === 'CUSTOM_HOMEBREW_DND' && !config.allowCustomModules) {
      const provenance = this.modules.get(moduleId)?.provenance;
      return provenance === 'CHARACTER_GENESIS' || provenance === 'CUSTOM_HOMEBREW';
    }
    return true;
  }

  private requireActor(actorId: string): CharacterProgressionState {
    const state = this.actorStates.get(actorId);
    if (!state) throw new Error(`Character progression state for actor '${actorId}' was not found.`);
    return state;
  }

  private requireModule(moduleId: string): ProgressionModuleDefinition {
    const id = normalizeModuleId(moduleId);
    const module = this.modules.get(id);
    if (!module) throw new Error(`Unknown progression module '${id}'.`);
    return module;
  }

  private findFeature(abilityId: string): ProgressionFeature | undefined {
    for (const module of this.modules.values()) {
      for (const feature of module.features) {
        if ((feature.triggeredAbilities || []).some((ability) => ability.id === abilityId)) return feature;
      }
    }
    return undefined;
  }

  private rebuildUnlockedFeatures(state: CharacterProgressionState): void {
    const unlocked = new Set<string>();
    for (const moduleId of state.enabledModuleIds) {
      const module = this.modules.get(moduleId);
      if (!module || !module.enabled) continue;
      for (const feature of module.features) {
        if (feature.enabled && feature.level <= state.currentLevel) unlocked.add(feature.id);
      }
    }
    state.unlockedFeatureIds = Array.from(unlocked).sort();
  }

  private resolveModuleAlias(type: ProgressionModuleType, value?: string): string | undefined {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return undefined;
    return Array.from(this.modules.values())
      .filter((module) => module.type === type)
      .sort((a, b) => a.id.localeCompare(b.id))
      .find((module) => module.id.toLowerCase() === normalized || (module.aliases || []).some((alias) => alias.toLowerCase() === normalized))?.id;
  }

  private validateModule(module: ProgressionModuleDefinition): void {
    if (!module || !module.id || !module.name) throw new Error('Progression module requires id and name.');
    if (!['CLASS', 'SUBCLASS', 'SPECIES', 'FEAT'].includes(module.type)) throw new Error('Invalid progression module type.');
    if (!Number.isInteger(module.version) || module.version < 1) throw new Error(`Progression module '${module.id}' has invalid version.`);
    if (!Array.isArray(module.features)) throw new Error(`Progression module '${module.id}' requires features.`);
    for (const feature of module.features) {
      if (!feature.id || !feature.name || !Number.isInteger(feature.level) || feature.level < 1 || feature.level > 20) {
        throw new Error(`Progression feature in '${module.id}' is invalid.`);
      }
    }
  }

  private registerBuiltIns(): void {
    const classFeature = (
      id: string,
      name: string,
      level: number,
      modifiers: ProgressionModifier[]
    ): ProgressionFeature => ({
      id,
      name,
      description: `${name} progression feature`,
      level,
      enabled: true,
      passiveModifiers: modifiers,
      triggeredAbilities: [],
    });

    const baseModifier = (
      moduleId: string,
      featureId: string,
      target: string,
      mode: ProgressionModifierMode,
      value: number,
      precedence = 0,
      stackGroup?: string
    ): ProgressionModifier => ({
      id: deterministicId('prg_mod', moduleId, featureId, target, mode, value),
      target,
      mode,
      value,
      precedence,
      stackGroup,
      source: {
        moduleId,
        moduleType: moduleId.startsWith('species_') ? 'SPECIES' : moduleId.startsWith('class_') ? 'CLASS' : moduleId.startsWith('subclass_') ? 'SUBCLASS' : 'FEAT',
        featureId,
        sourceId: deterministicId('prg_src', moduleId, featureId, target),
        sourceName: featureId,
        precedence,
        stackGroup,
      },
    });

    const modules: ProgressionModuleDefinition[] = [
      {
        id: 'class_fighter',
        type: 'CLASS',
        name: 'Fighter',
        version: 1,
        enabled: true,
        aliases: ['fighter', 'warrior'],
        features: [
          classFeature('class_fighter_core', 'Fighter Training', 1, [
            baseModifier('class_fighter', 'class_fighter_core', 'combat.attackBonus', 'ADD', 1, 30, 'MARTIAL_TRAINING'),
            baseModifier('class_fighter', 'class_fighter_core', 'coreStats.hpMax', 'ADD', 4, 30, 'CLASS_HP'),
          ]),
          {
            id: 'class_fighter_veteran', name: 'Veteran Training', description: 'Advanced martial progression.', level: 5, enabled: true,
            passiveModifiers: [
              baseModifier('class_fighter', 'class_fighter_veteran', 'combat.attackBonus', 'ADD', 1, 30, 'MARTIAL_TRAINING'),
              baseModifier('class_fighter', 'class_fighter_veteran', 'coreStats.hpMax', 'ADD', 4, 30, 'CLASS_HP'),
            ],
            triggeredAbilities: [{
              id: 'ability_fighter_second_wind',
              name: 'Second Wind',
              description: 'A recoverable fighter feature represented as a canonical triggered ability.',
              trigger: 'REACTION',
              activationMode: 'ACTIVE',
              charges: 1,
            }],
          },
        ],
        provenance: 'SYSTEM_CANON',
      },
      {
        id: 'subclass_fighter_champion',
        type: 'SUBCLASS',
        name: 'Champion',
        version: 1,
        enabled: true,
        parentClassId: 'class_fighter',
        minLevel: 3,
        aliases: ['champion'],
        features: [
          classFeature('subclass_fighter_champion_core', 'Improved Combat Focus', 3, [
            baseModifier('subclass_fighter_champion', 'subclass_fighter_champion_core', 'combat.criticalRange', 'SET', 19, 40, 'CRITICAL_RANGE'),
          ]),
        ],
        provenance: 'SYSTEM_CANON',
      },
      {
        id: 'class_wizard',
        type: 'CLASS',
        name: 'Wizard',
        version: 1,
        enabled: true,
        aliases: ['wizard', 'mage'],
        features: [
          classFeature('class_wizard_core', 'Arcane Training', 1, [
            baseModifier('class_wizard', 'class_wizard_core', 'spell.attackBonus', 'ADD', 1, 30, 'ARCANE_TRAINING'),
            baseModifier('class_wizard', 'class_wizard_core', 'spell.saveDC', 'ADD', 1, 30, 'ARCANE_TRAINING'),
          ]),
        ],
        provenance: 'SYSTEM_CANON',
      },
      {
        id: 'subclass_wizard_evocation',
        type: 'SUBCLASS',
        name: 'Evocation',
        version: 1,
        enabled: true,
        parentClassId: 'class_wizard',
        minLevel: 3,
        aliases: ['evocation'],
        features: [
          classFeature('subclass_wizard_evocation_core', 'Evocation Focus', 3, [
            baseModifier('subclass_wizard_evocation', 'subclass_wizard_evocation_core', 'spell.damage', 'ADD', 2, 40, 'EVOCATION_DAMAGE'),
          ]),
        ],
        provenance: 'SYSTEM_CANON',
      },
      {
        id: 'class_rogue',
        type: 'CLASS',
        name: 'Rogue',
        version: 1,
        enabled: true,
        aliases: ['rogue', 'scout'],
        features: [
          classFeature('class_rogue_core', 'Rogue Training', 1, [
            baseModifier('class_rogue', 'class_rogue_core', 'combat.attackBonus', 'ADD', 1, 30, 'FINESSE_TRAINING'),
            baseModifier('class_rogue', 'class_rogue_core', 'coreStats.speed', 'ADD', 5, 30, 'MOBILITY'),
          ]),
        ],
        provenance: 'SYSTEM_CANON',
      },
      {
        id: 'species_human',
        type: 'SPECIES',
        name: 'Human',
        version: 1,
        enabled: true,
        aliases: ['human'],
        features: [
          classFeature('species_human_core', 'Adaptable', 1, [
            baseModifier('species_human', 'species_human_core', 'coreStats.strength', 'ADD', 1, 20, 'SPECIES_ABILITY'),
          ]),
        ],
        provenance: 'SYSTEM_CANON',
      },
      {
        id: 'species_elf',
        type: 'SPECIES',
        name: 'Elf',
        version: 1,
        enabled: true,
        aliases: ['elf'],
        features: [
          classFeature('species_elf_core', 'Keen Senses', 1, [
            baseModifier('species_elf', 'species_elf_core', 'coreStats.dexterity', 'ADD', 2, 20, 'SPECIES_ABILITY'),
            baseModifier('species_elf', 'species_elf_core', 'coreStats.speed', 'ADD', 5, 20, 'SPECIES_SPEED'),
          ]),
        ],
        provenance: 'SYSTEM_CANON',
      },
      {
        id: 'species_dwarf',
        type: 'SPECIES',
        name: 'Dwarf',
        version: 1,
        enabled: true,
        aliases: ['dwarf'],
        features: [
          classFeature('species_dwarf_core', 'Dwarven Resilience', 1, [
            baseModifier('species_dwarf', 'species_dwarf_core', 'coreStats.constitution', 'ADD', 2, 20, 'SPECIES_ABILITY'),
            baseModifier('species_dwarf', 'species_dwarf_core', 'coreStats.hpMax', 'ADD', 2, 20, 'SPECIES_HP'),
          ]),
        ],
        provenance: 'SYSTEM_CANON',
      },
    ];
    this.registerModules(modules);
  }
}
