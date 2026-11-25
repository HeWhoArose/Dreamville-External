import React from 'react';
import type { CombatEffectScale } from '../../types';

const SCALES: CombatEffectScale[] = ['PERSON', 'GROUP', 'ENCOUNTER', 'STRUCTURE', 'DISTRICT', 'CITY', 'REGION', 'CONTINENT', 'PLANET', 'COSMIC'];

interface WorldEffectPreviewProps {
  preview?: {
    scale: CombatEffectScale;
    outcome?: string;
    targetIds: string[];
    abstraction: 'TACTICAL' | 'MACRO';
    changedScopes: string[];
  } | null;
  /** True when this is a sandbox preview and nothing has been applied. */
  simulated?: boolean;
}

/**
 * What an effect would do to the world, before and apart from any hit points. A city or planet effect resolves as a macro event
 * (changed districts, factions, conditions), not as damage to millions of individual combatants.
 */
export function WorldEffectPreview({ preview, simulated = true }: WorldEffectPreviewProps) {
  if (!preview) return null;
  const reached = SCALES.indexOf(preview.scale);
  return (
    <div className="rounded border border-violet-900/60 bg-violet-950/20 p-2 text-[10px] text-stone-300 space-y-1.5" data-testid="world-effect-preview">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-violet-300">World effect{simulated ? ' preview' : ''}</span>
        <span className={`rounded px-1.5 py-0.5 font-mono ${preview.abstraction === 'MACRO' ? 'bg-amber-900/40 text-amber-300' : 'bg-stone-900 text-stone-300'}`}>
          {preview.abstraction === 'MACRO' ? 'World event' : 'Tactical'}
        </span>
      </div>
      <div className="flex gap-0.5" role="img" aria-label={`Scale ${preview.scale.toLowerCase()}`}>
        {SCALES.map((scale, index) => (
          <div key={scale} title={scale.toLowerCase()} className={`h-1.5 flex-1 rounded ${index <= reached ? 'bg-violet-500' : 'bg-stone-800'}`} />
        ))}
      </div>
      <div>
        Scale <span className="font-semibold text-stone-100">{preview.scale.toLowerCase()}</span>
        {preview.outcome ? <> · outcome <span className="font-semibold text-stone-100">{preview.outcome.replace(/_/g, ' ').toLowerCase()}</span></> : null}
      </div>
      {preview.changedScopes.length > 0 && (
        <div className="text-stone-400">Changes: {preview.changedScopes.join(', ')}</div>
      )}
      {preview.abstraction === 'MACRO' && (
        <div className="text-stone-500">Resolves as a change to the world, not as damage to individual creatures.</div>
      )}
      {simulated && <div className="text-stone-500">Nothing has been applied to the live world.</div>}
    </div>
  );
}
