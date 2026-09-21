export type CombatReactionTrigger =
	| 'ACTOR_MOVED'
	| 'ACTOR_ATTACKED'
	| 'TARGET_ENTERED_REACH'
	| 'TURN_STARTED'
	| 'CUSTOM';

export interface CombatReactionEvent {
	type: CombatReactionTrigger;
	actorId: string;
	targetId?: string;
	from?: { x: number; y: number };
	to?: { x: number; y: number };
	metadata?: Record<string, unknown>;
}

export interface CombatReactionCandidate<T = unknown> {
	reactionId: string;
	actorId: string;
	priority: number;
	triggerType: CombatReactionTrigger;
	triggerActorId?: string;
	targetId?: string;
	resolve: () => T;
}

export interface CombatReactionResult<T = unknown> {
	reactionId: string;
	actorId: string;
	resolved: boolean;
	result?: T;
}

/**
 * Deterministic reaction adjudicator.
 *
 * The engine deliberately does not decide what a reaction does. It only:
 * 1. filters candidates against the canonical trigger,
 * 2. orders them deterministically,
 * 3. enforces one reaction per actor for the trigger event,
 * 4. executes the selected authoritative resolver.
 */
export class CombatReactionEngine {
	public resolve<T>(
		event: CombatReactionEvent,
		candidates: CombatReactionCandidate<T>[]
	): CombatReactionResult<T>[] {
		const eligible = candidates
			.filter((candidate) => this.matches(event, candidate))
			.sort((a, b) =>
				b.priority - a.priority ||
				a.actorId.localeCompare(b.actorId) ||
				a.reactionId.localeCompare(b.reactionId)
			);

		const usedActors = new Set<string>();
		const results: CombatReactionResult<T>[] = [];

		for (const candidate of eligible) {
			if (usedActors.has(candidate.actorId)) continue;

			const result = candidate.resolve();
			const resolved =
				typeof result === 'object' &&
				result !== null &&
				'triggered' in (result as Record<string, unknown>)
					? Boolean((result as Record<string, unknown>).triggered)
					: true;

			results.push({
				reactionId: candidate.reactionId,
				actorId: candidate.actorId,
				resolved,
				result,
			});

			if (resolved) {
				usedActors.add(candidate.actorId);
			}
		}

		return results;
	}

	private matches(
		event: CombatReactionEvent,
		candidate: CombatReactionCandidate
	): boolean {
		if (candidate.triggerType !== event.type) return false;
		if (candidate.triggerActorId && candidate.triggerActorId !== event.actorId) return false;
		if (candidate.targetId && candidate.targetId !== event.targetId) return false;
		return true;
	}
}

export const combatReactionEngine = new CombatReactionEngine();
