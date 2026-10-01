import test from 'node:test';
import assert from 'node:assert/strict';

import { ResolutionGate } from '../server/domain/resolutionGate';
import { PlayerLifecycleState } from '../server/domain/playerLifecycleState';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { buildNpcPlanningSlice } from '../server/domain/npcPlanningSlice';
import { canonicalCommitLedger } from '../server/domain/canonicalCommitLedger';
import { captureCanonicalStateSnapshot } from '../server/domain/canonicalSnapshot';
import { buildNarrationPrompt } from '../server/domain/narrativePromptBuilder';
import { StoryCheckEngine } from '../server/domain/storyCheckEngine';
import type { ActionResolution } from '../src/types';

test('resolution gate does not roll for routine safe movement', () => {
  const result = ResolutionGate.evaluate({
    actionText: 'I walk forward.',
    currentSituation: {
      location: {
        id: 'loc',
        name: 'Quiet Hall',
        regionId: 'region',
        description: 'A clean stone hall.',
        accessible: true,
        discovered: true,
        connectedLocations: [],
      },
      activeConditions: [],
      visibleEvents: [],
    } as any,
  });
  assert.equal(result.mode, 'NO_CHECK');
  assert.equal(result.shouldRoll, false);
});

test('resolution gate keeps routine force actions deterministic without resistance', () => {
  const result = ResolutionGate.evaluate({
    actionText: 'I push the door open.',
    currentSituation: {
      location: {
        id: 'loc',
        name: 'Hall',
        regionId: 'region',
        description: 'A normal unlocked door stands here.',
        accessible: true,
        discovered: true,
        connectedLocations: [],
      },
      activeConditions: [],
      visibleEvents: [],
    } as any,
  });
  assert.equal(result.mode, 'NO_CHECK');
  assert.equal(result.shouldRoll, false);
});

test('resolution gate rolls for force against explicit resistance', () => {
  const result = ResolutionGate.evaluate({
    actionText: 'I force the jammed gate.',
    currentSituation: {
      location: {
        id: 'loc',
        name: 'Gatehouse',
        regionId: 'region',
        description: 'A jammed gate blocks the passage.',
        accessible: true,
        discovered: true,
        connectedLocations: [],
      },
      activeConditions: [],
      visibleEvents: [],
    } as any,
  });
  assert.equal(result.mode, 'CHECK_CANDIDATE');
  assert.equal(result.shouldRoll, true);
  assert.match(result.rationale, /resistance/i);
});

test('resolution gate rolls for explicit parkour even without an authored challenge', () => {
  const result = ResolutionGate.evaluate({
    actionText: 'I parkour across the broken pavement toward the lantern.',
    currentSituation: {
      location: {
        id: 'loc',
        name: 'Road',
        regionId: 'region',
        description: 'Broken pavement underfoot.',
        accessible: true,
        discovered: true,
        connectedLocations: [],
      },
      activeConditions: [],
      visibleEvents: [],
    } as any,
  });
  assert.equal(result.mode, 'CHECK_CANDIDATE');
  assert.equal(result.shouldRoll, true);
  assert.match(result.rationale, /technique/i);
});

test('authored challenge can declare a partial-success outcome tier', () => {
  const engine = new StoryCheckEngine();
  const result = engine.resolve(
    'phase23_partial',
    'I force the jammed gate.',
    {
      coreStats: {
        level: 1,
        strength: 12,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
        ac: 10,
        speed: 30,
        hitDice: '1d10',
        hpCurrent: 10,
        hpMax: 10,
      },
      skills: [],
    },
    {
      id: 'challenge_partial',
      label: 'Jammed gate',
      keywords: ['force'],
      difficultyClass: 5,
      ability: 'Strength',
      skill: 'Athletics',
      reason: 'The gate resists normal force.',
      triggerReason: 'The gate is jammed and needs significant force.',
      successOutcomeTier: 'PARTIAL_SUCCESS',
      onSuccess: { summary: 'The gate yields partially.' },
    },
  );
  assert.ok(result);
  assert.equal(result!.outcomeTier, 'PARTIAL_SUCCESS');
});

test('player lifecycle persists bounded intra-location spatial state without changing locationId', () => {
  const player = new PlayerLifecycleState({
    actorId: 'player_spatial',
    name: 'Player',
    locationId: 'loc_archive',
    lastUpdatedTime: 0,
  });
  const next = player.copyWith({
    localSpatialState: {
      areaId: 'loc_archive',
      focusEntityId: 'npc_archivist',
      focusLabel: 'Archivist',
      proximityBand: 'NEAR',
      updatedTurnId: 'turn_7',
    },
  });
  assert.equal(next.locationId, 'loc_archive');
  assert.equal(next.localSpatialState.proximityBand, 'NEAR');
  assert.equal(next.localSpatialState.focusEntityId, 'npc_archivist');
});

