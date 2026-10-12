// Phase B — prompt salience ordering (GAP-4 / S-4).
//
// verifies the authoritative scene/intent/resolution sit nearest the generation point,
// that a session-essence line survives tight budgets, and that supporting context is
// shed on boundaries instead of mid-sentence.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeDirector } from '../server/domain/narrativeDirector';
import { buildNarrationPrompt } from '../server/domain/narrativePromptBuilder';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';
import { PlayerIntentInterpreter } from '../server/domain/playerIntentInterpreter';
import { WorkingContextEngine } from '../server/domain/workingContextEngine';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

function buildPrompt(storyId: string, playerAction: string, options: { maxPromptTokens?: number; workingContext?: string } = {}) {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  repository.seedStory(storyId);
  const initial = CurrentSituationBuilder.build({ storyId, playerAction, worldRepo: repository });
  const intent = PlayerIntentInterpreter.deterministic(playerAction, initial);
  const situation = CurrentSituationBuilder.build({ storyId, playerAction, currentAction: intent, worldRepo: repository });
  const research = NarrativeResearchPipeline.research({ repository, storyId, currentSituation: situation, playerIntent: intent, playerAction });
  const plan = NarrativeDirector.create({ situation, intent, research });
  return buildNarrationPrompt({
    situation,
    intent,
    research,
    plan,
    workingContext: options.workingContext ?? 'SUPPORTING_CONTEXT_SENTINEL',
    maxPromptTokens: options.maxPromptTokens,
  });
}

describe('Phase B prompt salience', () => {
  it('places the authoritative scene/intent/resolution at the generation point', () => {
    const result = buildPrompt('phaseB_salience_default', 'I study the northern gate.');
    const prompt = result.prompt;
    const currentSituation = prompt.indexOf('CURRENT SITUATION');
    const playerIntent = prompt.indexOf('PLAYER INTENT');
    const actionResolution = prompt.indexOf('ACTION RESOLUTION — AUTHORITATIVE');
    const outputContract = prompt.indexOf('OUTPUT CONTRACT');
    const supporting = prompt.indexOf('SUPPORTING WORKING CONTEXT');
    for (const index of [currentSituation, playerIntent, actionResolution, outputContract, supporting]) {
      assert.ok(index >= 0, 'expected section missing');
    }
    assert.ok(supporting < currentSituation, 'authoritative scene must follow supporting context');
    assert.ok(currentSituation < playerIntent, 'scene before intent');
    assert.ok(playerIntent < actionResolution, 'intent before resolution');
    assert.ok(actionResolution < outputContract, 'resolution immediately before the output contract');
  });

  it('preserves a session essence line (location + goal) under a tight budget', () => {
    const result = buildPrompt('phaseB_salience_essence', 'I wait by the gate and listen.', { maxPromptTokens: 1200 });
    const prompt = result.prompt;
    assert.match(prompt, /SESSION ESSENCE/);
    assert.match(prompt, /Location=/);
    assert.match(prompt, /Goal=/);
    assert.ok(
      WorkingContextEngine.estimateTokens(prompt) <= 1200,
      'prompt must respect the hard token budget',
    );
    // The authoritative tail is still present and ordered under pressure.
    assert.ok(prompt.indexOf('CURRENT SITUATION') < prompt.indexOf('PLAYER INTENT'));
    assert.ok(prompt.indexOf('PLAYER INTENT') < prompt.indexOf('OUTPUT CONTRACT'));
  });

  it('sheds supporting context on a boundary rather than mid-sentence', () => {
    const longWorkingContext = [
      'The archive hall holds rows of unread manuscripts.',
      'Beren Ashdown waits beside the brass astrolabe and watches the northern gate.',
      'A courier left a sealed ledger on the reading desk this morning.',
      'Dust settles on the unlit lamps along the far wall.',
      'The Iron Citadel index lists three missing volumes.',
    ].join(' ');
    const result = buildPrompt('phaseB_salience_boundary', 'I search the reading desk.', {
      maxPromptTokens: 1100,
      workingContext: longWorkingContext,
    });
    const prompt = result.prompt;
    const headerIndex = prompt.indexOf('SUPPORTING WORKING CONTEXT');
    assert.ok(headerIndex >= 0);
    const bodyStart = prompt.indexOf('\n', headerIndex) + 1;
    const bodyEnd = prompt.indexOf('\n\n', bodyStart);
    const segment = prompt.slice(bodyStart, bodyEnd === -1 ? undefined : bodyEnd).trimEnd();
    assert.ok(segment.length > 0);
    if (segment.endsWith('…')) {
      const before = segment.slice(0, -1).trimEnd();
      assert.match(before, /[.!?;,:)"]$/, 'truncation must land on a boundary, not a partial word');
    }
  });
});
