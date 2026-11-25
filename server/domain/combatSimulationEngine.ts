import type { CombatEffectDefinition, CombatEffectResult } from '../../src/types';
import { TacticalCombatEngine } from './combatEngine';
import { combatEffectEngine } from './combatEffectEngine';
import { combatTargetingEngine } from './combatTargetingEngine';
import { combatReplayEngine } from './combatReplayEngine';

export interface CombatSimulationAuthorityDiagnostics {
  structurallyValid: boolean;
  rulesLegal: boolean;
  sourceAuthorized: boolean;
  worldAuthorized: boolean;
  simulatable: boolean;
  reasons: string[];
}

export interface CombatSimulationResult {
  success: boolean;
  errorReason?: string;
  seed: number;
  before: unknown;
  after?: unknown;
  result?: CombatEffectResult;
  authority?: CombatSimulationAuthorityDiagnostics;
  presentation?: { abstraction: 'TACTICAL' | 'MACRO'; summary: string };
}

/** The four named sandbox modes of the combat design. */
export type CombatSandboxMode = 'SINGLE_RUN' | 'REPLAY' | 'BATCH_SIMULATION' | 'SCENARIO_MATRIX';

export type CombatSandboxRequest = {
  engine: TacticalCombatEngine;
  actorId: string;
  targetIds: string[];
  mode: CombatSandboxMode;
  definition?: CombatEffectDefinition;
  definitions?: CombatEffectDefinition[];
  seed?: number;
  seeds?: number[];
  /** REPLAY: the action id of a recorded combat effect. */
  replayActionId?: string;
};

export type CombatSandboxResult =
  | { mode: 'SINGLE_RUN'; result: CombatSimulationResult }
  | { mode: 'REPLAY'; success: boolean; errorReason?: string; replay?: ReturnType<typeof combatReplayEngine.replay> }
  | { mode: 'BATCH_SIMULATION'; result: ReturnType<CombatSimulationEngine['batchSimulate']> }
  | { mode: 'SCENARIO_MATRIX'; results: ReturnType<CombatSimulationEngine['scenarioMatrix']> }
  | { mode: string; success: false; errorReason: string };

export class CombatSimulationEngine {
  /** One entry point for the four sandbox modes. Every mode runs on a copy and never mutates the live combat. */
  public run(request: CombatSandboxRequest): CombatSandboxResult {
    const { engine, actorId, targetIds } = request;
    switch (request.mode) {
      case 'SINGLE_RUN':
        if (!request.definition) return { mode: 'SINGLE_RUN', success: false, errorReason: 'SINGLE_RUN needs a definition.' };
        return { mode: 'SINGLE_RUN', result: this.simulate({ engine, actorId, targetIds, definition: request.definition, seed: request.seed }) };
      case 'BATCH_SIMULATION':
        if (!request.definition || !request.seeds?.length) return { mode: 'BATCH_SIMULATION', success: false, errorReason: 'BATCH_SIMULATION needs a definition and at least one seed.' };
        return { mode: 'BATCH_SIMULATION', result: this.batchSimulate({ engine, actorId, targetIds, definition: request.definition, seeds: request.seeds }) };
      case 'SCENARIO_MATRIX':
        if (!request.definitions?.length) return { mode: 'SCENARIO_MATRIX', success: false, errorReason: 'SCENARIO_MATRIX needs at least one definition.' };
        return { mode: 'SCENARIO_MATRIX', results: this.scenarioMatrix({ engine, actorId, targetIds, definitions: request.definitions, seeds: request.seeds }) };
      case 'REPLAY': {
        const record = engine.getCombatReplayRecords().find((entry) => entry.actionId === request.replayActionId);
        if (!record) return { mode: 'REPLAY', success: false, errorReason: 'No recorded combat effect has that action id.' };
        const replay = combatReplayEngine.replay(record);
        return { mode: 'REPLAY', success: true, replay };
      }
      default:
        return { mode: String((request as { mode?: string }).mode), success: false, errorReason: 'Unknown sandbox mode.' };
    }
  }

