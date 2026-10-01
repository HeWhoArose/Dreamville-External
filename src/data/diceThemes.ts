export const DICE_THEME_IDS = [
	'CLASSIC',
	'ARCANE',
	'CRIMSON',
	'EMERALD',
	'FROST',
	'OBSIDIAN',
	'ROYAL_CROWN',
	'AMETHYST_GOLD',
	'SHADOW_KNIGHT',
	'ENCHANTED_PARCHMENT',
	'2D_PARCHMENT',
	'2D_ARCANE',
	'2D_CRIMSON',
	'2D_EMERALD',
	'2D_FROST',
	'2D_OBSIDIAN',
] as const;

export type DiceThemeId = typeof DICE_THEME_IDS[number];

export type DiceThemeMode = '2D' | '3D';

export type DiceThemeAvailability = 'AVAILABLE' | 'FALLBACK_ONLY' | 'UNAVAILABLE';

export interface CanonicalDiceTheme {
	id: DiceThemeId;
	mode: DiceThemeMode;
	label: string;
	assetPath: string;
	availability: DiceThemeAvailability;
	supportedDiceTypes: readonly ('D4' | 'D6' | 'D8' | 'D10' | 'D12' | 'D20' | 'D100')[];
}

const ALL_DICE_TYPES = ['D4', 'D6', 'D8', 'D10', 'D12', 'D20', 'D100'] as const;

export const CANONICAL_DICE_THEMES: readonly CanonicalDiceTheme[] = [
	{ id: 'CLASSIC', mode: '3D', label: 'Classic Ivory', assetPath: '/assets/dice-box/', availability: 'AVAILABLE', supportedDiceTypes: ALL_DICE_TYPES },
	{ id: 'ARCANE', mode: '3D', label: 'Arcane Violet', assetPath: '/assets/dice-box/', availability: 'AVAILABLE', supportedDiceTypes: ALL_DICE_TYPES },
	{ id: 'CRIMSON', mode: '3D', label: 'Crimson Omen', assetPath: '/assets/dice-box/', availability: 'AVAILABLE', supportedDiceTypes: ALL_DICE_TYPES },
	{ id: 'EMERALD', mode: '3D', label: 'Emerald Relic', assetPath: '/assets/dice-box/', availability: 'AVAILABLE', supportedDiceTypes: ALL_DICE_TYPES },
	{ id: 'FROST', mode: '3D', label: 'Frostglass', assetPath: '/assets/dice-box/', availability: 'AVAILABLE', supportedDiceTypes: ALL_DICE_TYPES },
	{ id: 'OBSIDIAN', mode: '3D', label: 'Obsidian Gold', assetPath: '/assets/dice-box/', availability: 'AVAILABLE', supportedDiceTypes: ALL_DICE_TYPES },
	{ id: 'ROYAL_CROWN', mode: '3D', label: 'Royal Crown', assetPath: '/assets/dice-box/', availability: 'AVAILABLE', supportedDiceTypes: ALL_DICE_TYPES },
	{ id: 'AMETHYST_GOLD', mode: '3D', label: 'Amethyst Gold', assetPath: '/assets/dice-box/', availability: 'AVAILABLE', supportedDiceTypes: ALL_DICE_TYPES },
	{ id: 'SHADOW_KNIGHT', mode: '3D', label: 'Shadow Knight', assetPath: '/assets/dice-box/', availability: 'AVAILABLE', supportedDiceTypes: ALL_DICE_TYPES },
	{ id: 'ENCHANTED_PARCHMENT', mode: '3D', label: 'Enchanted Parchment', assetPath: '/assets/dice-box/', availability: 'AVAILABLE', supportedDiceTypes: ALL_DICE_TYPES },
	{ id: '2D_PARCHMENT', mode: '2D', label: '2D Storybook', assetPath: '', availability: 'AVAILABLE', supportedDiceTypes: ALL_DICE_TYPES },
	{ id: '2D_ARCANE', mode: '2D', label: '2D Arcane Ink', assetPath: '', availability: 'AVAILABLE', supportedDiceTypes: ALL_DICE_TYPES },
	{ id: '2D_CRIMSON', mode: '2D', label: '2D Crimson Comic', assetPath: '', availability: 'AVAILABLE', supportedDiceTypes: ALL_DICE_TYPES },
	{ id: '2D_EMERALD', mode: '2D', label: '2D Emerald Quest', assetPath: '', availability: 'AVAILABLE', supportedDiceTypes: ALL_DICE_TYPES },
	{ id: '2D_FROST', mode: '2D', label: '2D Frost Rune', assetPath: '', availability: 'AVAILABLE', supportedDiceTypes: ALL_DICE_TYPES },
	{ id: '2D_OBSIDIAN', mode: '2D', label: '2D Obsidian Glyph', assetPath: '', availability: 'AVAILABLE', supportedDiceTypes: ALL_DICE_TYPES },
];

export const DEFAULT_DICE_THEME: DiceThemeId = 'CLASSIC';

export function getCanonicalDiceTheme(themeId?: string | null): CanonicalDiceTheme {
	return CANONICAL_DICE_THEMES.find((theme) => theme.id === themeId) || CANONICAL_DICE_THEMES[0];
}

export function isCanonicalDiceTheme(themeId?: string | null): themeId is DiceThemeId {
	return CANONICAL_DICE_THEMES.some((theme) => theme.id === themeId && theme.availability !== 'UNAVAILABLE');
}
