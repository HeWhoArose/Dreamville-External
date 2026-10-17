import test from 'node:test';
import assert from 'node:assert/strict';
import type { OpeningScene } from '../src/types';
import { isOpeningDialogueSupportedByNarrative } from '../server/domain/openingSceneDialogueEvidence';
import { serverMockAuthority } from '../server/mockEngine/serverMockAuthority';

test('opening dialogue events need textual evidence before they can enter persistent dialogue history', () => {
	const narrativeText = 'Mira Fen greets Elias Thorne with the words, “Welcome inside.” Elias nods and steps into the hall.';
	const supportedEvent = {
		id: 'opening_dialogue_supported',
		type: 'dialogue' as const,
		text: 'Welcome inside.',
		speaker: 'Mira Fen',
	};
	const fabricatedEvent = {
		id: 'opening_dialogue_fabricated',
		type: 'dialogue' as const,
		text: 'The hidden king still lives.',
		speaker: 'Oracle Venn',
	};

	assert.equal(isOpeningDialogueSupportedByNarrative(narrativeText, supportedEvent), true);
	assert.equal(isOpeningDialogueSupportedByNarrative(narrativeText, fabricatedEvent), false);

	const storyId = 'opening_dialogue_provenance_guard_' + Date.now().toString(36);
	const opening: OpeningScene = {
		storyId,
		worldId: 'opening_dialogue_provenance_world',
		worldName: 'Opening Dialogue Provenance Test',
		startingLocationId: 'opening_dialogue_provenance_location',
		startingLocationName: 'The Hall',
		characterId: 'opening_dialogue_provenance_character',
		characterName: 'Elias Thorne',
		characterRole: 'Scholar',
		worldTime: { cycle: 1, period: 'Morning', era: 'Test Era', formattedTime: 'Cycle 1, Morning' },
		startingSituation: 'Elias enters the hall.',
		narrativeText,
		structuredEvents: [
			supportedEvent,
			fabricatedEvent,
		],
		generatedAt: new Date().toISOString(),
		idempotencyKey: 'opening_dialogue_provenance_' + storyId,
	};

	serverMockAuthority.recordOpeningScene(storyId, opening);
	const persistedDialogue = serverMockAuthority.getDynamicStoryState(storyId).dialogueHistory;

	assert.equal(
		persistedDialogue.some((entry: any) => entry.speaker === 'Mira Fen' && entry.text === 'Welcome inside.'),
		true,
		'quoted dialogue explicitly present in the accepted opening may enter dialogue history',
	);
	assert.equal(
		persistedDialogue.some((entry: any) => entry.speaker === 'Oracle Venn' || entry.text === 'The hidden king still lives.'),
		false,
		'unsupported model-supplied dialogue must not become persisted NPC knowledge or history',
	);
});
