import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TacticalCombatEngine } from '../server/domain/combatEngine';
import { combatEffectEngine } from '../server/domain/combatEffectEngine';
import { combatSimulationEngine } from '../server/domain/combatSimulationEngine';
import { CombatAnimationService } from '../server/services/combatAnimationService';
import { AbilityDraftService } from '../server/services/abilityDraftService';
import { ANIMATION_COMPOSITIONS, ANIMATION_COMPOSITION_IDS, ANIMATION_PRIMITIVES, selectAnimationComposition } from '../src/data/combatAnimationCompositions';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { rulesProfileEngine } from '../server/domain/rulesProfileEngine';

function person(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hero', name: 'Hero', x: 0, y: 0, initiative: 100, initiativeModifier: 100, team: 'player_allies' as const,
    hpCurrent: 300, hpMax: 300, armorClass: 12, speedCells: 8, attackBonus: 30, damageFormula: '1d8+3',
    conditions: [], isDead: false, ...overrides,
  } as any;
}

function arena() {
  const engine = new TacticalCombatEngine(1337);
  engine.addParticipant(person());
  engine.addParticipant(person({ id: 'enemy', name: 'Ogre', team: 'enemies', x: 1, y: 0, hpCurrent: 5000, hpMax: 5000, initiative: 0, initiativeModifier: 0 }));
  engine.rollInitiative();
  return engine;
}

const beam = { id: 'beam', name: 'Finger Lasers', resolutionMode: 'MULTI_INSTANCE' as const, scale: 'PERSON' as const, actionCost: 'ACTION' as const, targetingMode: 'ONE_TARGET' as const, instanceCount: 3, damageFormula: '1d8', damageType: 'radiant' };

// ------------------------------------------------------------ sandbox modes

test('sandbox: the four named modes run on a copy and never touch the live combat', () => {
  const engine = arena();
  const hpBefore = engine.getParticipant('enemy')!.hpCurrent;

  const single = combatSimulationEngine.run({ engine, actorId: 'hero', targetIds: ['enemy'], mode: 'SINGLE_RUN', definition: beam, seed: 7 });
  assert.equal(single.mode, 'SINGLE_RUN');
  assert.equal((single as any).result.success, true);

  const batch = combatSimulationEngine.run({ engine, actorId: 'hero', targetIds: ['enemy'], mode: 'BATCH_SIMULATION', definition: beam, seeds: [1, 2, 3, 4] });
  assert.equal((batch as any).result.runs.length, 4);

  const matrix = combatSimulationEngine.run({ engine, actorId: 'hero', targetIds: ['enemy'], mode: 'SCENARIO_MATRIX', definitions: [beam, { ...beam, id: 'beam2', instanceCount: 5 }], seeds: [1, 2] });
  assert.equal((matrix as any).results.length, 2);

  assert.equal(engine.getParticipant('enemy')!.hpCurrent, hpBefore, 'the live fight was not changed');
  assert.equal(engine.getTurnResources('hero')?.actionAvailable, true, 'and no action was spent');
});

test('sandbox: REPLAY reproduces a recorded effect, and bad requests are refused with a reason', () => {
  const engine = arena();
  combatEffectEngine.resolve(engine, 'hero', ['enemy'], beam);
  const record = engine.getCombatReplayRecords()[0];
  assert.ok(record, 'the effect was recorded');
  const replay = combatSimulationEngine.run({ engine, actorId: 'hero', targetIds: ['enemy'], mode: 'REPLAY', replayActionId: record.actionId }) as any;
  assert.equal(replay.success, true);
  assert.ok(replay.replay);
  const missing = combatSimulationEngine.run({ engine, actorId: 'hero', targetIds: ['enemy'], mode: 'REPLAY', replayActionId: 'nope' }) as any;
  assert.equal(missing.success, false);
  assert.equal((combatSimulationEngine.run({ engine, actorId: 'hero', targetIds: [], mode: 'BATCH_SIMULATION', definition: beam }) as any).success, false, 'a batch needs seeds');
  assert.equal((combatSimulationEngine.run({ engine, actorId: 'hero', targetIds: [], mode: 'NOPE' as any }) as any).success, false);
});

