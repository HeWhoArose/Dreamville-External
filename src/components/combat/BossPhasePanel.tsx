import React from 'react';
import type { BattlefieldParticipant } from '../../types';

interface BossPhasePanelProps {
  participants: BattlefieldParticipant[];
}

/**
 * Shows each boss's current phase as canonical state: which phase it is in, the changes the phase made, the abilities it unlocked
 * and the special resources the boss is holding. A phase change is an engine event, not something the narrator invents.
 */
export function BossPhasePanel({ participants }: BossPhasePanelProps) {
  const bosses = participants.filter((participant) => participant.bossPhaseId && !participant.isDead);
  if (bosses.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="boss-phase-panel">
      {bosses.map((boss) => {
        const percent = boss.hpMax > 0 ? Math.max(0, Math.min(100, Math.round((boss.hpCurrent / boss.hpMax) * 100))) : 0;
        const modifiers = Object.entries(boss.bossPhaseModifiers || {});
        const resources = Object.entries(boss.combatResources || {});
        return (
          <div key={boss.id} className="rounded border border-red-900/60 bg-red-950/20 p-2 text-[10px] text-stone-300 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-red-300">{boss.name}</span>
              <span className="font-mono text-stone-400">{percent}% health</span>
            </div>
            <div className="text-stone-200">Phase: <span className="font-semibold">{boss.bossPhaseId}</span></div>
            {boss.bossTargetPriority && <div>Targets: <span className="text-stone-400">{boss.bossTargetPriority.replace(/_/g, ' ').toLowerCase()}</span></div>}
            {modifiers.length > 0 && (
              <div>
                Phase changes:{' '}
                {modifiers.map(([target, value]) => (
                  <span key={target} className="mr-2 font-mono text-amber-300">{target.replace(/^.*\./, '')} {value >= 0 ? '+' : ''}{value}</span>
                ))}
              </div>
            )}
            {(boss.bossPhaseAbilities || []).length > 0 && (
              <div>Abilities: <span className="text-stone-400">{(boss.bossPhaseAbilities || []).map((id) => id.replace(/_/g, ' ')).join(', ')}</span></div>
            )}
            {resources.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {resources.map(([name, amount]) => (
                  <span key={name} className="rounded bg-stone-900 px-1.5 py-0.5 font-mono text-violet-300">{name.replace(/_/g, ' ')}: {amount}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
