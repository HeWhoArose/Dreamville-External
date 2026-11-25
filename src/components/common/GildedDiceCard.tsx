import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RollRecord } from '../../types';

/**
 * The gilded roll card: a wide ornate card with the check's name and bonuses, the difficulty class, one large die that tumbles and
 * settles on the engine's result, the sum line, and a result banner. Rolling is one click; clicking the card itself opens the
 * roll for customisation. The result is always the engine's: the animation only reveals it.
 */

export type GildedAdvantage = 'ADVANTAGE' | 'DISADVANTAGE' | undefined;
export type GildedOutcome = 'CRITICAL_SUCCESS' | 'SUCCESS' | 'FAILURE' | 'CRITICAL_FAILURE' | 'RESULT';
/** CHECK: skill checks and saves. ATTACK: an attack roll against armor class. DAMAGE: a damage roll, shown as a total. */
export type GildedKind = 'CHECK' | 'ATTACK' | 'DAMAGE';

export interface GildedDiceCardProps {
  roll: RollRecord;
  /** The check's name ("Insight Check", "Attack Roll"). */
  title: string;
  /** Bonuses shown under the title ("+1 Wisdom"). */
  bonusesLabel?: string;
  difficultyClass?: number;
  /** The label above the target number. Defaults to "Difficulty Class"; attacks use "Armor Class". */
  difficultyLabel?: string;
  kind?: GildedKind;
  /** Appended to the total of a damage roll ("Damage to Gravus"). */
  resultSuffix?: string;
  /** Avatar: an image URL or a short emoji / glyph. */
  avatar?: string;
  advantage?: GildedAdvantage;
  /** Roll as soon as the card appears. */
  autoRoll?: boolean;
  /** Show the final state immediately (replays, reloaded pages). */
  revealed?: boolean;
  /** Click on the card body (not the button) to adjust the roll before it is thrown. */
  onCustomize?: () => void;
  onRollStart?: () => void;
  onRevealed?: (outcome: GildedOutcome) => void;
  className?: string;
}

/** What the banner says. A natural 20 or 1 decides on its own; otherwise the total is compared to the difficulty class. */
export function resolveGildedOutcome(roll: Pick<RollRecord, 'total' | 'isCriticalSuccess' | 'isCriticalFailure'>, difficultyClass?: number): GildedOutcome {
  if (roll.isCriticalSuccess) return 'CRITICAL_SUCCESS';
  if (roll.isCriticalFailure) return 'CRITICAL_FAILURE';
  if (difficultyClass === undefined || !Number.isFinite(difficultyClass)) return 'RESULT';
  return roll.total >= difficultyClass ? 'SUCCESS' : 'FAILURE';
}

export const GILDED_BANNER: Record<GildedOutcome, string> = {
  CRITICAL_SUCCESS: 'CRITICAL SUCCESS!',
  SUCCESS: 'SUCCESS!',
  FAILURE: 'FAILURE',
  CRITICAL_FAILURE: 'CRITICAL FAILURE!',
  RESULT: '',
};

export const GILDED_ATTACK_BANNER: Record<GildedOutcome, string> = {
  CRITICAL_SUCCESS: 'CRITICAL HIT!',
  SUCCESS: 'HIT!',
  FAILURE: 'MISS',
  CRITICAL_FAILURE: 'CRITICAL MISS!',
  RESULT: '',
};

export function gildedBannerText(outcome: GildedOutcome, kind: GildedKind = 'CHECK'): string {
  return (kind === 'ATTACK' ? GILDED_ATTACK_BANNER : GILDED_BANNER)[outcome];
}

const BANNER_TONE: Record<GildedOutcome, string> = {
  CRITICAL_SUCCESS: 'text-amber-300 drop-shadow-[0_0_14px_rgba(251,191,36,0.75)]',
  SUCCESS: 'text-amber-200',
  FAILURE: 'text-rose-300',
  CRITICAL_FAILURE: 'text-red-400 drop-shadow-[0_0_14px_rgba(239,68,68,0.6)]',
  RESULT: 'text-amber-100',
};

/** The sides a die in a formula has, one entry per die: "2d6+1d4" gives [6, 6, 4]. */
export function gildedDiceSides(roll: Pick<RollRecord, 'formula' | 'diceTerms'>): number[] {
  if (roll.diceTerms?.length) {
    return roll.diceTerms.flatMap((term) => Array.from({ length: Math.max(1, term.count) }, () => Math.max(2, term.sides)));
  }
  const matches = roll.formula.match(/(\d*)d(\d+)/gi);
  if (!matches?.length) return [20];
  return matches.flatMap((term) => {
    const parts = term.match(/(\d*)d(\d+)/i);
    return Array.from({ length: Math.max(1, Number(parts?.[1] || 1)) }, () => Math.max(2, Number(parts?.[2] || 20)));
  });
}

