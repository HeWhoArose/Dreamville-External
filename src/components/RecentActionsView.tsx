import React from 'react';
import { History } from 'lucide-react';

export const RecentActionsView: React.FC<{ actionHistory: any[] }> = ({ actionHistory }) => {
  const actions = (actionHistory || [])
    .filter((action) => action.actionType !== 'NOTE_RECORD')
    .slice(0, 30);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="rounded-3xl border border-violet-400/10 bg-[#0b0813]/85 p-6">
        <div className="flex items-center gap-3">
          <History className="h-5 w-5 text-violet-300" />
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-violet-300/70">Player history</p>
            <h1 className="text-2xl font-semibold text-white">Recent Actions</h1>
          </div>
        </div>
        <p className="mt-2 text-sm text-stone-500">Only your submitted actions appear here. Dice, outcomes, consequences, and narration stay in the active scene.</p>
      </header>
      {actions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-stone-600">No player actions yet.</div>
      ) : (
        <div className="space-y-2">
          {actions.map((action) => (
            <article key={action.id} className="rounded-2xl border border-white/8 bg-[#0b0813]/75 px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-violet-400" />
                <div className="min-w-0">
                  <p className="text-sm text-stone-200">{action.description}</p>
                  <p className="mt-1 text-[10px] text-stone-600">{action.timestamp} · Cycle {action.cycle}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
