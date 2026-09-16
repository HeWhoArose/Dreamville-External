const fs = require('fs');
let content = fs.readFileSync('server/domain/aiOrchestrator.ts', 'utf8');

content = content.replace(
  `this.registerAdapter(new DeterministicMockSpeechAdapter());`,
  `this.registerAdapter(new DeterministicMockSpeechAdapter());
    this.registerAdapter(new DeterministicMockSTTAdapter());`
);

content = content.replace(
  `    // Specialized Speech Model
    this.registerModel({
      providerId: 'provider_mock_speech',`,
  `    // Specialized STT Model
    this.registerModel({
      providerId: 'provider_mock_stt',
      modelId: 'mock-stt-v1',
      displayName: 'Neural Speech Recognizer',
      pool: 'transcription',
      capabilities: ['stt', 'audio_transcription'],
      contextWindow: 16000,
      health: 'Healthy',
      quota: 'Healthy',
      latencyMs: 300,
      userPriority: 70,
      roleEligibility: ['speech.transcribe'],
      accessStatus: 'accessible',
      lifecycleState: 'active',
      isEmergencyFloor: false,
    });
    
    // Specialized Speech Model
    this.registerModel({
      providerId: 'provider_mock_speech',`
);

fs.writeFileSync('server/domain/aiOrchestrator.ts', content);
