import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('story input uses a mobile-safe multiline composer and real microphone flow', () => {
	const story = readFileSync(join(process.cwd(), 'src/components/StoryView.tsx'), 'utf8');
	const sensory = readFileSync(join(process.cwd(), 'server/api/sensoryRoutes.ts'), 'utf8');

	assert.match(story, /className="flex flex-col gap-2 sm:flex-row sm:items-end"/);
	assert.match(story, /<textarea/);
	assert.match(story, /max-h-40 min-w-0 flex-1 resize-none overflow-y-auto/);
	assert.match(story, /SpeechRecognition|webkitSpeechRecognition/);
	assert.doesNotMatch(story, /sample_audio_capture_payload|mock_mic_capture/);
	assert.doesNotMatch(story, /Transcribed text/);
	assert.match(story, /navigator\.mediaDevices\?\.getUserMedia/);
	assert.match(story, /Microphone permission was denied/);
	assert.match(sensory, /if \(!result\.success \|\| !result\.text\.trim\(\)\)/);
	assert.doesNotMatch(sensory, /text: result\.text \|\| 'Transcribed text'/);
});

test('dice settings are visually separated and remain usable on narrow screens', () => {
	const story = readFileSync(join(process.cwd(), 'src/components/StoryView.tsx'), 'utf8');

	assert.match(story, /w-\[min\(24rem,calc\(100vw-1rem\)\)\]/);
	assert.match(story, /space-y-2 rounded-xl border border-amber-200\/10 bg-\[#090611\]\/95/);
	assert.match(story, /min-h-11 w-full items-center gap-3 rounded-lg/);
	assert.match(story, /2D Illustrated/);
	assert.match(story, /3D Physical/);
});
