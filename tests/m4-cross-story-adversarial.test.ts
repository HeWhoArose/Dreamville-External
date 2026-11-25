import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DynamicCharacterAgencyEngine,
  type RelationshipDelta,
  type DynamicRelationshipState,
  type CharacterAgencyProfile,
} from '../server/domain/dynamicCharacterAgency';
import { CharacterCanonSteward } from '../server/domain/characterCanonSteward';
import { WitnessFactAuthority } from '../server/domain/witnessFactAuthority';
import { worldRepository, InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { seedE2eStory } from './e2e-test-helper';
import { EntityCard } from '../server/domain/entityCard';

describe('Milestone 4 Adversarial Challenger 1: Cross-Story Boundaries & Empirical Stress', () => {

  // =========================================================================
  // SECTION 1: Cross-Story Boundary Isolation in DynamicCharacterAgencyEngine
  // =========================================================================
  describe('1. DynamicCharacterAgencyEngine Cross-Story Boundary Isolation', () => {
    let engine: DynamicCharacterAgencyEngine;

    beforeEach(() => {
      engine = new DynamicCharacterAgencyEngine();
    });

    it('1.1 Zero leakage: identical character IDs in separate stories remain strictly partitioned', () => {
      const storyA = 'story_alpha';
      const storyB = 'story_beta';
      const charA = 'char_detective_ren';
      const charB = 'char_partner_mira';

      // Register characters in story_alpha
      engine.registerCharacter(storyA, {
        characterId: charA,
        name: 'Ren Takahashi (Story A)',
        role: 'protagonist',
      });
      engine.registerCharacter(storyA, {
        characterId: charB,
        name: 'Mira Kuroda (Story A)',
        role: 'companion',
      });

      // Register same character IDs in story_beta with different metadata
      engine.registerCharacter(storyB, {
        characterId: charA,
        name: 'Ren Takahashi (Story B)',
        role: 'suspect',
      });
      engine.registerCharacter(storyB, {
        characterId: charB,
        name: 'Mira Kuroda (Story B)',
        role: 'witness',
      });

      // Set relationship in Story A: STRONG_FRIEND
      engine.setRelationship(storyA, {
        id: 'rel_alpha_mira_ren',
        worldId: 'world_a',
        sourceId: charB,
        targetId: charA,
        trust: 95,
        affection: 90,
        respect: 85,
        fear: 0,
        hostility: 0,
        suspicion: 5,
        activeCause: 'INITIAL_BOND',
        stance: 'STRONG_FRIEND',
      });

      // 1. Querying Story A returns the relationship
      const relA = engine.getRelationship(storyA, charB, charA);
      assert.ok(relA, 'Story A must have the relationship');
      assert.equal(relA?.trust, 95);
      assert.equal(relA?.stance, 'STRONG_FRIEND');

      // 2. Querying Story B MUST return null (no relationship established in Story B)
      const relB = engine.getRelationship(storyB, charB, charA);
      assert.equal(relB, null, 'Story B MUST NOT leak Story A relationship (must return null)');

      // 3. Querying nonexistent story MUST return null
      assert.equal(engine.getRelationship('story_gamma', charB, charA), null);
      assert.equal(engine.getRelationship('', charB, charA), null);

      // 4. Now establish ENEMY relationship in Story B
      engine.setRelationship(storyB, {
        id: 'rel_beta_mira_ren',
        worldId: 'world_b',
        sourceId: charB,
        targetId: charA,
        trust: 5,
        affection: 0,
        respect: 10,
        fear: 40,
        hostility: 90,
        suspicion: 95,
        activeCause: 'BETRAYAL',
        stance: 'ENEMY',
      });

      // 5. Verify Story A remains STRONG_FRIEND with 95 trust
      const relAAfter = engine.getRelationship(storyA, charB, charA);
      assert.equal(relAAfter?.trust, 95);
      assert.equal(relAAfter?.hostility, 0);
      assert.equal(relAAfter?.stance, 'STRONG_FRIEND');

      // 6. Verify Story B has ENEMY with 5 trust and 90 hostility
      const relBAfter = engine.getRelationship(storyB, charB, charA);
      assert.equal(relBAfter?.trust, 5);
      assert.equal(relBAfter?.hostility, 90);
      assert.equal(relBAfter?.stance, 'ENEMY');

      // 7. Verify character profiles remain partitioned
      const profA = engine.getCharacter(storyA, charA);
      const profB = engine.getCharacter(storyB, charA);
      assert.equal(profA?.name, 'Ren Takahashi (Story A)');
      assert.equal(profA?.role, 'protagonist');
      assert.equal(profB?.name, 'Ren Takahashi (Story B)');
      assert.equal(profB?.role, 'suspect');
    });

    it('1.2 Cross-story belief isolation: beliefs in story_alpha do not exist or affect story_beta', () => {
      const storyA = 'story_alpha';
      const storyB = 'story_beta';
      const charId = 'npc_scholar';

      // Register in both stories
      engine.registerCharacter(storyA, { characterId: charId, name: 'Scholar A' });
      engine.registerCharacter(storyB, { characterId: charId, name: 'Scholar B' });

      // Record belief in Story A
      engine.recordBelief({
        storyId: storyA,
        characterId: charId,
        beliefId: 'belief_dragon_weakness',
        proposition: 'The dragon is vulnerable to frost',
        believedValue: 'FROST_VULNERABLE',
        confidence: 0.9,
        sourceEventIds: ['evt_ancient_tome'],
        timestampSeconds: 100,
      });

      // Story A has 1 belief
      const beliefsA = engine.getBeliefs(storyA, charId);
      assert.equal(beliefsA.length, 1);
      assert.equal(beliefsA[0].beliefId, 'belief_dragon_weakness');
      assert.equal(beliefsA[0].believedValue, 'FROST_VULNERABLE');

      // Story B MUST have 0 beliefs
      const beliefsB = engine.getBeliefs(storyB, charId);
      assert.equal(beliefsB.length, 0, 'Story B must have zero beliefs recorded');

      // Correct belief in Story A
      engine.correctBelief({
        storyId: storyA,
        characterId: charId,
        beliefId: 'belief_dragon_weakness',
        eventId: 'evt_dragon_combat',
        timestampSeconds: 200,
        correctedValue: 'LIGHTNING_VULNERABLE',
        confidence: 1.0,
        evidenceIds: ['evt_dragon_combat'],
        status: 'CORRECTED',
      });

      // Story A updated
      const updatedA = engine.getBeliefs(storyA, charId);
      assert.equal(updatedA[0].status, 'CORRECTED');
      assert.equal(updatedA[0].believedValue, 'LIGHTNING_VULNERABLE');

      // Story B remains 0
      assert.equal(engine.getBeliefs(storyB, charId).length, 0);

      // Attempting to correct belief in Story B returns null
      const failedCorrection = engine.correctBelief({
        storyId: storyB,
        characterId: charId,
        beliefId: 'belief_dragon_weakness',
        eventId: 'evt_attempt',
        timestampSeconds: 250,
        correctedValue: 'FIRE_VULNERABLE',
        confidence: 0.5,
        evidenceIds: [],
      });
      assert.equal(failedCorrection, null, 'Correcting non-existent belief in Story B must return null');
    });

    it('1.3 Cross-story agency control and guidance: possession in story_alpha leaves story_beta free', () => {
      const storyA = 'story_alpha';
      const storyB = 'story_beta';
      const targetId = 'char_target_npc';
      const actorId = 'char_player';

      engine.registerCharacter(storyA, { characterId: targetId, name: 'Target' });
      engine.registerCharacter(storyB, { characterId: targetId, name: 'Target' });

      // Put target in Story A under possession
      engine.setAgencyControl({
        storyId: storyA,
        characterId: targetId,
        eventId: 'evt_possession',
        timestampSeconds: 10,
        controlState: 'POSSESSED',
        controlSourceId: 'demon_lord',
      });

      // Story A target is POSSESSED
      const profA = engine.getCharacter(storyA, targetId);
      assert.equal(profA?.controlState, 'POSSESSED');
      assert.equal(profA?.controlSourceId, 'demon_lord');

      // Story B target MUST be FREE
      const profB = engine.getCharacter(storyB, targetId);
      assert.equal(profB?.controlState, 'FREE');
      assert.equal(profB?.controlSourceId, undefined);

      // Set up relationships in both stories
      engine.setRelationship(storyA, {
        sourceId: targetId,
        targetId: actorId,
        trust: 80,
        affection: 80,
        respect: 80,
        stance: 'FRIEND',
      });
      engine.setRelationship(storyB, {
        sourceId: targetId,
        targetId: actorId,
        trust: 80,
        affection: 80,
        respect: 80,
        stance: 'FRIEND',
      });

      // Story A next intent is constrained by control state: OPPOSE_UNDER_INFLUENCE
      const intentA = engine.deriveNextIntent(storyA, targetId, actorId);
      assert.equal(intentA, 'OPPOSE_UNDER_INFLUENCE', 'Possessed character must return OPPOSE_UNDER_INFLUENCE');

      // Story B next intent is SUPPORT / PROTECT (because control state is FREE and relationship is FRIEND)
      const intentB = engine.deriveNextIntent(storyB, targetId, actorId);
      assert.notEqual(intentB, 'OPPOSE_UNDER_INFLUENCE', 'Free character in Story B must not have constrained intent');

      // Check Narrative Guidance
      const guidanceA = engine.getNarrativeGuidance(storyA, targetId, actorId);
      const guidanceB = engine.getNarrativeGuidance(storyB, targetId, actorId);
      assert.equal(guidanceA.controlState, 'POSSESSED');
      assert.ok(guidanceA.hiddenRelationshipSignals.some((s) => s.includes('Agency is externally constrained')));
      assert.equal(guidanceB.controlState, 'FREE');
      assert.ok(!guidanceB.hiddenRelationshipSignals.some((s) => s.includes('Agency is externally constrained')));
    });

    it('1.4 High-throughput multi-story interleaved mutation stress (10 stories, 500 interleaved deltas)', () => {
      const numStories = 10;
      const numRounds = 50;
      const charX = 'char_actor_x';
      const charY = 'char_actor_y';

      // Initialize 10 distinct stories with unique base stances
      const stories = Array.from({ length: numStories }, (_, i) => `story_stress_partition_${i}`);
      for (let i = 0; i < numStories; i++) {
        const sId = stories[i];
        engine.registerCharacter(sId, { characterId: charX, name: `X in ${sId}` });
        engine.registerCharacter(sId, { characterId: charY, name: `Y in ${sId}` });
        engine.setRelationship(sId, {
          sourceId: charX,
          targetId: charY,
          trust: i * 10, // 0, 10, 20, ..., 90
          affection: 50,
          respect: 50,
          fear: 0,
          hostility: 100 - (i * 10), // 100, 90, ..., 10
          suspicion: 0,
        });
      }

      // Track expected trust values per story
      const expectedTrust = stories.map((_, i) => i * 10);

      // Perform 50 rounds of interleaved mutations across all 10 stories (500 total mutations)
      for (let round = 0; round < numRounds; round++) {
        for (let i = 0; i < numStories; i++) {
          const sId = stories[i];
          // Even stories get +1 trust, odd stories get -1 trust (clamped)
          const delta = i % 2 === 0 ? 1 : -1;
          engine.applyRelationshipDelta({
            storyId: sId,
            sourceId: charX,
            targetId: charY,
            eventId: `evt_round_${round}_story_${i}`,
            timestampSeconds: round * 10 + i,
            cause: 'CIRCUMSTANCE',
            description: `Interleaved stress delta round ${round}`,
            delta: { trust: delta },
          });
          expectedTrust[i] = Math.max(0, Math.min(100, expectedTrust[i] + delta));
        }
      }

      // Verify that every single story maintained its exact mathematical delta with ZERO cross-talk
      for (let i = 0; i < numStories; i++) {
        const sId = stories[i];
        const rel = engine.getRelationship(sId, charX, charY);
        assert.ok(rel, `Story ${sId} relationship must exist`);
        assert.equal(
          rel?.trust,
          expectedTrust[i],
          `Story ${sId} trust was ${rel?.trust}, expected ${expectedTrust[i]}`
        );
        // History length must be exactly 50 entries for each story
        assert.equal(rel?.history.length, 50, `Story ${sId} must have exactly 50 history entries`);
      }
    });

    it('1.5 Story ID edge cases: colons, unicode, whitespace, and prefix collisions do not corrupt lookup', () => {
      const complexStories = [
        { id: 'story::with::double::colons', trust: 41 },
        { id: 'story_日本語_クロニクル', trust: 42 },
        { id: 'story-with-dashes_and.dots_123', trust: 43 },
        { id: 'story with spaces in id', trust: 44 },
        { id: 'story_alpha', trust: 45 },
        { id: 'story_alpha_extended_prefix', trust: 46 },
      ];

      // Register all stories with unique trust values
      for (const item of complexStories) {
        engine.registerCharacter(item.id, { characterId: 'hero', name: 'Hero' });
        engine.setRelationship(item.id, {
          sourceId: 'hero',
          targetId: 'villain',
          trust: item.trust,
          affection: 50,
          respect: 50,
        });
      }

      // Verify each story returns EXACTLY its own trust value and no other
      for (const item of complexStories) {
        const rel = engine.getRelationship(item.id, 'hero', 'villain');
        assert.ok(rel, `Failed to retrieve relationship for complex storyId: ${item.id}`);
        assert.equal(
          rel?.trust,
          item.trust,
          `Story ${item.id} returned trust ${rel?.trust}, expected ${item.trust}`
        );
      }

      // Verify that an unregistered complex ID returns null
      assert.equal(engine.getRelationship('story::unregistered::id', 'hero', 'villain'), null);
      assert.equal(engine.getRelationship('story_alpha_ex', 'hero', 'villain'), null);
    });

    it('1.6 Immutability & Clone Protection: mutating returned objects does not corrupt internal state', () => {
      const storyId = 'story_immutability_test';
      engine.registerCharacter(storyId, { characterId: 'hero', name: 'Original Hero' });
      engine.setRelationship(storyId, {
        sourceId: 'hero',
        targetId: 'villain',
        trust: 50,
        affection: 50,
        respect: 50,
      });

      // 1. Mutating returned getRelationship object
      const rel1 = engine.getRelationship(storyId, 'hero', 'villain');
      assert.ok(rel1);
      (rel1 as any).trust = 999;
      (rel1 as any).stance = 'ENEMY';
      rel1.history.push({} as any);

      const rel2 = engine.getRelationship(storyId, 'hero', 'villain');
      assert.equal(rel2?.trust, 50, 'Internal trust must not be corrupted by caller mutation');
      assert.equal(rel2?.history.length, 0, 'Internal history must not be corrupted by caller mutation');

      // 2. Mutating returned getCharacter object
      const char1 = engine.getCharacter(storyId, 'hero');
      assert.ok(char1);
      (char1 as any).name = 'Corrupted Hero';
      char1.traits.push('corrupted_trait');

      const char2 = engine.getCharacter(storyId, 'hero');
      assert.equal(char2?.name, 'Original Hero', 'Internal character name must not be corrupted');
      assert.ok(!char2?.traits.includes('corrupted_trait'), 'Internal traits must not be corrupted');

      // 3. Mutating exportState() does not corrupt engine state
      const exp = engine.exportState();
      delete exp.relationships[`${storyId}::hero::villain`];
      assert.ok(engine.getRelationship(storyId, 'hero', 'villain'), 'Export mutation must not delete engine relationship');
    });
  });

  // =========================================================================
  // SECTION 2: Import / Export Lossless Archival vs Target Story Re-keying
  // =========================================================================
  describe('2. State Import/Export Archival vs Story Re-keying', () => {
    it('2.1 Export without targetStoryId produces lossless bitwise-equivalent archive', () => {
      const engine1 = new DynamicCharacterAgencyEngine();
      engine1.registerCharacter('story_orig', {
        characterId: 'char_ren',
        name: 'Ren',
        traits: ['observant', 'stoic'],
        values: ['truth'],
        fears: ['corruption'],
      });
      engine1.setRelationship('story_orig', {
        sourceId: 'char_ren',
        targetId: 'char_mira',
        trust: 85,
        affection: 70,
        respect: 90,
        fear: 10,
        hostility: 5,
        suspicion: 15,
        stance: 'FRIEND',
      });
      engine1.recordBelief({
        storyId: 'story_orig',
        characterId: 'char_ren',
        beliefId: 'b_01',
        proposition: 'The lock was picked from inside',
        believedValue: 'INSIDE_JOB',
        confidence: 0.95,
        sourceEventIds: ['evt_inspect_lock'],
        timestampSeconds: 50,
      });

      const exported = engine1.exportState();

      // Import into clean engine without targetStoryId (archival restoration)
      const engine2 = new DynamicCharacterAgencyEngine();
      engine2.importState(exported);

      assert.deepEqual(engine2.exportState(), exported, 'Archival export/import must be strictly identical');
      assert.equal(engine2.getRelationship('story_orig', 'char_ren', 'char_mira')?.trust, 85);
      assert.equal(engine2.getBeliefs('story_orig', 'char_ren')[0]?.believedValue, 'INSIDE_JOB');
    });

    it('2.2 Import with targetStoryId re-keys all data to target and isolates from original storyId', () => {
      const sourceEngine = new DynamicCharacterAgencyEngine();
      sourceEngine.registerCharacter('story_src', {
        characterId: 'char_ren',
        name: 'Ren Takahashi',
      });
      sourceEngine.setRelationship('story_src', {
        sourceId: 'char_ren',
        targetId: 'char_mira',
        trust: 77,
        affection: 66,
        respect: 88,
        stance: 'FRIEND',
      });
      sourceEngine.recordBelief({
        storyId: 'story_src',
        characterId: 'char_ren',
        beliefId: 'b_clue',
        proposition: 'Weapon is in the fountain',
        believedValue: 'FOUNTAIN',
        confidence: 0.8,
        sourceEventIds: ['evt_fountain'],
        timestampSeconds: 120,
      });

      const exported = sourceEngine.exportState();

      // Import into destEngine with targetStoryId = 'story_dest'
      const destEngine = new DynamicCharacterAgencyEngine();
      destEngine.importState(exported, 'story_dest');

      // 1. Target story has all data re-keyed
      const destRel = destEngine.getRelationship('story_dest', 'char_ren', 'char_mira');
      assert.ok(destRel, 'Relationship must exist under story_dest');
      assert.equal(destRel?.trust, 77);
      assert.equal(destRel?.stance, 'FRIEND');

      const destChar = destEngine.getCharacter('story_dest', 'char_ren');
      assert.ok(destChar, 'Character must exist under story_dest');
      assert.equal(destChar?.name, 'Ren Takahashi');

      const destBeliefs = destEngine.getBeliefs('story_dest', 'char_ren');
      assert.equal(destBeliefs.length, 1, 'Belief must exist under story_dest');
      assert.equal(destBeliefs[0].believedValue, 'FOUNTAIN');

      // 2. Querying source story in destEngine MUST return null / empty
      assert.equal(destEngine.getRelationship('story_src', 'char_ren', 'char_mira'), null);
      assert.equal(destEngine.getCharacter('story_src', 'char_ren'), null);
      assert.equal(destEngine.getBeliefs('story_src', 'char_ren').length, 0);
    });
  });

  // =========================================================================
  // SECTION 3: CharacterCanonSteward Epistemic Cross-Story Isolation
  // =========================================================================
  describe('3. CharacterCanonSteward Epistemic Boundary Isolation', () => {
    const storyA = 'story_canon_a';
    const storyB = 'story_canon_b';
    const speakerId = 'npc_witness_elena';

    beforeEach(() => {
      CharacterCanonSteward.resetStory(storyA);
      CharacterCanonSteward.resetStory(storyB);
    });

    it('3.1 Restricted investigation facts registered in Story A do not leak or restrict Story B', () => {
      // Register restricted murder weapon in Story A
      CharacterCanonSteward.registerRestrictedInvestigationFact({
        storyId: storyA,
        factId: 'fact_restricted_poison_vial',
        summary: 'Cyanide vial hidden in grandfather clock',
        originLocationId: 'loc_study',
        keywords: ['cyanide', 'vial', 'grandfather', 'clock'],
      });

      // Elena in Story A at a different location (market square) discusses it -> MUST BE REJECTED
      CharacterCanonSteward.initializeCharacterFromCard({
        id: speakerId,
        storyId: storyA,
        name: 'Elena',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        createdAt: new Date().toISOString(),
      });

      const auditA = CharacterCanonSteward.auditSpeakerDialogue({
        storyId: storyA,
        speakerId,
        speakerName: 'Elena',
        dialogueText: 'I know about the cyanide vial hidden in the clock!',
        currentLocationId: 'loc_market',
      });
      assert.equal(auditA.valid, false, 'Story A Elena must NOT be allowed to leak unobserved restricted fact');
      assert.ok(auditA.leakedFacts.some((f) => f.includes('Cyanide vial')));

      // In Story B, the same phrase by Elena at market square is NOT restricted by Story A's facts
      CharacterCanonSteward.initializeCharacterFromCard({
        id: speakerId,
        storyId: storyB,
        name: 'Elena',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        createdAt: new Date().toISOString(),
      });

      const auditB = CharacterCanonSteward.auditSpeakerDialogue({
        storyId: storyB,
        speakerId,
        speakerName: 'Elena',
        dialogueText: 'I know about the cyanide vial hidden in the clock!',
        currentLocationId: 'loc_market',
      });
      assert.equal(auditB.valid, true, 'Story B Elena must not be blocked by Story A restricted facts');
      assert.equal(auditB.leakedFacts.length, 0);
    });

    it('3.2 Facts granted to a character in Story A are completely absent in Story B for the same character ID', () => {
      const factId = 'fact_secret_rendezvous';

      // Grant in Story A
      CharacterCanonSteward.grantFact(storyA, speakerId, {
        factId,
        subjectEntityId: 'npc_mayor',
        predicate: 'SECRET_MEETING',
        objectValue: 'Met with smugglers at the docks',
        sourceType: 'AUTHORED_BACKGROUND',
        acquiredAtTimestamp: new Date().toISOString(),
        acquiredAtTurn: 1,
        confidence: 1.0,
      });

      assert.ok(CharacterCanonSteward.isFactKnown(storyA, speakerId, factId), 'Must be known in Story A');
      assert.ok(!CharacterCanonSteward.isFactKnown(storyB, speakerId, factId), 'Must NOT be known in Story B');

      const scopeA = CharacterCanonSteward.getScope(storyA, speakerId);
      const scopeB = CharacterCanonSteward.getScope(storyB, speakerId);
      assert.equal(scopeA.knownFacts.size, 1);
      assert.equal(scopeB.knownFacts.size, 0);
    });

    it('3.3 resetStory on Story A does not erase Story B data', () => {
      const factId = 'fact_shared_id';
      CharacterCanonSteward.grantFact(storyA, speakerId, {
        factId,
        subjectEntityId: 'target',
        predicate: 'TEST',
        objectValue: 'Value A',
        sourceType: 'DEDUCTION',
        acquiredAtTimestamp: new Date().toISOString(),
        acquiredAtTurn: 1,
        confidence: 0.9,
      });
      CharacterCanonSteward.grantFact(storyB, speakerId, {
        factId,
        subjectEntityId: 'target',
        predicate: 'TEST',
        objectValue: 'Value B',
        sourceType: 'DEDUCTION',
        acquiredAtTimestamp: new Date().toISOString(),
        acquiredAtTurn: 1,
        confidence: 0.9,
      });

      // Reset Story A
      CharacterCanonSteward.resetStory(storyA);

      assert.ok(!CharacterCanonSteward.isFactKnown(storyA, speakerId, factId), 'Story A data should be cleared');
      assert.ok(CharacterCanonSteward.isFactKnown(storyB, speakerId, factId), 'Story B data MUST REMAIN INTACT');
    });
  });

  // =========================================================================
  // SECTION 4: WorldRepository Multi-Story Dynamic Engine Lifecycle
  // =========================================================================
  describe('4. WorldRepository Multi-Story Isolation & Engine Caching', () => {
    const story1 = 'story_repo_multi_1';
    const story2 = 'story_repo_multi_2';

    beforeEach(() => {
      seedE2eStory(story1);
      seedE2eStory(story2);
    });

    it('4.1 worldRepository manages independent DynamicCharacterAgencyEngine instances per story', () => {
      const engine1 = worldRepository.getDynamicCharacterAgencyEngine(story1);
      const engine2 = worldRepository.getDynamicCharacterAgencyEngine(story2);

      // Verify they are distinct object instances
      assert.notEqual(engine1, engine2, 'Each storyId must receive a distinct DynamicCharacterAgencyEngine instance');

      // Mutate relationship in Story 1
      engine1.setRelationship(story1, {
        sourceId: 'npc_alpha',
        targetId: 'npc_beta',
        trust: 99,
        affection: 88,
        stance: 'STRONG_FRIEND',
      });

      // Verify Story 1 has it
      assert.equal(engine1.getRelationship(story1, 'npc_alpha', 'npc_beta')?.trust, 99);

      // Verify Story 2 does not have it, either when queried with story2 or story1
      assert.equal(engine2.getRelationship(story2, 'npc_alpha', 'npc_beta'), null);
      assert.equal(engine2.getRelationship(story1, 'npc_alpha', 'npc_beta'), null);
    });

    it('4.2 applyBidirectionalRelationshipDelta via repository operates strictly on target storyId', () => {
      const partyA = 'char_detective';
      const partyB = 'char_informant';

      // Apply delta to Story 1
      const res1 = worldRepository.applyBidirectionalRelationshipDelta(story1, {
        partyAId: partyA,
        partyBId: partyB,
        eventId: 'evt_trust_gain_01',
        cause: 'PLAYER_ACTION',
        description: 'Saved informant from ambush',
        symmetricDelta: { trust: 30, affection: 25 },
      });

      assert.equal(res1.forward.trust, 80, '50 + 30 = 80');

      // Verify Story 1 repo query
      const repoBi1 = worldRepository.getBidirectionalRelationship(story1, partyA, partyB);
      assert.equal(repoBi1.forward?.trust, 80);

      // Verify Story 2 repo query is completely uninitialized or default (50 / null)
      const repoBi2 = worldRepository.getBidirectionalRelationship(story2, partyA, partyB);
      assert.equal(repoBi2.forward, null, 'Story 2 must have no relationship for this character pair');

      // Verify EntityRegistry in Story 2 does not contain relationships for partyA
      const reg2 = worldRepository.getEntityRegistry(story2);
      const card2A = reg2.get(partyA);
      assert.equal(card2A?.social?.relationships?.[partyB], undefined);
    });
  });

  // =========================================================================
  // SECTION 5: Extreme Invariant Stress Testing (Clamping, Bounds, NaN Resistance)
  // =========================================================================
  describe('5. Extreme Invariant Stress & Robustness', () => {
    const storyId = 'story_extreme_stress';
    let engine: DynamicCharacterAgencyEngine;

    beforeEach(() => {
      engine = new DynamicCharacterAgencyEngine();
      engine.registerCharacter(storyId, { characterId: 'c1', name: 'Char 1' });
      engine.registerCharacter(storyId, { characterId: 'c2', name: 'Char 2' });
    });

    it('5.1 Overflow and underflow deltas (+1,000,000 and -1,000,000) clamp cleanly without throwing', () => {
      // Massive positive
      const pos = engine.applyRelationshipDelta({
        storyId,
        sourceId: 'c1',
        targetId: 'c2',
        eventId: 'evt_huge_pos',
        timestampSeconds: 1,
        cause: 'COOPERATION',
        description: 'Galaxy-saving alliance',
        delta: {
          trust: 1_000_000,
          affection: 999_999,
          respect: 500_000,
          fear: 100_000,
          hostility: 100_000,
          suspicion: 100_000,
        },
      });

      assert.equal(pos.trust, 100);
      assert.equal(pos.affection, 100);
      assert.equal(pos.respect, 100);
      assert.equal(pos.fear, 100);
      assert.equal(pos.hostility, 100);
      assert.equal(pos.suspicion, 100);

      // Massive negative
      const neg = engine.applyRelationshipDelta({
        storyId,
        sourceId: 'c1',
        targetId: 'c2',
        eventId: 'evt_huge_neg',
        timestampSeconds: 2,
        cause: 'BETRAYAL',
        description: 'Total oblivion',
        delta: {
          trust: -2_000_000,
          affection: -2_000_000,
          respect: -2_000_000,
          fear: -2_000_000,
          hostility: -2_000_000,
          suspicion: -2_000_000,
        },
      });

      assert.equal(neg.trust, 0);
      assert.equal(neg.affection, 0);
      assert.equal(neg.respect, 0);
      assert.equal(neg.fear, 0);
      assert.equal(neg.hostility, 0);
      assert.equal(neg.suspicion, 0);
    });

    it('5.2 Missing or partial delta properties default to 0 without resulting in NaN', () => {
      const res = engine.applyRelationshipDelta({
        storyId,
        sourceId: 'c1',
        targetId: 'c2',
        eventId: 'evt_partial_delta',
        timestampSeconds: 10,
        cause: 'PLAYER_ACTION',
        description: 'Only trust changed',
        delta: { trust: 15 }, // affection, respect, fear, hostility, suspicion all omitted
      });

      assert.equal(res.trust, 65);     // initial default 50 + 15 = 65
      assert.equal(res.affection, 50); // initial default 50
      assert.equal(res.respect, 50);   // initial default 50
      assert.equal(res.fear, 0);        // initial default 0
      assert.equal(res.hostility, 0);   // initial default 0
      assert.equal(res.suspicion, 0);   // initial default 0

      // None of the metrics can be NaN or non-finite
      for (const [k, v] of Object.entries(res)) {
        if (typeof v === 'number') {
          assert.ok(Number.isFinite(v), `Property ${k} must be finite`);
          assert.ok(!Number.isNaN(v), `Property ${k} must not be NaN`);
        }
      }
    });

    it('5.3 Required field validation throws meaningful errors on missing parameters', () => {
      assert.throws(() => {
        engine.applyRelationshipDelta({
          storyId: '',
          sourceId: 'c1',
          targetId: 'c2',
          eventId: 'evt',
          timestampSeconds: 1,
          cause: 'OTHER',
          description: '',
        });
      }, /Relationship mutation requires storyId, sourceId, and targetId/);

      assert.throws(() => {
        engine.applyRelationshipDelta({
          storyId,
          sourceId: 'c1',
          targetId: 'c2',
          eventId: '',
          timestampSeconds: 1,
          cause: 'OTHER',
          description: '',
        });
      }, /Relationship mutation requires canonical eventId/);
    });
  });
});
