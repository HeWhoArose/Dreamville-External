import type { InMemoryWorldRepository } from '../repositories/worldRepository';
import type { RulesProfile, StoryCheckChallenge, StoryCheckResult } from '../../src/types';

/**
 * Canonical read-only authority for story skill-check resolution.
 *
 * Call boundary:
 * - Called by the authoritative Story action processor.
 * - Not a route handler.
 * - Not callable by the client as a standalone mutation endpoint.
 *
 * Dependencies:
 * - Reads the active player/run from WorldRepository.
 * - Reads canonical conditions/rules.
 * - Delegates pure dice/check resolution to StoryCheckEngine.
 * - Never calls AI, narration, persistence writers, or UI code.
 */
export interface StoryCheckAuthorityRequest {
	storyId: string;
	actorId: string;
	actionText: string;
	sceneText?: string;
	challenge?: StoryCheckChallenge;
	rulesProfile?: RulesProfile;
}

export class StoryCheckAuthority {
	public resolve(
		repository: InMemoryWorldRepository,
		request: StoryCheckAuthorityRequest,
	): StoryCheckResult | null {
		const player = repository.getPlayerLifecycle(request.storyId);
		const canonicalActorId = player?.actorId || `player_actor_${request.storyId}`;

		if (request.actorId !== canonicalActorId) {
			return null;
		}

		const run = repository.getStoryRun(request.storyId);
		if (!run) {
			return null;
		}

		const conditionEngine = repository.getConditionEngine(request.storyId);
		const rulesProfile = request.rulesProfile
			|| repository.getRulesProfile(request.storyId);

		const character = {
			coreStats: run.characterCoreStats || run.protagonist?.coreStats,
			skills: run.characterSkills || run.protagonist?.skills,
			conditionState: conditionEngine.exportActorState(canonicalActorId),
			sceneText: request.sceneText || '',
		};

		return repository.getStoryCheckEngine(request.storyId).resolve(
			request.storyId,
			request.actionText,
			character,
			request.challenge,
			rulesProfile: rulesProfile ?? undefined,
		);
	}
}

export const storyCheckAuthority = new StoryCheckAuthority();
