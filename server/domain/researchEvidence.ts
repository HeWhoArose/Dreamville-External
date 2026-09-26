import { ResearchEvidenceItem, WorldFact } from '../../src/types';
import { KnowledgeFact } from './types';
import type { InMemoryWorldRepository } from '../repositories/worldRepository';
import { deterministicId } from './deterministicRng';
import { CausalProvenanceGraph, type CausalGraphState } from './causalProvenanceGraph';

/**
 * ResearchEvidencePipeline
 * Implements DreamBook Challenge 16 Research Evidence Qualification & Firewall.
 *
 * Rules:
 * 1. Research evidence items exist strictly in research/evidence space.
 * 2. Snippets and unverified web/corpus extractions are NOT canonical facts.
 * 3. Working context labels them as proposals/unverified evidence.
 * 4. Only explicit adjudication promotes qualified research into canonical world facts.
 * 5. Rejected or unknown research creates ZERO canonical state.
 */
export class ResearchEvidencePipeline {
  private evidenceStore: Map<string, ResearchEvidenceItem & { storyId?: string }> = new Map();
  private readonly causalGraph = new CausalProvenanceGraph();
  private causalGraphState: CausalGraphState = this.causalGraph.create();

  public registerEvidence(item: ResearchEvidenceItem & { storyId?: string }): void {
    this.evidenceStore.set(item.evidenceId, item);
    const storyId = item.storyId || 'global';
    const sourceNodeId = deterministicId('research_source', storyId, item.sourceUri, item.sourceTitle);
    const evidenceNodeId = deterministicId('research_evidence', storyId, item.evidenceId);
    this.causalGraph.upsertNode(this.causalGraphState, {
      id: sourceNodeId,
      kind: 'RESEARCH_SOURCE',
      label: item.sourceTitle || item.sourceUri,
      metadata: { storyId, sourceUri: item.sourceUri },
    });
    this.causalGraph.upsertNode(this.causalGraphState, {
      id: evidenceNodeId,
      kind: 'RESEARCH_EVIDENCE',
      label: item.claimText.slice(0, 240),
      metadata: {
        storyId,
        evidenceId: item.evidenceId,
        qualification: item.qualification,
        validationStatus: item.validationStatus,
      },
    });
    this.causalGraph.addEdge(this.causalGraphState, {
      id: deterministicId('research_edge', evidenceNodeId, sourceNodeId),
      fromId: sourceNodeId,
      toId: evidenceNodeId,
      relation: 'REPORTED',
      eventId: item.evidenceId,
      timestampSeconds: 0,
      confidence: item.provenance?.isGeneratedProposal ? 0.5 : 1,
      metadata: { storyId, sourceTitle: item.sourceTitle },
    });
  }

