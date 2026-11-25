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

import { buildTravelDirective, defaultNarrationStyle } from '../server/domain/narrativePromptBuilder';

test('an information block tells the model to answer in the first sentence and not to open with ambience', () => {
	const block = buildAnswerBearingFactsBlock(BLOCKS, infoIntent('Where exactly was he found?'));
	assert.match(block, /first sentence/i);
	assert.match(block, /weather|ambient/i);
});

test('a movement turn gets a directive naming the destination and forbidding arrival', () => {
	const directive = buildTravelDirective({ movementIntent: true, locationTarget: { name: 'Warehouse Docks Pier 4' } } as any, 'Crimson Eye Agency Office');
	assert.match(directive, /Warehouse Docks Pier 4/);
	assert.match(directive, /Crimson Eye Agency Office/);
	assert.match(directive, /Do not describe arriving/i);
});

test('no travel directive without a movement intent or a named destination', () => {
	assert.equal(buildTravelDirective({ movementIntent: false, locationTarget: { name: 'Docks' } } as any, 'Office'), '');
	assert.equal(buildTravelDirective({ movementIntent: true } as any, 'Office'), '');
});

test('the default narration style fixes language and person (a live reply came back in Hindi, others in first person)', () => {
	const style = defaultNarrationStyle();
	assert.match(style, /language of the player action/i);
	assert.match(style, /"you"/);
	assert.match(style, /never narrate as the player in the first person/i);
});
