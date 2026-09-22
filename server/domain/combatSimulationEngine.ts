import type { CombatEffectDefinition, CombatEffectResult } from '../../src/types';
import { TacticalCombatEngine } from './combatEngine';
import { combatEffectEngine } from './combatEffectEngine';

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

export class CombatSimulationEngine {
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

    const actor = params.engine.getParticipant(params.actorId);
    const sourceAuthorized = Boolean(actor && !actor.isDead && actor.hpCurrent > 0);
    if (!sourceAuthorized) reasons.push('Source actor is unavailable or defeated.');

    const targetIds = Array.from(new Set(params.targetIds.filter(Boolean)));
    const legalTargetCount = targetIds.filter((id) => {
      const target = params.engine.getParticipant(id);
      return Boolean(target && !target.isDead && target.hpCurrent > 0);
    }).length;
    const rulesLegal = structurallyValid && sourceAuthorized && (
      params.definition.resolutionMode === 'WORLD_EFFECT'
        ? true
        : legalTargetCount > 0
    );
    if (!rulesLegal) reasons.push('Effect cannot currently resolve against the requested combat context.');

    const worldAuthorized = structurallyValid && (
      params.definition.resolutionMode !== 'WORLD_EFFECT' ||
      ['PERSON', 'GROUP', 'ENCOUNTER', 'STRUCTURE', 'DISTRICT', 'CITY', 'REGION', 'CONTINENT', 'PLANET', 'COSMIC'].includes(params.definition.scale)
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
    const seed = Number.isFinite(params.seed) ? Math.trunc(params.seed as number) : params.engine.getDiceEngine().getSeed();
    const clone = new TacticalCombatEngine(seed);
    clone.importState(params.engine.exportState());
    clone.setSeed(seed);
    const before = clone.exportState();
    const result = combatEffectEngine.resolve(clone, params.actorId, params.targetIds, params.definition);
    const presentation = result.worldEffectPreview
      ? { abstraction: result.worldEffectPreview.abstraction, summary: params.definition.name + ' would resolve at ' + result.worldEffectPreview.scale + ' scale without mutating the live world.' }
      : undefined;
    if (!result.success) return { success: false, errorReason: result.errorReason, seed, before, result, authority, presentation };
    return { success: true, seed, before, after: clone.exportState(), result, authority, presentation };

    return { success: true, seed, before, after: clone.exportState(), result };
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
