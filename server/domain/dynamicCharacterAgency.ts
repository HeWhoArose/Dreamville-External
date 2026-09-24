import { deterministicId } from './deterministicRng';
import type { EntityCard } from './entityCard';
import type { WorldTimestamp } from './types';

export type RelationshipStance =
	| 'STRONG_FRIEND'
	| 'FRIEND'
	| 'ALLY'
	| 'RELUCTANT_ALLY'
	| 'NEUTRAL'
	| 'STRAINED'
	| 'RIVAL'
	| 'ENEMY';

export type RelationshipCause =
	| 'INITIAL_BOND'
	| 'GREED'
	| 'JEALOUSY'
	| 'FACTION_CONFLICT'
	| 'PLAYER_ACTION'
	| 'CIRCUMSTANCE'
	| 'FALSE_INFORMATION'
	| 'FRAMING'
	| 'BETRAYAL'
	| 'POSSESSION'
	| 'MANIPULATION'
	| 'COERCION'
	| 'FEAR'
	| 'IDEOLOGY'
	| 'VENGEANCE'
	| 'AMBITION'
	| 'RECONCILIATION'
	| 'EVIDENCE_REVEAL'
	| 'OTHER';

export type AgencyControlState =
	| 'FREE'
	| 'COERCED'
	| 'MANIPULATED'
	| 'POSSESSED'
	| 'COMPELLED';

export type BeliefStatus = 'HELD' | 'CORRECTED' | 'DISPROVEN' | 'REPLACED';

export type NpcIntent =
	| 'SUPPORT'
	| 'PROTECT'
	| 'RECONCILE'
	| 'OBSERVE'
	| 'COMPETE'
	| 'CONFRONT'
	| 'RETALIATE'
	| 'OPPOSE_UNDER_INFLUENCE'
	| 'WITHDRAW';

export interface CharacterPersonalityProfile {
	greed: number;
	jealousy: number;
	loyalty: number;
	ambition: number;
	empathy: number;
	courage: number;
	fearfulness: number;
	vengefulness: number;
	factionLoyalty: number;
}

export interface CharacterAgencyGoal {
	goalId: string;
	title: string;
	description: string;
	priority: number;
	active: boolean;
}

export interface CharacterAgencyProfile {
	characterId: string;
	worldId: string;
	name: string;
	factionId?: string;
	personality: CharacterPersonalityProfile;
	traits?: string[];
	values?: string[];
	fears?: string[];
	desires?: string[];
	dialogueStyle?: string;
	motivations: string[];
	goals: CharacterAgencyGoal[];
	currentGoalId?: string;
	canonicalGoal?: string;
	controlState: AgencyControlState;
	controlSourceId?: string;
	controlEvidenceIds: string[];
	role: string;
	surfaceDisposition: string;
}

export interface BeliefHistoryEntry {
	timestampSeconds: number;
	eventId: string;
	status: BeliefStatus;
	believedValue: string;
	confidence: number;
	evidenceIds: string[];
}

export interface CharacterBelief {
	beliefId: string;
	characterId: string;
	proposition: string;
	believedValue: string;
	confidence: number;
	status: BeliefStatus;
	sourceEventIds: string[];
	formedAtSeconds: number;
	lastUpdatedSeconds: number;
	history: BeliefHistoryEntry[];
}

export interface RelationshipHistoryEntry {
	id: string;
	timestampSeconds: number;
	eventId: string;
	cause: RelationshipCause;
	description: string;
	fromStance: RelationshipStance;
	toStance: RelationshipStance;
	evidenceIds: string[];
	metricsBefore: {
		trust: number;
		affection: number;
		respect: number;
		fear: number;
		hostility: number;
	};
	metricsAfter: {
		trust: number;
		affection: number;
		respect: number;
		fear: number;
		hostility: number;
	};
}

export interface DynamicRelationshipState {
	id: string;
	worldId: string;
	sourceId: string;
	targetId: string;
	trust: number;
	affection: number;
	respect: number;
	fear: number;
	hostility: number;
	stance: RelationshipStance;
	activeCause: RelationshipCause;
	lastChangedAtSeconds: number;
	history: RelationshipHistoryEntry[];
}

