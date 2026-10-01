import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildNpcPlanningSlice } from '../server/domain/npcPlanningSlice';
import { WorkingContextEngine } from '../server/domain/workingContextEngine';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { PlayerLifecycleState } from '../server/domain/playerLifecycleState';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

function seedNpc(repo: InMemoryWorldRepository, storyId: string, npcId: string, locationId: string, name = 'Maren', currentActivity = 'studying the old observatory charts'): void {
  repo.saveEntityCard(storyId, {
    id: npcId,
    storyId,
    worldId: 'default_world',
    name,
    kind: 'NPC',
    templateId: undefined,
    isTemplate: false,
    identity: { aliases: [name] },
    classification: { tags: [], role: 'NPC' },
    personality: { traits: [], values: [], motivations: [], fears: [], desires: [] },
    behavior: { priorities: [] },
    social: { factionIds: [], reputation: {}, relationships: {} },
    worldState: {
      locationId,
      currentActivity,
      currentGoal: currentActivity,
      isAlive: true,
      presence: 'present',
    },
    traits: [],
    capabilities: [],
    feats: [],
    equipment: [],
    memoryRefs: [],
    lifecycle: { status: 'ACTIVE' },
    provenance: { source: 'PHASE23_TEST', createdBy: 'SYSTEM', confidence: 1 },
    metadata: {},
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  } as any);
}

describe('NPC epistemic boundary and planning closure', () => {
  it('builds a private planning slice for an explicitly addressed NPC', () => {
    const repo = new InMemoryWorldRepository({ disablePersistence: true });
    const storyId = 'npc_planning_story';
    repo.seedStory(storyId);

    const player = repo.getPlayerLifecycle(storyId)!;
    const npcId = 'npc_maren';
    seedNpc(repo, storyId, npcId, player.locationId);

    const situation = CurrentSituationBuilder.build({
      storyId,
      playerAction: 'I ask Maren what she knows.',
      viewerActorId: player.actorId,
      worldRepo: repo,
    });

    const memoryEngine = repo.getMemoryEngine(storyId);
    memoryEngine.storeMemory({
      id: 'maren_secret_memory',
      storyId,
      memoryClass: 'EPISODIC',
      subjectEntityId: npcId,
      relatedEntityIds: [],
      content: 'Maren secretly hid the brass key beneath the observatory stairs.',
      importance: 95,
      confidence: 1,
      status: 'active',
      visibility: 'PRIVATE',
      isPersistentCritical: true,
      provenance: 'npc_private_test',
      sourceEventId: 'event_private_1',
      perspective: 'SUBJECTIVE',
      validFromTurn: 1,
      lastRecalledTurn: 1,
      triggerConditionTags: ['key'],
    });

    const slice = buildNpcPlanningSlice(repo, storyId, player.actorId, situation, npcId);
    assert.equal(slice?.actorId, npcId);
    assert.equal(slice?.recentMemories[0]?.id, 'maren_secret_memory');
    assert.match(slice?.knowledgeBoundary || '', /player knowledge must never be substituted/i);
  });

  it('keeps the private planning slice out of generic narrative research', () => {
    const repo = new InMemoryWorldRepository({ disablePersistence: true });
    const storyId = 'npc_research_boundary_story';
    repo.seedStory(storyId);
    const player = repo.getPlayerLifecycle(storyId)!;

    const npcId = 'npc_maren';
    seedNpc(repo, storyId, npcId, player.locationId, 'Maren', 'watching the observatory door');

    repo.getMemoryEngine(storyId).storeMemory({
      id: 'npc_secret_not_for_narrator',
      storyId,
      memoryClass: 'EPISODIC',
      subjectEntityId: npcId,
      relatedEntityIds: [],
      content: 'SECRET NPC MEMORY: Maren is hiding the truth from the player.',
      importance: 90,
      confidence: 1,
      status: 'active',
      visibility: 'PRIVATE',
      isPersistentCritical: true,
      provenance: 'npc_private_test',
      sourceEventId: 'event_private_2',
      perspective: 'SUBJECTIVE',
      validFromTurn: 1,
      lastRecalledTurn: 1,
      triggerConditionTags: ['secret'],
    });

    const result = NarrativeResearchPipeline.research({
      repository: repo,
      storyId,
      playerAction: 'I ask Maren what she knows.',
      viewerActorId: player.actorId,
      hardTokenBudget: 2400,
    });

    assert.ok(!result.blocks.some((block: any) => String(block.content).includes('SECRET NPC MEMORY')));
    assert.ok(!JSON.stringify(result.researchPacket || result).includes('npcPlanningContext'));
  });

  it('keeps private NPC memory available through the dedicated NPC context path', () => {
    const repo = new InMemoryWorldRepository({ disablePersistence: true });
    const storyId = 'npc_private_context_story';
    repo.seedStory(storyId);
    const player = repo.getPlayerLifecycle(storyId)!;
    const npcId = 'npc_maren';

    seedNpc(repo, storyId, npcId, player.locationId, 'Maren', 'sorting letters');
    repo.getMemoryEngine(storyId).storeMemory({
      id: 'private_dialogue_memory',
      storyId,
      memoryClass: 'EPISODIC',
      subjectEntityId: npcId,
      relatedEntityIds: [],
      content: 'Maren remembers the hidden passage behind the astronomical map.',
      importance: 80,
      confidence: 0.95,
      status: 'active',
      visibility: 'PRIVATE',
      isPersistentCritical: false,
      provenance: 'npc_private_test',
      sourceEventId: 'event_private_3',
      perspective: 'SUBJECTIVE',
      validFromTurn: 1,
      lastRecalledTurn: 1,
      triggerConditionTags: ['passage'],
    });

    const context = WorkingContextEngine.buildAuthorizedNpcContext({
      storyId,
      npcId,
      npcName: 'Maren',
      playerSpokenText: 'What do you know?',
      worldRepo: repo,
    });
    assert.match(context, /hidden passage behind the astronomical map/i);
    assert.match(context, /private NPC reasoning context/i);
    assert.match(context, /never disclose private memory/i);
  });
});
