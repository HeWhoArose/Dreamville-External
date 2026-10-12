import type { WorldRepository } from '../repositories/worldRepository';
import type { CurrentSituation } from './currentSituation';

export interface NpcPlanningMemory {
  id: string;
  content: string;
  confidence: number;
  importance: number;
  sourceEventId?: string;
  /** Phase C (GAP-3) — retained so consumers can see why this memory ranked. */
  lastRecalledTurn?: number;
  /** Phase C (GAP-3) — fused recency+importance+confidence retrieval score. */
  salienceScore?: number;
}

export interface NpcPlanningSlice {
  actorId: string;
  name: string;
  addressed: boolean;
  locationId?: string;
  currentActivity?: string;
  immediateGoal?: string;
  recentMemories: NpcPlanningMemory[];
  relationship?: unknown;
  /**
   * Phase C (GAP-3 / S-3) — consolidated inferences about the viewer. Always an
   * inference (`confidence < 1`), never a witnessed canonical fact.
   */
  reflections?: Array<{ id: string; confidence: number; summary: string; tags: string[] }>;
  authorizedKnowledge: unknown[];
  knowledgeBoundary: string;
}

/**
 * Phase C (GAP-3 / S-3) — recency-weighted NPC memory retrieval.
 *
 * Generative-Agents-style agents retrieve by relevance *and* recency, not by
 * importance alone. The previous slice sorted purely by `importance`, so a
 * 40-turn-old high-importance memory crowded out last turn's dialogue — the exact
 * believability failure GAP-3 names. This fuses the signals the memory engine
 * already trusts:
 *
 *   score = 0.45*recency + 0.35*importance + 0.20*confidence
 *
 * `recency` is turn-distance decay (same 40-turn horizon as the memory engine),
 * so the score stays deterministic and reproducible in tests. Memories already
 * marked `isPersistentCritical` keep a protected floor so a canonically critical
 * secret can never be fully crowded out.
 */
export const NPC_MEMORY_SALIENCE_WEIGHTS = { recency: 0.45, importance: 0.35, confidence: 0.20 };
export const NPC_MEMORY_RECENCY_HORIZON_TURNS = 40;
export const NPC_MEMORY_PERSISTENT_FLOOR = 0.6;

export function scoreNpcMemorySalience(params: {
  importance: number;
  confidence: number;
  lastRecalledTurn?: number;
  currentTurn: number;
  isPersistentCritical?: boolean;
}): number {
  const importance01 = Math.max(0, Math.min(1, (Number(params.importance) || 0) / 100));
  const confidence01 = Math.max(0, Math.min(1, Number(params.confidence) || 0));
  const lastRecalled = Math.max(0, Number(params.lastRecalledTurn) || 0);
  const turnsSinceRecall = Math.max(0, Math.max(0, Number(params.currentTurn) || 0) - lastRecalled);
  const recency01 = Math.max(0, 1 - Math.min(turnsSinceRecall, NPC_MEMORY_RECENCY_HORIZON_TURNS) / NPC_MEMORY_RECENCY_HORIZON_TURNS);
  const score =
    NPC_MEMORY_SALIENCE_WEIGHTS.recency * recency01 +
    NPC_MEMORY_SALIENCE_WEIGHTS.importance * importance01 +
    NPC_MEMORY_SALIENCE_WEIGHTS.confidence * confidence01;
  return params.isPersistentCritical ? Math.max(score, NPC_MEMORY_PERSISTENT_FLOOR) : score;
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
  const currentTurn = (() => {
    try {
      return Number(repository.getCanonicalCommandEventCount(storyId) || 0);
    } catch {
      return 0;
    }
  })();
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
    .map((memory: any) => ({
      memory,
      salienceScore: scoreNpcMemorySalience({
        importance: Number(memory.importance || 0),
        confidence: Number(memory.confidence || 0),
        lastRecalledTurn: Number(memory.lastRecalledTurn || 0),
        currentTurn,
        isPersistentCritical: Boolean(memory.isPersistentCritical),
      }),
    }))
    .sort((a: { memory: any; salienceScore: number }, b: { memory: any; salienceScore: number }) =>
      b.salienceScore - a.salienceScore ||
      Number(b.memory.importance || 0) - Number(a.memory.importance || 0) ||
      String(a.memory.id).localeCompare(String(b.memory.id))
    )
    .slice(0, 20);

  const agency = repository.getDynamicCharacterAgencyEngine(storyId);
  const relationship = agency.getRelationship(storyId, viewerActorId, entity.id);
  const reflections = (() => {
    try {
      return agency
        .getRelationshipReflections(storyId, entity.id, viewerActorId)
        .filter((reflection) => reflection && reflection.summary)
        .map((reflection) => ({
          id: String(reflection.id),
          confidence: Number(reflection.confidence || 0),
          summary: String(reflection.summary),
          tags: Array.isArray(reflection.tags) ? reflection.tags.map(String) : [],
        }))
        .slice(-3);
    } catch {
      return [];
    }
  })();

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
    recentMemories: memories.map((entry: { memory: any; salienceScore: number }) => ({
      id: String(entry.memory.id),
      content: String(entry.memory.content || '').slice(0, 700),
      confidence: Number(entry.memory.confidence || 0),
      importance: Number(entry.memory.importance || 0),
      sourceEventId: entry.memory.sourceEventId,
      lastRecalledTurn: Number(entry.memory.lastRecalledTurn || 0),
      salienceScore: Number(entry.salienceScore.toFixed(6)),
    })),
    relationship,
    reflections,
    authorizedKnowledge,
    knowledgeBoundary: 'This slice contains only knowledge/memories authorized for the addressed NPC. Player knowledge must never be substituted for NPC knowledge.',
  };
}
