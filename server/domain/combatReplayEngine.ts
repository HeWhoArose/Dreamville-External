import type { CombatReplayRecord, CombatEffectResult } from '../../src/types';
import { TacticalCombatEngine } from './combatEngine';
import { combatEffectEngine } from './combatEffectEngine';

export interface CombatReplayResult {
  success: boolean;
  replayId: string;
  identical: boolean;
  errorReason?: string;
  original: CombatReplayRecord['resultSignature'];
  replayed?: CombatReplayRecord['resultSignature'];
  canonicalEventIds?: string[];
}

function normalizeSignature(signature: CombatReplayRecord['resultSignature']): CombatReplayRecord['resultSignature'] {
  return {
    success: Boolean(signature.success),
    totalDamage: Number(signature.totalDamage || 0),
    defeatedTargetIds: [...(signature.defeatedTargetIds || [])],
    instanceCount: Math.max(0, Math.trunc(signature.instanceCount || 0)),
  };
}

export class CombatReplayEngine {
  public replay(record: CombatReplayRecord): CombatReplayResult {
    const engine = new TacticalCombatEngine(record.seedBefore);
    engine.importState(record.beforeState);

    const result: CombatEffectResult = combatEffectEngine.resolve(
      engine,
      record.actorId,
      record.targetIds,
      record.definition,
      {
        consumeAction: record.consumeAction,
        recordReplay: false,
      }
    );

    const replayed = normalizeSignature({
      success: result.success,
      totalDamage: result.totalDamage,
      defeatedTargetIds: result.defeatedTargetIds,
      instanceCount: result.instances?.length || 0,
    });

    const original = normalizeSignature(record.resultSignature);
    const identical =
      original.success === replayed.success &&
      original.totalDamage === replayed.totalDamage &&
      JSON.stringify(original.defeatedTargetIds || []) === JSON.stringify(replayed.defeatedTargetIds || []) &&
      original.instanceCount === replayed.instanceCount &&
      JSON.stringify(record.canonicalEventIds || []) === JSON.stringify(result.canonicalEventIds || []);

    return {
      success: result.success,
      replayId: record.id,
      identical,
      errorReason: result.errorReason,
      original,
      replayed,
      canonicalEventIds: result.canonicalEventIds,
    };
  }
}

export const combatReplayEngine = new CombatReplayEngine();
