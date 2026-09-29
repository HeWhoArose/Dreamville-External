export type DiceThemeMode = '3D' | '2D';

export type DiceThemeId =
	| 'CLASSIC'
	| 'ARCANE'
	| 'CRIMSON'
	| 'EMERALD'
	| 'FROST'
	| 'OBSIDIAN'
	| '2D_PARCHMENT'
	| '2D_ARCANE'
	| '2D_CRIMSON'
	| '2D_EMERALD'
	| '2D_FROST'
	| '2D_OBSIDIAN';

export interface DiceThemePreset {
	id: DiceThemeId;
	mode: DiceThemeMode;
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
		outline: string;
	};
}

export const DEFAULT_DICE_THEME: DiceThemeId = 'CLASSIC';

export const DICE_THEME_PRESETS: readonly DiceThemePreset[] = [
	{
		id: 'CLASSIC',
		mode: '3D',
		label: 'Classic Ivory',
		description: 'Traditional ivory dice with a neutral physical-table presentation.',
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
		mode: '3D',
		label: 'Arcane Violet',
		description: 'Mystic violet 3D dice with pale arcane lettering.',
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
		mode: '3D',
		label: 'Crimson Omen',
		description: 'Dark crimson 3D dice built for dangerous rolls.',
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
		mode: '3D',
		label: 'Emerald Relic',
		description: 'Deep green 3D dice with warm parchment numbers.',
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
		mode: '3D',
		label: 'Frostglass',
		description: 'Cold blue 3D dice for frozen or arcane scenes.',
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
		mode: '3D',
		label: 'Obsidian Gold',
		description: 'Black metallic 3D dice with gold face marks.',
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

	{
		id: '2D_PARCHMENT',
		mode: '2D',
		label: '2D Storybook',
		description: 'Flat illustrated parchment dice with a hand-drawn tabletop feel.',
		material: 'none',
		spotlight: 0,
		previewTable: 'radial-gradient(circle at 50% 20%, rgba(255,246,214,.18), transparent 32%), linear-gradient(180deg, #3d2d1d 0%, #16100b 100%)',
		customColorset: {
			name: 'dreamville-2d-storybook',
			texture: '',
			background: '#d9bd82',
			foreground: '#2a1b10',
			outline: '#f7e4b4',
		},
	},
	{
		id: '2D_ARCANE',
		mode: '2D',
		label: '2D Arcane Ink',
		description: 'Flat violet dice styled like illuminated spellbook panels.',
		material: 'none',
		spotlight: 0,
		previewTable: 'radial-gradient(circle at 50% 20%, rgba(196,181,253,.18), transparent 30%), linear-gradient(180deg, #27173b 0%, #0c0812 100%)',
		customColorset: {
			name: 'dreamville-2d-arcane',
			texture: '',
			background: '#6d43a8',
			foreground: '#fff7ff',
			outline: '#d8b4ff',
		},
	},
	{
		id: '2D_CRIMSON',
		mode: '2D',
		label: '2D Crimson Comic',
		description: 'Bold flat red dice with comic-panel contrast and inked edges.',
		material: 'none',
		spotlight: 0,
		previewTable: 'radial-gradient(circle at 50% 20%, rgba(248,113,113,.16), transparent 30%), linear-gradient(180deg, #3b0d14 0%, #110407 100%)',
		customColorset: {
			name: 'dreamville-2d-crimson',
			texture: '',
			background: '#a52432',
			foreground: '#fff1f2',
			outline: '#ffd0d5',
		},
	},
	{
		id: '2D_EMERALD',
		mode: '2D',
		label: '2D Emerald Quest',
		description: 'Flat forest-green dice with a bright illustrated relic finish.',
		material: 'none',
		spotlight: 0,
		previewTable: 'radial-gradient(circle at 50% 20%, rgba(52,211,153,.18), transparent 30%), linear-gradient(180deg, #103725 0%, #06130d 100%)',
		customColorset: {
			name: 'dreamville-2d-emerald',
			texture: '',
			background: '#198754',
			foreground: '#efffe8',
			outline: '#b8f0be',
		},
	},
	{
		id: '2D_FROST',
		mode: '2D',
		label: '2D Frost Rune',
		description: 'Flat icy-blue dice with crisp rune-like highlights.',
		material: 'none',
		spotlight: 0,
		previewTable: 'radial-gradient(circle at 50% 20%, rgba(125,211,252,.2), transparent 30%), linear-gradient(180deg, #12354a 0%, #07121a 100%)',
		customColorset: {
			name: 'dreamville-2d-frost',
			texture: '',
			background: '#2387aa',
			foreground: '#effaff',
			outline: '#b9ecff',
		},
	},
	{
		id: '2D_OBSIDIAN',
		mode: '2D',
		label: '2D Obsidian Glyph',
		description: 'Flat near-black dice with warm glyph-like gold numbering.',
		material: 'none',
		spotlight: 0,
		previewTable: 'radial-gradient(circle at 50% 20%, rgba(251,191,36,.15), transparent 30%), linear-gradient(180deg, #282116 0%, #080705 100%)',
		customColorset: {
			name: 'dreamville-2d-obsidian',
			texture: '',
			background: '#24201a',
			foreground: '#f8df9b',
			outline: '#d6ad58',
		},
	},
];

export function getDiceThemePreset(themeId?: string | null): DiceThemePreset {
	return DICE_THEME_PRESETS.find((theme) => theme.id === themeId) || DICE_THEME_PRESETS[0];
}
