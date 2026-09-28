import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { RollRecord } from '../../types';
import { Dices, Loader2, RotateCw } from 'lucide-react';
import { useAudioHaptic } from '../AudioHapticManager';

interface DiceRollAnimationProps {
	roll: RollRecord;
	onComplete?: () => void;
	className?: string;
	title?: string;
	subtitle?: string;
	defenseLabel?: string;
	defenseValue?: number | string;
	outcome?: string;
	resultSuffix?: string;
	showRollButton?: boolean;
	autoReveal?: boolean;
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

export function expandDiceTerms(roll: RollRecord): number[] {
	if (roll.diceTerms?.length) {
		return roll.diceTerms.flatMap((term) =>
			Array.from({ length: Math.max(1, term.count) }, () => Math.max(2, term.sides))
		);
	}

	const dice = roll.formula.match(/(\d*)d(\d+)/gi);
	if (!dice?.length) return [20];

	return dice.flatMap((term) => {
		const match = term.match(/(\d*)d(\d+)/i);
		const count = Math.max(1, Number(match?.[1] || 1));
		const sides = Math.max(2, Number(match?.[2] || 20));
		return Array.from({ length: count }, () => sides);
	});
}

export function expandDiceGroups(
	roll: Pick<RollRecord, 'diceTerms' | 'formula'>,
	individualDice: number[],
): Array<{ count: number; sides: number; values: number[] }> {
	if (roll.diceTerms?.length) {
		let offset = 0;
		return roll.diceTerms.map((term) => {
			const count = Math.max(1, term.count);
			const values = individualDice.slice(offset, offset + count);
			offset += count;
			return {
				count,
				sides: Math.max(2, term.sides),
				values,
			};
		});
	}

	const groups = roll.formula.match(/(\d*)d(\d+)/gi);
	if (!groups?.length) {
		return [{
			count: 1,
			sides: 20,
			values: [individualDice[0] || 1],
		}];
	}

	let offset = 0;
	return groups.map((term) => {
		const match = term.match(/(\d*)d(\d+)/i);
		const count = Math.max(1, Number(match?.[1] || 1));
		const sides = Math.max(2, Number(match?.[2] || 20));
		const values = individualDice.slice(offset, offset + count);
		offset += count;
		return { count, sides, values };
	});
}

function resultTone(roll: RollRecord): string {
	if (roll.isCriticalSuccess) {
		return 'border-emerald-300/40 bg-emerald-400/10 text-emerald-100 shadow-[0_0_45px_rgba(16,185,129,0.22)]';
	}
	if (roll.isCriticalFailure) {
		return 'border-rose-300/40 bg-rose-400/10 text-rose-100 shadow-[0_0_45px_rgba(244,63,94,0.22)]';
	}
	return 'border-violet-300/25 bg-gradient-to-br from-violet-500/15 via-fuchsia-500/10 to-sky-500/10 text-white shadow-[0_0_45px_rgba(139,92,246,0.16)]';
}

export const DiceRollAnimation: React.FC<DiceRollAnimationProps> = ({
	roll,
	onComplete,
	className = '',
	title,
	subtitle,
	defenseLabel,
	defenseValue,
	outcome,
	resultSuffix,
	showRollButton = true,
	autoReveal = false,
}) => {
	const { playSfx, triggerHaptic } = useAudioHaptic();
	const containerId = useId().replace(/:/g, '');
	const diceBoxRef = useRef<any>(null);
	const initializationRef = useRef<Promise<any> | null>(null);
	const [isInitializing, setIsInitializing] = useState(true);
	const [isRolling, setIsRolling] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [useCssFallback, setUseCssFallback] = useState(false);
	const autoRollStartedRef = useRef(false);

	const diceSides = useMemo(() => expandDiceTerms(roll), [roll]);

	const formulaWithoutModifier = useMemo(() => {
		const formula = roll.formula.replace(/[+-]\d+$/, '');
		return formula || '1d20';
	}, [roll.formula]);

	const initializeDiceBox = async () => {
		if (diceBoxRef.current) return diceBoxRef.current;
		if (initializationRef.current) return initializationRef.current;

		initializationRef.current = (async () => {
			const module = await import('@3d-dice/dice-box-threejs');
			const DiceBox = module.default;
			try {
				const box = new DiceBox(`#${containerId}`, {
					assetPath: '/assets/dice-box/',
					framerate: 1 / 60,
					sounds: false,
					volume: 0,
					shadows: true,
					theme_surface: 'green-felt',
					theme_colorset: 'white',
					theme_material: 'plastic',
					gravity_multiplier: 400,
					light_intensity: 0.78,
					baseScale: 92,
					strength: 1.15,
				});
				await box.initialize();
				diceBoxRef.current = box;
				setIsInitializing(false);
				setUseCssFallback(false);
				return box;
			} catch (primaryError) {
				// The engine is still the authoritative visual dice system, but a missing
				// theme asset must never leave the player with a broken roll card.
				console.warn('[DiceRollAnimation] 3D theme initialization failed; using CSS presentation fallback.', primaryError);
				setUseCssFallback(true);
				setError(null);
				setIsInitializing(false);
				return null;
			}
		})().catch((err) => {
			initializationRef.current = null;
			setIsInitializing(false);
			setUseCssFallback(true);
			setError(null);
			return null;
		});

		return initializationRef.current;
	};

	useEffect(() => {
		let disposed = false;
		initializeDiceBox().catch((err) => {
			if (!disposed) {
				setError(err?.message || 'The 3D dice engine failed to initialize.');
			}
		});

		return () => {
			disposed = true;
			try {
				diceBoxRef.current?.clear?.();
			} catch {
				// The upstream package does not expose a formal dispose API.
			}
			diceBoxRef.current = null;
		};
	}, []);

	useEffect(() => {
		autoRollStartedRef.current = false;
		setRevealed(false);
		setError(null);
		setIsRolling(false);
		try {
			diceBoxRef.current?.clear?.();
		} catch {
			// Best-effort visual reset.
		}
	}, [roll.rollId]);

	const startRoll = async () => {
		if (isRolling || revealed || isInitializing) return;

		setIsRolling(true);
		setError(null);
		triggerHaptic('medium');
		playSfx('dice.roll', 'HIGH', 0.82);

		try {
			const box = await initializeDiceBox();

			if (!box || useCssFallback) {
				await new Promise((resolve) => setTimeout(resolve, 1150));
			} else if (!roll.individualDice.length) {
				await box.roll(formulaWithoutModifier);
			} else {
				const predeterminedValues = [...roll.individualDice];
				const groups = expandDiceGroups(roll, predeterminedValues);

				// The upstream engine is physically simulated, but it also supports
				// deterministic landed faces through the @value,value notation.
				// That lets the visual throw remain physical while the authoritative
				// server result is preserved exactly.
				for (let index = 0; index < groups.length; index += 1) {
					const group = groups[index];
					const values = predeterminedValues.splice(0, group.count);
					const notation = values.length === group.count
						? `${group.count}d${group.sides}@${values.join(',')}`
						: `${group.count}d${group.sides}`;

					if (index === 0) {
						await box.roll(notation);
					} else if (typeof box.add === 'function') {
						await box.add(notation);
					} else {
						await box.roll(notation);
					}
				}
			}

			setRevealed(true);
			setIsRolling(false);
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
		} catch (err: any) {
			setIsRolling(false);
			setError(err?.message || 'The 3D dice roll could not be completed.');
		}
	};

	useEffect(() => {
		if (autoReveal && !isInitializing && !autoRollStartedRef.current && !isRolling && !revealed) {
			autoRollStartedRef.current = true;
			void startRoll();
		}
	}, [autoReveal, isInitializing, isRolling, revealed]);

	const modifier = roll.modifier || 0;
	const modifierLabel = modifier > 0 ? `+${modifier}` : String(modifier);
	const diceTotal = roll.individualDice.reduce((sum, value) => sum + value, 0);
	const total = roll.total;
	const tone = resultTone(roll);
	const headerTitle = title || 'Physical Dice';
	const headerSubtitle = subtitle || roll.formula;
	const buttonVisible = showRollButton !== false;

	return (
		<div className={`overflow-hidden rounded-3xl border border-white/10 bg-[#090616]/95 ${className}`}>
			<div className="flex items-center justify-between gap-3 border-b border-white/8 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/8 to-sky-500/8 px-4 py-3">
				<div className="flex min-w-0 items-center gap-2.5">
					<div className="rounded-xl border border-violet-300/15 bg-violet-400/10 p-2 text-violet-100">
						<Dices className="h-4 w-4" />
					</div>
					<div className="min-w-0">
						<p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200/60">{headerTitle}</p>
						<p className="mt-0.5 truncate text-xs font-semibold text-white">{headerSubtitle}</p>
					</div>
				</div>

				{buttonVisible && (
					<button
						type="button"
						onClick={startRoll}
						disabled={isInitializing || isRolling || revealed}
						className="inline-flex items-center gap-1.5 rounded-xl border border-fuchsia-300/20 bg-gradient-to-r from-violet-400/15 to-fuchsia-400/15 px-3 py-1.5 text-xs font-semibold text-violet-50 transition hover:from-violet-400/25 hover:to-fuchsia-400/25 disabled:cursor-wait disabled:opacity-45"
					>
						{isInitializing || isRolling ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<RotateCw className="h-3.5 w-3.5" />
						)}
						{isInitializing ? 'Loading…' : isRolling ? 'Rolling…' : revealed ? 'Rolled' : 'Roll'}
					</button>
				)}
			</div>

			<div
				id={containerId}
				className="relative h-64 overflow-hidden bg-[radial-gradient(circle_at_50%_28%,rgba(255,255,255,0.12),transparent_22%),radial-gradient(circle_at_50%_40%,rgba(52,104,76,0.34),transparent_62%),linear-gradient(180deg,#173625 0%,#0b2116 100%)]"
				aria-label={`3D physical dice table for ${roll.formula}`}
			>
				{useCssFallback && (
					<div className="absolute inset-0 flex items-center justify-center">
						<div className={`relative flex h-28 w-28 items-center justify-center rounded-[24px] border-2 border-white/30 bg-gradient-to-br from-white via-stone-100 to-stone-300 text-5xl font-black text-stone-900 shadow-[0_24px_55px_rgba(0,0,0,0.45)] ${isRolling ? 'animate-[dice-throw_1150ms_cubic-bezier(.2,.8,.25,1)]' : ''}`}>
							<span>{revealed ? (roll.individualDice[0] ?? total) : 'D20'}</span>
							<div className="absolute inset-[6px] rounded-[18px] border border-stone-400/30" />
						</div>
					</div>
				)}
				<div className="pointer-events-none absolute inset-x-5 bottom-4 h-10 rounded-[50%] bg-black/30 blur-xl" />
				{!revealed && !isRolling && (
					<div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-5">
						<span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.22em] text-white/60 backdrop-blur-sm">
							{isInitializing ? 'Preparing the table…' : 'Tap Roll to throw'}
						</span>
					</div>
				)}
			</div>

