import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { StoryActionAdvisor } from '../server/services/storyActionAdvisor';

function seedRun(
  repository: InMemoryWorldRepository,
  storyId: string,
  worldId: string,
  role: string,
  background: string,
): void {
  repository.saveWorldTemplate({
    worldId,
    title: worldId,
    description: 'Test world',
    genreTags: [],
    worldRules: [],
    customRules: [],
    capabilities: [],
    canonicalCapabilities: [],
  });

  repository.saveStoryRun({
    storyId,
    id: storyId,
    worldId,
    characterName: 'Test Hero',
    characterRole: role,
    storyMode: 'PROTAGONIST',
    dndRulesMode: 'FULL_DND',
    protagonist: {
      characterId: 'player_' + storyId,
      identity: { name: 'Test Hero', species: 'Human' },
      role: { profession: role, archetype: role },
      personality: { traits: [], motivations: [] },
      background: { history: background, summary: background },
      capabilities: [],
    },
    runtimeState: {},
  });
}

test('novel world-scale request enters dry-run simulation without acquisition', async () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const storyId = 'novel_world_scale';
  seedRun(
    repository,
    storyId,
    'primordial_test_world',
    'Dark Knight',
    'A dark knight with established primordial dimensional power.',
  );
  const world = repository.getWorldTemplate('primordial_test_world');
  world.worldRules = ['World-scale metaphysical severance is allowed.'];
  world.metaphysics = ['Dimensional severance is a canonical effect.'];
  repository.saveWorldTemplate(world);

  const advisor = new StoryActionAdvisor(repository);
  const result = await advisor.advise(storyId, 'I split the world in two');

  assert.equal(result.canExecuteNow, false);
  assert.ok(result.simulation);
  assert.equal(result.simulation?.internalOnly, true);
  assert.equal(
    repository.getEffectiveActorCapabilities(
      repository.getPlayerLifecycle(storyId)?.actorId || 'player_actor_' + storyId,
    ).length,
    0,
  );
});

test('teleport remains world-forbidden in a bending-only world even for a novel request', async () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const storyId = 'novel_teleport_forbidden';
  seedRun(
    repository,
    storyId,
    'bending_world',
    'Earthbender',
    'A disciplined earthbender trained only in earthbending.',
  );
  const world = repository.getWorldTemplate('bending_world');
  world.genreTags = ['Avatar'];
  world.worldRules = ['Only elemental bending techniques are canonical.'];
  world.ruleConstraints = ['Teleportation cannot exist in this world.'];
  world.forbiddenContradictions = ['No spellcasting or dimensional magic.'];
  world.magicSystems = [];
  repository.saveWorldTemplate(world);

  const advisor = new StoryActionAdvisor(repository);
  const result = await advisor.advise(storyId, 'I teleport behind the guard');

  assert.equal(result.mode, 'CAPABILITY_SIMULATION');
  assert.equal(result.canExecuteNow, false);
  assert.equal(result.simulation?.status, 'WORLD_FORBIDDEN');
  assert.equal(result.proposal, undefined);
});

test('earthbender lightning request is blocked by character capability even when the world permits lightning as a bending branch', async () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const storyId = 'novel_lightning_earthbender';
  seedRun(
    repository,
    storyId,
    'bending_lightning_world',
    'Earthbender',
    'A disciplined earthbender with no firebending or Avatar lineage.',
  );
  const world = repository.getWorldTemplate('bending_lightning_world');
  world.genreTags = ['Avatar'];
  world.worldRules = ['Elemental bending is canonical.'];
  repository.saveWorldTemplate(world);

  const advisor = new StoryActionAdvisor(repository);
  const result = await advisor.advise(storyId, 'I cast Lightning Bolt');

  assert.notEqual(result.mode, 'EXECUTE_EXISTING');
  assert.equal(result.canExecuteNow, false);
  assert.ok(result.simulation);
  assert.ok(
    result.mode === 'CAPABILITY_SIMULATION' ||
    result.mode === 'SUGGEST_ALTERNATIVE',
  );
  if (result.proposal) {
    assert.doesNotMatch(result.proposal.alternative.name, /lightning/i);
  }
  if (!result.proposal) {
    assert.equal(result.simulation?.characterCompatible, false);
  }
});

test('ordinary action does not enter capability simulation just because it mentions a weapon', async () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const storyId = 'ordinary_action';
  seedRun(repository, storyId, 'plain_world', 'Knight', 'A mundane swordsman.');

  const advisor = new StoryActionAdvisor(repository);
  const result = await advisor.advise(storyId, 'I draw my sword and walk toward the gate');

  assert.equal(result.mode, 'NORMAL_ACTION');
  assert.equal(result.canExecuteNow, true);
  assert.equal(result.simulation, undefined);
});

test('ten repeated forbidden novel requests never create a capability', async () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const storyId = 'ten_pass_forbidden';
  seedRun(
    repository,
    storyId,
    'bending_forbidden',
    'Earthbender',
    'A disciplined earthbender.',
  );
  const world = repository.getWorldTemplate('bending_forbidden');
  world.genreTags = ['Avatar'];
  world.worldRules = ['Only elemental bending techniques are canonical.'];
  world.ruleConstraints = ['Teleportation does not exist.'];
  repository.saveWorldTemplate(world);

  const advisor = new StoryActionAdvisor(repository);
  for (let pass = 1; pass <= 10; pass += 1) {
    const result = await advisor.advise(storyId, 'I teleport across the city');
    assert.equal(result.canExecuteNow, false, 'pass ' + pass);
    assert.equal(result.simulation?.status, 'WORLD_FORBIDDEN', 'pass ' + pass);
    assert.equal(result.proposal, undefined, 'pass ' + pass);
    assert.equal(
      repository.getEffectiveActorCapabilities(
        repository.getPlayerLifecycle(storyId)?.actorId || 'player_actor_' + storyId,
      ).length,
      0,
      'pass ' + pass,
    );
  }
});
