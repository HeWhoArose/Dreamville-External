import type { CurrentSituation, NearbyEntityContext } from './currentSituation';
import type { PlayerIntent } from './playerIntentInterpreter';

export type SocialParticipantRole =
	| 'PRIMARY_SPEAKER'
	| 'SECONDARY_SPEAKER'
	| 'LISTENER'
	| 'OBSERVER'
	| 'OVERHEARER'
	| 'INTERRUPTER'
	| 'BACKGROUND'
	| 'IGNORED'
	| 'EXCLUDED';

export type SocialDistance =
	| 'DIRECT'
	| 'NEAR'
	| 'DISTANT'
	| 'UNCONNECTED';

export interface EntitySceneRelevance {
	entityId: string;
	score: number;
	rank: number;
	reasons: string[];
	bands: Array<'CURRENT_LOCATION' | 'EXPLICIT_TARGET' | 'ACTIVE_DIALOGUE' | 'CURRENT_ACTION' | 'ACTIVE_THREAD' | 'RECENT_INTERACTION' | 'IMPORTANT' | 'REFERRED'>;
	visible: boolean;
}

export interface SocialAttentionSignals {
	attentionWeight: number;
	socialDistance: SocialDistance;
	canHear: boolean;
	canSee: boolean;
	canIntervene: boolean;
	canInterrupt: boolean;
	relationshipRelevance: number;
	topicRelevance: number;
	spatialRelevance: number;
}

export interface SocialParticipantProjection {
	entityId: string;
	name: string;
	role: SocialParticipantRole;
	relevanceScore: number;
	reasons: string[];
	signals: SocialAttentionSignals;
	visible: boolean;
}

export interface SocialConversationTopology {
	version: 1;
	turnId: string;
	conversationActive: boolean;
	activeSpeakerId?: string;
	participants: SocialParticipantProjection[];
	fallbackReason?: string;
	expiresAfterNarration: true;
}

function normalize(value: unknown): string {
	return String(value ?? '').trim().toLowerCase();
}

function clamp(value: number, min = 0, max = 1): number {
	return Math.max(min, Math.min(max, value));
}

function entityReferenced(entity: NearbyEntityContext, intent?: PlayerIntent, actionText?: string): boolean {
	const text = normalize(actionText);
	if (entity.explicitlyReferenced) return true;
	if (entity.id && (intent?.explicitTargets || []).some((target) => target.id === entity.id)) return true;
	if (entity.name && text.includes(normalize(entity.name))) return true;
	return false;
}

function hasExplicitTargetBand(entry: EntitySceneRelevance): boolean {
	return entry.bands.includes('EXPLICIT_TARGET');
}

function compareRelevance(a: EntitySceneRelevance, b: EntitySceneRelevance): number {
	const explicitDelta = Number(hasExplicitTargetBand(b)) - Number(hasExplicitTargetBand(a));
	if (explicitDelta !== 0) return explicitDelta;
	return b.score - a.score || a.entityId.localeCompare(b.entityId);
}

function intentTargetIds(intent?: PlayerIntent): Set<string> {
	return new Set([
		...(intent?.explicitTargets || []).map((target) => target.id).filter((id): id is string => Boolean(id)),
		...(intent?.target?.id ? [intent.target.id] : []),
		...(intent?.impliedTargets || []).map((target) => target.id).filter((id): id is string => Boolean(id)),
	]);
}

function isInterruptionIntent(intent?: PlayerIntent): boolean {
	return /\binterrupt(?:s|ed|ing)?\b|cut (?:them|him|her) off|break(?:s|ing)? into the conversation/i.test(String(intent?.originalText || ''));
}

function socialDistanceFor(entity: NearbyEntityContext, relevance: EntitySceneRelevance): SocialDistance {
	if (!entity.visibleToPlayer || entity.presence !== 'present' || !entity.isAlive || entity.distanceBand === 'REFERRED') return 'UNCONNECTED';
	if (relevance.bands.includes('EXPLICIT_TARGET') || relevance.bands.includes('ACTIVE_DIALOGUE') || relevance.bands.includes('CURRENT_ACTION')) return 'DIRECT';
	if (entity.distanceBand === 'CONTACT' || entity.distanceBand === 'ADJACENT' || entity.distanceBand === 'NEAR') return 'NEAR';
	return 'DISTANT';
}