			<div className="grid grid-cols-2 gap-2 border-t border-white/8 bg-black/20 px-4 py-3 sm:grid-cols-4">
				{diceSides.slice(0, 8).map((sides, index) => (
					<div key={`${roll.rollId}-${index}`} className="rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2 text-center">
						<p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">D{sides}</p>
						<p className={`mt-0.5 text-lg font-black ${revealed ? 'text-white' : 'text-stone-600'}`}>
							{revealed ? roll.individualDice[index] ?? '—' : '•'}
						</p>
					</div>
				))}
			</div>

			{(defenseLabel || defenseValue !== undefined || outcome) && (
				<div className="grid grid-cols-3 gap-2 border-t border-white/8 bg-black/15 px-4 py-3 text-center">
					{defenseLabel && (
						<div>
							<p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-500">{defenseLabel}</p>
							<p className="mt-0.5 text-sm font-black text-white">{defenseValue ?? '—'}</p>
						</div>
					)}
					<div>
						<p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-500">Outcome</p>
						<p className="mt-0.5 text-sm font-black text-white">{outcome || (revealed ? 'RESULT' : 'READY')}</p>
					</div>
					<div>
						<p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-500">Formula</p>
						<p className="mt-0.5 text-sm font-black text-white">{roll.formula}</p>
					</div>
				</div>
			)}

