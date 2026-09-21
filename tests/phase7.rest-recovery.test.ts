import test from 'node:test';
import assert from 'node:assert/strict';

import { ConditionEngine } from '../server/domain/conditionEngine';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { RestRecoveryEngine } from '../server/domain/restRecoveryEngine';
import { rulesProfileEngine, REST_RECOVERY_RULES } from '../server/domain/rulesProfileEngine';
import { captureCanonicalStateSnapshot } from '../server/domain/canonicalSnapshot';

function seedRepo(storyId = 'phase7_test'): InMemoryWorldRepository {
  const repo = new InMemoryWorldRepository({ disablePersistence: true });
  repo.seedStory(storyId);
  const profile = rulesProfileEngine.createDefault('FULL_DND');
  repo.saveStoryRun({
    storyId,
    id: storyId,
    worldId: 'world_solar_archive',
    characterName: 'Phase 7 Test Hero',
    storyMode: 'PROTAGONIST',
    dndRulesMode: 'FULL_DND',
    rulesProfile: profile,
    ruleset: 'FULL_DND',
    generationSeed: 'phase7-tests',
    currentHp: 12,
    maxHp: 30,
    characterCoreStats: {
      level: 4,
      constitution: 14,
      hitDice: '1d8',
      hpCurrent: 12,
      hpMax: 30,
    },
  });
  return repo;
}

function actorId(repo: InMemoryWorldRepository, storyId: string): string {
  return repo.getPlayerLifecycle(storyId)?.actorId || 'player_actor_' + storyId;
}

test('Phase 7 condition elapsed-time schedules respect duration and catch-up ticks', () => {
  const engine = new ConditionEngine();
  engine.seedActor('hero', { healthCurrent: 30, healthMax: 30 });
  const applied = engine.applyCondition('hero', {
    definitionIdOrName: 'Poisoned',
    nowSeconds: 0,
    durationSeconds: 60,
  });
  assert.equal(applied.applied, true);

  const events = engine.advanceElapsedTime('hero', 0, 120);
  assert.equal(events.length, 1);
  assert.equal(engine.getActorState('hero')?.instances.some((c) => c.name === 'Poisoned'), false);
  assert.equal(engine.getActorState('hero')?.healthCurrent, 29);
});

test('Phase 7 exhaustion is canonical, bounded, and exposes deterministic modifiers', () => {
  const engine = new ConditionEngine();
  engine.seedActor('hero', { healthCurrent: 30, healthMax: 30 });

  assert.equal(engine.setExhaustionLevel('hero', 9), 6);
  assert.equal(engine.getExhaustionLevel('hero'), 6);
  assert.deepEqual(engine.getExhaustionModifiers('hero'), {
    level: 6,
    d20Penalty: -12,
    saveDcPenalty: -12,
    speedPenaltyFeet: 30,
  });

  assert.equal(engine.adjustExhaustion('hero', -20), 0);
  assert.equal(engine.getExhaustionLevel('hero'), 0);
});

test('Phase 7 short rest advances world time, spends canonical Hit Dice, and recovers HP', () => {
  const repo = seedRepo();
  const storyId = 'phase7_test';
  const id = actorId(repo, storyId);
  const engine = repo.getRestRecoveryEngine(storyId);

  const before = repo.getWorldClock(storyId).getAbsoluteTime();
  const result = engine.execute({
    storyId,
    actorId: id,
    action: 'PERFORM',
    restType: 'SHORT_REST',
    hitDiceToSpend: 1,
  });

  assert.equal(result.success, true);
  assert.equal(result.restState?.status, 'COMPLETED');
  assert.equal(repo.getWorldClock(storyId).getAbsoluteTime(), before + 3600);
  assert.equal(result.hitDice?.current, 3);
  assert.ok((result.recovery?.hpRestored || 0) >= 1);
  assert.ok((repo.getConditionEngine(storyId).getActorState(id)?.healthCurrent || 0) > 12);
});

test('Phase 7 long rest restores HP, spell slots, exhaustion, and breaks concentration', () => {
  const repo = seedRepo();
  const storyId = 'phase7_test';
  const id = actorId(repo, storyId);
  const condition = repo.getConditionEngine(storyId);
  condition.setHealth(id, 10);
  condition.setExhaustionLevel(id, 2);

  const spells = repo.getCombatEngine(storyId).getSpellRuntime();
  spells.initializeSlots(id, { 1: { current: 0, max: 2 }, 2: { current: 0, max: 1 } });
  spells.setActorState(id, {
    ...spells.getOrCreateActorState(id),
    activeConcentration: {
      spellId: 'test_concentration',
      spellName: 'Test Concentration',
      slotLevel: 2,
      castAtRound: 1,
      castAtTurn: 0,
      durationRounds: 10,
      remainingRounds: 5,
      casterId: id,
      targetIds: [],
      appliedConditions: [],
    },
  });

  const result = repo.getRestRecoveryEngine(storyId).execute({
    storyId,
    actorId: id,
    action: 'PERFORM',
    restType: 'LONG_REST',
  });

  assert.equal(result.success, true);
  assert.equal(result.restState?.status, 'COMPLETED');
  assert.equal(condition.getActorState(id)?.healthCurrent, 30);
  assert.equal(condition.getExhaustionLevel(id), 1);

  const spellState = spells.getActorState(id);
  assert.equal(spellState?.spellSlots[1].current, 2);
  assert.equal(spellState?.spellSlots[2].current, 1);
  assert.equal(spellState?.activeConcentration, null);
  assert.equal(result.recovery?.concentrationBroken, true);
});

