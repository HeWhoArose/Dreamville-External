import { deterministicId, formatCanonicalTimestamp } from './deterministicRng';
import type { WorldRepository } from '../repositories/worldRepository';
import type { StructuredTurnPackage } from './aiOrchestrator';
import { worldMomentumEngine } from './worldMomentumEngine';
import { researchEvidencePipeline } from './researchEvidence';
import { UniverseRuntimeService } from './universeRuntimeService';

export interface NarrativePlotState {
  storyId: string;
  version: number;
  currentArc: string;
  summary: string;
  beats: Array<{ id: string; turnId?: string; text: string; tags: string[]; timestamp: string }>;
  openThreads: string[];
  updatedAt: string;
}

export interface NarrativePlanState {
  storyId: string;
  version: number;
  objective: string;
  nextBeats: string[];
  priorityThreads: string[];
  contingencies: string[];
  updatedAt: string;
}

export interface NarrativeResearchPacket {
  storyId: string;
  query: string;
  knowledgeFacts: unknown[];
  memories: unknown[];
  storyThreads: unknown[];
  relationships: unknown[];
  plot: NarrativePlotState;
  plan: NarrativePlanState;
  usageGuidance: {
    knowledgeFacts: string;
    memories: string;
    storyThreads: string;
    relationships: string;
    plot: string;
    plan: string;
    worldMomentum: string;
    researchEvidence: string;
    causalProvenance: string;
  };
  epistemicallyBoundTo?: string;
  worldMomentum?: ReturnType<typeof worldMomentumEngine.getState>;
  researchEvidence?: unknown[];
  causalProvenance?: unknown;
}

export class NarrativeContinuityEngine {
  public static getState(repository: WorldRepository, storyId: string): { plot: NarrativePlotState; plan: NarrativePlanState; research?: Record<string, unknown> } {
    const run = repository.getStoryRun(storyId);
    const runtime = (run?.runtimeState || {}) as Record<string, any>;
    return {
      plot: JSON.parse(JSON.stringify(runtime.plot || this.defaultPlot(storyId))),
      plan: JSON.parse(JSON.stringify(runtime.narrativePlan || this.defaultPlan(storyId))),
      research: runtime.narrativeResearch ? JSON.parse(JSON.stringify(runtime.narrativeResearch)) : undefined,
    };
  }