test('addressed NPC planning slice stays actor-scoped', () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const storyId = 'phase23_npc_slice';
  repository.seedStory(storyId);
  const player = repository.getPlayerLifecycle(storyId);
  assert.ok(player);
  const npc = new PlayerLifecycleState({
    actorId: 'npc_phase23',
    name: 'Maren',
    locationId: player.locationId,
    lastUpdatedTime: player.lastUpdatedTime,
    currentActivity: 'guarding the archive gate',
  });
  repository.updateNpcLifecycle(storyId, npc);

  repository.getMemoryEngine(storyId).storeMemory({
    id: 'npc_private_memory',
    storyId,
    memoryClass: 'EPISODIC',
    subjectEntityId: npc.actorId,
    relatedEntityIds: [],
    content: 'Maren remembers the player arriving during the last eclipse.',
    importance: 90,
    confidence: 0.9,
    status: 'active',
    visibility: 'PRIVATE',
    accessibleToEntityIds: [npc.actorId],
    isPersistentCritical: false,
    provenance: 'phase23_test',
    validFromTurn: 1,
    lastRecalledTurn: 1,
    triggerConditionTags: ['eclipse'],
  });

  const situation = CurrentSituationBuilder.build({
    storyId,
    playerAction: 'I speak to Maren about the gate.',
    viewerActorId: player.actorId,
    worldRepo: repository,
  });
  const slice = buildNpcPlanningSlice(repository, storyId, player.actorId, situation);
  assert.ok(slice);
  assert.equal(slice!.actorId, npc.actorId);
  assert.equal(slice!.addressed, true);
  assert.ok(slice!.recentMemories.some((memory) => memory.id === 'npc_private_memory'));
  assert.match(slice!.knowledgeBoundary, /NPC/);
});

test('canonical commit ledger can recover an interrupted command from its pre-state', () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  const storyId = 'phase23_ledger';
  repository.seedStory(storyId);
  const before = captureCanonicalStateSnapshot(storyId, repository);
  const command = {
    commandId: 'phase23_cmd_1',
    storyId,
    actorId: repository.getPlayerLifecycle(storyId)!.actorId,
    type: 'CORE_ACTION' as const,
    payload: { action: 'test' },
    source: 'PLAYER' as const,
  };
  canonicalCommitLedger.begin(repository, command, before, 'prehash', 'Y0001-M01-D01T00:00:00');
  const player = repository.getPlayerLifecycle(storyId)!;
  repository.updatePlayerLifecycle(storyId, player.copyWith({
    currentActivity: 'corrupted',
  }));
  const recovered = canonicalCommitLedger.recoverInterrupted(repository, storyId, 'Y0001-M01-D01T00:00:01');
  assert.equal(recovered.length, 1);
  assert.equal(repository.getPlayerLifecycle(storyId)!.currentActivity, player.currentActivity);
  assert.equal(canonicalCommitLedger.find(repository, storyId, command.commandId)!.phase, 'ABORTED');
  const retried = canonicalCommitLedger.begin(
    repository,
    command,
    captureCanonicalStateSnapshot(storyId, repository),
    'retryhash',
    'Y0001-M01-D01T00:00:02',
  );
  assert.equal(retried.phase, 'PREPARED');
  canonicalCommitLedger.markPhase(
    repository,
    storyId,
    command.commandId,
    'HANDLER_RESOLVED',
    'Y0001-M01-D01T00:00:03',
    { ownerPhases: { handler: 'VERIFIED' } },
  );
  assert.equal(canonicalCommitLedger.find(repository, storyId, command.commandId)!.phase, 'HANDLER_RESOLVED');
});

test('narration prompt gives structured action resolution precedence over prose reconstruction', () => {
  const resolution: ActionResolution = {
    resolutionId: 'resolution_phase23',
    storyId: 'phase23_prompt',
    turnId: 'turn_1',
    playerAction: 'I parkour toward the light.',
    playerIntent: {
      action: 'parkour toward the light',
      interactionMode: 'MOVE',
      movementIntent: true,
      observationIntent: false,
      speechIntent: false,
    },
    attemptedEffect: 'Reach the light by a controlled parkour maneuver.',
    targetEntityIds: [],
    resolutionMethod: 'CHECK',
    outcomeTier: 'FAILURE',
    actualEffect: 'The maneuver does not resolve cleanly.',
    canonicalStateChanges: [],
    physicalConsequences: ['Lost balance and momentum.'],
    playerVisibleConsequences: ['The landing is uncontrolled but no injury is established.'],
    evidenceIds: ['check_phase23'],
    uncertainty: ['No injury was established by canonical mechanics.'],
    provenance: { source: 'CANONICAL_ENGINE' },
  };

  const prompt = buildNarrationPrompt({
    situation: {
      storyId: 'phase23_prompt',
      turnId: 'turn_1',
      worldId: 'world',
      worldTime: 'Y0001-M01-D01T00:00:00',
      worldTimestamp: {
        year: 1, month: 1, day: 1, hour: 0, minute: 0, second: 0, totalElapsedSeconds: 0,
      },
      player: {
        actorId: 'player',
        name: 'Player',
        locationId: 'loc',
        currentActivity: 'idle',
        isTraveling: false,
        isDead: false,
        isTransformed: false,
        isPossessed: false,
        injuries: [],
        spatial: { proximityBand: 'SAME_AREA', areaId: 'loc' },
      },
      location: {
        id: 'loc',
        name: 'Road',
        regionId: 'region',
        description: 'Broken pavement.',
        accessible: true,
        discovered: true,
        connectedLocations: [],
      },
      nearbyEntities: [],
      visibleEvents: [],
      recentTurns: [],
      plot: { currentArc: 'OPENING', summary: '', recentBeats: [] ,},
      openThreads: [],
      relevantMemories: [],
      relevantLore: [],
      playerKnowledge: { viewerActorId: 'player', knownFacts: [], authorizedFactIds: [], note: '' },
      worldFacts: [],
      activeConditions: [],
      availableInteractions: [],
    } as any,
    intent: resolution.playerIntent as any,
    research: { blocks: [] } as any,
    plan: {
      objective: 'Resolve current action',
      nextBeats: [],
      priorityThreads: [],
      contingencies: [],
    } as any,
    actionResolution: resolution,
    maxPromptTokens: 3000,
  });
  assert.match(prompt.prompt, /ACTION RESOLUTION — AUTHORITATIVE/);
  assert.match(prompt.prompt, /FAILURE/);
  assert.match(prompt.prompt, /Lost balance and momentum/);
});
