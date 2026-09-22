import React, { useEffect, useMemo, useState } from 'react';
import type { CombatAnimationPlan, CombatAttackInstanceResult } from '../../types';

interface CombatAnimationLayerProps {
    plan?: CombatAnimationPlan | null;
    instances?: CombatAttackInstanceResult[];
    presentationMode?: 'FULL' | 'FAST' | 'TEXT' | 'LOG';
    onComplete?: () => void;
}

export const CombatAnimationLayer: React.FC<CombatAnimationLayerProps> = ({
    plan, instances = [], presentationMode = 'FULL', onComplete,
}) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const [running, setRunning] = useState(false);

    const visibleInstances = useMemo(
        () => instances.filter((instance) => instance && instance.targetId),
        [instances],
    );

    useEffect(() => {
        setActiveIndex(0);
        setRunning(Boolean(plan && visibleInstances.length && presentationMode === 'FULL'));
    }, [plan?.id, visibleInstances.length, presentationMode]);

    useEffect(() => {
        if (!running || !plan || !visibleInstances.length) return;
        if (plan.sequence !== 'SEQUENTIAL' || presentationMode !== 'FULL') {
            setRunning(false);
            onComplete?.();
            return;
        }
        const timer = window.setTimeout(() => {
            if (activeIndex + 1 >= visibleInstances.length) {
                setRunning(false);
                onComplete?.();
                return;
            }
            setActiveIndex((index) => index + 1);
        }, 320);
        return () => window.clearTimeout(timer);
    }, [activeIndex, running, plan, visibleInstances.length, presentationMode, onComplete]);

    if (!plan || !visibleInstances.length) return null;

    const active = visibleInstances[Math.min(activeIndex, visibleInstances.length - 1)];
    const hitCount = visibleInstances.filter((item) => item.hits).length;
    const missCount = visibleInstances.length - hitCount;

    if (presentationMode === 'LOG') return (
        <div className="mt-3 rounded-lg border border-violet-900/50 bg-stone-950/80 p-3 text-[11px] font-mono text-stone-300">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-violet-300">{plan.composition}</span>
                <span className="text-stone-500">{visibleInstances.length} instance(s)</span>
            </div>
            <div className="space-y-1">
                {visibleInstances.map((instance) => (
                    <div key={instance.instanceIndex} className="flex items-center justify-between gap-2">
                        <span>{'#' + (instance.instanceIndex + 1) + ' → ' + instance.targetId}</span>
                        <span className={instance.isCritical ? 'text-amber-300' : instance.hits ? 'text-emerald-300' : 'text-stone-500'}>
                            {instance.isCritical ? 'CRIT' : instance.hits ? ('HIT ' + instance.damage) : 'MISS'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );

    if (presentationMode === 'TEXT') return (
        <div className="mt-3 rounded-lg border border-violet-900/50 bg-violet-950/20 p-3 text-xs text-stone-300">
            {plan.composition.replace(/_/g, ' ')} resolved {visibleInstances.length} effect instance(s). {hitCount} hit, {missCount} missed.
        </div>
    );

    if (presentationMode === 'FAST') return (
        <div className="mt-3 rounded-lg border border-violet-800/50 bg-stone-950/80 p-3">
            <div className="flex flex-wrap gap-1.5">
                {visibleInstances.map((instance) => (
                    <span key={instance.instanceIndex} className={
                        'rounded-full border px-2 py-1 text-[10px] font-mono ' +
                        (instance.isCritical
                            ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                            : instance.hits
                                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                                : 'border-stone-700 bg-stone-900 text-stone-500')
                    }>
                        {instance.isCritical
                            ? '#' + (instance.instanceIndex + 1) + ' CRIT ' + instance.damage
                            : instance.hits
                                ? '#' + (instance.instanceIndex + 1) + ' HIT ' + instance.damage
                                : '#' + (instance.instanceIndex + 1) + ' MISS'}
                    </span>
                ))}
            </div>
        </div>
    );

    const assetUrl = plan.assetUrls?.[0];

    return (
        <div className="mt-3 overflow-hidden rounded-xl border border-violet-800/50 bg-gradient-to-r from-violet-950/20 via-stone-950 to-cyan-950/20 p-3">
            <div className="mb-2 flex items-center justify-between">
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-violet-300">Combat Presentation</div>
                    <div className="text-xs font-semibold text-stone-200">{plan.composition.replace(/_/g, ' ')}</div>
                </div>
                <div className="text-[10px] font-mono text-stone-500">{Math.min(activeIndex + 1, visibleInstances.length) + ' / ' + visibleInstances.length}</div>
            </div>
            <div className="relative h-16 overflow-hidden rounded-lg border border-stone-800 bg-black/40">
                {assetUrl && (
                    <img
                        src={assetUrl}
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 h-full w-full object-cover opacity-30"
                        loading="lazy"
                    />
                )}
                <div className="absolute left-4 top-1/2 h-2 w-14 -translate-y-1/2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.85)] animate-pulse" />
                <div className={
                    'absolute left-20 top-1/2 h-px -translate-y-1/2 transition-all duration-300 ' +
                    (active.hits
                        ? 'w-[55%] bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.8)]'
                        : 'w-[45%] bg-stone-600')
                } />
                <div className={
                    'absolute right-5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border text-[9px] font-bold ' +
                    (active.isCritical
                        ? 'border-amber-300 bg-amber-400/20 text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.6)]'
                        : active.hits
                            ? 'border-red-300 bg-red-500/20 text-red-200'
                            : 'border-stone-700 bg-stone-900 text-stone-500')
                }>
                    {active.isCritical ? 'CRIT' : active.hits ? String(active.damage) : 'MISS'}
                </div>
            </div>
        </div>
    );
};

export default CombatAnimationLayer;