  public static research(
    repository: WorldRepository,
    storyId: string,
    query: string,
    viewerActorId?: string,
    options: { persist?: boolean } = {},
  ): NarrativeResearchPacket {
    const memoryEngine = repository.getMemoryEngine(storyId);
    const clock = repository.getWorldClock(storyId);
    const normalizedQuery = query.trim() || 'current story context';
    const queryKeywords = normalizedQuery.toLowerCase().split(/\W+/).filter((token) => token.length >= 3).slice(0, 12);
    const baseMemories = memoryEngine.retrieveMemories({
      storyId,
      viewerActorId,
      queryKeywords,
      currentTurn: repository.getCanonicalCommandEvents(storyId).length + 1,
      currentTimestamp: clock.getTimestamp(),
      maxResults: 8,
      includeDormant: false,
      includeArchived: false,
    });

    // When the player explicitly addresses a known entity, retrieve entity-linked
    // memories even when the memory text itself does not repeat the entity's name.
    // This is what lets an NPC remember an old event hundreds of turns later.
    const entityCards = repository.getEntityCards(storyId);
    const normalizedQuery = normalizedQuery.toLowerCase();
    const focusEntityIds = entityCards
      .filter((entity) => entity.id !== viewerActorId)
      .filter((entity) => {
        const aliases = Array.isArray(entity.identity?.aliases) ? entity.identity.aliases : [];
        const names = [entity.name, ...aliases]
          .map((value) => String(value || '').trim().toLowerCase())
          .filter((value) => value.length >= 3);
        return names.some((name) => normalizedQuery.includes(name));
      })
      .map((entity) => entity.id);

    const focusedMemories = focusEntityIds.length > 0
      ? memoryEngine
          .getAllMemories(storyId)
          .filter((memory) => {
            if (memory.status === 'archived') return false;
            if (memory.status === 'dormant' && !memory.isPersistentCritical) return false;
            const touchesEntity =
              focusEntityIds.includes(memory.subjectEntityId) ||
              focusEntityIds.some((entityId) => memory.relatedEntityIds?.includes(entityId));
            if (!touchesEntity) return false;

            if (!viewerActorId) return true;
            const isSubject = memory.subjectEntityId === viewerActorId;
            const isPublic = memory.visibility === 'PUBLIC';
            const isSharedWithViewer =
              memory.visibility === 'SHARED' &&
              (memory.relatedEntityIds?.includes(viewerActorId) || memory.accessibleToEntityIds?.includes(viewerActorId));
            return isSubject || isPublic || isSharedWithViewer;
          })
          .sort((a, b) => {
            const scoreA = Number(a.importance || 0) + Number(a.confidence || 0) * 10;
            const scoreB = Number(b.importance || 0) + Number(b.confidence || 0) * 10;
            return scoreB - scoreA;
          })
          .slice(0, 8)
      : [];

    const memoryMap = new Map<string, any>();
    for (const memory of [...focusedMemories, ...baseMemories]) {
      memoryMap.set(memory.id, memory);
    }
    const memories = Array.from(memoryMap.values()).slice(0, 12);

    const universe = repository.getUniverseForStory(storyId);
    const universeMemories = universe
      ? UniverseRuntimeService.getRelevantUniverseMemories(
          repository,
          storyId,
          universe.playerIdentity.universeActorId,
          queryKeywords,
          8,
        )
      : [];
    const continuityMemories = [
      ...memories.map((memory) => ({ ...memory, continuityScope: 'WORLD' })),
      ...universeMemories.map((memory) => ({ ...memory, continuityScope: 'UNIVERSE' })),
    ];
    const knowledgeFacts = viewerActorId ? repository.getAuthorizedKnowledgeFacts(storyId, viewerActorId) : repository.getKnowledgeFacts(storyId);
    const state = this.getState(repository, storyId);
    const packet: NarrativeResearchPacket = {
      storyId,
      query: normalizedQuery,
      knowledgeFacts: this.rankAndLimit(knowledgeFacts, queryKeywords, 12),
      memories: continuityMemories,
      storyThreads: repository.getStoryThreads(storyId).slice(-12),
      relationships: viewerActorId
        ? repository
            .getEntityCards(storyId)
            .map((entity) => repository.getDynamicCharacterAgencyEngine(storyId).getRelationship(storyId, viewerActorId, entity.id))
            .filter(Boolean)
        : [],
      plot: state.plot,
      plan: state.plan,
      epistemicallyBoundTo: viewerActorId,
      worldMomentum: worldMomentumEngine.getState(repository, storyId),
      researchEvidence: researchEvidencePipeline.getEvidenceForStory(storyId),
      causalProvenance: researchEvidencePipeline.getCausalGraphForStory(storyId),
      usageGuidance: {
        knowledgeFacts: 'Use only to establish facts the viewer is authorized to know; never turn secret or uncertain knowledge into certainty.',
        memories: 'Use both world-local and universe-level durable memories to maintain continuity with what the protagonist has experienced, learned, acquired, or persistently remembers. Universe memories may refer to worlds the protagonist is not currently visiting.',
        storyThreads: 'Use to preserve unresolved situations and consequences so the scene does not reset between turns.',
        relationships: 'Use to shape believable reactions, familiarity, trust, tension, and dialogue when a known entity is present.',
        plot: 'Use as the compressed history of what has actually happened; use it to avoid contradictions and repeated beats.',
        plan: 'Use as a GM planning aid for the current narrative direction; never force a planned beat or remove player agency.',
        worldMomentum: 'Use only when supported to add pressure, movement, or consequence already present in the simulation.',
        researchEvidence: 'Use to support causal or factual claims when the evidence is relevant and player-visible.',
        causalProvenance: 'Use to understand why the current situation exists and preserve cause-and-effect across turns.',
      },
    };
    if (options.persist !== false) {
      const run = repository.getStoryRun(storyId);
      if (run) {
        run.runtimeState = {
          ...(run.runtimeState || {}),
          narrativeResearch: {
            ...packet,
            capturedAt: formatCanonicalTimestamp(repository.getWorldClock(storyId).getTimestamp()),
          },
        };
        repository.saveStoryRun(run);
      }
    }
    return packet;
  }

