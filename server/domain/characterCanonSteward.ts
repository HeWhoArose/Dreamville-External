import { deterministicId } from './deterministicRng';
import type { WorldRepository } from '../repositories/worldRepository';
import type { EntityCard } from './entityCard';

export type FactSourceType =
  | 'AUTHORED_BACKGROUND'
  | 'CO_LOCATED_WITNESS'
  | 'DIRECT_CONVERSATION'
  | 'PLAUSIBLE_TRANSMISSION'
  | 'RUMOR_PROPAGATION'
  | 'DEDUCTION';

export interface CharacterKnowledgeFact {
  factId: string;
  subjectEntityId: string;
  predicate: string;
  objectValue: string;
  sourceType: FactSourceType;
  acquiredAtTimestamp: string;
  acquiredAtTurn: number;
  sourceEntityId?: string;
  sourceLocationId?: string;
  transmissionChannel?: 'DIRECT' | 'RUMOR' | 'LETTER' | 'RADIO' | 'TELEPHONE';
  confidence: number;
  isSecret?: boolean;
  shareThreshold?: {
    minTrust?: number;
    requiredFactionId?: string;
    intimidationRequired?: boolean;
  };
}

export interface CharacterEpistemicScope {
  characterId: string;
  storyId: string;
  knownFactIds: Set<string>;
  knownFacts: Map<string, CharacterKnowledgeFact>;
  domainExpertise: string[];
  knownLocationIds: Set<string>;
  privateSecrets: string[];
}

export interface DialogueAuditResult {
  valid: boolean;
  speakerId: string;
  speakerName: string;
  leakedFacts: string[];
  violationMessage?: string;
}

export class CharacterCanonSteward {
  private static scopes = new Map<string, Map<string, CharacterEpistemicScope>>(); // storyId -> (characterId -> scope)
  private static restrictedInvestigationFacts = new Map<
    string,
    Map<string, { factId: string; summary: string; originLocationId: string; keywords: string[] }>
  >();

  public static getScope(storyId: string, characterId: string): CharacterEpistemicScope {
    let storyScopes = this.scopes.get(storyId);
    if (!storyScopes) {
      storyScopes = new Map();
      this.scopes.set(storyId, storyScopes);
    }
    let scope = storyScopes.get(characterId);
    if (!scope) {
      scope = {
        characterId,
        storyId,
        knownFactIds: new Set(),
        knownFacts: new Map(),
        domainExpertise: [],
        knownLocationIds: new Set(),
        privateSecrets: [],
      };
      storyScopes.set(characterId, scope);
    }
    return scope;
  }

  /**
   * Registers investigation premise facts as restricted knowledge.
   * Only co-located witnesses, culprits, or investigators who have visited the scene may know them.
   */
  public static registerRestrictedInvestigationFact(params: {
    storyId: string;
    factId: string;
    summary: string;
    originLocationId: string;
    keywords: string[];
  }): void {
    let facts = this.restrictedInvestigationFacts.get(params.storyId);
    if (!facts) {
      facts = new Map();
      this.restrictedInvestigationFacts.set(params.storyId, facts);
    }
    facts.set(params.factId, {
      factId: params.factId,
      summary: params.summary,
      originLocationId: params.originLocationId,
      keywords: params.keywords.map((k) => k.toLowerCase().trim()).filter(Boolean),
    });
  }

  /**
   * Initializes or seeds an NPC's authored background knowledge from EntityCard.
   */
  public static initializeCharacterFromCard(card: EntityCard): CharacterEpistemicScope {
    const scope = this.getScope(card.storyId, card.id);

    // Domain expertise from role & tags
    if (card.classification?.role && !scope.domainExpertise.includes(card.classification.role)) {
      scope.domainExpertise.push(card.classification.role);
    }
    if (card.classification?.profession && !scope.domainExpertise.includes(card.classification.profession)) {
      scope.domainExpertise.push(card.classification.profession);
    }
    if (Array.isArray(card.classification?.tags)) {
      for (const tag of card.classification.tags) {
        if (!scope.domainExpertise.includes(tag)) scope.domainExpertise.push(tag);
      }
    }
    if (card.worldState?.locationId) scope.knownLocationIds.add(card.worldState.locationId);

    // Private secrets from card personality & background
    const secrets = [
      ...(card.personality?.canonicalSecrets || []),
      ...(card.background?.canonicalSecrets || []),
    ];
    scope.privateSecrets = Array.from(new Set([...scope.privateSecrets, ...secrets]));

    // Seed authored background facts
    if (card.background?.origin) {
      const factId = deterministicId('fact_origin', card.storyId, card.id);
      this.grantFact(card.storyId, card.id, {
        factId,
        subjectEntityId: card.id,
        predicate: 'ORIGIN',
        objectValue: card.background.origin,
        sourceType: 'AUTHORED_BACKGROUND',
        acquiredAtTimestamp: card.createdAt || new Date().toISOString(),
        acquiredAtTurn: 0,
        confidence: 1.0,
      });
    }

    return scope;
  }

