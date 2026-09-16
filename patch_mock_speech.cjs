const fs = require('fs');
let content = fs.readFileSync('server/domain/aiOrchestrator.ts', 'utf8');

content = content.replace(
  `export class DeterministicMockSpeechAdapter implements IProviderAdapter {
  public readonly providerId = 'provider_mock_speech';

  public async generate(task: TaskId, prompt: string, options?: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
    const text = JSON.stringify({
      narrative: ['Speech audio synthesized successfully.'],
      dialogue: [],
      events: ['SPEECH_AUDIO_GENERATED'],
      stateChanges: [],
      memoryCandidates: [],
      audioCues: ['voice_track_01'],
    });

    return {
      text,
      latencyMs: 15,
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: 30,
      modelId: 'mock-speech-v1',
      providerId: this.providerId,
    };
  }`,
  `export class DeterministicMockSpeechAdapter implements IProviderAdapter {
  public readonly providerId = 'provider_mock_speech';

  public async generate(task: TaskId, prompt: string, options?: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
    const text = JSON.stringify({
      narrative: ['Speech audio synthesized successfully.'],
      dialogue: [],
      events: ['SPEECH_AUDIO_GENERATED'],
      stateChanges: [],
      memoryCandidates: [],
      audioCues: ['voice_track_01'],
    });
    
    // valid silent RIFF WAV base64
    const silentWavBase64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

    return {
      text,
      audioBase64: silentWavBase64,
      latencyMs: 15,
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: 30,
      modelId: 'mock-speech-v1',
      providerId: this.providerId,
    };
  }`
);

fs.writeFileSync('server/domain/aiOrchestrator.ts', content);
