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
    return roll.diceTerms.flatMap((term) => Array.from({ length: term.count }, () => term.sides));
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

type DieVisualType = 'D4' | 'D6' | 'D8' | 'D10' | 'D12' | 'D20' | 'D100' | 'GENERIC';

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

const DIE_POINTS: Record<DieVisualType, string> = {
  D4: '50,6 92,86 8,86',
  D6: '18,28 66,10 90,26 90,72 42,90 18,74',
  D8: '50,5 94,50 50,95 6,50',
  D10: '50,6 89,30 77,85 23,85 11,30',
  D12: '50,5 78,16 94,50 78,84 50,95 22,84 6,50 22,16',
  D20: '50,4 79,16 95,42 88,73 63,94 37,94 12,73 5,42 21,16',
  D100: '50,4 79,16 95,42 88,73 63,94 37,94 12,73 5,42 21,16',
  GENERIC: '50,4 82,18 94,50 82,82 50,96 18,82 6,50 18,18',
};

const DieFace: React.FC<{ sides: number; value: number }> = ({ sides, value }) => {
  const type = getDieVisualType(sides);
  const points = DIE_POINTS[type];
  const center = type === 'D6' ? { x: 54, y: 54 } : { x: 50, y: 51 };
  const fill = type === 'D100' ? '#be185d' : '#6d28d9';
  const highlight = type === 'D100' ? '#f9a8d4' : '#c4b5fd';
  const shadow = type === 'D100' ? '#831843' : '#4c1d95';

  return (
    <svg viewBox="0 0 100 100" className="h-20 w-20 drop-shadow-[0_12px_22px_rgba(0,0,0,0.38)]" role="img" aria-label={`D${sides} die`}>
      <polygon points={points} fill={fill} stroke="rgba(255,255,255,0.82)" strokeWidth="2" />
      {type === 'D4' ? (
        <>
          <polygon points="50,6 50,86 8,86" fill={highlight} opacity="0.58" />
          <polygon points="50,6 92,86 50,86" fill={shadow} opacity="0.52" />
        </>
      ) : (
        <>
          <polygon
            points={type === 'D6'
              ? '18,28 66,10 54,54'
              : type === 'D8'
              ? '50,5 94,50 50,51'
              : type === 'D10'
              ? '50,6 89,30 50,50 11,30'
              : '50,5 79,16 50,51 21,16'}
            fill={highlight}
            opacity="0.66"
          />
          <polygon
            points={type === 'D6'
              ? '18,28 42,90 54,54'
              : type === 'D8'
              ? '6,50 50,51 50,95'
              : type === 'D10'
              ? '11,30 50,50 23,85'
              : '6,50 50,51 22,84'}
            fill={shadow}
            opacity="0.7"
          />
        </>
      )}
      <text x={center.x} y={center.y - 8} textAnchor="middle" fontSize="8" fontWeight="700" letterSpacing="1.3" fill="rgba(255,255,255,0.78)">
        D{sides}
      </text>
      <text x={center.x} y={center.y + 24} textAnchor="middle" fontSize="25" fontWeight="800" fill="white">
        {value}
      </text>
    </svg>
  );
};


export const DiceRollAnimation: React.FC<DiceRollAnimationProps> = ({
  roll,
  onComplete,
  className = '',
}) => {
  const { playSfx, triggerHaptic } = useAudioHaptic();
  const diceSides = useMemo(() => expandDiceTerms(roll), [roll]);
  const [isRolling, setIsRolling] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [faces, setFaces] = useState<number[]>(() =>
    roll.individualDice.map((value, index) => value || randomFace(diceSides[index] || 20))
  );

  useEffect(() => {
    setFaces(roll.individualDice.map((value, index) => value || randomFace(diceSides[index] || 20)));
    setRevealed(false);
    setIsRolling(false);
  }, [roll, diceSides]);

  const startRoll = () => {
    if (isRolling || revealed) return;

    setIsRolling(true);
    triggerHaptic('medium');
    playSfx('dice.roll', 'HIGH', 0.85);

    const interval = window.setInterval(() => {
      setFaces((current) =>
        current.map((_, index) => randomFace(diceSides[index] || 20))
      );
    }, 75);

    window.setTimeout(() => {
      window.clearInterval(interval);
      setFaces([...roll.individualDice]);
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
          0.8
        );
        triggerHaptic(roll.isCriticalSuccess ? 'heavy' : roll.isCriticalFailure ? 'medium' : 'light');
        onComplete?.();
      }, 180);
    }, 1450);
  };

  return (
    <div className={`rounded-xl border border-violet-400/10 bg-[#0b0712]/75 px-3 py-3 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Dices className="h-3.5 w-3.5 text-stone-600" />
          <span className="text-[10px] uppercase tracking-[0.16em] text-stone-600">
            {roll.formula}
          </span>
        </div>
        {!revealed && (
          <button
            type="button"
            onClick={startRoll}
            disabled={isRolling}
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-950 transition hover:bg-white disabled:cursor-wait disabled:opacity-60"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isRolling ? 'animate-spin' : ''}`} />
            {isRolling ? 'Rolling…' : 'Roll'}
          </button>
        )}
      </div>

      <div
        className="mt-4 flex flex-wrap justify-center gap-4"
        style={{ perspective: '1100px' }}
      >
        {diceSides.map((sides, index) => {
          const face = faces[index] ?? 1;
          const finalValue = roll.individualDice[index] ?? face;
          const transform = isRolling
            ? `rotateX(${720 + index * 97}deg) rotateY(${1080 + index * 131}deg) rotateZ(${360 + index * 47}deg) scale(1.05)`
            : 'rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1)';

          return (
            <div
              key={`${roll.rollId}-${index}`}
              className="relative flex h-20 w-20 items-center justify-center"
              style={{
                transform,
                transformStyle: 'preserve-3d',
                transition: isRolling
                  ? 'transform 1.35s cubic-bezier(0.17,0.67,0.25,1.05)'
                  : 'transform 280ms ease-out',
              }}
            >
              <DieFace sides={sides} value={isRolling ? face : revealed ? finalValue : 1} />
            </div>
          );
        })}
      </div>

      {revealed && (
        <div className="mt-3 flex items-center justify-between border-t border-stone-900 pt-2 text-xs">
          <span className="text-stone-600">
            {roll.individualDice.length > 1 ? 'Dice total' : 'Die result'}
          </span>
          <span className="font-semibold text-stone-200">{roll.individualDice.join(' + ')}</span>
        </div>
      )}
    </div>
  );
};
