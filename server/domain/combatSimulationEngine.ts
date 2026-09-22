import type { CombatEffectDefinition, CombatEffectResult } from '../../src/types';
import { TacticalCombatEngine } from './combatEngine';
import { combatEffectEngine } from './combatEffectEngine';

export interface CombatSimulationResult {
  success: boolean;
  errorReason?: string;
  seed: number;
  before: unknown;
  after?: unknown;
  result?: CombatEffectResult;
}

export class CombatSimulationEngine {
  public simulate(params: { engine: TacticalCombatEngine; actorId: string; targetIds: string[]; definition: CombatEffectDefinition; seed?: number }): CombatSimulationResult {
    const seed = Number.isFinite(params.seed) ? Math.trunc(params.seed as number) : params.engine.getDiceEngine().getSeed();
    const clone = new TacticalCombatEngine(seed);
    clone.importState(params.engine.exportState());
    clone.setSeed(seed);
    const before = clone.exportState();
    const result = combatEffectEngine.resolve(clone, params.actorId, params.targetIds, params.definition);
    if (!result.success) return { success: false, errorReason: result.errorReason, seed, before, result };
    return { success: true, seed, before, after: clone.exportState(), result };
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
