import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { WitnessFactAuthority } from '../server/domain/witnessFactAuthority';
import { worldRepository } from '../server/repositories/worldRepository';
import { seedE2eStory } from './e2e-test-helper';

describe('Co-located Witness Facts & Bidirectional Relationship Deltas (F19)', () => {
  const storyId = 'test_story_witness_rel';

  beforeEach(() => {
    seedE2eStory(storyId);
  });

  it('getPresentWitnesses authoritatively queries living, present characters at location and ignores dead/hidden/distant', () => {
    const registry = worldRepository.getEntityRegistry(storyId);

    // 1. Living present NPC at loc_market
    registry.upsert({
      id: 'npc_bystander_active',
      storyId,
      name: 'Active Bystander',
      kind: 'NPC',
      lifecycle: { status: 'ACTIVE' },
      worldState: { locationId: 'loc_market', isAlive: true, presence: 'present' },
      createdAt: new Date().toISOString(),
    });

    // 2. Dead NPC at loc_market
    registry.upsert({
      id: 'npc_deceased',
      storyId,
      name: 'Dead NPC',
      kind: 'NPC',
      lifecycle: { status: 'DEAD' },
      worldState: { locationId: 'loc_market', isAlive: false, presence: 'present' },
      createdAt: new Date().toISOString(),
    });

    // 3. Hidden NPC at loc_market
    registry.upsert({
      id: 'npc_stealthed',
      storyId,
      name: 'Stealthed Rogue',
      kind: 'NPC',
      lifecycle: { status: 'ACTIVE' },
      worldState: { locationId: 'loc_market', isAlive: true, presence: 'present' },
      metadata: { hidden: true },
      createdAt: new Date().toISOString(),
    });

    // 4. Distant NPC at loc_harbor
    registry.upsert({
      id: 'npc_distant_sailor',
      storyId,
      name: 'Distant Sailor',
      kind: 'NPC',
      lifecycle: { status: 'ACTIVE' },
      worldState: { locationId: 'loc_harbor', isAlive: true, presence: 'present' },
      createdAt: new Date().toISOString(),
    });

    const witnesses = worldRepository.getPresentWitnesses(storyId, 'loc_market', 'player_actor');
    const witnessIds = witnesses.map((w) => w.id);

    assert.ok(witnessIds.includes('npc_bystander_active'), 'Active bystander should be a witness');
    assert.ok(!witnessIds.includes('npc_deceased'), 'Dead NPC cannot witness actions');
    assert.ok(!witnessIds.includes('npc_stealthed'), 'Hidden NPC cannot be counted as visible witness');
    assert.ok(!witnessIds.includes('npc_distant_sailor'), 'Distant NPC cannot witness local actions');
    assert.ok(!witnessIds.includes('player_actor'), 'Actor is excluded from witnesses');
  });

  it('recordWitnessFact commits witness facts to co-located witnesses while distant NPCs remain unaware', () => {
    const registry = worldRepository.getEntityRegistry(storyId);

    registry.upsert({
      id: 'npc_present_clerk',
      storyId,
      name: 'Bank Clerk',
      kind: 'NPC',
      lifecycle: { status: 'ACTIVE' },
      worldState: { locationId: 'loc_bank', isAlive: true, presence: 'present' },
      createdAt: new Date().toISOString(),
    });

    registry.upsert({
      id: 'npc_distant_guard',
      storyId,
      name: 'Gate Guard',
      kind: 'NPC',
      lifecycle: { status: 'ACTIVE' },
      worldState: { locationId: 'loc_city_gate', isAlive: true, presence: 'present' },
      createdAt: new Date().toISOString(),
    });

    const result = worldRepository.recordWitnessFact(storyId, {
      storyId,
      turnId: 'turn_bank_heist_1',
      locationId: 'loc_bank',
      actorId: 'player_actor',
      actionText: 'I tamper with the vault lock using lockpicks.',
      predicate: 'TAMPER_LOCK',
      objectValue: 'vault_door_1',
      summary: 'Player tampered with the bank vault lock',
      actionCategory: 'CRIME',
    });

    assert.ok(result.witnessIds.includes('npc_present_clerk'));
    assert.ok(!result.witnessIds.includes('npc_distant_guard'));

    // Check epistemic facts
    const clerkFacts = worldRepository.getAuthorizedKnowledgeFacts(storyId, 'npc_present_clerk');
    const guardFacts = worldRepository.getAuthorizedKnowledgeFacts(storyId, 'npc_distant_guard');

    const clerkSawCrime = clerkFacts.some((f) => f.predicate === 'TAMPER_LOCK');
    const guardSawCrime = guardFacts.some((f) => f.predicate === 'TAMPER_LOCK');

    assert.equal(clerkSawCrime, true, 'Present clerk must know the crime');
    assert.equal(guardSawCrime, false, 'Distant guard must not magically know about crime');

    // Check memory reference on clerk entity card
    const clerkCard = registry.get('npc_present_clerk');
    assert.ok(clerkCard?.memoryRefs?.includes(result.factId));
  });

  it('bidirectional symmetric relationship deltas update both sides of character pair with 3-way synchronization', () => {
    const registry = worldRepository.getEntityRegistry(storyId);
    registry.upsert({
      id: 'char_alice',
      storyId,
      name: 'Alice',
      kind: 'NPC',
      lifecycle: { status: 'ACTIVE' },
      createdAt: new Date().toISOString(),
    });
    registry.upsert({
      id: 'char_bob',
      storyId,
      name: 'Bob',
      kind: 'NPC',
      lifecycle: { status: 'ACTIVE' },
      createdAt: new Date().toISOString(),
    });

    // Apply symmetric cooperation delta: +20 trust, +15 affection
    const result = worldRepository.applyBidirectionalRelationshipDelta(storyId, {
      partyAId: 'char_alice',
      partyBId: 'char_bob',
      eventId: 'event_mutual_rescue_1',
      cause: 'HEROIC_SAVE',
      description: 'Alice and Bob fought off wolves together.',
      symmetricDelta: { trust: 20, affection: 15 },
    });

    // Check DynamicCharacterAgency forward and backward
    assert.equal(result.forward.trust, 70); // 50 + 20
    assert.equal(result.forward.affection, 65); // 50 + 15
    assert.equal(result.backward.trust, 70);
    assert.equal(result.backward.affection, 65);

    // Check EntityCard.social.relationships for Alice -> Bob
    const aliceCard = registry.get('char_alice');
    const relAliceToBob = aliceCard?.social?.relationships?.['char_bob'];
    assert.ok(relAliceToBob);
    assert.equal(relAliceToBob?.trust, 70);
    assert.equal(relAliceToBob?.affection, 65);

    // Check EntityCard.social.relationships for Bob -> Alice
    const bobCard = registry.get('char_bob');
    const relBobToAlice = bobCard?.social?.relationships?.['char_alice'];
    assert.ok(relBobToAlice);
    assert.equal(relBobToAlice?.trust, 70);
    assert.equal(relBobToAlice?.affection, 65);

    // Verify query through repository
    const pair = worldRepository.getBidirectionalRelationship(storyId, 'char_alice', 'char_bob');
    assert.equal(pair.forward?.trust, 70);
    assert.equal(pair.backward?.trust, 70);
  });

  it('bidirectional asymmetric relationship deltas allow different emotional responses per character', () => {
    const registry = worldRepository.getEntityRegistry(storyId);
    registry.upsert({
      id: 'char_ren',
      storyId,
      name: 'Ren Takahashi',
      kind: 'PLAYER',
      lifecycle: { status: 'ACTIVE' },
      createdAt: new Date().toISOString(),
    });
    registry.upsert({
      id: 'char_suspect',
      storyId,
      name: 'Shady Informant',
      kind: 'NPC',
      lifecycle: { status: 'ACTIVE' },
      createdAt: new Date().toISOString(),
    });

    // Ren aggressively interrogates and threatens suspect:
    // Ren -> Suspect: +10 hostility, -10 respect
    // Suspect -> Ren: +40 fear, +35 hostility, -30 trust, +30 suspicion
    const result = worldRepository.applyBidirectionalRelationshipDelta(storyId, {
      partyAId: 'char_ren',
      partyBId: 'char_suspect',
      eventId: 'event_harsh_interrogation',
      cause: 'INTERROGATION',
      description: 'Ren backed the informant into a wall and issued an ultimatum.',
      forwardDelta: { hostility: 10, respect: -10 },
      backwardDelta: { fear: 40, hostility: 35, trust: -30, suspicion: 30 },
    });

    // Ren (partyA) -> Suspect (partyB)
    assert.equal(result.forward.fear, 0, 'Ren should not fear the suspect');
    assert.equal(result.forward.hostility, 10);
    assert.equal(result.forward.respect, 40); // 50 - 10

    // Suspect (partyB) -> Ren (partyA)
    assert.equal(result.backward.fear, 40, 'Suspect must fear Ren');
    assert.equal(result.backward.hostility, 35);
    assert.equal(result.backward.trust, 20); // 50 - 30
    assert.equal(result.backward.suspicion, 30); // 0 + 30

    // Verify EntityCard sync
    const suspectCard = registry.get('char_suspect');
    const suspectToRen = suspectCard?.social?.relationships?.['char_ren'];
    assert.equal(suspectToRen?.fear, 40);
    assert.equal(suspectToRen?.suspicion, 30);
  });

  it('criminal actions in presence of witness apply witness reaction deltas (suspicion and hostility)', () => {
    const registry = worldRepository.getEntityRegistry(storyId);
    registry.upsert({
      id: 'npc_shopkeeper',
      storyId,
      name: 'Shopkeeper Marcus',
      kind: 'NPC',
      lifecycle: { status: 'ACTIVE' },
      worldState: { locationId: 'loc_general_store', isAlive: true, presence: 'present' },
      createdAt: new Date().toISOString(),
    });

    // Player steals an expensive jewel in front of the shopkeeper
    const result = worldRepository.recordWitnessFact(storyId, {
      storyId,
      turnId: 'turn_theft_1',
      locationId: 'loc_general_store',
      actorId: 'player_actor',
      actionText: 'I snatch the sapphire from the display case and pocket it.',
      predicate: 'STOLE_ITEM',
      objectValue: 'sapphire_gem',
      summary: 'Player stole the sapphire gem from the store',
      actionCategory: 'CRIME',
      socialDeltas: {
        witnessDelta: {
          suspicion: 50,
          hostility: 40,
          trust: -35,
          fear: 20,
        },
      },
    });

    assert.ok(result.relationshipChanges.length > 0);
    const shopkeeperReaction = result.relationshipChanges.find((r) => r.sourceId === 'npc_shopkeeper');
    assert.ok(shopkeeperReaction);
    assert.equal(shopkeeperReaction?.metrics.suspicion, 50);
    assert.equal(shopkeeperReaction?.metrics.hostility, 40);
    assert.equal(shopkeeperReaction?.metrics.trust, 15); // 50 - 35
  });

  it('relationships and witness facts persist across StoryRun export and reload', () => {
    const registry = worldRepository.getEntityRegistry(storyId);
    registry.upsert({
      id: 'npc_partner_1',
      storyId,
      name: 'Detective Partner',
      kind: 'NPC',
      lifecycle: { status: 'ACTIVE' },
      createdAt: new Date().toISOString(),
    });

    worldRepository.applyBidirectionalRelationshipDelta(storyId, {
      partyAId: 'player_actor',
      partyBId: 'npc_partner_1',
      eventId: 'event_bond_1',
      cause: 'COOPERATION',
      description: 'Shared case notes.',
      symmetricDelta: { trust: 25, respect: 20 },
    });

    // Export StoryRun state
    const run = worldRepository.getStoryRun(storyId)!;
    const serializedRuntime = JSON.parse(JSON.stringify(run.runtimeState));

    // Create a new fresh story session and restore state
    const newStoryId = 'test_story_witness_rel_reloaded';
    seedE2eStory(newStoryId);
    const newRun = worldRepository.getStoryRun(newStoryId)!;
    newRun.runtimeState = serializedRuntime;
    worldRepository.saveStoryRun(newRun);

    // Verify agency rehydrates and returns identical relationships
    const agency = worldRepository.getDynamicCharacterAgencyEngine(newStoryId);
    const rel = agency.getRelationship(newStoryId, 'player_actor', 'npc_partner_1');
    assert.ok(rel);
    assert.equal(rel?.trust, 75); // 50 + 25
    assert.equal(rel?.respect, 70); // 50 + 20
  });
});
