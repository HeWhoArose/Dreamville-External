import type { CurrentSituation, NearbyEntityContext } from './currentSituation';
import type { PlayerIntent } from './playerIntentInterpreter';

export interface EntitySceneRelevance {
	entityId: string;
	score: number;
	rank: number;
	reasons: string[];
	bands: Array<'CURRENT_LOCATION' | 'EXPLICIT_TARGET' | 'ACTIVE_DIALOGUE' | 'CURRENT_ACTION' | 'ACTIVE_THREAD' | 'RECENT_INTERACTION' | 'IMPORTANT' | 'REFERRED'>;
	visible: boolean;
}

function normalize(value: unknown): string {
	return String(value ?? '').trim().toLowerCase();
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
	// An explicit player target is a semantic commitment, not merely another
	// relevance signal. It must outrank incidental dialogue/recent-history
	// relevance so a currently mentioned target cannot be displaced by the
	// speaker of an older/ongoing conversation.
	const explicitDelta = Number(hasExplicitTargetBand(b)) - Number(hasExplicitTargetBand(a));
	if (explicitDelta !== 0) return explicitDelta;
	return b.score - a.score || a.entityId.localeCompare(b.entityId);
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
				if (entity.distanceBand === 'SAME_LOCATION' && entity.presence === 'present') {
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
