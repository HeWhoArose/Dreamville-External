import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ResolutionGate } from '../server/domain/resolutionGate';
import { buildActionResolutionPromptContext } from '../server/domain/actionResolution';
import { PlayerLifecycleState } from '../server/domain/playerLifecycleState';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { WorkingContextEngine } from '../server/domain/workingContextEngine';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { captureCanonicalStateSnapshot } from '../server/domain/canonicalSnapshot';
import { canonicalCommitLedger } from '../server/domain/canonicalCommitLedger';
import { recordCanonicalNarrativeEvent, getCanonicalNarrativeEvents } from '../server/domain/canonicalNarrativeEvent';
import type { ActionResolution } from '../server/domain/actionResolution';

describe('Phase 23 architecture gap closure', () => {
  it('ResolutionGate distinguishes routine movement, hazardous traversal, and explicit technique attempts', () => {
    const routine = ResolutionGate.evaluate({ actionText: 'I walk across the room.' });
    assert.equal(routine.mode, 'NO_CHECK');
    assert.equal(routine.shouldRoll, false);

    const hazardous = ResolutionGate.evaluate({
      actionText: 'I move forward.',
      currentSituation: {
        location: { description: 'Broken pavement and treacherous terrain.' },
        activeConditions: [],
        visibleEvents: [],
      } as any,
    });
    assert.equal(hazardous.mode, 'CHECK_CANDIDATE');
    assert.equal(hazardous.shouldRoll, true);
    assert.match(hazardous.rationale, /hazard/i);

    const technique = ResolutionGate.evaluate({ actionText: 'I parkour over the railing.' });
    assert.equal(technique.mode, 'CHECK_CANDIDATE');
    assert.equal(technique.shouldRoll, true);
  });

  it('ActionResolution prompt projection preserves canonical outcome data without requiring prose reconstruction', () => {
    const resolution: ActionResolution = {
      resolutionId: 'resolution_1',
      storyId: 'story_1',
      turnId: 'turn_1',
      playerAction: 'I parkour toward the light.',
      playerIntent: {
        action: 'parkour toward the light',
        interactionMode: 'ACTION',
        movementIntent: true,
        observationIntent: false,
        speechIntent: false,
        targetIds: ['light_source'],
      },
      attemptedEffect: 'Reach the light source using a parkour maneuver.',
      targetEntityIds: ['light_source'],
      resolutionMethod: 'CHECK',
      outcomeTier: 'FAILURE_WITH_COST',
      actualEffect: 'The maneuver fails and momentum is lost.',
      canonicalStateChanges: [],
      physicalConsequences: ['The character lands hard and loses momentum.'],
      playerVisibleConsequences: ['The route remains accessible, but the maneuver does not complete cleanly.'],
      evidenceIds: ['check_1', 'event_1'],
      uncertainty: ['technique execution', 'environment'],
      provenance: { source: 'CANONICAL_ENGINE', canonicalCommandId: 'cmd_1' },
    };
    const projected = buildActionResolutionPromptContext(resolution);
    assert.match(projected, /FAILURE_WITH_COST/);
    assert.match(projected, /The maneuver fails and momentum is lost/);
    assert.match(projected, /canonicalCommandId/);
    assert.doesNotMatch(projected, /choose a future action/i);
  });

  it('bounded local spatial state survives lifecycle serialization and CurrentSituation projection', () => {
    const player = new PlayerLifecycleState({
      actorId: 'player_spatial',
      name: 'Hero',
      locationId: 'loc_whispering_orrery',
      lastUpdatedTime: 1,
      localSpatialState: {
        proximityBand: 'NEAR',
        areaId: 'loc_whispering_orrery',
        focusEntityId: 'char_maren',
        focusLabel: 'Maren',
        updatedTurnId: 'turn_1',
      },
    });
    const restored = PlayerLifecycleState.fromJSON(player.toJSON());
    assert.equal(restored.localSpatialState.proximityBand, 'NEAR');
    assert.equal(restored.localSpatialState.focusEntityId, 'char_maren');

    const repo = new InMemoryWorldRepository({ disablePersistence: true });
    repo.seedStory('default_story');
    repo.updatePlayerLifecycle('default_story', restored);
    const situation = CurrentSituationBuilder.build({
      storyId: 'default_story',
      playerAction: 'I move closer to Maren.',
      viewerActorId: restored.actorId,
      worldRepo: repo,
    });
    assert.equal(situation.player.spatial.proximityBand, 'NEAR');
    assert.equal(situation.player.spatial.focusEntityId, 'char_maren');
  });

  it('CurrentSituation exposes focused entity proximity as an interaction-visible distance band', () => {
    const repo = new InMemoryWorldRepository({ disablePersistence: true });
    const storyId = 'spatial_read_model_story';
    repo.seedStory(storyId);
    const player = repo.getPlayerLifecycle(storyId)!;
    const npcId = 'npc_focus_read_model';

    repo.saveEntityCard(storyId, {
      id: npcId,
      storyId,
      worldId: 'default_world',
      name: 'Maren',
      kind: 'NPC',
      identity: { aliases: ['Maren'] },
      classification: { role: 'NPC' },
      social: { factionIds: [], reputation: {}, relationships: {} },
      worldState: {
        locationId: player.locationId,
        currentActivity: 'waiting',
        isAlive: true,
        presence: 'present',
      },
      lifecycle: { status: 'ACTIVE' },
      isTemplate: false,
      metadata: {},
    } as any);

    repo.updatePlayerLifecycle(storyId, player.copyWith({
      localSpatialState: {
        areaId: player.locationId,
        focusEntityId: npcId,
        focusLabel: 'Maren',
        proximityBand: 'ADJACENT',
        updatedTurnId: 'turn_spatial_read',
      },
    }));

    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I move beside Maren.',
      viewerActorId: player.actorId,
      worldRepo: repo,
    });
    const focused = situation.nearbyEntities.find((entity) => entity.id === npcId);
    assert.equal(focused?.distanceBand, 'ADJACENT');
    assert.ok(situation.availableInteractions.some((interaction) => interaction.targetId === npcId));
  });

  it('canonical commit ledger recovers an interrupted command by restoring the durable pre-state checkpoint', () => {
    const repo = new InMemoryWorldRepository({ disablePersistence: true });
    const storyId = 'ledger_recovery_story';
    repo.seedStory(storyId);
    const before = captureCanonicalStateSnapshot(storyId, repo);
    const command = {
      commandId: 'cmd_interrupted',
      storyId,
      actorId: repo.getPlayerLifecycle(storyId)!.actorId,
      type: 'CORE_ACTION' as const,
      payload: { action: 'I attempt something' },
      source: 'PLAYER' as const,
      transactionMode: 'STAGED' as const,
    };
    canonicalCommitLedger.begin(repo, command, before, 'prehash', 'Y0042-M01-D01T00:00:00');
    const player = repo.getPlayerLifecycle(storyId)!;
    repo.updatePlayerLifecycle(storyId, player.copyWith({ currentActivity: 'corrupted_intermediate_state' }));
    const recovered = canonicalCommitLedger.recoverInterrupted(repo, storyId, 'Y0042-M01-D01T00:01:00');
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].phase, 'ABORTED');
    assert.notEqual(repo.getPlayerLifecycle(storyId)!.currentActivity, 'corrupted_intermediate_state');
    assert.equal(
      canonicalCommitLedger.find(repo, storyId, command.commandId)?.phase,
      'ABORTED',
    );
  });

  it('objective narrative events are immutable projections separate from subjective memories', () => {
    const repo = new InMemoryWorldRepository({ disablePersistence: true });
    const storyId = 'memory_boundary_story';
    repo.seedStory(storyId);
    const event = recordCanonicalNarrativeEvent(repo, {
      storyId,
      turnId: 'turn_42',
      canonicalEventId: 'canon_evt_42',
      commandId: 'cmd_42',
      summary: 'The character reached the archive doorway.',
      mutationPaths: ['player.localSpatialState'],
    });
    assert.equal(event.perspective, 'OBJECTIVE');
    assert.equal(getCanonicalNarrativeEvents(repo, storyId)[0]?.id, event.id);
    const memoryEngine = repo.getMemoryEngine(storyId);
    memoryEngine.storeMemory({
      id: 'subjective_memory_42',
      storyId,
      memoryClass: 'EPISODIC',
      subjectEntityId: repo.getPlayerLifecycle(storyId)!.actorId,
      relatedEntityIds: [],
      content: 'I think the archive doorway was dangerous.',
      importance: 50,
      confidence: 0.7,
      status: 'active',
      visibility: 'PRIVATE',
      isPersistentCritical: false,
      provenance: 'narrative_memory_lifecycle',
      sourceEventId: event.id,
      perspective: 'SUBJECTIVE',
      validFromTurn: 42,
      lastRecalledTurn: 42,
      triggerConditionTags: ['archive'],
    });
    assert.equal(memoryEngine.getMemory('subjective_memory_42')?.perspective, 'SUBJECTIVE');
    assert.equal(memoryEngine.getMemory('subjective_memory_42')?.sourceEventId, event.id);
  });

  it('working-context pins are durable protected-source metadata rather than a second context authority', () => {
    const repo = new InMemoryWorldRepository({ disablePersistence: true });
    const storyId = 'context_pin_story';
    repo.seedStory(storyId);
    const run = repo.getStoryRun(storyId)!;
    run.runtimeState = { ...(run.runtimeState || {}), workingContextPins: ['b3_relevant_source'] };
    repo.saveStoryRun(run);

    const result = WorkingContextEngine.assembleTurnContext({
      storyId,
      playerAction: 'Observe the scene.',
      hardTokenBudget: 3000,
      worldRepo: repo,
      customChunks: [{
        id: 'b3_relevant_source',
        band: 'B3_CAUSAL_OPPORTUNITY',
        label: 'Pinned Source',
        content: 'A player-selected continuity source.',
        estimatedTokens: 8,
        sourceAuthority: 'test',
      }],
    });

    const pinned = result.chunks.find((chunk) => chunk.id === 'b3_relevant_source');
    assert.equal(pinned?.isProtected, true);
    assert.ok(result.pinnedSourceIds.includes('b3_relevant_source'));
  });
});
