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
    <div className={\`rounded-xl border border-stone-900 bg-stone-950/70 px-3 py-3 \${className}\`}>
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
            <RotateCw className={\`h-3.5 w-3.5 \${isRolling ? 'animate-spin' : ''}\`} />
            {isRolling ? 'Rolling…' : 'Roll'}
          </button>
        )}
      </div>

      <div
        className="mt-3 flex flex-wrap justify-center gap-3"
        style={{ perspective: '1100px' }}
      >
        {diceSides.map((sides, index) => {
          const face = faces[index] ?? 1;
          const finalValue = roll.individualDice[index] ?? face;
          const transform = isRolling
            ? \`rotateX(\${720 + index * 97}deg) rotateY(\${1080 + index * 131}deg) rotateZ(\${360 + index * 47}deg) scale(1.05)\`
            : 'rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1)';

          return (
            <div
              key={\`\${roll.rollId}-\${index}\`}
              className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-stone-700 bg-stone-900 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03),0_10px_24px_rgba(0,0,0,0.3)]"
              style={{
                transform,
                transformStyle: 'preserve-3d',
                transition: isRolling
                  ? 'transform 1.35s cubic-bezier(0.17,0.67,0.25,1.05)'
                  : 'transform 280ms ease-out',
              }}
            >
              <div className="absolute left-1.5 top-1 text-[8px] uppercase tracking-wide text-stone-600">
                d{sides}
              </div>
              <span className="text-xl font-semibold text-stone-100">
                {isRolling ? face : revealed ? finalValue : '—'}
              </span>
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
