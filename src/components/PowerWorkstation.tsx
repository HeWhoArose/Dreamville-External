import React, { useState } from 'react';
import {
  PowerState,
  CapabilityDefinition,
  CapabilityGraphNode,
  ApprovedConsequence,
} from '../types';
import { apiClient } from '../services/apiClient';
import {
  Sparkles,
  Shield,
  Zap,
  Activity,
  AlertTriangle,
  Flame,
  Layers,
  Play,
  PlusCircle,
  RefreshCw,
  GitBranch,
} from 'lucide-react';

interface PowerWorkstationProps {
  powerState: PowerState | null;
  capabilities: CapabilityDefinition[];
  graph: CapabilityGraphNode[];
  onRefresh: () => void;
}

export const PowerWorkstation: React.FC<PowerWorkstationProps> = ({
  powerState,
  capabilities,
  graph,
  onRefresh,
}) => {
  const [selectedCapId, setSelectedCapId] = useState<string>(capabilities[0]?.id || '');
  const [requestedScale, setRequestedScale] = useState<'Minor' | 'Moderate' | 'Major' | 'WorldScale'>('Moderate');
  const [isAdjudicating, setIsAdjudicating] = useState<boolean>(false);
  const [lastConsequence, setLastConsequence] = useState<ApprovedConsequence | null>(null);
  const [adjudicationError, setAdjudicationError] = useState<string | null>(null);

  // Synthesis Form State
  const [synthName, setSynthName] = useState<string>('');
  const [synthDesc, setSynthDesc] = useState<string>('');
  const [synthTags, setSynthTags] = useState<string>('');
  const [synthTier, setSynthTier] = useState<'Minor' | 'Moderate' | 'Major' | 'WorldScale'>('Moderate');
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [synthMessage, setSynthMessage] = useState<string | null>(null);

  const selectedCap = capabilities.find((c) => c.id === selectedCapId);

  const handleAdjudicate = async () => {
    if (!selectedCapId) return;
    setIsAdjudicating(true);
    setAdjudicationError(null);
    try {
      const res = await apiClient.adjudicateCapability({
        intendedCapabilityId: selectedCapId,
        requestedScale,
        actionDescription: `Invoking ${selectedCap?.name || selectedCapId}`,
      });
      setLastConsequence(res);
      onRefresh();
    } catch (err: any) {
      setAdjudicationError(err.message || 'Adjudication failed');
    } finally {
      setIsAdjudicating(false);
    }
  };

  const handleSynthesize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!synthName.trim() || !synthDesc.trim()) return;
    setIsSynthesizing(true);
    setSynthMessage(null);
    try {
      const tags = synthTags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const res = await apiClient.synthesizePower({
        conceptName: synthName.trim(),
        description: synthDesc.trim(),
        tags,
        powerTier: synthTier,
      });
      setSynthMessage(`Synthesized '${res.primaryCapability?.name}' with ${res.derivedSkills?.length || 0} derived techniques.`);
      setSynthName('');
      setSynthDesc('');
      setSynthTags('');
      onRefresh();
    } catch (err: any) {
      setSynthMessage(`Synthesis error: ${err.message}`);
    } finally {
      setIsSynthesizing(false);
    }
  };

  return (
    <div id="power-workstation" className="max-w-7xl mx-auto space-y-8 pb-12">
      {/* Header & Status Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-xl p-6 backdrop-blur-sm shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-amber-400" />
            <h2 className="text-2xl font-bold tracking-tight text-slate-100">Dynamic Capability & Power Engine</h2>
          </div>
          <p className="text-sm text-slate-400">
            Canonical PowerState, vessel capacity constraints, absolute seal enforcement, and deterministic adjudication.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg border border-slate-700 transition-colors self-start md:self-auto"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh State
        </button>
      </div>

      {/* Grid: 3 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: PowerState Metrics */}
        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-6 shadow-md">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-400" />
                Vessel & Power State
              </h3>
              <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                {powerState?.vesselType || 'Unanchored'}
              </span>
            </div>

            {powerState ? (
              <div className="space-y-4">
                {/* Vessel Capacity Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Vessel Safe Capacity</span>
                    <span className="font-mono font-semibold text-indigo-300">{powerState.vesselCapacity} / 100</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, powerState.vesselCapacity))}%` }}
                    />
                  </div>
                </div>

                {/* Health Metric */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Health</span>
                    <span className="font-mono font-semibold text-emerald-400">
                      {powerState.healthCurrent} / {powerState.healthMax}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (powerState.healthCurrent / powerState.healthMax) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Magical Energy */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Magical Energy</span>
                    <span className="font-mono font-semibold text-cyan-400">{powerState.magicalEnergy} / 100</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-cyan-500 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, powerState.magicalEnergy)}%` }}
                    />
                  </div>
                </div>

                {/* Physical Strain & Fatigue */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                    <div className="text-xs text-slate-400 flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      Physical Strain
                    </div>
                    <div className="text-lg font-mono font-bold text-amber-300 mt-1">
                      +{powerState.physicalStrain}
                    </div>
                  </div>
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                    <div className="text-xs text-slate-400">Fatigue / Stress</div>
                    <div className="text-lg font-mono font-bold text-slate-200 mt-1">
                      {powerState.fatigue}% / {powerState.stress}%
                    </div>
                  </div>
                </div>

                {/* Seal & Origin Info */}
                <div className="bg-slate-950/80 p-4 rounded-lg border border-slate-800 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Seal State:</span>
                    <span className={`font-semibold uppercase ${powerState.sealState === 'absolute' ? 'text-red-400' : 'text-amber-400'}`}>
                      {powerState.sealState} ({powerState.sealStrength}% strength)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Origin Tier:</span>
                    <span className="text-slate-200 font-medium">{powerState.originTier}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Power Access:</span>
                    <span className="text-slate-200 font-mono">{(powerState.powerAccessLevel * 100).toFixed(0)}%</span>
                  </div>
                </div>

                {/* Active Conditions */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs text-slate-400">Active Vessel Conditions:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {powerState.activeConditions && powerState.activeConditions.length > 0 ? (
                      powerState.activeConditions.map((cond, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 text-xs font-mono rounded bg-rose-950/70 text-rose-300 border border-rose-800 flex items-center gap-1"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          {cond}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500 italic">No adverse conditions active</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500 italic text-center py-6">
                No active PowerState loaded.
              </div>
            )}
          </div>

          {/* Custom Power Synthesis Box */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4 shadow-md">
            <h3 className="font-semibold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
              <PlusCircle className="w-5 h-5 text-emerald-400" />
              Power Synthesis (Workshop)
            </h3>
            <form onSubmit={handleSynthesize} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Concept Name</label>
                <input
                  type="text"
                  value={synthName}
                  onChange={(e) => setSynthName(e.target.value)}
                  placeholder="e.g. Cryogenic Rime Ward"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">Description</label>
                <textarea
                  value={synthDesc}
                  onChange={(e) => setSynthDesc(e.target.value)}
                  placeholder="Forms a crystalline matrix of frozen warding shards."
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 h-16"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 mb-1">Power Tier</label>
                  <select
                    value={synthTier}
                    onChange={(e) => setSynthTier(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Minor">Minor</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Major">Major</option>
                    <option value="WorldScale">WorldScale</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Tags (comma-sep)</label>
                  <input
                    type="text"
                    value={synthTags}
                    onChange={(e) => setSynthTags(e.target.value)}
                    placeholder="ice, ward, barrier"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSynthesizing}
                className="w-full mt-2 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded transition-colors disabled:opacity-50"
              >
                {isSynthesizing ? 'Synthesizing...' : 'Synthesize Technique'}
              </button>
            </form>
            {synthMessage && (
              <div className="text-xs p-2.5 rounded bg-slate-950 border border-slate-800 text-emerald-300">
                {synthMessage}
              </div>
            )}
          </div>
        </div>

        {/* Center Column: Capabilities Registry & Manifestation */}
        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4 shadow-md">
            <h3 className="font-semibold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
              <Layers className="w-5 h-5 text-amber-400" />
              Registered Capabilities ({capabilities.length})
            </h3>

            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {capabilities.map((cap) => (
                <div
                  key={cap.id}
                  onClick={() => setSelectedCapId(cap.id)}
                  className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                    selectedCapId === cap.id
                      ? 'bg-indigo-950/40 border-indigo-500 shadow-sm'
                      : 'bg-slate-950/50 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-100">{cap.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-mono font-medium ${
                        cap.powerTier === 'WorldScale'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : cap.powerTier === 'Major'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {cap.powerTier}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{cap.description}</p>
                  <div className="flex items-center gap-3 mt-2.5 text-xs text-slate-500 font-mono">
                    <span>⚡ {cap.baseEnergyCost} En</span>
                    <span>🔥 {cap.baseStrainCost} Str</span>
                    <span>🛡️ Min Cap: {cap.minVesselCapacityRequired}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Selected Capability Invocation Controls */}
            {selectedCap && (
              <div className="mt-4 pt-4 border-t border-slate-800 space-y-3 bg-slate-950/80 p-4 rounded-lg border">
                <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Channel: {selectedCap.name}</span>
                  <span className="text-indigo-400">{selectedCap.activationMode}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <label className="text-slate-400">Scale:</label>
                  <select
                    value={requestedScale}
                    onChange={(e) => setRequestedScale(e.target.value as any)}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs"
                  >
                    <option value="Minor">Minor Scale</option>
                    <option value="Moderate">Moderate Scale</option>
                    <option value="Major">Major Scale</option>
                    <option value="WorldScale">WorldScale (Primordial)</option>
                  </select>
                </div>
                <button
                  onClick={handleAdjudicate}
                  disabled={isAdjudicating}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  {isAdjudicating ? 'Adjudicating Consequence...' : `Invoke ${selectedCap.name}`}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Deterministic Consequence & DAG Graph */}
        <div className="space-y-6">
          {/* Adjudication Outcome Card */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4 shadow-md">
            <h3 className="font-semibold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
              <Shield className="w-5 h-5 text-indigo-400" />
              Adjudication Outcome
            </h3>

            {adjudicationError && (
              <div className="p-3.5 rounded-lg bg-rose-950/60 border border-rose-800 text-xs text-rose-300 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Rejection / Error
                </div>
                <div>{adjudicationError}</div>
              </div>
            )}

            {lastConsequence ? (
              <div className="space-y-3 text-xs">
                <div className={`p-3 rounded-lg border ${lastConsequence.approved ? 'bg-emerald-950/30 border-emerald-800 text-emerald-200' : 'bg-rose-950/30 border-rose-800 text-rose-300'}`}>
                  <div className="font-semibold flex items-center justify-between">
                    <span>Status: {lastConsequence.approved ? 'APPROVED' : 'REJECTED BY SEAL/RULE'}</span>
                    <span className="font-mono">
                      {lastConsequence.approved ? 'Deterministic' : 'Blocked'}
                    </span>
                  </div>
                  {lastConsequence.rejectionReason && (
                    <div className="mt-1 text-xs text-rose-300 italic">{lastConsequence.rejectionReason}</div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center font-mono">
                  <div className="p-2 bg-slate-950 rounded border border-slate-800">
                    <div className="text-slate-500 text-[10px]">HP Delta</div>
                    <div className={`font-bold ${lastConsequence.hpDelta < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                      {lastConsequence.hpDelta}
                    </div>
                  </div>
                  <div className="p-2 bg-slate-950 rounded border border-slate-800">
                    <div className="text-slate-500 text-[10px]">Energy</div>
                    <div className="font-bold text-cyan-400">{lastConsequence.energyDelta}</div>
                  </div>
                  <div className="p-2 bg-slate-950 rounded border border-slate-800">
                    <div className="text-slate-500 text-[10px]">Strain Delta</div>
                    <div className="font-bold text-amber-400">+{lastConsequence.strainDelta}</div>
                  </div>
                </div>

                <div className="bg-slate-950/80 p-3.5 rounded-lg border border-slate-800 space-y-2">
                  <div className="text-slate-400 font-medium">Sensory Observation:</div>
                  <div className="italic text-slate-300 leading-relaxed">
                    "{lastConsequence.emittedObservation?.sensoryDescription || 'None'}"
                  </div>
                  <div className="text-[11px] text-slate-500 border-t border-slate-800/80 pt-1.5">
                    Directive: {lastConsequence.narrativeDirective}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic text-center py-6">
                Invoke a capability to review deterministic mechanical adjudication results.
              </div>
            )}
          </div>

          {/* Capability DAG Graph */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-3 shadow-md">
            <h3 className="font-semibold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
              <GitBranch className="w-5 h-5 text-indigo-400" />
              Capability DAG & Derived Skills
            </h3>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1 text-xs">
              {graph.map((node) => (
                <div key={node.capabilityId} className="bg-slate-950/70 p-3 rounded-lg border border-slate-800 space-y-2">
                  <div className="font-semibold text-slate-200 flex items-center justify-between">
                    <span>{node.name}</span>
                    <span className="text-[10px] font-mono text-indigo-400">{node.capabilityId}</span>
                  </div>
                  {node.derivedSkills && node.derivedSkills.length > 0 && (
                    <div>
                      <span className="text-[11px] text-slate-400">Derived Skills:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {node.derivedSkills.map((s, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-slate-900 text-slate-300 border border-slate-800 rounded text-[10px]">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {node.transformsInto && node.transformsInto.length > 0 && (
                    <div className="text-[11px] text-amber-400">
                      Transforms Into: {node.transformsInto.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
