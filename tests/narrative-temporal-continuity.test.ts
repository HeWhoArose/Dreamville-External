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

test('bounded lack of evidence satisfies the information-seeking continuity gate', () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const orchestrator = new MultiModelOrchestrator(repository);
  const result = (orchestrator as any).validateNarrativeInformationContinuity(
    'Aelion scans the perimeter for a source of the beacon. No visible clue identifies who lit it; the cause is not established from the current vantage point.',
    'I observe the perimeter trying to find why the beacon was lit',
    {
      informationGoal: 'find why the beacon was lit',
      interactionMode: 'PASSIVE_OBSERVATION',
      observationIntent: true,
    },
  );
  assert.equal(result.valid, true, result.errorReason || 'A bounded, grounded limitation should satisfy the observation turn.');
});

test('information-seeking narration is still rejected when it provides only atmosphere', () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const orchestrator = new MultiModelOrchestrator(repository);
  const result = (orchestrator as any).validateNarrativeInformationContinuity(
    'Aelion walks among the stones while a cool breeze crosses the quiet perimeter.',
    'I observe the perimeter trying to find why the beacon was lit',
    {
      informationGoal: 'find why the beacon was lit',
      interactionMode: 'PASSIVE_OBSERVATION',
      observationIntent: true,
    },
  );
  assert.equal(result.valid, false);
  assert.match(result.errorReason || '', /does not contain a grounded answer/i);
});

test('internal occupancy diagnostics are blocked from live narration', () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const orchestrator = new MultiModelOrchestrator(repository);
  const result = (orchestrator as any).validateNarrativeMetaLeakage(
    'No visible occupants are currently established in the canonical scene projection; this alone does not mean the location is abandoned.',
  );
  assert.equal(result.valid, false);
  assert.match(result.errorReason || '', /internal test, provider, orchestration, or canonical-state terminology/i);
});
