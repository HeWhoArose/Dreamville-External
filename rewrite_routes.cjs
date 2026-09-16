const fs = require('fs');

const content = `import { Router, Request, Response } from 'express';
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
    
    const profile = sensoryEngine.getVoiceProfile(storyId, actorId);
    
    const turnResult = await orchestrator.executeTurn({
      storyId,
      playerAction: \`Generate speech for: \${text}\`,
      task: 'speech.generate',
      hardTokenBudget: 50,
      timeoutMs: 5000,
      maxRetries: 1,
      voiceProfile: profile
    });
    
    res.json({
      success: !!turnResult.audioResultBase64,
      audioResult: turnResult.audioResultBase64 || null,
      fallbackText: turnResult.turnPackage?.narrative?.[0] || 'No speech generated.'
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Speech synthesis failed.', details: String(error) });
  }
});

// POST /api/game/sensory/transcribe
sensoryRouter.post('/transcribe', async (req: Request, res: Response) => {
  try {
    const { storyId = 'default_story', audioBase64 } = req.body;
    const orchestrator = worldRepository.getAiOrchestrator();
    
    const turnResult = await orchestrator.executeTurn({
      storyId,
      playerAction: 'Transcribe user audio input',
      task: 'speech.transcribe',
      audioInputBase64: audioBase64,
      hardTokenBudget: 150,
      timeoutMs: 5000,
      maxRetries: 1
    });
    
    let textResult = turnResult.turnPackage?.narrative?.[0] || turnResult.telemetry?.modelId;
    if (!turnResult.turnPackage?.narrative?.[0]) {
       textResult = "Transcribed text";
    }
    
    res.json({
      success: turnResult.success,
      text: textResult
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Transcription failed.', details: String(error) });
  }
});
`;

fs.writeFileSync('server/api/sensoryRoutes.ts', content);
