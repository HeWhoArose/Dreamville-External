export type DiceThemeId = 'CLASSIC' | 'ARCANE' | 'CRIMSON' | 'EMERALD' | 'FROST' | 'OBSIDIAN';

export interface DiceThemePreset {
	id: DiceThemeId;
	label: string;
	description: string;
	material: 'none' | 'metal' | 'wood' | 'glass' | 'plastic';
	spotlight: number;
	previewTable: string;
	customColorset: {
		name: string;
		texture: string;
		background: string;
		foreground: string;
	};
}

export const DEFAULT_DICE_THEME: DiceThemeId = 'CLASSIC';

export const DICE_THEME_PRESETS: readonly DiceThemePreset[] = [
	{
		id: 'CLASSIC',
		label: 'Classic Ivory',
		description: 'Traditional ivory dice with a neutral presentation.',
		material: 'glass',
		spotlight: 0xefdfd5,
		previewTable: 'radial-gradient(circle at 50% 28%, rgba(255,255,255,.16), transparent 22%), linear-gradient(180deg, #243b2b 0%, #0b1e13 100%)',
		customColorset: {
			name: 'dreamville-classic-ivory',
			texture: '',
			background: '#eee8dc',
			foreground: '#2b2520',
			outline: '#ffffff',
		},
	},
	{
		id: 'ARCANE',
		label: 'Arcane Violet',
		description: 'Mystic violet dice with pale arcane lettering.',
		material: 'glass',
		spotlight: 0xd7c6ff,
		previewTable: 'radial-gradient(circle at 50% 25%, rgba(196,181,253,.2), transparent 25%), linear-gradient(180deg, #2b183f 0%, #100818 100%)',
		customColorset: {
			name: 'dreamville-arcane-violet',
			texture: '',
			background: '#4c2a78',
			foreground: '#f3e8ff',
			outline: '#1b1028',
		},
	},
	{
		id: 'CRIMSON',
		label: 'Crimson Omen',
		description: 'Dark crimson dice built for dangerous rolls.',
		material: 'metal',
		spotlight: 0xffb4b4,
		previewTable: 'radial-gradient(circle at 50% 25%, rgba(248,113,113,.16), transparent 25%), linear-gradient(180deg, #45141b 0%, #180709 100%)',
		customColorset: {
			name: 'dreamville-crimson-omen',
			texture: '',
			background: '#7f1d1d',
			foreground: '#ffe4e6',
			outline: '#22080d',
		},
	},
	{
		id: 'EMERALD',
		label: 'Emerald Relic',
		description: 'Deep green dice with warm parchment numbers.',
		material: 'plastic',
		spotlight: 0xc4ffd5,
		previewTable: 'radial-gradient(circle at 50% 25%, rgba(52,211,153,.18), transparent 25%), linear-gradient(180deg, #123d2b 0%, #071810 100%)',
		customColorset: {
			name: 'dreamville-emerald-relic',
			texture: '',
			background: '#14532d',
			foreground: '#ecfccb',
			outline: '#06120b',
		},
	},
	{
		id: 'FROST',
		label: 'Frostglass',
		description: 'Cold blue dice for frozen or arcane scenes.',
		material: 'glass',
		spotlight: 0xd7f3ff,
		previewTable: 'radial-gradient(circle at 50% 25%, rgba(125,211,252,.2), transparent 25%), linear-gradient(180deg, #12344a 0%, #07131d 100%)',
		customColorset: {
			name: 'dreamville-frostglass',
			texture: '',
			background: '#164e63',
			foreground: '#e0f2fe',
			outline: '#06131d',
		},
	},
	{
		id: 'OBSIDIAN',
		label: 'Obsidian Gold',
		description: 'Black metallic dice with gold face marks.',
		material: 'metal',
		spotlight: 0xffe7a8,
		previewTable: 'radial-gradient(circle at 50% 25%, rgba(251,191,36,.15), transparent 25%), linear-gradient(180deg, #29241b 0%, #090806 100%)',
		customColorset: {
			name: 'dreamville-obsidian-gold',
			texture: '',
			background: '#18181b',
			foreground: '#f6d88b',
			outline: '#050505',
		},
	},
];

export function getDiceThemePreset(themeId?: string | null): DiceThemePreset {
	return DICE_THEME_PRESETS.find((theme) => theme.id === themeId) || DICE_THEME_PRESETS[0];
}
