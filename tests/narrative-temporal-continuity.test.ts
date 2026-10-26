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

