import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnswerBearingFactsBlock } from '../server/domain/narrativePromptBuilder';

const BLOCKS = [
	{ kind: 'SCENE', content: 'Location: Crimson Eye Agency Office' },
	{ kind: 'KNOWLEDGE', content: 'Arthur Pendelton was_found_dead_at Pier 4 source=document scope=exact Arthur Pendelton was found shot dead on Pier 4.' },
	{ kind: 'KNOWLEDGE', content: 'Inspector Calder warned Crimson Eye Agency source=document scope=exact Inspector Calder has told the agency twice to keep away from the pier.' },
];
const infoIntent = (text: string) => ({ interactionMode: 'INFORMATION_SEEKING', informationGoal: text, originalText: text } as any);

test('an information question gets the matching authorized facts as plain statements', () => {
	const block = buildAnswerBearingFactsBlock(BLOCKS, infoIntent('Where exactly was he found?'));
	assert.match(block, /found shot dead on Pier 4\./);
	assert.match(block, /Do not claim that nobody knows/);
	assert.doesNotMatch(block, /source=document|scope=exact/, 'engine labels must not reach the model');
	assert.doesNotMatch(block, /Location: Crimson Eye/, 'only knowledge blocks are used');
});

test('a non-information action gets no block', () => {
	assert.equal(buildAnswerBearingFactsBlock(BLOCKS, { interactionMode: 'WORLD_ACTION', originalText: 'I walk to the door.' } as any), '');
});

test('an information question with no matching fact gets no block', () => {
	assert.equal(buildAnswerBearingFactsBlock(BLOCKS, infoIntent('What is the weather like tomorrow?')), '');
});
