import type { PlayerIntent } from './playerIntentInterpreter';
import type { CurrentSituation } from './currentSituation';

export type NarrativeResearchNeed =
	| 'IMMEDIATE_SCENE'
	| 'TARGET_IDENTITY'
	| 'RELATIONSHIP'
	| 'RECENT_CONSEQUENCE'
	| 'MEMORY_CONTINUITY'
	| 'LORE_FACT'
	| 'OPEN_THREAD'
	| 'PLOT_CONTINUITY'
	| 'SENSORY_CONTEXT'
	| 'WORLD_MOMENTUM';

export interface NarrativeResearchNeedScore {
	need: NarrativeResearchNeed;
	score: number;
	reason: string;
}

export interface SemanticNarrativeResearchProfile {
	version: 1;
	objective: string;
	needs: NarrativeResearchNeedScore[];
	targetEntityIds: string[];
	targetEntityNames: string[];
	informationGoal?: string;
	interactionMode: string;
	confidence: number;
}

const NEED_BASE_WEIGHT: Record<NarrativeResearchNeed, number> = {
	IMMEDIATE_SCENE: 1,
	TARGET_IDENTITY: 0.95,
	RELATIONSHIP: 0.9,
	RECENT_CONSEQUENCE: 0.92,
	MEMORY_CONTINUITY: 0.84,
	LORE_FACT: 0.86,
	OPEN_THREAD: 0.8,
	PLOT_CONTINUITY: 0.68,
	SENSORY_CONTEXT: 0.72,
	WORLD_MOMENTUM: 0.5,
};

