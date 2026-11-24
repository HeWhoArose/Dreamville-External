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
  repositoryOrParams: WorldRepository | { repository: WorldRepository; storyId: string; viewerActorId: string; situation: CurrentSituation; targetEntityId?: string },
  storyId?: string,
  viewerActorId?: string,
  situation?: CurrentSituation,
  targetEntityId?: string,
): NpcPlanningSlice | undefined {
  let repository: WorldRepository;
  let sId: string;
  let vId: string;
  let sit: CurrentSituation;
  let targetId: string | undefined;

  if (repositoryOrParams && 'repository' in repositoryOrParams && 'storyId' in repositoryOrParams) {
    repository = repositoryOrParams.repository;
    sId = repositoryOrParams.storyId;
    vId = repositoryOrParams.viewerActorId;
    sit = repositoryOrParams.situation;
    targetId = repositoryOrParams.targetEntityId;
  } else {
    repository = repositoryOrParams as WorldRepository;
    sId = storyId!;
    vId = viewerActorId!;
    sit = situation!;
    targetId = targetEntityId;
  }

  if (!sit) return undefined;
  const normalizedQuery = String(sit.currentAction?.originalText || '').toLowerCase();
  const entity = (sit.nearbyEntities || []).find((candidate) => {
    if (candidate.id === vId) return false;
    if (targetId && candidate.id === targetId) return true;
    const name = String(candidate.name || '').toLowerCase();
    return name.length >= 3 && normalizedQuery.includes(name);
  });
  if (!entity) return undefined;

  const memoryEngine = repository.getMemoryEngine(sId);
  const entityCard = repository.getEntityCard(sId, entity.id);
  const refSet = new Set(entityCard?.memoryRefs || []);
  const memories = memoryEngine.getAllMemories(sId)
    .filter((memory: any) => memory.status !== 'archived' && memory.status !== 'dormant')
    .filter((memory: any) =>
      refSet.has(memory.id) ||
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

  const relationship = repository.getDynamicCharacterAgencyEngine(sId)
    .getRelationship(sId, vId, entity.id);

  const authorizedKnowledge = repository.getAuthorizedKnowledgeFacts(sId, entity.id);
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
