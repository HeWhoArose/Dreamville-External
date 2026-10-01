import type { WorldRepository } from '../repositories/worldRepository';
import type { CurrentSituation } from './currentSituation';

export interface NpcPlanningSlice {
  actorId: string;
  name: string;
  addressed: boolean;
  locationId?: string;
  currentActivity?: string;
  immediateGoal?: string;
  recentMemories: Array<{
    id: string;
    content: string;
    confidence: number;
    importance: number;
    sourceEventId?: string;
  }>;
  relationship?: unknown;
  authorizedKnowledge: unknown[];
  knowledgeBoundary: string;
}

export function buildNpcPlanningSlice(
  repository: WorldRepository,
  storyId: string,
  viewerActorId: string,
  situation: CurrentSituation,
  targetEntityId?: string,
): NpcPlanningSlice | undefined {
  const normalizedQuery = String(situation.currentAction?.originalText || '').toLowerCase();
  const entity = situation.nearbyEntities.find((candidate) => {
    if (candidate.id === viewerActorId) return false;
    if (targetEntityId && candidate.id === targetEntityId) return true;
    const name = String(candidate.name || '').toLowerCase();
    return name.length >= 3 && normalizedQuery.includes(name);
  });
  if (!entity) return undefined;

  const memoryEngine = repository.getMemoryEngine(storyId);
  const memories = memoryEngine.getAllMemories(storyId)
    .filter((memory: any) => memory.status !== 'archived' && memory.status !== 'dormant')
    .filter((memory: any) =>
      memory.subjectEntityId === entity.id ||
      memory.relatedEntityIds?.includes(entity.id)
    )
    .filter((memory: any) =>
      memory.visibility === 'PUBLIC' ||
      memory.visibility === 'SHARED' ||
      memory.subjectEntityId === entity.id ||
      memory.accessibleToEntityIds?.includes(entity.id)
    )
    .sort((a: any, b: any) =>
      Number(b.importance || 0) - Number(a.importance || 0) ||
      Number(b.confidence || 0) - Number(a.confidence || 0)
    )
    .slice(0, 20);

  const relationship = repository.getDynamicCharacterAgencyEngine(storyId)
    .getRelationship(storyId, viewerActorId, entity.id);

  const authorizedKnowledge = repository.getAuthorizedKnowledgeFacts(storyId, entity.id);
  const immediateGoal = entity.currentActivity
    ? 'Respond according to the NPC’s current activity: ' + entity.currentActivity + '.'
    : 'No immediate NPC goal is canonically established; do not invent one.';

  return {
    actorId: entity.id,
    name: entity.name,
    addressed: true,
    locationId: entity.locationId,
    currentActivity: entity.currentActivity,
    immediateGoal,
    recentMemories: memories.map((memory: any) => ({
      id: String(memory.id),
      content: String(memory.content || '').slice(0, 700),
      confidence: Number(memory.confidence || 0),
      importance: Number(memory.importance || 0),
      sourceEventId: memory.sourceEventId,
    })),
    relationship,
    authorizedKnowledge,
    knowledgeBoundary: 'This slice contains only knowledge/memories authorized for the addressed NPC. Player knowledge must never be substituted for NPC knowledge.',
  };
}
