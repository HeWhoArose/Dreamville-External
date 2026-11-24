import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  WitnessFactAuthority,
  type WitnessFactInput,
} from '../../server/domain/witnessFactAuthority';
import {
  CharacterCanonSteward,
  type CharacterKnowledgeFact,
} from '../../server/domain/characterCanonSteward';
import {
  DynamicCharacterAgencyEngine,
  type RelationshipDelta,
  type DynamicRelationshipState,
} from '../../server/domain/dynamicCharacterAgency';
import {
  InMemoryWorldRepository,
  worldRepository,
} from '../../server/repositories/worldRepository';
import { SemanticNarrativeReview } from '../../server/domain/semanticNarrativeReview';
import { NarrativeMemoryLifecycle } from '../../server/domain/narrativeMemoryLifecycle';
import { type EntityCard } from '../../server/domain/entityCard';
import { seedE2eStory } from '../e2e-test-helper';

describe('Milestone 4 Challenger 2: Adversarial Verification & Stress Harness', () => {
  // =========================================================================
  // 1. 3-WAY SYNCHRONIZATION INTEGRITY
  // =========================================================================
  describe('1. 3-Way Synchronization Integrity', () => {
    const storyId = 'story_sync_integrity_adv';

    beforeEach(() => {
      seedE2eStory(storyId);
      CharacterCanonSteward.resetStory(storyId);
    });

    it('1.1 Symmetrical delta: Agency, EntityRegistry, and ConsequenceEngine maintain exact sync across forward & backward', () => {
      const registry = worldRepository.getEntityRegistry(storyId);
      registry.upsert({
        id: 'char_alice',
        storyId,
        name: 'Alice Vance',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        worldState: { locationId: 'loc_office', isAlive: true, presence: 'present' },
        social: { factionIds: [], reputation: {}, relationships: {} },
        createdAt: new Date().toISOString(),
      });
      registry.upsert({
        id: 'char_bob',
        storyId,
        name: 'Bob Miller',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        worldState: { locationId: 'loc_office', isAlive: true, presence: 'present' },
        social: { factionIds: [], reputation: {}, relationships: {} },
        createdAt: new Date().toISOString(),
      });

      const symmetricDelta: RelationshipDelta = {
        trust: 15,
        affection: 10,
        respect: 12,
        fear: 5,
        hostility: -8,
        suspicion: 20,
      };

      const result = worldRepository.applyBidirectionalRelationshipDelta(storyId, {
        partyAId: 'char_alice',
        partyBId: 'char_bob',
        eventId: 'evt_symm_sync_01',
        cause: 'COOPERATION',
        description: 'Joint research project initiated.',
        symmetricDelta,
      });

      // 1. Return structure checks
      assert.equal(result.forward.trust, 65, 'Forward trust: 50 + 15 = 65');
      assert.equal(result.forward.affection, 60, 'Forward affection: 50 + 10 = 60');
      assert.equal(result.forward.respect, 62, 'Forward respect: 50 + 12 = 62');
      assert.equal(result.forward.fear, 5, 'Forward fear: 0 + 5 = 5');
      assert.equal(result.forward.hostility, 0, 'Forward hostility: 0 - 8 clamped to 0');
      assert.equal(result.forward.suspicion, 20, 'Forward suspicion: 0 + 20 = 20');

      assert.equal(result.backward.trust, 65, 'Backward trust matches forward');
      assert.equal(result.backward.affection, 60, 'Backward affection matches forward');
      assert.equal(result.backward.respect, 62, 'Backward respect matches forward');
      assert.equal(result.backward.fear, 5, 'Backward fear matches forward');
      assert.equal(result.backward.hostility, 0, 'Backward hostility matches forward');
      assert.equal(result.backward.suspicion, 20, 'Backward suspicion matches forward');

      // 2. DynamicCharacterAgencyEngine internal state
      const agency = worldRepository.getDynamicCharacterAgencyEngine(storyId);
      const agencyRel = agency.getBidirectionalRelationship(storyId, 'char_alice', 'char_bob');
      assert.ok(agencyRel.forward, 'Agency forward relationship exists');
      assert.ok(agencyRel.backward, 'Agency backward relationship exists');
      assert.equal(agencyRel.forward?.trust, 65);
      assert.equal(agencyRel.forward?.suspicion, 20);
      assert.equal(agencyRel.backward?.trust, 65);
      assert.equal(agencyRel.backward?.suspicion, 20);

      // 3. EntityRegistry card reflection
      const cardA = registry.get('char_alice');
      const cardB = registry.get('char_bob');
      assert.ok(cardA?.social?.relationships?.char_bob, 'Card Alice contains relationship to Bob');
      assert.ok(cardB?.social?.relationships?.char_alice, 'Card Bob contains relationship to Alice');

      assert.deepEqual(cardA?.social?.relationships?.char_bob, {
        trust: 65,
        affection: 60,
        respect: 62,
        fear: 5,
        hostility: 0,
        suspicion: 20,
      });

      assert.deepEqual(cardB?.social?.relationships?.char_alice, {
        trust: 65,
        affection: 60,
        respect: 62,
        fear: 5,
        hostility: 0,
        suspicion: 20,
      });

      // 4. Phase 8 ConsequenceEngine synchronization
      const phase8 = worldRepository.getPhase8SimulationEngine(storyId);
      const phase8State = phase8.load(worldRepository as any, storyId);
      const fwdConsequence = phase8State.consequences.relationships['char_alice::char_bob'];
      const bwdConsequence = phase8State.consequences.relationships['char_bob::char_alice'];
      assert.ok(fwdConsequence, 'Phase 8 forward consequence relationship exists');
      assert.ok(bwdConsequence, 'Phase 8 backward consequence relationship exists');
      assert.equal(fwdConsequence.trust, 30, 'Consequence engine trust: 15 * 2 = 30');
      assert.equal(bwdConsequence.trust, 30, 'Consequence engine backward trust: 15 * 2 = 30');
    });

    it('1.2 Asymmetric delta: opposing emotional reactions correctly partition without cross-talk', () => {
      const registry = worldRepository.getEntityRegistry(storyId);
      registry.upsert({
        id: 'char_interrogator',
        storyId,
        name: 'Inspector Vance',
        kind: 'NPC',
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

      const forwardDelta: RelationshipDelta = {
        trust: -10,
        respect: -5,
        hostility: 15,
        suspicion: 40,
      };

      const backwardDelta: RelationshipDelta = {
        trust: -25,
        respect: 10,
        fear: 35,
        hostility: 20,
        suspicion: 15,
      };

      const result = worldRepository.applyBidirectionalRelationshipDelta(storyId, {
        partyAId: 'char_interrogator',
        partyBId: 'char_suspect',
        eventId: 'evt_interrogation_01',
        cause: 'PLAYER_ACTION',
        description: 'Aggressive interrogation under high-intensity lighting.',
        forwardDelta,
        backwardDelta,
      });

      // Interrogator towards Suspect: High suspicion (+40 -> 40), Hostility (+15 -> 15), Trust (50 - 10 = 40), Fear = 0
      assert.equal(result.forward.trust, 40);
      assert.equal(result.forward.suspicion, 40);
      assert.equal(result.forward.hostility, 15);
      assert.equal(result.forward.fear, 0);

      // Suspect towards Interrogator: High fear (+35 -> 35), Suspicion (+15 -> 15), Trust (50 - 25 = 25), Respect (50 + 10 = 60)
      assert.equal(result.backward.trust, 25);
      assert.equal(result.backward.fear, 35);
      assert.equal(result.backward.respect, 60);
      assert.equal(result.backward.suspicion, 15);

      // Verify EntityRegistry mirrors directional divergence exactly
      const cardInterrogator = registry.get('char_interrogator');
      const cardSuspect = registry.get('char_suspect');

      assert.equal(cardInterrogator?.social?.relationships?.char_suspect?.fear, 0);
      assert.equal(cardInterrogator?.social?.relationships?.char_suspect?.suspicion, 40);

      assert.equal(cardSuspect?.social?.relationships?.char_interrogator?.fear, 35);
      assert.equal(cardSuspect?.social?.relationships?.char_interrogator?.suspicion, 15);
    });

    it('1.3 Rapid sequential drift & compounding: 10 consecutive mutations preserve chronological history and exact integers', () => {
      const deltas: Array<{ f: RelationshipDelta; b: RelationshipDelta }> = [
        { f: { suspicion: 10, trust: -5 }, b: { suspicion: 5, fear: 10 } },
        { f: { suspicion: 15, hostility: 10 }, b: { suspicion: 10, fear: 15 } },
        { f: { suspicion: -5, trust: 10 }, b: { suspicion: -5, trust: 5 } },
        { f: { suspicion: 20, fear: 5 }, b: { suspicion: 25, hostility: 20 } },
        { f: { suspicion: -10, trust: 15 }, b: { suspicion: -10, trust: 10 } },
        { f: { hostility: 15, respect: -10 }, b: { hostility: 20, fear: 10 } },
        { f: { suspicion: 25, trust: -20 }, b: { suspicion: 30, trust: -25 } },
        { f: { suspicion: -5, affection: 5 }, b: { suspicion: -5, affection: 5 } },
        { f: { fear: 10, hostility: -5 }, b: { fear: 15, hostility: -10 } },
        { f: { suspicion: 15, respect: 10 }, b: { suspicion: 10, respect: 5 } },
      ];

      for (let i = 0; i < deltas.length; i++) {
        worldRepository.applyBidirectionalRelationshipDelta(storyId, {
          partyAId: 'char_drift_a',
          partyBId: 'char_drift_b',
          eventId: `evt_drift_seq_${i + 1}`,
          cause: 'CIRCUMSTANCE',
          description: `Sequential transition step ${i + 1}`,
          forwardDelta: deltas[i].f,
          backwardDelta: deltas[i].b,
        });
      }

      const agency = worldRepository.getDynamicCharacterAgencyEngine(storyId);
      const rel = agency.getBidirectionalRelationship(storyId, 'char_drift_a', 'char_drift_b');
      assert.ok(rel.forward);
      assert.ok(rel.backward);

      // Verify history count in agency engine
      assert.equal(rel.forward?.history.length, 10, 'Forward relationship history records all 10 transitions');
      assert.equal(rel.backward?.history.length, 10, 'Backward relationship history records all 10 transitions');

      // Verify sequence of eventIds in history
      for (let i = 0; i < 10; i++) {
        assert.equal(rel.forward?.history[i].eventId, `evt_drift_seq_${i + 1}`);
        assert.equal(rel.backward?.history[i].eventId, `evt_drift_seq_${i + 1}_reciprocal`);
      }

      // Verify EntityRegistry matches final agency calculation to the integer
      const registry = worldRepository.getEntityRegistry(storyId);
      const cardA = registry.get('char_drift_a');
      const cardB = registry.get('char_drift_b');

      assert.equal(cardA?.social?.relationships?.char_drift_b?.suspicion, rel.forward?.suspicion);
      assert.equal(cardA?.social?.relationships?.char_drift_b?.trust, rel.forward?.trust);
      assert.equal(cardB?.social?.relationships?.char_drift_a?.suspicion, rel.backward?.suspicion);
      assert.equal(cardB?.social?.relationships?.char_drift_a?.fear, rel.backward?.fear);
    });

    it('1.4 Boundary clamping (overflow & underflow attacks): extreme metrics clamp strictly to [0, 100]', () => {
      // Massive positive overflow
      const overflowResult = worldRepository.applyBidirectionalRelationshipDelta(storyId, {
        partyAId: 'char_clamp_a',
        partyBId: 'char_clamp_b',
        eventId: 'evt_overflow_stress',
        cause: 'PLAYER_ACTION',
        description: 'Massive positive delta attempt',
        symmetricDelta: {
          trust: 9999,
          affection: 500,
          respect: 1200,
          fear: 800,
          hostility: 600,
          suspicion: 1000,
        },
      });

      assert.equal(overflowResult.forward.trust, 100, 'Trust clamped to 100');
      assert.equal(overflowResult.forward.affection, 100, 'Affection clamped to 100');
      assert.equal(overflowResult.forward.respect, 100, 'Respect clamped to 100');
      assert.equal(overflowResult.forward.fear, 100, 'Fear clamped to 100');
      assert.equal(overflowResult.forward.hostility, 100, 'Hostility clamped to 100');
      assert.equal(overflowResult.forward.suspicion, 100, 'Suspicion clamped to 100');

      // Massive negative underflow
      const underflowResult = worldRepository.applyBidirectionalRelationshipDelta(storyId, {
        partyAId: 'char_clamp_a',
        partyBId: 'char_clamp_b',
        eventId: 'evt_underflow_stress',
        cause: 'BETRAYAL',
        description: 'Massive negative delta attempt',
        symmetricDelta: {
          trust: -9999,
          affection: -500,
          respect: -1200,
          fear: -800,
          hostility: -600,
          suspicion: -1000,
        },
      });

      assert.equal(underflowResult.forward.trust, 0, 'Trust clamped to 0');
      assert.equal(underflowResult.forward.affection, 0, 'Affection clamped to 0');
      assert.equal(underflowResult.forward.respect, 0, 'Respect clamped to 0');
      assert.equal(underflowResult.forward.fear, 0, 'Fear clamped to 0');
      assert.equal(underflowResult.forward.hostility, 0, 'Hostility clamped to 0');
      assert.equal(underflowResult.forward.suspicion, 0, 'Suspicion clamped to 0');
    });

    it('1.5 Automatic entity card materialization: novel character pair creates safe valid cards in EntityRegistry', () => {
      const registry = worldRepository.getEntityRegistry(storyId);
      assert.equal(registry.get('novel_actor_x'), undefined);
      assert.equal(registry.get('novel_actor_y'), undefined);

      worldRepository.applyBidirectionalRelationshipDelta(storyId, {
        partyAId: 'novel_actor_x',
        partyBId: 'novel_actor_y',
        eventId: 'evt_novel_spawn',
        cause: 'INITIAL_BOND',
        description: 'First meeting between unfamiliar entities.',
        symmetricDelta: { trust: 10, suspicion: 15 },
      });

      const cardX = registry.get('novel_actor_x');
      const cardY = registry.get('novel_actor_y');

      assert.ok(cardX, 'Card X automatically created');
      assert.ok(cardY, 'Card Y automatically created');
      assert.equal(cardX?.social?.relationships?.novel_actor_y?.trust, 60);
      assert.equal(cardX?.social?.relationships?.novel_actor_y?.suspicion, 15);
      assert.equal(cardY?.social?.relationships?.novel_actor_x?.trust, 60);
      assert.equal(cardY?.social?.relationships?.novel_actor_x?.suspicion, 15);
    });
  });

  // =========================================================================
  // 2. PERSISTENCE ACROSS STORYRUN SAVE & RELOAD
  // =========================================================================
  describe('2. Persistence Across StoryRun Save & Reload', () => {
    it('2.1 Roundtrip into clean isolated repository instance: all facts, cards, agency relationships, and suspicion survive zero-loss', () => {
      const storyId = 'story_persistence_origin';
      seedE2eStory(storyId);

      const originRegistry = worldRepository.getEntityRegistry(storyId);
      originRegistry.upsert({
        id: 'npc_detective_partner',
        storyId,
        name: 'Marcus Bell',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        worldState: { locationId: 'loc_office', isAlive: true, presence: 'present' },
        personality: { canonicalSecrets: ['CORRUPT_COMMISSIONER_BRIBE'] },
        background: { origin: 'Upper District Detective Ward' },
        createdAt: new Date().toISOString(),
      });

      originRegistry.upsert({
        id: 'npc_suspect_smith',
        storyId,
        name: 'Donald Smith',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        worldState: { locationId: 'loc_office', isAlive: true, presence: 'present' },
        createdAt: new Date().toISOString(),
      });

      // 1. Commit criminal action creating witness fact and witness suspicion reaction
      const witnessResult = worldRepository.recordWitnessFact(storyId, {
        storyId,
        turnId: 'turn_crime_10',
        locationId: 'loc_office',
        actorId: 'npc_suspect_smith',
        actionCategory: 'CRIME',
        actionText: 'Smith destroys the ledger of payments.',
        predicate: 'DESTROY_EVIDENCE',
        objectValue: 'payment_ledger',
        summary: 'Smith burned the ledger in the office fireplace.',
      });

      assert.ok(witnessResult.factId);
      assert.ok(witnessResult.witnessIds.includes('npc_detective_partner'));

      // 2. Commit asymmetric relationship delta between player and Marcus Bell
      worldRepository.applyBidirectionalRelationshipDelta(storyId, {
        partyAId: 'player_actor',
        partyBId: 'npc_detective_partner',
        eventId: 'evt_partner_bonding_01',
        cause: 'PLAYER_ACTION',
        description: 'Vow to solve the murder together.',
        forwardDelta: { trust: 30, respect: 25, affection: 15, suspicion: -10 },
        backwardDelta: { trust: 35, respect: 20, affection: 10, suspicion: 5 },
      });

      // Save StoryRun state to flush dynamic agency and entity registry into runtimeState
      worldRepository.saveStoryRun(worldRepository.getStoryRun(storyId)!);
      const savedRun = worldRepository.getStoryRun(storyId)!;
      assert.ok(savedRun);

      // Deep serialize to string to simulate clean disk / database export
      const serializedRunPayload = JSON.parse(JSON.stringify(savedRun));

      // 3. Create a BRAND NEW, completely isolated InMemoryWorldRepository instance
      const cleanRepository = new InMemoryWorldRepository();
      cleanRepository.saveStoryRun(serializedRunPayload);

      // Verify EntityRegistry in clean repo
      const cleanRegistry = cleanRepository.getEntityRegistry(storyId);
      const reloadedPartner = cleanRegistry.get('npc_detective_partner');
      const reloadedSuspect = cleanRegistry.get('npc_suspect_smith');

      assert.ok(reloadedPartner, 'Marcus Bell survives into clean repository');
      assert.ok(reloadedSuspect, 'Smith survives into clean repository');

      // Verify memoryRefs survived on Marcus Bell
      assert.ok(
        reloadedPartner?.memoryRefs?.includes(witnessResult.factId),
        'Witness fact ID survived in partner EntityCard.memoryRefs',
      );

      // Verify DynamicCharacterAgencyEngine rehydrates in clean repository
      const cleanAgency = cleanRepository.getDynamicCharacterAgencyEngine(storyId);
      const partnerRel = cleanAgency.getBidirectionalRelationship(
        storyId,
        'player_actor',
        'npc_detective_partner',
      );

      assert.ok(partnerRel.forward, 'Forward relationship exists in clean repo');
      assert.ok(partnerRel.backward, 'Backward relationship exists in clean repo');

      assert.equal(partnerRel.forward?.trust, 80, 'Forward trust: 50 + 30 = 80');
      assert.equal(partnerRel.forward?.respect, 75, 'Forward respect: 50 + 25 = 75');
      assert.equal(partnerRel.forward?.affection, 65, 'Forward affection: 50 + 15 = 65');
      assert.equal(partnerRel.forward?.suspicion, 0, 'Forward suspicion: 0 - 10 clamped to 0');

      assert.equal(partnerRel.backward?.trust, 85, 'Backward trust: 50 + 35 = 85');
      assert.equal(partnerRel.backward?.respect, 70, 'Backward respect: 50 + 20 = 70');
      assert.equal(partnerRel.backward?.suspicion, 5, 'Backward suspicion: 5 preserved with zero corruption');

      // Verify relationship history survived
      assert.ok(partnerRel.forward?.history.length! >= 1);
      assert.equal(partnerRel.forward?.history[0].eventId, 'evt_partner_bonding_01');

      // Verify EntityCard.social.relationships matches in clean repo
      assert.deepEqual(reloadedPartner?.social?.relationships?.player_actor, {
        trust: 85,
        affection: 60,
        respect: 70,
        fear: 0,
        hostility: 0,
        suspicion: 5,
      });

      // Verify witness suspicion reaction towards Smith survived in clean repo
      const witnessRel = cleanAgency.getRelationship(
        storyId,
        'npc_detective_partner',
        'npc_suspect_smith',
      );
      assert.ok(witnessRel, 'Witness reaction relationship survived');
      assert.equal(witnessRel?.suspicion, 35, 'Witness suspicion towards criminal is 35');
      assert.equal(witnessRel?.hostility, 20, 'Witness hostility towards criminal is 20');
      assert.equal(witnessRel?.trust, 25, 'Witness trust towards criminal dropped to 25');

      // 4. Test re-mutation on the clean repository continues from restored state
      cleanRepository.applyBidirectionalRelationshipDelta(storyId, {
        partyAId: 'player_actor',
        partyBId: 'npc_detective_partner',
        eventId: 'evt_partner_bonding_02',
        cause: 'COOPERATION',
        description: 'Second shared victory.',
        symmetricDelta: { trust: 10, suspicion: 10 },
      });

      const updatedPartnerRel = cleanAgency.getRelationship(
        storyId,
        'player_actor',
        'npc_detective_partner',
      );
      assert.equal(
        updatedPartnerRel?.trust,
        90,
        'Re-mutation builds upon 80: 80 + 10 = 90 (not reset to 50 + 10)',
      );
      assert.equal(
        updatedPartnerRel?.suspicion,
        10,
        'Suspicion increases correctly upon 0: 0 + 10 = 10',
      );
    });
  });

  // =========================================================================
  // 3. EPISTEMIC INVERSION ATTACKS
  // =========================================================================
  describe('3. Epistemic Inversion Attacks', () => {
    const storyId = 'story_epistemic_inversion';

    beforeEach(() => {
      seedE2eStory(storyId);
      CharacterCanonSteward.resetStory(storyId);
    });

    it('3.1 Location-based fact isolation: bystander at distant location receives ZERO knowledge of crime scene secret', () => {
      const registry = worldRepository.getEntityRegistry(storyId);

      // Crime scene witness at loc_crime_vault
      registry.upsert({
        id: 'npc_scene_witness',
        storyId,
        name: 'Vault Sentry',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        worldState: { locationId: 'loc_crime_vault', isAlive: true, presence: 'present' },
        createdAt: new Date().toISOString(),
      });

      // Distant bystander at loc_tavern
      registry.upsert({
        id: 'npc_tavern_patron',
        storyId,
        name: 'Tavern Patron',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        worldState: { locationId: 'loc_tavern', isAlive: true, presence: 'present' },
        createdAt: new Date().toISOString(),
      });

      // Register restricted investigation secret at loc_crime_vault
      CharacterCanonSteward.registerRestrictedInvestigationFact({
        storyId,
        factId: 'fact_restricted_poison_vial',
        summary: 'Cyanide vial with royal crest found behind bookcase',
        originLocationId: 'loc_crime_vault',
        keywords: ['cyanide', 'vial', 'royal crest', 'bookcase'],
      });

      // Player discovers secret at loc_crime_vault in presence of Vault Sentry
      worldRepository.recordWitnessFact(storyId, {
        storyId,
        turnId: 'turn_vault_search_1',
        locationId: 'loc_crime_vault',
        actorId: 'player_actor',
        actionCategory: 'INVESTIGATION',
        actionText: 'I discover the cyanide vial with the royal crest hidden in the bookcase.',
        predicate: 'DISCOVER_SECRET',
        objectValue: 'cyanide_royal_crest',
        summary: 'Cyanide vial with royal crest discovered in the vault bookcase.',
      });

      // 1. Vault Sentry KNOWS the fact
      assert.ok(
        CharacterCanonSteward.isFactKnown(storyId, 'npc_scene_witness', 'fact_restricted_poison_vial') ||
        worldRepository.getAuthorizedKnowledgeFacts(storyId, 'npc_scene_witness').some((f) => f.id.includes('fact_restricted_poison_vial') || f.objectValue === 'cyanide_royal_crest'),
        'Vault sentry is authorized for witnessed crime secret',
      );

      // 2. Tavern Patron at loc_tavern MUST NOT KNOW the fact
      assert.equal(
        CharacterCanonSteward.isFactKnown(storyId, 'npc_tavern_patron', 'fact_restricted_poison_vial'),
        false,
        'Distant tavern patron does NOT know restricted secret via CharacterCanonSteward',
      );

      const patronFacts = worldRepository.getAuthorizedKnowledgeFacts(storyId, 'npc_tavern_patron');
      const hasLeakedFact = patronFacts.some(
        (f) => f.objectValue === 'cyanide_royal_crest' || f.id === 'fact_restricted_poison_vial',
      );
      assert.equal(hasLeakedFact, false, 'Distant patron cannot access secret in getAuthorizedKnowledgeFacts');

      // 3. Unauthenticated query returns only public facts
      const publicOnly = worldRepository.getAuthorizedKnowledgeFacts(storyId);
      assert.equal(
        publicOnly.some((f) => f.objectValue === 'cyanide_royal_crest'),
        false,
        'Secret fact is strictly omitted from public-only knowledge',
      );
    });

    it('3.2 Speaker prompt boundary conditioning: explicitly labels unobserved facts as UNKNOWN for distant NPC', () => {
      CharacterCanonSteward.registerRestrictedInvestigationFact({
        storyId,
        factId: 'fact_murder_weapon_revolver',
        summary: 'Silver-plated .38 revolver hidden beneath floorboard',
        originLocationId: 'loc_crime_scene',
        keywords: ['revolver', 'floorboard', 'silver-plated'],
      });

      const promptBlock = CharacterCanonSteward.getSpeakerEpistemicPromptBlock({
        storyId,
        speakerId: 'npc_dockworker',
        speakerName: 'Barnaby the Dockworker',
        currentLocationId: 'loc_docks',
      });

      assert.ok(promptBlock.includes('[NPC KNOWLEDGE BOUNDARY — Barnaby the Dockworker]'));
      assert.ok(promptBlock.includes('EXPLICITLY UNKNOWN (Speaker has NO direct knowledge of):'));
      assert.ok(
        promptBlock.includes('Silver-plated .38 revolver hidden beneath floorboard'),
        'Restricted secret is explicitly placed in forbidden unknown list',
      );
      assert.ok(
        promptBlock.includes('Never reveal secret clues, unobserved crime details, or ungrounded culprit confessions'),
      );
    });

    it('3.3 Mode 7 dialogue audit: rejects dialogue containing unobserved crime details or ungrounded culprit confession', () => {
      CharacterCanonSteward.registerRestrictedInvestigationFact({
        storyId,
        factId: 'fact_autopsy_wound',
        summary: 'Victim was poisoned by aconite before being stabbed',
        originLocationId: 'loc_morgue',
        keywords: ['poisoned', 'aconite', 'stabbed'],
      });

      // Adversarial attack 1: Bystander mentions restricted details they never observed
      const leakAudit = CharacterCanonSteward.auditSpeakerDialogue({
        storyId,
        speakerId: 'npc_innkeeper',
        speakerName: 'Giles the Innkeeper',
        dialogueText: 'I hear the poor victim was poisoned by aconite before they were stabbed!',
        currentLocationId: 'loc_inn',
      });

      assert.equal(leakAudit.valid, false, 'Audit must flag unobserved crime detail leak');
      assert.ok(leakAudit.leakedFacts.includes('Victim was poisoned by aconite before being stabbed'));
      assert.ok(leakAudit.violationMessage?.includes('leaked unobserved facts'));

      // Adversarial attack 2: Ungrounded culprit confession by innocent bystander
      const falseConfessionAudit = CharacterCanonSteward.auditSpeakerDialogue({
        storyId,
        speakerId: 'npc_bystander_innocent',
        speakerName: 'Tommy the Beggar',
        dialogueText: 'You caught me! I killed the victim in cold blood!',
        currentLocationId: 'loc_alley',
      });

      assert.equal(falseConfessionAudit.valid, false, 'Audit must flag ungrounded culprit confession');
      assert.ok(falseConfessionAudit.leakedFacts.includes('UNGROUNDED_CULPRIT_CONFESSION'));

      // Valid legitimate dialogue within scope passes
      const validAudit = CharacterCanonSteward.auditSpeakerDialogue({
        storyId,
        speakerId: 'npc_innkeeper',
        speakerName: 'Giles the Innkeeper',
        dialogueText: 'Terrible stormy weather we have tonight. Can I get you an ale?',
        currentLocationId: 'loc_inn',
      });

      assert.equal(validAudit.valid, true, 'Everyday dialogue within boundary passes audit');
      assert.equal(validAudit.leakedFacts.length, 0);
    });

    it('3.4 SemanticNarrativeReview pipeline defense: full review triggers UNSUPPORTED_CLAIM and rejects turn package', () => {
      CharacterCanonSteward.registerRestrictedInvestigationFact({
        storyId,
        factId: 'fact_vault_combination',
        summary: 'Combination 7-4-2-9 unlocks the steel safe',
        originLocationId: 'loc_bank_vault',
        keywords: ['combination', '7-4-2-9', 'steel safe'],
      });

      const review = SemanticNarrativeReview.review({
        intent: {
          category: 'CONVERSATION',
          rawInput: 'Ask the street vendor what they know about the safe',
          confidence: 1,
        },
        situation: {
          storyId,
          turnNumber: 2,
          worldClock: worldRepository.getWorldClock(storyId),
          player: { actorId: 'player_actor', name: 'Detective' } as any,
          location: { id: 'loc_market_square', name: 'Market Square' } as any,
          nearbyEntities: [
            {
              id: 'npc_street_vendor',
              name: 'Street Vendor',
              displayName: 'Street Vendor',
              kind: 'NPC',
              presence: 'present',
              isAlive: true,
            } as any,
          ],
          availableActions: [],
          sensoryProfile: {} as any,
        },
        plan: {
          turnId: 'turn_market_review_1',
          objective: 'Question vendor',
          immediateSteps: [],
          informationToReveal: [],
          entitiesToReact: [],
          continuityRequirements: [],
          forbiddenAssumptions: [],
          stateEffectsExpected: [],
          createdAt: 'Day 1',
          expiresAfterNarration: true,
        },
        turnPackage: {
          narrative: ['The street vendor leans across the cart and whispers suspiciously.'],
          dialogue: [
            {
              speaker: 'Street Vendor',
              text: 'Psst, I know the combination 7-4-2-9 unlocks the steel safe in the vault!',
            },
          ],
          events: [],
          stateChanges: [],
          memoryCandidates: [],
          audioCues: [],
          visualCues: [],
        },
      });

      assert.equal(review.decision, 'REJECT', 'Turn package must be REJECTED when dialogue leaks restricted secrets');
      const unsupportedViolation = review.violations.find((v) => v.code === 'UNSUPPORTED_CLAIM');
      assert.ok(unsupportedViolation, 'Must record UNSUPPORTED_CLAIM violation');
      assert.ok(review.unsupportedClaims.includes('Combination 7-4-2-9 unlocks the steel safe'));
    });

    it('3.5 Fact transmission authorization & trust gating: secrets require sufficient trust to transmit', () => {
      // NPC 1 knows a secret fact with a minTrust threshold of 60
      CharacterCanonSteward.grantFact(storyId, 'npc_source_agent', {
        factId: 'fact_top_secret_dossier',
        subjectEntityId: 'mayor',
        predicate: 'EMBEZZLED',
        objectValue: 'pension_funds',
        sourceType: 'AUTHORED_BACKGROUND',
        acquiredAtTimestamp: new Date().toISOString(),
        acquiredAtTurn: 1,
        confidence: 1.0,
        isSecret: true,
        shareThreshold: { minTrust: 60 },
      });

      // Attempt 1: Low trust (trust = 30 < 60) -> MUST FAIL
      const lowTrustResult = CharacterCanonSteward.transmitFact({
        storyId,
        turnNumber: 2,
        timestamp: new Date().toISOString(),
        fromEntityId: 'npc_source_agent',
        toEntityId: 'npc_target_agent',
        factId: 'fact_top_secret_dossier',
        channel: 'DIRECT',
        currentTrust: 30,
      });

      assert.equal(lowTrustResult.success, false, 'Transmission blocked under low trust');
      assert.ok(lowTrustResult.reason?.includes('Insufficient trust'));
      assert.equal(
        CharacterCanonSteward.isFactKnown(storyId, 'npc_target_agent', 'fact_top_secret_dossier'),
        false,
        'Target agent did NOT acquire secret',
      );

      // Attempt 2: High trust (trust = 75 >= 60) -> MUST SUCCEED
      const highTrustResult = CharacterCanonSteward.transmitFact({
        storyId,
        turnNumber: 3,
        timestamp: new Date().toISOString(),
        fromEntityId: 'npc_source_agent',
        toEntityId: 'npc_target_agent',
        factId: 'fact_top_secret_dossier',
        channel: 'DIRECT',
        currentTrust: 75,
      });

      assert.equal(highTrustResult.success, true, 'Transmission succeeds when trust threshold is met');
      assert.equal(
        CharacterCanonSteward.isFactKnown(storyId, 'npc_target_agent', 'fact_top_secret_dossier'),
        true,
        'Target agent now legitimately knows the secret',
      );

      // Attempt 3: Rumor propagation channel decays confidence by 0.8
      CharacterCanonSteward.transmitFact({
        storyId,
        turnNumber: 4,
        timestamp: new Date().toISOString(),
        fromEntityId: 'npc_target_agent',
        toEntityId: 'npc_rumor_listener',
        factId: 'fact_top_secret_dossier',
        channel: 'RUMOR',
        currentTrust: 80,
      });

      const rumorScope = CharacterCanonSteward.getScope(storyId, 'npc_rumor_listener');
      const rumorFact = rumorScope.knownFacts.get('fact_top_secret_dossier');
      assert.ok(rumorFact);
      assert.equal(rumorFact?.confidence, 0.8, 'Rumor propagation decayed confidence to 0.8');
      assert.equal(rumorFact?.sourceType, 'PLAUSIBLE_TRANSMISSION');
    });
  });

  // =========================================================================
  // 4. WITNESS QUALIFICATION BOUNDARIES & MEMORY LIFECYCLE
  // =========================================================================
  describe('4. Witness Qualification Boundaries & Memory Lifecycle', () => {
    const storyId = 'story_witness_bounds_adv';

    beforeEach(() => {
      seedE2eStory(storyId);
      CharacterCanonSteward.resetStory(storyId);
    });

    it('4.1 getPresentWitnesses strictly filters dead, hidden, absent, and distant entities, and includes player when NPC acts', () => {
      const registry = worldRepository.getEntityRegistry(storyId);

      // 1. Alive present NPC
      registry.upsert({
        id: 'npc_valid_bystander',
        storyId,
        name: 'Valid Bystander',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        worldState: { locationId: 'loc_courtyard', isAlive: true, presence: 'present' },
        createdAt: new Date().toISOString(),
      });

      // 2. Dead NPC
      registry.upsert({
        id: 'npc_corpse',
        storyId,
        name: 'Dead Victim',
        kind: 'NPC',
        lifecycle: { status: 'DEAD' },
        worldState: { locationId: 'loc_courtyard', isAlive: false, presence: 'present' },
        createdAt: new Date().toISOString(),
      });

      // 3. Hidden NPC
      registry.upsert({
        id: 'npc_hidden_assassin',
        storyId,
        name: 'Hidden Assassin',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        worldState: { locationId: 'loc_courtyard', isAlive: true, presence: 'present' },
        metadata: { hidden: true },
        createdAt: new Date().toISOString(),
      });

      // 4. Absent NPC
      registry.upsert({
        id: 'npc_absent_guard',
        storyId,
        name: 'Absent Guard',
        kind: 'NPC',
        lifecycle: { status: 'ACTIVE' },
        worldState: { locationId: 'loc_courtyard', isAlive: true, presence: 'absent' },
        createdAt: new Date().toISOString(),
      });

      // 5. Setup Player at loc_courtyard
      const playerLife = worldRepository.getPlayerLifecycle(storyId)!;
      const updatedPlayer = playerLife.copyWith({ locationId: 'loc_courtyard' });
      worldRepository.updatePlayerLifecycle(storyId, updatedPlayer);

      registry.upsert({
        id: playerLife.actorId,
        storyId,
        name: playerLife.name,
        kind: 'PLAYER',
        lifecycle: { status: 'ACTIVE' },
        worldState: { locationId: 'loc_courtyard', isAlive: true, presence: 'present' },
        createdAt: new Date().toISOString(),
      });

      // When NPC acts: Player MUST be included as a witness, but dead/hidden/absent excluded
      const witnessesToNpcAction = worldRepository.getPresentWitnesses(
        storyId,
        'loc_courtyard',
        'npc_valid_bystander',
      );
      const witnessIds = witnessesToNpcAction.map((w) => w.id);

      assert.ok(witnessIds.includes(playerLife.actorId), 'Player is counted as a witness when NPC acts');
      assert.ok(!witnessIds.includes('npc_valid_bystander'), 'Actor is excluded');
      assert.ok(!witnessIds.includes('npc_corpse'), 'Dead entity cannot witness');
      assert.ok(!witnessIds.includes('npc_hidden_assassin'), 'Hidden entity cannot witness');
      assert.ok(!witnessIds.includes('npc_absent_guard'), 'Absent entity cannot witness');
    });

    it('4.2 Unified Memory Lifecycle: turn degradation from active to dormant to archived with floor protection', () => {
      const memoryEngine = worldRepository.getMemoryEngine(storyId);

      // Unreinforced standard memory
      memoryEngine.storeMemory({
        id: 'mem_ordinary_gossip',
        storyId,
        memoryClass: 'EPISODIC',
        subjectEntityId: 'player_actor',
        relatedEntityIds: ['npc_merchant'],
        content: 'Merchant gossiped about carriage arrivals.',
        importance: 50,
        confidence: 0.9,
        status: 'active',
        visibility: 'SHARED',
        accessibleToEntityIds: ['player_actor', 'npc_merchant'],
        isPersistentCritical: false,
        provenance: 'test',
        validFromTurn: 1,
        lastRecalledTurn: 1,
        triggerConditionTags: ['carriage'],
      });

      // Floor-protected critical memory
      memoryEngine.storeMemory({
        id: 'mem_crucial_plot_revelation',
        storyId,
        memoryClass: 'CAUSAL',
        subjectEntityId: 'player_actor',
        relatedEntityIds: [],
        content: 'The prime minister signed the secret treaty.',
        importance: 85,
        confidence: 1.0,
        status: 'active',
        isPersistentCritical: true, // Floor protection
        provenance: 'canon_beat',
        validFromTurn: 1,
        lastRecalledTurn: 1,
        triggerConditionTags: ['treaty', 'prime_minister'],
      });

      // 1. Advance 25 turns -> mem_ordinary_gossip becomes dormant (importance 50 -> 40)
      memoryEngine.decayMemories({ storyId, currentTurn: 26 });
      const dormantMem = memoryEngine.getMemory('mem_ordinary_gossip');
      assert.equal(dormantMem?.status, 'dormant');
      assert.equal(dormantMem?.importance, 40);

      const protected1 = memoryEngine.getMemory('mem_crucial_plot_revelation');
      assert.equal(protected1?.status, 'active', 'Persistent critical memory does not become dormant');
      assert.equal(protected1?.importance, 85, 'Importance does not drop');

      // 2. Advance 120 turns -> mem_ordinary_gossip becomes archived
      memoryEngine.decayMemories({ storyId, currentTurn: 150 });
      const archivedMem = memoryEngine.getMemory('mem_ordinary_gossip');
      assert.equal(archivedMem?.status, 'archived');
      assert.equal(archivedMem?.importance, 25);

      const protected2 = memoryEngine.getMemory('mem_crucial_plot_revelation');
      assert.equal(protected2?.status, 'active', 'Persistent critical memory remains active at turn 150');
      assert.equal(protected2?.importance, 85, 'Importance remains intact');
    });
  });
});