function clamp(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function hasNeed(needs: NarrativeResearchNeedScore[], need: NarrativeResearchNeed, minimum = 0.5): boolean {
	return needs.some((entry) => entry.need === need && entry.score >= minimum);
}

function deriveObjective(intent: PlayerIntent, situation: CurrentSituation): string {
	const target = intent.target?.name || intent.explicitTargets?.[0]?.name;
	if (intent.informationGoal) return 'Research what the player needs to know for: ' + intent.informationGoal;
	if (intent.interactionMode === 'DIALOGUE') return target ? 'Research how the current target can plausibly respond.' : 'Research the current conversation and scene.';
	if (intent.interactionMode === 'COMBAT') return 'Research the immediate combat situation, target state, and unresolved consequences.';
	if (intent.interactionMode === 'MOVEMENT') return 'Research the destination, current route context, and consequences of movement.';
	if (intent.interactionMode === 'EXPLORATION' || intent.interactionMode === 'PASSIVE_OBSERVATION') return 'Research what is materially observable and relevant in the current scene.';
	return situation.location.name ? 'Research the current action in its immediate canonical scene.' : 'Research the current action.';
}

export class SemanticNarrativeResearchEngine {
	public static derive(intent: PlayerIntent, situation: CurrentSituation): SemanticNarrativeResearchProfile {
		const targetEntityIds = [
			intent.target?.id,
			...intent.explicitTargets.map((target) => target.id),
			...intent.impliedTargets.map((target) => target.id),
		].filter(Boolean) as string[];
		const targetEntityNames = [
			intent.target?.name,
			...intent.explicitTargets.map((target) => target.name),
			...intent.impliedTargets.map((target) => target.name),
		].filter(Boolean) as string[];

		const needs: NarrativeResearchNeedScore[] = [
			{ need: 'IMMEDIATE_SCENE', score: 1, reason: 'Every narration turn must remain anchored to the canonical current scene.' },
		];

		if (targetEntityIds.length || targetEntityNames.length) {
			needs.push({ need: 'TARGET_IDENTITY', score: 1, reason: 'The player explicitly or implicitly focused on a concrete entity.' });
		}
		if (targetEntityIds.length && (intent.interactionMode === 'DIALOGUE' || intent.speechIntent || intent.informationGoal)) {
			needs.push({ need: 'RELATIONSHIP', score: 0.95, reason: 'A target relationship can materially shape familiarity, tension, trust, or reaction without exposing private relationship metrics.' });
		}
		if (intent.informationGoal || intent.interactionMode === 'INFORMATION_SEEKING') {
			needs.push({ need: 'LORE_FACT', score: 1, reason: 'The player explicitly needs information rather than atmosphere alone.' });
			needs.push({ need: 'MEMORY_CONTINUITY', score: 0.95, reason: 'Prior experiences and learned facts may answer or contextualize the information request.' });
			needs.push({ need: 'OPEN_THREAD', score: 0.9, reason: 'Unresolved investigations and promises are especially relevant to information-seeking actions.' });
		}
		if (intent.interactionMode === 'PASSIVE_OBSERVATION' || intent.interactionMode === 'EXPLORATION' || intent.observationIntent) {
			needs.push({ need: 'SENSORY_CONTEXT', score: 0.9, reason: 'Observation and exploration depend on what can be perceived now.' });
		}
		if (intent.movementIntent || intent.interactionMode === 'MOVEMENT') {
			needs.push({ need: 'PLOT_CONTINUITY', score: 0.65, reason: 'Movement should preserve the current journey, scene purpose, and unresolved direction.' });
		}
		if (intent.interactionMode === 'COMBAT') {
			needs.push({ need: 'RECENT_CONSEQUENCE', score: 1, reason: 'Immediate canonical combat consequences must dominate narrative research.' });
			needs.push({ need: 'TARGET_IDENTITY', score: 1, reason: 'Combat narration depends on the current visible target state.' });
		}
		if (situation.recentTurns.some((turn) => Boolean(turn.unresolvedConsequence))) {
			needs.push({ need: 'RECENT_CONSEQUENCE', score: 1, reason: 'An unresolved recent consequence can change what the current action means.' });
		}
		if (situation.plot?.currentArc || situation.plot?.summary) {
			needs.push({ need: 'PLOT_CONTINUITY', score: Math.max(0.5, NEED_BASE_WEIGHT.PLOT_CONTINUITY), reason: 'Existing plot state prevents the turn from resetting established continuity.' });
		}
		if (situation.openThreads.length) {
			needs.push({ need: 'OPEN_THREAD', score: 0.75, reason: 'Open narrative threads can explain why this action matters now.' });
		}

		const deduped = Array.from(new Map(needs.map((entry) => [entry.need, entry])).values()).sort((a, b) => b.score - a.score);
		const confidence = clamp(Number(intent.confidence) || 0);
		return {
			version: 1,
			objective: deriveObjective(intent, situation),
			needs: deduped,
			targetEntityIds: Array.from(new Set(targetEntityIds)),
			targetEntityNames: Array.from(new Set(targetEntityNames.map((name) => String(name).trim()).filter(Boolean))),
			informationGoal: intent.informationGoal,
			interactionMode: intent.interactionMode,
			confidence,
		};
	}

	public static scoreCandidate(
		profile: SemanticNarrativeResearchProfile,
		input: { kind: string; sourceId?: string; content?: string },
	): { score: number; reason: string } {
		const kind = String(input.kind).toUpperCase();
		const tags: NarrativeResearchNeed[] =
			kind === 'SCENE'
				? ['IMMEDIATE_SCENE', 'SENSORY_CONTEXT']
				: kind === 'ENTITY'
					? ['TARGET_IDENTITY', 'RELATIONSHIP']
					: kind === 'RELATIONSHIP'
						? ['RELATIONSHIP']
					: kind === 'CONSEQUENCE'
						? ['RECENT_CONSEQUENCE']
						: kind === 'MEMORY'
							? ['MEMORY_CONTINUITY', 'RELATIONSHIP']
							: kind === 'KNOWLEDGE'
								? ['LORE_FACT']
								: kind === 'THREAD'
									? ['OPEN_THREAD']
									: kind === 'PLOT'
										? ['PLOT_CONTINUITY']
										: ['IMMEDIATE_SCENE'];

		let best = 0;
		let bestNeed: NarrativeResearchNeed = tags[0];
		for (const tag of tags) {
			const need = profile.needs.find((entry) => entry.need === tag);
			if (need && need.score > best) {
				best = need.score;
				bestNeed = tag;
			}
		}

		const content = String(input.content || '').toLowerCase();
		const targetMatch = profile.targetEntityNames.some((name) => content.includes(name.toLowerCase()));
		const targetIdMatch = Boolean(input.sourceId && profile.targetEntityIds.includes(input.sourceId));
		const explicitBoost = targetMatch || targetIdMatch ? 0.12 : 0;
		const finalScore = clamp(best + explicitBoost);
		const matchedNeed = hasNeed(profile.needs, bestNeed, 0.5);
		return {
			score: finalScore,
			reason: matchedNeed
				? 'Semantic need ' + bestNeed + ' is active for this turn.' + (explicitBoost ? ' The candidate also matches the player focus.' : '')
				: 'No strong semantic need was derived for this candidate category.',
		};
	}

	public static summarize(profile: SemanticNarrativeResearchProfile): string {
		const active = profile.needs.slice(0, 6).map((entry) => entry.need + '=' + entry.score.toFixed(2)).join(', ');
		return [
			'Semantic Research Profile v' + profile.version,
			'Objective: ' + profile.objective,
			'Interaction mode: ' + profile.interactionMode,
			'Active needs: ' + active,
			profile.informationGoal ? 'Information goal: ' + profile.informationGoal : '',
			profile.targetEntityNames.length ? 'Focused entities: ' + profile.targetEntityNames.join(', ') : '',
		].filter(Boolean).join('\n');
	}

	public static compactSummary(profile: SemanticNarrativeResearchProfile): string {
		return 'N3 objective=' + profile.objective + '; needs=' + profile.needs.slice(0, 5).map((entry) => entry.need).join(', ') + '; focus=' + (profile.targetEntityNames.join(', ') || 'none') + '.';
	}
}