  public diagnose(params: {
    engine: TacticalCombatEngine;
    actorId: string;
    targetIds: string[];
    definition: CombatEffectDefinition;
  }): CombatSimulationAuthorityDiagnostics {
    const reasons: string[] = [];
    const validation = combatEffectEngine.validateDefinition(params.definition, params.engine.getRulesProfile()?.mode || 'FULL_DND');
    const structurallyValid = validation.success;
    if (!structurallyValid) reasons.push(validation.errorReason || 'Effect schema is invalid.');

    const normalized = validation.normalized;
    const actor = params.engine.getParticipant(params.actorId);
    const sourceAuthorized = Boolean(actor && !actor.isDead && actor.hpCurrent > 0);
    if (!sourceAuthorized) reasons.push('Source actor is unavailable or defeated.');

    const targetIds = Array.from(new Set(params.targetIds.filter(Boolean)));
    let targetResolution = { success: true, targetIds: [] as string[], errorReason: undefined as string | undefined };
    if (normalized) {
      const resolved =
        normalized.resolutionMode === 'WORLD_EFFECT' && targetIds.length === 0
          ? { success: true, targetIds: [] as string[] }
          : combatTargetingEngine.resolve(params.engine, params.actorId, targetIds, normalized);
      targetResolution = {
        success: resolved.success,
        targetIds: resolved.targetIds || [],
        errorReason: resolved.errorReason,
      };
      if (!resolved.success) reasons.push(resolved.errorReason || 'Target resolution failed.');
    }

    const actionCost = normalized?.actionCost || 'ACTION';
    const actionLegal =
      sourceAuthorized &&
      (actionCost === 'FREE' || params.engine.getActionEconomy().canConsume(
        params.actorId,
        actionCost === 'BONUS_ACTION'
          ? 'BONUS_ACTION'
          : actionCost === 'REACTION'
            ? 'REACTION'
            : 'ACTION'
      ));
    if (!actionLegal) reasons.push('Action or resource cost is currently unavailable.');

    const rulesLegal =
      structurallyValid &&
      sourceAuthorized &&
      targetResolution.success &&
      actionLegal;
    if (!rulesLegal) reasons.push('Effect cannot currently resolve against the requested combat context.');

    const worldAuthorized = Boolean(
      normalized &&
      ['PERSON', 'GROUP', 'ENCOUNTER', 'STRUCTURE', 'DISTRICT', 'CITY', 'REGION', 'CONTINENT', 'PLANET', 'COSMIC'].includes(normalized.scale)
    );
    if (!worldAuthorized) reasons.push('World-effect scale is not recognized.');

    const simulatable = structurallyValid && sourceAuthorized && rulesLegal && worldAuthorized;
    if (!simulatable) reasons.push('Effect is not safely simulatable.');
    return { structurallyValid, rulesLegal, sourceAuthorized, worldAuthorized, simulatable, reasons };
  }

  public simulate(params: { engine: TacticalCombatEngine; actorId: string; targetIds: string[]; definition: CombatEffectDefinition; seed?: number }): CombatSimulationResult {
    const authority = this.diagnose(params);
    if (!authority.simulatable) {
      return { success: false, errorReason: authority.reasons.join(' '), seed: Number.isFinite(params.seed) ? Math.trunc(params.seed as number) : 0, before: params.engine.exportState(), authority };
    }
    const before = params.engine.exportState();
    const seed = Number.isFinite(params.seed) ? Math.trunc(params.seed as number) : params.engine.getDiceEngine().getSeed();
    const clone = new TacticalCombatEngine(seed);
    clone.importState(before);
    clone.setSeed(seed);
    const targetIds = Array.from(new Set(params.targetIds.filter(Boolean)));
    const result = combatEffectEngine.resolve(clone, params.actorId, targetIds, params.definition);
    const presentation = result.worldEffectPreview
      ? { abstraction: result.worldEffectPreview.abstraction, summary: params.definition.name + ' would resolve at ' + result.worldEffectPreview.scale + ' scale without mutating the live world.' }
      : undefined;
    if (!result.success) return { success: false, errorReason: result.errorReason, seed, before, result, authority, presentation };
    return { success: true, seed, before, after: clone.exportState(), result, authority, presentation };

  }

  public scenarioMatrix(params: {
    engine: TacticalCombatEngine;
    actorId: string;
    targetIds: string[];
    definitions: CombatEffectDefinition[];
    seeds?: number[];
  }): Array<{ definitionId: string; definitionName: string; authority: CombatSimulationAuthorityDiagnostics; simulations: CombatSimulationResult[] }> {
    const seeds = (params.seeds && params.seeds.length ? params.seeds : [101, 202, 303, 404, 505]).map((seed) => Math.trunc(seed));
    return params.definitions.map((definition) => ({
      definitionId: definition.id,
      definitionName: definition.name,
      authority: this.diagnose({ ...params, definition }),
      simulations: seeds.map((seed) => this.simulate({ ...params, definition, seed })),
    }));
  }

  public batchSimulate(params: { engine: TacticalCombatEngine; actorId: string; targetIds: string[]; definition: CombatEffectDefinition; seeds: number[] }): { runs: CombatSimulationResult[]; summary: { averageDamage: number; minDamage: number; maxDamage: number; successfulRuns: number } } {
    const runs = params.seeds.map((seed) => this.simulate({ ...params, seed }));
    const damages = runs.map((run) => run.result?.totalDamage || 0);
    const successfulRuns = runs.filter((run) => run.success).length;
    return {
      runs,
      summary: {
        averageDamage: damages.length ? damages.reduce((a,b) => a+b,0) / damages.length : 0,
        minDamage: damages.length ? Math.min(...damages) : 0,
        maxDamage: damages.length ? Math.max(...damages) : 0,
        successfulRuns,
      },
    };
  }
}

export const combatSimulationEngine = new CombatSimulationEngine();
