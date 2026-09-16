const fs = require('fs');
let content = fs.readFileSync('server/domain/aiOrchestrator.ts', 'utf8');

content = content.replace(
  `export interface ProviderGenerateOptions {`,
  `export interface ProviderGenerateOptions {
  audioInputBase64?: string;
  voiceProfile?: any;`
);

content = content.replace(
  `export interface ProviderGenerateResult {`,
  `export interface ProviderGenerateResult {
  audioBase64?: string;`
);

content = content.replace(
  `public async executeTurn(params: {
    storyId?: string;
    playerAction?: string;
    task?: TaskId;
    hardTokenBudget?: number;
    timeoutMs?: number;
    maxRetries?: number;
    checkpointId?: string;
    forceModelId?: string;
  }): Promise<OrchestratedTurnResult> {`,
  `public async executeTurn(params: {
    storyId?: string;
    playerAction?: string;
    task?: TaskId;
    hardTokenBudget?: number;
    timeoutMs?: number;
    maxRetries?: number;
    checkpointId?: string;
    forceModelId?: string;
    audioInputBase64?: string;
    voiceProfile?: any;
  }): Promise<OrchestratedTurnResult> {`
);

fs.writeFileSync('server/domain/aiOrchestrator.ts', content);
