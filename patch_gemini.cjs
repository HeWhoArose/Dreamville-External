const fs = require('fs');
let content = fs.readFileSync('server/domain/aiOrchestrator.ts', 'utf8');

const regex = /const callPromise = ai\.models\.generateContent\(\{([\s\S]*?)\}\);/g;
let match = regex.exec(content);
if (match) {
  content = content.replace(match[0], `
        let reqConfig = {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
        };
        let reqContents = [prompt];
        
        if (task === 'speech.transcribe' && options?.audioInputBase64) {
          reqContents = [
            { inlineData: { mimeType: 'audio/mp3', data: options.audioInputBase64 } },
            prompt
          ];
          reqConfig.responseMimeType = 'text/plain';
          reqConfig.systemInstruction = 'Transcribe the audio accurately.';
        }
        
        if (task === 'speech.generate') {
          reqConfig.responseMimeType = undefined;
          reqConfig.systemInstruction = undefined;
          // Gemini doesn't officially document TTS in generateContent as widely known outside of live API, 
          // but if we are targeting a specialized TTS model, we might just pass text.
          reqContents = [prompt];
        }

        const callPromise = ai.models.generateContent({
          model: targetModel,
          contents: reqContents,
          config: reqConfig,
        });
  `);
}

// parsing the response
content = content.replace(
  `let rawText = (res.text || '').trim();`,
  `
        let rawText = '';
        let audioBase64 = undefined;
        try {
          rawText = (res.text || '').trim();
        } catch(e) {}
        
        if (res.candidates && res.candidates[0] && res.candidates[0].content && res.candidates[0].content.parts) {
          for (const part of res.candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('audio/')) {
              audioBase64 = part.inlineData.data;
            }
          }
        }
`
);

content = content.replace(
  `        let parsed: any;
        try {
          parsed = JSON.parse(rawText);
        } catch {`,
  `        let parsed: any;
        if (task === 'speech.transcribe') {
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
        }
        if (task === 'speech.generate') {
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
        }
        try {
          parsed = JSON.parse(rawText);
        } catch {`
);

fs.writeFileSync('server/domain/aiOrchestrator.ts', content);