  public getEvidenceForStory(storyId: string): Array<ResearchEvidenceItem & { storyId?: string }> {
    return Array.from(this.evidenceStore.values())
      .filter((item) => !item.storyId || item.storyId === 'global' || item.storyId === storyId)
      .slice(-24)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public getCausalGraphForStory(storyId: string): CausalGraphState {
    const evidenceIds = new Set(
      this.getEvidenceForStory(storyId).map((item) => item.evidenceId)
    );
    const state = this.causalGraph.create();
    for (const node of Object.values(this.causalGraphState.nodes)) {
      const metadataStoryId = String(node.metadata?.storyId || '');
      if (metadataStoryId === storyId || metadataStoryId === 'global') {
        this.causalGraph.upsertNode(state, node);
      }
    }
    for (const edge of Object.values(this.causalGraphState.edges)) {
      const metadataStoryId = String(edge.metadata?.storyId || '');
      if ((metadataStoryId === storyId || metadataStoryId === 'global') && (evidenceIds.size === 0 || evidenceIds.has(String(edge.eventId)))) {
        if (state.nodes[edge.fromId] && state.nodes[edge.toId]) {
          this.causalGraph.addEdge(state, edge);
        }
      }
    }
    return this.causalGraph.serialize(state);
  }

  public getEvidence(evidenceId: string): ResearchEvidenceItem | null {
    return this.evidenceStore.get(evidenceId) || null;
  }

  public getAllEvidence(): ResearchEvidenceItem[] {
    return Array.from(this.evidenceStore.values());
  }

  public clearEvidence(): void {
    this.evidenceStore.clear();
  }

  public adjudicateAndPromote(
    evidenceId: string,
    adjudicationResult: 'VALIDATE_AND_PROMOTE' | 'REJECT',
    storyId: string,
    worldRepo: InMemoryWorldRepository
  ): { success: boolean; factId?: string; errorReason?: string } {
    const item = this.evidenceStore.get(evidenceId);
    if (!item) {
      return { success: false, errorReason: 'Research evidence item not found in evidence registry.' };
    }

    if (adjudicationResult === 'REJECT') {
      item.validationStatus = 'REJECTED';
      return {
        success: true,
        errorReason: 'Evidence explicitly rejected; zero canonical facts created.',
      };
    }

    if (item.qualification !== 'QUALIFIED') {
      return {
        success: false,
        errorReason: `Cannot promote ${item.qualification} research evidence to canonical fact without source qualification.`,
      };
    }

    item.validationStatus = 'VALIDATED';
    const factId = deterministicId('fact_research', storyId, evidenceId, item.canonicalPromotionTarget?.predicate || 'researched_fact');
    const clock = worldRepo.getWorldClock(storyId);

    const canonicalFact: KnowledgeFact = {
      id: factId,
      subjectEntityId: item.canonicalPromotionTarget?.subjectEntityId || 'world',
      predicate: item.canonicalPromotionTarget?.predicate || 'researched_fact',
      objectValue: item.canonicalPromotionTarget?.objectValue || item.claimText,
      sourceType: 'document',
      acquiredAtTimestamp: clock.getTimestamp(),
      confidence: 1.0,
      secretLevel: 'public',
      scope: 'exact',
      provenanceSummary: `Validated Research from ${item.sourceTitle} (${item.sourceUri}). Lawful Notice: ${item.provenance.lawfulNotice || 'Academic Citation'}.`,
    };

    const evidenceNodeId = deterministicId('research_evidence', item.storyId || storyId, item.evidenceId);
    const factNodeId = deterministicId('research_fact', storyId, factId);
    this.causalGraph.upsertNode(this.causalGraphState, {
      id: factNodeId,
      kind: 'CANONICAL_FACT',
      label: canonicalFact.objectValue,
      metadata: { storyId, factId, predicate: canonicalFact.predicate },
    });
    if (this.causalGraphState.nodes[evidenceNodeId]) {
      this.causalGraph.addEdge(this.causalGraphState, {
        id: deterministicId('research_promotion', evidenceNodeId, factNodeId),
        fromId: evidenceNodeId,
        toId: factNodeId,
        relation: 'DISCOVERED',
        eventId: evidenceId,
        timestampSeconds: clock.getTimestamp().totalElapsedSeconds,
        confidence: 1,
        metadata: { storyId, promotion: 'VALIDATED_RESEARCH' },
      });
    }

    worldRepo.addKnowledgeFact(storyId, canonicalFact);

    // Also record in CH16 World Facts if applicable
    const ch16Fact: WorldFact = {
      factId,
      statement: item.claimText,
      category: item.canonicalPromotionTarget?.category || 'world_lore',
      subjectEntityId: canonicalFact.subjectEntityId,
      predicate: canonicalFact.predicate,
      objectValue: canonicalFact.objectValue,
      provenanceClass: 'QUALIFIED_RESEARCH',
      provenanceSummary: canonicalFact.provenanceSummary || 'Validated research evidence',
      sourceSegmentIds: [item.evidenceId],
      confidence: 1.0,
      acquiredAtTimestamp: clock.getTimestamp(),
    };
    worldRepo.saveWorldFact(storyId, ch16Fact);

    return {
      success: true,
      factId,
    };
  }
}

export const researchEvidencePipeline = new ResearchEvidencePipeline();