// ------------------------------------------------------------ animation compositions

test('animation: all nine named compositions exist, are built from known primitives, and render in order', () => {
  for (const id of ['FIREBALL', 'LASER', 'MULTI_BEAM', 'CHAIN_LIGHTNING', 'SWORD_COMBO', 'TELEPORT', 'SUMMON', 'EXPLOSION', 'HEALING']) {
    const spec = ANIMATION_COMPOSITIONS[id];
    assert.ok(spec, id);
    assert.ok(spec.primitives.length >= 2, `${id} has primitives`);
    for (const primitive of spec.primitives) assert.ok((ANIMATION_PRIMITIVES as readonly string[]).includes(primitive), `${id}: ${primitive}`);
  }
  for (const id of ['SINGLE_EFFECT', 'CHAIN', 'AREA_BURST', 'WORLD_CINEMATIC']) assert.ok(ANIMATION_COMPOSITION_IDS.includes(id), `generic ${id} kept`);
});

test('animation: the deterministic plan picks the most specific composition for an effect', () => {
  const pick = (definition: Record<string, unknown>) => selectAnimationComposition({ id: 'x', name: 'X', scale: 'PERSON', ...definition } as any);
  assert.equal(pick({ name: 'Fireball', resolutionMode: 'AREA', damageType: 'fire' }), 'FIREBALL');
  assert.equal(pick({ name: 'Shockwave', resolutionMode: 'AREA', damageType: 'force' }), 'EXPLOSION');
  assert.equal(pick({ name: 'Chain Lightning', resolutionMode: 'CHAIN', damageType: 'lightning' }), 'CHAIN_LIGHTNING');
  assert.equal(pick({ name: 'Finger Lasers', resolutionMode: 'MULTI_INSTANCE' }), 'MULTI_BEAM');
  assert.equal(pick({ name: 'Piercing Ray', resolutionMode: 'SINGLE_ATTACK', damageType: 'radiant' }), 'LASER');
  assert.equal(pick({ name: 'Blade Dance', resolutionMode: 'SEQUENCE' }), 'SWORD_COMBO');
  assert.equal(pick({ name: 'Blink', resolutionMode: 'OUTCOME', outcome: 'TELEPORTED' }), 'TELEPORT');
  assert.equal(pick({ name: 'Call Whelps', resolutionMode: 'OUTCOME', outcome: 'SUMMONED' }), 'SUMMON');
  assert.equal(pick({ name: 'Mend Wounds', resolutionMode: 'SAVE' }), 'HEALING');
  assert.equal(pick({ name: 'Ruin', resolutionMode: 'WORLD_EFFECT', outcome: 'WORLD_STATE_CHANGED' }), 'WORLD_CINEMATIC');

  const plan = new CombatAnimationService().deterministicPlan({ id: 'fb', name: 'Fireball', resolutionMode: 'AREA', scale: 'ENCOUNTER', damageType: 'fire' } as any);
  assert.equal(plan.composition, 'FIREBALL');
  assert.ok((plan.primitives || []).includes('EXPLOSION'));
  assert.equal(plan.generatedBy, 'SYSTEM', 'presentation only');
});

// ------------------------------------------------------------ ability creation flow

function repoWithStory(storyId: string) {
  const repo = new InMemoryWorldRepository({ disablePersistence: true });
  repo.seedStory(storyId);
  repo.saveStoryRun({
    storyId, id: storyId, worldId: 'world_solar_archive', characterName: 'Maker', storyMode: 'PROTAGONIST',
    dndRulesMode: 'FULL_DND', rulesProfile: rulesProfileEngine.createDefault('FULL_DND'), ruleset: 'FULL_DND', generationSeed: 'draft',
    currentHp: 20, maxHp: 20,
  } as any);
  const actorId = repo.getPlayerLifecycle(storyId)?.actorId || 'player_actor_' + storyId;
  return { repo, actorId };
}

