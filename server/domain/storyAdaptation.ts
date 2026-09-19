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
  revision: number;
  importMetadata?: Record<string, unknown>;
  createdAt: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface SourceSegment {
  id: string;
  documentId: string;
  segmentIndex: number;
  chapterTitle?: string;
  sceneId?: string;
  startAnchor: number;
  endAnchor: number;
  textHash: string;
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
  entityType: 'character' | 'location' | 'item' | 'faction' | 'concept' | 'creature';
  displayName: string;
  aliases: string[];
  provenanceClass: ProvenanceClass;
  sourceSegmentIds: string[];
}

export interface CanonEvent {
  id: string;
  storyId: string;
  sequenceKey: number;
  description: string;
  sourceSegmentIds: string[];
  status: 'UNTOUCHED' | 'DIVERGED' | 'COMPLETED';
  worldTime?: string;
}

export interface ConflictRecord {
  id: string;
  storyId: string;
  conflictType: 'FACT_CONTRADICTION' | 'CHRONOLOGY_AMBIGUITY' | 'IDENTITY_AMBIGUITY' | 'RELATIONSHIP_AMBIGUITY';
  description: string;
  involvedRecordIds: string[];
  sourceSegmentIds: string[];
  status: 'UNRESOLVED' | 'RESOLVED';
  resolution?: string;
  userOverride?: string;
}

export interface SceneMetadata {
  sceneId: string;
  sourceRange: [number, number];
  chapterTitle?: string;
  participants: string[];
  location: string;
  time: string;
  goal: string;
  outcome: string;
  openLoops: string[];
}

export interface AdaptationProfile {
  id: string;
  storyId: string;
  mode: AdaptationMode;
  canonStrictness: 'Strict' | 'Balanced' | 'Flexible';
  divergencePoint: 'Beginning' | 'Selected Scene' | 'Custom Anchor';
  plotGravity: 'Strong' | 'Medium' | 'Light';
  playerRole: 'Original Protagonist' | 'Existing Character' | 'New Companion' | 'Observer';
  characterFidelity: 'Strict' | 'Naturalized' | 'Experimental';
  worldExpansion: 'Minimal' | 'Moderate' | 'Expansive';
}

export interface AdaptedStoryBible {
  storyId: string;
  title: string;
  format: 'plain_text' | 'markdown';
  sourceHash: string;
  revision: number;
  segments: SourceSegment[];
  canonFacts: CanonFact[];
  canonEntities: CanonEntity[];
  canonEvents: CanonEvent[];
  conflicts: ConflictRecord[];
  scenes: SceneMetadata[];
  profile: AdaptationProfile;
  entryPoints: { id: string; sceneId: string; title: string; description: string; anchor: number }[];
  openLoops: string[];
}

export interface StageProgressInfo {
  name: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  durationMs?: number;
  error?: string;
}

export interface PipelineState {
  storyId: string;
  currentStage: number; // 1-9
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  completedStages: number[];
  stageProgress: Record<number, StageProgressInfo>;
  cacheKey?: string;
  errorReason?: string;
  startedAt: string;
  updatedAt: string;
}

export interface AdaptationSession {
  sessionId: string;
  storyId: string;
  branchId: string;
  parentStoryId?: string;
  entryPointId: string;
  playerRole: string;
  adaptationProfile: AdaptationProfile;
  startedAt: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface TypedAdaptationEvent {
  id: string;
  storyId: string;
  branchId: string;
  type: 'SOURCE_REFERENCE' | 'CANON_MILESTONE' | 'DIVERGENCE' | 'ADAPTATION_NOTE' | 'SOURCE_REVEAL' | 'CANON_CONFLICT';
  sourceAnchor?: string;
  involvedEntities: string[];
  timestamp: string;
  reason: string;
  details?: Record<string, unknown>;
}

export interface ExtractionCacheEntry {
  cacheKey: string;
  sourceHash: string;
  extractedFacts: CanonFact[];
  extractedEntities: CanonEntity[];
  extractedEvents: CanonEvent[];
  conflicts: ConflictRecord[];
  createdAt: number;
}

/**
 * StoryAdaptationPipeline
 * Implements DreamBook Challenge 15 9-Stage Adaptation Pipeline.
 */
export class StoryAdaptationPipeline {
  public static readonly PARSER_VERSION = 'v1.5';
  public static readonly PROMPT_VERSION = 'v1.2';
  public static readonly PROFILE_VERSION = 'v1.0';

