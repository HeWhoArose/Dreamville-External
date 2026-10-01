import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldRepository } from '../server/repositories/worldRepository';
import { TurnIntegrationHarness } from '../server/domain/turnIntegrationHarness';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeStateAdjudicator } from '../server/domain/narrativeStateAdjudicator';
import type { StructuredTurnPackage } from '../server/domain/aiOrchestrator';
import { PlayerIntentInterpreter } from '../server/domain/playerIntentInterpreter';

function freshRepository(): WorldRepository {
	return new WorldRepository({ disablePersistence: true });
}

describe('Phase 18 — end-to-end turn harness', () => {
	it('executes the full passive-listening chain from player input to next situation', () => {
		const repository = freshRepository();
		const trace = TurnIntegrationHarness.run({
			repository,
			storyId: 'default_story',
			playerAction: 'I move closer to hear the rumors.',
		});

		assert.equal(trace.intent.action, 'approach_and_listen');
		assert.equal(trace.intent.speechIntent, false);
		assert.equal(trace.intent.movementIntent, true);
		assert.equal(trace.intent.observationIntent, true);
		assert.ok(trace.research.blocks.length >= 1);
		assert.ok(trace.plan.immediateSteps.length >= 1);
		assert.equal(trace.narrativeReview?.decision, 'ACCEPT');
		assert.equal(trace.stateAdjudication?.allApproved, true);
		assert.ok(trace.continuity);
		assert.ok(trace.nextSituation);
		assert.ok(trace.stages.some((stage) => stage.name === 'plot-memory-threads' && stage.status === 'PASS'));
	});

	it('keeps an explicit question as dialogue instead of passive observation', () => {
		const repository = freshRepository();
		const trace = TurnIntegrationHarness.run({
			repository,
			storyId: 'default_story',
			playerAction: 'I ask Maren what happened.',
		});

		assert.equal(trace.intent.interactionMode, 'DIALOGUE');
		assert.equal(trace.intent.speechIntent, true);
		assert.equal(trace.intent.observationIntent, false);
		assert.equal(trace.narrativeReview?.decision, 'ACCEPT');
	});

	it('covers movement, inspection, combat, and item manipulation through the same chain', () => {
		const cases = [
			{ text: 'I walk toward the lantern vault.', mode: 'MOVEMENT' },
			{ text: 'I inspect the damaged prism.', mode: 'PASSIVE_OBSERVATION' },
			{ text: 'I attack the hostile creature.', mode: 'COMBAT' },
			{ text: 'I use the iron key on the sealed door.', mode: 'MANIPULATION' },
		] as const;

		for (const scenario of cases) {
			const trace = TurnIntegrationHarness.run({
				repository: freshRepository(),
				storyId: 'default_story',
				playerAction: scenario.text,
			});
			assert.equal(trace.intent.interactionMode, scenario.mode, scenario.text);
			assert.equal(trace.narrativeReview?.decision, 'ACCEPT', scenario.text);
			assert.ok(trace.nextSituation, scenario.text);
		}
	});

	it('fails safely on empty or malformed narration paths before canonical mutation', () => {
		for (const mode of ['EMPTY', 'MALFORMED'] as const) {
			assert.throws(() =>
				TurnIntegrationHarness.run({
					repository: freshRepository(),
					storyId: 'default_story',
					playerAction: 'I inspect the room.',
					narrationMode: mode,
				}),
			);
		}
	});

	it('keeps an unverified AI state proposal from being committed', () => {
		const repository = freshRepository();
		const situation = CurrentSituationBuilder.build({
			storyId: 'default_story',
			playerAction: 'I listen for rumors.',
			viewerActorId: repository.getPlayerLifecycle('default_story')?.actorId,
			worldRepo: repository,
		});
		const intent = PlayerIntentInterpreter.deterministic('I listen for rumors.', situation);
		const packageWithMutation: StructuredTurnPackage = {
			narrative: ['You listen carefully and hear only uncertain whispers.'],
			dialogue: [],
			events: ['HARNESS_UNVERIFIED_MUTATION'],
			stateChanges: [{ kind: 'location', targetId: 'loc_lantern_vault', value: 'loc_lantern_vault' }],
			memoryCandidates: [],
			audioCues: [],
		};
		const adjudication = NarrativeStateAdjudicator.adjudicate({
			repository,
			storyId: 'default_story',
			turnId: situation.turnId,
			actorId: situation.player.actorId,
			playerIntent: intent,
			currentSituation: situation,
			turnPackage: packageWithMutation,
			verifiedCanonicalChanges: [],
		});
		assert.equal(adjudication.approvedCount, 0);
		assert.equal(adjudication.rejectedCount, 1);
		assert.equal(adjudication.outcomes[0]?.committed, false);
	});
});