export interface DynamicCharacterAgencyState {
	schemaVersion: 1;
	characters: Record<string, CharacterAgencyProfile>;
	beliefs: Record<string, CharacterBelief[]>;
	relationships: Record<string, DynamicRelationshipState>;
}

export interface RelationshipDelta {
	trust?: number;
	affection?: number;
	respect?: number;
	fear?: number;
	hostility?: number;
}

export interface RelationshipMutationParams {
	storyId: string;
	sourceId: string;
	targetId: string;
	eventId: string;
	timestampSeconds: number;
	cause: RelationshipCause;
	description: string;
	evidenceIds?: string[];
	delta?: RelationshipDelta;
	explicitStance?: RelationshipStance;
}

function clone<T>(value: T): T {
	return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function clampScore(value: number): number {
	return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function normalizePersonality(personality?: Partial<CharacterPersonalityProfile>): CharacterPersonalityProfile {
	return {
		greed: clampScore(personality?.greed ?? 50),
		jealousy: clampScore(personality?.jealousy ?? 20),
		loyalty: clampScore(personality?.loyalty ?? 60),
		ambition: clampScore(personality?.ambition ?? 50),
		empathy: clampScore(personality?.empathy ?? 50),
		courage: clampScore(personality?.courage ?? 50),
		fearfulness: clampScore(personality?.fearfulness ?? 30),
		vengefulness: clampScore(personality?.vengefulness ?? 25),
		factionLoyalty: clampScore(personality?.factionLoyalty ?? 50),
	};
}

function normalizeControlState(value: unknown): AgencyControlState {
	return value === 'COERCED' ||
		value === 'MANIPULATED' ||
		value === 'POSSESSED' ||
		value === 'COMPELLED'
		? value
		: 'FREE';
}

const STANCE_VALUES: RelationshipStance[] = [
	'STRONG_FRIEND',
	'FRIEND',
	'ALLY',
	'RELUCTANT_ALLY',
	'NEUTRAL',
	'STRAINED',
	'RIVAL',
	'ENEMY',
];

function normalizeStance(value: unknown): RelationshipStance | null {
	return STANCE_VALUES.includes(value as RelationshipStance) ? value as RelationshipStance : null;
}

/**
 * Canonical relationship/agency authority for living characters.
 *
 * This engine deliberately keeps four concerns separate:
 * 1. relationship metrics,
 * 2. what the character believes,
 * 3. who/what currently controls the character's agency,
 * 4. the character's personality/goals.
 *
 * Narration may describe the resulting state, but cannot invent or mutate it.
 */
export class DynamicCharacterAgencyEngine {
	private state: DynamicCharacterAgencyState = {
		schemaVersion: 1,
		characters: {},
		beliefs: {},
		relationships: {},
	};

	private mutationListener?: () => void;

	public setMutationListener(listener?: () => void): void {
		this.mutationListener = listener;
	}

	private changed(): void {
		this.mutationListener?.();
	}

	private characterKey(storyId: string, characterId: string): string {
		return storyId + '::' + characterId;
	}

	private relationshipKey(storyId: string, sourceId: string, targetId: string): string {
		return storyId + '::' + sourceId + '::' + targetId;
	}

	private beliefKey(storyId: string, characterId: string): string {
		return this.characterKey(storyId, characterId);
	}

	private deriveStance(relationship: Pick<DynamicRelationshipState, 'trust' | 'affection' | 'respect' | 'fear' | 'hostility'>): RelationshipStance {
		const support = relationship.trust * 0.5 + relationship.affection * 0.3 + relationship.respect * 0.2;

		if (relationship.hostility >= 75 && support < 45) return 'ENEMY';
		if (relationship.hostility >= 55 && support < 60) return 'RIVAL';
		if (relationship.hostility >= 35 && support < 70) return 'STRAINED';
		if (support >= 85 && relationship.hostility <= 15) return 'STRONG_FRIEND';
		if (support >= 65 && relationship.hostility <= 30) return 'FRIEND';
		if (support >= 55 && relationship.hostility <= 40 && relationship.fear < 65) return 'ALLY';
		if (support >= 45 && relationship.hostility <= 50) return 'RELUCTANT_ALLY';
		return 'NEUTRAL';
	}

	public createDefaultPersonality(overrides?: Partial<CharacterPersonalityProfile>): CharacterPersonalityProfile {
		return normalizePersonality(overrides);
	}

	public hydrateFromEntityCards(storyId: string, worldId: string, cards: EntityCard[]): void {
		const supportedKinds = new Set<EntityCard['kind']>([
			'PLAYER',
			'CHARACTER',
			'NPC',
			'CREATURE',
			'BOSS',
			'COMPANION',
			'MERCHANT',
			'FACTION_MEMBER',
		]);

		for (const card of cards) {
			if (!card || !card.id || !card.name || !supportedKinds.has(card.kind)) continue;
			if (!this.getCharacter(storyId, card.id)) {
				const goals = [
					...(card.worldState?.currentGoal ? [{ goalId: deterministicId('npc_goal', storyId, card.id, card.worldState.currentGoal), title: card.worldState.currentGoal, description: card.worldState.currentGoal, priority: 100, active: true }] : []),
					...(card.behavior?.priorities || []).map((priority) => ({
						goalId: deterministicId('npc_priority', storyId, card.id, priority),
						title: priority,
						description: priority,
						priority: 70,
						active: true,
					})),
				];
				const motivations = Array.from(new Set([
					...(card.personality?.motivations || []),
					...(card.personality?.desires || []),
					...(card.personality?.fears || []),
				]));
				this.registerCharacter(storyId, {
					characterId: card.id,
					worldId: card.worldId || worldId,
					name: card.name,
					factionId: card.social?.factionIds?.[0],
					personality: {},
					traits: [...(card.personality?.traits || []), ...(card.traits || [])],
					values: [...(card.personality?.values || [])],
					fears: [...(card.personality?.fears || [])],
					desires: [...(card.personality?.desires || [])],
					dialogueStyle: card.personality?.dialogueStyle,
					motivations,
					goals,
					currentGoalId: goals[0]?.goalId,
					canonicalGoal: card.worldState?.currentGoal || goals[0]?.description,
					role: card.social?.role || card.classification?.role || card.kind.toLowerCase(),
					surfaceDisposition: card.personality?.temperament || card.personality?.dialogueStyle || 'Measured and observant.',
				});
			}

			for (const [targetId, relation] of Object.entries(card.social?.relationships || {})) {
				if (!this.getRelationship(storyId, card.id, targetId)) {
					this.setRelationship(storyId, {
						id: deterministicId('entity_relationship', storyId, card.id, targetId),
						worldId: card.worldId || worldId,
						sourceId: card.id,
						targetId,
						trust: relation?.trust ?? 50,
						affection: relation?.affection ?? 50,
						respect: relation?.respect ?? 50,
						fear: relation?.fear ?? 0,
						hostility: 0,
						activeCause: 'INITIAL_BOND',
						history: [],
						lastChangedAtSeconds: 0,
					});
				}
			}
		}
	}

	public registerCharacter(
		storyId: string,
		profile: Omit<CharacterAgencyProfile, 'personality' | 'controlState' | 'controlEvidenceIds'> & {
			personality?: Partial<CharacterPersonalityProfile>;
			controlState?: AgencyControlState;
			controlEvidenceIds?: string[];
		},
	): CharacterAgencyProfile {
		const key = this.characterKey(storyId, profile.characterId);
		const current = this.state.characters[key];
		const normalized: CharacterAgencyProfile = {
			characterId: profile.characterId,
			worldId: profile.worldId || storyId,
			name: profile.name,
			factionId: profile.factionId,
			personality: normalizePersonality(profile.personality),
			traits: [...(profile.traits || [])],
			values: [...(profile.values || [])],
			fears: [...(profile.fears || [])],
			desires: [...(profile.desires || [])],
			dialogueStyle: profile.dialogueStyle,
			motivations: Array.isArray(profile.motivations) ? [...profile.motivations] : [],
			goals: Array.isArray(profile.goals)
				? profile.goals.map((goal) => ({
					goalId: goal.goalId,
					title: goal.title,
					description: goal.description,
					priority: clampScore(goal.priority),
					active: goal.active !== false,
				}))
				: [],
			currentGoalId: profile.currentGoalId,
			canonicalGoal: profile.canonicalGoal,
			controlState: normalizeControlState(profile.controlState),
			controlSourceId: profile.controlSourceId,
			controlEvidenceIds: [...(profile.controlEvidenceIds || [])],
			role: profile.role || current?.role || 'neutral',
			surfaceDisposition: profile.surfaceDisposition || current?.surfaceDisposition || 'Measured and observant.',
		};
		this.state.characters[key] = normalized;
		this.changed();
		return clone(normalized);
	}

	public getCharacter(storyId: string, characterId: string): CharacterAgencyProfile | null {
		return clone(this.state.characters[this.characterKey(storyId, characterId)] || null);
	}

	public setCurrentGoal(storyId: string, characterId: string, goalId: string): boolean {
		const character = this.state.characters[this.characterKey(storyId, characterId)];
		if (!character || !character.goals.some((goal) => goal.goalId === goalId)) return false;
		character.currentGoalId = goalId;
		this.changed();
		return true;
	}

	public getRelationship(storyId: string, sourceId: string, targetId: string): DynamicRelationshipState | null {
		return clone(this.state.relationships[this.relationshipKey(storyId, sourceId, targetId)] || null);
	}

	private ensureRelationship(
		storyId: string,
		sourceId: string,
		targetId: string,
		nowSeconds: number,
	): DynamicRelationshipState {
		const key = this.relationshipKey(storyId, sourceId, targetId);
		const existing = this.state.relationships[key];
		if (existing) return existing;

		const relationship: DynamicRelationshipState = {
			id: deterministicId('relationship', storyId, sourceId, targetId),
			worldId: this.getCharacter(storyId, sourceId)?.worldId || storyId,
			sourceId,
			targetId,
			trust: 50,
			affection: 50,
			respect: 50,
			fear: 0,
			hostility: 0,
			stance: 'NEUTRAL',
			activeCause: 'INITIAL_BOND',
			lastChangedAtSeconds: nowSeconds,
			history: [],
		};
		this.state.relationships[key] = relationship;
		return relationship;
	}

	public setRelationship(
		storyId: string,
		relationship: Omit<DynamicRelationshipState, 'history' | 'stance' | 'lastChangedAtSeconds'> & {
			history?: RelationshipHistoryEntry[];
			stance?: RelationshipStance;
			lastChangedAtSeconds?: number;
		},
	): DynamicRelationshipState {
		const key = this.relationshipKey(storyId, relationship.sourceId, relationship.targetId);
		const base: DynamicRelationshipState = {
			id: relationship.id || deterministicId('relationship', storyId, relationship.sourceId, relationship.targetId),
			worldId: relationship.worldId || storyId,
			sourceId: relationship.sourceId,
			targetId: relationship.targetId,
			trust: clampScore(relationship.trust),
			affection: clampScore(relationship.affection),
			respect: clampScore(relationship.respect),
			fear: clampScore(relationship.fear),
			hostility: clampScore(relationship.hostility),
			stance: normalizeStance(relationship.stance) || this.deriveStance(relationship),
			activeCause: relationship.activeCause || 'OTHER',
			lastChangedAtSeconds: Number.isFinite(relationship.lastChangedAtSeconds) ? relationship.lastChangedAtSeconds : 0,
			history: Array.isArray(relationship.history) ? clone(relationship.history) : [],
		};
		this.state.relationships[key] = base;
		this.changed();
		return clone(base);
	}

	public applyRelationshipDelta(params: RelationshipMutationParams): DynamicRelationshipState {
		if (!params.storyId || !params.sourceId || !params.targetId) {
			throw new Error('Relationship mutation requires storyId, sourceId, and targetId.');
		}
		if (!params.eventId || !params.eventId.trim()) {
			throw new Error('Relationship mutation requires canonical eventId.');
		}
		if (!params.cause) {
			throw new Error('Relationship mutation requires canonical cause.');
		}

		const relationship = this.ensureRelationship(
			params.storyId,
			params.sourceId,
			params.targetId,
			params.timestampSeconds,
		);
		const before = clone(relationship);

		relationship.trust = clampScore(relationship.trust + (params.delta?.trust || 0));
		relationship.affection = clampScore(relationship.affection + (params.delta?.affection || 0));
		relationship.respect = clampScore(relationship.respect + (params.delta?.respect || 0));
		relationship.fear = clampScore(relationship.fear + (params.delta?.fear || 0));
		relationship.hostility = clampScore(relationship.hostility + (params.delta?.hostility || 0));
		relationship.stance = params.explicitStance || this.deriveStance(relationship);
		relationship.activeCause = params.cause;
		relationship.lastChangedAtSeconds = params.timestampSeconds;

		const historyEntry: RelationshipHistoryEntry = {
			id: deterministicId('relationship_history', relationship.id, params.eventId, String(relationship.history.length + 1)),
			timestampSeconds: params.timestampSeconds,
			eventId: params.eventId,
			cause: params.cause,
			description: params.description,
			fromStance: before.stance,
			toStance: relationship.stance,
			evidenceIds: [...(params.evidenceIds || [])],
			metricsBefore: {
				trust: before.trust,
				affection: before.affection,
				respect: before.respect,
				fear: before.fear,
				hostility: before.hostility,
			},
			metricsAfter: {
				trust: relationship.trust,
				affection: relationship.affection,
				respect: relationship.respect,
				fear: relationship.fear,
				hostility: relationship.hostility,
			},
		};
		relationship.history.push(historyEntry);
		this.changed();
		return clone(relationship);
	}

	public setRelationshipStance(params: RelationshipMutationParams): DynamicRelationshipState {
		return this.applyRelationshipDelta({
			...params,
			delta: params.delta || {},
			explicitStance: params.explicitStance || 'NEUTRAL',
		});
	}

	public recordBelief(params: {
		storyId: string;
		characterId: string;
		beliefId: string;
		proposition: string;
		believedValue: string;
		confidence: number;
		sourceEventIds: string[];
		timestampSeconds: number;
	}): CharacterBelief {
		if (!params.storyId || !params.characterId || !params.beliefId) {
			throw new Error('Belief requires storyId, characterId, and beliefId.');
		}
		const confidence = Math.max(0, Math.min(1, Number(params.confidence)));
		const key = this.beliefKey(params.storyId, params.characterId);
		const beliefs = this.state.beliefs[key] || [];
		const existing = beliefs.find((belief) => belief.beliefId === params.beliefId);
		const entry: CharacterBelief = existing || {
			beliefId: params.beliefId,
			characterId: params.characterId,
			proposition: params.proposition,
			believedValue: params.believedValue,
			confidence,
			status: 'HELD',
			sourceEventIds: [...params.sourceEventIds],
			formedAtSeconds: params.timestampSeconds,
			lastUpdatedSeconds: params.timestampSeconds,
			history: [],
		};
		entry.proposition = params.proposition;
		entry.believedValue = params.believedValue;
		entry.confidence = confidence;
		entry.status = 'HELD';
		entry.sourceEventIds = [...params.sourceEventIds];
		entry.lastUpdatedSeconds = params.timestampSeconds;
		entry.history.push({
			timestampSeconds: params.timestampSeconds,
			eventId: params.sourceEventIds[0] || params.beliefId,
			status: 'HELD',
			believedValue: params.believedValue,
			confidence,
			evidenceIds: [...params.sourceEventIds],
		});
		if (!existing) beliefs.push(entry);
		this.state.beliefs[key] = beliefs;
		this.changed();
		return clone(entry);
	}

	public correctBelief(params: {
		storyId: string;
		characterId: string;
		beliefId: string;
		eventId: string;
		timestampSeconds: number;
		correctedValue: string;
		confidence: number;
		evidenceIds: string[];
		status?: Extract<BeliefStatus, 'CORRECTED' | 'DISPROVEN' | 'REPLACED'>;
	}): CharacterBelief | null {
		const beliefs = this.state.beliefs[this.beliefKey(params.storyId, params.characterId)] || [];
		const belief = beliefs.find((candidate) => candidate.beliefId === params.beliefId);
		if (!belief) return null;

		belief.believedValue = params.correctedValue;
		belief.confidence = Math.max(0, Math.min(1, Number(params.confidence)));
		belief.status = params.status || 'CORRECTED';
		belief.lastUpdatedSeconds = params.timestampSeconds;
		belief.sourceEventIds = [...new Set([...belief.sourceEventIds, ...params.evidenceIds])];
		belief.history.push({
			timestampSeconds: params.timestampSeconds,
			eventId: params.eventId,
			status: belief.status,
			believedValue: belief.believedValue,
			confidence: belief.confidence,
			evidenceIds: [...params.evidenceIds],
		});
		this.changed();
		return clone(belief);
	}

	public getBeliefs(storyId: string, characterId: string): CharacterBelief[] {
		return clone(this.state.beliefs[this.beliefKey(storyId, characterId)] || []);
	}

	public setAgencyControl(params: {
		storyId: string;
		characterId: string;
		eventId: string;
		timestampSeconds: number;
		controlState: Exclude<AgencyControlState, 'FREE'>;
		controlSourceId?: string;
		evidenceIds?: string[];
	}): CharacterAgencyProfile | null {
		const character = this.state.characters[this.characterKey(params.storyId, params.characterId)];
		if (!character) return null;

		character.controlState = params.controlState;
		character.controlSourceId = params.controlSourceId;
		character.controlEvidenceIds = [...(params.evidenceIds || [])];
		this.changed();
		return clone(character);
	}

	public releaseAgencyControl(params: {
		storyId: string;
		characterId: string;
		eventId: string;
		timestampSeconds: number;
		evidenceIds?: string[];
	}): CharacterAgencyProfile | null {
		const character = this.state.characters[this.characterKey(params.storyId, params.characterId)];
		if (!character) return null;

		character.controlState = 'FREE';
		character.controlSourceId = undefined;
		character.controlEvidenceIds = [...(params.evidenceIds || [])];
		this.changed();
		return clone(character);
	}

	public canRestoreFriendship(storyId: string, sourceId: string, targetId: string): boolean {
		const relationship = this.getRelationship(storyId, sourceId, targetId);
		const character = this.getCharacter(storyId, sourceId);
		if (!relationship || !character) return false;
		return (
			character.controlState === 'FREE' &&
			relationship.trust >= 60 &&
			relationship.affection >= 55 &&
			relationship.respect >= 45 &&
			relationship.hostility <= 30
		);
	}

	public restoreFriendship(params: {
		storyId: string;
		sourceId: string;
		targetId: string;
		eventId: string;
		timestampSeconds: number;
		evidenceIds: string[];
		description: string;
		trustDelta?: number;
		affectionDelta?: number;
		respectDelta?: number;
	}): { success: boolean; relationship?: DynamicRelationshipState; errorReason?: string } {
		if (!this.canRestoreFriendship(params.storyId, params.sourceId, params.targetId)) {
			return {
				success: false,
				errorReason: 'Friendship cannot be canonically restored yet: agency must be free and relationship thresholds must be satisfied.',
			};
		}

		const relationship = this.applyRelationshipDelta({
			storyId: params.storyId,
			sourceId: params.sourceId,
			targetId: params.targetId,
			eventId: params.eventId,
			timestampSeconds: params.timestampSeconds,
			cause: 'RECONCILIATION',
			description: params.description,
			evidenceIds: params.evidenceIds,
			delta: {
				trust: params.trustDelta || 0,
				affection: params.affectionDelta || 0,
				respect: params.respectDelta || 0,
			},
			explicitStance: 'FRIEND',
		});
		return { success: true, relationship };
	}

	public getPlayerFacingGuidance(storyId: string, sourceId: string, targetId: string): {
		stance: RelationshipStance;
		surfaceDisposition: string;
		canRestoreFriendship: boolean;
	} {
		const relationship = this.getRelationship(storyId, sourceId, targetId);
		const character = this.getCharacter(storyId, sourceId);
		if (!relationship || !character) {
			return {
				stance: 'NEUTRAL',
				surfaceDisposition: 'No established relationship is canonical yet.',
				canRestoreFriendship: false,
			};
		}
		return {
			stance: relationship.stance,
			surfaceDisposition: character.surfaceDisposition,
			canRestoreFriendship: this.canRestoreFriendship(storyId, sourceId, targetId),
		};
	}

	public getNarrativeGuidance(storyId: string, sourceId: string, targetId: string): {
		stance: RelationshipStance;
		controlState: AgencyControlState;
		activeCause: RelationshipCause;
		motivations: string[];
		currentGoal?: string;
		surfaceDisposition: string;
		hiddenRelationshipSignals: string[];
	} {
		const relationship = this.getRelationship(storyId, sourceId, targetId);
		const character = this.getCharacter(storyId, sourceId);
		if (!relationship || !character) {
			return {
				stance: 'NEUTRAL',
				controlState: 'FREE',
				activeCause: 'OTHER',
				motivations: [],
				currentGoal: undefined,
				surfaceDisposition: 'Measured and observant.',
				hiddenRelationshipSignals: [],
			};
		}
		const currentGoal = character.goals.find((goal) => goal.goalId === character.currentGoalId && goal.active)?.description;
		const hiddenRelationshipSignals: string[] = [];
		if (relationship.affection >= 60) hiddenRelationshipSignals.push('Retains meaningful personal attachment to the target.');
		if (relationship.respect >= 60) hiddenRelationshipSignals.push('Retains meaningful respect for the target.');
		if (relationship.hostility >= 60) hiddenRelationshipSignals.push('Carries significant hostility toward the target.');
		if (character.controlState !== 'FREE') hiddenRelationshipSignals.push('Agency is externally constrained; do not frame the current opposition as fully voluntary.');
		if (relationship.activeCause === 'FRAMING' || relationship.activeCause === 'FALSE_INFORMATION') hiddenRelationshipSignals.push('Current hostility may be based on a belief that can later be corrected.');
		return {
			stance: relationship.stance,
			controlState: character.controlState,
			activeCause: relationship.activeCause,
			motivations: [...character.motivations],
			currentGoal,
			surfaceDisposition: character.surfaceDisposition,
			hiddenRelationshipSignals,
		};
	}

	public deriveNextIntent(storyId: string, characterId: string, targetId: string): NpcIntent {
		const character = this.getCharacter(storyId, characterId);
		const relationship = this.getRelationship(storyId, characterId, targetId);
		if (!character || !relationship) return 'OBSERVE';
		if (character.controlState !== 'FREE') return 'OPPOSE_UNDER_INFLUENCE';
		if (relationship.stance === 'ENEMY') return character.personality.vengefulness >= 55 ? 'RETALIATE' : 'CONFRONT';
		if (relationship.stance === 'RIVAL') return character.personality.ambition >= 55 ? 'COMPETE' : 'CONFRONT';
		if (relationship.stance === 'STRAINED') return relationship.affection >= 60 ? 'RECONCILE' : 'WITHDRAW';
		if (relationship.stance === 'STRONG_FRIEND' || relationship.stance === 'FRIEND') {
			return character.personality.loyalty >= 55 ? 'PROTECT' : 'SUPPORT';
		}
		if (relationship.stance === 'ALLY' || relationship.stance === 'RELUCTANT_ALLY') return 'SUPPORT';
		return 'OBSERVE';
	}

	public getRelationshipHistory(storyId: string, sourceId: string, targetId: string): RelationshipHistoryEntry[] {
		return clone(this.getRelationship(storyId, sourceId, targetId)?.history || []);
	}

	public exportState(): DynamicCharacterAgencyState {
		return clone(this.state);
	}

	public importState(state: unknown): void {
		const incoming = state as Partial<DynamicCharacterAgencyState> | null | undefined;
		if (!incoming || incoming.schemaVersion !== 1) {
			this.state = {
				schemaVersion: 1,
				characters: {},
				beliefs: {},
				relationships: {},
			};
			return;
		}

		const characters: Record<string, CharacterAgencyProfile> = {};
		for (const [key, profile] of Object.entries(incoming.characters || {})) {
			if (!profile || typeof profile !== 'object') continue;
			characters[key] = {
				characterId: String(profile.characterId),
				worldId: String(profile.worldId || ''),
				name: String(profile.name || profile.characterId || 'Unknown'),
				factionId: profile.factionId ? String(profile.factionId) : undefined,
				personality: normalizePersonality(profile.personality || {}),
				traits: Array.isArray(profile.traits) ? profile.traits.map(String) : [],
				values: Array.isArray(profile.values) ? profile.values.map(String) : [],
				fears: Array.isArray(profile.fears) ? profile.fears.map(String) : [],
				desires: Array.isArray(profile.desires) ? profile.desires.map(String) : [],
				dialogueStyle: profile.dialogueStyle ? String(profile.dialogueStyle) : undefined,
				motivations: Array.isArray(profile.motivations) ? profile.motivations.map(String) : [],
				goals: Array.isArray(profile.goals)
					? profile.goals.map((goal) => ({
						goalId: String(goal.goalId),
						title: String(goal.title || goal.goalId),
						description: String(goal.description || ''),
						priority: clampScore(Number(goal.priority)),
						active: goal.active !== false,
					}))
					: [],
				currentGoalId: profile.currentGoalId ? String(profile.currentGoalId) : undefined,
				canonicalGoal: profile.canonicalGoal ? String(profile.canonicalGoal) : undefined,
				controlState: normalizeControlState(profile.controlState),
				controlSourceId: profile.controlSourceId ? String(profile.controlSourceId) : undefined,
				controlEvidenceIds: Array.isArray(profile.controlEvidenceIds) ? profile.controlEvidenceIds.map(String) : [],
				role: String(profile.role || 'neutral'),
				surfaceDisposition: String(profile.surfaceDisposition || 'Measured and observant.'),
			};
		}

		const relationships: Record<string, DynamicRelationshipState> = {};
		for (const [key, relation] of Object.entries(incoming.relationships || {})) {
			if (!relation || typeof relation !== 'object') continue;
			const normalized: DynamicRelationshipState = {
				id: String(relation.id || deterministicId('relationship', String(relation.worldId || 'world'), String(relation.sourceId), String(relation.targetId))),
				worldId: String(relation.worldId || 'world'),
				sourceId: String(relation.sourceId || ''),
				targetId: String(relation.targetId || ''),
				trust: clampScore(Number(relation.trust)),
				affection: clampScore(Number(relation.affection)),
				respect: clampScore(Number(relation.respect)),
				fear: clampScore(Number(relation.fear)),
				hostility: clampScore(Number(relation.hostility)),
				stance: normalizeStance(relation.stance) || 'NEUTRAL',
				activeCause: relation.activeCause || 'OTHER',
				lastChangedAtSeconds: Number.isFinite(relation.lastChangedAtSeconds) ? Number(relation.lastChangedAtSeconds) : 0,
				history: Array.isArray(relation.history) ? clone(relation.history) : [],
			};
			relationships[key] = normalized;
		}

		const beliefs: Record<string, CharacterBelief[]> = {};
		for (const [key, values] of Object.entries(incoming.beliefs || {})) {
			if (!Array.isArray(values)) continue;
			beliefs[key] = values
				.filter((belief) => belief && typeof belief === 'object')
				.map((belief) => ({
					beliefId: String(belief.beliefId),
					characterId: String(belief.characterId),
					proposition: String(belief.proposition || ''),
					believedValue: String(belief.believedValue || ''),
					confidence: Math.max(0, Math.min(1, Number(belief.confidence))),
					status: belief.status === 'CORRECTED' || belief.status === 'DISPROVEN' || belief.status === 'REPLACED' ? belief.status : 'HELD',
					sourceEventIds: Array.isArray(belief.sourceEventIds) ? belief.sourceEventIds.map(String) : [],
					formedAtSeconds: Number.isFinite(belief.formedAtSeconds) ? Number(belief.formedAtSeconds) : 0,
					lastUpdatedSeconds: Number.isFinite(belief.lastUpdatedSeconds) ? Number(belief.lastUpdatedSeconds) : 0,
					history: Array.isArray(belief.history) ? clone(belief.history) : [],
				}));
		}

		this.state = {
			schemaVersion: 1,
			characters,
			relationships,
			beliefs,
		};
	}
}