function socialRelevanceFrom(relevance: EntitySceneRelevance): number {
	if (relevance.bands.includes('ACTIVE_DIALOGUE')) return 1;
	if (relevance.bands.includes('EXPLICIT_TARGET')) return 0.95;
	if (relevance.bands.includes('CURRENT_ACTION')) return 0.85;
	if (relevance.bands.includes('ACTIVE_THREAD')) return 0.72;
	if (relevance.bands.includes('RECENT_INTERACTION')) return 0.64;
	if (relevance.bands.includes('IMPORTANT')) return 0.5;
	return 0.25;
}

function topicRelevanceFrom(relevance: EntitySceneRelevance): number {
	if (relevance.bands.includes('EXPLICIT_TARGET')) return 0.95;
	if (relevance.bands.includes('CURRENT_ACTION')) return 0.85;
	if (relevance.bands.includes('ACTIVE_THREAD')) return 0.72;
	if (relevance.bands.includes('RECENT_INTERACTION')) return 0.58;
	if (relevance.bands.includes('REFERRED')) return 0.15;
	return 0.35;
}

function spatialRelevanceFrom(entity: NearbyEntityContext): number {
	switch (entity.distanceBand) {
		case 'CONTACT': return 1;
		case 'ADJACENT': return 0.9;
		case 'NEAR': return 0.75;
		case 'SAME_LOCATION': return 0.68;
		default: return 0.1;
	}
}

function participantRole(
	entity: NearbyEntityContext,
	relevance: EntitySceneRelevance,
	intent: PlayerIntent,
	activeSpeakerId: string | undefined,
	conversationActive: boolean,
	canHear: boolean,
	canSee: boolean,
): SocialParticipantRole {
	if (!entity.visibleToPlayer || entity.presence !== 'present' || !entity.isAlive) return 'EXCLUDED';

	const targets = intentTargetIds(intent);
	if (activeSpeakerId && entity.id === activeSpeakerId) return 'PRIMARY_SPEAKER';

	if (conversationActive && isInterruptionIntent(intent) && targets.has(entity.id)) {
		return 'INTERRUPTER';
	}

	if (conversationActive && intent.speechIntent && targets.has(entity.id)) {
		return 'SECONDARY_SPEAKER';
	}

	if (conversationActive && canHear) {
		return targets.has(entity.id) ? 'SECONDARY_SPEAKER' : 'OVERHEARER';
	}

	if (intent.speechIntent && targets.has(entity.id)) return 'PRIMARY_SPEAKER';

	if (conversationActive && canSee) return 'OBSERVER';

	if (targets.has(entity.id) && canSee) return 'LISTENER';

	if (relevance.score >= 45 && canSee) return 'BACKGROUND';
	if (relevance.score >= 20 && canSee) return 'IGNORED';
	return 'BACKGROUND';
}

function attentionWeight(
	relevance: EntitySceneRelevance,
	signals: Omit<SocialAttentionSignals, 'attentionWeight'>,
	role: SocialParticipantRole,
): number {
	const roleBoost: Record<SocialParticipantRole, number> = {
		PRIMARY_SPEAKER: 0.28,
		SECONDARY_SPEAKER: 0.2,
		LISTENER: 0.12,
		OBSERVER: 0.04,
		OVERHEARER: 0.08,
		INTERRUPTER: 0.2,
		BACKGROUND: 0,
		IGNORED: -0.08,
		EXCLUDED: -0.2,
	};
	return clamp(
		(relevance.score / 100) * 0.45 +
		signals.relationshipRelevance * 0.2 +
		signals.topicRelevance * 0.15 +
		signals.spatialRelevance * 0.2 +
		roleBoost[role],
	);
}

