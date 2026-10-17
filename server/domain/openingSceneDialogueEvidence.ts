/**
 * Opening-scene dialogue events are a secondary structured projection of the
 * accepted prose. They must never introduce speech or a speaker that the player
 * could not actually have read in that prose.
 */
function normalizeDialogueEvidence(value: unknown): string {
	return String(value || '')
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[\p{P}\p{S}]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function containsNormalizedPhrase(haystack: string, phrase: string): boolean {
	return Boolean(phrase) && (` ${haystack} `).includes(` ${phrase} `);
}

export function isOpeningDialogueSupportedByNarrative(
	narrativeText: unknown,
	event: { text?: unknown; speaker?: unknown },
): boolean {
	const narrative = normalizeDialogueEvidence(narrativeText);
	const speech = normalizeDialogueEvidence(event.text);
	if (!narrative || !speech || !containsNormalizedPhrase(narrative, speech)) return false;

	const speaker = normalizeDialogueEvidence(event.speaker);
	return !speaker || speaker === 'narrator' || containsNormalizedPhrase(narrative, speaker);
}
