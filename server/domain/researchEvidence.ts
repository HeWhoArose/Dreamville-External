import { ResearchEvidenceItem, WorldFact } from '../../src/types';
import { KnowledgeFact } from './types';
import type { InMemoryWorldRepository } from '../repositories/worldRepository';

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
  private evidenceStore: Map<string, ResearchEvidenceItem> = new Map();

  public registerEvidence(item: ResearchEvidenceItem): void {
    this.evidenceStore.set(item.evidenceId, item);
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
    const factId = `fact_research_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
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
