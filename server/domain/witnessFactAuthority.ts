import { deterministicId, formatCanonicalTimestamp } from './deterministicRng';
import type { WorldRepository } from '../repositories/worldRepository';
import type { EntityCard } from './entityCard';
import type { KnowledgeFact } from './types';
import type {
  RelationshipCause,
  RelationshipDelta,
  DynamicRelationshipState,
} from './dynamicCharacterAgency';
import { CharacterCanonSteward } from './characterCanonSteward';

export interface WitnessFactInput {
  storyId: string;
  turnId: string;
  locationId: string;
  actorId: string;
  actionText: string;
  predicate: string;
  objectValue: string;
  summary: string;
  actionCategory?: 'CRIME' | 'DIALOGUE' | 'VIOLENCE' | 'INVESTIGATION' | 'HELP' | 'MUNDANE';
  targetId?: string;
  socialDeltas?: {
    symmetric?: RelationshipDelta;
    forward?: RelationshipDelta;
    backward?: RelationshipDelta;
    witnessDelta?: RelationshipDelta;
  };
}

export interface WitnessFactResult {
  factId: string;
  witnessIds: string[];
  knowledgeFact: KnowledgeFact;
  relationshipChanges: Array<{
    sourceId: string;
    targetId: string;
    metrics: Record<string, number>;
  }>;
}

export class WitnessFactAuthority {
  /**
   * Authoritatively queries all active, living characters present at a location.
   */
  public static getPresentWitnesses(
    repository: WorldRepository,
    storyId: string,
    locationId: string,
    excludingActorId?: string,
  ): EntityCard[] {
    const cards = repository.getEntityCards(storyId, { status: 'ACTIVE' });
    const witnesses = cards.filter((card) => {
      if (!card || card.id === excludingActorId) return false;
      if (card.worldState?.isAlive === false || card.worldState?.presence === 'absent') return false;
      if (card.worldState?.locationId !== locationId) return false;
      if (['DEAD', 'DESTROYED', 'ARCHIVED', 'TEMPLATE'].includes(card.lifecycle?.status)) return false;
      if (card.metadata?.hidden === true || card.metadata?.isHidden === true) return false;
      return true;
    });

    // Check player presence if actor is an NPC
    const player = repository.getPlayerLifecycle(storyId);
    if (
      player &&
      player.locationId === locationId &&
      player.actorId !== excludingActorId &&
      !player.isDead
    ) {
      const playerCard = repository.getEntityCard(storyId, player.actorId);
      if (playerCard && !witnesses.some((w) => w.id === player.actorId)) {
        witnesses.push(playerCard);
      }
    }

    return witnesses;
  }