const blackHole = {
  id: 'black_hole', name: 'Black Hole', resolutionMode: 'AREA' as const, scale: 'ENCOUNTER' as const, actionCost: 'ACTION' as const,
  targetingMode: 'ALL_IN_AREA' as const, damageFormula: '6d6', damageType: 'force', areaShape: 'SPHERE' as const, areaRadiusCells: 4,
};

test('ability flow: a valid definition is simulated in a sandbox and held for the player to confirm', async () => {
  const { repo, actorId } = repoWithStory('draft_ok');
  const service = new AbilityDraftService();
  const draft = await service.propose({ repository: repo, storyId: 'draft_ok', actorId, description: 'A black hole that pulls enemies in and crushes them.', definition: blackHole });
  assert.equal(draft.status, 'READY_FOR_CONFIRMATION', draft.reasons.join(' '));
  assert.equal(draft.source, 'EDITOR');
  assert.ok(draft.preview && draft.preview.successfulRuns > 0, 'a simulated preview exists');
  assert.equal(draft.diagnostics?.structurallyValid, true);
  assert.equal(draft.capabilityId, undefined, 'nothing is registered before confirmation');
  assert.equal(repo.getCapabilityEngine('draft_ok').getActorCapabilities(actorId).some((cap) => cap.name === 'Black Hole'), false);
});

test('ability flow: only an explicit player confirmation registers and acquires the ability', async () => {
  const { repo, actorId } = repoWithStory('draft_confirm');
  const service = new AbilityDraftService();
  const draft = await service.propose({ repository: repo, storyId: 'draft_confirm', actorId, description: 'A black hole.', definition: blackHole });
  assert.equal(service.confirm({ repository: repo, draftId: draft.id, playerConfirmed: false }).success, false, 'no confirmation, no ability');
  const confirmed = service.confirm({ repository: repo, draftId: draft.id, playerConfirmed: true });
  assert.equal(confirmed.success, true, confirmed.errorReason);
  assert.equal(confirmed.draft?.status, 'CONFIRMED');
  assert.ok(repo.getCapabilityEngine('draft_confirm').getActorCapabilities(actorId).some((cap) => cap.name === 'Black Hole'));
  assert.equal(service.confirm({ repository: repo, draftId: draft.id, playerConfirmed: true }).success, false, 'a draft is confirmed once');
});

test('ability flow: unsafe or invalid definitions are rejected with reasons and cannot be confirmed', async () => {
  const { repo, actorId } = repoWithStory('draft_bad');
  const service = new AbilityDraftService();
  const unsafe = await service.propose({ repository: repo, storyId: 'draft_bad', actorId, description: 'Infinite damage.', definition: { ...blackHole, damageFormula: '9999d9999' } });
  assert.equal(unsafe.status, 'REJECTED');
  assert.ok(unsafe.reasons.length > 0);
  assert.equal(service.confirm({ repository: repo, draftId: unsafe.id, playerConfirmed: true }).success, false);

  const empty = await service.propose({ repository: repo, storyId: 'draft_bad', actorId, description: '   ' });
  assert.equal(empty.status, 'REJECTED');
  assert.equal(service.discard(unsafe.id), true);
});

test('ability flow: a world-scale ability is previewed as a macro event, never applied by the draft', async () => {
  const { repo, actorId } = repoWithStory('draft_world');
  const service = new AbilityDraftService();
  const cataclysm = { id: 'cataclysm', name: 'City Cataclysm', resolutionMode: 'WORLD_EFFECT' as const, scale: 'CITY' as const, actionCost: 'ACTION' as const, targetingMode: 'ALL_IN_AREA' as const, outcome: 'WORLD_STATE_CHANGED' as const, outcomePayload: { change: 'district_ablaze' } };
  const draft = await service.propose({ repository: repo, storyId: 'draft_world', actorId, description: 'Burn the city.', definition: cataclysm });
  assert.equal(draft.preview?.abstraction, 'MACRO', draft.reasons.join(' '));
  assert.match(draft.preview?.summary || '', /without mutating the live world/);
});
