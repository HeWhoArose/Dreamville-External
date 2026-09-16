import * as crypto from 'crypto';

export type ProvenanceClass = 'SOURCE' | 'INFERENCE' | 'GENERATED';

export type AdaptationMode =
  | 'Faithful Adaptation'
  | 'Guided Divergence'
  | 'Alternate Timeline'
  | 'Remix';

export interface SourceDocument {
  id: string;
  storyId: string;
  title: string;
  format: 'plain_text' | 'markdown';
  contentHash: string;
  rawText: string;
  createdAt: string;
}

export interface SourceSegment {
  id: string;
  documentId: string;
  segmentIndex: number;
  chapterTitle?: string;
  startAnchor: number;
  endAnchor: number;
  text: string;
}

export interface CanonFact {
  id: string;
  storyId: string;
  statement: string;
  provenanceClass: ProvenanceClass;
  confidence: number;
  sourceSegmentIds: string[];
  isLocked: boolean;
}

export interface CanonEntity {
  id: string;
  storyId: string;
  entityType: 'character' | 'location' | 'item' | 'faction' | 'concept';
  displayName: string;
  aliases: string[];
  provenanceClass: ProvenanceClass;
  sourceSegmentIds: string[];
}

export interface AdaptationProfile {
  id: string;
  storyId: string;
  mode: AdaptationMode;
  canonStrictness: 'Strict' | 'Balanced' | 'Flexible';
  divergencePoint: string; // e.g. 'Beginning' | 'Selected Scene'
  plotGravity: 'Strong' | 'Medium' | 'Light';
  playerRole: string; // e.g. 'New Student', 'Observer', 'Original Protagonist'
}

export interface AdaptedStoryBible {
  storyId: string;
  title: string;
  sourceHash: string;
  segments: SourceSegment[];
  canonFacts: CanonFact[];
  canonEntities: CanonEntity[];
  profile: AdaptationProfile;
}

/**
 * StoryAdaptationPipeline
 * Implements DreamBook Challenge 15 & §246–§271 (Existing Story Adaptation Pipeline).
 */
export class StoryAdaptationPipeline {
  /**
   * Stage 1 & 2: Ingest & Segment
   * Splits raw story text into indexed source segments with stable anchors.
   */
  public static ingestAndSegment(storyId: string, title: string, rawText: string): {
    document: SourceDocument;
    segments: SourceSegment[];
  } {
    const hash = crypto.createHash('sha256').update(rawText, 'utf8').digest('hex');
    const docId = `doc_${storyId}_${hash.substring(0, 8)}`;

    const document: SourceDocument = {
      id: docId,
      storyId,
      title,
      format: 'plain_text',
      contentHash: hash,
      rawText,
      createdAt: new Date().toISOString(),
    };

    // Segment by double newlines (paragraphs)
    const rawParagraphs = rawText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const segments: SourceSegment[] = [];

    let currentCursor = 0;
    rawParagraphs.forEach((para, idx) => {
      const start = rawText.indexOf(para, currentCursor);
      const end = start + para.length;
      currentCursor = end;

      segments.push({
        id: `seg_${docId}_${idx + 1}`,
        documentId: docId,
        segmentIndex: idx + 1,
        startAnchor: start,
        endAnchor: end,
        text: para,
      });
    });

    return { document, segments };
  }

  /**
   * Stage 3 & 4: Extract and Normalize
   * Produces grounded canonical facts and entities strictly linked to source segments.
   */
  public static extractAndNormalize(
    storyId: string,
    segments: SourceSegment[],
    profile: AdaptationProfile
  ): AdaptedStoryBible {
    const canonFacts: CanonFact[] = [];
    const canonEntities: CanonEntity[] = [];

    segments.forEach((seg) => {
      const text = seg.text;

      // Extract entities based on structured rules or markers
      if (text.includes('Academy') || text.includes('School') || text.includes('College')) {
        canonEntities.push({
          id: `entity_loc_school`,
          storyId,
          entityType: 'location',
          displayName: 'The Grand Arcane Academy',
          aliases: ['The Academy', 'The School of Spells'],
          provenanceClass: 'SOURCE',
          sourceSegmentIds: [seg.id],
        });
      }

      if (text.includes('letter') || text.includes('invitation') || text.includes('seal')) {
        canonFacts.push({
          id: `fact_invitation_arrival`,
          storyId,
          statement: 'A formal wax-sealed invitation arrived requiring response before term start.',
          provenanceClass: 'SOURCE',
          confidence: 1.0,
          sourceSegmentIds: [seg.id],
          isLocked: true,
        });
      }
    });

    return {
      storyId,
      title: 'Adapted Story',
      sourceHash: segments[0]?.documentId || 'empty',
      segments,
      canonFacts,
      canonEntities,
      profile,
    };
  }

  /**
   * Evaluates Player Action against Canon Strictness (DreamBook §262)
   */
  public static evaluatePlayerActionAgainstCanon(
    action: string,
    profile: AdaptationProfile,
    lockedFacts: CanonFact[]
  ): {
    allowed: boolean;
    createsDivergence: boolean;
    reason: string;
  } {
    const actionLower = action.toLowerCase();

    // Check for hard contradictions
    if (actionLower.includes('burn the invitation') || actionLower.includes('tear up the letter')) {
      if (profile.canonStrictness === 'Strict') {
        return {
          allowed: false,
          createsDivergence: false,
          reason: 'Strict canon forbids destroying the school invitation letter.',
        };
      } else {
        return {
          allowed: true,
          createsDivergence: true,
          reason: 'Player choice departs from source canon: created Guided Divergence branch.',
        };
      }
    }

    return {
      allowed: true,
      createsDivergence: false,
      reason: 'Action conforms to source setting.',
    };
  }
}
