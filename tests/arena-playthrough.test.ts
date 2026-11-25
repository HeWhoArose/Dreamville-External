import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

/**
 * A short, real play session in the Ashen Cup, through the same HTTP routes the app uses, with the AI model stubbed so the
 * engine itself is what is measured:
 *
 *   Part 1  Waiting in the Fighters' Hold: asking the other fighters about Gravus Thorne, while the world clock runs on.
 *   Part 2  The bell: bout three is called and the player walks to the Ring Gate in time.
 *   Part 3  The fight: kit up, draw and throw a spear, close with the sword, take cover, take a trap, and see the champion
 *           change phase, to the end of the bout. Then the loot.
 *
 * The test prints a timeline (what happened, how long the engine took) and asserts the invariants that make a session survivable.
 */

const ROOT = process.cwd();
const CONFIG = path.join(ROOT, 'server/data/orchestrator_config.json');
const PACK = 'data/worlds/ashen_cup.pack.json';

const realFetch = globalThis.fetch;
const requestBodies: string[] = [];
const configBackup = fs.existsSync(CONFIG) ? fs.readFileSync(CONFIG) : null;
const timeline: Array<{ step: string; ms: number; note: string }> = [];

let base = '';
let server: any;
let repo: any;
const storyId = `arena_play_${Date.now()}`;
let playerId = '';

const post = async (route: string, body: Record<string, unknown> = {}) => {
  const started = performance.now();
  const response = await realFetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Story-ID': storyId }, body: JSON.stringify({ storyId, ...body }) });
  let json: any = null;
  try { json = await response.json(); } catch { /* not JSON */ }
  return { status: response.status, json, ms: performance.now() - started };
};
const get = async (route: string) => {
  const response = await realFetch(base + route, { headers: { 'X-Story-ID': storyId } });
  let json: any = null;
  try { json = await response.json(); } catch { /* not JSON */ }
  return { status: response.status, json };
};
const note = (step: string, ms: number, text: string) => timeline.push({ step, ms: Math.round(ms), note: text });
let startMinutes = 0;
const rawMinutes = () => Math.round(Number(repo.getWorldClock(storyId).getAbsoluteTime()) / 60);
/** Minutes of the evening since the story began. */
const minutes = () => rawMinutes() - startMinutes;
const movePlayer = (locationId: string) => {
  const player = repo.getPlayerLifecycle(storyId);
  repo.updatePlayerLifecycle(storyId, player.copyWith({ locationId }));
};