/** Advantage or disadvantage keeps one of two d20s. Returns which index counts, or -1 when nothing was discarded. */
export function gildedKeptIndex(dice: number[], advantage: GildedAdvantage, total: number, modifier: number): { keptIndex: number; discardedIndex: number } {
  if (!advantage || dice.length < 2) return { keptIndex: 0, discardedIndex: -1 };
  const keptValue = advantage === 'ADVANTAGE' ? Math.max(...dice) : Math.min(...dice);
  const keptIndex = dice.indexOf(keptValue);
  void total; void modifier;
  return { keptIndex, discardedIndex: dice.findIndex((_, index) => index !== keptIndex) };
}

/** Outline points for each die, inside a 100 x 100 box. The d20 is the icosahedron silhouette with its visible faces. */
const SHAPES: Record<number, { outline: string; faces: string[] }> = {
  4: { outline: '50,6 94,88 6,88', faces: ['50,6 50,88', '50,52 94,88', '50,52 6,88'] },
  6: { outline: '14,26 50,8 86,26 86,74 50,92 14,74', faces: ['14,26 50,44 86,26', '50,44 50,92'] },
  8: { outline: '50,4 94,50 50,96 6,50', faces: ['6,50 94,50', '50,4 50,96', '28,27 72,73', '72,27 28,73'] },
  10: { outline: '50,4 90,38 78,92 22,92 10,38', faces: ['50,4 50,56', '10,38 50,56 90,38', '50,56 22,92', '50,56 78,92'] },
  12: { outline: '50,4 82,16 96,48 86,82 50,96 14,82 4,48 18,16', faces: ['50,26 72,40 66,68 34,68 28,40', '50,4 50,26', '82,16 72,40', '96,48 72,40', '86,82 66,68', '50,96 50,68', '14,82 34,68', '4,48 28,40', '18,16 28,40'] },
  20: { outline: '50,3 92,27 92,73 50,97 8,73 8,27', faces: ['50,3 50,26', '50,26 76,64 24,64 50,26', '8,27 24,64', '92,27 76,64', '8,73 24,64', '92,73 76,64', '50,97 24,64', '50,97 76,64', '8,27 50,26', '92,27 50,26'] },
};

export function gildedShapeFor(sides: number): { outline: string; faces: string[] } {
  return SHAPES[sides] || SHAPES[20];
}

interface DieProps {
  sides: number;
  value: number | string;
  state: 'idle' | 'rolling' | 'settled';
  dimmed?: boolean;
  critical?: 'success' | 'failure';
  size?: number;
  label?: string;
}

