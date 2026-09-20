import {
  CharacterBodyRegionState,
  CharacterConditionDefinition,
  CharacterConditionInstance,
  CharacterConditionProfile,
  CharacterDamageProfile,
  CharacterStartingConditionState,
  CharacterEffect,
  BodyRegionId,
  ConditionAlignment,
  ConditionStackMode,
  ConditionTickUnit,
} from '../../src/types';

export interface ConditionActorState {
  actorId: string;
  healthCurrent: number;
  healthMax: number;
  fatigue: number;
  stress: number;
  dead: boolean;
  damageProfile: CharacterDamageProfile;
  conditionProfile: CharacterConditionProfile;
  bodyRegions: CharacterBodyRegionState[];
  instances: CharacterConditionInstance[];
}

export interface ConditionApplicationInput {
  definitionIdOrName: string;
  source?: string;
  sourceActorId?: string;
  intensity?: number;
  severity?: number;
  durationSeconds?: number | null;
  affectedBodyRegions?: BodyRegionId[];
  nowSeconds?: number;
  notes?: string;
}

export interface ConditionDamageResult {
  requestedAmount: number;
  finalAmount: number;
  damageType: string;
  immune: boolean;
  resisted: boolean;
  vulnerable: boolean;
  healthCurrent: number;
  targetDied: boolean;
  destroyedBodyRegions: BodyRegionId[];
}

export interface ConditionTickEvent {
  actorId: string;
  conditionId: string;
  conditionName: string;
  unit: ConditionTickUnit;
  damage?: ConditionDamageResult;
  healing?: number;
  intensityBefore: number;
  intensityAfter: number;
  removed: boolean;
  notes: string[];
}

export interface ConditionActionResult {
  actorId: string;
  changed: boolean;
  events: ConditionTickEvent[];
}