export class EntitySceneRelevanceEngine {
	public static rank(
		situation: CurrentSituation,
		intent?: PlayerIntent,
	): EntitySceneRelevance[] {
		const actionText = intent?.originalText || '';
		const activeDialogueSpeaker = situation.activeDialogue?.speakerId;
		const threadText = (situation.openThreads || []).map((thread) => [thread.title, thread.summary].filter(Boolean).join(' ')).join(' ');
		const recentText = (situation.recentTurns || []).slice(-4).map((turn) => [turn.playerAction, turn.narration, turn.unresolvedConsequence].filter(Boolean).join(' ')).join(' ');

		const ranked = (situation.nearbyEntities || [])
			.filter((entity) => entity.kind !== 'PLAYER')
			.map((entity) => {
				let score = 0;
				const reasons: string[] = [];
				const bands: EntitySceneRelevance['bands'] = [];
				const explicitlyMarked = Boolean(entity.explicitlyReferenced) ||
					Boolean(entity.id && (intent?.explicitTargets || []).some((target) => target.id === entity.id)) ||
					Boolean(entity.name && (intent?.explicitTargets || []).some((target) => normalize(target.name) === normalize(entity.name)));
				const explicit = entityReferenced(entity, intent, actionText);

				if (!entity.visibleToPlayer) return { entityId: entity.id, score: 0, rank: 0, reasons: ['NOT_VISIBLE'], bands: [], visible: false };
				if (entity.distanceBand !== 'REFERRED' && entity.presence === 'present') {
					score += 50;
					reasons.push('same current location');
					bands.push('CURRENT_LOCATION');
				}
				if (explicitlyMarked) {
					score += 70;
					reasons.push('explicit player target/reference');
					bands.push('EXPLICIT_TARGET');
				} else if (explicit) {
					score += 15;
					reasons.push('textual player reference');
					bands.push('REFERRED');
				}
				if (activeDialogueSpeaker === entity.id) {
					score += 35;
					reasons.push('active dialogue speaker');
					bands.push('ACTIVE_DIALOGUE');
				}
				if (intent?.target?.id === entity.id) {
					score += 30;
					reasons.push('current intent target');
					bands.push('CURRENT_ACTION');
				}
				const directlyThreadLinked = (situation.openThreads || []).some((thread) =>
					Array.isArray(thread.relatedEntityIds) && thread.relatedEntityIds.includes(entity.id)
				);
				if (directlyThreadLinked || (entity.name && normalize(threadText).includes(normalize(entity.name)))) {
					score += directlyThreadLinked ? 25 : 20;
					reasons.push(directlyThreadLinked ? 'explicit open-thread entity link' : 'active thread relation');
					bands.push('ACTIVE_THREAD');
				}
				if (entity.name && normalize(recentText).includes(normalize(entity.name))) {
					score += 10;
					reasons.push('recent interaction');
					bands.push('RECENT_INTERACTION');
				}
				if (entity.importance >= 0.9) {
					score += 10;
					reasons.push('high canonical importance');
					bands.push('IMPORTANT');
				}
				if (entity.distanceBand === 'REFERRED') score -= 25;
				if (entity.presence !== 'present') score -= 20;

				return {
					entityId: entity.id,
					score: Math.max(0, Math.min(100, score)),
					rank: 0,
					reasons,
					bands,
					visible: true,
				};
			})
			.sort(compareRelevance)
			.map((entry, index) => ({ ...entry, rank: index + 1 }));

		return ranked;
	}

	public static topVisible(situation: CurrentSituation, intent?: PlayerIntent, limit = 8): NearbyEntityContext[] {
		const relevance = new Map(this.rank(situation, intent).map((entry) => [entry.entityId, entry]));
		return (situation.nearbyEntities || [])
			.filter((entity) => entity.kind !== 'PLAYER')
			.filter((entity) => entity.visibleToPlayer)
			.sort((a, b) => compareRelevance(
				relevance.get(a.id) || { entityId: a.id, score: 0, rank: 0, reasons: [], bands: [], visible: true },
				relevance.get(b.id) || { entityId: b.id, score: 0, rank: 0, reasons: [], bands: [], visible: true },
			))
			.slice(0, limit);
	}

