import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

/**
 * The same bout, fought by a veteran strong enough to win it. This is the victory path of the arena through the real routes:
 * the champion changes phase at half health (his reinforced attack, a resource pool, a tougher stance), the fight ends with his
 * defeat, and his gear lies on the sand to be taken. The AI model is stubbed: the engine is what is under test.
 */

const ROOT = process.cwd();
const CONFIG = path.join(ROOT, 'server/data/orchestrator_config.json');
const realFetch = globalThis.fetch;
const configBackup = fs.existsSync(CONFIG) ? fs.readFileSync(CONFIG) : null;
const storyId = 'arena_rematch_fixed';
let base = '';
let server: any;
let repo: any;
let playerId = '';
const timeline: string[] = [];

const post = async (route: string, body: Record<string, unknown> = {}) => {
  const started = performance.now();
  const response = await realFetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Story-ID': storyId }, body: JSON.stringify({ storyId, ...body }) });
  let json: any = null;
  try { json = await response.json(); } catch { /* not JSON */ }
  return { status: response.status, json, ms: performance.now() - started };
};
const getJson = async (route: string) => {
  const response = await realFetch(base + route, { headers: { 'X-Story-ID': storyId } });
  try { return await response.json(); } catch { return null; }
};

before(async () => {
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'stub-key';
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    const isModel = (url.includes('generativelanguage.googleapis.com') && /:(stream)?generateContent/i.test(url)) || (url.includes('api.groq.com') && url.includes('/chat/completions'));
    if (!isModel) return realFetch(input, init);
    const canned = JSON.stringify({ narrative: ['STUB'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [], visualCues: [] });
    const payload = url.includes('groq') ? { choices: [{ message: { content: canned } }] } : { candidates: [{ content: { parts: [{ text: canned }] }, finishReason: 'STOP' }] };
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

  await applyWorldPack(worldRepository, storyId, loadWorldPack(path.join(ROOT, 'data/worlds/ashen_cup.pack.json')));
  const run: any = worldRepository.getStoryRun(storyId);
  playerId = worldRepository.getPlayerLifecycle(storyId)!.actorId;
  worldRepository.saveStoryRun({
    ...run,
    dndRulesMode: 'HYBRID_DND',
    ruleset: 'HYBRID_DND',
    rulesProfile: { ...run.rulesProfile, mode: 'HYBRID_DND', ruleToggles: { 'casting.dnd_spell_rules': false, 'rest.long_rest': false } },
    protagonist: { ...(run.protagonist || {}), coreStats: { level: 10, armorClass: 12, speed: 30, hitDice: '1d10', hpCurrent: 280, hpMax: 280, strength: 20, dexterity: 14, constitution: 16, intelligence: 10, wisdom: 12, charisma: 10 } },
    characterCoreStats: { level: 10, hitDice: '1d10', constitution: 16, hpCurrent: 280, hpMax: 280 },
  });
  worldRepository.getConditionEngine(storyId).seedActor(playerId, { healthCurrent: 280, healthMax: 280 });
});

after(() => {
  globalThis.fetch = realFetch;
  server?.close();
  if (configBackup) fs.writeFileSync(CONFIG, configBackup);
  console.log('\nArena rematch timeline');
  for (const line of timeline) console.log('  ' + line);
});

let combatState: any;
const refresh = async () => { const state = await getJson('/combat/state'); combatState = state?.combatState || state; return combatState; };
const participant = (id: string) => (combatState?.participants || []).find((entry: any) => entry.id === id);

test('rematch: kit up, start the bout on the authored sand, roll initiative', async () => {
  const { SceneInteractionAuthority } = await import('../server/domain/sceneInteractionAuthority');
  const act = (text: string) => SceneInteractionAuthority.resolve({ repository: repo, storyId, actorId: playerId, locationId: 'loc_armoury_cage', actionText: text });
  assert.equal(act('I take the house gladius').committed, true);
  assert.equal(act('I take the iron buckler').committed, true);
  const inv = repo.getInventoryEngine(storyId);
  const mine = inv.getActorInventory(playerId);
  assert.equal((await post('/inventory/equip', { itemId: mine.find((i: any) => i.name === 'House Gladius').id, slot: 'mainHand' })).status, 200);
  assert.equal((await post('/inventory/equip', { itemId: mine.find((i: any) => i.name === 'Iron Buckler').id, slot: 'offHand' })).status, 200);

  const player = repo.getPlayerLifecycle(storyId);
  repo.updatePlayerLifecycle(storyId, player.copyWith({ locationId: 'loc_arena_sand' }));
  const started = await post('/combat/encounter/start', { enemyId: 'npc_gravus_thorne', enemyName: 'Gravus Thorne' });
  assert.equal(started.status, 200, JSON.stringify(started.json).slice(0, 300));
  const initiative = await post('/combat/initiative/roll', {});
  assert.equal(initiative.status, 200);
  await refresh();
  assert.equal(combatState.phase, 'ACTIVE');
  timeline.push(`${Math.round(started.ms)} ms to start the bout, ${Math.round(initiative.ms)} ms to roll initiative`);
});

test('rematch: fight to the end; the champion changes phase at half health and falls', async () => {
  const phases: string[] = [];
  let attacks = 0;
  let hits = 0;
  let totalDamage = 0;
  const started = performance.now();
  for (let guard = 0; guard < 120; guard += 1) {
    await refresh();
    if (combatState.victory || combatState.defeat) break;
    const gravus = participant('npc_gravus_thorne');
    const me = participant(playerId);
    if (gravus?.bossPhaseId && phases[phases.length - 1] !== gravus.bossPhaseId) phases.push(gravus.bossPhaseId);
    if (combatState.currentActor?.id !== playerId) {
      await post('/combat/npc-turn', {});
      continue;
    }
    const distance = Math.hypot(gravus.x - me.x, gravus.y - me.y);
    if (distance > 1.5) {
      const targetX = Math.max(me.x, Math.round(gravus.x - 1));
      await post('/combat/move', { targetX: Math.min(targetX, me.x + 5), targetY: gravus.y });
      await refresh();
    }
    const near = Math.hypot(participant('npc_gravus_thorne').x - participant(playerId).x, participant('npc_gravus_thorne').y - participant(playerId).y);
    if (near <= 1.5) {
      const attack = await post('/combat/attack', { targetId: 'npc_gravus_thorne' });
      if (attack.status === 200) {
        attacks += 1;
        if (attack.json?.hits) { hits += 1; totalDamage += Number(attack.json?.damage || 0); }
      }
    }
    await post('/combat/end-turn', {});
  }
  await refresh();
  const elapsed = performance.now() - started;
  timeline.push(`the bout: ${combatState.victory ? 'VICTORY' : combatState.defeat ? 'DEFEAT' : 'UNFINISHED'} after round ${combatState.currentRound}; ${hits}/${attacks} attacks hit for ${totalDamage}; champion phases seen: ${phases.join(' then ') || 'none'}; ${Math.round(elapsed)} ms of engine time`);
  assert.equal(Boolean(combatState.victory), true, 'the veteran wins');
  assert.equal(participant('npc_gravus_thorne').isDead, true);
  assert.deepEqual(phases, ['unhurried', 'desperate'], 'the champion changed phase once, at half health');
  assert.ok(hits >= 5, 'it took a real number of blows');
});

test('rematch: the champion\'s phase was real state: his resource pool and his unlocked ability came from the pack', async () => {
  const gravus = participant('npc_gravus_thorne');
  assert.equal(gravus.bossPhaseId, 'desperate');
  assert.ok((gravus.bossPhaseAbilities || []).includes('crushing_blow'));
  assert.ok(Object.prototype.hasOwnProperty.call(gravus.combatResources || {}, 'fury'), 'the fury pool was set when the phase began');
  const events = (await getJson('/combat/state'))?.combatState?.eventLog || [];
  assert.ok(Array.isArray(events));
});

test('rematch: the champion\'s gear lies on the sand and can be taken', async () => {
  const { SceneInteractionAuthority } = await import('../server/domain/sceneInteractionAuthority');
  const take = SceneInteractionAuthority.resolve({ repository: repo, storyId, actorId: playerId, locationId: 'loc_arena_sand', actionText: "I take the champion's broadsword" });
  assert.equal(take.committed, true);
  assert.ok(repo.getInventoryEngine(storyId).getActorInventory(playerId).some((item: any) => item.name === "Champion's Broadsword"));
  timeline.push("the champion's broadsword was taken from the sand");
});
