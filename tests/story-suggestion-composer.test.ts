import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSuggestedActionText } from '../src/utils/storyActionComposer';

test('suggestion insertion populates the composer without submitting the action', () => {
	assert.equal(
		mergeSuggestedActionText('', 'I carefully inspect the structure.'),
		'I carefully inspect the structure.'
	);
	assert.equal(
		mergeSuggestedActionText('I draw my sword.', 'I move toward cover.'),
		'I draw my sword. I move toward cover.'
	);
	assert.equal(
		mergeSuggestedActionText(' existing action ', '   '),
		' existing action '
	);
});