  /**
   * An authored fact ("A spent .38 bullet casing lay beside the body.") and a restricted investigation fact
   * registered from the premise can describe the same knowledge under different ids. When a character is authored
   * to know the sentence, they know the matching restricted facts too; otherwise the leak audit rejects them for
   * saying what their own author gave them.
   */
  public static grantRestrictedFactsMentionedIn(storyId: string, characterId: string, text: string): string[] {
    const restricted = this.restrictedInvestigationFacts.get(storyId);
    if (!restricted) return [];
    const lower = String(text || '').toLowerCase();
    const scope = this.getScope(storyId, characterId);
    const granted: string[] = [];
    for (const [factId, meta] of restricted.entries()) {
      const hits = meta.keywords.filter((keyword) => lower.includes(keyword)).length;
      const matches = meta.keywords.length >= 2 ? hits >= 2 : hits >= 1;
      if (matches && !scope.knownFactIds.has(factId)) {
        scope.knownFactIds.add(factId);
        granted.push(factId);
      }
    }
    return granted;
  }

  /**
   * Grants a fact directly to an NPC's knowledge scope.
   */
  public static grantFact(storyId: string, characterId: string, fact: CharacterKnowledgeFact): void {
    const scope = this.getScope(storyId, characterId);
    scope.knownFactIds.add(fact.factId);
    scope.knownFacts.set(fact.factId, { ...fact });
  }

  /**
   * Records a witnessed action for all living, conscious entities co-located at locationId.
   */
  public static recordWitnessedAction(params: {
    repository: WorldRepository;
    storyId: string;
    locationId: string;
    turnNumber: number;
    timestamp: string;
    actorId: string;
    factId: string;
    predicate: string;
    objectValue: string;
    summary: string;
    excludedEntityIds?: string[];
  }): string[] {
    const witnesses: string[] = [];
    const excluded = new Set([params.actorId, ...(params.excludedEntityIds || [])]);

    // Query entities at this location from EntityRegistry
    const registry = params.repository.getEntityRegistry(params.storyId);
    const entitiesAtLocation = registry
      .list({ status: 'ACTIVE' })
      .filter((card) => card.worldState?.locationId === params.locationId)
      .filter((card) => card.worldState?.isAlive !== false && card.worldState?.presence !== 'absent')
      .filter((card) => !excluded.has(card.id));

    // Authorize knowledge fact in repository knowledge base
    params.repository.addKnowledgeFact(params.storyId, {
      id: params.factId,
      subjectEntityId: params.actorId,
      predicate: params.predicate,
      objectValue: params.objectValue,
      sourceType: 'witnessed',
      sourceEventId: `turn_${params.turnNumber}`,
      acquiredAtTimestamp: params.repository.getWorldClock(params.storyId).getTimestamp(),
      confidence: 1.0,
      secretLevel: 'private',
      scope: 'exact',
      provenanceSummary: params.summary,
    });

    for (const card of entitiesAtLocation) {
      this.grantFact(params.storyId, card.id, {
        factId: params.factId,
        subjectEntityId: params.actorId,
        predicate: params.predicate,
        objectValue: params.objectValue,
        sourceType: 'CO_LOCATED_WITNESS',
        acquiredAtTimestamp: params.timestamp,
        acquiredAtTurn: params.turnNumber,
        sourceEntityId: params.actorId,
        sourceLocationId: params.locationId,
        confidence: 1.0,
      });
      witnesses.push(card.id);
    }

    return witnesses;
  }

  /**
   * Transmits a fact from one character to another via conversation, rumor, or media.
   */
  public static transmitFact(params: {
    storyId: string;
    turnNumber: number;
    timestamp: string;
    fromEntityId: string;
    toEntityId: string;
    factId: string;
    channel: 'DIRECT' | 'RUMOR' | 'LETTER' | 'RADIO' | 'TELEPHONE';
    currentTrust?: number;
  }): { success: boolean; reason?: string } {
    const fromScope = this.getScope(params.storyId, params.fromEntityId);
    const fact = fromScope.knownFacts.get(params.factId);

    if (!fact) {
      return { success: false, reason: 'Speaker does not possess this fact.' };
    }

    // Check share threshold for secrets
    if (fact.isSecret && fact.shareThreshold) {
      const trust = params.currentTrust ?? 0;
      if (fact.shareThreshold.minTrust && trust < fact.shareThreshold.minTrust) {
        return {
          success: false,
          reason: `Insufficient trust (${trust} < ${fact.shareThreshold.minTrust}) to disclose secret.`,
        };
      }
    }

    const sourceType: FactSourceType =
      params.channel === 'DIRECT' ? 'DIRECT_CONVERSATION' : 'PLAUSIBLE_TRANSMISSION';
    this.grantFact(params.storyId, params.toEntityId, {
      ...fact,
      sourceType,
      acquiredAtTimestamp: params.timestamp,
      acquiredAtTurn: params.turnNumber,
      sourceEntityId: params.fromEntityId,
      transmissionChannel: params.channel,
      confidence:
        params.channel === 'RUMOR' ? Math.max(0.4, fact.confidence * 0.8) : fact.confidence,
    });

    return { success: true };
  }

