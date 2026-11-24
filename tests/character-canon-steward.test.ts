import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CharacterCanonSteward,
  type CharacterKnowledgeFact,
} from '../server/domain/characterCanonSteward';
import { SemanticNarrativeReview } from '../server/domain/semanticNarrativeReview';
import { worldRepository } from '../server/repositories/worldRepository';
import { seedE2eStory } from './e2e-test-helper';
import { EntityCard } from '../server/domain/entityCard';

describe('CharacterCanonSteward & Independent Knowledge Boundaries (F18)', () => {
  const storyId = 'test_story_canon_steward';

  beforeEach(() => {
    seedE2eStory(storyId);
    CharacterCanonSteward.resetStory(storyId);
  });

  it('initializes character authored background knowledge from EntityCard', () => {
    const card: EntityCard = {
      id: 'npc_innkeeper_1',
      storyId,
      name: 'Barnaby Finch',
      kind: 'NPC',
      lifecycle: { status: 'ACTIVE' },
      classification: {
        role: 'Innkeeper',
        profession: 'Tavern Keeper',
        tags: ['hospitality', 'local_lore'],
      },
      worldState: {
        locationId: 'loc_tavern',
        isAlive: true,
        presence: 'present',
      },
      personality: {
        canonicalSecrets: ['SECRET_CELLAR_SMUGGLING'],
      },
      background: {
        origin: 'Born in Port Blackwood',
        importantEvents: ['Took over tavern in year 42'],
      },
      createdAt: new Date().toISOString(),
    };

    const scope = CharacterCanonSteward.initializeCharacterFromCard(card);
    assert.equal(scope.characterId, 'npc_innkeeper_1');
    assert.ok(scope.domainExpertise.includes('Innkeeper'));
    assert.ok(scope.domainExpertise.includes('Tavern Keeper'));
    assert.ok(scope.domainExpertise.includes('hospitality'));
    assert.ok(scope.knownLocationIds.has('loc_tavern'));
    assert.ok(scope.privateSecrets.includes('SECRET_CELLAR_SMUGGLING'));

    // Check authored background fact was granted
    const facts = Array.from(scope.knownFacts.values());
    const originFact = facts.find((f) => f.predicate === 'ORIGIN');
    assert.ok(originFact);
    assert.equal(originFact?.objectValue, 'Born in Port Blackwood');
    assert.equal(originFact?.sourceType, 'AUTHORED_BACKGROUND');
  });

  it('epistemic isolation: co-located witness learns fact, distant NPC remains unaware', () => {
    const registry = worldRepository.getEntityRegistry(storyId);

    // Setup co-located witness at loc_tavern
    registry.upsert({
      id: 'npc_witness_tavern',
      storyId,
      name: 'Tavern Witness',
      kind: 'NPC',
      lifecycle: { status: 'ACTIVE' },
      worldState: { locationId: 'loc_tavern', isAlive: true, presence: 'present' },
      createdAt: new Date().toISOString(),
    });

    // Setup distant NPC at loc_docks
    registry.upsert({
      id: 'npc_distant_docks',
      storyId,
      name: 'Distant Dockworker',
      kind: 'NPC',
      lifecycle: { status: 'ACTIVE' },
      worldState: { locationId: 'loc_docks', isAlive: true, presence: 'present' },
      createdAt: new Date().toISOString(),
    });

    // Action occurs at loc_tavern
    const witnesses = CharacterCanonSteward.recordWitnessedAction({
      repository: worldRepository,
      storyId,
      locationId: 'loc_tavern',
      turnNumber: 1,
      timestamp: new Date().toISOString(),
      actorId: 'player_actor',
      factId: 'fact_pickpocket_1',
      predicate: 'PICKPOCKET',
      objectValue: 'gold_pouch',
      summary: 'Player pickpocketed the merchant gold pouch',
    });

    assert.ok(witnesses.includes('npc_witness_tavern'));
    assert.ok(!witnesses.includes('npc_distant_docks'));

    assert.equal(CharacterCanonSteward.isFactKnown(storyId, 'npc_witness_tavern', 'fact_pickpocket_1'), true);
    assert.equal(CharacterCanonSteward.isFactKnown(storyId, 'npc_distant_docks', 'fact_pickpocket_1'), false);

    // Verify through worldRepository authorized facts
    const witnessFacts = worldRepository.getAuthorizedKnowledgeFacts(storyId, 'npc_witness_tavern');
    const distantFacts = worldRepository.getAuthorizedKnowledgeFacts(storyId, 'npc_distant_docks');

    assert.ok(witnessFacts.some((f) => f.id === 'fact_pickpocket_1'));
    assert.ok(!distantFacts.some((f) => f.id === 'fact_pickpocket_1'));
  });

  it('fact transmission: direct conversation and rumor propagation with confidence decay', () => {
    const fact: CharacterKnowledgeFact = {
      factId: 'fact_secret_meeting_1',
      subjectEntityId: 'npc_councilor',
      predicate: 'SECRET_MEETING',
      objectValue: 'conspired with smugglers',
      sourceType: 'CO_LOCATED_WITNESS',
      acquiredAtTimestamp: new Date().toISOString(),
      acquiredAtTurn: 1,
      confidence: 1.0,
    };

    CharacterCanonSteward.grantFact(storyId, 'npc_witness_A', fact);

    // Direct conversation: high confidence
    const directResult = CharacterCanonSteward.transmitFact({
      storyId,
      turnNumber: 2,
      timestamp: new Date().toISOString(),
      fromEntityId: 'npc_witness_A',
      toEntityId: 'npc_friend_B',
      factId: 'fact_secret_meeting_1',
      channel: 'DIRECT',
    });
    assert.equal(directResult.success, true);
    const scopeB = CharacterCanonSteward.getScope(storyId, 'npc_friend_B');
    const factB = scopeB.knownFacts.get('fact_secret_meeting_1');
    assert.ok(factB);
    assert.equal(factB?.sourceType, 'DIRECT_CONVERSATION');
    assert.equal(factB?.confidence, 1.0);

    // Rumor propagation: confidence decay
    const rumorResult = CharacterCanonSteward.transmitFact({
      storyId,
      turnNumber: 3,
      timestamp: new Date().toISOString(),
      fromEntityId: 'npc_friend_B',
      toEntityId: 'npc_townsperson_C',
      factId: 'fact_secret_meeting_1',
      channel: 'RUMOR',
    });
    assert.equal(rumorResult.success, true);
    const scopeC = CharacterCanonSteward.getScope(storyId, 'npc_townsperson_C');
    const factC = scopeC.knownFacts.get('fact_secret_meeting_1');
    assert.ok(factC);
    assert.equal(factC?.sourceType, 'PLAUSIBLE_TRANSMISSION');
    assert.equal(factC?.confidence, 0.8); // 1.0 * 0.8
  });

  it('secret disclosure share threshold: rejects transmission when trust is insufficient', () => {
    const secretFact: CharacterKnowledgeFact = {
      factId: 'fact_hidden_safe_combo',
      subjectEntityId: 'npc_banker',
      predicate: 'SAFE_COMBINATION',
      objectValue: '44-12-89',
      sourceType: 'AUTHORED_BACKGROUND',
      acquiredAtTimestamp: new Date().toISOString(),
      acquiredAtTurn: 0,
      confidence: 1.0,
      isSecret: true,
      shareThreshold: {
        minTrust: 75,
      },
    };

    CharacterCanonSteward.grantFact(storyId, 'npc_banker', secretFact);

    // Low trust attempt (trust = 30 < 75)
    const lowTrustResult = CharacterCanonSteward.transmitFact({
      storyId,
      turnNumber: 2,
      timestamp: new Date().toISOString(),
      fromEntityId: 'npc_banker',
      toEntityId: 'player_actor',
      factId: 'fact_hidden_safe_combo',
      channel: 'DIRECT',
      currentTrust: 30,
    });
    assert.equal(lowTrustResult.success, false);
    assert.ok(lowTrustResult.reason?.includes('Insufficient trust'));
    assert.equal(CharacterCanonSteward.isFactKnown(storyId, 'player_actor', 'fact_hidden_safe_combo'), false);

    // High trust attempt (trust = 80 >= 75)
    const highTrustResult = CharacterCanonSteward.transmitFact({
      storyId,
      turnNumber: 3,
      timestamp: new Date().toISOString(),
      fromEntityId: 'npc_banker',
      toEntityId: 'player_actor',
      factId: 'fact_hidden_safe_combo',
      channel: 'DIRECT',
      currentTrust: 80,
    });
    assert.equal(highTrustResult.success, true);
    assert.equal(CharacterCanonSteward.isFactKnown(storyId, 'player_actor', 'fact_hidden_safe_combo'), true);
  });

  it('speaker epistemic prompt block generates allowed facts and explicitly unknown topics', () => {
    CharacterCanonSteward.registerRestrictedInvestigationFact({
      storyId,
      factId: 'fact_crime_scene_velvet_rope',
      summary: 'Victim was strangled with a velvet rope at the manor',
      originLocationId: 'loc_manor_crime_scene',
      keywords: ['velvet', 'rope', 'strangled', 'manor'],
    });

    const card: EntityCard = {
      id: 'npc_dockworker_tom',
      storyId,
      name: 'Tom the Dockworker',
      kind: 'NPC',
      lifecycle: { status: 'ACTIVE' },
      classification: { role: 'Dockworker', profession: 'Stevedore' },
      worldState: { locationId: 'loc_docks', isAlive: true, presence: 'present' },
      createdAt: new Date().toISOString(),
    };
    CharacterCanonSteward.initializeCharacterFromCard(card);

    const promptBlock = CharacterCanonSteward.getSpeakerEpistemicPromptBlock({
      storyId,
      speakerId: 'npc_dockworker_tom',
      speakerName: 'Tom',
      currentLocationId: 'loc_docks',
    });

    assert.ok(promptBlock.includes('[NPC KNOWLEDGE BOUNDARY — Tom]'));
    assert.ok(promptBlock.includes('Role/Expertise: Dockworker, Stevedore'));
    assert.ok(promptBlock.includes('EXPLICITLY UNKNOWN'));
    assert.ok(promptBlock.includes('Victim was strangled with a velvet rope at the manor'));
    assert.ok(promptBlock.includes('speaker MUST state ignorance or speculation'));
  });

  it('Mode 7 defense: dialogue audit detects unobserved crime scene details leak', () => {
    CharacterCanonSteward.registerRestrictedInvestigationFact({
      storyId,
      factId: 'fact_poison_bottle',
      summary: 'Victim consumed rare aconite poison from a green bottle',
      originLocationId: 'loc_crime_scene',
      keywords: ['aconite', 'poison', 'green', 'bottle'],
    });

    // Innocent bystander at the market speaks about the unobserved poison
    const audit = CharacterCanonSteward.auditSpeakerDialogue({
      storyId,
      speakerId: 'npc_market_vendor',
      speakerName: 'Market Vendor',
      dialogueText: 'I hear the victim drank rare aconite poison from a green bottle in the parlor.',
      currentLocationId: 'loc_market',
    });

    assert.equal(audit.valid, false);
    assert.ok(audit.leakedFacts.includes('Victim consumed rare aconite poison from a green bottle'));
    assert.ok(audit.violationMessage?.includes('Market Vendor'));
  });

  it('Mode 7 defense: dialogue audit detects ungrounded culprit confession', () => {
    const audit = CharacterCanonSteward.auditSpeakerDialogue({
      storyId,
      speakerId: 'npc_innocent_bystander',
      speakerName: 'Bystander',
      dialogueText: 'You caught me! I murdered Lord Blackwood and hid the body!',
      currentLocationId: 'loc_street',
    });

    assert.equal(audit.valid, false);
    assert.ok(audit.leakedFacts.includes('UNGROUNDED_CULPRIT_CONFESSION'));
  });

  it('SemanticNarrativeReview rejects dialogue that leaks restricted facts outside speaker scope', () => {
    CharacterCanonSteward.registerRestrictedInvestigationFact({
      storyId,
      factId: 'fact_secret_safe_code',
      summary: 'Vault combination is 99-88-77',
      originLocationId: 'loc_secret_vault',
      keywords: ['vault', 'combination', '99-88-77'],
    });

    const situation: any = {
      storyId,
      turnId: 'turn_test_1',
      location: { id: 'loc_street', name: 'High Street' },
      player: { actorId: 'player_actor', name: 'Detective' },
      nearbyEntities: [
        { id: 'npc_bystander_1', name: 'Bystander Bob', displayName: 'Bystander Bob', kind: 'NPC' },
      ],
      worldFacts: [],
      playerKnowledge: { knownFacts: [], authorizedFactIds: [] },
      sceneEvidence: { entities: [], objects: [], sceneAnchorMatches: [] },
      visibleEvents: [],
      recentTurns: [],
    };

    const intent: any = {
      action: 'interrogate',
      originalText: 'I ask Bystander Bob about the vault',
      explicitTargets: [{ id: 'npc_bystander_1', name: 'Bystander Bob' }],
    };

    const turnPackage: any = {
      narrative: ['The detective approaches Bystander Bob.'],
      dialogue: [
        {
          speaker: 'Bystander Bob',
          text: 'Everyone knows the vault combination is 99-88-77, Detective.',
        },
      ],
      events: [],
      stateChanges: [],
      memoryCandidates: [],
    };

    const review = SemanticNarrativeReview.review({
      situation,
      intent,
      turnPackage,
    });

    assert.equal(review.decision, 'REJECT');
    assert.ok(review.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'));
    assert.ok(review.unsupportedClaims.some((c) => c.includes('Vault combination is 99-88-77')));
  });
});