	public static toConversationTopology(
		situation: CurrentSituation,
		intent: PlayerIntent,
		limit = 8,
	): SocialConversationTopology {
		const relevance = this.rank(situation, intent);
		const byId = new Map(relevance.map((entry) => [entry.entityId, entry]));
		const conversationActive = Boolean(situation.activeDialogue) || intent.interactionMode === 'DIALOGUE' || intent.speechIntent;
		const activeSpeakerId = situation.activeDialogue?.speakerId;
		const visibleEntities = (situation.nearbyEntities || [])
			.filter((entity) => entity.kind !== 'PLAYER')
			.filter((entity) => entity.visibleToPlayer)
			.sort((a, b) => compareRelevance(
				byId.get(a.id) || { entityId: a.id, score: 0, rank: 0, reasons: [], bands: [], visible: true },
				byId.get(b.id) || { entityId: b.id, score: 0, rank: 0, reasons: [], bands: [], visible: true },
			))
			.slice(0, limit);

		const participants: SocialParticipantProjection[] = visibleEntities.map((entity) => {
			const relevanceEntry = byId.get(entity.id) || {
				entityId: entity.id,
				score: 0,
				rank: 0,
				reasons: [],
				bands: [],
				visible: true,
			};
			const canSee = entity.visibleToPlayer && entity.presence === 'present' && entity.isAlive;
			const canHear = canSee && entity.distanceBand !== 'REFERRED';
			const relationshipRelevance = socialRelevanceFrom(relevanceEntry);
			const topicRelevance = topicRelevanceFrom(relevanceEntry);
			const spatialRelevance = spatialRelevanceFrom(entity);
			const baseSignals = {
				socialDistance: socialDistanceFor(entity, relevanceEntry),
				canHear,
				canSee,
				canIntervene: canSee && (entity.distanceBand !== 'REFERRED'),
				canInterrupt: canHear && conversationActive,
				relationshipRelevance,
				topicRelevance,
				spatialRelevance,
			};
			const role = participantRole(entity, relevanceEntry, intent, activeSpeakerId, conversationActive, canHear, canSee);
			return {
				entityId: entity.id,
				name: entity.name,
				role,
				relevanceScore: relevanceEntry.score,
				reasons: relevanceEntry.reasons.slice(0, 6),
				signals: {
					...baseSignals,
					attentionWeight: attentionWeight(relevanceEntry, baseSignals, role),
				},
				visible: true,
			};
		});

		const fallbackReason = participants.length === 0
			? 'No visible non-player entities were available; preserve single-actor narration.'
			: conversationActive && !participants.some((participant) => participant.role === 'PRIMARY_SPEAKER' || participant.role === 'SECONDARY_SPEAKER' || participant.role === 'LISTENER' || participant.role === 'OVERHEARER')
				? 'Conversation context exists but no participant could be safely addressed; preserve current dialogue boundaries.'
				: undefined;

		return {
			version: 1,
			turnId: situation.turnId,
			conversationActive,
			activeSpeakerId,
			participants,
			fallbackReason,
			expiresAfterNarration: true,
		};
	}

	public static toConversationPromptContext(topology?: SocialConversationTopology): string {
		if (!topology) return 'N15 SOCIAL ATTENTION: unavailable; preserve current relevance ordering and canonical dialogue boundaries.';
		const participants = topology.participants
			.filter((participant) => participant.role !== 'EXCLUDED')
			.map((participant) =>
				participant.name +
				' [' + participant.role +
				'; attention=' + participant.signals.attentionWeight.toFixed(2) +
				'; distance=' + participant.signals.socialDistance +
				'; hear=' + participant.signals.canHear +
				'; see=' + participant.signals.canSee +
				'; intervene=' + participant.signals.canIntervene +
				'; interrupt=' + participant.signals.canInterrupt +
				'; topic=' + participant.signals.topicRelevance.toFixed(2) +
				'; relationship=' + participant.signals.relationshipRelevance.toFixed(2) + ']'
			);
		return [
			'N15 SOCIAL ATTENTION / CONVERSATION TOPOLOGY v' + topology.version + ' (EPHEMERAL — PRESENTATION ONLY)',
			'Conversation active: ' + topology.conversationActive,
			topology.activeSpeakerId ? 'Active speaker: ' + topology.activeSpeakerId : 'Active speaker: none supplied.',
			participants.length ? 'Participants:
- ' + participants.join('
- ') : 'Participants: none.',
			topology.fallbackReason ? 'Fallback: ' + topology.fallbackReason : 'Fallback: not required.',
			'Hard boundary: N15 does not mutate canonical social state, invent relationship sentiment, reveal hidden entities, or decide an NPC action. It only projects who can currently perceive or participate in the already-authorized scene.',
		].join('
');
	}

	public static toPromptContext(situation: CurrentSituation, intent?: PlayerIntent, limit = 8): string {
		const ranked = this.rank(situation, intent);
		return this.topVisible(situation, intent, limit)
			.map((entity) => {
				const score = ranked.find((entry) => entry.entityId === entity.id);
				return entity.name + ' [' + entity.kind + '] relevance=' + (score?.score ?? 0) + ' reasons=' + (score?.reasons.join(', ') || 'scene presence');
			})
			.join('; ') || 'None';
	}
}

export const entitySceneRelevanceEngine = EntitySceneRelevanceEngine;
