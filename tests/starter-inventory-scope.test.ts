import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

/**
 * A story that defines no starting equipment must not inherit the built-in demo's fantasy kit
 * (longsword, cuirass, astrolabe, veil). Only the default Scribe Vael demo story gets it.
 */
function carried(repo: InMemoryWorldRepository, storyId: string): string[] {
  const actorId = repo.getPlayerLifecycle(storyId)!.actorId;
  return repo.getInventoryEngine(storyId).getActorInventory(actorId).map((i: any) => String(i.defId));
}

test('a premise-driven story without starting equipment starts with an empty inventory', () => {
  const repo = new InMemoryWorldRepository({ disablePersistence: true });
  repo.seedStory('starter_scope_noir');
  assert.deepEqual(carried(repo, 'starter_scope_noir'), []);
});

test('the built-in default demo story keeps its Chancery kit', () => {
  const repo = new InMemoryWorldRepository({ disablePersistence: true });
  repo.seedStory('default_story');
  const defs = carried(repo, 'default_story');
  assert.ok(defs.includes('def_iron_sword'), 'demo story keeps its longsword');
  assert.ok(defs.includes('def_steel_cuirass'), 'demo story keeps its cuirass');
});
