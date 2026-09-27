declare module '@3d-dice/dice-box-threejs' {
	interface DiceBoxConfig {
		framerate?: number;
		sounds?: boolean;
		volume?: number;
		shadows?: boolean;
		color_spotlight?: number;
		sound_dieMaterial?: string;
		theme_customColorset?: unknown;
		theme_colorset?: string;
		theme_texture?: string;
		theme_material?: string;
		gravity_multiplier?: number;
		light_intensity?: number;
		baseScale?: number;
		strength?: number;
		onRollComplete?: (results: unknown) => void;
	}

	interface DiceBoxInstance {
		init(): Promise<void>;
		roll(notation: string): Promise<unknown>;
		add?(notation: string): Promise<unknown>;
		clear?(): void;
		onRollComplete?: (results: unknown) => void;
	}

	const DiceBox: new (selector: string, config: DiceBoxConfig) => DiceBoxInstance;
	export default DiceBox;
}
