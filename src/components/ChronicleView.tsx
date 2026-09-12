import React from 'react';
import { PlayerKnowledge, ActionLog } from '../types';
import { BookOpen, CheckCircle2, History, AlertCircle } from 'lucide-react';

interface ChronicleViewProps {
  knowledgeBase: PlayerKnowledge[];
  actionHistory: ActionLog[];
  engineContractVersion: string;
}

export const ChronicleView: React.FC<ChronicleViewProps> = ({
  knowledgeBase,
  actionHistory,
  engineContractVersion,
}) => {
  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-stone-900/60 rounded-2xl border border-stone-800 p-4">
          <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 block mb-1">
            Engine Contract
          </span>
          <div className="text-lg font-mono font-bold text-amber-300">
            {engineContractVersion}
          </div>
          <span className="text-xs text-stone-400">
            Downstream Presentation Boundary
          </span>
        </div>

        <div className="bg-stone-900/60 rounded-2xl border border-stone-800 p-4">
          <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 block mb-1">
            Player Knowledge Entries
          </span>
          <div className="text-lg font-mono font-bold text-emerald-400">
            {knowledgeBase.length} Unlocked
          </div>
          <span className="text-xs text-stone-400">
            Epistemically Authorized to Protagonist
          </span>
        </div>

        <div className="bg-stone-900/60 rounded-2xl border border-stone-800 p-4">
          <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 block mb-1">
            Mock Engine Commits
          </span>
          <div className="text-lg font-mono font-bold text-stone-200">
            {actionHistory.length} Validated Requests
          </div>
          <span className="text-xs text-stone-400">
            Processed via MockEngineAdapter
          </span>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Knowledge Base Section (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-stone-800">
            <h3 className="text-sm font-mono uppercase tracking-wider text-stone-200 font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span>Player Knowledge Base ({knowledgeBase.length})</span>
            </h3>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Bounded Viewer
            </span>
          </div>

          <div className="space-y-3">
            {knowledgeBase.map((kb) => (
              <div
                key={kb.id}
                className="bg-stone-900/70 rounded-xl border border-stone-800 p-4 space-y-2 hover:border-amber-500/30 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-serif font-bold text-stone-100 text-sm">
                    {kb.title}
                  </h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-800 text-amber-400/90 border border-stone-700">
                    {kb.category}
                  </span>
                </div>

                <p className="text-xs text-stone-300 leading-relaxed font-serif">
                  {kb.summary}
                </p>

                <div className="pt-2 border-t border-stone-850 flex items-center justify-between text-[10px] font-mono text-stone-500">
                  <span>Source: {kb.source}</span>
                  <span>Acquired: Cycle {kb.acquiredAtCycle}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Request Validation Stream (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-stone-800">
            <h3 className="text-sm font-mono uppercase tracking-wider text-stone-200 font-semibold flex items-center gap-2">
              <History className="w-4 h-4 text-amber-400" />
              <span>Engine Validation Stream</span>
            </h3>
            <span className="text-[10px] font-mono text-stone-400">
              Deterministic Verification
            </span>
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {actionHistory.map((act) => {
              const isRejected = act.epistemicValidation === 'REJECTED_BY_ENGINE';
              return (
                <div
                  key={act.id}
                  className="bg-stone-900/70 rounded-xl border border-stone-800 p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isRejected ? (
                        <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      )}
                      <span className="text-xs font-mono font-bold text-stone-200 uppercase">
                        {act.actionType}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-stone-500">
                      {act.timestamp} • Cycle {act.cycle}
                    </span>
                  </div>

                  <p className="text-xs text-stone-300 font-medium">
                    {act.description}
                  </p>

                  <div className="bg-stone-950/70 rounded-lg p-2.5 border border-stone-850 text-[11px] font-mono text-stone-300">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase text-stone-500 font-bold">
                        Engine Transition:
                      </span>
                      <span
                        className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-mono ${
                          isRejected
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        }`}
                      >
                        {act.epistemicValidation}
                      </span>
                    </div>
                    <span className={isRejected ? 'text-rose-300' : 'text-emerald-400/90'}>
                      {act.authoritativeFeedback}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
