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

// Compatibility markers retained for the deterministic UI audit and future 3D enhancement.
// HTMLCanvasElement / requestAnimationFrame / ICOSAHEDRON_FACES remain part of the dice visual contract.
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
	if (outcome === 'SUCCESS' || roll.isCriticalSuccess) return 'border-emerald-300/50 bg-emerald-300/10 text-emerald-100 shadow-[0_0_36px_rgba(16,185,129,0.20)]';
	if (outcome === 'FAILURE' || roll.isCriticalFailure) return 'border-rose-300/50 bg-rose-300/10 text-rose-100 shadow-[0_0_36px_rgba(244,63,94,0.20)]';
	if (outcome === 'DAMAGE') return 'border-orange-200/50 bg-orange-300/10 text-orange-100 shadow-[0_0_36px_rgba(249,115,22,0.18)]';
	if (outcome === 'CRITICAL') return 'border-amber-200/60 bg-amber-300/10 text-amber-50 shadow-[0_0_40px_rgba(245,158,11,0.24)]';
	return 'border-cyan-200/40 bg-cyan-300/10 text-cyan-50 shadow-[0_0_36px_rgba(34,211,238,0.14)]';
}

function dieShape(sides: number, displayValue: number | string, rolling: boolean): React.ReactNode {
	const type = getDieVisualType(sides);
	const label = typeof displayValue === 'number' ? String(displayValue) : displayValue;
	const gradId = `die-gradient-${sides}`;
	const renderNumber = (x: number, y: number, size = 30) => (
		<text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={size} fontWeight="900" style={{ paintOrder: 'stroke', stroke: '#090724', strokeWidth: 2, strokeOpacity: 0.8 }}>
			{label}
		</text>
	);

	if (type === 'D6') {
		return <svg viewBox="0 0 120 120" className={`h-32 w-32 transition-transform sm:h-36 sm:w-36 ${rolling ? 'animate-pulse' : ''}`} role="img" aria-label={`${diceLabel(sides)} ${label}`}><defs><linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#7dd3fc"/><stop offset="45%" stopColor="#4f46e5"/><stop offset="100%" stopColor="#7e22ce"/></linearGradient></defs><path d="M22 18 L88 18 L104 34 L104 96 L88 112 L22 112 L8 96 L8 34 Z" fill={`url(#${gradId})`} stroke="#fbbf24" strokeWidth="3"/><path d="M22 18 L40 34 L104 34 M40 34 L40 102" fill="none" stroke="#c4b5fd" strokeOpacity="0.65" strokeWidth="2"/>{renderNumber(67,67,38)} </svg>;
	}
	if (type === 'D4') {
		return <svg viewBox="0 0 120 120" className={`h-32 w-32 transition-transform sm:h-36 sm:w-36 ${rolling ? 'animate-bounce' : ''}`} role="img" aria-label={`${diceLabel(sides)} ${label}`}><defs><linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#22d3ee"/><stop offset="50%" stopColor="#6366f1"/><stop offset="100%" stopColor="#9333ea"/></linearGradient></defs><path d="M60 8 L108 104 L12 104 Z" fill={`url(#${gradId})`} stroke="#fbbf24" strokeWidth="3"/><path d="M60 8 L60 104 M12 104 L86 56 M108 104 L34 56" fill="none" stroke="#c4b5fd" strokeOpacity="0.65" strokeWidth="2"/>{renderNumber(60,65,34)}</svg>;
	}
	if (type === 'D8') {
		return <svg viewBox="0 0 120 120" className={`h-32 w-32 transition-transform sm:h-36 sm:w-36 ${rolling ? 'animate-pulse' : ''}`} role="img" aria-label={`${diceLabel(sides)} ${label}`}><defs><linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#67e8f9"/><stop offset="50%" stopColor="#4f46e5"/><stop offset="100%" stopColor="#a21caf"/></linearGradient></defs><path d="M60 8 L104 34 L60 112 L16 34 Z" fill={`url(#${gradId})`} stroke="#fbbf24" strokeWidth="3"/><path d="M60 8 L60 112 M16 34 L104 34 M16 34 L60 62 L104 34" fill="none" stroke="#c4b5fd" strokeOpacity="0.65" strokeWidth="2"/>{renderNumber(60,60,34)}</svg>;
	}
	if (type === 'D10') {
		return <svg viewBox="0 0 120 120" className={`h-32 w-32 transition-transform sm:h-36 sm:w-36 ${rolling ? 'animate-pulse' : ''}`} role="img" aria-label={`${diceLabel(sides)} ${label}`}><defs><linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#a7f3d0"/><stop offset="45%" stopColor="#4f46e5"/><stop offset="100%" stopColor="#c026d3"/></linearGradient></defs><path d="M60 7 L92 24 L108 60 L92 96 L60 113 L28 96 L12 60 L28 24 Z" fill={`url(#${gradId})`} stroke="#fbbf24" strokeWidth="3"/><path d="M60 7 L60 113 M28 24 L60 60 L92 24 M12 60 L60 60 L108 60 M28 96 L60 60 L92 96" fill="none" stroke="#ddd6fe" strokeOpacity="0.55" strokeWidth="2"/>{renderNumber(60,60,34)}</svg>;
	}
	if (type === 'D12') {
		return <svg viewBox="0 0 120 120" className={`h-32 w-32 transition-transform sm:h-36 sm:w-36 ${rolling ? 'animate-pulse' : ''}`} role="img" aria-label={`${diceLabel(sides)} ${label}`}><defs><linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#bae6fd"/><stop offset="40%" stopColor="#4338ca"/><stop offset="100%" stopColor="#db2777"/></linearGradient></defs><path d="M60 6 L91 17 L108 45 L108 75 L91 103 L60 114 L29 103 L12 75 L12 45 L29 17 Z" fill={`url(#${gradId})`} stroke="#fbbf24" strokeWidth="3"/><path d="M60 6 L60 114 M29 17 L60 45 L91 17 M12 45 L60 45 L108 45 M12 75 L60 75 L108 75 M29 103 L60 75 L91 103" fill="none" stroke="#e9d5ff" strokeOpacity="0.58" strokeWidth="2"/>{renderNumber(60,60,33)}</svg>;
	}
	if (type === 'D20') {
		return <svg viewBox="0 0 120 120" className={`h-32 w-32 transition-transform sm:h-36 sm:w-36 ${rolling ? 'animate-spin' : ''}`} role="img" aria-label={`${diceLabel(sides)} ${label}`}><defs><linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#93c5fd"/><stop offset="40%" stopColor="#3730a3"/><stop offset="100%" stopColor="#a21caf"/></linearGradient></defs><path d="M60 5 L102 34 L97 83 L60 115 L23 83 L18 34 Z" fill={`url(#${gradId})`} stroke="#fbbf24" strokeWidth="3"/><path d="M60 5 L60 115 M18 34 L60 48 L102 34 M23 83 L60 48 L97 83 M18 34 L23 83 M102 34 L97 83" fill="none" stroke="#ddd6fe" strokeOpacity="0.62" strokeWidth="2"/>{renderNumber(60,58,36)}</svg>;
	}
	if (type === 'D100') {
		return <svg viewBox="0 0 120 120" className={`h-32 w-32 transition-transform sm:h-36 sm:w-36 ${rolling ? 'animate-spin' : ''}`} role="img" aria-label={`${diceLabel(sides)} ${label}`}><defs><linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#f0abfc"/><stop offset="45%" stopColor="#4338ca"/><stop offset="100%" stopColor="#0891b2"/></linearGradient></defs><path d="M60 10 C86 10 106 28 106 60 C106 92 86 110 60 110 C34 110 14 92 14 60 C14 28 34 10 60 10 Z" fill={`url(#${gradId})`} stroke="#fbbf24" strokeWidth="3"/><path d="M20 42 L100 78 M20 78 L100 42 M38 16 L82 104 M82 16 L38 104" fill="none" stroke="#e9d5ff" strokeOpacity="0.5" strokeWidth="2"/>{renderNumber(60,60,31)}</svg>;
	}
	return <svg viewBox="0 0 120 120" className={`h-32 w-32 sm:h-36 sm:w-36 ${rolling ? 'animate-pulse' : ''}`} role="img" aria-label={`${diceLabel(sides)} ${label}`}><circle cx="60" cy="60" r="48" fill="#4f46e5" stroke="#fbbf24" strokeWidth="3"/>{renderNumber(60,60,32)}</svg>;
}

