import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';

test('temporal continuity guard matches time-of-day markers as words, not substrings', () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const storyId = 'temporal_word_boundary_regression';
  const clock = repository.getWorldClock(storyId);
  const state = clock.exportState();

  clock.importState({
    ...state,
    timestamp: { ...state.timestamp, hour: 22, minute: 0 },
    currentDayPhase: 'Night',
  });

  const orchestrator = new MultiModelOrchestrator(repository);

  // "knight" contains the letters "night", but it is not a claim about the
  // time of day and must not be rejected as a temporal contradiction.
  const harmless = (orchestrator as any).validateNarrativeTemporalContinuity(
    'A knight studies a faded map in the courtyard.',
    repository,
    storyId,
  );
  assert.equal(harmless.valid, true, harmless.errorReason || 'ordinary prose should not trigger a substring false positive');

  // An explicit conflicting phase marker must still fail closed.
  const contradiction = (orchestrator as any).validateNarrativeTemporalContinuity(
    'Morning light crosses the courtyard.',
    repository,
    storyId,
  );
  assert.equal(contradiction.valid, false);
  assert.match(contradiction.errorReason || '', /morning/i);
});

test('temporal continuity guard permits relational and conversational time references while rejecting present-scene contradictions', () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const storyId = 'temporal_relational_reference_regression';
  repository.seedStory(storyId);
  const orchestrator = new MultiModelOrchestrator(repository);

  const relational = (orchestrator as any).validateNarrativeTemporalContinuity(
    'You ask the guard what happened, and he explains that the eastern gate was closed before dawn and has remained sealed since morning.',
    repository,
    storyId,
  );
  assert.equal(relational.valid, true, relational.errorReason || 'relational past/future references should be permitted');

  const presentContradiction = (orchestrator as any).validateNarrativeTemporalContinuity(
    'Dawn light spills across the stone courtyard as you step forward.',
    repository,
    storyId,
  );
  assert.equal(presentContradiction.valid, false);
  assert.match(presentContradiction.errorReason || '', /dawn/i);
});

test('context-aware temporal and observation guards accept compound role nouns, figurative phrases, and negated observations while rejecting ungrounded props', async () => {
  const { SemanticNarrativeReview } = await import('../server/domain/semanticNarrativeReview');
  const { CurrentSituationBuilder } = await import('../server/domain/currentSituation');
  const { PlayerIntentInterpreter } = await import('../server/domain/playerIntentInterpreter');

  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const storyId = 'context_aware_guards_regression';
  repository.seedStory(storyId);
  const orchestrator = new MultiModelOrchestrator(repository);

  // Compound role phrases ("night watch", "morning shift") and figurative comparisons ("quiet as midnight")
  // during Afternoon must not be flagged as temporal contradictions.
  const compoundAndFigurative = (orchestrator as any).validateNarrativeTemporalContinuity(
    'A veteran of the night watch finishes his patrol report after the morning shift, his expression quiet as midnight.',
    repository,
    storyId,
  );
  assert.equal(compoundAndFigurative.valid, true, compoundAndFigurative.errorReason || 'compound role nouns and figurative comparisons should be permitted');

  // Grounded negative observations ("no lantern hangs nearby", "without a tree") and baseline sensory nouns
  // ("the silence", "the stone floor") must not be flagged as invented concrete objects.
  const playerAction = 'I look around the area carefully.';
  const baseSituation = CurrentSituationBuilder.build({
    storyId,
    playerAction,
    worldRepo: repository,
  });
  const intent = PlayerIntentInterpreter.deterministic(playerAction, baseSituation);
  const situation = CurrentSituationBuilder.build({
    storyId,
    playerAction,
    currentAction: intent,
    worldRepo: repository,
  });
  const plan: any = {
    turnId: 'turn_obs_guard',
    objective: 'Observe the immediate surroundings.',
    immediateSteps: ['Look around carefully.'],
    informationToReveal: [],
    entitiesToReact: [],
    continuityRequirements: [],
    forbiddenAssumptions: [],
    stateEffectsExpected: [],
    createdAt: situation.worldTime,
    expiresAfterNarration: true,
  };

  const groundedNegativeAndBaseline = SemanticNarrativeReview.review({
    intent,
    situation,
    plan,
    turnPackage: {
      narrative: [
        `You look around ${situation.location.name}, your gaze settling on the stone floor while the silence hangs in the air and no lantern stands nearby.`,
      ],
      dialogue: [],
      events: [],
      stateChanges: [],
      memoryCandidates: [],
      audioCues: [],
    },
  });
  assert.equal(
    groundedNegativeAndBaseline.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'),
    false,
    'negated props and baseline scene nouns must not trigger UNSUPPORTED_CLAIM',
  );
  assert.equal(groundedNegativeAndBaseline.unsupportedClaims.length, 0);

  const inventedProp = SemanticNarrativeReview.review({
    intent,
    situation,
    plan,
    turnPackage: {
      narrative: [
        `You look around ${situation.location.name}, where a gilded chandelier hangs above a marble pedestal.`,
      ],
      dialogue: [],
      events: [],
      stateChanges: [],
      memoryCandidates: [],
      audioCues: [],
    },
  });
  assert.equal(
    inventedProp.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'),
    true,
    'invented positive concrete props must still be flagged as UNSUPPORTED_CLAIM',
  );
  assert.equal(inventedProp.unsupportedClaims.includes('gilded chandelier'), true);
});