  /**
   * Checks whether a character legitimately knows a fact.
   */
  public static isFactKnown(storyId: string, characterId: string, factId: string): boolean {
    const scope = this.getScope(storyId, characterId);
    return scope.knownFactIds.has(factId);
  }

  /**
   * Builds prompt boundary conditioning for the addressed speaker.
   */
  public static getSpeakerEpistemicPromptBlock(params: {
    storyId: string;
    speakerId: string;
    speakerName: string;
    currentLocationId: string;
  }): string {
    const scope = this.getScope(params.storyId, params.speakerId);
    const knownFactsList =
      Array.from(scope.knownFacts.values())
        .slice(-6)
        .map((f) => `- [${f.sourceType}] ${f.predicate}: ${f.objectValue}`)
        .join('\n') || '- Only local daily routines and visible surroundings.';

    const restricted = this.restrictedInvestigationFacts.get(params.storyId);
    const unknownTopics: string[] = [];
    if (restricted) {
      for (const [factId, meta] of restricted.entries()) {
        if (!scope.knownFactIds.has(factId) && meta.originLocationId !== params.currentLocationId) {
          unknownTopics.push(meta.summary);
        }
      }
    }

    const forbiddenBlock =
      unknownTopics.length > 0
        ? `\nEXPLICITLY UNKNOWN (Speaker has NO direct knowledge of):\n${unknownTopics
            .slice(0, 4)
            .map((t) => `- ${t}`)
            .join('\n')}\nIf questioned on these, speaker MUST state ignorance or speculation.`
        : '';

    return [
      `[NPC KNOWLEDGE BOUNDARY — ${params.speakerName}]`,
      `Role/Expertise: ${scope.domainExpertise.join(', ') || 'Local resident'}`,
      `Known facts:\n${knownFactsList}`,
      forbiddenBlock,
      `Dialogue Constraint: Never reveal secret clues, unobserved crime details, or ungrounded culprit confessions outside this boundary.`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Mode 7 Defense: Audits a generated dialogue utterance for epistemic leaks.
   */
  public static auditSpeakerDialogue(params: {
    storyId: string;
    speakerId: string;
    speakerName: string;
    dialogueText: string;
    currentLocationId: string;
  }): DialogueAuditResult {
    const scope = this.getScope(params.storyId, params.speakerId);
    const lower = params.dialogueText.toLowerCase();
    const restricted = this.restrictedInvestigationFacts.get(params.storyId);
    const leakedFacts: string[] = [];

    if (restricted) {
      for (const [factId, meta] of restricted.entries()) {
        // If the speaker legitimately knows the fact, it's not a leak
        if (scope.knownFactIds.has(factId)) continue;

        // If the fact originated in the speaker's current location, they might observe it
        if (meta.originLocationId === params.currentLocationId) continue;

        // Check for keyword matches of restricted facts
        const matchedKwCount = meta.keywords.filter((kw) => lower.includes(kw)).length;
        const matchesKeywords = meta.keywords.length >= 2
          ? matchedKwCount >= 2
          : matchedKwCount >= 1;

        if (matchesKeywords || (meta.summary.length >= 5 && lower.includes(meta.summary.toLowerCase()))) {
          leakedFacts.push(meta.summary);
        }
      }
    }

    // Check for ungrounded culprit confessions: if speaker is not marked as culprit
    const isCulprit =
      scope.privateSecrets.includes('CULPRIT') ||
      scope.privateSecrets.some((s) => /culprit|murderer|killer/i.test(s));

    if (
      !isCulprit &&
      /\b(?:i (?:killed|murdered|stabbed|strangled|poisoned)|i am the (?:killer|murderer))\b/i.test(
        lower,
      )
    ) {
      leakedFacts.push('UNGROUNDED_CULPRIT_CONFESSION');
    }

    if (leakedFacts.length > 0) {
      return {
        valid: false,
        speakerId: params.speakerId,
        speakerName: params.speakerName,
        leakedFacts,
        violationMessage: `NPC "${params.speakerName}" leaked unobserved facts outside their knowledge boundary: ${leakedFacts.join('; ')}.`,
      };
    }

    return {
      valid: true,
      speakerId: params.speakerId,
      speakerName: params.speakerName,
      leakedFacts: [],
    };
  }

  /**
   * Resets story canon state (for tests and clean story restarts).
   */
  public static resetStory(storyId: string): void {
    this.scopes.delete(storyId);
    this.restrictedInvestigationFacts.delete(storyId);
  }
}