  /**
   * Authoritatively commits a witness fact for all co-located witnesses.
   */
  public static recordWitnessFact(
    repository: WorldRepository,
    input: WitnessFactInput,
  ): WitnessFactResult {
    const clock = repository.getWorldClock(input.storyId);
    const timestamp = clock.getTimestamp();
    const witnesses = this.getPresentWitnesses(
      repository,
      input.storyId,
      input.locationId,
      input.actorId,
    );
    const witnessIds = witnesses.map((w) => w.id);

    const factId = deterministicId(
      'witness_fact',
      input.storyId,
      input.turnId,
      input.actorId,
      input.predicate,
    );
    const knowledgeFact: KnowledgeFact = {
      id: factId,
      subjectEntityId: input.actorId,
      predicate: input.predicate,
      objectValue: input.objectValue,
      sourceType: 'witnessed',
      sourceEventId: input.turnId,
      acquiredAtTimestamp: timestamp,
      confidence: 1.0,
      secretLevel: 'private', // Non-public: strictly scoped to present witnesses
      scope: 'exact',
      provenanceSummary: `Witnessed at ${input.locationId} during turn ${input.turnId}`,
      metadata: {
        locationId: input.locationId,
        witnessIds,
        actionCategory: input.actionCategory || 'MUNDANE',
        actionText: input.actionText,
      },
    };

    // 1. Store in KnowledgeBase
    repository.addKnowledgeFact(input.storyId, knowledgeFact);

    // 2. Grant in CharacterCanonSteward for all co-located witnesses
    for (const witness of witnesses) {
      CharacterCanonSteward.grantFact(input.storyId, witness.id, {
        factId,
        subjectEntityId: input.actorId,
        predicate: input.predicate,
        objectValue: input.objectValue,
        sourceType: 'CO_LOCATED_WITNESS',
        acquiredAtTimestamp: formatCanonicalTimestamp(timestamp),
        acquiredAtTurn: Number(input.turnId.replace(/\D+/g, '')) || 1,
        sourceEntityId: input.actorId,
        sourceLocationId: input.locationId,
        confidence: 1.0,
      });
    }

    // 3. Authorize in Phase 8 for each co-located witness
    const phase8 = repository.getPhase8SimulationEngine(input.storyId);
    const phase8State = phase8.load(repository as any, input.storyId);
    const agencyEngine = repository.getDynamicCharacterAgencyEngine(input.storyId);
    const entityRegistry = repository.getEntityRegistry(input.storyId);

    for (const witness of witnesses) {
      const wKnowledge =
        phase8State.knowledge[witness.id] || phase8.knowledge.createState(witness.id);
      phase8State.knowledge[witness.id] = wKnowledge;
      phase8.knowledge.acquire(
        wKnowledge,
        {
          id: factId,
          subjectEntityId: input.actorId,
          predicate: input.predicate,
          objectValue: input.objectValue,
          status: 'KNOWN',
          confidence: 1,
          sourceEvidenceIds: [factId],
          acquiredAtSeconds: timestamp.totalElapsedSeconds,
        },
        {
          actorId: witness.id,
          factId,
          evidenceId: factId,
          method: 'OBSERVATION',
          success: true,
          confidence: 1,
          nowSeconds: timestamp.totalElapsedSeconds,
        },
      );

      // 4. Record belief in DynamicCharacterAgencyEngine
      agencyEngine.recordBelief({
        storyId: input.storyId,
        characterId: witness.id,
        beliefId: factId,
        proposition: `${input.actorId} performed ${input.predicate} at ${input.locationId}`,
        believedValue: input.objectValue,
        confidence: 1,
        sourceEventIds: [input.turnId],
        timestampSeconds: timestamp.totalElapsedSeconds,
      });

      // 5. Update memory references on witness EntityCard
      witness.memoryRefs = Array.from(
        new Set([...(witness.memoryRefs || []), factId]),
      ).slice(-50);
      entityRegistry.upsert(witness);
    }

    phase8.save(repository as any, input.storyId, phase8State);

    // 6. Record in Historical Chronicle as OBSERVERS_ONLY
    const chronicle = repository.getHistoricalChronicleEngine(input.storyId);
    const evidenceRecord = {
      id: factId,
      category: 'RELATIONSHIP_MUTATION',
      timestamp,
      primarySubjectId: input.actorId,
      locationId: input.locationId,
      summary: input.summary,
      details: input.actionText,
      sourceEventId: input.turnId,
      provenance: 'witnessed_event',
      visibility: 'OBSERVERS_ONLY',
      confidentialToEntityIds: [input.actorId, ...witnessIds],
    };

    if (repository.isCanonicalCommandTransactionActive()) {
      chronicle.recordEvidence(evidenceRecord as any);
    } else {
      const commandId = `witness_chronicle_${input.storyId}_${factId}`;
      chronicle.beginCanonicalTransaction(commandId);
      try {
        chronicle.recordEvidence(evidenceRecord as any);
        chronicle.commitCanonicalTransaction(input.turnId || factId);
      } catch {
        chronicle.rollbackCanonicalTransaction();
      }
    }

    // 7. Apply witness social consequence deltas if applicable
    const relationshipChanges: WitnessFactResult['relationshipChanges'] = [];
    const defaultWitnessDelta =
      input.socialDeltas?.witnessDelta ||
      (input.actionCategory === 'CRIME'
        ? { suspicion: 35, hostility: 20, trust: -25 }
        : input.actionCategory === 'VIOLENCE'
        ? { fear: 30, hostility: 30, trust: -35, suspicion: 25 }
        : undefined);

    if (defaultWitnessDelta && witnessIds.length > 0) {
      for (const witnessId of witnessIds) {
        const biResult = WitnessFactAuthority.applyBidirectionalRelationshipDelta(repository, {
          storyId: input.storyId,
          partyAId: input.actorId,
          partyBId: witnessId,
          eventId: `witness_reaction_${factId}`,
          cause: input.actionCategory === 'CRIME' ? 'PLAYER_ACTION' : 'CIRCUMSTANCE',
          description: `Reaction to witnessing: ${input.summary}`,
          backwardDelta: defaultWitnessDelta,
        });
        relationshipChanges.push({
          sourceId: witnessId,
          targetId: input.actorId,
          metrics: {
            trust: biResult.backward.trust,
            fear: biResult.backward.fear,
            hostility: biResult.backward.hostility,
            suspicion: biResult.backward.suspicion,
          },
        });
      }
    }

    return {
      factId,
      witnessIds,
      knowledgeFact,
      relationshipChanges,
    };
  }

