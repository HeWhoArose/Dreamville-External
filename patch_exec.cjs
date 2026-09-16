const fs = require('fs');
let content = fs.readFileSync('server/domain/aiOrchestrator.ts', 'utf8');

content = content.replace(
  `providerRes = await adapter.generate(task, assembledContext.assembledText, {
              timeoutMs,
              abortSignal: abortController.signal,
              retryCount: attempt,
              modelId: currentCandidate.modelId,
            });`,
  `providerRes = await adapter.generate(task, assembledContext.assembledText, {
              timeoutMs,
              abortSignal: abortController.signal,
              retryCount: attempt,
              modelId: currentCandidate.modelId,
              audioInputBase64: params.audioInputBase64,
              voiceProfile: params.voiceProfile,
            });`
);

content = content.replace(
  `const res = await emergencyAdapter.generate(task, assembledContext.assembledText);`,
  `const res = await emergencyAdapter.generate(task, assembledContext.assembledText, {
          audioInputBase64: params.audioInputBase64,
          voiceProfile: params.voiceProfile,
        });`
);

// also return audioResult in OrchestratedTurnResult
content = content.replace(
  `export interface OrchestratedTurnResult {
  success: boolean;
  turnPackage?: StructuredTurnPackage;
  adjudication?: AdjudicationResult;
  checkpointId?: string;
  error?: string;
  telemetry: OrchestratedTurnTelemetry;
}`,
  `export interface OrchestratedTurnResult {
  success: boolean;
  turnPackage?: StructuredTurnPackage;
  adjudication?: AdjudicationResult;
  checkpointId?: string;
  error?: string;
  telemetry: OrchestratedTurnTelemetry;
  audioResultBase64?: string;
}`
);

// and in the return
content = content.replace(
  `return {
            success: true,
            turnPackage: validation.turnPackage,
            adjudication,
            checkpointId: this.lastTurnTelemetry.checkpointId,
            telemetry: this.lastTurnTelemetry,
          };`,
  `return {
            success: true,
            turnPackage: validation.turnPackage,
            adjudication,
            checkpointId: this.lastTurnTelemetry.checkpointId,
            telemetry: this.lastTurnTelemetry,
            audioResultBase64: providerRes.audioBase64,
          };`
);
fs.writeFileSync('server/domain/aiOrchestrator.ts', content);