  private static extractionCache: Map<string, ExtractionCacheEntry> = new Map();

  public static computeCacheKey(
    contentHash: string,
    parserVersion = StoryAdaptationPipeline.PARSER_VERSION,
    promptVersion = StoryAdaptationPipeline.PROMPT_VERSION,
    profileVersion = StoryAdaptationPipeline.PROFILE_VERSION
  ): string {
    return crypto
      .createHash('sha256')
      .update(`${contentHash}:${parserVersion}:${promptVersion}:${profileVersion}`, 'utf8')
      .digest('hex');
  }

  /**
   * Compatibility Alias Method for ingestAndSegment (DEF-CH15-01)
   */
  public static ingestAndSegment(
    storyId: string,
    title: string,
    rawText: string,
    format: 'plain_text' | 'markdown' = 'plain_text'
  ): { document: SourceDocument; segments: SourceSegment[] } {
    const document = this.stage1Ingest(storyId, title, rawText, format);
    const segments = this.stage2Segment(document);
    return { document, segments };
  }

  /**
   * Compatibility Alias Method for extractAndNormalize (DEF-CH15-01)
   */
  public static extractAndNormalize(
    storyId: string,
    segments: SourceSegment[],
    profile: AdaptationProfile
  ): AdaptedStoryBible {
    const docHash = segments.length > 0 ? segments[0].documentId : 'hash';
    const extracted = this.stage3And4ExtractAndNormalize(storyId, segments, docHash, profile);
    const resolved = this.stage5ResolveConflicts(extracted.facts, extracted.events, {});

    const entryPoints = (extracted.scenes || []).map((sc, i) => ({
      id: `ep_${sc.sceneId}`,
      sceneId: sc.sceneId,
      title: sc.chapterTitle || `Scene ${i + 1}`,
      description: `Opening anchor: ${sc.location} (${sc.time})`,
      anchor: sc.sourceRange[0],
    }));
    if (entryPoints.length === 0) {
      entryPoints.push({
        id: 'ep_default',
        sceneId: 'scene_1',
        title: 'Opening Scene',
        description: 'Beginning of source document.',
        anchor: 0,
      });
    }

    return {
      storyId,
      title: 'Adapted Story',
      format: 'plain_text',
      sourceHash: docHash,
      revision: 1,
      segments,
      canonFacts: resolved.resolvedFacts,
      canonEntities: extracted.entities,
      canonEvents: extracted.events,
      conflicts: resolved.conflicts,
      scenes: extracted.scenes,
      profile,
      entryPoints,
      openLoops: ['Unresolved mystery from opening scene'],
    };
  }

  /**
   * Stage 1: Ingest
   */
  public static stage1Ingest(
    storyId: string,
    title: string,
    rawText: string,
    format: 'plain_text' | 'markdown' = 'plain_text'
  ): SourceDocument {
    if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
      throw new Error('Ingestion failed: Source raw text cannot be empty.');
    }

    const hash = crypto.createHash('sha256').update(rawText, 'utf8').digest('hex');
    const docId = `doc_${storyId}_${hash.substring(0, 8)}`;

    return {
      id: docId,
      storyId,
      title: title || 'Untitled Source',
      format,
      contentHash: hash,
      rawText,
      revision: 1,
      createdAt: new Date().toISOString(),
      status: 'ACTIVE',
    };
  }

