import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';

import { gameRouter } from '../server/api/gameRoutes';
import {
  DeterministicMockAdapter,
  type ModelRegistryRecord,
} from '../server/domain/aiOrchestrator';
import { deterministicId, hashStringToSeed } from '../server/domain/deterministicRng';
import { serverMockAuthority } from '../server/mockEngine/serverMockAuthority';
import { worldRepository } from '../server/repositories/worldRepository';

const storyId = 'npc_initiative_http_integration';
const merchantId = 'npc_initiative_http_merchant';
const adapter = new DeterministicMockAdapter('provider_npc_initiative_http');
const modelId = 'npc-initiative-http-model';
let server: Server;
let baseUrl = '';
let expectedActionId = '';
let locationId = '';
let locationName = '';

function narrativeModel(): ModelRegistryRecord {
  return {
    providerId: adapter.providerId,
    modelId,
    displayName: modelId,
    pool: 'creative',
    capabilities: ['text_generation', 'structured_output', 'creative_writing'],
    contextWindow: 128000,
    health: 'Healthy',
    quota: 'Healthy',
    latencyMs: 1,
    userPriority: 100,
    roleEligibility: ['narrative.generate'],
    fallbackEligibility: true,
    accessStatus: 'accessible',
    lifecycleState: 'active',
    supportedInputTypes: ['text'],
    supportedOutputTypes: ['text', 'json'],
    hasStructuredOutput: true,
  };
}

before(async () => {
  worldRepository.seedStory(storyId);
  serverMockAuthority.setActiveStoryId(storyId);

  const player = worldRepository.getPlayerLifecycle(storyId);
  assert.ok(player, 'fixture story must have a canonical player');
  locationId = player.locationId!;
  const location = worldRepository.getGeographyGraph(storyId).getNode(locationId);
  assert.ok(location, 'fixture player location must exist in canonical geography');
  locationName = location.name;

  const template = worldRepository.getEntityCards(storyId, { status: 'ACTIVE' })[0];
  assert.ok(template, 'fixture story must expose an active entity card to clone');
  worldRepository.saveEntityCard(storyId, {
    ...template,
    id: merchantId,
    storyId,
    name: 'Mira Fen',
    kind: 'MERCHANT',
    isTemplate: false,
    identity: { ...(template.identity || {}), aliases: ['Mira'] },
    classification: {
      ...(template.classification || {}),
      role: 'merchant',
      profession: 'merchant',
      tags: ['merchant', 'local'],
    },
    social: { ...(template.social || {}), role: 'merchant' },
    worldState: {
      ...(template.worldState || {}),
      locationId,
      currentActivity: 'calling out wares to passersby',
      currentGoal: 'find reliable customers',
      isAlive: true,
      presence: 'present',
    },
    lifecycle: { ...(template.lifecycle || {}), status: 'ACTIVE' },
    metadata: {
      ...(template.metadata || {}),
      hidden: false,
      isHidden: false,
      visibility: 'VISIBLE',
      ambientPopulation: false,
      ambientActivity: 'calling out wares to passersby',
      activityRole: 'merchant',
    },
  } as any);

  adapter.cannedResponses.set('narrative.generate', JSON.stringify({
    narrative: [
      'Mira Fen calls out to you, inviting you to look over the wares. ' +
      'You pause in ' + locationName + ' and watch her activity without committing to a purchase.',
    ],
    dialogue: [],
    events: [],
    stateChanges: [],
    memoryCandidates: [],
    audioCues: [],
  }));

  const orchestrator = worldRepository.getAiOrchestrator();
  for (const registered of orchestrator.getAllModels()) {
    if (!registered.isEmergencyFloor) {
      orchestrator.updateModelHealth(registered.providerId, registered.modelId, 'DisabledByUser');
    }
  }
  orchestrator.registerModel(narrativeModel());
  orchestrator.registerAdapter(adapter);
  orchestrator.pinModelForTask('narrative.generate', modelId);
  orchestrator.setFallbackChain('narrative.generate', [
    adapter.providerId + '::' + modelId,
    'provider_deterministic_emergency::emergency-fallback-local',
  ]);

  const app = express();
  app.use(express.json());
  app.use('/api/game', gameRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') baseUrl = 'http://127.0.0.1:' + address.port;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('HTTP action commits eligible NPC initiative before the live narration prompt is built', async () => {
  const dynamicState = serverMockAuthority.getDynamicStoryState(storyId);
  const actionCountBefore = dynamicState.actionHistory.length;
  const secondsBefore = worldRepository.getWorldClock(storyId).getTimestamp().totalElapsedSeconds;

  // Pick an idempotent route command whose canonical action ID qualifies for this
  // fixture's deterministic NPC-initiative cadence and merchant hash. This makes
  // the test repeatable without a live model or random retries.
  let commandId = '';
  expectedActionId = '';
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const candidateCommandId = 'npc-initiative-http-command-' + attempt;
    const candidateActionId = deterministicId(
      'act_srv',
      storyId,
      candidateCommandId,
      'CUSTOM_ACTION',
      '',
      '',
      '',
      actionCountBefore,
      secondsBefore,
    );
    const initiativeSlot = hashStringToSeed(
      storyId + '|' + locationId + '|' + candidateActionId + '|init-slot',
    ) % 5;
    const merchantSlot = hashStringToSeed(merchantId + '|init|' + candidateActionId) % 3;
    if (initiativeSlot === 0 && merchantSlot === 0) {
      commandId = candidateCommandId;
      expectedActionId = candidateActionId;
      break;
    }
  }
  assert.ok(commandId, 'a deterministic action id should qualify for NPC initiative');

  const response = await fetch(baseUrl + '/api/game/action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-command-id': commandId,
    },
    body: JSON.stringify({
      type: 'CUSTOM_ACTION',
      storyId,
      actionText: 'I pause and watch the people nearby without speaking to anyone.',
    }),
  });
  const data = await response.json() as any;
  assert.equal(response.status, 200, JSON.stringify(data).slice(0, 1200));

  const event = worldRepository.getRecentCanonicalCommandEvents(storyId, 32)
    .find((entry: any) =>
      entry?.type === 'NPC_INITIATED_INTERACTION' &&
      entry?.triggerActionId === expectedActionId &&
      entry?.entityId === merchantId
    );
  assert.ok(event, 'the action route must commit a canonical NPC-initiated event for the selected visible local merchant');
  assert.match(String(event.summary || ''), /Mira Fen calls out to you/i);

  const matchingPromptCalls = adapter.callHistory.filter((call: any) =>
    String(call.prompt || '').includes(String(event.summary))
  );
  assert.ok(
    matchingPromptCalls.length >= 1,
    'the already-committed NPC interaction must reach the configured narration provider prompt; ' +
      'provider calls=' + adapter.callHistory.length + '; prompt previews=' +
      JSON.stringify(adapter.callHistory.map((call: any) => String(call.prompt || '').slice(0, 2400))),
  );

  const afterCount = worldRepository.getCanonicalCommandEventCount(storyId);
  assert.ok(afterCount > 0);
  const retryResponse = await fetch(baseUrl + '/api/game/action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-command-id': commandId,
    },
    body: JSON.stringify({
      type: 'CUSTOM_ACTION',
      storyId,
      actionText: 'I pause and watch the people nearby without speaking to anyone.',
    }),
  });
  assert.ok(retryResponse.status === 200 || retryResponse.status === 409);
  assert.equal(
    worldRepository.getCanonicalCommandEventCount(storyId),
    afterCount,
    'replaying the same canonical command must not duplicate the NPC-initiated event or any other canonical event',
  );
});
