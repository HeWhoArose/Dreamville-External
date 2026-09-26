import type { WorldRepository } from '../repositories/worldRepository';

export interface WorldMomentumState {
	storyId: string;
	pressure: number;
	unresolvedSignals: string[];
	lastUpdatedSeconds: number;
	revision: number;
}

export interface WorldMomentumUpdate {
	state: WorldMomentumState;
	triggeredCount: number;
	missedCount: number;
	signals: string[];
}

export class WorldMomentumEngine {
	public static getState(repository: WorldRepository, storyId: string): WorldMomentumState {
		const run = repository.getStoryRun(storyId);
		const stored = (run?.runtimeState as any)?.worldMomentum;
		if (stored) return JSON.parse(JSON.stringify(stored));
		return {
			storyId,
			pressure: 0,
			unresolvedSignals: [],
			lastUpdatedSeconds: 0,
			revision: 1,
		};
	}

	public static advance(params: {
		repository: WorldRepository;
		storyId: string;
		currentSeconds: number;
		triggeredEvents: Array<{ id?: string; name?: string; status?: string }>;
		missedEvents: Array<{ id?: string; name?: string; status?: string }>;
	}): WorldMomentumUpdate {
		const state = this.getState(params.repository, params.storyId);
		const triggered = params.triggeredEvents || [];
		const missed = params.missedEvents || [];
		const signals = [
			...triggered.map((event) => 'WORLD_EVENT:' + String(event.name || event.id || 'event')),
			...missed.map((event) => 'MISSED_EVENT:' + String(event.name || event.id || 'event')),
		];

		const passiveDecay = triggered.length === 0 && missed.length === 0 ? 1 : 0;
		state.pressure = Math.max(
			0,
			Math.min(
				100,
				state.pressure +
					triggered.length * 4 +
					missed.length * 7 -
					passiveDecay,
			),
		);
		state.unresolvedSignals = Array.from(new Set([
			...state.unresolvedSignals,
			...signals,
		])).slice(-24);
		state.lastUpdatedSeconds = params.currentSeconds;
		state.revision += 1;

		const run = params.repository.getStoryRun(params.storyId);
		if (run) {
			run.runtimeState = {
				...(run.runtimeState || {}),
				worldMomentum: state,
			};
			params.repository.saveStoryRun(run);
		}

		return {
			state: JSON.parse(JSON.stringify(state)),
			triggeredCount: triggered.length,
			missedCount: missed.length,
			signals,
		};
	}
}

export const worldMomentumEngine = WorldMomentumEngine;
