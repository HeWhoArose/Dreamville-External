const fs = require('fs');
let content = fs.readFileSync('server/domain/aiOrchestrator.ts', 'utf8');

const mockSTT = `
export class DeterministicMockSTTAdapter implements IProviderAdapter {
  public readonly providerId = 'provider_mock_stt';

  public async generate(task: TaskId, prompt: string, options?: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
    const text = JSON.stringify({
      narrative: ['This is a mock transcription of the provided audio.'],
      dialogue: [],
      events: ['SPEECH_TRANSCRIBED'],
      stateChanges: [],
      memoryCandidates: [],
      audioCues: [],
    });

    return {
      text,
      latencyMs: 15,
      inputTokens: 10,
      outputTokens: 30,
      modelId: 'mock-stt-v1',
      providerId: this.providerId,
    };
  }

  public isDiscoverySupported(): boolean { return false; }
  public getProviderStatus() { return { configured: true, message: 'Mock STT active.' }; }
  public async validateCredentials() { return true; }
  public async discoverModels() { return []; }
}
`;

content = content.replace(
  `export class DeterministicMockSpeechAdapter`,
  mockSTT + `\nexport class DeterministicMockSpeechAdapter`
);

content = content.replace(
  `// Specialized Speech Model
    this.registerModel({
      providerId: 'provider_mock_speech',`,
  `// Specialized Speech Model
    this.registerModel({
      providerId: 'provider_mock_speech',`
);

content = content.replace(
  `this.adapters.set('provider_mock_speech', new DeterministicMockSpeechAdapter());`,
  `this.adapters.set('provider_mock_speech', new DeterministicMockSpeechAdapter());
    this.adapters.set('provider_mock_stt', new DeterministicMockSTTAdapter());
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
    });`
);

fs.writeFileSync('server/domain/aiOrchestrator.ts', content);
