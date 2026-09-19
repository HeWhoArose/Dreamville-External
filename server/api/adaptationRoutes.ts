import { Router, Request, Response } from 'express';
import { worldRepository } from '../repositories/worldRepository';
import {
  StoryAdaptationPipeline,
  AdaptationProfile,
  AdaptedStoryBible,
} from '../domain/storyAdaptation';
import { PlayerLifecycleState } from '../domain/playerLifecycleState';

export const adaptationRouter = Router();

/**
 * POST /api/game/adaptation/ingest
 */
adaptationRouter.post('/ingest', (req: Request, res: Response) => {
  try {
    const { storyId, title, rawText, format } = req.body;
    if (!storyId || !rawText) {
      return res.status(400).json({ error: 'Missing required parameters: storyId, rawText' });
    }

    const doc = StoryAdaptationPipeline.stage1Ingest(storyId, title, rawText, format);
    const initialProgress = {
      1: { name: 'Ingest', status: 'COMPLETED' as const },
      2: { name: 'Segment', status: 'PENDING' as const },
      3: { name: 'Extract', status: 'PENDING' as const },
      4: { name: 'Normalize', status: 'PENDING' as const },
      5: { name: 'Resolve', status: 'PENDING' as const },
      6: { name: 'Build Story Bible', status: 'PENDING' as const },
      7: { name: 'Choose Entry Point', status: 'PENDING' as const },
      8: { name: 'Instantiate Player', status: 'PENDING' as const },
      9: { name: 'Create Adaptation Session', status: 'PENDING' as const },
    };

    const pipelineState = {
      storyId,
      currentStage: 1,
      status: 'RUNNING' as const,
      completedStages: [1],
      stageProgress: initialProgress,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    worldRepository.savePipelineState(storyId, pipelineState);

    res.json({ doc, pipelineState });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to ingest story.' });
  }
});

/**
 * POST /api/game/adaptation/analyze
 * Executes full 9-stage pipeline and seeds the story repository.
 */
adaptationRouter.post('/analyze', (req: Request, res: Response) => {
  try {
    const { storyId, title, rawText, profile, options } = req.body;
    if (!storyId || !rawText) {
      return res.status(400).json({ error: 'Missing storyId or rawText in request body.' });
    }

    const defaultProfile: AdaptationProfile = {
      id: `profile_${storyId}`,
      storyId,
      mode: profile?.mode || 'Faithful Adaptation',
      canonStrictness: profile?.canonStrictness || 'Strict',
      divergencePoint: profile?.divergencePoint || 'Beginning',
      plotGravity: profile?.plotGravity || 'Strong',
      playerRole: profile?.playerRole || 'Original Protagonist',
      characterFidelity: profile?.characterFidelity || 'Strict',
      worldExpansion: profile?.worldExpansion || 'Moderate',
    };

    const result = StoryAdaptationPipeline.runPipeline(
      storyId,
      title || 'Source Story',
      rawText,
      defaultProfile,
      options
    );

    // Save outputs into world repository authority
    worldRepository.seedStory(storyId);
    worldRepository.saveAdaptedStoryBible(storyId, result.bible);
    worldRepository.saveAdaptationProfile(storyId, defaultProfile);
    worldRepository.savePipelineState(storyId, result.pipelineState);
    worldRepository.saveAdaptationSession(storyId, result.session);

    // Populate knowledge base facts from extracted canon facts
    result.bible.canonFacts.forEach((fact) => {
      worldRepository.addKnowledgeFact(storyId, {
        id: fact.id,
        subjectEntityId: 'story_canon',
        predicate: 'canon_fact',
        objectValue: fact.statement,
        sourceType: 'document',
        acquiredAtTimestamp: worldRepository.getWorldClock(storyId).getTimestamp(),
        confidence: fact.confidence || 1.0,
        secretLevel: 'public',
        scope: 'general',
        provenanceSummary: `Source Canon (${fact.provenanceClass})`,
      });
    });

    // Seed player lifecycle from Stage 8 Player Instantiation (DEF-CH15-03)
    const inst = result.playerInstantiation;
    const clock = worldRepository.getWorldClock(storyId);
    const initialPlayer = new PlayerLifecycleState({
      actorId: inst?.actorId || `player_actor_${storyId}`,
      name: inst?.playerName || (defaultProfile.playerRole === 'Original Protagonist' ? 'Adapted Protagonist' : 'New Traveler'),
      locationId: inst?.startingLocationId || 'loc_whispering_orrery',
      lastUpdatedTime: clock.getTimestamp().totalElapsedSeconds,
      currentActivity: 'idle',
      activeJourney: null,
      injuries: [],
    });
    worldRepository.updatePlayerLifecycle(storyId, initialPlayer);

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Story adaptation pipeline execution failed.' });
  }
});

/**
 * GET /api/game/adaptation/:storyId/status
 */
adaptationRouter.get('/:storyId/status', (req: Request, res: Response) => {
  try {
    const storyId = String(req.params.storyId);
    const state = worldRepository.getPipelineState(storyId);
    if (!state) {
      return res.status(404).json({ error: `Pipeline state for story '${storyId}' not found.` });
    }
    res.json(state);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve pipeline status.' });
  }
});

/**
 * GET /api/game/adaptation/:storyId/review
 */
adaptationRouter.get('/:storyId/review', (req: Request, res: Response) => {
  try {
    const storyId = String(req.params.storyId);
    const bible = worldRepository.getAdaptedStoryBible(storyId);
    const profile = worldRepository.getAdaptationProfile(storyId);
    const pipelineState = worldRepository.getPipelineState(storyId);
    const session = worldRepository.getAdaptationSession(storyId);

    if (!bible) {
      return res.status(404).json({ error: `Adapted story bible for story '${storyId}' not found.` });
    }

    res.json({ bible, profile, pipelineState, session });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve story review.' });
  }
});

/**
 * POST /api/game/adaptation/:storyId/conflicts/:conflictId/resolve
 */
adaptationRouter.post('/:storyId/conflicts/:conflictId/resolve', (req: Request, res: Response) => {
  try {
    const storyId = String(req.params.storyId);
    const conflictId = String(req.params.conflictId);
    const { resolution, userOverride } = req.body;

    const bible = worldRepository.getAdaptedStoryBible(storyId);
    if (!bible) {
      return res.status(404).json({ error: `Adapted story bible for story '${storyId}' not found.` });
    }

    const conflict = bible.conflicts.find((c) => c.id === conflictId);
    if (!conflict) {
      return res.status(404).json({ error: `Conflict record '${conflictId}' not found.` });
    }

    conflict.status = 'RESOLVED';
    conflict.resolution = resolution || 'User explicit override';
    conflict.userOverride = userOverride || resolution;

    worldRepository.saveAdaptedStoryBible(storyId, bible);

    res.json({ success: true, conflict, bible });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to resolve conflict.' });
  }
});

/**
 * POST /api/game/adaptation/:storyId/entry-point
 */
adaptationRouter.post('/:storyId/entry-point', (req: Request, res: Response) => {
  try {
    const storyId = String(req.params.storyId);
    const { entryPointId } = req.body;

    const session = worldRepository.getAdaptationSession(storyId);
    if (!session) {
      return res.status(404).json({ error: `Adaptation session for story '${storyId}' not found.` });
    }

    session.entryPointId = entryPointId;
    worldRepository.saveAdaptationSession(storyId, session);

    res.json({ success: true, session });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to set entry point.' });
  }
});

/**
 * POST /api/game/adaptation/:storyId/profile
 */
adaptationRouter.post('/:storyId/profile', (req: Request, res: Response) => {
  try {
    const storyId = String(req.params.storyId);
    const { profile } = req.body;

    if (!profile) {
      return res.status(400).json({ error: 'Missing profile object in request body.' });
    }

    worldRepository.saveAdaptationProfile(storyId, profile);

    const bible = worldRepository.getAdaptedStoryBible(storyId);
    if (bible) {
      bible.profile = profile;
      worldRepository.saveAdaptedStoryBible(storyId, bible);
    }

    res.json({ success: true, profile });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update adaptation profile.' });
  }
});

/**
 * POST /api/game/adaptation/:storyId/create-session
 */
adaptationRouter.post('/:storyId/create-session', (req: Request, res: Response) => {
  try {
    const storyId = String(req.params.storyId);
    const { entryPointId, playerRole } = req.body;

    const bible = worldRepository.getAdaptedStoryBible(storyId);
    if (!bible) {
      return res.status(404).json({ error: `Story bible for '${storyId}' not found.` });
    }

    const session = worldRepository.getAdaptationSession(storyId) || {
      sessionId: `session_${storyId}_${Date.now()}`,
      storyId,
      branchId: 'main_branch',
      entryPointId: entryPointId || 'ep_default',
      playerRole: playerRole || bible.profile.playerRole,
      adaptationProfile: bible.profile,
      startedAt: new Date().toISOString(),
      status: 'ACTIVE' as const,
    };

    session.entryPointId = entryPointId || session.entryPointId;
    session.playerRole = playerRole || session.playerRole;

    worldRepository.saveAdaptationSession(storyId, session);

    res.json({ success: true, session });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create adaptation session.' });
  }
});

/**
 * POST /api/game/adaptation/:storyId/duplicate-branch
 */
adaptationRouter.post('/:storyId/duplicate-branch', (req: Request, res: Response) => {
  try {
    const storyId = String(req.params.storyId);
    const { newBranchId, branchTitle } = req.body;

    if (!newBranchId) {
      return res.status(400).json({ error: 'Missing newBranchId parameter.' });
    }

    const branchResult = worldRepository.duplicateAdaptationBranch(storyId, newBranchId, { branchTitle });
    res.json(branchResult);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to duplicate adaptation branch.' });
  }
});

/**
 * GET /api/game/adaptation/:storyId/provenance/:targetId
 */
adaptationRouter.get('/:storyId/provenance/:targetId', (req: Request, res: Response) => {
  try {
    const storyId = String(req.params.storyId);
    const targetId = String(req.params.targetId);
    const bible = worldRepository.getAdaptedStoryBible(storyId);

    if (!bible) {
      return res.status(404).json({ error: `Adapted story bible for '${storyId}' not found.` });
    }

    // Search facts, entities, events
    const fact = bible.canonFacts.find((f) => f.id === targetId);
    const entity = bible.canonEntities.find((e) => e.id === targetId);
    const event = bible.canonEvents.find((ev) => ev.id === targetId);

    const record = fact || entity || event;
    if (!record) {
      return res.status(404).json({ error: `Record '${targetId}' not found in story bible.` });
    }

    const sourceSegments = bible.segments.filter((seg) => record.sourceSegmentIds.includes(seg.id));
    const sourceExcerpt = sourceSegments.map((s) => s.text).join('\n\n');
    const provenanceClass = 'provenanceClass' in record ? (record as any).provenanceClass : 'EXPLICIT_SOURCE';

    res.json({
      targetId,
      recordType: fact ? 'CANON_FACT' : entity ? 'CANON_ENTITY' : 'CANON_EVENT',
      provenanceClass,
      confidence: 'confidence' in record ? (record as any).confidence : 1.0,
      sourceSegmentIds: record.sourceSegmentIds,
      sourceSegments,
      sourceExcerpt: sourceExcerpt || 'Derived from implicit document context.',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve provenance record.' });
  }
});

/**
 * GET /api/game/adaptation/list
 */
adaptationRouter.get('/list', (req: Request, res: Response) => {
  try {
    const list = worldRepository.getAllAdaptationStories();
    // Ensure default_story (Original Campaign) is included
    const hasDefault = list.some((s) => s.storyId === 'default_story');
    if (!hasDefault) {
      list.unshift({
        storyId: 'default_story',
        title: 'Original Dreamville Campaign',
        mode: 'Original',
        branchId: 'main',
        isAdapted: false,
      });
    }
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to list adapted stories.' });
  }
});

/**
 * POST /api/game/adaptation/select
 * Activates an existing adapted story or original story canonically on the server authority.
 */
adaptationRouter.post('/select', (req: Request, res: Response) => {
  try {
    const { storyId } = req.body;
    if (!storyId) {
      return res.status(400).json({ error: 'Missing storyId in request body.' });
    }
    const { serverMockAuthority } = require('../mockEngine/serverMockAuthority');
    serverMockAuthority.setActiveStoryId(storyId);
    const viewState = serverMockAuthority.getSanitizedViewState(storyId);
    const bible = worldRepository.getAdaptedStoryBible(storyId);
    const profile = worldRepository.getAdaptationProfile(storyId);
    const session = worldRepository.getAdaptationSession(storyId);

    res.json({
      success: true,
      activeStoryId: storyId,
      viewState,
      bible,
      profile,
      session,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to select active story.' });
  }
});
