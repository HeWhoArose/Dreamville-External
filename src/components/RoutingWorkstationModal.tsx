import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Cpu,
  Layers,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  ShieldCheck,
  ArrowRight,
  Zap,
  RotateCcw,
  Pin,
  Flame,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react';
import { apiClient } from '../services/apiClient';

interface RoutingWorkstationModalProps {
  isOpen: boolean;
  onClose: () => void;
  storyId?: string;
}

type TabType = 'catalog' | 'test' | 'overrides' | 'telemetry';

export const RoutingWorkstationModal: React.FC<RoutingWorkstationModalProps> = ({
  isOpen,
  onClose,
  storyId = 'default_story',
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('catalog');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [models, setModels] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [lastTelemetry, setLastTelemetry] = useState<any>(null);
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<any[]>([]);

  // Test Routing state
  const [testTask, setTestTask] = useState('narrative.generate');
  const [testTokens, setTestTokens] = useState(400);
  const [testPriorityTier, setTestPriorityTier] = useState('Standard');
  const [routingDecision, setRoutingDecision] = useState<any>(null);
  const [routingLoading, setRoutingLoading] = useState(false);

  // Pinning state
  const [pinTask, setPinTask] = useState('combat.tactics');
  const [pinModelKey, setPinModelKey] = useState('');
  const [pinMessage, setPinMessage] = useState<string | null>(null);

  // Load all workstation data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [modelsRes, telemetryRes, cpRes, overridesRes] = await Promise.all([
        apiClient.getOrchestratorModels().catch(() => ({ models: [] })),
        apiClient.getOrchestratorTelemetry().catch(() => ({ stats: null, lastTurnTelemetry: null })),
        apiClient.getOrchestratorCheckpoints(storyId).catch(() => ({ checkpoints: [] })),
        apiClient.getManualOverrides().catch(() => ({ overrides: [] })),
      ]);

      setModels(modelsRes.models || []);
      setStats(telemetryRes.stats || null);
      setLastTelemetry(telemetryRes.lastTurnTelemetry || null);
      setCheckpoints(cpRes.checkpoints || []);
      setOverrides(overridesRes.overrides || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load orchestrator data');
    } finally {
      setLoading(false);
    }
  }, [storyId]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  // Execute Routing Decision Test
  const handleTestRouting = async () => {
    setRoutingLoading(true);
    setRoutingDecision(null);
    try {
      const res = await apiClient.selectOrchestratorModel({
        task: testTask,
        contextTokens: Number(testTokens),
        userPriorityTier: testPriorityTier,
      });
      setRoutingDecision(res);
    } catch (err: any) {
      setError(err?.message || 'Routing test failed');
    } finally {
      setRoutingLoading(false);
    }
  };

  // Toggle Model Health / Reset Breaker
  const handleToggleHealth = async (providerId: string, modelId: string, currentHealth: string) => {
    try {
      const nextHealth = currentHealth === 'Healthy' ? 'Degraded' : 'Healthy';
      await apiClient.updateModelHealth({
        providerId,
        modelId,
        health: nextHealth,
        resetCircuitBreaker: nextHealth === 'Healthy',
      });
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Health update failed');
    }
  };

  // Pin / Unpin model for task
  const handlePinModel = async () => {
    try {
      setPinMessage(null);
      await apiClient.pinModelForTask({
        task: pinTask,
        modelKey: pinModelKey || undefined,
      });
      setPinMessage(
        pinModelKey ? `Pinned task '${pinTask}' to '${pinModelKey}'` : `Cleared pin for task '${pinTask}'`
      );
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Pinning failed');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        id="routing-workstation-overlay"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      >
        <motion.div
          id="routing-workstation-modal"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.18 }}
          className="relative w-full max-w-5xl max-h-[90vh] flex flex-col bg-stone-900 border border-amber-900/40 rounded-xl shadow-2xl overflow-hidden text-stone-200"
        >
          {/* Header */}
          <div
            id="routing-workstation-header"
            className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/80"
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-lg font-semibold tracking-wide text-amber-200 font-serif">
                    Model Routing Workstation
                  </h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/40 font-mono">
                    DreamBook V6.29
                  </span>
                </div>
                <p className="text-xs text-stone-400">
                  Adaptive Multi-Model Orchestration & Continuation Handoff Engine
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                id="routing-refresh-btn"
                onClick={loadData}
                disabled={loading}
                className="p-1.5 rounded-md hover:bg-stone-800 text-stone-400 hover:text-amber-300 transition"
                title="Refresh Orchestrator State"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
              </button>
              <button
                id="routing-close-btn"
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-stone-800 text-stone-400 hover:text-stone-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Stats Banner */}
          <div
            id="routing-quick-stats"
            className="grid grid-cols-4 gap-3 px-6 py-3 bg-stone-950/40 border-b border-stone-800/60 text-xs"
          >
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <div>
                <div className="text-stone-400">Registered Models</div>
                <div className="font-semibold text-stone-200 font-mono">{models.length} active</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-stone-400">Turns Executed</div>
                <div className="font-semibold text-stone-200 font-mono">
                  {stats?.totalTurnsExecuted ?? 0}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-sky-400" />
              <div>
                <div className="text-stone-400">Active Checkpoints</div>
                <div className="font-semibold text-stone-200 font-mono">{checkpoints.length} saved</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Flame className="w-4 h-4 text-rose-400" />
              <div>
                <div className="text-stone-400">Circuit Breakers</div>
                <div className="font-semibold text-stone-200 font-mono">
                  {stats?.circuitBreakersTripped?.length ?? 0} tripped
                </div>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div
            id="routing-workstation-tabs"
            className="flex items-center px-6 border-b border-stone-800 bg-stone-900/60 space-x-2"
          >
            <button
              id="tab-catalog"
              onClick={() => setActiveTab('catalog')}
              className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
                activeTab === 'catalog'
                  ? 'border-amber-500 text-amber-300'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Model Catalog & Pools</span>
            </button>
            <button
              id="tab-test"
              onClick={() => setActiveTab('test')}
              className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
                activeTab === 'test'
                  ? 'border-amber-500 text-amber-300'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Routing Engine & Decision Preview</span>
            </button>
            <button
              id="tab-overrides"
              onClick={() => setActiveTab('overrides')}
              className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
                activeTab === 'overrides'
                  ? 'border-amber-500 text-amber-300'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Manual Overrides & Pinning</span>
            </button>
            <button
              id="tab-telemetry"
              onClick={() => setActiveTab('telemetry')}
              className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
                activeTab === 'telemetry'
                  ? 'border-amber-500 text-amber-300'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Live Telemetry & Checkpoints</span>
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {error && (
              <div className="flex items-center space-x-2 p-3 text-xs bg-rose-950/40 border border-rose-800 text-rose-300 rounded-lg">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* TAB 1: MODEL CATALOG */}
            {activeTab === 'catalog' && (
              <div id="tab-content-catalog" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-stone-300 flex items-center space-x-2">
                    <span>Registered Model Pools & Capability Manifest</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-stone-800 text-stone-400 font-mono">
                      {models.length} Models Available
                    </span>
                  </h3>
                  <button
                    onClick={() => apiClient.discoverOrchestratorModels(true).then(loadData)}
                    className="flex items-center space-x-1 px-2.5 py-1 text-xs rounded bg-stone-800 hover:bg-stone-700 text-stone-300 transition"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Discover Models</span>
                  </button>
                </div>

                <div className="border border-stone-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-stone-950 text-stone-400 font-mono border-b border-stone-800">
                      <tr>
                        <th className="p-3">Model</th>
                        <th className="p-3">Provider</th>
                        <th className="p-3">Pool</th>
                        <th className="p-3">Roles</th>
                        <th className="p-3">Context Window</th>
                        <th className="p-3">Avg Latency</th>
                        <th className="p-3">Health</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-800/60 bg-stone-900/40 font-mono">
                      {models.map((m) => {
                        const isBreakerTripped = stats?.circuitBreakersTripped?.includes(
                          `${m.providerId}::${m.modelId}`
                        );
                        return (
                          <tr key={`${m.providerId}::${m.modelId}`} className="hover:bg-stone-800/30">
                            <td className="p-3 font-sans">
                              <div className="font-semibold text-stone-200">{m.displayName}</div>
                              <div className="text-[11px] text-stone-500 font-mono">{m.modelId}</div>
                            </td>
                            <td className="p-3 text-stone-400">{m.providerId}</td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                                  m.pool === 'reasoning'
                                    ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                    : m.pool === 'fast'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : m.pool === 'creative'
                                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                    : m.pool === 'emergency'
                                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                    : 'bg-stone-800 text-stone-300'
                                }`}
                              >
                                {m.pool}
                              </span>
                            </td>
                            <td className="p-3 text-stone-400 text-[11px]">
                              {Array.isArray(m.roles) ? m.roles.slice(0, 2).join(', ') : 'general'}
                            </td>
                            <td className="p-3 text-stone-300">
                              {m.contextWindow ? m.contextWindow.toLocaleString() : '8,192'} tok
                            </td>
                            <td className="p-3 text-stone-400">
                              {m.typicalLatencyMs ? `${m.typicalLatencyMs}ms` : '350ms'}
                            </td>
                            <td className="p-3">
                              <span
                                className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-sans ${
                                  isBreakerTripped || m.health === 'Unavailable'
                                    ? 'bg-rose-950/60 text-rose-400 border border-rose-800'
                                    : m.health === 'Degraded' || m.health === 'Throttled'
                                    ? 'bg-amber-950/60 text-amber-400 border border-amber-800'
                                    : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                                }`}
                              >
                                {isBreakerTripped ? (
                                  <Flame className="w-3 h-3 text-rose-400" />
                                ) : (
                                  <CheckCircle2 className="w-3 h-3" />
                                )}
                                <span>{isBreakerTripped ? 'Tripped' : m.health}</span>
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => handleToggleHealth(m.providerId, m.modelId, m.health)}
                                className="px-2 py-1 text-[11px] rounded bg-stone-800 hover:bg-stone-700 text-stone-300 transition"
                              >
                                {m.health === 'Healthy' ? 'Simulate Degraded' : 'Restore Healthy'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 2: ROUTING ENGINE & TEST RUNNER */}
            {activeTab === 'test' && (
              <div id="tab-content-test" className="space-y-4">
                <div className="p-4 bg-stone-950/60 border border-stone-800 rounded-lg space-y-4">
                  <h3 className="text-sm font-semibold text-stone-200 flex items-center space-x-2">
                    <Cpu className="w-4 h-4 text-amber-400" />
                    <span>Dynamic Router Simulation ("Why This Model?")</span>
                  </h3>
                  <p className="text-xs text-stone-400">
                    Test how the DreamBook V6.29 routing algorithm matches task requirements, context size,
                    and priority tiers to the best eligible candidate model.
                  </p>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Task Subsystem</label>
                      <select
                        value={testTask}
                        onChange={(e) => setTestTask(e.target.value)}
                        className="w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-xs text-stone-200"
                      >
                        <option value="narrative.generate">narrative.generate (Storytelling)</option>
                        <option value="rules.adjudicate">rules.adjudicate (Logic & Authority)</option>
                        <option value="combat.tactics">combat.tactics (Tactical Combat)</option>
                        <option value="speech.generate">speech.generate (Voice & Audio)</option>
                        <option value="context.compress">context.compress (Working Context)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Context Tokens</label>
                      <input
                        type="number"
                        value={testTokens}
                        onChange={(e) => setTestTokens(Number(e.target.value))}
                        className="w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-xs text-stone-200 font-mono"
                        min={50}
                        max={100000}
                        step={50}
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Priority Tier</label>
                      <select
                        value={testPriorityTier}
                        onChange={(e) => setTestPriorityTier(e.target.value)}
                        className="w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-xs text-stone-200"
                      >
                        <option value="Standard">Standard Tier</option>
                        <option value="High">High Priority Tier</option>
                        <option value="Critical">Critical Priority Tier</option>
                      </select>
                    </div>
                  </div>

                  <button
                    id="execute-routing-test-btn"
                    onClick={handleTestRouting}
                    disabled={routingLoading}
                    className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs transition"
                  >
                    <Zap className="w-4 h-4" />
                    <span>{routingLoading ? 'Evaluating Candidates...' : 'Simulate Routing Decision'}</span>
                  </button>
                </div>

                {routingDecision && (
                  <div className="p-4 bg-stone-950/80 border border-amber-900/40 rounded-lg space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs text-amber-400 font-mono uppercase tracking-wider">
                          Primary Selected Model
                        </div>
                        <div className="text-base font-bold text-stone-100 font-serif">
                          {routingDecision.selectedModel?.displayName || 'Mock Narrative Pro'}
                        </div>
                        <div className="text-xs text-stone-400 font-mono">
                          ID: {routingDecision.selectedModel?.modelId} ({routingDecision.selectedModel?.providerId})
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-stone-400">Eligibility Score</div>
                        <div className="text-lg font-bold text-amber-300 font-mono">
                          {routingDecision.selectionScore || 100} / 100
                        </div>
                      </div>
                    </div>

                    {/* Why this model explanation */}
                    <div className="p-3 rounded bg-stone-900/80 border border-stone-800">
                      <div className="flex items-center space-x-1.5 text-xs text-amber-300 font-medium mb-1">
                        <Info className="w-3.5 h-3.5" />
                        <span>Why This Model? (DreamBook §450 Justification)</span>
                      </div>
                      <p className="text-xs text-stone-300 font-sans leading-relaxed">
                        {routingDecision.selectionReason ||
                          'Selected based on highest suitability match for narrative tasks and context window capacity.'}
                      </p>
                    </div>

                    {/* Fallback Chain Preview */}
                    <div>
                      <div className="text-xs text-stone-400 font-mono uppercase tracking-wider mb-2">
                        Resilient Failover Chain (DEF-CH12-01)
                      </div>
                      <div className="flex items-center space-x-2 overflow-x-auto py-1">
                        <div className="flex items-center space-x-2 px-3 py-1.5 rounded bg-amber-950/80 border border-amber-800 text-amber-200 text-xs font-mono flex-shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                          <span>1. {routingDecision.selectedModel?.modelId}</span>
                        </div>
                        {routingDecision.fallbacks?.slice(0, 3).map((fb: any, idx: number) => (
                          <React.Fragment key={fb.modelId}>
                            <ArrowRight className="w-3 h-3 text-stone-600 flex-shrink-0" />
                            <div className="flex items-center space-x-2 px-3 py-1.5 rounded bg-stone-900 border border-stone-800 text-stone-300 text-xs font-mono flex-shrink-0">
                              <span>
                                {idx + 2}. {fb.modelId}
                              </span>
                            </div>
                          </React.Fragment>
                        ))}
                        <ArrowRight className="w-3 h-3 text-stone-600 flex-shrink-0" />
                        <div className="flex items-center space-x-2 px-3 py-1.5 rounded bg-rose-950/40 border border-rose-900 text-rose-300 text-xs font-mono flex-shrink-0">
                          <span>Emergency Floor</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: MANUAL OVERRIDES & PINNING */}
            {activeTab === 'overrides' && (
              <div id="tab-content-overrides" className="space-y-4">
                <div className="p-4 bg-stone-950/60 border border-stone-800 rounded-lg space-y-3">
                  <h3 className="text-sm font-semibold text-stone-200 flex items-center space-x-2">
                    <Pin className="w-4 h-4 text-amber-400" />
                    <span>Task-to-Model Pinning Configuration</span>
                  </h3>
                  <p className="text-xs text-stone-400">
                    Directly bind a specific task to a model, bypassing algorithmic selection (DEF-CH12-04).
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Target Task</label>
                      <select
                        value={pinTask}
                        onChange={(e) => setPinTask(e.target.value)}
                        className="w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-xs text-stone-200"
                      >
                        <option value="combat.tactics">combat.tactics (Tactical Combat)</option>
                        <option value="rules.adjudicate">rules.adjudicate (Rules & Adjudication)</option>
                        <option value="narrative.generate">narrative.generate (Story)</option>
                        <option value="speech.generate">speech.generate (Voice)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Model to Pin</label>
                      <select
                        value={pinModelKey}
                        onChange={(e) => setPinModelKey(e.target.value)}
                        className="w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-xs text-stone-200 font-mono"
                      >
                        <option value="">-- No Pin (Dynamic Routing) --</option>
                        {models.map((m) => (
                          <option key={m.modelId} value={m.modelId}>
                            {m.displayName} ({m.modelId})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 pt-1">
                    <button
                      onClick={handlePinModel}
                      className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs transition"
                    >
                      Save Pin Setting
                    </button>
                    {pinMessage && (
                      <span className="text-xs text-emerald-400 font-mono">{pinMessage}</span>
                    )}
                  </div>
                </div>

                <div className="border border-stone-800 rounded-lg p-4 bg-stone-900/40">
                  <h4 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2 font-mono">
                    Active Overrides in Effect
                  </h4>
                  {overrides.length === 0 ? (
                    <div className="text-xs text-stone-500 italic">No manual overrides active.</div>
                  ) : (
                    <div className="space-y-2">
                      {overrides.map((ov: any) => (
                        <div
                          key={ov.modelId}
                          className="flex items-center justify-between p-2 rounded bg-stone-950 border border-stone-800 text-xs"
                        >
                          <span className="font-mono text-stone-300">{ov.modelId}</span>
                          <span className="text-amber-400 font-mono">{JSON.stringify(ov.override)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: LIVE TELEMETRY & CHECKPOINTS */}
            {activeTab === 'telemetry' && (
              <div id="tab-content-telemetry" className="space-y-4">
                {/* Last Turn Telemetry */}
                <div className="p-4 bg-stone-950/80 border border-stone-800 rounded-lg space-y-3">
                  <h3 className="text-sm font-semibold text-stone-200 flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span>Last Orchestrated Turn Telemetry (DEF-CH12-07)</span>
                  </h3>
                  {lastTelemetry ? (
                    <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                      <div className="p-2.5 bg-stone-900 rounded border border-stone-800">
                        <div className="text-stone-400 text-[11px]">Turn ID / Model</div>
                        <div className="font-semibold text-stone-200">{lastTelemetry.turnId}</div>
                        <div className="text-amber-400 text-[11px]">{lastTelemetry.selectedModelId}</div>
                      </div>
                      <div className="p-2.5 bg-stone-900 rounded border border-stone-800">
                        <div className="text-stone-400 text-[11px]">Latency / Tokens</div>
                        <div className="font-semibold text-emerald-300">{lastTelemetry.latencyMs} ms</div>
                        <div className="text-stone-400 text-[11px]">
                          In: {lastTelemetry.inputTokens} | Out: {lastTelemetry.outputTokens}
                        </div>
                      </div>
                      <div className="p-2.5 bg-stone-900 rounded border border-stone-800">
                        <div className="text-stone-400 text-[11px]">Adjudication / Checkpoint</div>
                        <div className="font-semibold text-sky-300">
                          {lastTelemetry.adjudicationResult?.allApproved ? 'All Approved' : 'Adjudicated'}
                        </div>
                        <div className="text-stone-400 text-[11px] truncate">
                          {lastTelemetry.checkpointCreated || 'None'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-stone-500 italic">No turns executed yet this session.</div>
                  )}
                </div>

                {/* Continuation Checkpoints List */}
                <div className="p-4 bg-stone-950/60 border border-stone-800 rounded-lg space-y-3">
                  <h3 className="text-sm font-semibold text-stone-200 flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-sky-400" />
                    <span>Saved Continuation Checkpoints (DEF-CH12-06)</span>
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {checkpoints.length === 0 ? (
                      <div className="text-xs text-stone-500 italic">No checkpoints saved.</div>
                    ) : (
                      checkpoints.map((cp) => (
                        <div
                          key={cp.checkpointId}
                          className="flex items-center justify-between p-2.5 rounded bg-stone-900/80 border border-stone-800 text-xs"
                        >
                          <div>
                            <div className="font-mono text-stone-200 font-semibold">{cp.checkpointId}</div>
                            <div className="text-[11px] text-stone-400">
                              Story: <span className="text-amber-300">{cp.storyId}</span> | Time:{' '}
                              {cp.worldTime} | Location: {cp.locationId}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="px-2 py-0.5 rounded bg-sky-950 border border-sky-800 text-sky-300 text-[10px] font-mono">
                              Handoff Ready
                            </span>
                            <div className="text-[10px] text-stone-500 font-mono mt-0.5">
                              Tokens: {cp.workingContextTokens || 400}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Secret Safeguard Footer Notice */}
          <div
            id="routing-workstation-footer"
            className="flex items-center justify-between px-6 py-3 border-t border-stone-800 bg-stone-950 text-xs text-stone-400"
          >
            <div className="flex items-center space-x-2 text-amber-400/90">
              <ShieldCheck className="w-4 h-4 flex-shrink-0" />
              <span>
                <strong>Secret Safeguard:</strong> All provider credentials and keys are strictly retained
                server-side. No secret credentials are ever transmitted to or exposed in client browser state.
              </span>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 transition text-xs font-medium"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