test('Phase 7 interrupted rest advances time but does not apply completion recovery', () => {
  const repo = seedRepo();
  const storyId = 'phase7_test';
  const id = actorId(repo, storyId);
  const condition = repo.getConditionEngine(storyId);
  condition.setHealth(id, 5);

  const result = repo.getRestRecoveryEngine(storyId).execute({
    storyId,
    actorId: id,
    action: 'PERFORM',
    restType: 'LONG_REST',
    interruptAfterSeconds: 3600,
  });

  assert.equal(result.success, true);
  assert.equal(result.restState?.status, 'INTERRUPTED');
  assert.equal(result.recovery, undefined);
  assert.equal(repo.getWorldClock(storyId).getAbsoluteTime(), 3600);
  assert.equal(condition.getActorState(id)?.healthCurrent, 5);
});

test('Phase 7 custom mode requires explicit rest authority and honors explicit overrides', () => {
  const repo = seedRepo();
  const storyId = 'phase7_test';
  const id = actorId(repo, storyId);

  const disabledCustom = rulesProfileEngine.createDefault('CUSTOM_HOMEBREW_DND');
  repo.saveStoryRun({ ...repo.getStoryRun(storyId), rulesProfile: disabledCustom });
  const rejected = repo.getRestRecoveryEngine(storyId).execute({
    storyId,
    actorId: id,
    action: 'PERFORM',
    restType: 'SHORT_REST',
  });
  assert.equal(rejected.success, false);

  const customResolution = rulesProfileEngine.resolve({
    mode: 'CUSTOM_HOMEBREW_DND',
    rulesProfile: {
      mode: 'CUSTOM_HOMEBREW_DND',
      overrides: [
        {
          ruleId: REST_RECOVERY_RULES,
          operation: 'ENABLE',
          reason: 'Phase 7 test explicitly enables authored rest.',
        },
        {
          ruleId: REST_RECOVERY_RULES,
          operation: 'SET',
          reason: 'Phase 7 test supplies authored rest timings.',
          value: {
            shortRestSeconds: 600,
            longRestSeconds: 1200,
            longRestRestoreHp: false,
            longRestRestoreSpellSlots: false,
          },
        },
      ],
    },
  }).profile;
  repo.saveStoryRun({ ...repo.getStoryRun(storyId), rulesProfile: customResolution });

  const accepted = repo.getRestRecoveryEngine(storyId).execute({
    storyId,
    actorId: id,
    action: 'PERFORM',
    restType: 'SHORT_REST',
  });
  assert.equal(accepted.success, true);
  assert.equal(repo.getWorldClock(storyId).getAbsoluteTime(), 600);
});

test('Phase 7 active rest survives canonical snapshot save/load and restores without side effects', () => {
  const storyId = 'phase7_test';
  const repo = seedRepo(storyId);
  const id = actorId(repo, storyId);

  const begin = repo.getRestRecoveryEngine(storyId).execute({
    storyId,
    actorId: id,
    action: 'BEGIN',
    restType: 'LONG_REST',
  });
  assert.equal(begin.success, true);

  const snapshot = captureCanonicalStateSnapshot(storyId, repo);
  assert.equal(snapshot.rest.activeRests[id].status, 'ACTIVE');

  const restored = new InMemoryWorldRepository({ disablePersistence: true });
  restored.seedStory(storyId);
  restored.restoreCanonicalStateSnapshot(snapshot);

  assert.equal(restored.getRestRecoveryEngine(storyId).getRestState(id)?.status, 'ACTIVE');
  assert.equal(restored.getWorldClock(storyId).getAbsoluteTime(), repo.getWorldClock(storyId).getAbsoluteTime());
});

test('Phase 7 invalid rest command is atomic and leaves time/rest state unchanged', () => {
  const repo = seedRepo();
  const storyId = 'phase7_test';
  const id = actorId(repo, storyId);
  const condition = repo.getConditionEngine(storyId);
  condition.setHealth(id, 0);

  const before = captureCanonicalStateSnapshot(storyId, repo);
  const result = repo.getRestRecoveryEngine(storyId).execute({
    storyId,
    actorId: id,
    action: 'PERFORM',
    restType: 'LONG_REST',
  });

  assert.equal(result.success, false);
  const after = captureCanonicalStateSnapshot(storyId, repo);
  assert.deepEqual(after.worldClock, before.worldClock);
  assert.deepEqual(after.rest, before.rest);
  assert.equal(after.conditions.actors.find((a: any) => a.actorId === id)?.healthCurrent, 0);
});


test('Phase 7 REST command is staged, committed once, and idempotent on replay', async () => {
  const repo = seedRepo();
  const storyId = 'phase7_test';
  const id = actorId(repo, storyId);
  const { canonicalCommandEngine } = await import('../server/domain/canonicalCommandEngine');

  const execute = () => canonicalCommandEngine.execute(
    repo,
    {
      commandId: 'phase7-rest-idempotent-001',
      storyId,
      actorId: id,
      type: 'REST',
      payload: {
        action: 'PERFORM',
        restType: 'SHORT_REST',
      },
      source: 'PLAYER',
      idempotencyKey: 'phase7-rest-idem',
      transactionMode: 'STAGED',
    },
    async (command, context) => {
      const result = context.repository.getRestRecoveryEngine(storyId).execute({
        storyId,
        actorId: id,
        action: command.payload.action as any,
        restType: command.payload.restType as any,
      });
      return { success: result.success, data: result, errorReason: result.errorReason, summary: 'Phase 7 REST command.' };
    }
  );

  const first = await execute();
  assert.equal(first.success, true);
  const afterFirst = repo.getWorldClock(storyId).getAbsoluteTime();

  const replay = await execute();
  assert.equal(replay.success, true);
  assert.equal(repo.getWorldClock(storyId).getAbsoluteTime(), afterFirst);
  assert.equal(replay.event?.replay.postStateHash, first.event?.replay.postStateHash);
});
