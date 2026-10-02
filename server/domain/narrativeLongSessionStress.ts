import type { WorldRepository } from '../repositories/worldRepository';
import type { NarrativeContinuityState } from './narrativeContinuityState';
import type { NarrativeNoveltyState } from './narrativeNoveltyEngine';

export interface NarrativeLongSessionBounds {
	narrativeContextHistory: number;
	noveltyItems: number;
	continuitySubtext: number;
	continuityConversationalTension: number;
	continuitySensoryMotifs: number;
	continuityNarrativeBeats: number;
	continuityResponseShapes: number;
	narrativeFocus: number;
	plotBeats: number;
	plotOpenThreads: number;
	openNarrativeThreads: number;
}

export const DEFAULT_NARRATIVE_LONG_SESSION_BOUNDS: NarrativeLongSessionBounds = {
	narrativeContextHistory: 40,
	noveltyItems: 120,
	continuitySubtext: 6,
	continuityConversationalTension: 6,
	continuitySensoryMotifs: 8,
	continuityNarrativeBeats: 8,
	continuityResponseShapes: 8,
	narrativeFocus: 6,
	plotBeats: 40,
	plotOpenThreads: 24,
	openNarrativeThreads: 40,
};

export interface NarrativeLongSessionMetrics {
	turnCount: number;
	narrativeContextHistory: number;
	noveltyItems: number;
	continuity: {
		subtext: number;
		conversationalTension: number;
		sensoryMotifs: number;
		narrativeBeats: number;
		responseShapes: number;
		focus: number;
	};
	plotBeats: number;
	plotOpenThreads: number;
	openNarrativeThreads: number;
	researchSnapshotBytes: number;
	runtimeStateBytes: number;
}

export class NarrativeLongSessionStressEngine {
	public static collect(repository: WorldRepository, storyId: string): NarrativeLongSessionMetrics {
		const run = repository.getStoryRun(storyId);
		const runtime = run?.runtimeState || {};
		const continuity = runtime.narrativeContinuity as NarrativeContinuityState | undefined;
		const novelty = runtime.narrativeNovelty as NarrativeNoveltyState | undefined;
		const plot = runtime.plot || {};
		const history = Array.isArray(runtime.narrativeContextHistory) ? runtime.narrativeContextHistory : [];
		const openNarrativeThreads = Array.isArray(runtime.openNarrativeThreads) ? runtime.openNarrativeThreads : [];
		return {
			turnCount: Math.max(
				Number(continuity?.turnCount || 0),
				Number(novelty?.turnCount || 0),
				history.length,
			),
			narrativeContextHistory: history.length,
			noveltyItems: Array.isArray(novelty?.items) ? novelty.items.length : 0,
			continuity: {
				subtext: Array.isArray(continuity?.unresolvedSubtext) ? continuity.unresolvedSubtext.length : 0,
				conversationalTension: Array.isArray(continuity?.activeConversationalTension) ? continuity.activeConversationalTension.length : 0,
				sensoryMotifs: Array.isArray(continuity?.recentSensoryMotifs) ? continuity.recentSensoryMotifs.length : 0,
				narrativeBeats: Array.isArray(continuity?.recentNarrativeBeats) ? continuity.recentNarrativeBeats.length : 0,
				responseShapes: Array.isArray(continuity?.recentResponseShapes) ? continuity.recentResponseShapes.length : 0,
				focus: Array.isArray(continuity?.narrativeFocus) ? continuity.narrativeFocus.length : 0,
			},
			plotBeats: Array.isArray(plot.beats) ? plot.beats.length : 0,
			plotOpenThreads: Array.isArray(plot.openThreads) ? plot.openThreads.length : 0,
			openNarrativeThreads: openNarrativeThreads.length,
			researchSnapshotBytes: JSON.stringify(runtime.narrativeResearch || null).length,
			runtimeStateBytes: JSON.stringify(runtime).length,
		};
	}

	public static validateBounds(metrics: NarrativeLongSessionMetrics, bounds: NarrativeLongSessionBounds = DEFAULT_NARRATIVE_LONG_SESSION_BOUNDS): string[] {
		const failures: string[] = [];
		const checks: Array<[string, number, number]> = [
			['narrativeContextHistory', metrics.narrativeContextHistory, bounds.narrativeContextHistory],
			['noveltyItems', metrics.noveltyItems, bounds.noveltyItems],
			['continuity.subtext', metrics.continuity.subtext, bounds.continuitySubtext],
			['continuity.conversationalTension', metrics.continuity.conversationalTension, bounds.continuityConversationalTension],
			['continuity.sensoryMotifs', metrics.continuity.sensoryMotifs, bounds.continuitySensoryMotifs],
			['continuity.narrativeBeats', metrics.continuity.narrativeBeats, bounds.continuityNarrativeBeats],
			['continuity.responseShapes', metrics.continuity.responseShapes, bounds.continuityResponseShapes],
			['continuity.focus', metrics.continuity.focus, bounds.narrativeFocus],
			['plotBeats', metrics.plotBeats, bounds.plotBeats],
			['plotOpenThreads', metrics.plotOpenThreads, bounds.plotOpenThreads],
			['openNarrativeThreads', metrics.openNarrativeThreads, bounds.openNarrativeThreads],
		];
		for (const [name, value, limit] of checks) {
			if (value > limit) failures.push(name + ' exceeded bound ' + limit + ' with ' + value + '.');
		}
		return failures;
	}
}