  public static recordTurn(repository: WorldRepository, params: { storyId: string; turnId?: string; playerAction?: string; turnPackage: StructuredTurnPackage }): { plot: NarrativePlotState; plan: NarrativePlanState } {
    const run = repository.getStoryRun(params.storyId);
    if (!run) return { plot: this.defaultPlot(params.storyId), plan: this.defaultPlan(params.storyId) };
    const state = this.getState(repository, params.storyId);
    const timestamp = formatCanonicalTimestamp(repository.getWorldClock(params.storyId).getTimestamp());
    const beatText = (params.turnPackage.narrative.join(' ').trim() || params.playerAction || 'Turn resolved.').slice(0, 1200);
    const tags = [...params.turnPackage.events, ...params.turnPackage.memoryCandidates].map(String).map((value) => value.trim()).filter(Boolean).slice(0, 10);
    state.plot.beats.push({ id: deterministicId('plot_beat', params.storyId, params.turnId || 'turn', beatText), turnId: params.turnId, text: beatText, tags, timestamp });
    state.plot.beats = state.plot.beats.slice(-40);
    const openThreads = new Set(state.plot.openThreads);
    for (const memoryCandidate of params.turnPackage.memoryCandidates) {
      const value = String(memoryCandidate).trim();
      if (value) openThreads.add(value.slice(0, 240));
    }
    state.plot.openThreads = Array.from(openThreads).slice(-24);
    state.plot.summary = beatText;
    state.plot.updatedAt = timestamp;
    state.plot.version += 1;
    state.plan.priorityThreads = state.plot.openThreads.slice(-8).reverse();
    state.plan.objective = state.plan.priorityThreads[0] || (params.playerAction ? 'Respond coherently to: ' + params.playerAction.slice(0, 240) : 'Continue the current story arc.');
    state.plan.nextBeats = state.plan.priorityThreads.slice(0, 4).concat(params.turnPackage.events.slice(-4).map((event) => 'Follow consequence of ' + String(event).slice(0, 180))).slice(0, 8);
    state.plan.contingencies = ['Respect current world and character knowledge boundaries.', 'Prefer canonical consequences over invented drama.'];
    state.plan.updatedAt = timestamp;
    state.plan.version += 1;
    run.runtimeState = {
      ...(run.runtimeState || {}),
      plot: state.plot,
      narrativePlan: state.plan,
    };
    repository.saveStoryRun(run);
    return state;
  }

  private static rankAndLimit<T>(facts: T[], keywords: string[], max: number): T[] {
    return facts.map((fact) => {
      const value = JSON.stringify(fact).toLowerCase();
      const score = keywords.reduce((total, keyword) => total + (value.includes(keyword) ? 1 : 0), 0);
      return { fact, score };
    }).sort((a, b) => b.score - a.score).slice(0, max).map((entry) => JSON.parse(JSON.stringify(entry.fact)));
  }

  private static defaultPlot(storyId: string): NarrativePlotState {
    return { storyId, version: 1, currentArc: 'OPENING', summary: '', beats: [], openThreads: [], updatedAt: new Date(0).toISOString() };
  }

  private static defaultPlan(storyId: string): NarrativePlanState {
    return { storyId, version: 1, objective: 'Establish a coherent next story beat from current canonical state.', nextBeats: [], priorityThreads: [], contingencies: [], updatedAt: new Date(0).toISOString() };
  }
}

export const narrativeContinuityEngine = NarrativeContinuityEngine;