function GildedDie({ sides, value, state, dimmed, critical, size = 124, label }: DieProps) {
  const shape = gildedShapeFor(sides);
  const gid = useMemo(() => `gd-${sides}-${Math.random().toString(36).slice(2, 8)}`, [sides]);
  const glow = critical === 'failure' ? 'rgba(239,68,68,0.55)' : 'rgba(250,204,21,0.55)';
  return (
    <div
      className={`relative flex flex-col items-center ${dimmed ? 'opacity-35' : ''}`}
      style={{ width: size, height: size }}
      data-testid="gilded-die"
      data-die-state={state}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="img"
        aria-label={`d${sides} showing ${value}`}
        className={state === 'rolling' ? 'gilded-tumble' : state === 'settled' ? 'gilded-settle' : ''}
        style={{ filter: state === 'settled' ? `drop-shadow(0 0 14px ${glow})` : 'drop-shadow(0 8px 14px rgba(0,0,0,.55))' }}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3b5bdb" />
            <stop offset="55%" stopColor="#1e3a8a" />
            <stop offset="100%" stopColor="#172554" />
          </linearGradient>
        </defs>
        <polygon points={shape.outline} fill={`url(#${gid})`} stroke="#fbbf24" strokeWidth="2.6" strokeLinejoin="round" />
        {shape.faces.map((points) => (
          <polyline key={points} points={points} fill="none" stroke="#fbbf24" strokeOpacity="0.55" strokeWidth="1.2" strokeLinejoin="round" />
        ))}
        <text x="50" y="58" textAnchor="middle" fontSize={String(value).length > 2 ? 24 : 32} fontWeight={800} fill="#fde68a" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
          {value}
        </text>
      </svg>
      {label && <span className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-amber-200/70">{label}</span>}
    </div>
  );
}

const Corner: React.FC<{ className: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={`pointer-events-none absolute h-5 w-5 text-amber-400/80 ${className}`} aria-hidden="true">
    <path d="M2 22 V8 Q2 2 8 2 H22" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M6 22 V11 Q6 6 11 6 H22" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.7" />
  </svg>
);

export const GildedDiceCard: React.FC<GildedDiceCardProps> = ({
  roll, title, bonusesLabel, difficultyClass, difficultyLabel = 'Difficulty Class', kind = 'CHECK', resultSuffix, avatar, advantage, autoRoll = false, revealed: revealedProp = false,
  onCustomize, onRollStart, onRevealed, className = '',
}) => {
  const sidesList = useMemo(() => gildedDiceSides(roll), [roll]);
  const [phase, setPhase] = useState<'idle' | 'rolling' | 'settled'>(revealedProp ? 'settled' : 'idle');
  const [flicker, setFlicker] = useState<number[]>([]);
  const startedRef = useRef(false);
  const timers = useRef<{ tick?: ReturnType<typeof setInterval>; done?: ReturnType<typeof setTimeout> }>({});

  const reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dice = roll.individualDice.length ? roll.individualDice : [roll.total];
  const outcome = kind === 'DAMAGE' ? 'RESULT' : resolveGildedOutcome(roll, difficultyClass);
  const { keptIndex, discardedIndex } = gildedKeptIndex(dice, advantage, roll.total, roll.modifier || 0);
  const keptDice = discardedIndex >= 0 ? dice.filter((_, index) => index !== discardedIndex) : dice;
  const diceSum = keptDice.reduce((sum, value) => sum + value, 0);
  const modifier = roll.modifier || 0;

  useEffect(() => {
    startedRef.current = false;
    setPhase(revealedProp ? 'settled' : 'idle');
    return () => {
      if (timers.current.tick) clearInterval(timers.current.tick);
      if (timers.current.done) clearTimeout(timers.current.done);
    };
  }, [roll.rollId, revealedProp]);

  const throwDice = () => {
    if (phase !== 'idle' || startedRef.current) return;
    startedRef.current = true;
    onRollStart?.();
    if (reducedMotion) {
      setPhase('settled');
      onRevealed?.(outcome);
      return;
    }
    setPhase('rolling');
    timers.current.tick = setInterval(() => {
      setFlicker(dice.map((_, index) => 1 + Math.floor(Math.random() * (sidesList[index] || sidesList[0] || 20))));
    }, 70);
    timers.current.done = setTimeout(() => {
      if (timers.current.tick) clearInterval(timers.current.tick);
      setPhase('settled');
      onRevealed?.(outcome);
    }, 1000);
  };

  useEffect(() => {
    if (autoRoll) throwDice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRoll, roll.rollId]);

  const settled = phase === 'settled';
  const criticalTone = outcome === 'CRITICAL_SUCCESS' ? 'success' : outcome === 'CRITICAL_FAILURE' ? 'failure' : undefined;
  const equation = `${keptDice.length > 1 ? `[${keptDice.join(' + ')}]` : String(diceSum)}${modifier ? ` ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)}` : ''} = ${roll.total}`;

  return (
    <div
      className={`gilded-card relative flex flex-col rounded-2xl p-[3px] shadow-[0_18px_50px_rgba(0,0,0,0.55)] ${className}`}
      style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #92400e 38%, #fbbf24 62%, #78350f 100%)' }}
      data-testid="gilded-dice-card"
      data-outcome={settled ? outcome : 'PENDING'}
    >
      <div
        className="relative flex flex-1 flex-col justify-center overflow-hidden rounded-[14px] px-4 pb-4 pt-3 sm:px-6"
        style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(234,179,8,0.22), transparent 58%), linear-gradient(160deg, #2b1233 0%, #170b1f 55%, #1d1209 100%)' }}
        onClick={onCustomize}
        role={onCustomize ? 'button' : undefined}
        tabIndex={onCustomize ? 0 : undefined}
        onKeyDown={onCustomize ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onCustomize(); } } : undefined}
        title={onCustomize ? 'Click the card to customise this roll' : undefined}
      >
        <div className="pointer-events-none absolute inset-[5px] rounded-[10px] border border-amber-500/35" />
        <Corner className="left-1.5 top-1.5" />
        <Corner className="right-1.5 top-1.5 rotate-90" />
        <Corner className="bottom-1.5 right-1.5 rotate-180" />
        <Corner className="bottom-1.5 left-1.5 -rotate-90" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-400/60 bg-stone-900 text-base" data-testid="gilded-avatar">
              {avatar && /^(https?:|\/|data:)/.test(avatar) ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : <span aria-hidden="true">{avatar || '🎲'}</span>}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-amber-50" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>{title}</p>
              {bonusesLabel && <p className="truncate text-[10px] text-amber-200/70" data-testid="gilded-bonuses">Bonuses: {bonusesLabel}</p>}
              {advantage && <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300" data-testid="gilded-advantage">{advantage === 'ADVANTAGE' ? 'Advantage' : 'Disadvantage'}</p>}
            </div>
          </div>
          {difficultyClass !== undefined && (
            <div className="shrink-0 rounded border border-amber-500/40 bg-black/35 px-3 py-1 text-center" data-testid="gilded-dc">
              <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-amber-200/70">{difficultyLabel}</p>
              <p className="text-lg font-black leading-tight text-amber-50">{difficultyClass}</p>
            </div>
          )}
        </div>

        <div className="relative my-3 flex min-h-[132px] items-center justify-center gap-6">
          {dice.map((value, index) => {
            const sides = sidesList[index] || sidesList[0] || 20;
            const shown = phase === 'rolling' ? (flicker[index] ?? '?') : settled ? value : `d${sides}`;
            const isDiscarded = settled && index === discardedIndex;
            return (
              <GildedDie
                key={`${roll.rollId}-${index}`}
                sides={sides}
                value={shown}
                state={phase}
                dimmed={isDiscarded}
                critical={settled && index === keptIndex ? criticalTone : undefined}
                label={isDiscarded ? 'Discarded' : dice.length > 1 && settled && index === keptIndex && advantage ? 'Kept' : undefined}
                size={dice.length > 2 ? 84 : dice.length === 2 ? 108 : 124}
              />
            );
          })}
        </div>

        <div className="relative text-center" aria-live="polite">
          {settled ? (
            <>
              <p className="text-[11px] tracking-wide text-amber-100/70" data-testid="gilded-equation">{equation}</p>
              {outcome === 'RESULT' ? (
                <p className={`mt-0.5 text-4xl font-black ${BANNER_TONE.RESULT}`} style={{ fontFamily: 'ui-serif, Georgia, serif' }} data-testid="gilded-total">{roll.total}{resultSuffix ? <span className="ml-2 text-sm font-semibold text-amber-200/80">{resultSuffix}</span> : null}</p>
              ) : (
                <p className={`mt-0.5 text-2xl font-black tracking-wide sm:text-3xl ${BANNER_TONE[outcome]} ${criticalTone ? 'gilded-banner-pop' : ''}`} style={{ fontFamily: 'ui-serif, Georgia, serif' }} data-testid="gilded-banner">
                  {gildedBannerText(outcome, kind)}
                </p>
              )}
            </>
          ) : phase === 'rolling' ? (
            <p className="py-2 text-xs font-semibold uppercase tracking-[0.25em] text-amber-200/80">Rolling…</p>
          ) : (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); throwDice(); }}
              className="rounded-md border border-amber-400/70 bg-gradient-to-b from-amber-400 to-amber-600 px-6 py-1.5 text-sm font-black uppercase tracking-widest text-stone-900 shadow-[0_0_18px_rgba(251,191,36,0.35)] transition hover:from-amber-300 hover:to-amber-500"
              data-testid="gilded-roll-button"
            >
              Roll
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes gilded-tumble {
          0%   { transform: translate3d(-30px,-26px,0) rotate(-40deg) scale(.7); }
          20%  { transform: translate3d(24px,-40px,0) rotate(140deg) scale(.95); }
          45%  { transform: translate3d(-14px,-6px,0) rotate(290deg) scale(1.06); }
          70%  { transform: translate3d(10px,6px,0) rotate(430deg) scale(.98); }
          100% { transform: translate3d(0,0,0) rotate(720deg) scale(1); }
        }
        @keyframes gilded-settle {
          0%   { transform: scale(1.12); }
          60%  { transform: scale(.97); }
          100% { transform: scale(1); }
        }
        @keyframes gilded-banner-pop {
          0%   { transform: scale(.7); opacity: 0; }
          60%  { transform: scale(1.12); opacity: 1; }
          100% { transform: scale(1); }
        }
        .gilded-tumble { animation: gilded-tumble 1s cubic-bezier(.2,.8,.25,1) both; }
        .gilded-settle { animation: gilded-settle .35s ease-out both; }
        .gilded-banner-pop { animation: gilded-banner-pop .45s ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .gilded-tumble, .gilded-settle, .gilded-banner-pop { animation: none; }
        }
      `}</style>
    </div>
  );
};
