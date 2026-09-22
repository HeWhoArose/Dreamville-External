export type RulesModeLike = 'FULL_DND' | 'HYBRID_DND' | 'CUSTOM_HOMEBREW_DND';

export const DEFAULT_DND_CHECK_FORMULA = '1d20';

const DICE_FORMULA_RE = /^(\d+)d(\d+)([+-]\d+)?$/i;

export function isDiceFormula(value: unknown): boolean {
	if (typeof value !== 'string') return false;
	const match = value.trim().match(DICE_FORMULA_RE);
	if (!match) return false;
	const count = Number(match[1]);
	const sides = Number(match[2]);
	return Number.isInteger(count) && count >= 1 && count <= 20 &&
		Number.isInteger(sides) && sides >= 2 && sides <= 100;
}

export function normalizeDiceFormula(value: unknown, fallback = DEFAULT_DND_CHECK_FORMULA): string {
	if (isDiceFormula(value)) return String(value).trim().toLowerCase();
	return fallback;
}

export function resolveSkillCheckFormula(
	mode: RulesModeLike = 'FULL_DND',
	requestedFormula?: string
): string {
	if (mode === 'FULL_DND') return DEFAULT_DND_CHECK_FORMULA;
	return normalizeDiceFormula(requestedFormula, DEFAULT_DND_CHECK_FORMULA);
}

export function resolveCapabilityCheckFormula(
	mode: RulesModeLike = 'FULL_DND',
	requestedFormula?: string
): string {
	if (mode === 'FULL_DND') return DEFAULT_DND_CHECK_FORMULA;
	return normalizeDiceFormula(requestedFormula, DEFAULT_DND_CHECK_FORMULA);
}
