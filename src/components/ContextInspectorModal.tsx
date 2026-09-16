import React, { useState, useEffect } from 'react';
import { X, Layers, Cpu, ShieldCheck, AlertCircle, RefreshCw, Sliders, CheckCircle, Database } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import { WorkingContextResponse, ContextInspectionResponse, PriorityBand } from '../types';

interface ContextInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ContextInspectorModal: React.FC<ContextInspectorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [budget, setBudget] = useState<number>(400);
  const [playerAction, setPlayerAction] = useState<string>('Observe surroundings');
  const [contextData, setContextData] = useState<WorkingContextResponse | null>(null);
  const [inspectionData, setInspectionData] = useState<ContextInspectionResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'assembled' | 'packet' | 'bands' | 'eviction'>('assembled');

  const fetchContext = async () => {
    setIsLoading(true);
    try {
      const [ctx, insp] = await Promise.all([
        apiClient.assembleContext({
          storyId: 'default_story',
          playerAction,
          hardTokenBudget: budget,
        }),
        apiClient.inspectContext({
          storyId: 'default_story',
          budget,
        }),
      ]);
      setContextData(ctx);
      setInspectionData(insp);
    } catch (err) {
      console.error('Failed to assemble or inspect working context:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchContext();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getBandBadgeColor = (band: PriorityBand | string) => {
    switch (band) {
      case 'B1_CRITICAL':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'B2_IMMEDIATE':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'B3_CAUSAL_OPPORTUNITY':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'B4_EPISODIC':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'B5_SEMANTIC_LORE':
        return 'bg-stone-500/10 text-stone-400 border-stone-500/30';
      default:
        return 'bg-stone-800 text-stone-300 border-stone-700';
    }
  };

  const usedTokens = contextData?.totalTokens ?? 0;
  const maxBudget = contextData?.hardTokenBudget ?? budget;
  const budgetPercent = Math.min(100, Math.round((usedTokens / maxBudget) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-md">
      <div className="bg-stone-900 border border-stone-750 rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl relative">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-stone-800 bg-stone-900/90">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif font-bold text-stone-100 text-base">
                  Working Context & Token Budget Inspector
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[10px]">
                  CH11 Canonical Assembly
                </span>
              </div>
              <p className="text-[11px] font-mono text-stone-400">
                DreamBook §440 • Pure Assembly Layer • Strict Priority Band Eviction
              </p>
            </div>
          </div>
          <button
            id="close-context-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-stone-850 text-stone-400 hover:text-stone-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls Bar */}
        <div className="bg-stone-950/60 border-b border-stone-800 px-5 py-3 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
          <div className="flex items-center gap-3 flex-1 min-w-[280px]">
            <span className="text-stone-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              Budget:
            </span>
            <input
              type="range"
              min="100"
              max="1200"
              step="50"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="accent-amber-400 flex-1 max-w-[180px]"
            />
            <span className="text-amber-300 font-bold px-2 py-0.5 bg-stone-850 border border-stone-750 rounded">
              {budget} tokens
            </span>
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            <input
              type="text"
              value={playerAction}
              onChange={(e) => setPlayerAction(e.target.value)}
              placeholder="Simulated player action..."
              className="bg-stone-900 border border-stone-750 rounded-lg px-3 py-1.5 text-stone-200 text-xs w-full focus:outline-none focus:border-amber-400/50"
            />
            <button
              onClick={fetchContext}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition flex items-center gap-1.5 font-sans font-medium text-xs whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Assemble
            </button>
          </div>
        </div>

        {/* Token Budget Meter */}
        <div className="bg-stone-900/50 px-5 py-3 border-b border-stone-800">
          <div className="flex items-center justify-between text-xs font-mono mb-1.5">
            <span className="text-stone-300 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              Token Budget Utilization
            </span>
            <div className="flex items-center gap-2">
              <span className="text-stone-400 font-normal">
                {usedTokens} / {maxBudget} tokens
              </span>
              <span
                className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
                  budgetPercent > 90
                    ? 'bg-red-500/20 text-red-300'
                    : 'bg-emerald-500/20 text-emerald-300'
                }`}
              >
                {budgetPercent}%
              </span>
            </div>
          </div>
          <div className="w-full h-2 rounded-full bg-stone-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                budgetPercent > 90 ? 'bg-red-400' : 'bg-amber-400'
              }`}
              style={{ width: `${budgetPercent}%` }}
            />
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-stone-800 bg-stone-900 text-xs">
          <button
            onClick={() => setActiveTab('assembled')}
            className={`pb-2.5 px-2 border-b-2 font-medium transition ${
              activeTab === 'assembled'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            Assembled Prompt ({contextData?.includedChunks.length ?? 0} Chunks)
          </button>
          <button
            onClick={() => setActiveTab('packet')}
            className={`pb-2.5 px-2 border-b-2 font-medium transition ${
              activeTab === 'packet'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            13-Domain Working Packet
          </button>
          <button
            onClick={() => setActiveTab('bands')}
            className={`pb-2.5 px-2 border-b-2 font-medium transition ${
              activeTab === 'bands'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            Priority Bands (B1–B5)
          </button>
          <button
            onClick={() => setActiveTab('eviction')}
            className={`pb-2.5 px-2 border-b-2 font-medium transition ${
              activeTab === 'eviction'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            Eviction Log ({contextData?.evictedChunkLabels.length ?? 0})
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 text-xs">
          {activeTab === 'assembled' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-stone-400 font-mono text-[11px]">
                <span>Delimited Prompt Payload</span>
                <span>Framing Overhead: Included</span>
              </div>
              <pre className="bg-stone-950 border border-stone-800 rounded-xl p-4 text-stone-200 font-mono text-xs whitespace-pre-wrap leading-relaxed overflow-x-auto">
                {contextData?.assembledText || 'No context assembled.'}
              </pre>
            </div>
          )}

          {activeTab === 'packet' && contextData?.packet && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-stone-950 border border-stone-800 rounded-xl p-3.5 space-y-1">
                <span className="text-amber-400 font-mono text-[11px] uppercase tracking-wider">
                  1. Scene
                </span>
                <p className="text-stone-200 font-serif text-xs">{contextData.packet.scene}</p>
              </div>

              <div className="bg-stone-950 border border-stone-800 rounded-xl p-3.5 space-y-1">
                <span className="text-amber-400 font-mono text-[11px] uppercase tracking-wider">
                  2. World Time
                </span>
                <p className="text-stone-200 font-mono text-xs">{contextData.packet.time}</p>
              </div>

              <div className="bg-stone-950 border border-stone-800 rounded-xl p-3.5 space-y-1">
                <span className="text-amber-400 font-mono text-[11px] uppercase tracking-wider">
                  3. Player State
                </span>
                <p className="text-stone-200 font-mono text-xs">{contextData.packet.playerState}</p>
              </div>

              <div className="bg-stone-950 border border-stone-800 rounded-xl p-3.5 space-y-1">
                <span className="text-amber-400 font-mono text-[11px] uppercase tracking-wider">
                  4. Visible Entities
                </span>
                <ul className="text-stone-200 font-mono text-xs list-disc list-inside space-y-0.5">
                  {contextData.packet.visibleEntities.length > 0
                    ? contextData.packet.visibleEntities.map((e, idx) => <li key={idx}>{e}</li>)
                    : <li className="text-stone-500">None in direct proximity</li>}
                </ul>
              </div>

              <div className="bg-stone-950 border border-stone-800 rounded-xl p-3.5 space-y-1">
                <span className="text-amber-400 font-mono text-[11px] uppercase tracking-wider">
                  5. Active Conditions
                </span>
                <ul className="text-stone-200 font-mono text-xs list-disc list-inside space-y-0.5">
                  {contextData.packet.activeConditions.length > 0
                    ? contextData.packet.activeConditions.map((c, idx) => <li key={idx}>{c}</li>)
                    : <li className="text-stone-500">Nominal</li>}
                </ul>
              </div>

              <div className="bg-stone-950 border border-stone-800 rounded-xl p-3.5 space-y-1">
                <span className="text-amber-400 font-mono text-[11px] uppercase tracking-wider">
                  6. Relevant Capabilities
                </span>
                <ul className="text-stone-200 font-mono text-xs list-disc list-inside space-y-0.5">
                  {contextData.packet.relevantCapabilities.length > 0
                    ? contextData.packet.relevantCapabilities.map((c, idx) => <li key={idx}>{c}</li>)
                    : <li className="text-stone-500">None available</li>}
                </ul>
              </div>

              <div className="bg-stone-950 border border-stone-800 rounded-xl p-3.5 space-y-1">
                <span className="text-amber-400 font-mono text-[11px] uppercase tracking-wider">
                  7. Relevant Memories
                </span>
                <ul className="text-stone-200 font-mono text-xs list-disc list-inside space-y-0.5">
                  {contextData.packet.relevantMemories.length > 0
                    ? contextData.packet.relevantMemories.map((m, idx) => <li key={idx}>{m}</li>)
                    : <li className="text-stone-500">No memories recalled</li>}
                </ul>
              </div>

              <div className="bg-stone-950 border border-stone-800 rounded-xl p-3.5 space-y-1">
                <span className="text-amber-400 font-mono text-[11px] uppercase tracking-wider">
                  13. Committed State Changes
                </span>
                <ul className="text-stone-200 font-mono text-xs list-disc list-inside space-y-0.5">
                  {contextData.packet.committedStateChanges.length > 0
                    ? contextData.packet.committedStateChanges.map((c, idx) => <li key={idx}>{c}</li>)
                    : <li className="text-stone-500">No recent changes</li>}
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'bands' && (
            <div className="space-y-4">
              <div className="grid grid-cols-5 gap-2 text-center font-mono text-xs">
                {Object.entries(inspectionData?.bandBreakdown || {}).map(([band, info]) => (
                  <div
                    key={band}
                    className="p-3 bg-stone-950 border border-stone-800 rounded-xl space-y-1"
                  >
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] border ${getBandBadgeColor(band)}`}>
                      {band.replace('B', 'Band ')}
                    </span>
                    <div className="text-sm font-bold text-stone-100">
                      {info.includedCount} / {info.totalCandidateCount}
                    </div>
                    <div className="text-[10px] text-stone-500">
                      {info.evictedCount} evicted
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2 mt-4">
                <h4 className="font-mono text-xs text-stone-400">Included Candidate Chunks</h4>
                <div className="space-y-2">
                  {contextData?.includedChunks.map((chunk, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-stone-950 border border-stone-800 rounded-xl flex items-center justify-between gap-4 font-mono text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`px-2 py-0.5 rounded border text-[10px] ${getBandBadgeColor(chunk.band)}`}>
                          {chunk.band}
                        </span>
                        <span className="text-stone-200 font-medium">{chunk.label}</span>
                        {chunk.isProtected && (
                          <span className="px-1.5 py-0.2 text-[9px] rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            PROTECTED
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-stone-400 text-[11px]">
                        <span>~{chunk.estimatedTokens} tokens</span>
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'eviction' && (
            <div className="space-y-3">
              {contextData?.evictedChunkLabels && contextData.evictedChunkLabels.length > 0 ? (
                <div className="space-y-2">
                  {contextData.evictedChunkLabels.map((label, idx) => {
                    const cleanLabel = label.split(' (')[0];
                    const reason = contextData.evictionReasons[cleanLabel] || 'Exceeds token budget';
                    return (
                      <div
                        key={idx}
                        className="p-3 bg-stone-950 border border-stone-800 rounded-xl flex items-center justify-between gap-4 font-mono text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                          <span className="text-stone-300 font-medium">{label}</span>
                        </div>
                        <span className="text-stone-400 text-[11px] italic">{reason}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10 text-stone-500 font-mono text-xs">
                  Zero chunks evicted. All candidate chunks fit comfortably within the {maxBudget} token budget.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-stone-800 bg-stone-900/80 flex items-center justify-between text-[11px] font-mono text-stone-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Epistemic Guardrails: Zero private memory leaks • Pure read-model assembly</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-800 hover:bg-stone-750 text-stone-200 rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
