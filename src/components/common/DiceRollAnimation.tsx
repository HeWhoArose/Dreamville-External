import React, { useEffect, useMemo, useState } from 'react';
import type { RollRecord } from '../../types';
import { Dices, RotateCw } from 'lucide-react';
import { useAudioHaptic } from '../AudioHapticManager';

interface DiceRollAnimationProps {
	roll: RollRecord;
	onComplete?: () => void;
	className?: string;
}

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

function randomFace(sides: number): number {
	return Math.floor(Math.random() * sides) + 1;
}

function diceLabel(sides: number): string {
	return `D${sides}`;
}

function resultTone(roll: RollRecord): string {
	if (roll.isCriticalSuccess) {
		return 'border-emerald-300/40 bg-emerald-400/10 text-emerald-100 shadow-[0_0_35px_rgba(16,185,129,0.18)]';
	}
	if (roll.isCriticalFailure) {
		return 'border-rose-300/40 bg-rose-400/10 text-rose-100 shadow-[0_0_35px_rgba(244,63,94,0.18)]';
	}
	return 'border-violet-300/25 bg-gradient-to-br from-violet-400/15 via-fuchsia-400/10 to-sky-400/10 text-white shadow-[0_0_35px_rgba(167,139,250,0.12)]';
}

const AnimatedDie: React.FC<{
	sides: number;
	value: number;
	rolling: boolean;
	finalValue: number;
}> = ({ sides, value, rolling, finalValue }) => (
	<div className="flex flex-col items-center gap-1.5">
		<div
			className={[
				'relative flex h-20 w-20 items-center justify-center border text-2xl font-black transition-all duration-150',
				'rounded-[22%] [clip-path:polygon(50%_0%,92%_25%,92%_75%,50%_100%,8%_75%,8%_25%)]',
				rolling
					? 'rotate-[8deg] scale-105 border-violet-200/50 bg-gradient-to-br from-violet-300 via-fuchsia-300 to-sky-300 text-[#170c25] shadow-[0_0_32px_rgba(217,70,239,0.25)]'
					: 'border-white/25 bg-gradient-to-br from-violet-300 via-fuchsia-300 to-sky-300 text-[#170c25] shadow-[0_10px_35px_rgba(217,70,239,0.18)]',
			].join(' ')}
			aria-label={`${diceLabel(sides)} result ${finalValue}`}
		>
			<span className={rolling ? 'animate-pulse' : ''}>{rolling ? value : finalValue}</span>
		</div>
		<span className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-500">
			{diceLabel(sides)}
		</span>
	</div>
);

export const DiceRollAnimation: React.FC<DiceRollAnimationProps> = ({
	roll,
	onComplete,
	className = '',
}) => {
	const { playSfx, triggerHaptic } = useAudioHaptic();
	const diceSides = useMemo(() => expandDiceTerms(roll), [roll]);
	const [isRolling, setIsRolling] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [rollingValues, setRollingValues] = useState<number[]>(() =>
		diceSides.map((sides, index) => roll.individualDice[index] || randomFace(sides))
	);

	useEffect(() => {
		setRollingValues(diceSides.map((sides, index) => roll.individualDice[index] || randomFace(sides)));
		setIsRolling(false);
		setRevealed(false);
	}, [roll, diceSides]);

	const startRoll = () => {
		if (isRolling || revealed) return;

		setIsRolling(true);
		triggerHaptic('medium');
		playSfx('dice.roll', 'HIGH', 0.82);

		const interval = window.setInterval(() => {
			setRollingValues(diceSides.map((sides) => randomFace(sides)));
		}, 85);

		window.setTimeout(() => {
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

	const modifier = roll.modifier || 0;
	const modifierLabel = modifier > 0 ? `+${modifier}` : String(modifier);
	const diceTotal = roll.individualDice.reduce((sum, value) => sum + value, 0);
	const total = roll.total;
	const tone = resultTone(roll);

	return (
		<div className={`overflow-hidden rounded-3xl border border-white/10 bg-[#0b0712]/90 ${className}`}>
			<div className="flex items-center justify-between gap-3 border-b border-white/6 px-4 py-3">
				<div className="flex items-center gap-2">
					<div className="rounded-xl bg-violet-400/10 p-2 text-violet-200">
						<Dices className="h-4 w-4" />
					</div>
					<div>
						<p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">Dice Roll</p>
						<p className="mt-0.5 text-xs font-semibold text-stone-200">{roll.formula}</p>
					</div>
				</div>
				{!revealed && (
					<button
						type="button"
						onClick={startRoll}
						disabled={isRolling}
						className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300/20 bg-violet-300/10 px-3 py-1.5 text-xs font-semibold text-violet-100 transition hover:border-violet-200/35 hover:bg-violet-300/15 disabled:cursor-wait disabled:opacity-55"
					>
						<RotateCw className={`h-3.5 w-3.5 ${isRolling ? 'animate-spin' : ''}`} />
						{isRolling ? 'Rolling…' : 'Roll'}
					</button>
				)}
			</div>

			<div className="px-4 pb-4 pt-5">
				<div className="flex flex-wrap items-end justify-center gap-4">
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

				<div className={`mx-auto mt-5 max-w-sm rounded-2xl border px-4 py-3 text-center transition-all ${tone}`}>
					<p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">
						{roll.isCriticalSuccess
							? 'Critical Success'
							: roll.isCriticalFailure
								? 'Critical Failure'
								: revealed
									? 'Result'
									: 'Ready to Roll'}
					</p>
					{revealed ? (
						<>
							<p className="mt-1 text-4xl font-black tracking-tight">{total}</p>
							<p className="mt-1 text-[11px] font-medium opacity-75">
								{roll.individualDice.length > 1
									? `${roll.individualDice.join(' + ')}${modifier !== 0 ? ` ${modifierLabel}` : ''}`
									: `${diceTotal}${modifier !== 0 ? ` ${modifierLabel}` : ''}`}
							</p>
						</>
					) : (
						<p className="mt-1 text-sm font-semibold opacity-80">Roll to reveal the canonical result</p>
					)}
				</div>
			</div>
		</div>
	);
};
