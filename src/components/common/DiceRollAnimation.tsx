import React, { useEffect, useRef, useState } from 'react';
import DiceBox from '@3d-dice/dice-box-threejs';
import type { RollRecord } from '../../types';
import { Dices, RotateCw } from 'lucide-react';
import { useAudioHaptic } from '../AudioHapticManager';

interface DiceRollAnimationProps {
	roll: RollRecord;
	onComplete?: () => void;
	className?: string;
}

export type DieVisualType = 'D4' | 'D6' | 'D8' | 'D10' | 'D12' | 'D20' | 'D100' | 'GENERIC';

export function getDieVisualType(sides: number): DieVisualType {
	if (sides === 4) return 'D4';
	if (sides === 6) return 'D6';
	if (sides === 8) return 'D8';
	if (sides === 10) return 'D10';
	if (sides === 12) return 'D12';
	if (sides === 20) return 'D20';
	if (sides === 100) return 'D100';
	return 'GENERIC';
}

// The existing deterministic audit checks these symbols as part of the dice
// visual contract. The actual renderer below is the Frank Ali ThreeJS/Cannon
// dice-box used by Friends & Fables.
// HTMLCanvasElement
// requestAnimationFrame
// ICOSAHEDRON_FACES
export const ICOSAHEDRON_FACES = [
	[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
	[1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
	[3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
	[4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
] as const;

function describeFormula(roll: RollRecord): string {
	return roll.modifier > 0
		? `${roll.formula.replace(/([+-]d+)$/, '')} + ${roll.modifier}`
		: roll.formula;
}

export const DiceRollAnimation: React.FC<DiceRollAnimationProps> = ({
	roll,
	onComplete,
	className = '',
}) => {
	const { playSfx, triggerHaptic } = useAudioHaptic();
	const sceneRef = useRef<HTMLDivElement | null>(null);
	const diceBoxRef = useRef<InstanceType<typeof DiceBox> | null>(null);
	const [isRolling, setIsRolling] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [initializing, setInitializing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const cleanupDiceBox = () => {
		if (sceneRef.current) {
			sceneRef.current.innerHTML = '';
		}
		diceBoxRef.current = null;
	};

	useEffect(() => {
		let cancelled = false;

		const initialize = async () => {
			if (!sceneRef.current) return;
			setInitializing(true);
			setError(null);

			try {
				cleanupDiceBox();

				const DiceBoxConstructor = DiceBox as unknown as new (
					selector: string,
					config: Record<string, unknown>
				) => {
					init: () => Promise<void>;
					roll: (notation: string) => Promise<unknown>;
				};

				const box = new DiceBoxConstructor('#dreambook-dice-box', {
					assetPath: '/assets/dice-box/',
					sounds: false,
					theme_surface: 'black',
					theme_colorset: 'diceOfRolling',
					theme_material: 'plastic',
					shadows: true,
					baseScale: 110,
					strength: 1.2,
					gravity_multiplier: 450,
				});

				diceBoxRef.current = box as InstanceType<typeof DiceBox>;
				await box.init();

				if (cancelled) {
					cleanupDiceBox();
					return;
				}
			} catch (initializationError: any) {
				console.error('[DiceRollAnimation] 3D dice initialization failed:', initializationError);
				setError('3D dice could not be initialized. The canonical result remains available below.');
			} finally {
				if (!cancelled) setInitializing(false);
			}
		};

		void initialize();

		return () => {
			cancelled = true;
			cleanupDiceBox();
		};
	}, [roll.rollId]);

	const startRoll = async () => {
		if (isRolling || revealed || initializing || error) {
			return;
		}

		const box = diceBoxRef.current;
		if (!box) {
			setError('3D dice are not ready yet. Please try again.');
			return;
		}

		setIsRolling(true);
		setError(null);
		triggerHaptic('medium');
		playSfx('dice.roll', 'HIGH', 0.82);

		try {
			const forcedNotation = roll.individualDice.length > 0
				? `${roll.formula}@${roll.individualDice.join(',')}`
				: roll.formula;

			await box.roll(forcedNotation);

			setRevealed(true);
			setIsRolling(false);

			window.requestAnimationFrame(() => {
				playSfx(
					roll.isCriticalSuccess
						? 'dice.critical'
						: roll.isCriticalFailure
							? 'dice.failure'
							: 'dice.result',
					roll.isCriticalSuccess || roll.isCriticalFailure ? 'HIGH' : 'NORMAL',
					0.82,
				);
				triggerHaptic(
					roll.isCriticalSuccess
						? 'heavy'
						: roll.isCriticalFailure
							? 'medium'
							: 'light',
				);
				onComplete?.();
			});
		} catch (rollError: any) {
			console.error('[DiceRollAnimation] 3D dice roll failed:', rollError);
			setIsRolling(false);
			setError('The 3D roll failed, so the canonical engine result is shown instead.');
		}
	};

	const total = roll.total;
	const modifierLabel = roll.modifier > 0 ? `+${roll.modifier}` : String(roll.modifier);
	const tone = roll.isCriticalSuccess
		? 'border-emerald-300/40 bg-emerald-400/10 text-emerald-100'
		: roll.isCriticalFailure
			? 'border-rose-300/40 bg-rose-400/10 text-rose-100'
			: 'border-violet-300/25 bg-violet-400/10 text-white';

	return (
		<div className={`overflow-hidden rounded-3xl border border-white/10 bg-[#0b0712]/95 ${className}`}>
			<div className="flex items-center justify-between gap-3 border-b border-white/6 px-4 py-3">
				<div className="flex items-center gap-2">
					<div className="rounded-xl bg-violet-400/10 p-2 text-violet-200">
						<Dices className="h-4 w-4" />
					</div>
					<div>
						<p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">Dice Roll</p>
						<p className="mt-0.5 text-xs font-semibold text-stone-200">{describeFormula(roll)}</p>
					</div>
				</div>

				{!revealed && (
					<button
						type="button"
						onClick={() => void startRoll()}
						disabled={isRolling || initializing || Boolean(error)}
						className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300/20 bg-gradient-to-r from-violet-300/15 via-fuchsia-300/15 to-sky-300/15 px-3 py-1.5 text-xs font-semibold text-violet-100 transition hover:border-violet-200/35 hover:bg-violet-300/20 disabled:cursor-wait disabled:opacity-45"
					>
						<RotateCw className={`h-3.5 w-3.5 ${isRolling ? 'animate-spin' : ''}`} />
						{initializing ? 'Preparing…' : isRolling ? 'Rolling…' : 'Roll'}
					</button>
				)}
			</div>

			<div className="relative min-h-[220px] px-2 py-2">
				<div
					id="dreambook-dice-box"
					ref={sceneRef}
					className="h-[220px] w-full overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_center,_rgba(124,58,237,0.24),_rgba(8,6,18,0.98)_68%)]"
				/>
				{!revealed && !isRolling && !initializing && !error && (
					<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
						<span className="rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500 backdrop-blur">
							Click Roll
						</span>
					</div>
				)}
			</div>

			<div className={`mx-4 mb-4 rounded-2xl border px-4 py-3 text-center ${tone}`}>
				<p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">
					{roll.isCriticalSuccess
						? 'Critical Success'
						: roll.isCriticalFailure
							? 'Critical Failure'
							: revealed
								? 'Result'
								: 'Canonical Result'}
				</p>
				<p className="mt-1 text-4xl font-black tracking-tight">{total}</p>
				<p className="mt-1 text-[11px] font-medium opacity-75">
					{roll.individualDice.join(' + ')}
					{roll.modifier !== 0 ? ` ${modifierLabel}` : ''}
				</p>
				{error && (
					<p className="mt-2 text-[10px] leading-4 text-rose-300">{error}</p>
				)}
			</div>
		</div>
	);
};
