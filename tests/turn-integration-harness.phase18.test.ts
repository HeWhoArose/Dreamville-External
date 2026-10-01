import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorldRepository, worldRepository } from '../server/repositories/worldRepository';
import { TurnIntegrationHarness } from '../server/domain/turnIntegrationHarness';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeStateAdjudicator } from '../server/domain/narrativeStateAdjudicator';
import type { StructuredTurnPackage } from '../server/domain/aiOrchestrator';
import { PlayerIntentInterpreter } from '../server/domain/playerIntentInterpreter';

function freshRepository(): InMemoryWorldRepository {
	return new InMemoryWorldRepository({ disablePersistence: true });
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

	it('simulates primary-provider exhaustion without changing the deterministic turn contract', () => {
		const trace = TurnIntegrationHarness.run({
			repository: freshRepository(),
			storyId: 'default_story',
			playerAction: 'I listen for rumors.',
			providerMode: 'PRIMARY_UNAVAILABLE_FALLBACK',
		});
		assert.equal(trace.providerMode, 'PRIMARY_UNAVAILABLE_FALLBACK');
		assert.ok(trace.stages.some((stage) =>
			stage.name === 'ai-provider' &&
			stage.status === 'FALLBACK' &&
			/primary provider outage/i.test(stage.detail)
		));
		assert.equal(trace.narrativeReview?.decision, 'ACCEPT');
	});

	it('simulates total AI outage and still exercises the deterministic emergency floor', () => {
		const trace = TurnIntegrationHarness.run({
			repository: freshRepository(),
			storyId: 'default_story',
			playerAction: 'I inspect the damaged prism.',
			providerMode: 'ALL_UNAVAILABLE_EMERGENCY',
		});
		assert.equal(trace.providerMode, 'ALL_UNAVAILABLE_EMERGENCY');
		assert.ok(trace.stages.some((stage) =>
			stage.name === 'ai-provider' &&
			stage.status === 'FALLBACK' &&
			/total provider outage/i.test(stage.detail)
		));
		assert.equal(trace.narrativeReview?.decision, 'ACCEPT');
		assert.ok(trace.nextSituation);
	});

	it('keeps unknown NPC and unknown location references bounded instead of fabricating canonical targets', () => {
		for (const playerAction of [
			'I ask a stranger named Zareth what happened.',
			'I walk toward the nonexistent moon gate.',
		]) {
			const trace = TurnIntegrationHarness.run({
				repository: freshRepository(),
				storyId: 'default_story',
				playerAction,
			});
			assert.ok(trace.research.blocks.length >= 0);
			assert.ok(
				trace.intent.explicitTargets.length === 0 ||
				trace.intent.explicitTargets.every((target) =>
					trace.currentSituation.nearbyEntities.some((entity) => entity.id === target.id)
				)
			);
			assert.ok(trace.nextSituation);
		}
	});

	it('keeps unauthorized world truth out of the bounded research prompt', () => {
		const trace = TurnIntegrationHarness.run({
			repository: freshRepository(),
			storyId: 'default_story',
			playerAction: 'I listen for anything important.',
		});
		for (const fact of trace.currentSituation.worldFacts) {
			const secretText = String((fact as any).content || (fact as any).description || '').trim();
			if (secretText) {
				assert.equal(trace.research.promptContext.includes(secretText), false, secretText);
			}
		}
	});

	it('preserves canonical failure before continuity when the commit stage fails', () => {
		assert.throws(
			() => TurnIntegrationHarness.run({
				repository: freshRepository(),
				storyId: 'default_story',
				playerAction: 'I inspect the sealed archive.',
				commitMode: 'FAILURE',
			}),
			/HARNESS_CANONICAL_COMMIT_FAILURE/
		);
	});

	it('covers check-shaped actions without letting narration invent a result', () => {
		for (const playerAction of [
			'I attempt to force the sealed archive door.',
			'I carefully inspect the unstable fissure.',
		]) {
			const trace = TurnIntegrationHarness.run({
				repository: freshRepository(),
				storyId: 'default_story',
				playerAction,
			});
			assert.equal(trace.narrativeReview?.decision, 'ACCEPT');
			assert.doesNotMatch(trace.turnPackage?.narrative.join(' ') || '', /automatic success|automatic failure/i);
		}
	});

	it('keeps the UI retry contract visible for failed story actions', async () => {
		const fs = await import('node:fs/promises');
		const storyView = await fs.readFile(new URL('../src/components/StoryView.tsx', import.meta.url), 'utf8');
		assert.match(storyView, /Retry the last failed story action/);
		assert.match(storyView, /onRetryLastAction/);
	});

});


it('full action path hands check justification and bounded failure consequence into narration', async () => {
  const { serverMockAuthority } = await import('../server/mockEngine/serverMockAuthority');
  const storyId = 'check_resolution_narration_closure_' + Date.now();
  worldRepository.seedStory(storyId);

  const orchestrator: any = worldRepository.getAiOrchestrator();
  const originalGenerateNarrativeOnly = orchestrator.generateNarrativeOnly;
  let seenCommittedOutcome = '';

  orchestrator.generateNarrativeOnly = async (params: any) => {
    seenCommittedOutcome = String(params?.committedOutcome || '');
    return {
      success: true,
      source: 'AI_PRIMARY',
      providerId: 'test-provider',
      modelId: 'test-model',
      turnPackage: {
        narrative: ['The maneuver resolves in the current scene.'],
        dialogue: [],
        events: [],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
        visualCues: [],
      },
    };
  };

  try {
    const result: any = await serverMockAuthority.processCustomAction(
      {
        type: 'CUSTOM_ACTION',
        storyId,
        actionText: 'I parkour my way towards the light.',
      } as any,
      'check_resolution_narration_command',
      { bypassCapabilityAdvisor: true } as any,
    );

    assert.ok(result.checkResult);
    assert.equal(result.checkResult.skill, 'Acrobatics');
    assert.ok(result.checkResult.narrativeGuidance);
    assert.match(seenCommittedOutcome, /Why the check was required/i);
    assert.match(seenCommittedOutcome, /landing|balance|terrain|forward progress/i);
  } finally {
    orchestrator.generateNarrativeOnly = originalGenerateNarrativeOnly;
  }
});
