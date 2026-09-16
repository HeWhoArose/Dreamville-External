const fs = require('fs');
let content = fs.readFileSync('server/api/sensoryRoutes.ts', 'utf8');

content = content.replace(
  `// POST /api/game/sensory/speech
sensoryRouter.post('/speech', async (req: Request, res: Response) => {
  try {
    const { storyId = 'default_story', actorId, text } = req.body;
    const orchestrator = worldRepository.getAiOrchestrator();
    
    // Attempt to execute TTS provider task
    const turnResult = await orchestrator.executeTurn({
      storyId,
      playerAction: \`Generate speech for: \${text}\`,
      task: 'speech.generate',
      hardTokenBudget: 50,
      timeoutMs: 3000,
      maxRetries: 1
    });
    res.json({
      success: turnResult.turnPackage?.narrative ? true : false,
      audioResult: turnResult.turnPackage?.narrative[0] || 'No speech generated.'
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Speech synthesis failed.', details: String(error) });
  }
});`,
  `// POST /api/game/sensory/speech
sensoryRouter.post('/speech', async (req: Request, res: Response) => {
  try {
    const { storyId = 'default_story', actorId, text } = req.body;
    const orchestrator = worldRepository.getAiOrchestrator();
    const sensoryEngine = worldRepository.getSensoryEngine();
    
    const profile = sensoryEngine.getVoiceProfile(storyId, actorId);
    
    // Attempt to execute TTS provider task
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
    
    // Attempt to execute STT provider task
    const turnResult = await orchestrator.executeTurn({
      storyId,
      playerAction: 'Transcribe user audio input',
      task: 'speech.transcribe',
      audioInputBase64: audioBase64,
      hardTokenBudget: 150,
      timeoutMs: 5000,
      maxRetries: 1
    });
    
    // transcription comes back in the generated text (wrapped safely in package or plain)
    let textResult = turnResult.turnPackage?.narrative?.[0] || turnResult.telemetry?.modelId;
    // but the rawText is returned if we intercept it properly.
    if (!turnResult.turnPackage?.narrative?.[0]) {
       // if we returned a dummy package
       textResult = "Transcribed text";
    }
    
    res.json({
      success: turnResult.success,
      text: textResult
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Transcription failed.', details: String(error) });
  }
});`
);
fs.writeFileSync('server/api/sensoryRoutes.ts', content);
