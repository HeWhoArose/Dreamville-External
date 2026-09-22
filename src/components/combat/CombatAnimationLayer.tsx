import React, { useEffect, useMemo, useState } from 'react';
import type { CombatAnimationPlan, CombatEventRecord } from '../../types';

interface CombatAnimationLayerProps {
  plan?: CombatAnimationPlan | null;
  events?: CombatEventRecord[];
  mode?: 'FULL' | 'FAST' | 'TEXT' | 'LOG';
  onComplete?: () => void;
}

export const CombatAnimationLayer: React.FC<CombatAnimationLayerProps> = ({ plan, events = [], mode = 'FULL', onComplete }) => {
  const [visibleIndex, setVisibleIndex] = useState(0);
  const resolvedEvents = useMemo(() => events.slice(-Math.max(1, plan?.count || events.length || 1)), [events, plan?.count]);

  useEffect(() => {
    setVisibleIndex(0);
    if (!resolvedEvents.length || mode === 'TEXT' || mode === 'LOG') { onComplete?.(); return; }
    const interval = mode === 'FAST' ? 80 : plan?.sequence === 'PARALLEL' ? 0 : 220;
    if (interval === 0) { setVisibleIndex(resolvedEvents.length); onComplete?.(); return; }
    const timer = window.setInterval(() => {
      setVisibleIndex((current) => {
        const next = current + 1;
        if (next >= resolvedEvents.length) { window.clearInterval(timer); onComplete?.(); return resolvedEvents.length; }
        return next;
      });
    }, interval);
    return () => window.clearInterval(timer);
  }, [resolvedEvents, mode, plan?.sequence, onComplete]);

  if (!resolvedEvents.length && !plan) return null;

  const shown = mode === 'FULL' || mode === 'FAST' ? resolvedEvents.slice(0, visibleIndex) : resolvedEvents;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center px-3">
      <div className="max-w-xl w-full rounded-xl border border-violet-800/50 bg-black/65 backdrop-blur-sm shadow-2xl px-3 py-2">
        {mode === 'TEXT' || mode === 'LOG' ? (
          <div className="space-y-1">
            {shown.slice(-6).map((event) => (
              <div key={event.eventId} className="text-[10px] text-stone-300">
                {event.headline}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 overflow-x-auto">
            {shown.map((event) => {
              const critical = event.isCritical;
              const hit = event.eventType === 'ATTACK_INSTANCE_RESOLVED' ? event.damage !== undefined && event.damage > 0 : event.eventType === 'AREA_DAMAGE_RESOLVED';
              return (
                <div key={event.eventId} className={`min-w-[82px] rounded-lg px-2 py-1.5 border ${critical ? 'border-amber-500/60 bg-amber-950/60' : hit ? 'border-violet-600/50 bg-violet-950/50' : 'border-stone-700 bg-stone-950/70'}`}>
                  <div className="text-[9px] text-stone-500">#{(event.instanceIndex ?? 0) + 1}</div>
                  <div className="text-[10px] font-semibold text-stone-100">{critical ? 'CRITICAL' : hit ? 'HIT' : 'MISS'}</div>
                  {event.damage !== undefined && <div className="text-[9px] text-violet-300">{event.damage} dmg</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
