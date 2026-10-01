import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const storyView = fs.readFileSync(path.join(root, 'src/components/StoryView.tsx'), 'utf8');
const apiClient = fs.readFileSync(path.join(root, 'src/services/apiClient.ts'), 'utf8');
const sensoryRoutes = fs.readFileSync(path.join(root, 'server/api/sensoryRoutes.ts'), 'utf8');
const orchestrator = fs.readFileSync(path.join(root, 'server/domain/aiOrchestrator.ts'), 'utf8');

test('Phase 14 MediaRecorder fallback uses ApiClient instead of a raw endpoint', () => {
	assert.match(storyView, /apiClient\.transcribeAudio\(/);
	assert.doesNotMatch(storyView, /fetch\(['"]\/api\/game\/sensory\/transcribe/);
});

test('Phase 14 ApiClient carries story id and recorded MIME type', () => {
	assert.match(apiClient, /transcribeAudio\(params: \{ storyId\?: string; audioBase64: string; audioMimeType\?: string \}/);
	assert.match(apiClient, /audioMimeType: params\.audioMimeType \|\| 'audio\/webm'/);
});

test('Phase 14 route classifies empty, malformed and unavailable transcription states', () => {
	assert.match(sensoryRoutes, /errorCode: 'INPUT_EMPTY'/);
	assert.match(sensoryRoutes, /'INPUT_INVALID_BASE64'/);
	assert.match(sensoryRoutes, /'TRANSCRIPTION_MALFORMED'/);
	assert.match(sensoryRoutes, /'TRANSCRIPTION_UNAVAILABLE'/);
});

test('Phase 14 transcription provider path passes abort signal and audio MIME type', () => {
	assert.match(orchestrator, /abortSignal: abortController\.signal/);
	assert.match(orchestrator, /audioMimeType: params\.audioMimeType \|\| 'audio\/webm'/);
});
