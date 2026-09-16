const fs = require('fs');
let content = fs.readFileSync('server/domain/aiOrchestrator.ts', 'utf8');

content = content.replace(
  `        if (task === 'speech.transcribe') {
          parsed = { narrative: [], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] };
          rawText = rawText || 'Transcribed text';
          return {
            text: rawText,
            latencyMs,
            inputTokens: res.usageMetadata?.promptTokenCount || 0,
            outputTokens: res.usageMetadata?.candidatesTokenCount || 0,
            modelId: targetModel,
            providerId: this.providerId,
            rawResponse: res,
          };
        }`,
  `        if (task === 'speech.transcribe') {
          rawText = rawText || 'Transcribed text';
          parsed = { narrative: [rawText], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] };
          return {
            text: JSON.stringify(parsed),
            latencyMs,
            inputTokens: res.usageMetadata?.promptTokenCount || 0,
            outputTokens: res.usageMetadata?.candidatesTokenCount || 0,
            modelId: targetModel,
            providerId: this.providerId,
            rawResponse: res,
          };
        }`
);

content = content.replace(
  `        if (task === 'speech.generate') {
          return {
            text: rawText || 'Generated speech',
            audioBase64,
            latencyMs,
            inputTokens: res.usageMetadata?.promptTokenCount || 0,
            outputTokens: res.usageMetadata?.candidatesTokenCount || 0,
            modelId: targetModel,
            providerId: this.providerId,
            rawResponse: res,
          };
        }`,
  `        if (task === 'speech.generate') {
          parsed = { narrative: [rawText || 'Generated speech'], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [] };
          return {
            text: JSON.stringify(parsed),
            audioBase64,
            latencyMs,
            inputTokens: res.usageMetadata?.promptTokenCount || 0,
            outputTokens: res.usageMetadata?.candidatesTokenCount || 0,
            modelId: targetModel,
            providerId: this.providerId,
            rawResponse: res,
          };
        }`
);

fs.writeFileSync('server/domain/aiOrchestrator.ts', content);
