import { Router, Request, Response } from 'express';
import { worldRepository } from '../repositories/worldRepository';

export const sensoryRouter = Router();

// GET /api/game/sensory/state
sensoryRouter.get('/state', async (req: Request, res: Response) => {
  try {
    const { storyId = 'default_story' } = req.query;
    const sensoryEngine = worldRepository.getSensoryEngine();
    
    // Evaluate soundscape based on canonical world state
    const player = worldRepository.getPlayerLifecycle(storyId as string);
    const clock = worldRepository.getWorldClock(storyId as string);
    const combat = worldRepository.getCombatEngine(storyId as string);
    
    const timePhase = clock.getState().currentDayPhase;
    const locId = player?.locationId || 'loc_unknown';
    const activity = player?.currentActivity || 'idle';
    const combatActive = combat.getParticipants().length > 0;
    
    const soundscape = sensoryEngine.evaluateSoundscape(storyId as string, locId, timePhase, activity, combatActive);
    
    res.json({
      settings: sensoryEngine.getSettings(storyId as string),
      voiceProfiles: sensoryEngine.getAllVoiceProfiles(storyId as string),
      soundscape
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve sensory state.', details: String(error) });
  }
});

// POST /api/game/sensory/settings
sensoryRouter.post('/settings', async (req: Request, res: Response) => {
  try {
    const { storyId = 'default_story', settings } = req.body;
    const sensoryEngine = worldRepository.getSensoryEngine();
    sensoryEngine.updateSettings(storyId, settings);
    res.json({ success: true, settings: sensoryEngine.getSettings(storyId) });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update audio settings.' });
  }
});

// POST /api/game/sensory/voice-profile
sensoryRouter.post('/voice-profile', async (req: Request, res: Response) => {
  try {
    const { storyId = 'default_story', profile } = req.body;
    const sensoryEngine = worldRepository.getSensoryEngine();
    sensoryEngine.setVoiceProfile(storyId, profile);
    res.json({ success: true, profile: sensoryEngine.getVoiceProfile(storyId, profile.actorId) });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update voice profile.' });
  }
});

// POST /api/game/sensory/speech
sensoryRouter.post('/speech', async (req: Request, res: Response) => {
  try {
    const { storyId = 'default_story', actorId, text } = req.body;
    const orchestrator = worldRepository.getAiOrchestrator();
    const sensoryEngine = worldRepository.getSensoryEngine();
    
    const profile = actorId ? sensoryEngine.getVoiceProfile(storyId, actorId) : null;
    
    // DEF-CH14-01: Direct presentation synthesis path; MUST NOT call executeTurn
    const result = await orchestrator.synthesizeSpeech({
      storyId,
      text: String(text || ''),
      voiceProfile: profile,
      timeoutMs: 5000,
    });
    
    res.json({
      success: result.success,
      audioResult: result.audioResultBase64,
      fallbackText: result.fallbackText,
      fromCache: result.fromCache || false,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Speech synthesis failed.', details: String(error) });
  }
});

// POST /api/game/sensory/transcribe
sensoryRouter.post('/transcribe', async (req: Request, res: Response) => {
  try {
    const { storyId = 'default_story', audioBase64, audioMimeType = 'audio/webm' } = req.body;
    if (!String(audioBase64 || '').trim()) {
      return res.status(400).json({
        success: false,
        errorCode: 'INPUT_EMPTY',
        error: 'No microphone recording was supplied.',
      });
    }

    // DEF-CH14-01: Direct transcription utility path; MUST NOT call executeTurn
    const result = await worldRepository.getAiOrchestrator().transcribeAudio({
      storyId,
      audioBase64: String(audioBase64),
      audioMimeType: String(audioMimeType || 'audio/webm'),
      timeoutMs: 5000,
    });

    if (!result.success || !result.text.trim()) {
      const status = result.errorCode === 'INPUT_INVALID_BASE64' || result.errorCode === 'INPUT_EMPTY'
        ? 400
        : result.errorCode === 'TRANSCRIPTION_MALFORMED'
        ? 502
        : 503;
      return res.status(status).json({
        success: false,
        errorCode: result.errorCode || 'TRANSCRIPTION_UNAVAILABLE',
        error: result.errorReason || 'No transcription result is available.',
        attemptsTrail: result.attemptsTrail || [],
      });
    }

    return res.json({
      success: true,
      text: result.text.trim(),
      modelId: result.modelId,
      providerId: result.providerId,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      errorCode: 'TRANSCRIPTION_INTERNAL_ERROR',
      error: 'Transcription failed.',
      details: String(error?.message || error),
    });
  }
});