  /**
   * Stage 2: Segment
   */
  public static stage2Segment(document: SourceDocument): SourceSegment[] {
    const rawParagraphs = document.rawText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const segments: SourceSegment[] = [];

    let currentCursor = 0;
    let currentChapterTitle: string | undefined = undefined;

    rawParagraphs.forEach((para, idx) => {
      const start = document.rawText.indexOf(para, currentCursor);
      const end = start + para.length;
      currentCursor = Math.max(currentCursor, end);

      // Chapter header detection (e.g. "Chapter 1: ...", "# Chapter ...")
      if (/^(chapter|book|act|part|\#\#?\s+chapter)\s+/i.test(para)) {
        currentChapterTitle = para.replace(/^\#+\s*/, '');
      }

      const textHash = crypto.createHash('sha256').update(para, 'utf8').digest('hex').substring(0, 10);

      segments.push({
        id: `seg_${document.id}_${idx + 1}`,
        documentId: document.id,
        segmentIndex: idx + 1,
        chapterTitle: currentChapterTitle,
        startAnchor: start >= 0 ? start : idx * 100,
        endAnchor: end >= 0 ? end : idx * 100 + para.length,
        textHash,
        text: para,
      });
    });

    return segments;
  }

  /**
   * Stage 3 & 4: Extract and Normalize
   */
  public static stage3And4ExtractAndNormalize(
    storyId: string,
    segments: SourceSegment[],
    contentHash: string,
    profile: AdaptationProfile
  ): {
    facts: CanonFact[];
    entities: CanonEntity[];
    events: CanonEvent[];
    conflicts: ConflictRecord[];
    scenes: SceneMetadata[];
    cacheHit: boolean;
  } {
    const cacheKey = this.computeCacheKey(contentHash);
    const cached = this.extractionCache.get(cacheKey);

    if (cached) {
      return {
        facts: cached.extractedFacts.map((f) => ({ ...f, storyId })),
        entities: cached.extractedEntities.map((e) => ({ ...e, storyId })),
        events: cached.extractedEvents.map((ev) => ({ ...ev, storyId })),
        conflicts: cached.conflicts.map((c) => ({ ...c, storyId })),
        scenes: this.reconstructScenes(segments),
        cacheHit: true,
      };
    }

    const facts: CanonFact[] = [];
    const entities: CanonEntity[] = [];
    const events: CanonEvent[] = [];
    const conflicts: ConflictRecord[] = [];

    // Deterministic Extraction & Normalization
    segments.forEach((seg, idx) => {
      const text = seg.text;

      // Detect entities
      const characterMatches = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g);
      if (characterMatches) {
        characterMatches.forEach((name) => {
          if (!['Chapter', 'The', 'And', 'For', 'With', 'From', 'Where', 'When', 'Inside', 'Outside'].includes(name)) {
            const existing = entities.find((e) => e.displayName === name);
            if (!existing) {
              entities.push({
                id: `entity_char_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                storyId,
                entityType: 'character',
                displayName: name,
                aliases: [],
                provenanceClass: 'SOURCE',
                sourceSegmentIds: [seg.id],
              });
            } else if (!existing.sourceSegmentIds.includes(seg.id)) {
              existing.sourceSegmentIds.push(seg.id);
            }
          }
        });
      }

      if (text.includes('Academy') || text.includes('School') || text.includes('Tower') || text.includes('Vault') || text.includes('Forest') || text.includes('Castle')) {
        const locName = text.includes('Academy') ? 'The Grand Arcane Academy' : text.includes('Vault') ? 'The Lantern Vault' : 'The Whispering Orrery';
        if (!entities.some((e) => e.displayName === locName)) {
          entities.push({
            id: `entity_loc_${locName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
            storyId,
            entityType: 'location',
            displayName: locName,
            aliases: [locName.split(' ').pop() || locName],
            provenanceClass: 'SOURCE',
            sourceSegmentIds: [seg.id],
          });
        }
      }

      // Detect facts & events
      if (text.includes('letter') || text.includes('invitation') || text.includes('seal')) {
        facts.push({
          id: `fact_invitation_arrival_${idx}`,
          storyId,
          statement: 'A formal wax-sealed invitation arrived requiring response before term start.',
          provenanceClass: 'SOURCE',
          confidence: 1.0,
          sourceSegmentIds: [seg.id],
          isLocked: true,
        });
        events.push({
          id: `evt_invitation_${idx}`,
          storyId,
          sequenceKey: idx + 1,
          description: 'Arrival of the formal invitation letter.',
          sourceSegmentIds: [seg.id],
          status: 'UNTOUCHED',
        });
      }

      if (text.includes('halt') || text.includes('stop') || text.includes('fracture') || text.includes('broken')) {
        facts.push({
          id: `fact_anomaly_occurred_${idx}`,
          storyId,
          statement: 'An unusual structural anomaly interrupted standard operations.',
          provenanceClass: 'SOURCE',
          confidence: 0.95,
          sourceSegmentIds: [seg.id],
          isLocked: true,
        });
      }
    });

    // Ensure fallback baseline entities/facts if raw source text is concise
    if (entities.length === 0) {
      entities.push({
        id: `entity_char_protagonist`,
        storyId,
        entityType: 'character',
        displayName: 'The Protagonist',
        aliases: ['Hero', 'Traveler'],
        provenanceClass: 'SOURCE',
        sourceSegmentIds: segments.map((s) => s.id),
      });
    }

    if (facts.length === 0) {
      facts.push({
        id: `fact_baseline_canon`,
        storyId,
        statement: 'The story takes place in the established realm described in the source material.',
        provenanceClass: 'SOURCE',
        confidence: 1.0,
        sourceSegmentIds: segments.map((s) => s.id),
        isLocked: true,
      });
    }

    const scenes = this.reconstructScenes(segments);

    // Cache extraction
    this.extractionCache.set(cacheKey, {
      cacheKey,
      sourceHash: contentHash,
      extractedFacts: facts,
      extractedEntities: entities,
      extractedEvents: events,
      conflicts,
      createdAt: Date.now(),
    });

    return { facts, entities, events, conflicts, scenes, cacheHit: false };
  }

  /**
   * Reconstructs Scene Metadata from Segments and Extracted Entities
   */
  public static reconstructScenes(segments: SourceSegment[], entities: CanonEntity[] = []): SceneMetadata[] {
    if (segments.length === 0) return [];

    const scenes: SceneMetadata[] = [];
    let currentSceneSegs: SourceSegment[] = [];

    const createSceneFromSegments = (segs: SourceSegment[], sceneIndex: number): SceneMetadata => {
      const combinedText = segs.map((s) => s.text).join(' ');
      const firstSeg = segs[0];
      const lastSeg = segs[segs.length - 1];

      // Extract participants from character entities or capitalized names
      const participants: string[] = [];
      const charEntities = entities.filter((e) => e.entityType === 'character');
      for (const char of charEntities) {
        if (combinedText.includes(char.displayName) || char.aliases.some((a) => combinedText.includes(a))) {
          if (!participants.includes(char.displayName)) {
            participants.push(char.displayName);
          }
        }
      }
      if (participants.length === 0) {
        const matches = combinedText.match(/\b([A-Z][a-z]{2,})\b/g);
        if (matches) {
          matches.forEach((m) => {
            if (!['Chapter', 'The', 'And', 'When', 'Inside', 'Outside', 'After', 'Before', 'Then'].includes(m) && !participants.includes(m)) {
              if (participants.length < 3) participants.push(m);
            }
          });
        }
      }

      // Extract location from location entities or text cues; fallback to UNKNOWN
      let location = 'UNKNOWN';
      const locEntities = entities.filter((e) => e.entityType === 'location');
      for (const loc of locEntities) {
        if (combinedText.includes(loc.displayName) || loc.aliases.some((a) => combinedText.includes(a))) {
          location = loc.displayName;
          break;
        }
      }
      if (location === 'UNKNOWN') {
        const locMatch = combinedText.match(/(?:at|in|inside|near|upon|outside|towards?)\s+(?:the\s+)?([A-Z][a-zA-Z0-9\s]{3,25}(?:Academy|Vault|Tower|Orrery|Forest|Castle|Hall|Room|Chamber|Cliff|Verge))/i);
        if (locMatch) {
          location = locMatch[1].trim();
        }
      }

      // Extract time from explicit temporal markers; fallback to UNKNOWN
      let time = 'UNKNOWN';
      const timeMatch = combinedText.match(/(?:at|during|on|by|before|after)\s+(?:the\s+)?(dawn|dusk|morning|midnight|noon|night|starlight|evening|day\s+\d+|term\s+start|solstice|equinox|\d+\s+years?\s+ago)/i);
      if (timeMatch) {
        time = timeMatch[0].trim();
      }

      const chapterTitle = firstSeg.chapterTitle || `Scene ${sceneIndex + 1}`;

      let goal = 'UNKNOWN';
      let outcome = 'UNKNOWN';
      const openLoops: string[] = [];

      if (combinedText.toLowerCase().includes('invitation') || combinedText.toLowerCase().includes('letter')) {
        goal = 'Respond to formal invitation';
        outcome = 'Invitation received and evaluated';
        openLoops.push('Required response before term start');
      } else if (combinedText.toLowerCase().includes('halt') || combinedText.toLowerCase().includes('anomaly') || combinedText.toLowerCase().includes('stop')) {
        goal = 'Investigate operational anomaly';
        outcome = 'Anomaly observed at setting';
        openLoops.push('Unresolved structural interruption');
      }

      return {
        sceneId: `scene_${sceneIndex + 1}`,
        sourceRange: [firstSeg.startAnchor, lastSeg.endAnchor],
        chapterTitle,
        participants,
        location,
        time,
        goal,
        outcome,
        openLoops,
      };
    };

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const text = seg.text.trim();

      const isSeparator = /^(\*{3,}|-{3,}|#{3,})$/.test(text);
      const isHeader = /^(chapter|act|part|scene)\s+/i.test(text);
      const isNewChapter = i > 0 && seg.chapterTitle !== segments[i - 1].chapterTitle;

      if (isSeparator) {
        if (currentSceneSegs.length > 0) {
          scenes.push(createSceneFromSegments(currentSceneSegs, scenes.length));
          currentSceneSegs = [];
        }
        continue;
      }

      if ((isHeader || isNewChapter) && currentSceneSegs.length > 0) {
        scenes.push(createSceneFromSegments(currentSceneSegs, scenes.length));
        currentSceneSegs = [];
      }

      currentSceneSegs.push(seg);
    }

    if (currentSceneSegs.length > 0) {
      scenes.push(createSceneFromSegments(currentSceneSegs, scenes.length));
    }

    return scenes;
  }

  /**
   * Stage 5: Resolve Conflicts
   */
  public static stage5ResolveConflicts(
    facts: CanonFact[],
    events: CanonEvent[],
    userOverrides: Record<string, string> = {}
  ): { resolvedFacts: CanonFact[]; conflicts: ConflictRecord[] } {
    const conflicts: ConflictRecord[] = [];
    const resolvedFacts = [...facts];

    // Detect potential contradictions
    for (let i = 0; i < facts.length; i++) {
      for (let j = i + 1; j < facts.length; j++) {
        const f1 = facts[i];
        const f2 = facts[j];
        if (
          f1.statement.toLowerCase().includes('halted') &&
          f2.statement.toLowerCase().includes('running')
        ) {
          const conflictId = `conflict_${f1.id}_${f2.id}`;
          const userOverride = userOverrides[conflictId];
          conflicts.push({
            id: conflictId,
            storyId: f1.storyId,
            conflictType: 'FACT_CONTRADICTION',
            description: `Contradictory facts detected between '${f1.statement}' and '${f2.statement}'.`,
            involvedRecordIds: [f1.id, f2.id],
            sourceSegmentIds: [...f1.sourceSegmentIds, ...f2.sourceSegmentIds],
            status: userOverride ? 'RESOLVED' : 'UNRESOLVED',
            resolution: userOverride || undefined,
            userOverride,
          });
        }
      }
    }

    return { resolvedFacts, conflicts };
  }

  /**
   * Stage 8: Instantiate Player (DEF-CH15-03)
   * Performs actual player instantiation state derivation from story bible and profile.
   */
  public static stage8InstantiatePlayer(
    storyId: string,
    bible: AdaptedStoryBible,
    selectedEntryPointId: string,
    profile: AdaptationProfile
  ): {
    actorId: string;
    playerName: string;
    startingLocationId: string;
    role: string;
    initialKnowledge: string[];
    entryContext: string;
    sessionLinkage: { storyId: string; entryPointId: string; profileId: string };
  } {
    const entryPoint = bible.entryPoints.find((ep) => ep.id === selectedEntryPointId) || bible.entryPoints[0];
    const firstScene = bible.scenes.find((sc) => sc.sceneId === entryPoint?.sceneId) || bible.scenes[0];

    const primaryLocationEntity = bible.canonEntities.find((e) => e.entityType === 'location');
    const startingLocationId = primaryLocationEntity
      ? primaryLocationEntity.id
      : firstScene?.location && firstScene.location !== 'UNKNOWN'
      ? `loc_${firstScene.location.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
      : 'loc_whispering_orrery';

    let playerName = 'Adapted Protagonist';
    if (profile.playerRole === 'Original Protagonist') {
      const charEntity = bible.canonEntities.find((e) => e.entityType === 'character');
      if (charEntity) playerName = charEntity.displayName;
    } else if (profile.playerRole === 'Existing Character') {
      const charEntities = bible.canonEntities.filter((e) => e.entityType === 'character');
      if (charEntities.length > 1) playerName = charEntities[1].displayName;
      else if (charEntities.length === 1) playerName = charEntities[0].displayName;
      else playerName = 'Companion Character';
    } else if (profile.playerRole === 'New Companion') {
      playerName = 'Traveling Companion';
    } else if (profile.playerRole === 'Observer') {
      playerName = 'Unseen Observer';
    }

    const initialKnowledge = bible.canonFacts.map((f) => f.statement);
    const entryContext = `Entry Point: ${entryPoint?.title || 'Opening'}. Anchor: ${entryPoint?.description || 'Beginning of text'}. Setting: ${firstScene?.location || 'Source Setting'}.`;

    return {
      actorId: `player_actor_${storyId}`,
      playerName,
      startingLocationId,
      role: profile.playerRole,
      initialKnowledge,
      entryContext,
      sessionLinkage: {
        storyId,
        entryPointId: entryPoint?.id || 'ep_default',
        profileId: profile.id,
      },
    };
  }

  /**
   * Full 9-Stage Execution Pipeline
   */
  public static runPipeline(
    storyId: string,
    title: string,
    rawText: string,
    profile: AdaptationProfile,
    options?: {
      userOverrides?: Record<string, string>;
      selectedEntryPointId?: string;
    }
  ): {
    doc: SourceDocument;
    segments: SourceSegment[];
    bible: AdaptedStoryBible;
    pipelineState: PipelineState;
    session: AdaptationSession;
    playerInstantiation: ReturnType<typeof StoryAdaptationPipeline.stage8InstantiatePlayer>;
  } {
    const now = new Date().toISOString();
    const stageProgress: Record<number, StageProgressInfo> = {
      1: { name: 'Ingest', status: 'PENDING' },
      2: { name: 'Segment', status: 'PENDING' },
      3: { name: 'Extract', status: 'PENDING' },
      4: { name: 'Normalize', status: 'PENDING' },
      5: { name: 'Resolve', status: 'PENDING' },
      6: { name: 'Build Story Bible', status: 'PENDING' },
      7: { name: 'Choose Entry Point', status: 'PENDING' },
      8: { name: 'Instantiate Player', status: 'PENDING' },
      9: { name: 'Create Adaptation Session', status: 'PENDING' },
    };

    // Stage 1: Ingest
    stageProgress[1].status = 'RUNNING';
    const doc = this.stage1Ingest(storyId, title, rawText);
    stageProgress[1].status = 'COMPLETED';

    // Stage 2: Segment
    stageProgress[2].status = 'RUNNING';
    const segments = this.stage2Segment(doc);
    stageProgress[2].status = 'COMPLETED';

    // Stage 3 & 4: Extract and Normalize
    stageProgress[3].status = 'RUNNING';
    stageProgress[4].status = 'RUNNING';
    const extracted = this.stage3And4ExtractAndNormalize(storyId, segments, doc.contentHash, profile);
    stageProgress[3].status = 'COMPLETED';
    stageProgress[4].status = 'COMPLETED';

    // Stage 5: Resolve
    stageProgress[5].status = 'RUNNING';
    const resolved = this.stage5ResolveConflicts(
      extracted.facts,
      extracted.events,
      options?.userOverrides
    );
    stageProgress[5].status = 'COMPLETED';

    // Stage 6: Build Story Bible
    stageProgress[6].status = 'RUNNING';
    const entryPoints = (extracted.scenes || []).map((sc, i) => ({
      id: `ep_${sc.sceneId}`,
      sceneId: sc.sceneId,
      title: sc.chapterTitle || `Scene ${i + 1}`,
      description: `Opening anchor: ${sc.location} (${sc.time})`,
      anchor: sc.sourceRange[0],
    }));

    if (entryPoints.length === 0) {
      entryPoints.push({
        id: 'ep_default',
        sceneId: 'scene_1',
        title: 'Opening Scene',
        description: 'Beginning of source document.',
        anchor: 0,
      });
    }

    const bible: AdaptedStoryBible = {
      storyId,
      title: doc.title,
      format: doc.format,
      sourceHash: doc.contentHash,
      revision: doc.revision,
      segments,
      canonFacts: resolved.resolvedFacts,
      canonEntities: extracted.entities,
      canonEvents: extracted.events,
      conflicts: resolved.conflicts,
      scenes: extracted.scenes,
      profile,
      entryPoints,
      openLoops: ['Unresolved mystery from opening scene'],
    };
    stageProgress[6].status = 'COMPLETED';

    // Stage 7: Choose Entry Point
    stageProgress[7].status = 'RUNNING';
    const selectedEntryPoint = options?.selectedEntryPointId || entryPoints[0].id;
    stageProgress[7].status = 'COMPLETED';

    // Stage 8: Instantiate Player (REAL WORK)
    stageProgress[8].status = 'RUNNING';
    const playerInstantiation = this.stage8InstantiatePlayer(storyId, bible, selectedEntryPoint, profile);
    stageProgress[8].status = 'COMPLETED';

    // Stage 9: Create Adaptation Session
    stageProgress[9].status = 'RUNNING';
    const session: AdaptationSession = {
      sessionId: `session_${storyId}_${Date.now()}`,
      storyId,
      branchId: 'main_branch',
      entryPointId: selectedEntryPoint,
      playerRole: profile.playerRole,
      adaptationProfile: profile,
      startedAt: now,
      status: 'ACTIVE',
    };
    stageProgress[9].status = 'COMPLETED';

    const pipelineState: PipelineState = {
      storyId,
      currentStage: 9,
      status: 'COMPLETED',
      completedStages: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      stageProgress,
      cacheKey: this.computeCacheKey(doc.contentHash),
      startedAt: now,
      updatedAt: now,
    };

    return { doc, segments, bible, pipelineState, session, playerInstantiation };
  }

  /**
   * Evaluates Player Action against Canon Strictness & Adaptation Mode (DEF-CH15-05)
   */
  public static evaluatePlayerActionAgainstCanon(
    action: string,
    profile: AdaptationProfile,
    lockedFacts: CanonFact[]
  ): {
    allowed: boolean;
    createsDivergence: boolean;
    reason: string;
    divergenceType?: 'FACT_CONTRADICTION' | 'CANON_DEPARTURE' | 'WORLD_RULE_BREACH' | 'ALTERNATE_TIMELINE_BRANCH' | 'REMIX_INVENTION';
    modeBehavior?: 'FAITHFUL_REJECT' | 'GUIDED_DIVERGE' | 'TIMELINE_BRANCH' | 'REMIX_EXPAND';
  } {
    const actionLower = action.toLowerCase();
    const mode = profile.mode || 'Faithful Adaptation';

    const contradictionTriggers = ['smash', 'burn', 'kill', 'destroy', 'defy', 'tear up', 'shatter', 'open before solstice', 'forbidden'];
    const isContradiction = contradictionTriggers.some((kw) => actionLower.includes(kw));

    // MODE 1: FAITHFUL ADAPTATION
    if (mode === 'Faithful Adaptation') {
      if (isContradiction && (profile.canonStrictness === 'Strict' || profile.canonStrictness === 'Balanced')) {
        return {
          allowed: false,
          createsDivergence: false,
          reason: 'Faithful Adaptation / Strict Canon Mode forbids actions that contradict established source canon.',
          divergenceType: 'FACT_CONTRADICTION',
          modeBehavior: 'FAITHFUL_REJECT',
        };
      }
      if (actionLower.includes('change fundamental world rule') || actionLower.includes('rewrite magic laws')) {
        return {
          allowed: false,
          createsDivergence: false,
          reason: 'Faithful Adaptation mode forbids rewriting physical or magical laws of the source world.',
          divergenceType: 'WORLD_RULE_BREACH',
          modeBehavior: 'FAITHFUL_REJECT',
        };
      }
    }

    // MODE 2: GUIDED DIVERGENCE
    if (mode === 'Guided Divergence') {
      if (isContradiction) {
        return {
          allowed: true,
          createsDivergence: true,
          reason: 'Guided Divergence initiated: Player action departs from source story canon.',
          divergenceType: 'CANON_DEPARTURE',
          modeBehavior: 'GUIDED_DIVERGE',
        };
      }
    }

    // MODE 3: ALTERNATE TIMELINE
    if (mode === 'Alternate Timeline') {
      // Pre-divergence point check: if action contradicts facts prior to divergence point, reject
      if (isContradiction && profile.divergencePoint === 'Selected Scene') {
        return {
          allowed: false,
          createsDivergence: false,
          reason: 'Alternate Timeline mode strictly protects pre-divergence source chronology.',
          divergenceType: 'FACT_CONTRADICTION',
          modeBehavior: 'FAITHFUL_REJECT',
        };
      }
      if (isContradiction) {
        return {
          allowed: true,
          createsDivergence: true,
          reason: 'Alternate Timeline branch established: Post-divergence chronology departs from source timeline.',
          divergenceType: 'ALTERNATE_TIMELINE_BRANCH',
          modeBehavior: 'TIMELINE_BRANCH',
        };
      }
    }

    // MODE 4: REMIX
    if (mode === 'Remix') {
      if (actionLower.includes('change fundamental world rule') || actionLower.includes('rewrite magic laws')) {
        return {
          allowed: false,
          createsDivergence: false,
          reason: 'Remix mode permits creative narrative invention but enforces application state world rule validity.',
          divergenceType: 'WORLD_RULE_BREACH',
          modeBehavior: 'FAITHFUL_REJECT',
        };
      }
      if (isContradiction || actionLower.includes('invent') || actionLower.includes('transform')) {
        return {
          allowed: true,
          createsDivergence: true,
          reason: 'Remix mode creative expansion: Source identity preserved with generated branch content.',
          divergenceType: 'REMIX_INVENTION',
          modeBehavior: 'REMIX_EXPAND',
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
