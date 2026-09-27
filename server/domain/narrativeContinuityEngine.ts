import { deterministicId, formatCanonicalTimestamp } from './deterministicRng';
import type { WorldRepository } from '../repositories/worldRepository';
import type { StructuredTurnPackage } from './aiOrchestrator';
import { worldMomentumEngine } from './worldMomentumEngine';
import { researchEvidencePipeline } from './researchEvidence';

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

  public static research(repository: WorldRepository, storyId: string, query: string, viewerActorId?: string): NarrativeResearchPacket {
    const memoryEngine = repository.getMemoryEngine(storyId);
    const clock = repository.getWorldClock(storyId);
    const normalizedQuery = query.trim() || 'current story context';
    const queryKeywords = normalizedQuery.toLowerCase().split(/\W+/).filter((token) => token.length >= 3).slice(0, 12);
    const memories = memoryEngine.retrieveMemories({
      storyId,
      viewerActorId,
      queryKeywords,
      currentTurn: repository.getCanonicalCommandEvents(storyId).length + 1,
      currentTimestamp: clock.getTimestamp(),
      maxResults: 8,
      includeDormant: false,
      includeArchived: false,
    });
    const knowledgeFacts = viewerActorId ? repository.getAuthorizedKnowledgeFacts(storyId, viewerActorId) : repository.getKnowledgeFacts(storyId);
    const state = this.getState(repository, storyId);
    const packet: NarrativeResearchPacket = {
      storyId,
      query: normalizedQuery,
      knowledgeFacts: this.rankAndLimit(knowledgeFacts, queryKeywords, 12),
      memories,
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
    };
    // Research is ephemeral context. It must not mutate canonical story/save state
    // merely because a narrator was asked to think about an action.
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