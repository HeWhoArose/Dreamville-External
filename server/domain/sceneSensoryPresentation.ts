/**
 * Converts optional structured sensory metadata into player-facing prose that
 * agrees with the canonical time phase. Used only for presentation projections;
 * it never mutates the canonical scene description or world clock.
 */
export function normalizeSceneSensoryForTime(raw: string | undefined | null, timeContext: string | undefined | null): string {
	const source = String(raw || '').trim();
	if (!source) return '';

	const phase = String(timeContext || '').match(/\b(Predawn|Dawn|Morning|Afternoon|Dusk|Night)\b/i)?.[1]?.toLowerCase() || '';
	const firstLightReplacement = ['predawn', 'dawn', 'morning'].includes(phase)
		? 'early light'
		: phase === 'afternoon'
			? 'late-afternoon light'
			: phase === 'dusk'
				? 'fading light'
				: 'the available light';
	const morningLightReplacement = phase === 'afternoon'
		? 'afternoon light'
		: phase === 'dusk'
			? 'fading light'
			: phase === 'night'
				? 'the available light'
				: 'early light';
	const repairTime = (value: string) => value
		.replace(/\bfirst light\b/gi, firstLightReplacement)
		.replace(/\bmorning light\b/gi, morningLightReplacement)
		.replace(/\bmorning chill\b/gi, phase === 'afternoon' ? 'afternoon air' : 'cool air')
		.replace(/No visible occupants are currently established in the canonical scene projection; this alone does not mean the location is abandoned\.?/gi, 'No one is clearly visible nearby.')
		.replace(/\s+/g, ' ')
		.trim();

	const fields: Record<string, string> = {};
	const fieldPattern = /\b(Visual|Sounds?|Scent|Tactile)\s*:\s*([\s\S]*?)(?=\s+\b(?:Visual|Sounds?|Scent|Tactile)\s*:|$)/gi;
	for (const match of source.matchAll(fieldPattern)) {
		fields[String(match[1]).toLowerCase()] = repairTime(String(match[2] || '').trim().replace(/[.\s]+$/, ''));
	}

	const visual = fields.visual || '';
	const sounds = (fields.sound || fields.sounds || '').trim();
	const scent = (fields.scent || '').trim();
	const tactile = (fields.tactile || '').trim();
	if (visual || sounds || scent || tactile) {
		const sentences: string[] = [];
		if (visual) sentences.push(visual.charAt(0).toUpperCase() + visual.slice(1).replace(/[.]+$/, '') + '.');
		if (sounds) sentences.push(/^distant atmosphere$/i.test(sounds)
			? 'Distant atmospheric sounds drift across the outskirts.'
			: 'Nearby, ' + sounds.charAt(0).toLowerCase() + sounds.slice(1).replace(/[.]+$/, '') + ' can be heard.');
		if (scent) sentences.push('The air carries the scent of ' + scent.charAt(0).toLowerCase() + scent.slice(1).replace(/[.]+$/, '') + '.');
		if (tactile) sentences.push(/^firm earth$/i.test(tactile)
			? 'Firm earth holds beneath your feet.'
			: 'You feel ' + tactile.charAt(0).toLowerCase() + tactile.slice(1).replace(/[.]+$/, '') + '.');
		return sentences.join(' ');
	}

	return repairTime(source)
		.replace(/\b(?:Visual|Sounds?|Scent|Tactile)\s*:\s*/gi, '')
		.replace(/\s+/g, ' ')
		.trim();
}