			<div className={`mx-auto max-w-sm border-t border-white/8 px-4 py-4 text-center ${tone}`}>
				<p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">
					{roll.isCriticalSuccess
						? 'Critical Success'
						: roll.isCriticalFailure
							? 'Critical Failure'
							: revealed
								? 'Result'
								: 'Awaiting Roll'}
				</p>
				{revealed ? (
					<>
						<p className="mt-1 text-4xl font-black tracking-tight">{total}</p>
						<p className="mt-1 text-[11px] font-medium opacity-75">
							{diceTotal}
							{modifier !== 0 ? ` ${modifierLabel}` : ''}
							{modifier !== 0 ? ` = ${total}` : ''}
							{resultSuffix ? ` ${resultSuffix}` : ''}
						</p>
					</>
				) : (
					<p className="mt-1 text-sm font-semibold opacity-70">The physical result will be revealed when the dice settle.</p>
				)}
			</div>

			{error && !useCssFallback && (
				<div className="border-t border-rose-400/10 bg-rose-400/5 px-4 py-3 text-xs text-rose-200">
					{error}
				</div>
			)}

<style>{`
			@keyframes dice-throw {
				0% { transform: translate3d(-36px,-22px,0) rotate(-24deg) scale(.72); }
				25% { transform: translate3d(26px,-48px,0) rotate(120deg) scale(.9); }
				55% { transform: translate3d(-12px,-8px,0) rotate(255deg) scale(1.02); }
				78% { transform: translate3d(8px,6px,0) rotate(330deg) scale(.98); }
				100% { transform: translate3d(0,0,0) rotate(360deg) scale(1); }
			}
		`}</style>
		</div>
	);
};
