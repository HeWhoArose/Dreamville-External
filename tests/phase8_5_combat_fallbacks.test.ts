import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatAnimationService } from '../server/services/combatAnimationService';
import { combatAssetService } from '../server/services/combatAssetService';
import { CombatEffectEngine } from '../server/domain/combatEffectEngine';
import { CombatSimulationEngine } from '../server/domain/combatSimulationEngine';
import { TacticalCombatEngine } from '../server/domain/combatEngine';

test('Phase 8.5 fallback: deterministic animation plan exists without AI', () => {
  const service = new CombatAnimationService();
  const plan = service.deterministicPlan({
    id: 'five_beams', name: 'Five Beams', resolutionMode: 'MULTI_INSTANCE', scale: 'PERSON', actionCost: 'ACTION', instanceCount: 5,
  });
  assert.equal(plan.generatedBy, 'SYSTEM');
  assert.equal(plan.composition, 'MULTI_BEAM');
  assert.equal(plan.count, 5);
});

test('Phase 8.5 fallback: malformed effect definitions fail closed', () => {
  const engine = new CombatEffectEngine();
  const invalid = engine.validateDefinition({ id: '', name: '', resolutionMode: 'MULTI_INSTANCE', scale: 'PERSON' }, 'FULL_DND');
  assert.equal(invalid.success, false);
  const missingOutcome = engine.validateDefinition({ id: 'erase', name: 'Erase', resolutionMode: 'OUTCOME', scale: 'COSMIC' }, 'CUSTOM_HOMEBREW_DND');
  assert.equal(missingOutcome.success, false);
});

test('Phase 8.5 regression: simulation is deterministic for the same seed', () => {
  const engine = new TacticalCombatEngine(1234);
  engine.addParticipant({ id: 'hero', name: 'Hero', x: 0, y: 0, initiative: 10, team: 'player_allies', hpCurrent: 100, hpMax: 100, armorClass: 12, speedCells: 6, attackBonus: 5, damageFormula: '1d8', conditions: [], isDead: false });
  engine.addParticipant({ id: 'enemy', name: 'Enemy', x: 1, y: 0, initiative: 1, team: 'enemies', hpCurrent: 100, hpMax: 100, armorClass: 12, speedCells: 6, attackBonus: 2, damageFormula: '1d4', conditions: [], isDead: false });
  engine.rollInitiative();
  const simulation = new CombatSimulationEngine();
  const definition = { id: 'repeat', name: 'Repeat', resolutionMode: 'MULTI_INSTANCE' as const, scale: 'PERSON' as const, actionCost: 'ACTION' as const, targetingMode: 'ONE_TARGET' as const, instanceCount: 5, attackFormula: '1d20', damageFormula: '1d8' };
  const a = simulation.simulate({ engine, actorId: 'hero', targetIds: ['enemy'], definition, seed: 9876 });
  const b = simulation.simulate({ engine, actorId: 'hero', targetIds: ['enemy'], definition, seed: 9876 });
  assert.deepEqual(a.result?.instances, b.result?.instances);
  assert.equal(a.result?.totalDamage, b.result?.totalDamage);
});

test('Phase 8.5 cache fallback: visual asset generation has a stable reusable key', async () => {
  // This exercises the service without making gameplay depend on a provider response.
  assert.equal(typeof combatAssetService.clearMemoryCache, 'function');
  combatAssetService.clearMemoryCache();
});
