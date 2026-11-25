import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { worldRepository } from '../server/repositories/worldRepository';
import { seedE2eStory } from './e2e-test-helper';
import { CharacterCanonSteward } from '../server/domain/characterCanonSteward';
import { WitnessFactAuthority } from '../server/domain/witnessFactAuthority';
import { NarrativeMemoryLifecycle } from '../server/domain/narrativeMemoryLifecycle';
import { MemoryOpportunityEngine } from '../server/domain/memoryOpportunityEngine';
import { SemanticNarrativeReview } from '../server/domain/semanticNarrativeReview';
import { DynamicCharacterAgencyEngine } from '../server/domain/dynamicCharacterAgency';
import { EntityCard } from '../server/domain/entityCard';
import { deterministicId } from '../server/domain/deterministicRng';

describe('Milestone 4 Adversarial Stress Harnesses (F17, F18, F19)', () => {
  const storyId = 'test_story_m4_adversarial';

  beforeEach(() => {
    seedE2eStory(storyId);
    CharacterCanonSteward.resetStory(storyId);
  });

  /* -------------------------------------------------------------------------
   * HARNESS 1: Long-Horizon Turn Decay & Persistent Critical Memory Survival
   * ------------------------------------------------------------------------- */
  describe('Harness 1: Long-Horizon Turn Decay (50+ turns & Critical Memory Survival)', () => {
    it('non-critical memories transition active -> dormant -> archived while persistent critical memories survive 150 turns', () => {
      const memoryEngine = worldRepository.getMemoryEngine(storyId);

      // 1. Store standard non-critical episodic memory (importance 60)
      memoryEngine.storeMemory({
        id: 'mem_ordinary_chat',
        storyId,
        memoryClass: 'EPISODIC',
        subjectEntityId: 'player_actor',
        relatedEntityIds: ['npc_merchant'],
        content: 'Casual conversation with the street fruit vendor.',
        importance: 60,
        confidence: 0.85,
        status: 'active',
        visibility: 'PRIVATE',
        accessibleToEntityIds: ['player_actor'],
        isPersistentCritical: false,
        provenance: 'turn_1',
        validFromTurn: 1,
        lastRecalledTurn: 1,
        triggerConditionTags: ['fruit', 'vendor'],
      });

      // 2. Store persistent critical causal memory (importance 75)
      memoryEngine.storeMemory({
        id: 'mem_persistent_critical_murder',
        storyId,
        memoryClass: 'CAUSAL',
        subjectEntityId: 'player_actor',
        relatedEntityIds: ['npc_victim'],
        content: 'Discovered the murdered body of Councilor Vance in the study.',
        importance: 75,
        confidence: 1.0,
        status: 'active',
        visibility: 'PRIVATE',
        accessibleToEntityIds: ['player_actor'],
        isPersistentCritical: true, // Critical Floor
        provenance: 'turn_1',
        validFromTurn: 1,
        lastRecalledTurn: 1,
        triggerConditionTags: ['murder', 'vance', 'study'],
      });

      // 3. Store authoritatively locked memory (importance 65)
      memoryEngine.storeMemory({
        id: 'mem_locked_family_crest',
        storyId,
        memoryClass: 'PERSISTENT_IDENTITY',
        subjectEntityId: 'player_actor',
        relatedEntityIds: [],
        content: 'The heirloom crest inherited from grandfather.',
        importance: 65,
        confidence: 1.0,
        status: 'active',
        visibility: 'PRIVATE',
        accessibleToEntityIds: ['player_actor'],
        isPersistentCritical: false,
        isLocked: true, // Authoritative Lock
        provenance: 'turn_1',
        validFromTurn: 1,
        lastRecalledTurn: 1,
        triggerConditionTags: ['crest', 'heirloom'],
      });

      // Phase A: Advance 10 turns (all should stay active)
      memoryEngine.decayMemories({ storyId, currentTurn: 10 });
      assert.equal(memoryEngine.getMemory('mem_ordinary_chat')?.status, 'active');
      assert.equal(memoryEngine.getMemory('mem_persistent_critical_murder')?.status, 'active');
      assert.equal(memoryEngine.getMemory('mem_locked_family_crest')?.status, 'active');

      // Phase B: Advance to turn 25 (non-critical >= 20 turns -> dormant, importance 60 - 10 = 50)
      memoryEngine.decayMemories({ storyId, currentTurn: 25 });
      assert.equal(memoryEngine.getMemory('mem_ordinary_chat')?.status, 'dormant');
      assert.equal(memoryEngine.getMemory('mem_ordinary_chat')?.importance, 50);
      // Persistent critical and locked MUST remain active and unreduced
      assert.equal(memoryEngine.getMemory('mem_persistent_critical_murder')?.status, 'active');
      assert.equal(memoryEngine.getMemory('mem_persistent_critical_murder')?.importance, 75);
      assert.equal(memoryEngine.getMemory('mem_locked_family_crest')?.status, 'active');
      assert.equal(memoryEngine.getMemory('mem_locked_family_crest')?.importance, 65);

      // Phase C: Long-horizon stress: advance to turn 60 (59 turns since recall)
      memoryEngine.decayMemories({ storyId, currentTurn: 60 });
      assert.equal(memoryEngine.getMemory('mem_ordinary_chat')?.status, 'dormant');
      assert.equal(memoryEngine.getMemory('mem_persistent_critical_murder')?.status, 'active');
      assert.equal(memoryEngine.getMemory('mem_locked_family_crest')?.status, 'active');

      // Verify retrieval at turn 60:
      // Ordinary dormant memory is excluded by default
      const defaultRetrieval = memoryEngine.retrieveMemories({
        storyId,
        viewerActorId: 'player_actor',
        currentTurn: 60,
      });
      assert.ok(!defaultRetrieval.some((m) => m.id === 'mem_ordinary_chat'), 'Dormant memory should be filtered out');
      assert.ok(defaultRetrieval.some((m) => m.id === 'mem_persistent_critical_murder'), 'Critical memory must be retrieved');

      // Phase D: Deep long-horizon stress: advance to turn 120 (119 turns since recall)
      // Non-critical >= 100 turns -> archived, importance 50 - 15 = 35
      memoryEngine.decayMemories({ storyId, currentTurn: 120 });
      assert.equal(memoryEngine.getMemory('mem_ordinary_chat')?.status, 'archived');
      assert.equal(memoryEngine.getMemory('mem_ordinary_chat')?.importance, 35);
      // Persistent critical memory MUST STILL BE ACTIVE and importance 75!
      assert.equal(memoryEngine.getMemory('mem_persistent_critical_murder')?.status, 'active');
      assert.equal(memoryEngine.getMemory('mem_persistent_critical_murder')?.importance, 75);
      assert.equal(memoryEngine.getMemory('mem_locked_family_crest')?.status, 'active');
      assert.equal(memoryEngine.getMemory('mem_locked_family_crest')?.importance, 65);

      // Phase E: Marathon loop (turns 121 through 200, 80 sequential decay ticks)
      for (let t = 121; t <= 200; t++) {
        memoryEngine.decayMemories({ storyId, currentTurn: t });
      }

      const postMarathonCritical = memoryEngine.getMemory('mem_persistent_critical_murder');
      assert.ok(postMarathonCritical);
      assert.equal(postMarathonCritical?.status, 'active', 'Persistent critical memory must remain ACTIVE after 200 turns');
      assert.equal(postMarathonCritical?.importance, 75, 'Persistent critical memory importance must not degrade');

      // Retrieval with zero keyword matches must still guarantee anti-recency floor score >= 75
      const scoredMemories = memoryEngine.retrieveMemories({
        storyId,
        viewerActorId: 'player_actor',
        currentTurn: 200,
        queryKeywords: ['unrelated', 'astronomy'],
      });
      const criticalResult = scoredMemories.find((m) => m.id === 'mem_persistent_critical_murder');
      assert.ok(criticalResult, 'Critical memory must be retrieved even with completely unrelated query at turn 200');
    });
  });

  /* -------------------------------------------------------------------------
   * HARNESS 2: High-Volume Memory Injection & 50-Entry LRU Cap
   * ------------------------------------------------------------------------- */
  describe('Harness 2: High-Volume Memory Injection (50-Entry LRU Cap)', () => {
    it('strictly bounds EntityCard.memoryRefs to exactly 50 entries in FIFO/LRU order under high-volume injection', () => {
      const registry = worldRepository.getEntityRegistry(storyId);
      const testNpcId = 'npc_stress_lru_target';

      registry.upsert({
        id: testNpcId,
        storyId,
        name: 'Target NPC',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        worldState: { locationId: 'loc_study', isAlive: true, presence: 'present' },
        memoryRefs: [],
        createdAt: new Date().toISOString(),
      });

      // Inject 80 sequential memories via NarrativeMemoryLifecycle.processTurn
      const injectedIds: string[] = [];
      for (let turn = 1; turn <= 80; turn++) {
        const turnId = `turn_lru_${turn}`;
        const phrase = `Unique observation beat at stage ${turn} concerning target NPC in study.`;
        const res = NarrativeMemoryLifecycle.processTurn({
          repository: worldRepository,
          storyId,
          turnId,
          playerAction: `I examine the room details for clue ${turn}`,
          playerIntent: {
            action: 'examine',
            interactionMode: 'OBSERVATION',
            speechIntent: false,
            movementIntent: false,
            observationIntent: true,
            explicitTargets: [testNpcId],
          },
          currentSituation: {
            storyId,
            turnId,
            location: { id: 'loc_study', name: 'Private Study' },
            player: { actorId: 'player_actor', name: 'Investigator' },
            nearbyEntities: [
              { id: testNpcId, name: 'Target NPC', visibleToPlayer: true, kind: 'NPC' },
            ],
            worldFacts: [],
            playerKnowledge: { knownFacts: [], authorizedFactIds: [] },
            sceneEvidence: { entities: [], objects: [], sceneAnchorMatches: [] },
            visibleEvents: [],
            recentTurns: [],
          },
          turnPackage: {
            narrative: [phrase],
            dialogue: [],
            events: [`Event ${turn}: Investigator inspects clue ${turn} with Target NPC present.`],
            stateChanges: [{ targetId: testNpcId, kind: 'OBSERVED' }],
            memoryCandidates: [phrase],
          },
        });

        assert.ok(res.promotedMemoryIds.length > 0, `Turn ${turn} should promote memory candidate`);
        const promotedId = res.promotedMemoryIds[0];
        injectedIds.push(promotedId);

        const card = registry.get(testNpcId);
        assert.ok(card);
        assert.ok(card?.memoryRefs);
        const refCount = card?.memoryRefs?.length ?? 0;

        // Verify cap is strictly respected at every single turn
        if (turn <= 50) {
          assert.equal(refCount, turn, `At turn ${turn}, memoryRefs should have ${turn} entries`);
        } else {
          assert.equal(refCount, 50, `At turn ${turn}, memoryRefs must be strictly capped at 50 entries`);
        }
      }

      // Final check on the 50 retained references:
      const finalCard = registry.get(testNpcId);
      const refs = finalCard?.memoryRefs || [];
      assert.equal(refs.length, 50, 'Final memoryRefs array must have exactly 50 entries');

      // The 30 oldest memories (turns 1..30) must have been evicted
      for (let i = 0; i < 30; i++) {
        assert.ok(!refs.includes(injectedIds[i]), `Memory from turn ${i + 1} (${injectedIds[i]}) should have been evicted by LRU`);
      }

      // The 50 newest memories (turns 31..80) must be present in exact order
      for (let i = 30; i < 80; i++) {
        assert.ok(refs.includes(injectedIds[i]), `Memory from turn ${i + 1} (${injectedIds[i]}) must be present`);
      }
      assert.deepEqual(refs, injectedIds.slice(-50), 'memoryRefs must match the last 50 injected memory IDs in exact FIFO order');
    });

    it('strictly bounds EntityCard.memoryRefs under rapid high-volume WitnessFactAuthority.recordWitnessFact commits', () => {
      const registry = worldRepository.getEntityRegistry(storyId);
      const witnessId = 'npc_witness_high_volume';

      registry.upsert({
        id: witnessId,
        storyId,
        name: 'Witness Maria',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        worldState: { locationId: 'loc_courtyard', isAlive: true, presence: 'present' },
        memoryRefs: [],
        createdAt: new Date().toISOString(),
      });

      // Record 70 rapid witness facts
      const factIds: string[] = [];
      for (let f = 1; f <= 70; f++) {
        const result = worldRepository.recordWitnessFact(storyId, {
          storyId,
          turnId: `turn_witness_${f}`,
          locationId: 'loc_courtyard',
          actorId: 'player_actor',
          actionText: `Player casts spell variant ${f}`,
          predicate: 'CASTS_SPELL',
          objectValue: `Spell_${f}`,
          summary: `Player cast spell variant ${f} in the courtyard`,
          actionCategory: 'MUNDANE',
        });

        assert.ok(result.witnessIds.includes(witnessId));
        factIds.push(result.factId);

        const card = registry.get(witnessId);
        const len = card?.memoryRefs?.length ?? 0;
        assert.ok(len <= 50, `memoryRefs length (${len}) must never exceed 50 at iteration ${f}`);
      }

      const finalCard = registry.get(witnessId);
      const refs = finalCard?.memoryRefs || [];
      assert.equal(refs.length, 50, 'Witness memoryRefs must be capped at 50');
      assert.deepEqual(refs, factIds.slice(-50), 'Witness memoryRefs must match last 50 witness fact IDs');
    });

    it('immediately truncates pre-existing overgrown memoryRefs array down to 50 on next update', () => {
      const registry = worldRepository.getEntityRegistry(storyId);
      const bloatedId = 'npc_bloated_refs';

      // Seed an entity with 75 pre-existing bogus references
      const bogusRefs = Array.from({ length: 75 }, (_, i) => `bogus_mem_${i}`);
      registry.upsert({
        id: bloatedId,
        storyId,
        name: 'Bloated NPC',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        worldState: { locationId: 'loc_courtyard', isAlive: true, presence: 'present' },
        memoryRefs: bogusRefs,
        createdAt: new Date().toISOString(),
      });

      // Commit one new witness fact
      worldRepository.recordWitnessFact(storyId, {
        storyId,
        turnId: 'turn_bloat_fix',
        locationId: 'loc_courtyard',
        actorId: 'player_actor',
        actionText: 'Player rings the chapel bell',
        predicate: 'RANG_BELL',
        objectValue: 'Chapel Bell',
        summary: 'Player rang the chapel bell',
      });

      const card = registry.get(bloatedId);
      assert.equal(card?.memoryRefs?.length, 50, 'Overgrown array must be immediately clamped to 50');
    });
  });

  /* -------------------------------------------------------------------------
   * HARNESS 3: Dialogue Clue Leakage & Mode 7 Dialogue Auditing
   * ------------------------------------------------------------------------- */
  describe('Harness 3: Dialogue Clue Leakage Attempts & Mode 7 Epistemic Auditing', () => {
    const crimeLocationId = 'loc_crime_scene_library';
    const innocentNpcLocationId = 'loc_market_square';
    const speakerId = 'npc_innocent_florist';

    beforeEach(() => {
      // Register restricted investigation facts originating at the library
      CharacterCanonSteward.registerRestrictedInvestigationFact({
        storyId,
        factId: 'fact_restricted_weapon',
        summary: 'Bloody ceremonial silver dagger with serpent hilt',
        originLocationId: crimeLocationId,
        keywords: ['bloody', 'ceremonial', 'dagger', 'serpent'],
      });

      CharacterCanonSteward.registerRestrictedInvestigationFact({
        storyId,
        factId: 'fact_restricted_wound',
        summary: 'Crushed skull from a blunt heavy marble bust',
        originLocationId: crimeLocationId,
        keywords: ['crushed', 'skull', 'marble', 'bust'],
      });

      CharacterCanonSteward.registerRestrictedInvestigationFact({
        storyId,
        factId: 'fact_restricted_poison',
        summary: 'Vial of rare nightshade poison under desk',
        originLocationId: crimeLocationId,
        keywords: ['nightshade', 'poison', 'vial'],
      });

      // Setup innocent florist at market square
      const card: EntityCard = {
        id: speakerId,
        storyId,
        name: 'Fiona the Florist',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        classification: { role: 'Florist', profession: 'Shopkeeper', tags: ['botany', 'flowers'] },
        worldState: { locationId: innocentNpcLocationId, isAlive: true, presence: 'present' },
        personality: { canonicalSecrets: [] },
        createdAt: new Date().toISOString(),
      };
      CharacterCanonSteward.initializeCharacterFromCard(card);
    });

    it('rejects dialogue leaking restricted crime scene clues with varied casing and phrasing', () => {
      // Attempt 1: Exact leak of weapon
      const audit1 = CharacterCanonSteward.auditSpeakerDialogue({
        storyId,
        speakerId,
        speakerName: 'Fiona',
        dialogueText: 'Did you hear about the bloody ceremonial dagger with the serpent hilt?',
        currentLocationId: innocentNpcLocationId,
      });
      assert.equal(audit1.valid, false);
      assert.ok(audit1.leakedFacts.some((f) => f.includes('dagger')));

      // Attempt 2: All caps with punctuation
      const audit2 = CharacterCanonSteward.auditSpeakerDialogue({
        storyId,
        speakerId,
        speakerName: 'Fiona',
        dialogueText: 'THE VICTIM DIED FROM A CRUSHED SKULL BY A MARBLE BUST!',
        currentLocationId: innocentNpcLocationId,
      });
      assert.equal(audit2.valid, false);
      assert.ok(audit2.leakedFacts.some((f) => f.includes('Crushed skull')));

      // Attempt 3: Multi-word leak of poison
      const audit3 = CharacterCanonSteward.auditSpeakerDialogue({
        storyId,
        speakerId,
        speakerName: 'Fiona',
        dialogueText: 'I think someone hid a vial of nightshade poison somewhere.',
        currentLocationId: innocentNpcLocationId,
      });
      assert.equal(audit3.valid, false);
      assert.ok(audit3.leakedFacts.some((f) => f.includes('nightshade poison')));
    });

    it('allows benign dialogue that mentions only a single mundane keyword without leaking the restricted fact', () => {
      // Florist mentions ordinary nightshade or ordinary flowers
      const audit = CharacterCanonSteward.auditSpeakerDialogue({
        storyId,
        speakerId,
        speakerName: 'Fiona',
        dialogueText: 'I sell nightshade blossoms for floral arrangements, but they are completely fresh.',
        currentLocationId: innocentNpcLocationId,
      });
      // Nightshade fact has keywords: ['nightshade', 'poison', 'vial']. Only 1 matched -> Not a leak!
      assert.equal(audit.valid, true);
      assert.equal(audit.leakedFacts.length, 0);
    });

    it('allows restricted details when speaker is co-located at the crime scene or has legitimately acquired the fact', () => {
      // Scenario A: Speaker is at the crime scene location
      const auditCoLocated = CharacterCanonSteward.auditSpeakerDialogue({
        storyId,
        speakerId,
        speakerName: 'Fiona',
        dialogueText: 'Look at that bloody ceremonial dagger lying on the floor!',
        currentLocationId: crimeLocationId, // Same location as origin
      });
      assert.equal(auditCoLocated.valid, true, 'Speaker present at origin location can observe scene details');

      // Scenario B: Speaker was informed via transmission while at market square
      CharacterCanonSteward.grantFact(storyId, speakerId, {
        factId: 'fact_restricted_weapon',
        subjectEntityId: 'investigation',
        predicate: 'MURDER_WEAPON',
        objectValue: 'Bloody ceremonial silver dagger',
        sourceType: 'DIRECT_CONVERSATION',
        acquiredAtTimestamp: new Date().toISOString(),
        acquiredAtTurn: 3,
        confidence: 0.9,
      });

      const auditInformed = CharacterCanonSteward.auditSpeakerDialogue({
        storyId,
        speakerId,
        speakerName: 'Fiona',
        dialogueText: 'The detective just told me the killer used a bloody ceremonial dagger.',
        currentLocationId: innocentNpcLocationId,
      });
      assert.equal(auditInformed.valid, true, 'Speaker who legitimately knows the fact may discuss it');
    });

    it('detects and blocks ungrounded culprit confessions across multiple phrasing templates', () => {
      const confessionPhrases = [
        'I killed the magistrate in cold blood!',
        'I murdered him behind the curtain.',
        'I stabbed the victim repeatedly.',
        'I poisoned the morning tea.',
        'I strangled the guard to get in.',
        'It is true, I am the killer!',
        'You caught me, I am the murderer.',
      ];

      for (const phrase of confessionPhrases) {
        const audit = CharacterCanonSteward.auditSpeakerDialogue({
          storyId,
          speakerId,
          speakerName: 'Fiona',
          dialogueText: phrase,
          currentLocationId: innocentNpcLocationId,
        });
        assert.equal(audit.valid, false, `Phrase "${phrase}" should be rejected as ungrounded confession`);
        assert.ok(audit.leakedFacts.includes('UNGROUNDED_CULPRIT_CONFESSION'));
      }
    });

    it('allows confessions when NPC is legitimately marked with CULPRIT secret', () => {
      const culpritId = 'npc_true_culprit';
      const culpritCard: EntityCard = {
        id: culpritId,
        storyId,
        name: 'Lord Malakar',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        worldState: { locationId: innocentNpcLocationId, isAlive: true, presence: 'present' },
        personality: { canonicalSecrets: ['CULPRIT', 'MURDERER_OF_VANCE'] },
        createdAt: new Date().toISOString(),
      };
      CharacterCanonSteward.initializeCharacterFromCard(culpritCard);

      const audit = CharacterCanonSteward.auditSpeakerDialogue({
        storyId,
        speakerId: culpritId,
        speakerName: 'Lord Malakar',
        dialogueText: 'I killed him because he was going to expose my debts!',
        currentLocationId: innocentNpcLocationId,
      });
      assert.equal(audit.valid, true, 'True culprit with CULPRIT secret must be permitted to confess');
      assert.equal(audit.leakedFacts.length, 0);
    });

    it('SemanticNarrativeReview.review rejects unobserved fact leaks with UNSUPPORTED_CLAIM', () => {
      const situation: any = {
        storyId,
        turnId: 'turn_review_leak_1',
        location: { id: innocentNpcLocationId, name: 'Market Square' },
        player: { actorId: 'player_actor', name: 'Ren Takahashi' },
        nearbyEntities: [
          { id: speakerId, name: 'Fiona the Florist', displayName: 'Fiona the Florist', kind: 'NPC' },
        ],
        worldFacts: [],
        playerKnowledge: { knownFacts: [], authorizedFactIds: [] },
        sceneEvidence: { entities: [], objects: [], sceneAnchorMatches: [] },
        visibleEvents: [],
        recentTurns: [],
      };

      const intent: any = {
        action: 'question',
        originalText: 'I question Fiona about the strange events',
        explicitTargets: [{ id: speakerId, name: 'Fiona the Florist' }],
      };

      const turnPackage: any = {
        narrative: ['Ren questions the florist about the strange events.'],
        dialogue: [
          {
            speaker: 'Fiona the Florist',
            text: 'The killer used a bloody ceremonial dagger with a serpent hilt, everyone knows it!',
          },
        ],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
      };

      const reviewResult = SemanticNarrativeReview.review({
        situation,
        intent,
        turnPackage,
      });

      assert.equal(reviewResult.decision, 'REJECT');
      assert.ok(reviewResult.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'));
      assert.ok(
        reviewResult.unsupportedClaims.some((c) =>
          c.includes('Bloody ceremonial silver dagger with serpent hilt')
        )
      );
    });
  });

  /* -------------------------------------------------------------------------
   * HARNESS 4: Multi-Hop Rumor Transmission & Confidence Degradation
   * ------------------------------------------------------------------------- */
  describe('Harness 4: Multi-Hop Rumor Transmission Confidence Degradation', () => {
    it('degrades confidence by 20% per rumor hop with a strict 0.4 floor, while direct conversation preserves confidence', () => {
      const factId = 'fact_dragon_sighting';

      // 8 sequential characters in an information relay: A -> B -> C -> D -> E -> F -> G -> H
      const chain = ['npc_a', 'npc_b', 'npc_c', 'npc_d', 'npc_e', 'npc_f', 'npc_g', 'npc_h'];
      for (const id of chain) {
        CharacterCanonSteward.initializeCharacterFromCard({
          id,
          storyId,
          name: `Character ${id}`,
          kind: 'NPC',
          lifecycle: { status: 'ACTIVE' },
          createdAt: new Date().toISOString(),
        });
      }

      // Initial fact granted to eyewitness A (confidence = 1.0)
      CharacterCanonSteward.grantFact(storyId, 'npc_a', {
        factId,
        subjectEntityId: 'creature_dragon',
        predicate: 'SIGHTED_OVER_RIDGE',
        objectValue: 'Ridge of Shadows',
        sourceType: 'CO_LOCATED_WITNESS',
        acquiredAtTimestamp: new Date().toISOString(),
        acquiredAtTurn: 1,
        confidence: 1.0,
      });

      const initialScopeA = CharacterCanonSteward.getScope(storyId, 'npc_a');
      assert.equal(initialScopeA.knownFacts.get(factId)?.confidence, 1.0);

      // Expected confidences:
      // Hop 1 (A -> B): 1.0 * 0.8 = 0.8
      // Hop 2 (B -> C): 0.8 * 0.8 = 0.64
      // Hop 3 (C -> D): 0.64 * 0.8 = 0.512
      // Hop 4 (D -> E): 0.512 * 0.8 = 0.4096
      // Hop 5 (E -> F): max(0.4, 0.4096 * 0.8) = max(0.4, 0.32768) = 0.4
      // Hop 6 (F -> G): max(0.4, 0.4 * 0.8) = 0.4
      // Hop 7 (G -> H): max(0.4, 0.4 * 0.8) = 0.4
      const expected = [0.8, 0.64, 0.512, 0.4096, 0.4, 0.4, 0.4];

      for (let i = 0; i < chain.length - 1; i++) {
        const fromId = chain[i];
        const toId = chain[i + 1];

        const trans = CharacterCanonSteward.transmitFact({
          storyId,
          turnNumber: i + 2,
          timestamp: new Date().toISOString(),
          fromEntityId: fromId,
          toEntityId: toId,
          factId,
          channel: 'RUMOR',
        });

        assert.equal(trans.success, true, `Transmission from ${fromId} to ${toId} should succeed`);

        const toScope = CharacterCanonSteward.getScope(storyId, toId);
        const fact = toScope.knownFacts.get(factId);
        assert.ok(fact);
        assert.equal(fact?.sourceType, 'PLAUSIBLE_TRANSMISSION');
        assert.equal(fact?.transmissionChannel, 'RUMOR');

        const actualConf = fact?.confidence ?? 0;
        const expectedConf = expected[i];
        assert.ok(
          Math.abs(actualConf - expectedConf) < 0.0001,
          `At hop ${i + 1} (${fromId} -> ${toId}), confidence was ${actualConf}, expected ${expectedConf}`
        );
      }

      // DIRECT conversation test: B transmits to a separate NPC_Z via DIRECT
      const directTrans = CharacterCanonSteward.transmitFact({
        storyId,
        turnNumber: 10,
        timestamp: new Date().toISOString(),
        fromEntityId: 'npc_b',
        toEntityId: 'npc_z_direct',
        factId,
        channel: 'DIRECT',
      });
      assert.equal(directTrans.success, true);
      const scopeZ = CharacterCanonSteward.getScope(storyId, 'npc_z_direct');
      const factZ = scopeZ.knownFacts.get(factId);
      assert.ok(factZ);
      assert.equal(factZ?.sourceType, 'DIRECT_CONVERSATION');
      assert.equal(factZ?.confidence, 0.8, 'Direct conversation must preserve confidence without degradation');
    });

    it('enforces secret shareThreshold trust boundaries during transmission', () => {
      const secretFactId = 'fact_royal_bastard';

      CharacterCanonSteward.initializeCharacterFromCard({
        id: 'npc_informant',
        storyId,
        name: 'Informant Giles',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        createdAt: new Date().toISOString(),
      });

      CharacterCanonSteward.grantFact(storyId, 'npc_informant', {
        factId: secretFactId,
        subjectEntityId: 'noble_house',
        predicate: 'SECRET_HEIR',
        objectValue: 'The blacksmith boy is the true heir',
        sourceType: 'AUTHORED_BACKGROUND',
        acquiredAtTimestamp: new Date().toISOString(),
        acquiredAtTurn: 1,
        confidence: 1.0,
        isSecret: true,
        shareThreshold: { minTrust: 65 },
      });

      // Attempt 1: Low trust (trust = 30) -> REJECT
      const lowTrustAttempt = CharacterCanonSteward.transmitFact({
        storyId,
        turnNumber: 2,
        timestamp: new Date().toISOString(),
        fromEntityId: 'npc_informant',
        toEntityId: 'npc_listener',
        factId: secretFactId,
        channel: 'DIRECT',
        currentTrust: 30,
      });
      assert.equal(lowTrustAttempt.success, false);
      assert.ok(lowTrustAttempt.reason?.includes('Insufficient trust'));

      // Attempt 2: Borderline trust (trust = 64) -> REJECT
      const borderAttempt = CharacterCanonSteward.transmitFact({
        storyId,
        turnNumber: 3,
        timestamp: new Date().toISOString(),
        fromEntityId: 'npc_informant',
        toEntityId: 'npc_listener',
        factId: secretFactId,
        channel: 'DIRECT',
        currentTrust: 64,
      });
      assert.equal(borderAttempt.success, false);

      // Attempt 3: Qualifying trust (trust = 65) -> ACCEPT
      const qualifyingAttempt = CharacterCanonSteward.transmitFact({
        storyId,
        turnNumber: 4,
        timestamp: new Date().toISOString(),
        fromEntityId: 'npc_informant',
        toEntityId: 'npc_listener',
        factId: secretFactId,
        channel: 'DIRECT',
        currentTrust: 65,
      });
      assert.equal(qualifyingAttempt.success, true);
      assert.ok(CharacterCanonSteward.isFactKnown(storyId, 'npc_listener', secretFactId));
    });

    it('rejects transmission when source does not possess the fact', () => {
      const bogusAttempt = CharacterCanonSteward.transmitFact({
        storyId,
        turnNumber: 1,
        timestamp: new Date().toISOString(),
        fromEntityId: 'npc_knows_nothing',
        toEntityId: 'npc_listener',
        factId: 'fact_uninvented',
        channel: 'DIRECT',
      });
      assert.equal(bogusAttempt.success, false);
      assert.equal(bogusAttempt.reason, 'Speaker does not possess this fact.');
    });
  });

  /* -------------------------------------------------------------------------
   * HARNESS 5: High-Concurrency & Rapid Bidirectional Relationship Deltas
   * ------------------------------------------------------------------------- */
  describe('Harness 5: High-Concurrency & Rapid Bidirectional Relationship Deltas', () => {
    const partyAId = 'char_detective_ren';
    const partyBId = 'char_suspect_elena';

    beforeEach(() => {
      const registry = worldRepository.getEntityRegistry(storyId);
      registry.upsert({
        id: partyAId,
        storyId,
        name: 'Ren Takahashi',
        kind: 'PLAYER',
        lifecycle: { status: 'ACTIVE' },
        social: { factionIds: [], reputation: {}, relationships: {} },
        createdAt: new Date().toISOString(),
      });

      registry.upsert({
        id: partyBId,
        storyId,
        name: 'Elena Rostova',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        social: { factionIds: [], reputation: {}, relationships: {} },
        createdAt: new Date().toISOString(),
      });
    });

    it('clamps all metrics strictly between 0 and 100 under extreme positive and negative deltas', () => {
      // 1. Extreme negative delta (from base 50 down past -100)
      const negResult = WitnessFactAuthority.applyBidirectionalRelationshipDelta(worldRepository, {
        storyId,
        partyAId,
        partyBId,
        eventId: 'evt_extreme_neg',
        cause: 'BETRAYAL',
        description: 'Discovered catastrophic betrayal',
        symmetricDelta: {
          trust: -100,
          affection: -150,
          respect: -200,
          fear: -50,
          hostility: -80,
          suspicion: -90,
        },
      });

      for (const side of [negResult.forward, negResult.backward]) {
        assert.equal(side.trust, 0, 'Trust must clamp to 0');
        assert.equal(side.affection, 0, 'Affection must clamp to 0');
        assert.equal(side.respect, 0, 'Respect must clamp to 0');
        assert.equal(side.fear, 0, 'Fear must clamp to 0');
        assert.equal(side.hostility, 0, 'Hostility must clamp to 0');
        assert.equal(side.suspicion, 0, 'Suspicion must clamp to 0');
      }

      // 2. Extreme positive delta (from 0 up past 200)
      const posResult = WitnessFactAuthority.applyBidirectionalRelationshipDelta(worldRepository, {
        storyId,
        partyAId,
        partyBId,
        eventId: 'evt_extreme_pos',
        cause: 'RECONCILIATION',
        description: 'Complete miraculous alliance',
        symmetricDelta: {
          trust: 250,
          affection: 300,
          respect: 180,
          fear: 150,
          hostility: 120,
          suspicion: 140,
        },
      });

      for (const side of [posResult.forward, posResult.backward]) {
        assert.equal(side.trust, 100, 'Trust must clamp to 100');
        assert.equal(side.affection, 100, 'Affection must clamp to 100');
        assert.equal(side.respect, 100, 'Respect must clamp to 100');
        assert.equal(side.fear, 100, 'Fear must clamp to 100');
        assert.equal(side.hostility, 100, 'Hostility must clamp to 100');
        assert.equal(side.suspicion, 100, 'Suspicion must clamp to 100');
      }
    });

    it('survives 100 rapid sequential alternating deltas maintaining strict metric invariants & stance validity', () => {
      const deltas = [
        { trust: 15, suspicion: -10, hostility: -5 },
        { trust: -25, suspicion: 30, hostility: 20 },
        { affection: 40, fear: -15, respect: 20 },
        { hostility: 50, suspicion: 40, trust: -30 },
        { fear: 70, respect: -40, affection: -35 },
      ];

      for (let i = 0; i < 100; i++) {
        const delta = deltas[i % deltas.length];
        const res = WitnessFactAuthority.applyBidirectionalRelationshipDelta(worldRepository, {
          storyId,
          partyAId,
          partyBId,
          eventId: `evt_rapid_${i}`,
          cause: 'PLAYER_ACTION',
          description: `Rapid turn ${i}`,
          forwardDelta: delta,
          backwardDelta: {
            trust: -(delta.trust || 0),
            suspicion: -(delta.suspicion || 0),
            hostility: (delta.hostility || 0),
          },
        });

        for (const side of [res.forward, res.backward]) {
          assert.ok(side.trust >= 0 && side.trust <= 100, `Trust out of bounds: ${side.trust}`);
          assert.ok(side.affection >= 0 && side.affection <= 100, `Affection out of bounds: ${side.affection}`);
          assert.ok(side.respect >= 0 && side.respect <= 100, `Respect out of bounds: ${side.respect}`);
          assert.ok(side.fear >= 0 && side.fear <= 100, `Fear out of bounds: ${side.fear}`);
          assert.ok(side.hostility >= 0 && side.hostility <= 100, `Hostility out of bounds: ${side.hostility}`);
          assert.ok(side.suspicion >= 0 && side.suspicion <= 100, `Suspicion out of bounds: ${side.suspicion}`);
          assert.ok(Number.isInteger(side.trust));
          assert.ok(Number.isInteger(side.suspicion));
          assert.ok(
            ['STRONG_FRIEND', 'FRIEND', 'ALLY', 'RELUCTANT_ALLY', 'NEUTRAL', 'STRAINED', 'RIVAL', 'ENEMY'].includes(
              side.stance
            ),
            `Invalid stance: ${side.stance}`
          );
        }
      }
    });

    it('maintains exact 3-way synchronization across DynamicCharacterAgencyEngine, EntityRegistry, and WorldRepository queries', () => {
      const res = WitnessFactAuthority.applyBidirectionalRelationshipDelta(worldRepository, {
        storyId,
        partyAId,
        partyBId,
        eventId: 'evt_sync_check',
        cause: 'PLAYER_ACTION',
        description: 'Interrogation with mixed signals',
        forwardDelta: { trust: 18, affection: 12, suspicion: 22 },
        backwardDelta: { hostility: 33, suspicion: 47, trust: -19 },
      });

      // 1. DynamicCharacterAgencyEngine store
      const agency = worldRepository.getDynamicCharacterAgencyEngine(storyId);
      const agencyRelAB = agency.getRelationship(storyId, partyAId, partyBId);
      const agencyRelBA = agency.getRelationship(storyId, partyBId, partyAId);

      // 2. EntityRegistry store
      const registry = worldRepository.getEntityRegistry(storyId);
      const cardA = registry.get(partyAId);
      const cardB = registry.get(partyBId);
      const cardRelAB = cardA?.social?.relationships?.[partyBId];
      const cardRelBA = cardB?.social?.relationships?.[partyAId];

      // 3. WorldRepository helper query
      const repoBi = worldRepository.getBidirectionalRelationship(storyId, partyAId, partyBId);

      // Verify Forward metrics (A -> B) across all 3 stores
      assert.equal(res.forward.trust, agencyRelAB?.trust);
      assert.equal(res.forward.trust, cardRelAB?.trust);
      assert.equal(res.forward.trust, repoBi.forward?.trust);

      assert.equal(res.forward.suspicion, agencyRelAB?.suspicion);
      assert.equal(res.forward.suspicion, cardRelAB?.suspicion);
      assert.equal(res.forward.suspicion, repoBi.forward?.suspicion);

      // Verify Backward metrics (B -> A) across all 3 stores
      assert.equal(res.backward.hostility, agencyRelBA?.hostility);
      assert.equal(res.backward.hostility, cardRelBA?.hostility);
      assert.equal(res.backward.hostility, repoBi.backward?.hostility);

      assert.equal(res.backward.suspicion, agencyRelBA?.suspicion);
      assert.equal(res.backward.suspicion, cardRelBA?.suspicion);
      assert.equal(res.backward.suspicion, repoBi.backward?.suspicion);

      assert.equal(res.backward.trust, agencyRelBA?.trust);
      assert.equal(res.backward.trust, cardRelBA?.trust);
      assert.equal(res.backward.trust, repoBi.backward?.trust);
    });
  });
});