const DEFAULT_BODY_REGIONS: Array<{ id: BodyRegionId; label: string }> = [
  { id: 'HEAD', label: 'Head' },
  { id: 'FACE', label: 'Face' },
  { id: 'TORSO', label: 'Torso' },
  { id: 'HEART', label: 'Heart' },
  { id: 'LEFT_ARM', label: 'Left Arm' },
  { id: 'RIGHT_ARM', label: 'Right Arm' },
  { id: 'LEFT_HAND', label: 'Left Hand' },
  { id: 'RIGHT_HAND', label: 'Right Hand' },
  { id: 'LEFT_LEG', label: 'Left Leg' },
  { id: 'RIGHT_LEG', label: 'Right Leg' },
  { id: 'LEFT_FOOT', label: 'Left Foot' },
  { id: 'RIGHT_FOOT', label: 'Right Foot' },
];

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class ConditionEngine {
  private definitions = new Map<string, CharacterConditionDefinition>();
  private actors = new Map<string, ConditionActorState>();

  constructor() {
    this.seedStandardDefinitions();
  }

  public registerDefinition(definition: CharacterConditionDefinition): void {
    const normalized: CharacterConditionDefinition = {
      ...definition,
      id: definition.id.trim(),
      name: definition.name.trim(),
      tags: [...(definition.tags || [])],
      triggers: clone(definition.triggers || []),
      stages: clone(definition.stages || []),
      bodyRegionDefaults: [...(definition.bodyRegionDefaults || [])],
      blocksActions: [...(definition.blocksActions || [])],
      modifierEffects: clone(definition.modifierEffects || []),
    };
    if (!normalized.id || !normalized.name) {
      throw new Error('Condition definition requires a non-empty id and name.');
    }
    if (normalized.defaultSeverity < 0 || normalized.defaultIntensity < 0) {
      throw new Error(`Condition '${normalized.id}' has invalid negative severity/intensity.`);
    }
    if (normalized.maxIntensity !== undefined && normalized.maxIntensity < normalized.defaultIntensity) {
      throw new Error(`Condition '${normalized.id}' maxIntensity cannot be below defaultIntensity.`);
    }
    this.definitions.set(normalized.id, normalized);
  }

  public getDefinition(idOrName: string): CharacterConditionDefinition | undefined {
    const key = idOrName.trim().toLowerCase();
    const direct = Array.from(this.definitions.values()).find(
      (d) => d.id.toLowerCase() === key || d.name.toLowerCase() === key
    );
    return direct ? clone(direct) : undefined;
  }

  public getDefinitions(): CharacterConditionDefinition[] {
    return Array.from(this.definitions.values()).map((d) => clone(d));
  }

  public seedActor(
    actorId: string,
    input?: {
      healthCurrent?: number;
      healthMax?: number;
      fatigue?: number;
      stress?: number;
      legacyConditions?: string[];
      conditionState?: CharacterStartingConditionState;
      damageProfile?: CharacterDamageProfile;
      conditionProfile?: CharacterConditionProfile;
    }
  ): ConditionActorState {
    const existing = this.actors.get(actorId);
    if (existing) return clone(existing);

    const conditionState = input?.conditionState;
    const damageProfile = clone(
      conditionState?.damageProfile ||
      input?.damageProfile || {
        damageImmunities: [],
        damageResistances: [],
        damageVulnerabilities: [],
      }
    );
    const conditionProfile = clone(
      conditionState?.conditionProfile ||
      input?.conditionProfile || {
        conditionImmunities: [],
        conditionResistances: [],
        conditionVulnerabilities: [],
      }
    );

    const state: ConditionActorState = {
      actorId,
      healthCurrent: Math.max(0, Math.floor(Number(input?.healthCurrent ?? 1))),
      healthMax: Math.max(1, Math.floor(Number(input?.healthMax ?? input?.healthCurrent ?? 1))),
      fatigue: Math.max(0, Math.min(100, Number(input?.fatigue ?? 0))),
      stress: Math.max(0, Math.min(100, Number(input?.stress ?? 0))),
      dead: false,
      damageProfile,
      conditionProfile,
      bodyRegions: this.normalizeBodyRegions(conditionState?.bodyRegions),
      instances: clone(conditionState?.instances || []),
    };

    const legacyConditions = input?.legacyConditions || [];
    for (const raw of legacyConditions) {
      const text = String(raw || '').trim();
      if (!text) continue;
      if (!state.instances.some((i) => i.name.toLowerCase() === text.toLowerCase())) {
        this.applyConditionToState(state, { definitionIdOrName: text, nowSeconds: 0 });
      }
    }

    state.dead = state.healthCurrent <= 0;
    this.actors.set(actorId, state);
    return clone(state);
  }

  public getActorState(actorId: string): ConditionActorState | undefined {
    const state = this.actors.get(actorId);
    return state ? clone(state) : undefined;
  }

  public setHealth(actorId: string, healthCurrent: number, healthMax?: number): void {
    const state = this.requireActor(actorId);
    state.healthMax = Math.max(1, Math.floor(healthMax ?? state.healthMax));
    state.healthCurrent = Math.max(0, Math.min(state.healthMax, Math.floor(healthCurrent)));
    state.dead = state.healthCurrent <= 0;
  }

  public setProfiles(
    actorId: string,
    profiles: {
      damageProfile?: CharacterDamageProfile;
      conditionProfile?: CharacterConditionProfile;
      bodyRegions?: CharacterBodyRegionState[];
    }
  ): void {
    const state = this.requireActor(actorId);
    if (profiles.damageProfile) state.damageProfile = clone(profiles.damageProfile);
    if (profiles.conditionProfile) state.conditionProfile = clone(profiles.conditionProfile);
    if (profiles.bodyRegions) state.bodyRegions = this.normalizeBodyRegions(profiles.bodyRegions);
  }

  public applyCondition(actorId: string, input: ConditionApplicationInput): {
    applied: boolean;
    immune: boolean;
    instance?: CharacterConditionInstance;
    reason?: string;
  } {
    const state = this.requireActor(actorId);
    const definition = this.resolveOrCreateDefinition(input.definitionIdOrName);
    return this.applyConditionToState(state, input, definition);
  }

  public removeCondition(actorId: string, conditionIdOrName: string): boolean {
    const state = this.requireActor(actorId);
    const before = state.instances.length;
    state.instances = state.instances.filter(
      (instance) =>
        instance.id !== conditionIdOrName &&
        instance.definitionId !== conditionIdOrName &&
        instance.name.toLowerCase() !== conditionIdOrName.toLowerCase()
    );
    return state.instances.length !== before;
  }

  public modifyConditionIntensity(
    actorId: string,
    conditionId: string,
    delta: number
  ): CharacterConditionInstance | undefined {
    const state = this.requireActor(actorId);
    const instance = state.instances.find((item) => item.id === conditionId);
    if (!instance) return undefined;

    const definition = this.definitions.get(instance.definitionId);
    const previous = instance.intensity;
    instance.intensity = Math.max(
      0,
      Math.min(instance.maxIntensity ?? definition?.maxIntensity ?? Number.MAX_SAFE_INTEGER, instance.intensity + delta)
    );
    this.applyStageBodyEffects(state, instance, definition);
    if (instance.intensity <= 0) {
      state.instances = state.instances.filter((item) => item.id !== instance.id);
    }
    return clone({ ...instance, notes: `Intensity ${previous} → ${instance.intensity}` });
  }

  public processAction(actorId: string, actionText: string, nowSeconds = 0): ConditionActionResult {
    const state = this.requireActor(actorId);
    const normalized = actionText.toLowerCase();
    const events: ConditionTickEvent[] = [];

    for (const instance of [...state.instances]) {
      const definition = this.definitions.get(instance.definitionId);
      if (!definition?.triggers) continue;

      for (const trigger of definition.triggers.filter((item) => item.event === 'ON_ACTION')) {
        const keywords = trigger.actionKeywords || [];
        if (keywords.length === 0 || keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
          const before = instance.intensity;
          if (trigger.intensityDelta) {
            instance.intensity = Math.max(
              0,
              Math.min(instance.maxIntensity ?? definition.maxIntensity ?? Number.MAX_SAFE_INTEGER, instance.intensity + trigger.intensityDelta)
            );
            this.applyStageBodyEffects(state, instance, definition);
          }
          if (instance.intensity <= 0) {
            state.instances = state.instances.filter((item) => item.id !== instance.id);
          }
          events.push({
            actorId,
            conditionId: instance.id,
            conditionName: instance.name,
            unit: 'ACTION',
            intensityBefore: before,
            intensityAfter: instance.intensity,
            removed: instance.intensity <= 0,
            notes: trigger.description ? [trigger.description] : [],
          });
        }
      }
    }

    return { actorId, changed: events.length > 0, events };
  }

  public tickActor(actorId: string, unit: ConditionTickUnit, nowSeconds: number): ConditionTickEvent[] {
    const state = this.requireActor(actorId);
    const events: ConditionTickEvent[] = [];

    for (const instance of [...state.instances]) {
      const definition = this.definitions.get(instance.definitionId);
      if (!definition) continue;
      if ((definition.tickUnit || instance.tickUnit) !== unit) continue;

      const every = Math.max(1, definition.tickEvery || instance.tickEvery || 1);
      if (unit === 'WORLD_TIME' && instance.nextTickAtSeconds !== undefined && nowSeconds < instance.nextTickAtSeconds) {
        continue;
      }

      const beforeIntensity = instance.intensity;
      const notes: string[] = [];

      let damage: ConditionDamageResult | undefined;
      if (definition.damagePerTick && definition.damagePerTick > 0) {
        damage = this.resolveDamage(actorId, definition.damagePerTick * Math.max(1, instance.intensity), definition.damageType || 'CUSTOM');
        notes.push(
          damage.immune
            ? 'Damage immunity prevented the condition tick.'
            : damage.resisted
            ? 'Damage resistance reduced the condition tick.'
            : damage.vulnerable
            ? 'Damage vulnerability amplified the condition tick.'
            : 'Condition damage applied.'
        );
      }

      let healing = 0;
      if (definition.healingPerTick && definition.healingPerTick > 0 && state.healthCurrent > 0) {
        healing = Math.min(
          definition.healingPerTick * Math.max(1, instance.intensity),
          state.healthMax - state.healthCurrent
        );
        state.healthCurrent += healing;
        if (healing > 0) notes.push(`Recovered ${healing} HP.`);
      }

      if (definition.intensityDeltaPerTick) {
        instance.intensity = Math.max(
          0,
          Math.min(instance.maxIntensity ?? definition.maxIntensity ?? Number.MAX_SAFE_INTEGER, instance.intensity + definition.intensityDeltaPerTick)
        );
        this.applyStageBodyEffects(state, instance, definition);
      }

      if (instance.remainingDurationSeconds !== undefined && instance.remainingDurationSeconds !== null) {
        const durationDelta = this.tickDurationSeconds(unit, every);
        instance.remainingDurationSeconds = Math.max(0, instance.remainingDurationSeconds - durationDelta);
      }

      if (definition.decayIntensityPerRestTick && unit === 'DAY') {
        instance.intensity = Math.max(0, instance.intensity - definition.decayIntensityPerRestTick);
      }

      if (unit === 'WORLD_TIME') {
        instance.nextTickAtSeconds = nowSeconds + every;
      }

      let removed = false;
      if (instance.intensity <= 0 || instance.remainingDurationSeconds === 0 || state.dead) {
        state.instances = state.instances.filter((item) => item.id !== instance.id);
        removed = true;
      }

      const stage = this.getCurrentStage(instance, definition);
      if (stage?.description) notes.push(stage.description);

      events.push({
        actorId,
        conditionId: instance.id,
        conditionName: instance.name,
        unit,
        damage,
        healing: healing || undefined,
        intensityBefore: beforeIntensity,
        intensityAfter: instance.intensity,
        removed,
        notes,
      });
    }

    return events;
  }

  public resolveDamage(
    actorId: string,
    requestedAmount: number,
    damageType: string,
    options?: { targetBodyRegionId?: BodyRegionId; ignoreDefenses?: boolean }
  ): ConditionDamageResult {
    const state = this.requireActor(actorId);
    const normalizedType = damageType.trim().toLowerCase() || 'custom';
    const immune = !options?.ignoreDefenses && this.includesInsensitive(state.damageProfile.damageImmunities, normalizedType);
    const resisted = !immune && !options?.ignoreDefenses && this.includesInsensitive(state.damageProfile.damageResistances, normalizedType);
    const vulnerable = !immune && !resisted && !options?.ignoreDefenses && this.includesInsensitive(state.damageProfile.damageVulnerabilities, normalizedType);

    let finalAmount = Math.max(0, Number(requestedAmount) || 0);
    if (immune) finalAmount = 0;
    else if (resisted) finalAmount = Math.floor(finalAmount / 2);
    else if (vulnerable) finalAmount *= 2;

    const destroyedBodyRegions: BodyRegionId[] = [];
    if (finalAmount > 0 && options?.targetBodyRegionId) {
      const region = state.bodyRegions.find((item) => item.id === options.targetBodyRegionId);
      if (region && !region.destroyed) {
        region.integrityCurrent = Math.max(0, region.integrityCurrent - finalAmount);
        if (region.integrityCurrent <= 0) {
          region.destroyed = true;
          destroyedBodyRegions.push(region.id);
        }
      }
    }

    state.healthCurrent = Math.max(0, Math.min(state.healthMax, state.healthCurrent - finalAmount));
    state.dead = state.healthCurrent <= 0;

    if (options?.targetBodyRegionId === 'HEART') {
      const heart = state.bodyRegions.find((item) => item.id === 'HEART');
      if (heart?.destroyed) state.dead = true;
    }

    return {
      requestedAmount: Math.max(0, Number(requestedAmount) || 0),
      finalAmount,
      damageType: normalizedType,
      immune,
      resisted,
      vulnerable,
      healthCurrent: state.healthCurrent,
      targetDied: state.dead,
      destroyedBodyRegions,
    };
  }

  public exportActorState(actorId: string): CharacterStartingConditionState | undefined {
    const state = this.actors.get(actorId);
    if (!state) return undefined;
    return {
      instances: clone(state.instances),
      damageProfile: clone(state.damageProfile),
      conditionProfile: clone(state.conditionProfile),
      bodyRegions: clone(state.bodyRegions),
    };
  }

  public exportAll(): Record<string, CharacterStartingConditionState> {
    const result: Record<string, CharacterStartingConditionState> = {};
    for (const [actorId] of this.actors) {
      result[actorId] = this.exportActorState(actorId)!;
    }
    return result;
  }

  public importAll(data: Record<string, CharacterStartingConditionState>): void {
    for (const [actorId, conditionState] of Object.entries(data || {})) {
      this.seedActor(actorId, { conditionState });
    }
  }

  private resolveOrCreateDefinition(idOrName: string): CharacterConditionDefinition {
    const existing = this.getDefinition(idOrName);
    if (existing) return existing;

    const name = idOrName.trim() || 'Custom Condition';
    const id = `custom_${slugify(name) || 'condition'}`;
    const created: CharacterConditionDefinition = {
      id,
      name,
      description: `Custom condition: ${name}.`,
      category: 'CUSTOM',
      alignment: 'NEUTRAL',
      defaultSeverity: 1,
      defaultIntensity: 1,
      stackMode: 'REFRESH',
      tags: ['custom'],
    };
    this.registerDefinition(created);
    return created;
  }

  private applyConditionToState(
    state: ConditionActorState,
    input: ConditionApplicationInput,
    definition?: CharacterConditionDefinition
  ): { applied: boolean; immune: boolean; instance?: CharacterConditionInstance; reason?: string } {
    const def = definition || this.resolveOrCreateDefinition(input.definitionIdOrName);
    const conditionName = def.name.trim();
    const conditionKey = conditionName.toLowerCase();

    if (this.includesInsensitive(state.conditionProfile.conditionImmunities, conditionKey) ||
        this.includesInsensitive(state.conditionProfile.conditionImmunities, def.id.toLowerCase())) {
      return { applied: false, immune: true, reason: `Actor is immune to condition '${conditionName}'.` };
    }

    const resistance = this.includesInsensitive(state.conditionProfile.conditionResistances, conditionKey) ||
      this.includesInsensitive(state.conditionProfile.conditionResistances, def.id.toLowerCase());
    const vulnerability = this.includesInsensitive(state.conditionProfile.conditionVulnerabilities, conditionKey) ||
      this.includesInsensitive(state.conditionProfile.conditionVulnerabilities, def.id.toLowerCase());

    const existing = state.instances.find((instance) => instance.definitionId === def.id);
    const requestedIntensity = Math.max(1, Math.floor(input.intensity ?? def.defaultIntensity));
    const adjustedIntensity = vulnerability ? requestedIntensity * 2 : resistance ? Math.max(1, Math.ceil(requestedIntensity / 2)) : requestedIntensity;
    const maxIntensity = input.intensity !== undefined
      ? Math.max(1, input.intensity)
      : (def.maxIntensity ?? 1);

    if (existing) {
      switch (def.stackMode || existing.stackMode) {
        case 'ADD':
          existing.intensity = Math.min(
            existing.maxIntensity ?? def.maxIntensity ?? Number.MAX_SAFE_INTEGER,
            existing.intensity + adjustedIntensity
          );
          existing.stackCount += 1;
          break;
        case 'MAX':
          existing.intensity = Math.max(existing.intensity, adjustedIntensity);
          existing.stackCount = Math.max(existing.stackCount, 1);
          break;
        case 'REPLACE':
          existing.intensity = adjustedIntensity;
          existing.stackCount = 1;
          break;
        case 'REFRESH':
        default:
          existing.stackCount += 1;
          existing.intensity = Math.max(existing.intensity, adjustedIntensity);
          break;
      }
      existing.remainingDurationSeconds =
        input.durationSeconds ?? def.defaultDurationSeconds ?? existing.remainingDurationSeconds;
      this.applyStageBodyEffects(state, existing, def);
      return { applied: true, immune: false, instance: clone(existing), reason: 'Existing condition updated.' };
    }

    const nowSeconds = Math.max(0, Number(input.nowSeconds ?? 0));
    const instance: CharacterConditionInstance = {
      id: `cond_${state.actorId}_${slugify(def.id)}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      definitionId: def.id,
      name: conditionName,
      alignment: def.alignment,
      severity: Math.max(0, Math.floor(input.severity ?? def.defaultSeverity)),
      intensity: Math.max(0, adjustedIntensity),
      maxIntensity: def.maxIntensity,
      source: input.source,
      sourceActorId: input.sourceActorId,
      appliedAtSeconds: nowSeconds,
      durationSeconds: input.durationSeconds ?? def.defaultDurationSeconds ?? null,
      remainingDurationSeconds: input.durationSeconds ?? def.defaultDurationSeconds ?? null,
      tickUnit: def.tickUnit,
      tickEvery: def.tickEvery,
      nextTickAtSeconds: def.tickUnit === 'WORLD_TIME' ? nowSeconds + (def.tickEvery || 1) : undefined,
      stackCount: 1,
      stackMode: def.stackMode || 'REFRESH',
      tags: [...(def.tags || [])],
      affectedBodyRegions: input.affectedBodyRegions || def.bodyRegionDefaults,
      notes: input.notes,
    };
    state.instances.push(instance);
    this.applyStageBodyEffects(state, instance, def);
    return { applied: true, immune: false, instance: clone(instance) };
  }

  private applyStageBodyEffects(
    state: ConditionActorState,
    instance: CharacterConditionInstance,
    definition?: CharacterConditionDefinition
  ): void {
    if (!definition?.stages || definition.stages.length === 0) return;
    const stage = this.getCurrentStage(instance, definition);
    if (!stage?.bodyEffects) return;

    for (const effect of stage.bodyEffects) {
      const regions = state.bodyRegions.filter((region) => region.id === effect.regionId);
      for (const region of regions) {
        if (effect.integrityMultiplier !== undefined) {
          region.integrityCurrent = Math.max(0, Math.floor(region.integrityCurrent * effect.integrityMultiplier));
        }
        if (effect.integrityDelta !== undefined) {
          region.integrityCurrent = Math.max(0, region.integrityCurrent + effect.integrityDelta);
        }
        region.destroyed = region.integrityCurrent <= 0;
        if (instance.affectedBodyRegions && !instance.affectedBodyRegions.includes(region.id)) {
          instance.affectedBodyRegions.push(region.id);
        }
        if (!region.conditionIds.includes(instance.id)) {
          region.conditionIds.push(instance.id);
        }
      }
    }
  }

  private getCurrentStage(
    instance: CharacterConditionInstance,
    definition: CharacterConditionDefinition
  ): CharacterConditionStage | undefined {
    const stages = definition.stages || [];
    let current: CharacterConditionStage | undefined;
    for (const stage of stages) {
      if (instance.intensity >= stage.minIntensity &&
          (stage.maxIntensity === undefined || instance.intensity <= stage.maxIntensity)) {
        current = stage;
      }
    }
    return current;
  }

  private normalizeBodyRegions(input?: CharacterBodyRegionState[]): CharacterBodyRegionState[] {
    const source = input && input.length > 0 ? input : DEFAULT_BODY_REGIONS.map((entry) => ({
      id: entry.id,
      label: entry.label,
      integrityCurrent: 100,
      integrityMax: 100,
      destroyed: false,
      conditionIds: [],
    }));
    return source.map((region) => ({
      ...region,
      integrityCurrent: Math.max(0, Math.min(region.integrityMax, region.integrityCurrent)),
      integrityMax: Math.max(1, region.integrityMax),
      destroyed: Boolean(region.destroyed || region.integrityCurrent <= 0),
      conditionIds: [...(region.conditionIds || [])],
    }));
  }

  private tickDurationSeconds(unit: ConditionTickUnit, every: number): number {
    switch (unit) {
      case 'ACTION': return 0;
      case 'TURN':
      case 'ROUND': return every;
      case 'MINUTE': return every * 60;
      case 'HOUR': return every * 3600;
      case 'DAY': return every * 86400;
      case 'WORLD_TIME': return every;
      default: return every;
    }
  }

  private includesInsensitive(values: string[], target: string): boolean {
    const normalizedTarget = target.trim().toLowerCase();
    return values.some((value) => value.trim().toLowerCase() === normalizedTarget);
  }

  private requireActor(actorId: string): ConditionActorState {
    const existing = this.actors.get(actorId);
    if (!existing) {
      return this.seedActor(actorId);
    }
    return existing;
  }

  private seedStandardDefinitions(): void {
    const dndConditions = [
      'Blinded',
      'Charmed',
      'Deafened',
      'Exhausted',
      'Frightened',
      'Grappled',
      'Incapacitated',
      'Invisible',
      'Paralyzed',
      'Petrified',
      'Poisoned',
      'Prone',
      'Restrained',
      'Stunned',
      'Unconscious',
    ];

    for (const name of dndConditions) {
      this.registerDefinition({
        id: slugify(name),
        name,
        description: `D&D-compatible ${name} condition. Additional rules effects are supplied by the active ruleset.`,
        category: 'DND_CONDITION',
        alignment: 'HARMFUL',
        defaultSeverity: 1,
        defaultIntensity: 1,
        stackMode: 'REFRESH',
        tags: ['dnd', 'condition', slugify(name)],
      });
    }

    this.registerDefinition({
      id: 'burning',
      name: 'Burning',
      description: 'The actor is suffering ongoing fire damage and may intensify while exposed to flame.',
      category: 'AFFLICTION',
      alignment: 'HARMFUL',
      defaultSeverity: 1,
      defaultIntensity: 1,
      maxIntensity: 10,
      stackMode: 'ADD',
      tickUnit: 'TURN',
      tickEvery: 1,
      damagePerTick: 2,
      damageType: 'fire',
      tags: ['fire', 'damage_over_time'],
    });

    this.registerDefinition({
      id: 'poisoned',
      name: 'Poisoned',
      description: 'Toxic exposure that may cause recurring poison damage.',
      category: 'AFFLICTION',
      alignment: 'HARMFUL',
      defaultSeverity: 1,
      defaultIntensity: 1,
      maxIntensity: 5,
      stackMode: 'ADD',
      tickUnit: 'MINUTE',
      tickEvery: 1,
      damagePerTick: 1,
      damageType: 'poison',
      tags: ['poison', 'damage_over_time'],
    });

    this.registerDefinition({
      id: 'regenerating',
      name: 'Regenerating',
      description: 'The actor gradually restores health when the regeneration condition remains active.',
      category: 'RECOVERY',
      alignment: 'BENEFICIAL',
      defaultSeverity: 1,
      defaultIntensity: 1,
      maxIntensity: 10,
      stackMode: 'MAX',
      tickUnit: 'MINUTE',
      tickEvery: 1,
      healingPerTick: 2,
      tags: ['healing_over_time'],
    });

    this.registerDefinition({
      id: 'imprisoned',
      name: 'Imprisoned',
      description: 'The actor is physically confined by a canonical situation.',
      category: 'SITUATION',
      alignment: 'HARMFUL',
      defaultSeverity: 1,
      defaultIntensity: 1,
      stackMode: 'REFRESH',
      tags: ['restriction', 'situation'],
      blocksActions: ['movement'],
    });

    this.registerDefinition({
      id: 'weak',
      name: 'Weak',
      description: 'The actor is in a weakened physical state.',
      category: 'SITUATION',
      alignment: 'HARMFUL',
      defaultSeverity: 1,
      defaultIntensity: 1,
      maxIntensity: 5,
      stackMode: 'MAX',
      tags: ['physical'],
    });

    this.registerDefinition({
      id: 'living_flame',
      name: 'Living Flame',
      description: 'Self-inflicted supernatural flame that intensifies through use, harms the bearer, and can consume body regions before reaching a terminal heart state.',
      category: 'SELF_TRANSFORMATION',
      alignment: 'MIXED',
      defaultSeverity: 1,
      defaultIntensity: 1,
      maxIntensity: 6,
      stackMode: 'MAX',
      tickUnit: 'TURN',
      tickEvery: 1,
      damagePerTick: 2,
      damageType: 'fire',
      tags: ['self_damage', 'fire', 'transformation', 'body_progression'],
      bodyRegionDefaults: ['RIGHT_HAND', 'RIGHT_ARM', 'TORSO'],
      triggers: [
        {
          id: 'living_flame_fire_action',
          event: 'ON_ACTION',
          actionKeywords: ['fire', 'flame', 'ignite', 'burn', 'flare', 'fireball'],
          intensityDelta: 1,
          description: 'Using fire accelerates the Living Flame.',
        },
      ],
      stages: [
        {
          id: 'flame_hand',
          name: 'Ignited Hand',
          minIntensity: 1,
          maxIntensity: 1,
          description: 'Flame is concentrated around the hand.',
          effects: [],
          bodyEffects: [{ regionId: 'RIGHT_HAND', integrityDelta: -2 }],
        },
        {
          id: 'flame_arm',
          name: 'Consumed Arm',
          minIntensity: 2,
          maxIntensity: 2,
          description: 'The fire has begun consuming the arm toward the shoulder.',
          effects: [],
          bodyEffects: [{ regionId: 'RIGHT_ARM', integrityDelta: -6 }],
        },
        {
          id: 'flame_torso',
          name: 'Burning Torso',
          minIntensity: 3,
          maxIntensity: 3,
          description: 'Flames have spread into the torso.',
          effects: [],
          bodyEffects: [{ regionId: 'TORSO', integrityDelta: -8 }],
        },
        {
          id: 'flame_skeleton',
          name: 'Skeletal Form',
          minIntensity: 4,
          maxIntensity: 4,
          description: 'Most soft tissue has burned away; the skeleton remains active inside the flame.',
          effects: [],
          bodyEffects: [{ regionId: 'WHOLE_BODY', integrityDelta: -10 }],
        },
        {
          id: 'flame_heart',
          name: 'Exposed Heart',
          minIntensity: 5,
          maxIntensity: 5,
          description: 'The heart remains visible and beating within the burning skeleton.',
          effects: [],
          bodyEffects: [{ regionId: 'HEART', integrityDelta: -12 }],
        },
        {
          id: 'flame_terminal',
          name: 'Heart Consumed',
          minIntensity: 6,
          maxIntensity: 6,
          description: 'The Living Flame has reached the heart. The next terminal failure kills the character.',
          effects: [],
          bodyEffects: [{ regionId: 'HEART', integrityDelta: -100 }],
        },
      ],
    });
  }
}

export const conditionEngine = new ConditionEngine();