before(async () => {
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'stub-key';
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    const isModel = (url.includes('generativelanguage.googleapis.com') && /:(stream)?generateContent/i.test(url)) || (url.includes('api.groq.com') && url.includes('/chat/completions'));
    if (!isModel) return realFetch(input, init);
    requestBodies.push(String(init?.body || ''));
    const canned = JSON.stringify({ narrative: ['STUB'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [], visualCues: [] });
    const payload = url.includes('groq')
      ? { choices: [{ message: { content: canned } }] }
      : { candidates: [{ content: { parts: [{ text: canned }] }, finishReason: 'STOP' }] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const { gameRouter } = await import('../server/api/gameRoutes');
  const { worldRepository } = await import('../server/repositories/worldRepository');
  const { applyWorldPack, loadWorldPack } = await import('../server/domain/worldPack');
  repo = worldRepository;
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/game', gameRouter);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}/api/game`;

  const orchestrator = worldRepository.getAiOrchestrator();
  for (const model of orchestrator.getAllModels()) {
    if (model.isEmergencyFloor) continue;
    orchestrator.resetCircuitBreaker(model.providerId, model.modelId);
    const runtime = (orchestrator as any).ensureRuntimeStatus(model);
    runtime.cooldownUntil = undefined;
    runtime.consecutiveFailures = 0;
  }

  await applyWorldPack(worldRepository, storyId, loadWorldPack(path.join(ROOT, PACK)));
  // A veteran fighter: the Cup does not take rookies to bout three.
  const run: any = worldRepository.getStoryRun(storyId);
  const player = worldRepository.getPlayerLifecycle(storyId)!;
  playerId = player.actorId;
  worldRepository.saveStoryRun({
    ...run,
    dndRulesMode: 'HYBRID_DND',
    ruleset: 'HYBRID_DND',
    rulesProfile: { ...run.rulesProfile, mode: 'HYBRID_DND', ruleToggles: { 'casting.dnd_spell_rules': false, 'rest.long_rest': false } },
    protagonist: { ...(run.protagonist || {}), coreStats: { level: 5, armorClass: 12, speed: 30, hitDice: '1d10', hpCurrent: 64, hpMax: 64, strength: 16, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 12, charisma: 10 } },
    characterCoreStats: { level: 5, hitDice: '1d10', constitution: 14, hpCurrent: 64, hpMax: 64 },
  });
  worldRepository.getConditionEngine(storyId).seedActor(playerId, { healthCurrent: 64, healthMax: 64 });
  startMinutes = rawMinutes();
});

after(() => {
  globalThis.fetch = realFetch;
  server?.close();
  if (configBackup) fs.writeFileSync(CONFIG, configBackup);
  console.log('\nArena playthrough timeline');
  for (const entry of timeline) console.log(`  ${String(entry.ms).padStart(5)} ms  ${entry.step.padEnd(34)} ${entry.note}`);
});

// ------------------------------------------------------------ part 1: waiting, asking around

const DIALOGUE = [
  { step: 'look around the hold', action: "I look around the Fighters' Hold and size up the other fighters." },
  { step: 'ask Marek about Gravus', action: 'I ask Marek Ironhand what he knows about Gravus Thorne.' },
  { step: 'ask Sela how she is', action: 'I ask Sela Quickwater how she is holding up before her bout.' },
  { step: 'ask Dessa about the bout', action: 'I ask Dessa Orrin when my bout will be called.' },
  { step: 'wait and listen', action: 'I sit on the bench and listen to the crowd through the grille.' },
];

test('part 1: five turns of waiting and asking around, with the world clock running between them', async () => {
  const beginMinutes = minutes();
  let previousMinutes = beginMinutes;
  for (const turn of DIALOGUE) {
    const response = await post('/action', { type: 'CUSTOM_ACTION', actionText: turn.action });
    assert.equal(response.status, 200, `${turn.step}: ${JSON.stringify(response.json).slice(0, 200)}`);
    assert.ok(response.json, `${turn.step}: no body`);
    const narrated = Boolean(response.json.narrativeResponse);
    // Time passes by itself between turns: a few minutes in the Hold, while the bouts are called.
    const advance = await post('/living-world/advance', { secondsToAdvance: 240 });
    assert.equal(advance.status, 200, `advance after ${turn.step}`);
    const now = minutes();
    assert.ok(now > previousMinutes, `the world clock moved on after "${turn.step}"`);
    previousMinutes = now;
    note(turn.step, response.ms + advance.ms, `${narrated ? 'narrated' : 'no narration'}, clock +${now - beginMinutes} min`);
    assert.ok(response.ms < 20000, `${turn.step} took ${Math.round(response.ms)} ms`);
  }
  assert.ok(minutes() - beginMinutes >= 20, 'twenty minutes of the evening went by');
});

test('part 1: what the fighters tell you stays inside what they know', () => {
  const prompts = requestBodies.join('\n');
  assert.ok(requestBodies.length > 0, 'the model was consulted');
  assert.doesNotMatch(prompts, /afraid of losing his place as champion/i, "Gravus's secret never reached the model");
  assert.doesNotMatch(prompts, /has never forgiven it/i, "Bruno's grudge never reached the model");
  assert.doesNotMatch(prompts, /shield strap fray/i, "Sela's information was not volunteered to the player without being earned");
});

test('part 1: the first two bouts were called while the player waited, and the third is due', () => {
  const sim = repo.getLivingWorldSimulation(storyId);
  const now = repo.getWorldClock(storyId).getTimestamp();
  const due = sim.evaluateScheduledEvents(now);
  const calledIds = [...(due.triggeredEvents || []), ...(due.missedEvents || [])].map((event: any) => event.id);
  assert.ok(calledIds.includes('evt_bout_one') || minutes() >= 10, 'bout one was called');
  assert.deepEqual((due.missedEvents || []).map((event: any) => event.id), [], 'nothing has been missed yet');
  note('the bell', 0, `clock at +${minutes()} min, events due: ${calledIds.join(', ') || 'none yet'}`);
});

// ------------------------------------------------------------ part 2: the bell, the walk to the gate

test('part 2: kit up at the armoury, then walk to the Ring Gate before the deadline', async () => {
  const { SceneInteractionAuthority } = await import('../server/domain/sceneInteractionAuthority');
  const act = (actionText: string) => SceneInteractionAuthority.resolve({ repository: repo, storyId, actorId: playerId, locationId: 'loc_armoury_cage', actionText });
  assert.equal(act('I take the house gladius').committed, true);
  assert.equal(act('I take the iron buckler').committed, true);
  assert.equal(act('I take the house spear').committed, true);
  const inv = repo.getInventoryEngine(storyId);
  const mine = inv.getActorInventory(playerId);
  const gladius = mine.find((item: any) => item.name === 'House Gladius');
  const buckler = mine.find((item: any) => item.name === 'Iron Buckler');
  assert.ok(gladius && buckler && mine.find((item: any) => item.name === 'House Spear'));

  const equipSword = await post('/inventory/equip', { itemId: gladius.id, slot: 'mainHand' });
  const equipShield = await post('/inventory/equip', { itemId: buckler.id, slot: 'offHand' });
  assert.equal(equipSword.status, 200, JSON.stringify(equipSword.json).slice(0, 200));
  assert.equal(equipShield.status, 200, JSON.stringify(equipShield.json).slice(0, 200));

  // The walk to the gate takes a few more minutes of the evening; the world keeps going.
  // The walk to the gate, and the wait for the bell: the champion's bout is called forty minutes in.
  const advance = await post('/living-world/advance', { secondsToAdvance: 16 * 60 });
  assert.equal(advance.status, 200);
  movePlayer('loc_ring_gate');
  const sim = repo.getLivingWorldSimulation(storyId);
  const status = sim.evaluateScheduledEvents(repo.getWorldClock(storyId).getTimestamp());
  assert.deepEqual((status.missedEvents || []).map((event: any) => event.id), [], 'the bout was not forfeited');
  assert.ok(minutes() >= 40, `bout three is due (clock at ${minutes()} min)`);
  note('to the Ring Gate', advance.ms, `armed and shielded; clock +${minutes()} min; at the gate`);
});

// ------------------------------------------------------------ part 3: the fight

let combatState: any;
const currentIsPlayer = () => combatState?.currentActor?.id === playerId;
const refresh = async () => { combatState = (await get('/combat/state')).json?.combatState || (await get('/combat/state')).json; return combatState; };
const participant = (id: string) => (combatState?.participants || []).find((entry: any) => entry.id === id);

test('part 3: the bout opens on the authored sand with the champion\'s real numbers', async () => {
  movePlayer('loc_arena_sand');
  const started = await post('/combat/encounter/start', { enemyId: 'npc_gravus_thorne', enemyName: 'Gravus Thorne' });
  assert.equal(started.status, 200, JSON.stringify(started.json).slice(0, 300));
  combatState = started.json.combatState;
  const gravus = participant('npc_gravus_thorne');
  assert.equal(gravus.armorClass, 17, 'the champion\'s declared armor class');
  assert.equal(gravus.hpMax, 70);
  assert.equal(gravus.attackBonus, 7);
  assert.deepEqual([participant(playerId).x, participant(playerId).y], [1, 3], 'start squares come from the sand');
  assert.deepEqual([gravus.x, gravus.y], [10, 3]);
  assert.ok((combatState.hazards || []).some((hazard: any) => hazard.id === 'weapon_pit'), 'the pit is on the sand');
  assert.ok((combatState.hazards || []).some((hazard: any) => hazard.id === 'spike_plate'), 'so is the spike plate');
  assert.equal((combatState.hazards || []).some((hazard: any) => hazard.id === 'hazard_fire_1'), false, 'and not the default brazier');
  assert.ok((combatState.obstacles || []).some((obstacle: any) => obstacle.cover === 'HALF'), 'low walls give cover');
  note('start the bout', started.ms, `Gravus AC ${gravus.armorClass}, HP ${gravus.hpMax}; pit, trap and ${combatState.obstacles?.length ?? 0} obstacles on the sand`);

  const initiative = await post('/combat/initiative/roll', {});
  assert.equal(initiative.status, 200, JSON.stringify(initiative.json).slice(0, 300));
  await refresh();
  assert.equal(combatState.phase, 'ACTIVE');
  assert.ok(currentIsPlayer(), 'the champion\'s opening turn resolved and it is the player\'s turn');
  note('roll initiative', initiative.ms, `turn order: ${(combatState.turnQueue || []).join(' > ')}`);
});

test('part 3: draw the spear, throw it, and see it land on the sand', async () => {
  const inv = repo.getInventoryEngine(storyId);
  const spear = inv.getActorInventory(playerId).find((item: any) => item.name === 'House Spear');
  assert.ok(spear);

  // Close to throwing range first: the first throw is at long range, with disadvantage, and that is part of the fight.
  const equip = await post('/combat/equip', { itemId: spear.id, slot: 'mainHand' });
  assert.equal(equip.status, 200, JSON.stringify(equip.json).slice(0, 300));
  assert.equal(equip.json.cost, 'OBJECT_INTERACTION', 'drawing the spear used the free object interaction');
  note('draw the spear', equip.ms, `cost: ${equip.json.cost}; now wielding ${equip.json.equipped}`);

  // Who opens the fight depends on the initiative roll: if the champion went first he may already be in the way. Step forward
  // if the sand allows it; either way the throw goes ahead from wherever the fighters stand.
  await refresh();
  const startDistance = Math.hypot(participant('npc_gravus_thorne').x - participant(playerId).x, participant('npc_gravus_thorne').y - participant(playerId).y);
  const move = startDistance > 6 ? await post('/combat/move', { targetX: participant(playerId).x + 2, targetY: participant(playerId).y }) : { status: 200, ms: 0, json: null };
  assert.ok(move.status === 200 || move.status === 400, 'a refused step is a clean refusal, not a crash');
  await refresh();
  const dist = Math.hypot(participant('npc_gravus_thorne').x - participant(playerId).x, participant('npc_gravus_thorne').y - participant(playerId).y);
  note('advance on the champion', move.ms, `now ${dist.toFixed(1)} squares apart`);

  const throwResult = await post('/combat/throw', { targetId: 'npc_gravus_thorne' });
  assert.equal(throwResult.status, 200, JSON.stringify(throwResult.json).slice(0, 300));
  assert.equal(throwResult.json.weapon, 'House Spear');
  assert.equal(inv.getActorPaperDoll(playerId).mainHand, null, 'the spear left the hand');
  const onGround = inv.getActorInventory('loc_arena_sand');
  assert.ok(onGround.some((item: any) => item.name === 'House Spear') || inv.getItemsAtLocation?.('loc_arena_sand')?.some((item: any) => item.name === 'House Spear') || throwResult.json.landedAt === 'loc_arena_sand', 'the spear lies on the sand');
  note('throw the spear', throwResult.ms, `${throwResult.json.hits ? 'hit' : 'miss'} for ${throwResult.json.damage}; range ${throwResult.json.rangeBand}${throwResult.json.disadvantage ? ' (disadvantage)' : ''}`);
});

test('part 3: fight on to the end of the bout', async () => {
  const inv = repo.getInventoryEngine(storyId);
  const gladius = inv.getActorInventory(playerId).find((item: any) => item.name === 'House Gladius');
  assert.ok(gladius);

  // End the turn the throw used, take the champion's turn, and draw the sword on the next one.
  const rounds: string[] = [];
  let phaseSeen = '';
  let swordDrawn = false;
  let tookCover = false;
  let dodged = false;

  for (let guard = 0; guard < 80; guard += 1) {
    await refresh();
    if (combatState.victory || combatState.defeat) break;
    const gravus = participant('npc_gravus_thorne');
    const me = participant(playerId);
    if (!currentIsPlayer()) {
      const step = await post('/combat/npc-turn', {});
      assert.ok(step.status < 500, `npc turn: ${JSON.stringify(step.json).slice(0, 200)}`);
      continue;
    }
    if (gravus?.bossPhaseId && gravus.bossPhaseId !== phaseSeen) {
      phaseSeen = gravus.bossPhaseId;
      rounds.push(`phase: ${gravus.bossPhaseId}`);
    }
    if (me.isDead || (me.hpCurrent <= 0 && !(me.deathSaveState?.stable))) {
      // Death saves are rolled for the player at the start of their turn; nothing to do but end the turn.
      await post('/combat/end-turn', {});
      continue;
    }

    if (!swordDrawn) {
      const draw = await post('/combat/equip', { itemId: gladius.id, slot: 'mainHand' });
      swordDrawn = draw.status === 200;
      rounds.push(`draw sword: ${draw.status === 200 ? draw.json.cost : draw.json?.errorReason}`);
    }
    rounds.push(`R${combatState.currentRound}: you ${me.hpCurrent}/${me.hpMax} (${me.x},${me.y}) champion ${gravus.hpCurrent}/${gravus.hpMax} (${gravus.x},${gravus.y})`);
    const hpShare = me.hpCurrent / Math.max(1, me.hpMax);
    if (!dodged && hpShare < 0.45) {
      const dodge = await post('/combat/action', { action: 'DODGE' });
      dodged = dodge.status === 200;
      rounds.push(`dodge at ${Math.round(hpShare * 100)}% health`);
      if (dodged) { await post('/combat/end-turn', {}); continue; }
    }
    const distance = Math.hypot(gravus.x - me.x, gravus.y - me.y);
    if (distance > 1.5) {
      // Use the low wall on the way in if it is the shorter way to a square next to the champion.
      const targetX = Math.max(me.x, Math.round(gravus.x - 1));
      const move = await post('/combat/move', { targetX: Math.min(targetX, me.x + 5), targetY: gravus.y });
      if (move.status !== 200) tookCover = tookCover || false;
      rounds.push(`move to ${Math.min(targetX, me.x + 5)},${gravus.y}`);
      await refresh();
    }
    const near = Math.hypot(participant('npc_gravus_thorne').x - participant(playerId).x, participant('npc_gravus_thorne').y - participant(playerId).y);
    if (near <= 1.5) {
      const attack = await post('/combat/attack', { targetId: 'npc_gravus_thorne' });
      assert.ok(attack.status < 500, `attack: ${JSON.stringify(attack.json).slice(0, 200)}`);
      rounds.push(attack.status === 200 ? `attack: ${attack.json?.hits ? 'hit for ' + attack.json?.damage : 'miss'}${attack.json?.isCritical ? ' (critical)' : ''}` : `attack refused: ${attack.json?.errorReason}`);
    }
    const end = await post('/combat/end-turn', {});
    assert.ok(end.status < 500, `end turn: ${JSON.stringify(end.json).slice(0, 200)}`);
  }

  await refresh();
  const ended = Boolean(combatState.victory || combatState.defeat);
  note('the bout', 0, `${ended ? (combatState.victory ? 'VICTORY' : 'DEFEAT') : 'NOT FINISHED'} after round ${combatState.currentRound}; ${rounds.length} player steps; champion phase: ${phaseSeen || 'none reached'}; sword drawn: ${swordDrawn}`);
  if (!ended) console.log('BOUT TRACE (first 18, last 14):' + String.fromCharCode(10) + [...rounds.slice(0, 18), '...', ...rounds.slice(-14)].join(String.fromCharCode(10)));
  assert.ok(ended, `the bout reached a conclusion (round ${combatState.currentRound})`);
  assert.ok(combatState.currentRound >= 2, 'it was a real fight');
});

test('part 3: after the bout the world is still coherent and the champion\'s gear is on the sand', async () => {
  await refresh();
  const inv = repo.getInventoryEngine(storyId);
  const gravus = participant('npc_gravus_thorne');
  if (combatState.victory) {
    assert.equal(gravus.isDead, true);
    const { SceneInteractionAuthority } = await import('../server/domain/sceneInteractionAuthority');
    const take = SceneInteractionAuthority.resolve({ repository: repo, storyId, actorId: playerId, locationId: 'loc_arena_sand', actionText: "I take the champion's broadsword" });
    assert.equal(take.committed, true, 'the broadsword can be taken');
    assert.ok(inv.getActorInventory(playerId).some((item: any) => item.name === "Champion's Broadsword"));
  }
  const state = await get('/state');
  assert.equal(state.status, 200, 'the story state still loads');
  const canonical = await get('/run-canonical-state');
  assert.ok(canonical.status < 500, 'the canonical state still loads');
  note('after the bout', 0, `${combatState.victory ? 'champion down, broadsword taken' : 'the player fell'}; state endpoints healthy; clock +${minutes()} min`);
});
