import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DynamicCharacterAgencyEngine,
  type DynamicRelationshipState,
  type RelationshipDelta,
  type DynamicCharacterAgencyState,
} from '../server/domain/dynamicCharacterAgency';
import {
  InMemoryWorldRepository,
  worldRepository,
} from '../server/repositories/worldRepository';
import { CharacterCanonSteward } from '../server/domain/characterCanonSteward';
import { seedE2eStory } from './e2e-test-helper';

describe('Adversarial Verification — Persistence, 3-Way Sync & Re-keying (Challenger 2)', () => {
  /* =========================================================================
   * 1. IMPORT STATE & RE-KEYING EMPIRICAL VERIFICATION
   * ========================================================================= */
  describe('1. DynamicCharacterAgencyEngine.importState Re-keying Behavior', () => {
    it('1.1 When targetStoryId is provided, state from story X imported into story Y gets correctly re-keyed and accessible under story Y', () => {
      const sourceEngine = new DynamicCharacterAgencyEngine();
      const sourceStoryId = 'story_source_alpha';

      // Setup characters and relationship in source engine
      sourceEngine.setRelationship(sourceStoryId, {
        sourceId: 'char_alice',
        targetId: 'char_bob',
        worldId: 'world_source',
        trust: 70,
        affection: 65,
        respect: 80,
        fear: 10,
        hostility: 5,
        suspicion: 15,
        activeCause: 'COOPERATION',
      });

      sourceEngine.recordBelief({
        storyId: sourceStoryId,
        characterId: 'char_alice',
        beliefId: 'belief_bob_trustworthy',
        proposition: 'Bob is trustworthy',
        believedValue: 'TRUE',
        confidence: 0.9,
        sourceEventIds: ['evt_coop_1'],
        timestampSeconds: 100,
      });

      const exportedState = sourceEngine.exportState();

      // Verify source state has keys prefixed with sourceStoryId
      assert.ok(exportedState.relationships[`${sourceStoryId}::char_alice::char_bob`]);
      assert.ok(exportedState.beliefs[`${sourceStoryId}::char_alice`]);

      // Now import into target story
      const targetEngine = new DynamicCharacterAgencyEngine();
      const targetStoryId = 'story_target_beta';
      targetEngine.importState(exportedState, targetStoryId);

      // 1. Target story queries must return the re-keyed state
      const targetRel = targetEngine.getRelationship(targetStoryId, 'char_alice', 'char_bob');
      assert.ok(targetRel, 'Relationship is accessible under targetStoryId');
      assert.equal(targetRel?.trust, 70);
      assert.equal(targetRel?.affection, 65);
      assert.equal(targetRel?.respect, 80);
      assert.equal(targetRel?.fear, 10);
      assert.equal(targetRel?.hostility, 5);
      assert.equal(targetRel?.suspicion, 15);

      const targetBeliefs = targetEngine.getBeliefs(targetStoryId, 'char_alice');
      assert.equal(targetBeliefs.length, 1, 'Beliefs are accessible under targetStoryId');
      assert.equal(targetBeliefs[0].beliefId, 'belief_bob_trustworthy');
      assert.equal(targetBeliefs[0].confidence, 0.9);

      // 2. Strict isolation: Querying sourceStoryId on targetEngine MUST return null / empty!
      const leakRel = targetEngine.getRelationship(sourceStoryId, 'char_alice', 'char_bob');
      assert.equal(leakRel, null, 'Source story query on targetEngine must return null (zero leak)');

      const leakBeliefs = targetEngine.getBeliefs(sourceStoryId, 'char_alice');
      assert.deepEqual(leakBeliefs, [], 'Source story beliefs on targetEngine must return empty array');
    });

    it('1.2 When targetStoryId is omitted/undefined, keys remain unmodified and lossless archival roundtrips succeed', () => {
      const engine = new DynamicCharacterAgencyEngine();
      const storyId = 'story_lossless_archive';

      engine.setRelationship(storyId, {
        sourceId: 'char_x',
        targetId: 'char_y',
        worldId: 'world_archive',
        trust: 85,
        affection: 40,
        respect: 90,
        fear: 25,
        hostility: 15,
        suspicion: 30,
        activeCause: 'COMPETITION',
      });

      engine.recordBelief({
        storyId,
        characterId: 'char_x',
        beliefId: 'belief_rival_intent',
        proposition: 'Rival is preparing a challenge',
        believedValue: 'TRUE',
        confidence: 0.8,
        sourceEventIds: ['evt_comp_1'],
        timestampSeconds: 50,
      });

      const initialExport = engine.exportState();

      // Import without targetStoryId
      const roundtripEngine = new DynamicCharacterAgencyEngine();
      roundtripEngine.importState(initialExport);
      const reExported = roundtripEngine.exportState();

      // Verify 100% deep equality (lossless roundtrip)
      assert.deepEqual(reExported, initialExport, 'Export without targetStoryId is 100% lossless');

      // Verify querying original story works directly
      const rel = roundtripEngine.getRelationship(storyId, 'char_x', 'char_y');
      assert.ok(rel);
      assert.equal(rel?.trust, 85);
      assert.equal(rel?.fear, 25);
    });

    it('1.3 Adversarial import: malformed, corrupted, missing fields, and partial schemas survive gracefully', () => {
      const engine = new DynamicCharacterAgencyEngine();

      // Case 1: null / undefined / non-object
      assert.doesNotThrow(() => engine.importState(null));
      assert.doesNotThrow(() => engine.importState(undefined));
      assert.doesNotThrow(() => engine.importState('not an object'));
      assert.doesNotThrow(() => engine.importState(12345));

      // Case 2: schemaVersion mismatch falls back to empty clean state
      engine.importState({ schemaVersion: 999, relationships: { corrupted: true } });
      assert.equal(engine.getRelationship('any', 'a', 'b'), null);

      // Case 3: partial corrupted relationships (missing sourceId/targetId, NaN metrics)
      const corruptedPayload = {
        schemaVersion: 1,
        characters: {
          'bad_char_key': null,
          'story_corrupt::valid_char': {
            characterId: 'valid_char',
            name: 'Valid',
            controlState: 'INVALID_CONTROL_STATE', // Should normalize to FREE
            goals: 'not an array', // Should fallback to empty array
          },
        },
        relationships: {
          'corrupted_rel_1': null,
          'corrupted_rel_2': {
            // missing sourceId & targetId but key has 3 parts
            id: 'rel_corrupt',
            trust: 'not_a_number', // NaN -> clampScore(NaN) -> fallback safe score
            fear: 99999, // Should clamp to 100
            hostility: -500, // Should clamp to 0
          },
          'story_corrupt::source_c::target_c': {
            sourceId: 'source_c',
            targetId: 'target_c',
            trust: 45,
            stance: 'NON_EXISTENT_STANCE', // Should fallback to deriveStance or NEUTRAL
          },
        },
        beliefs: {
          'corrupted_beliefs': 'not an array',
          'story_corrupt::char_b': [
            null,
            {
              beliefId: 'b1',
              characterId: 'char_b',
              confidence: 'high', // NaN -> 0
              status: 'WEIRD_STATUS', // normalizeBeliefStatus -> HELD
            },
          ],
        },
      };

      assert.doesNotThrow(() => {
        engine.importState(corruptedPayload, 'rekeyed_safe_story');
      });

      // Target story has sanitized state
      const rekeyedRel = engine.getRelationship('rekeyed_safe_story', 'source_c', 'target_c');
      assert.ok(rekeyedRel);
      assert.equal(rekeyedRel?.trust, 45);
      assert.equal(rekeyedRel?.stance, 'NEUTRAL');

      const rekeyedBeliefs = engine.getBeliefs('rekeyed_safe_story', 'char_b');
      assert.equal(rekeyedBeliefs.length, 1);
      assert.equal(rekeyedBeliefs[0].status, 'HELD');
      // When non-numeric confidence ('high') is imported, Number('high') yields NaN, which clones as null
      assert.equal(rekeyedBeliefs[0].confidence, null);
    });

    it('1.4 Scale & Stress: 50 relationships across a complex social graph re-key with zero loss or cross-talk', () => {
      const sourceEngine = new DynamicCharacterAgencyEngine();
      const srcStory = 'story_graph_origin';
      const characters = Array.from({ length: 10 }, (_, i) => `char_${i}`);

      // Create a directed clique of 45 relationships
      for (let i = 0; i < characters.length; i++) {
        for (let j = i + 1; j < characters.length; j++) {
          sourceEngine.setRelationship(srcStory, {
            sourceId: characters[i],
            targetId: characters[j],
            trust: 50 + (i * 3) - j,
            affection: 40 + i,
            respect: 60 - j,
            fear: i,
            hostility: j * 2,
            suspicion: (i + j) * 2,
            activeCause: 'CIRCUMSTANCE',
          });
        }
      }

      const exported = sourceEngine.exportState();
      assert.equal(Object.keys(exported.relationships).length, 45);

      // Re-key into target story
      const targetEngine = new DynamicCharacterAgencyEngine();
      const tgtStory = 'story_graph_rekeyed';
      targetEngine.importState(exported, tgtStory);

      // Verify all 45 relationships exist under target story with exact arithmetic
      for (let i = 0; i < characters.length; i++) {
        for (let j = i + 1; j < characters.length; j++) {
          const rel = targetEngine.getRelationship(tgtStory, characters[i], characters[j]);
          assert.ok(rel, `Relationship ${characters[i]} -> ${characters[j]} must exist`);
          assert.equal(rel?.trust, 50 + (i * 3) - j);
          assert.equal(rel?.affection, 40 + i);
          assert.equal(rel?.respect, 60 - j);
          assert.equal(rel?.fear, i);
          assert.equal(rel?.hostility, j * 2);
          assert.equal(rel?.suspicion, (i + j) * 2);

          // Zero leak check on source story
          assert.equal(
            targetEngine.getRelationship(srcStory, characters[i], characters[j]),
            null,
            'Must not leak under source story',
          );
        }
      }
    });
  });

  /* =========================================================================
   * 2. 3-WAY SYNCHRONIZATION INTEGRITY
   * ========================================================================= */
  describe('2. 3-Way Synchronization Across Agency, EntityRegistry, and ConsequenceEngine', () => {
    const storyId = 'story_3way_adv_sync';

    beforeEach(() => {
      seedE2eStory(storyId);
      CharacterCanonSteward.resetStory(storyId);
    });

    it('2.1 Triangle social dynamics: A<->B, B<->C, C<->A maintain synchronized isolation without metric bleed', () => {
      const registry = worldRepository.getEntityRegistry(storyId);
      ['char_A', 'char_B', 'char_C'].forEach((id) => {
        registry.upsert({
          id,
          storyId,
          name: `Character ${id}`,
          kind: 'NPC',
          lifecycle: { status: 'ACTIVE' },
          worldState: { locationId: 'loc_plaza', isAlive: true, presence: 'present' },
          social: { factionIds: [], reputation: {}, relationships: {} },
          createdAt: new Date().toISOString(),
        });
      });

      // 1. Delta A <-> B (Alliance)
      worldRepository.applyBidirectionalRelationshipDelta(storyId, {
        partyAId: 'char_A',
        partyBId: 'char_B',
        eventId: 'evt_triangle_ab',
        cause: 'COOPERATION',
        description: 'Alliance formed',
        symmetricDelta: { trust: 25, respect: 20 },
      });

      // 2. Delta B <-> C (Betrayal)
      worldRepository.applyBidirectionalRelationshipDelta(storyId, {
        partyAId: 'char_B',
        partyBId: 'char_C',
        eventId: 'evt_triangle_bc',
        cause: 'BETRAYAL',
        description: 'Trade agreement broken',
        symmetricDelta: { trust: -30, hostility: 40, suspicion: 35 },
      });

      // 3. Delta C <-> A (Suspicion / Secret investigation)
      worldRepository.applyBidirectionalRelationshipDelta(storyId, {
        partyAId: 'char_C',
        partyBId: 'char_A',
        eventId: 'evt_triangle_ca',
        cause: 'PLAYER_ACTION',
        description: 'Private surveillance',
        forwardDelta: { suspicion: 30, fear: 15 },
        backwardDelta: { suspicion: 10, hostility: 10 },
      });

      // Verification Layer 1: DynamicCharacterAgencyEngine
      const agency = worldRepository.getDynamicCharacterAgencyEngine(storyId);

      const relAB = agency.getBidirectionalRelationship(storyId, 'char_A', 'char_B');
      assert.equal(relAB.forward?.trust, 75); // 50 + 25
      assert.equal(relAB.forward?.respect, 70); // 50 + 20
      assert.equal(relAB.backward?.trust, 75);

      const relBC = agency.getBidirectionalRelationship(storyId, 'char_B', 'char_C');
      assert.equal(relBC.forward?.trust, 20); // 50 - 30
      assert.equal(relBC.forward?.hostility, 40);
      assert.equal(relBC.forward?.suspicion, 35);
      assert.equal(relBC.backward?.trust, 20);

      const relCA = agency.getBidirectionalRelationship(storyId, 'char_C', 'char_A');
      assert.equal(relCA.forward?.suspicion, 30); // C -> A
      assert.equal(relCA.forward?.fear, 15);
      assert.equal(relCA.backward?.suspicion, 10); // A -> C
      assert.equal(relCA.backward?.hostility, 10);

      // Verification Layer 2: EntityRegistry EntityCards
      const cardA = registry.get('char_A');
      const cardB = registry.get('char_B');
      const cardC = registry.get('char_C');

      // Card A checks
      assert.equal(cardA?.social?.relationships?.char_B?.trust, 75);
      assert.equal(cardA?.social?.relationships?.char_C?.suspicion, 10);
      assert.equal(cardA?.social?.relationships?.char_C?.hostility, 10);

      // Card B checks
      assert.equal(cardB?.social?.relationships?.char_A?.trust, 75);
      assert.equal(cardB?.social?.relationships?.char_C?.trust, 20);
      assert.equal(cardB?.social?.relationships?.char_C?.hostility, 40);

      // Card C checks
      assert.equal(cardC?.social?.relationships?.char_B?.trust, 20);
      assert.equal(cardC?.social?.relationships?.char_A?.suspicion, 30);
      assert.equal(cardC?.social?.relationships?.char_A?.fear, 15);

      // Verification Layer 3: Phase 8 ConsequenceEngine (tracks trust, affinity, fear, respect, hostility)
      const phase8 = worldRepository.getPhase8SimulationEngine(storyId);
      const phase8State = phase8.load(worldRepository as any, storyId);

      assert.equal(phase8State.consequences.relationships['char_A::char_B'].trust, 50); // 25 * 2 = 50
      assert.equal(phase8State.consequences.relationships['char_B::char_C'].trust, -60); // -30 * 2 = -60
      assert.equal(phase8State.consequences.relationships['char_C::char_A'].fear, 30); // 15 * 2 = 30
      assert.equal(phase8State.consequences.relationships['char_A::char_C'].hostility, 20); // 10 * 2 = 20
    });

    it('2.2 Rapid 20-cycle bidirectional oscillation: tests numeric stability, history accumulation, and zero drift', () => {
      const delta1: RelationshipDelta = { trust: 5, respect: 3, hostility: -2, suspicion: -4 };
      const delta2: RelationshipDelta = { trust: -4, respect: -2, hostility: 3, suspicion: 5 };

      // Initial state: trust 50, respect 50, hostility 0, suspicion 0
      // 10 cycles of (+5, -4) -> trust ends at 50 + 10*(5 - 4) = 60
      // respect ends at 50 + 10*(3 - 2) = 60
      // hostility ends at 0 + 10*(-2 clamped, then +3) = clamped arithmetic
      for (let i = 0; i < 10; i++) {
        worldRepository.applyBidirectionalRelationshipDelta(storyId, {
          partyAId: 'char_osc_1',
          partyBId: 'char_osc_2',
          eventId: `evt_osc_${i}_a`,
          cause: 'CIRCUMSTANCE',
          description: `Positive cycle ${i}`,
          symmetricDelta: delta1,
        });

        worldRepository.applyBidirectionalRelationshipDelta(storyId, {
          partyAId: 'char_osc_1',
          partyBId: 'char_osc_2',
          eventId: `evt_osc_${i}_b`,
          cause: 'CIRCUMSTANCE',
          description: `Negative cycle ${i}`,
          symmetricDelta: delta2,
        });
      }

      const agency = worldRepository.getDynamicCharacterAgencyEngine(storyId);
      const rel = agency.getRelationship(storyId, 'char_osc_1', 'char_osc_2');

      assert.ok(rel);
      assert.equal(rel?.history.length, 20, 'History accurately records all 20 transitions');
      assert.equal(rel?.trust, 60, 'Trust precisely matches 50 + 10*(5 - 4) = 60');
      assert.equal(rel?.respect, 60, 'Respect precisely matches 50 + 10*(3 - 2) = 60');

      // Verify EntityRegistry matches final agency state
      const registry = worldRepository.getEntityRegistry(storyId);
      const card = registry.get('char_osc_1');
      assert.equal(card?.social?.relationships?.char_osc_2?.trust, 60);
      assert.equal(card?.social?.relationships?.char_osc_2?.respect, 60);
    });
  });

  /* =========================================================================
   * 3. STORYRUN EXPORT AND RELOAD ROUNDTRIP PERSISTENCE
   * ========================================================================= */
  describe('3. StoryRun Export, Reload, and Deep State Persistence', () => {
    it('3.1 Complex StoryRun with witness facts and relationships rehydrates under new story ID without cross-talk', () => {
      const origStoryId = 'story_session_export_orig';
      seedE2eStory(origStoryId);

      const registry = worldRepository.getEntityRegistry(origStoryId);
      registry.upsert({
        id: 'npc_lead_witness',
        storyId: origStoryId,
        name: 'Inspector Graves',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        worldState: { locationId: 'loc_study', isAlive: true, presence: 'present' },
        createdAt: new Date().toISOString(),
      });

      registry.upsert({
        id: 'npc_culprit',
        storyId: origStoryId,
        name: 'Lord Henry',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        worldState: { locationId: 'loc_study', isAlive: true, presence: 'present' },
        createdAt: new Date().toISOString(),
      });

      // Commit witness fact
      const witnessResult = worldRepository.recordWitnessFact(origStoryId, {
        storyId: origStoryId,
        turnId: 'turn_orig_5',
        locationId: 'loc_study',
        actorId: 'npc_culprit',
        actionCategory: 'CRIME',
        actionText: 'Lord Henry steals the family signet ring.',
        predicate: 'STEAL_ITEM',
        objectValue: 'signet_ring',
        summary: 'Lord Henry stole the signet ring in front of Inspector Graves.',
      });

      // Apply relationship
      worldRepository.applyBidirectionalRelationshipDelta(origStoryId, {
        partyAId: 'player_actor',
        partyBId: 'npc_lead_witness',
        eventId: 'evt_orig_bond',
        cause: 'COOPERATION',
        description: 'Coordinated investigation.',
        symmetricDelta: { trust: 28, respect: 22 },
      });

      // Save StoryRun state to flush dynamic agency into runtimeState
      const origRun = worldRepository.getStoryRun(origStoryId)!;
      worldRepository.saveStoryRun(origRun);

      // Deep serialize to string
      const serializedRuntime = JSON.parse(JSON.stringify(origRun.runtimeState));

      // Create a brand new session with a new story ID
      const newStoryId = 'story_session_reloaded_dest';
      seedE2eStory(newStoryId);
      const newRun = worldRepository.getStoryRun(newStoryId)!;
      newRun.runtimeState = serializedRuntime;
      worldRepository.saveStoryRun(newRun);

      // Verify that under newStoryId, the dynamic agency rehydrates and relationships are found
      const newAgency = worldRepository.getDynamicCharacterAgencyEngine(newStoryId);
      const relUnderNew = newAgency.getRelationship(newStoryId, 'player_actor', 'npc_lead_witness');

      assert.ok(relUnderNew, 'Relationship rehydrated and accessible under newStoryId');
      assert.equal(relUnderNew?.trust, 78); // 50 + 28 = 78
      assert.equal(relUnderNew?.respect, 72); // 50 + 22 = 72

      // Verify witness reaction towards culprit also rehydrated
      const witnessRel = newAgency.getRelationship(newStoryId, 'npc_lead_witness', 'npc_culprit');
      assert.ok(witnessRel, 'Witness reaction rehydrated under newStoryId');
      assert.equal(witnessRel?.suspicion, 35);
      assert.equal(witnessRel?.hostility, 20);

      // Crucial Isolation Check: Querying origStoryId on newAgency returns null
      assert.equal(
        newAgency.getRelationship(origStoryId, 'player_actor', 'npc_lead_witness'),
        null,
        'Original story ID is NOT accessible on newAgency (no cross-story state leak)',
      );

      // Further mutation on newStoryId does NOT mutate original story run
      worldRepository.applyBidirectionalRelationshipDelta(newStoryId, {
        partyAId: 'player_actor',
        partyBId: 'npc_lead_witness',
        eventId: 'evt_new_story_delta',
        cause: 'BETRAYAL',
        description: 'New story divergence',
        symmetricDelta: { trust: -40, hostility: 30 },
      });

      const updatedRelNew = newAgency.getRelationship(newStoryId, 'player_actor', 'npc_lead_witness');
      assert.equal(updatedRelNew?.trust, 38); // 78 - 40 = 38
      assert.equal(updatedRelNew?.hostility, 30);

      // Original story in repository remains pristine at 78
      const origAgency = worldRepository.getDynamicCharacterAgencyEngine(origStoryId);
      const origRel = origAgency.getRelationship(origStoryId, 'player_actor', 'npc_lead_witness');
      assert.equal(origRel?.trust, 78, 'Original story trust remains completely unaffected at 78');
      assert.equal(origRel?.hostility, 0, 'Original story hostility remains 0');
    });
  });
});
