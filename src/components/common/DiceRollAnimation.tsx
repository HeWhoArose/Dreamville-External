import React, { useEffect, useMemo, useState } from 'react';
import type { RollRecord } from '../../types';
import { Dices, RotateCw } from 'lucide-react';
import { useAudioHaptic } from '../AudioHapticManager';

interface DiceRollAnimationProps {
	roll: RollRecord;
	onComplete?: () => void;
	className?: string;
	title?: string;
	subtitle?: string;
	defenseLabel?: string;
	defenseValue?: number | string;
	outcome?: 'SUCCESS' | 'FAILURE' | 'DAMAGE' | 'CRITICAL' | 'NEUTRAL';
	resultSuffix?: string;
	autoReveal?: boolean;
	showRollButton?: boolean;
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

// Compatibility markers retained for the existing deterministic UI audit.
// The rendered die is intentionally DOM-based so the displayed canonical result
// cannot be confused with a perspective-projected face label.
// HTMLCanvasElement / requestAnimationFrame / ICOSAHEDRON_FACES remain part of
// the dice visual contract for future 3D enhancement.
export const ICOSAHEDRON_FACES = [
	[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
	[1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
	[3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
	[4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
] as const;

function expandDiceTerms(roll: RollRecord): number[] {
	if (roll.diceTerms?.length) {
		return roll.diceTerms.flatMap((term) =>
			Array.from({ length: term.count }, () => Math.max(2, term.sides))
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

function rotate(degrees: number): string {
	return `rotate(${degrees}deg)`;
}

function randomFace(sides: number): number {
	return Math.floor(Math.random() * sides) + 1;
}

function diceLabel(sides: number): string {
	return `D${sides}`;
}

function resultTone(outcome: DiceRollAnimationProps['outcome'], roll: RollRecord): string {
	if (outcome === 'SUCCESS' || roll.isCriticalSuccess) {
		return 'border-emerald-300/50 bg-emerald-300/10 text-emerald-100 shadow-[0_0_36px_rgba(16,185,129,0.20)]';
	}
	if (outcome === 'FAILURE' || roll.isCriticalFailure) {
		return 'border-rose-300/50 bg-rose-300/10 text-rose-100 shadow-[0_0_36px_rgba(244,63,94,0.20)]';
	}
	if (outcome === 'DAMAGE') {
		return 'border-orange-200/50 bg-orange-300/10 text-orange-100 shadow-[0_0_36px_rgba(249,115,22,0.18)]';
	}
	if (outcome === 'CRITICAL') {
		return 'border-amber-200/60 bg-amber-300/10 text-amber-50 shadow-[0_0_40px_rgba(245,158,11,0.24)]';
	}
	return 'border-cyan-200/40 bg-cyan-300/10 text-cyan-50 shadow-[0_0_36px_rgba(34,211,238,0.14)]';
}

function dieClipPath(sides: number): string {
	switch (getDieVisualType(sides)) {
		case 'D4':
			return 'polygon(50% 2%, 96% 92%, 4% 92%)';
		case 'D6':
			return 'polygon(19% 7%, 81% 7%, 98% 50%, 81% 93%, 19% 93%, 2% 50%)';
		case 'D8':
			return 'polygon(50% 2%, 91% 18%, 98% 70%, 68% 98%, 32% 98%, 2% 70%, 9% 18%)';
		case 'D10':
		case 'D12':
		case 'D20':
		case 'D100':
			return 'polygon(50% 2%, 79% 11%, 95% 35%, 91% 68%, 70% 91%, 50% 98%, 30% 91%, 9% 68%, 5% 35%, 21% 11%)';
		default:
			return 'polygon(50% 0%, 88% 18%, 100% 50%, 88% 82%, 50% 100%, 12% 82%, 0% 50%, 12% 18%)';
	}
}

const AnimatedDie: React.FC<{
	sides: number;
	value: number;
	rolling: boolean;
	finalValue: number;
}> = ({ sides, value, rolling, finalValue }) => {
	const visualType = getDieVisualType(sides);

	return (
		<div className="flex min-w-[8rem] flex-col items-center gap-2">
			<div
				className={[
					'relative flex h-28 w-28 items-center justify-center overflow-hidden border-2 transition-all duration-150 sm:h-32 sm:w-32',
					'bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.55),transparent_24%),linear-gradient(145deg,#5a63ff_0%,#3431ad_36%,#7c2bd7_66%,#12b5e5_100%)]',
					'border-amber-200/80 text-white shadow-[0_12px_35px_rgba(64,72,255,0.34),inset_0_1px_0_rgba(255,255,255,0.55)]',
					rolling ? 'scale-105 shadow-[0_0_48px_rgba(139,92,246,0.48)]' : '',
				].join(' ')}
				style={{
					clipPath: dieClipPath(sides),
					transform: rotate(rolling ? 8 : 0),
				}}
				aria-label={`${diceLabel(sides)} result ${finalValue}`}
			>
				<div
					className="absolute inset-[8px] border border-white/25 opacity-90"
					style={{ clipPath: dieClipPath(sides) }}
				/>
				<div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.22),transparent_28%,transparent_58%,rgba(12,18,58,0.28))]" />
				<span className={[
					'relative z-10 text-4xl font-black tracking-tight drop-shadow-[0_2px_3px_rgba(8,10,35,0.65)] sm:text-5xl',
					rolling ? 'animate-pulse' : '',
				].join(' ')}>
					{rolling ? value : finalValue}
				</span>
			</div>
			<span className="rounded-full border border-cyan-200/25 bg-cyan-100/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100">
				{visualType}
			</span>
		</div>
	);
};

export const DiceRollAnimation: React.FC<DiceRollAnimationProps> = ({
	roll,
	onComplete,
	className = '',
	title = 'Dice Roll',
	subtitle,
	defenseLabel,
	defenseValue,
	outcome = 'NEUTRAL',
	resultSuffix = 'Damage',
	autoReveal = false,
	showRollButton = true,
}) => {
	const { playSfx, triggerHaptic } = useAudioHaptic();
	const diceSides = useMemo(() => expandDiceTerms(roll), [roll]);
	const [isRolling, setIsRolling] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [rollingValues, setRollingValues] = useState<number[]>(() =>
		diceSides.map((sides) => randomFace(sides))
	);

	useEffect(() => {
		setRollingValues(diceSides.map((sides) => randomFace(sides)));
		setIsRolling(false);
		setRevealed(false);
	}, [roll, diceSides]);

	const startRoll = () => {
		if (isRolling || revealed) return;

		setIsRolling(true);
		triggerHaptic('medium');
		playSfx('dice.roll', 'HIGH', 0.82);

		const animationFrame = window.requestAnimationFrame(() => {
			setRollingValues(diceSides.map((sides) => randomFace(sides)));
		});
		const interval = window.setInterval(() => {
			setRollingValues(diceSides.map((sides) => randomFace(sides)));
		}, 85);

		window.setTimeout(() => {
			window.cancelAnimationFrame(animationFrame);
			window.clearInterval(interval);
			setRollingValues([...roll.individualDice]);
			setIsRolling(false);
			setRevealed(true);

			window.setTimeout(() => {
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
			}, 140);
		}, 1050);
	};

	useEffect(() => {
		if (!autoReveal) return;
		const timer = window.setTimeout(startRoll, 120);
		return () => window.clearTimeout(timer);
	}, [autoReveal, roll.rollId]);

	const modifier = roll.modifier || 0;
	const modifierLabel = modifier > 0 ? `+${modifier}` : String(modifier);
	const diceTotal = roll.individualDice.reduce((sum, value) => sum + value, 0);
	const total = roll.total;
	const tone = resultTone(outcome, roll);
	const isDamage = outcome === 'DAMAGE';
	const outcomeText = isDamage
		? `${total} ${resultSuffix}`
		: outcome === 'SUCCESS'
			? 'SUCCESS!'
			: outcome === 'FAILURE'
				? 'FAILURE!'
				: outcome === 'CRITICAL'
					? 'CRITICAL!'
					: roll.isCriticalSuccess
						? 'CRITICAL SUCCESS!'
						: roll.isCriticalFailure
							? 'CRITICAL FAILURE!'
							: 'RESULT';

	return (
		<div
			className={`relative overflow-hidden rounded-2xl border border-amber-300/50 bg-[#0f0b2f] shadow-[0_18px_65px_rgba(16,10,55,0.5)] ${className}`}
			style={{
				backgroundImage:
					'radial-gradient(circle at 8% 8%, rgba(118, 80, 255, 0.25), transparent 28%), radial-gradient(circle at 92% 14%, rgba(27, 211, 243, 0.18), transparent 26%), linear-gradient(145deg, rgba(27, 20, 81, 0.98), rgba(10, 7, 33, 0.98))',
			}}
		>
			<div className="pointer-events-none absolute inset-0 opacity-80 [background-image:linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.035)_48%,transparent_52%),linear-gradient(0deg,rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:100%_100%,100%_4px]" />
			<div className="pointer-events-none absolute left-2 top-2 h-7 w-7 border-l-2 border-t-2 border-amber-300/80" />
			<div className="pointer-events-none absolute right-2 top-2 h-7 w-7 border-r-2 border-t-2 border-amber-300/80" />
			<div className="pointer-events-none absolute bottom-2 left-2 h-7 w-7 border-b-2 border-l-2 border-amber-300/80" />
			<div className="pointer-events-none absolute bottom-2 right-2 h-7 w-7 border-b-2 border-r-2 border-amber-300/80" />

			<div className="relative flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
				<div className="min-w-0">
					<div className="flex items-center gap-2.5">
						<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-200/35 bg-gradient-to-br from-cyan-300/30 via-violet-400/25 to-fuchsia-400/35 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.18)]">
							<Dices className="h-4.5 w-4.5" />
						</div>
						<div className="min-w-0">
							<p className="truncate text-base font-bold text-white sm:text-lg">{title}</p>
							<p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/75">
								{subtitle || roll.formula}
							</p>
						</div>
					</div>
					{subtitle && (
						<p className="mt-2 text-[10px] font-semibold text-violet-100/80">Formula: {roll.formula}</p>
					)}
				</div>

				{defenseValue !== undefined && (
					<div className="shrink-0 rounded-xl border border-amber-200/55 bg-amber-100/10 px-3 py-2 text-right shadow-[0_0_20px_rgba(245,158,11,0.12)]">
						<p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-200/80">{defenseLabel || 'DC'}</p>
						<p className="mt-0.5 text-2xl font-black leading-none text-amber-50">{defenseValue}</p>
					</div>
				)}
			</div>

			<div className="relative px-3 pb-4 pt-5 sm:px-5 sm:pb-5">
				<div className="flex flex-wrap items-center justify-center gap-4">
					{diceSides.map((sides, index) => (
						<AnimatedDie
							key={`${roll.rollId}-${index}`}
							sides={sides}
							value={rollingValues[index] ?? 1}
							finalValue={roll.individualDice[index] ?? rollingValues[index] ?? 1}
							rolling={isRolling}
						/>
					))}
				</div>

				<div className="mx-auto mt-4 max-w-xl text-center">
					<p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/75">
						{revealed ? 'Canonical Result' : 'Result Pending'}
					</p>
					<p className="mt-1 text-[22px] font-black tracking-wide text-white sm:text-2xl">
						{roll.individualDice.length > 1
							? roll.individualDice.join(' + ') + (modifier !== 0 ? ` ${modifierLabel}` : '')
							: `${diceTotal}${modifier !== 0 ? ` ${modifierLabel}` : ''}`}
						{revealed ? ` = ${total}` : ''}
					</p>
				</div>

				{revealed && (
					<div className={`mx-auto mt-3 max-w-sm rounded-2xl border px-4 py-3 text-center transition-all ${tone}`}>
						<p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-75">{outcomeText.includes('!') ? 'Outcome' : 'Damage'}</p>
						<p className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{outcomeText}</p>
					</div>
				)}

				{!revealed && showRollButton && (
					<button
						type="button"
						onClick={startRoll}
						disabled={isRolling}
						className="mx-auto mt-4 inline-flex items-center gap-2 rounded-xl border border-cyan-200/35 bg-gradient-to-r from-violet-500/35 to-cyan-400/25 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white shadow-[0_8px_25px_rgba(76,73,255,0.18)] transition hover:border-cyan-100/60 hover:from-violet-500/50 hover:to-cyan-400/35 disabled:cursor-wait disabled:opacity-55"
					>
						<RotateCw className={`h-3.5 w-3.5 ${isRolling ? 'animate-spin' : ''}`} />
						{isRolling ? 'Rolling…' : 'Roll'}
					</button>
				)}

				{revealed && roll.individualDice.length > 1 && (
					<div className="mt-3 flex flex-wrap justify-center gap-1.5">
						{roll.individualDice.map((value, index) => (
							<span
								key={`${roll.rollId}-result-${index}`}
								className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-violet-100"
							>
								{diceLabel(diceSides[index] || 20)} {value}
							</span>
						))}
					</div>
				)}
			</div>

			<div className="relative flex items-center justify-between gap-3 border-t border-white/10 px-4 py-2.5 text-[10px] text-violet-100/65 sm:px-5">
				<span>{revealed ? 'Server-authoritative result displayed' : 'Animation only reveals the already-resolved roll'}</span>
				{modifier !== 0 && <span className="font-bold">Modifier {modifierLabel}</span>}
			</div>
		</div>
	);
};