  /**
   * Authoritatively applies bidirectional relationship deltas with 3-way synchronization.
   */
  public static applyBidirectionalRelationshipDelta(
    repository: WorldRepository,
    params: {
      storyId: string;
      partyAId: string;
      partyBId: string;
      eventId: string;
      cause: RelationshipCause;
      description: string;
      symmetricDelta?: RelationshipDelta;
      forwardDelta?: RelationshipDelta;
      backwardDelta?: RelationshipDelta;
      evidenceIds?: string[];
      explicitStanceA?: import('./dynamicCharacterAgency').RelationshipStance;
      explicitStanceB?: import('./dynamicCharacterAgency').RelationshipStance;
    },
  ): { forward: DynamicRelationshipState; backward: DynamicRelationshipState } {
    const clock = repository.getWorldClock(params.storyId);
    const timestamp = clock.getTimestamp();
    const agency = repository.getDynamicCharacterAgencyEngine(params.storyId);

    const result = agency.applyBidirectionalRelationshipDelta({
      storyId: params.storyId,
      partyAId: params.partyAId,
      partyBId: params.partyBId,
      eventId: params.eventId,
      timestampSeconds: timestamp.totalElapsedSeconds,
      cause: params.cause,
      description: params.description,
      symmetricDelta: params.symmetricDelta,
      forwardDelta: params.forwardDelta,
      backwardDelta: params.backwardDelta,
      evidenceIds: params.evidenceIds,
      explicitStanceA: params.explicitStanceA,
      explicitStanceB: params.explicitStanceB,
    });

    // 3-way sync: write back to EntityRegistry
    const registry = repository.getEntityRegistry(params.storyId);
    const existingA = registry.get(params.partyAId);
    const cardA: EntityCard = existingA
      ? { ...existingA }
      : ({
          id: params.partyAId,
          storyId: params.storyId,
          name: params.partyAId,
          kind: 'ACTOR',
          lifecycle: { status: 'ACTIVE' },
          social: { factionIds: [], reputation: {}, relationships: {} },
          memoryRefs: [],
        } as any);
    cardA.social = cardA.social || { factionIds: [], reputation: {}, relationships: {} };
    cardA.social.relationships = cardA.social.relationships || {};
    cardA.social.relationships[params.partyBId] = {
      trust: result.forward.trust,
      affection: result.forward.affection,
      respect: result.forward.respect,
      fear: result.forward.fear,
      hostility: result.forward.hostility,
      suspicion: result.forward.suspicion,
    };
    registry.upsert(cardA);

    const existingB = registry.get(params.partyBId);
    const cardB: EntityCard = existingB
      ? { ...existingB }
      : ({
          id: params.partyBId,
          storyId: params.storyId,
          name: params.partyBId,
          kind: 'NPC',
          lifecycle: { status: 'ACTIVE' },
          social: { factionIds: [], reputation: {}, relationships: {} },
          memoryRefs: [],
        } as any);
    cardB.social = cardB.social || { factionIds: [], reputation: {}, relationships: {} };
    cardB.social.relationships = cardB.social.relationships || {};
    cardB.social.relationships[params.partyAId] = {
      trust: result.backward.trust,
      affection: result.backward.affection,
      respect: result.backward.respect,
      fear: result.backward.fear,
      hostility: result.backward.hostility,
      suspicion: result.backward.suspicion,
    };
    registry.upsert(cardB);

    // 3-way sync: Phase 8 consequence engine
    try {
      const phase8 = repository.getPhase8SimulationEngine(params.storyId);
      const phase8State = phase8?.load ? phase8.load(repository as any, params.storyId) : undefined;
      if (phase8?.consequence && phase8State?.consequences) {
        const forwardDelta = params.forwardDelta || params.symmetricDelta || {};
        const backwardDelta = params.backwardDelta || params.symmetricDelta || {};
        phase8.consequence.applyDelta(
          phase8State.consequences,
          params.eventId,
          params.partyAId,
          params.partyBId,
          {
            trust: (forwardDelta.trust || 0) * 2,
            affinity: (forwardDelta.affection || 0) * 2,
            fear: (forwardDelta.fear || 0) * 2,
            respect: (forwardDelta.respect || 0) * 2,
            hostility: (forwardDelta.hostility || 0) * 2,
          },
          params.evidenceIds || [],
          params.description,
          timestamp.totalElapsedSeconds,
        );
        phase8.consequence.applyDelta(
          phase8State.consequences,
          `${params.eventId}_reciprocal`,
          params.partyBId,
          params.partyAId,
          {
            trust: (backwardDelta.trust || 0) * 2,
            affinity: (backwardDelta.affection || 0) * 2,
            fear: (backwardDelta.fear || 0) * 2,
            respect: (backwardDelta.respect || 0) * 2,
            hostility: (backwardDelta.hostility || 0) * 2,
          },
          params.evidenceIds || [],
          params.description,
          timestamp.totalElapsedSeconds,
        );
        phase8.save(repository as any, params.storyId, phase8State);
      }
    } catch {
      // Non-critical fallback if phase8 simulation engine is uninitialized
    }

    return result;
  }

  /**
   * Retrieves the bidirectional relationship pair between partyA and partyB.
   */
  public static getBidirectionalRelationship(
    repository: WorldRepository,
    storyId: string,
    partyAId: string,
    partyBId: string,
  ): { forward: DynamicRelationshipState | null; backward: DynamicRelationshipState | null } {
    const agency = repository.getDynamicCharacterAgencyEngine(storyId);
    return agency.getBidirectionalRelationship(storyId, partyAId, partyBId);
  }
}
