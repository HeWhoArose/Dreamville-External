import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';

import { worldRepository } from '../server/repositories/worldRepository';
import { serverMockAuthority } from '../server/mockEngine/serverMockAuthority';
import { gameRouter } from '../server/api/gameRoutes';
import { narrativeContinuityEngine } from '../server/domain/narrativeContinuityEngine';

test('F03 & F04: live /api/game/action route computes stateAdjudication and durably persists plot.beats', async () => {
  const storyId = 'live_plot_beats_persistence_' + Date.now();
  worldRepository.seedStory(storyId);

  const orchestrator = worldRepository.getAiOrchestrator();
  const originalGenerate = orchestrator.generateNarrativeOnly;

  // Provide realistic narrative presentation that acknowledges the action
  (orchestrator as any).generateNarrativeOnly = async (params: any) => {
    return {
      success: true,
      turnPackage: {
        narrative: ['You strike the wooden barricade with your crowbar, splintering the timber as force reverberates through the frame.'],
        dialogue: [],
        events: ['WOODEN_BARRICADE_SPLINTERED'],
        stateChanges: [], // Presentation only: stateChanges are stripped
        memoryCandidates: ['The wooden barricade was heavily splintered.'],
        audioCues: [],
        visualCues: [],
      },
      providerId: 'fixture-provider',
      modelId: 'fixture-primary',
      source: 'AI_PRIMARY',
      narrativePlan: {
        turnId: 'turn_plot_fixture',
        objective: 'Resolve the player strike.',
        immediateSteps: ['Show the impact.'],
        informationToReveal: [],
        entitiesToReact: [],
        continuityRequirements: [],
        forbiddenAssumptions: [],
        stateEffectsExpected: [],
        createdAt: 'Day 1 • Afternoon',
        expiresAfterNarration: true,
      },
    };
  };

  const app = express();
  app.use(express.json());
  app.use('/api/game', gameRouter);

  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const response = await fetch(`${baseUrl}/api/game/action`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-story-id': storyId,
      },
      body: JSON.stringify({
        type: 'CUSTOM_ACTION',
        storyId,
        actionText: 'I smash the barricade with all my strength.',
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.ok(body.actionId, 'an actionId must be returned');

    // 1. Verify stateAdjudication is attached to ActionResult
    assert.ok(body.stateAdjudication, 'ActionResult must include stateAdjudication');
    assert.equal(body.stateAdjudication.allApproved, true);
    assert.ok(body.stateAdjudication.commitRecords.length > 0, 'stateAdjudication must contain commitRecords');
    assert.ok(
      body.stateAdjudication.commitRecords.some((rec: any) =>
        rec.source === 'CANONICAL_ENGINE' || rec.source === 'CANONICAL_ACTION'
      ),
      'commitRecords must have canonical provenance'
    );

    // 2. Verify plot.beats is populated in story run runtime state
    const savedRun = worldRepository.getStoryRun(storyId);
    assert.ok(savedRun, 'story run must exist');
    const beats = savedRun?.runtimeState?.plot?.beats || [];
    assert.ok(beats.length > 0, 'runtimeState.plot.beats must contain at least one beat on live turn');

    const latestBeat = beats.at(-1);
    assert.ok(latestBeat.text, 'beat must have text summary');
    assert.equal(latestBeat.turnId, body.actionId, 'beat turnId must match committed actionId');

    // 3. Verify narrativeContinuityEngine has matching plot beat
    const continuity = narrativeContinuityEngine.getState(worldRepository, storyId);
    assert.ok(continuity.plot.beats.length > 0, 'continuity engine plot beats must be populated');
    assert.equal(continuity.plot.beats.at(-1)?.id, latestBeat.id);

    // 4. Assert decorative AI events are NOT converted into plot beats
    assert.ok(
      !beats.some((b: any) => b.text.includes('WOODEN_BARRICADE_SPLINTERED')),
      'AI event text must not be converted into a plot beat'
    );
  } finally {
    (orchestrator as any).generateNarrativeOnly = originalGenerate;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    worldRepository.deleteStoryRun(storyId);
  }
});