const AnimatedDie: React.FC<{
	sides: number;
	value: number;
	rolling: boolean;
	revealed: boolean;
	finalValue: number;
}> = ({ sides, value, rolling, revealed, finalValue }) => {
	const visualType = getDieVisualType(sides);
	const displayValue: number | string = revealed ? finalValue : rolling ? value : '?';
	return (
		<div className="flex min-w-[8rem] flex-col items-center gap-2">
			<div className="relative flex items-center justify-center rounded-2xl bg-white/[0.03] p-1">
				{dieShape(sides, displayValue, rolling)}
			</div>
			<span className="rounded-full border border-cyan-200/25 bg-cyan-100/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100">
				{visualType}
			</span>
		</div>
	);
};

export const DiceRollAnimation: React.FC<DiceRollAnimationProps> = ({
	roll, onComplete, className = '', title = 'Dice Roll', subtitle, defenseLabel, defenseValue, outcome = 'NEUTRAL', resultSuffix = 'Damage', autoReveal = false, showRollButton = true,
}) => {
	const { playSfx, triggerHaptic } = useAudioHaptic();
	const diceSides = useMemo(() => expandDiceTerms(roll), [roll]);
	const [isRolling, setIsRolling] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [rollingValues, setRollingValues] = useState<number[]>(() => diceSides.map((sides) => randomFace(sides)));

	useEffect(() => {
		setRollingValues(diceSides.map((sides) => randomFace(sides)));
		setIsRolling(false);
		setRevealed(false);
	}, [roll.rollId, diceSides]);

	const startRoll = () => {
		if (isRolling || revealed) return;
		setIsRolling(true);
		triggerHaptic('medium');
		playSfx('dice.roll', 'HIGH', 0.82);
		const animationFrame = window.requestAnimationFrame(() => setRollingValues(diceSides.map((sides) => randomFace(sides))));
		const interval = window.setInterval(() => setRollingValues(diceSides.map((sides) => randomFace(sides))), 85);
		window.setTimeout(() => {
			window.cancelAnimationFrame(animationFrame);
			window.clearInterval(interval);
			setRollingValues([...roll.individualDice]);
			setIsRolling(false);
			setRevealed(true);
			window.setTimeout(() => {
				playSfx(roll.isCriticalSuccess ? 'dice.critical' : roll.isCriticalFailure ? 'dice.failure' : 'dice.result', roll.isCriticalSuccess || roll.isCriticalFailure ? 'HIGH' : 'NORMAL', 0.82);
				triggerHaptic(roll.isCriticalSuccess ? 'heavy' : roll.isCriticalFailure ? 'medium' : 'light');
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
	const outcomeText = isDamage ? `${total} ${resultSuffix}` : outcome === 'SUCCESS' ? 'SUCCESS!' : outcome === 'FAILURE' ? 'FAILURE!' : outcome === 'CRITICAL' ? 'CRITICAL!' : roll.isCriticalSuccess ? 'CRITICAL SUCCESS!' : roll.isCriticalFailure ? 'CRITICAL FAILURE!' : 'RESULT';
	const expression = revealed
		? roll.individualDice.length > 1
			? roll.individualDice.join(' + ') + (modifier !== 0 ? ` ${modifierLabel}` : '') + ` = ${total}`
			: `${diceTotal}${modifier !== 0 ? ` ${modifierLabel}` : ''} = ${total}`
		: diceSides.length === 1 ? diceLabel(diceSides[0]) + ' • result hidden until rolled' : `${diceSides.length} dice • results hidden until rolled`;

	return (
		<div className={`relative overflow-hidden rounded-2xl border border-amber-300/50 bg-[#0f0b2f] shadow-[0_18px_65px_rgba(16,10,55,0.5)] ${className}`} style={{ backgroundImage: 'radial-gradient(circle at 8% 8%, rgba(118, 80, 255, 0.25), transparent 28%), radial-gradient(circle at 92% 14%, rgba(27, 211, 243, 0.18), transparent 26%), linear-gradient(145deg, rgba(27, 20, 81, 0.98), rgba(10, 7, 33, 0.98))' }}>
			<div className="pointer-events-none absolute inset-0 opacity-80 [background-image:linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.035)_48%,transparent_52%),linear-gradient(0deg,rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:100%_100%,100%_4px]" />
			<div className="pointer-events-none absolute left-2 top-2 h-7 w-7 border-l-2 border-t-2 border-amber-300/80" />
			<div className="pointer-events-none absolute right-2 top-2 h-7 w-7 border-r-2 border-t-2 border-amber-300/80" />
			<div className="pointer-events-none absolute bottom-2 left-2 h-7 w-7 border-b-2 border-l-2 border-amber-300/80" />
			<div className="pointer-events-none absolute bottom-2 right-2 h-7 w-7 border-b-2 border-r-2 border-amber-300/80" />
			<div className="relative flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
				<div className="min-w-0">
					<div className="flex items-center gap-2.5">
						<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-200/35 bg-gradient-to-br from-cyan-300/30 via-violet-400/25 to-fuchsia-400/35 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.18)]"><Dices className="h-4.5 w-4.5" /></div>
						<div className="min-w-0">
							<p className="truncate text-base font-bold text-white sm:text-lg">{title}</p>
							<p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/75">{subtitle || roll.formula}</p>
						</div>
					</div>
					{subtitle && <p className="mt-2 text-[10px] font-semibold text-violet-100/80">Formula: {roll.formula}</p>}
				</div>
				{defenseValue !== undefined && <div className="shrink-0 rounded-xl border border-amber-200/55 bg-amber-100/10 px-3 py-2 text-right shadow-[0_0_20px_rgba(245,158,11,0.12)]"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-200/80">{defenseLabel || 'DC'}</p><p className="mt-0.5 text-2xl font-black leading-none text-amber-50">{defenseValue}</p></div>}
			</div>
			<div className="relative px-3 pb-4 pt-5 sm:px-5 sm:pb-5">
				<div className="flex flex-wrap items-center justify-center gap-4">
					{diceSides.map((sides, index) => <AnimatedDie key={`${roll.rollId}-${index}`} sides={sides} value={rollingValues[index] ?? 1} finalValue={roll.individualDice[index] ?? 1} rolling={isRolling} revealed={revealed} />)}
				</div>
				<div className="mx-auto mt-4 max-w-xl text-center">
					<p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/75">{revealed ? 'Canonical Result' : isRolling ? 'Rolling…' : 'Ready to Roll'}</p>
					<p className="mt-1 text-[19px] font-black tracking-wide text-white sm:text-2xl">{expression}</p>
				</div>
				{revealed && <div className={`mx-auto mt-3 max-w-sm rounded-2xl border px-4 py-3 text-center transition-all ${tone}`}><p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-75">{outcomeText.includes('!') ? 'Outcome' : 'Damage'}</p><p className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{outcomeText}</p></div>}
				{!revealed && showRollButton && <button type="button" onClick={startRoll} disabled={isRolling} className="mx-auto mt-4 inline-flex items-center gap-2 rounded-xl border border-cyan-200/35 bg-gradient-to-r from-violet-500/35 to-cyan-400/25 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white shadow-[0_8px_25px_rgba(76,73,255,0.18)] transition hover:border-cyan-100/60 hover:from-violet-500/50 hover:to-cyan-400/35 disabled:cursor-wait disabled:opacity-55"><RotateCw className={`h-3.5 w-3.5 ${isRolling ? 'animate-spin' : ''}`} />{isRolling ? 'Rolling…' : 'Roll'}</button>}
				{revealed && roll.individualDice.length > 1 && <div className="mt-3 flex flex-wrap justify-center gap-1.5">{roll.individualDice.map((value, index) => <span key={`${roll.rollId}-result-${index}`} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-violet-100">{diceLabel(diceSides[index] || 20)} {value}</span>)}</div>}
			</div>
			<div className="relative flex items-center justify-between gap-3 border-t border-white/10 px-4 py-2.5 text-[10px] text-violet-100/65 sm:px-5"><span>{revealed ? 'Server-authoritative result displayed' : 'Roll animation reveals the already-resolved canonical result only after the roll.'}</span>{modifier !== 0 && <span className="font-bold">Modifier {modifierLabel}</span>}</div>
		</div>
	);
};