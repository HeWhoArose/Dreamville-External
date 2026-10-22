/**
 * Removes stale labeled sensory cues that contradict the authoritative world-clock phase.
 *
 * Ambient metadata is often authored before play and may survive across many turns.
 * It is descriptive context, not authority to override the current clock.
 */
const FORBIDDEN_AMBIENT_TIME_PHRASES: Record<string, string[]> = {
	Predawn: ['sunset', 'dusk', 'afternoon', 'midday', 'noon', 'night', 'midnight'],
	Dawn: ['sunset', 'dusk', 'afternoon', 'midday', 'noon', 'midnight'],
	Morning: ['first light', 'dawn', 'predawn', 'sunset', 'dusk', 'midnight', 'late evening'],
	Afternoon: ['first light', 'daybreak', 'dawn', 'predawn', 'sunrise', 'midnight', 'early morning', 'morning'],
	Dusk: ['first light', 'daybreak', 'dawn', 'predawn', 'sunrise', 'midday', 'noon', 'early morning', 'morning'],
	Night: ['first light', 'daybreak', 'dawn', 'sunrise', 'morning', 'afternoon', 'midday', 'noon', 'sunset'],
};

export function sanitizeAmbientSensoryForCurrentPhase(
	ambientSensory: string | undefined | null,
	currentDayPhase: string,
): string {
	const raw = String(ambientSensory || '').trim();
	if (!raw || !/\b(?:Visual|Sounds|Scent|Tactile)\s*:/i.test(raw)) return raw;

	const forbiddenPhrases = FORBIDDEN_AMBIENT_TIME_PHRASES[currentDayPhase] || [];
	return raw.split(/(?=\b(?:Visual|Sounds|Scent|Tactile)\s*:)/i)
		.map((section) => {
			const match = section.trim().match(/^(Visual|Sounds|Scent|Tactile)\s*:\s*([^\n.]+)/i);
			if (!match) return '';
			const normalized = ' ' + match[2].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
			if (forbiddenPhrases.some((phrase) => normalized.includes(' ' + phrase + ' '))) return '';
			return match[1] + ': ' + match[2].trim();
		})
		.filter(Boolean)
		.join('. ');
}
