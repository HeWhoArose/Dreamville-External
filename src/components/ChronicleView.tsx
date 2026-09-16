import React, { useState } from 'react';
import { PlayerKnowledge, ActionLog, ChronicleEntry } from '../types';
import { BookOpen, CheckCircle2, History, AlertCircle, Scroll, Landmark, Sparkles } from 'lucide-react';

interface ChronicleViewProps {
  knowledgeBase: PlayerKnowledge[];
  actionHistory: ActionLog[];
  engineContractVersion: string;
  chronicleEntries?: ChronicleEntry[];
}

export const ChronicleView: React.FC<ChronicleViewProps> = ({
  knowledgeBase,
  actionHistory,
  engineContractVersion,
  chronicleEntries = [],
}) => {
  const [activeSection, setActiveSection] = useState<'chronicle' | 'knowledge' | 'validation'>('chronicle');

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            World Chronicle (CH4)
          </span>
          <div className="text-lg font-mono font-bold text-amber-400">
            {chronicleEntries.length} Recorded
          </div>
          <span className="text-xs text-stone-400">
            Authoritative Historical Ledger
          </span>
        </div>

        <div className="bg-stone-900/60 rounded-2xl border border-stone-800 p-4">
          <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 block mb-1">
            Player Knowledge
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
            {actionHistory.length} Validated
          </div>
          <span className="text-xs text-stone-400">
            Processed via MockEngineAdapter
          </span>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-stone-800 pb-2">
        <button
          id="tab-view-world-chronicle"
          onClick={() => setActiveSection('chronicle')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition ${
            activeSection === 'chronicle'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-stone-400 hover:text-stone-200 bg-stone-900/40 border border-stone-800'
          }`}
        >
          <Scroll className="w-3.5 h-3.5" />
          <span>Historical Chronicle ({chronicleEntries.length})</span>
        </button>

        <button
          id="tab-view-player-knowledge"
          onClick={() => setActiveSection('knowledge')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition ${
            activeSection === 'knowledge'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-stone-400 hover:text-stone-200 bg-stone-900/40 border border-stone-800'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Knowledge Base ({knowledgeBase.length})</span>
        </button>

        <button
          id="tab-view-validation-stream"
          onClick={() => setActiveSection('validation')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition ${
            activeSection === 'validation'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-stone-400 hover:text-stone-200 bg-stone-900/40 border border-stone-800'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Validation Stream ({actionHistory.length})</span>
        </button>
      </div>

      {/* Section 1: Historical Chronicle (CH4) */}
      {activeSection === 'chronicle' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-stone-800">
            <h3 className="text-sm font-mono uppercase tracking-wider text-stone-200 font-semibold flex items-center gap-2">
              <Landmark className="w-4 h-4 text-amber-400" />
              <span>Authoritative World Chronicle (Epistemically Filtered)</span>
            </h3>
            <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              Deterministic Significance Evaluator
            </span>
          </div>

          {chronicleEntries.length === 0 ? (
            <div className="rounded-xl border border-stone-800 bg-stone-900/30 p-8 text-center text-stone-500 text-xs">
              No historical chronicle milestones recorded yet for this era.
            </div>
          ) : (
            <div className="space-y-3">
              {chronicleEntries.map((entry) => {
                const isHistoric = entry.significance === 'HISTORIC';
                const isSignificant = entry.significance === 'SIGNIFICANT';

                return (
                  <div
                    key={entry.id}
                    className={`rounded-xl border p-4 space-y-2 transition ${
                      isHistoric
                        ? 'bg-amber-950/20 border-amber-500/40 shadow-sm'
                        : isSignificant
                        ? 'bg-purple-950/20 border-purple-500/40'
                        : 'bg-stone-900/70 border-stone-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles
                          className={`w-4 h-4 flex-shrink-0 ${
                            isHistoric
                              ? 'text-amber-400'
                              : isSignificant
                              ? 'text-purple-400'
                              : 'text-stone-400'
                          }`}
                        />
                        <h4 className="font-serif font-bold text-stone-100 text-sm">
                          {entry.headline}
                        </h4>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span
                          className={`text-[9px] font-mono uppercase font-bold px-2 py-0.5 rounded border ${
                            isHistoric
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : isSignificant
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                              : 'bg-stone-800 text-stone-400 border-stone-700'
                          }`}
                        >
                          {entry.significance}
                        </span>
                        <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded bg-stone-800 text-stone-400 border border-stone-700">
                          {entry.category.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-stone-300 leading-relaxed font-serif pl-6">
                      {entry.historicalAccount}
                    </p>

                    <div className="pt-2 border-t border-stone-850 flex items-center justify-between text-[10px] font-mono text-stone-500 pl-6">
                      <span>Location: {entry.locationId}</span>
                      <span>
                        Time: Year {entry.timestamp.year}, Month {entry.timestamp.month}, Day {entry.timestamp.day} ({entry.timestamp.hour.toString().padStart(2, '0')}:{entry.timestamp.minute.toString().padStart(2, '0')})
                      </span>
                      <span>Provenance: {entry.provenance}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Section 2: Player Knowledge Base */}
      {activeSection === 'knowledge' && (
        <div className="space-y-4">
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
      )}

      {/* Section 3: Action Request Validation Stream */}
      {activeSection === 'validation' && (
        <div className="space-y-4">
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
      )}
    </div>
  );
};

