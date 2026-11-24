import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NarrativeMemoryLifecycle } from '../server/domain/narrativeMemoryLifecycle';
import { MemoryOpportunityEngine } from '../server/domain/memoryOpportunityEngine';
import { buildNpcPlanningSlice } from '../server/domain/npcPlanningSlice';
import { worldRepository } from '../server/repositories/worldRepository';
import { seedE2eStory } from './e2e-test-helper';
import { deterministicId } from '../server/domain/deterministicRng';

describe('Unified Memory Lifecycle Integration (F17)', () => {
  const storyId = 'test_story_unified_memory';

  beforeEach(() => {
    seedE2eStory(storyId);
  });

  it('turn-driven deterministic decay transitions unreinforced memories active -> dormant -> archived', () => {
    const memoryEngine = worldRepository.getMemoryEngine(storyId);

    // 1. Store a standard unreinforced memory at turn 1
    memoryEngine.storeMemory({
      id: 'mem_ordinary_chat',
      storyId,
      memoryClass: 'EPISODIC',
      subjectEntityId: 'player_actor',
      relatedEntityIds: ['npc_merchant'],
      content: 'Chatted about the price of apples',
      importance: 50,
      confidence: 0.9,
      status: 'active',
      visibility: 'PRIVATE',
      accessibleToEntityIds: ['player_actor'],
      isPersistentCritical: false,
      provenance: 'test',
      validFromTurn: 1,
      lastRecalledTurn: 1,
      triggerConditionTags: ['apples', 'merchant'],
    });

    // 2. Advance 25 turns without recalling mem_ordinary_chat
    memoryEngine.decayMemories({
      storyId,
      currentTurn: 26,
    });

    const dormantMem = memoryEngine.getMemory('mem_ordinary_chat');
    assert.ok(dormantMem);
    assert.equal(dormantMem?.status, 'dormant');
    assert.equal(dormantMem?.importance, 40); // 50 - 10

    // 3. Advance 105 turns without recall (total 131 turns)
    memoryEngine.decayMemories({
      storyId,
      currentTurn: 131,
    });

    const archivedMem = memoryEngine.getMemory('mem_ordinary_chat');
    assert.ok(archivedMem);
    assert.equal(archivedMem?.status, 'archived');
    assert.equal(archivedMem?.importance, 25); // 40 - 15
  });

  it('floor protection: persistent critical and locked memories resist decay', () => {
    const memoryEngine = worldRepository.getMemoryEngine(storyId);

    // Persistent critical memory
    memoryEngine.storeMemory({
      id: 'mem_critical_plot',
      storyId,
      memoryClass: 'CAUSAL',
      subjectEntityId: 'player_actor',
      relatedEntityIds: [],
      content: 'The ancient seal was broken by the traitor.',
      importance: 75,
      confidence: 1.0,
      status: 'active',
      isPersistentCritical: true, // Floor protection
      provenance: 'canon',
      validFromTurn: 1,
      lastRecalledTurn: 1,
      triggerConditionTags: ['seal', 'traitor'],
    });

    // Authoritatively locked memory
    memoryEngine.storeMemory({
      id: 'mem_locked_secret',
      storyId,
      memoryClass: 'PERSISTENT_IDENTITY',
      subjectEntityId: 'player_actor',
      relatedEntityIds: [],
      content: 'True identity of the protagonist.',
      importance: 60,
      confidence: 1.0,
      status: 'active',
      isPersistentCritical: false,
      isLocked: true, // Locked against decay
      provenance: 'identity',
      validFromTurn: 1,
      lastRecalledTurn: 1,
      triggerConditionTags: ['identity'],
    });

    // Advance 150 turns
    memoryEngine.decayMemories({
      storyId,
      currentTurn: 151,
    });

    const critical = memoryEngine.getMemory('mem_critical_plot');
    assert.equal(critical?.status, 'active');
    assert.equal(critical?.importance, 75);

    const locked = memoryEngine.getMemory('mem_locked_secret');
    assert.equal(locked?.status, 'active');
    assert.equal(locked?.importance, 60);
  });

  it('dynamic visibility: dialogues set SHARED visibility and update co-located NPC accessibleToEntityIds and memoryRefs', () => {
    const registry = worldRepository.getEntityRegistry(storyId);
    registry.upsert({
      id: 'npc_colocated_barkeep',
      storyId,
      name: 'Barkeep Sam',
      kind: 'NPC',
      lifecycle: { status: 'ACTIVE' },
      worldState: { locationId: 'loc_office', isAlive: true, presence: 'present' },
      createdAt: new Date().toISOString(),
    });

    const situation: any = {
      storyId,
      turnId: 'turn_dialogue_1',
      location: { id: 'loc_office', name: 'Private Office' },
      player: { actorId: 'player_actor', name: 'Ren Takahashi' },
      nearbyEntities: [
        { id: 'npc_colocated_barkeep', name: 'Barkeep Sam', visibleToPlayer: true, kind: 'NPC' },
      ],
      worldFacts: [],
      playerKnowledge: { knownFacts: [], authorizedFactIds: [] },
      sceneEvidence: { entities: [], objects: [], sceneAnchorMatches: [] },
      visibleEvents: [],
      recentTurns: [],
    };

    const turnPackage: any = {
      narrative: ['Ren speaks with Barkeep Sam about the mysterious ledger.'],
      dialogue: [{ speaker: 'Barkeep Sam', text: 'The ledger was signed in red ink.' }],
      events: ['DIALOGUE_EXCHANGED'],
      stateChanges: [],
      memoryCandidates: ['Barkeep Sam stated the ledger was signed in red ink.'],
    };

    const res = NarrativeMemoryLifecycle.processTurn({
      repository: worldRepository,
      storyId,
      turnId: 'turn_dialogue_1',
      playerAction: 'I ask Barkeep Sam about the ledger',
      playerIntent: {
        action: 'talk',
        interactionMode: 'DIALOGUE',
        speechIntent: true,
        movementIntent: false,
        observationIntent: false,
        explicitTargets: [{ id: 'npc_colocated_barkeep', name: 'Barkeep Sam' }],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I ask Barkeep Sam about the ledger',
      },
      currentSituation: situation,
      turnPackage,
    });

    assert.ok(res.promotedMemoryIds.length > 0);
    const memoryId = res.promotedMemoryIds[0];
    const memory = worldRepository.getMemoryEngine(storyId).getMemory(memoryId);
    assert.ok(memory);
    assert.equal(memory?.visibility, 'SHARED');
    assert.ok(memory?.accessibleToEntityIds?.includes('player_actor'));
    assert.ok(memory?.accessibleToEntityIds?.includes('npc_colocated_barkeep'));

    // Verify EntityCard.memoryRefs was updated on the NPC
    const updatedCard = registry.get('npc_colocated_barkeep');
    assert.ok(updatedCard);
    assert.ok(Array.isArray(updatedCard?.memoryRefs));
    assert.ok(updatedCard?.memoryRefs?.includes(memoryId));

    // Verify NPC Planning Slice can recall this memory
    const planningSlice = buildNpcPlanningSlice({
      repository: worldRepository,
      storyId,
      situation: {
        ...situation,
        currentAction: { originalText: 'I speak with Barkeep Sam' },
      },
      viewerActorId: 'player_actor',
      targetEntityId: 'npc_colocated_barkeep',
    });
    assert.ok(planningSlice);
    assert.ok(planningSlice?.recentMemories.some((m) => m.id === memoryId));
  });

  it('private player thoughts maintain PRIVATE visibility and do not leak to co-located NPCs', () => {
    const registry = worldRepository.getEntityRegistry(storyId);
    registry.upsert({
      id: 'npc_colocated_bystander',
      storyId,
      name: 'Bystander Dan',
      kind: 'NPC',
      lifecycle: { status: 'ACTIVE' },
      worldState: { locationId: 'loc_office', isAlive: true, presence: 'present' },
      createdAt: new Date().toISOString(),
    });

    const situation: any = {
      storyId,
      turnId: 'turn_private_1',
      location: { id: 'loc_office', name: 'Private Office' },
      player: { actorId: 'player_actor', name: 'Ren Takahashi' },
      nearbyEntities: [
        { id: 'npc_colocated_bystander', name: 'Bystander Dan', visibleToPlayer: true, kind: 'NPC' },
      ],
      worldFacts: [],
      playerKnowledge: { knownFacts: [], authorizedFactIds: [] },
      sceneEvidence: { entities: [], objects: [], sceneAnchorMatches: [] },
      visibleEvents: [],
      recentTurns: [],
    };

    // Private introspection / search (no speech, no events)
    const turnPackage: any = {
      narrative: ['Ren silently recalls the code to the vault: 12-34-56.'],
      dialogue: [],
      events: [],
      stateChanges: [],
      memoryCandidates: ['Silently recalled the code to the vault inside the private office: 12-34-56.'],
    };

    const res = NarrativeMemoryLifecycle.processTurn({
      repository: worldRepository,
      storyId,
      turnId: 'turn_private_1',
      playerAction: 'I silently recall the vault code',
      playerIntent: {
        action: 'think',
        interactionMode: 'OTHER',
        speechIntent: false,
        movementIntent: false,
        observationIntent: true,
        explicitTargets: [],
        impliedTargets: [],
        confidence: 1,
        source: 'DETERMINISTIC',
        originalText: 'I silently recall the vault code',
      },
      currentSituation: situation,
      turnPackage,
    });

    assert.ok(res.promotedMemoryIds.length > 0);
    const memoryId = res.promotedMemoryIds[0];
    const memory = worldRepository.getMemoryEngine(storyId).getMemory(memoryId);
    assert.ok(memory);
    assert.equal(memory?.visibility, 'PRIVATE');
    assert.deepEqual(memory?.accessibleToEntityIds, ['player_actor']);

    // Bystander must NOT have this memory reference
    const bystanderCard = registry.get('npc_colocated_bystander');
    assert.ok(!bystanderCard?.memoryRefs?.includes(memoryId));

    // Bystander planning slice must NOT include this private thought
    const planningSlice = buildNpcPlanningSlice({
      repository: worldRepository,
      storyId,
      situation: {
        ...situation,
        currentAction: { originalText: 'I look at Bystander Dan' },
      },
      viewerActorId: 'player_actor',
      targetEntityId: 'npc_colocated_bystander',
    });
    assert.ok(!planningSlice?.recentMemories.some((m) => m.id === memoryId));
  });

  it('canonical state commits create persistent critical CAUSAL memories in MemoryOpportunityEngine', () => {
    const memoryEngine = worldRepository.getMemoryEngine(storyId);

    const situation: any = {
      storyId,
      turnId: 'turn_commit_1',
      location: { id: 'loc_office', name: 'Private Office' },
      player: { actorId: 'player_actor', name: 'Ren Takahashi' },
      nearbyEntities: [],
      worldFacts: [],
      playerKnowledge: { knownFacts: [], authorizedFactIds: [] },
      sceneEvidence: { entities: [], objects: [], sceneAnchorMatches: [] },
      visibleEvents: [],
      recentTurns: [],
    };

    const res = NarrativeMemoryLifecycle.processTurn({
      repository: worldRepository,
      storyId,
      turnId: 'turn_commit_1',
      playerAction: 'I unlock the iron safe',
      currentSituation: situation,
      turnPackage: {
        narrative: ['The heavy iron safe swings open with a sharp click.'],
        dialogue: [],
        events: ['SAFE_UNLOCKED'],
        stateChanges: [],
        memoryCandidates: [],
      },
      stateAdjudication: {
        decision: 'ACCEPT',
        effectiveState: {} as any,
        commitRecords: [
          {
            commandId: 'cmd_unlock_1',
            kind: 'LOCK_STATE',
            targetId: 'safe_obj_1',
            summary: 'Iron safe was successfully unlocked with the brass key.',
            provenance: 'canonical',
          },
        ],
      },
    });

    assert.ok(res.plotBeatId);
    const plotMemoryId = deterministicId('plot_beat_memory', storyId, res.plotBeatId);
    const causalMemory = memoryEngine.getMemory(plotMemoryId);
    assert.ok(causalMemory);
    assert.equal(causalMemory?.memoryClass, 'CAUSAL');
    assert.equal(causalMemory?.isPersistentCritical, true);
    assert.equal(causalMemory?.importance, 85);
    assert.ok(causalMemory?.content.includes('Iron safe was successfully unlocked'));
  });

  it('episodic-to-semantic thread resolution consolidation', () => {
    const memoryEngine = worldRepository.getMemoryEngine(storyId);

    // Seed two episodic memories related to an open thread
    const threadId = 'thread_clock_tower_heist';
    memoryEngine.storeMemory({
      id: 'mem_heist_clue_1',
      storyId,
      memoryClass: 'EPISODIC',
      subjectEntityId: 'player_actor',
      relatedEntityIds: [],
      relatedThreadId: threadId,
      content: 'Found broken glass beneath the clock face.',
      importance: 70,
      confidence: 0.9,
      status: 'active',
      isPersistentCritical: false,
      provenance: 'investigation',
      validFromTurn: 1,
      lastRecalledTurn: 1,
      triggerConditionTags: ['clock', 'heist', 'glass'],
    });

    memoryEngine.storeMemory({
      id: 'mem_heist_clue_2',
      storyId,
      memoryClass: 'EPISODIC',
      subjectEntityId: 'player_actor',
      relatedEntityIds: [],
      relatedThreadId: threadId,
      content: 'Found a grappling hook caught on the gargoyle.',
      importance: 70,
      confidence: 0.9,
      status: 'active',
      isPersistentCritical: false,
      provenance: 'investigation',
      validFromTurn: 2,
      lastRecalledTurn: 2,
      triggerConditionTags: ['clock', 'heist', 'hook'],
    });

    // Seed open thread in story run
    const run = worldRepository.getStoryRun(storyId)!;
    run.runtimeState = {
      ...(run.runtimeState || {}),
      openNarrativeThreads: [
        {
          id: threadId,
          title: 'The Clock Tower Heist Origin',
          summary: 'Determine who infiltrated the clock tower and stole the crystal.',
          sourceTurnId: 'turn_1',
          relatedEntityIds: [],
          status: 'OPEN',
          priority: 80,
          lastTouchedAt: new Date().toISOString(),
        },
      ],
    };
    worldRepository.saveStoryRun(run);

    const situation: any = {
      storyId,
      turnId: 'turn_resolve_1',
      location: { id: 'loc_office', name: 'Private Office' },
      player: { actorId: 'player_actor', name: 'Ren Takahashi' },
      nearbyEntities: [],
      worldFacts: [],
      playerKnowledge: { knownFacts: [], authorizedFactIds: [] },
      sceneEvidence: { entities: [], objects: [], sceneAnchorMatches: [] },
      visibleEvents: [],
      recentTurns: [],
    };

    // Process turn with narrative confirming thread resolution
    const res = NarrativeMemoryLifecycle.processTurn({
      repository: worldRepository,
      storyId,
      turnId: 'turn_resolve_1',
      playerAction: 'I review my notes on the clock tower heist',
      currentSituation: situation,
      turnPackage: {
        narrative: ['The clock tower heist origin was resolved and confirmed through the evidence.'],
        dialogue: [],
        events: ['THREAD_RESOLVED'],
        stateChanges: [],
        memoryCandidates: [],
      },
    });

    assert.ok(res.resolvedThreadIds.includes(threadId));

    // Verify consolidated SEMANTIC memory was created
    const consolidatedMemories = memoryEngine
      .getAllMemories(storyId)
      .filter((m) => m.memoryClass === 'SEMANTIC' && m.relatedThreadId === threadId);
    assert.equal(consolidatedMemories.length, 1);
    const consolidated = consolidatedMemories[0];
    assert.ok(consolidated.content.includes('Resolved Investigation: The Clock Tower Heist Origin'));
    assert.equal(consolidated.importance, 75);

    // Verify source episodic memories were stepped down in importance for natural decay
    const source1 = memoryEngine.getMemory('mem_heist_clue_1');
    const source2 = memoryEngine.getMemory('mem_heist_clue_2');
    assert.equal(source1?.importance, 30);
    assert.equal(source2?.importance, 30);
    assert.equal(source1?.consolidatedIntoId, consolidated.id);
    assert.equal(source2?.consolidatedIntoId, consolidated.id);
  });
});
