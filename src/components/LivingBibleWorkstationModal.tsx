import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/apiClient';
import { LivingBibleRequirement, WorkstationState, RequirementStatus } from '../../server/domain/types';
import { Activity, BookOpen, CheckCircle, Clock, FileCode, PlusCircle, RefreshCw, X, AlertTriangle, ShieldCheck } from 'lucide-react';

interface LivingBibleWorkstationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LivingBibleWorkstationModal: React.FC<LivingBibleWorkstationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'bible' | 'workstation'>('bible');
  const [requirements, setRequirements] = useState<LivingBibleRequirement[]>([]);
  const [workstation, setWorkstation] = useState<WorkstationState | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state for Living Bible
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Form state for New Iteration
  const [descInput, setDescInput] = useState<string>('');
  const [outcomeInput, setOutcomeInput] = useState<string>('');
  const [reasonInput, setReasonInput] = useState<string>('');
  const [affectedReqsInput, setAffectedReqsInput] = useState<string>('');
  const [recording, setRecording] = useState<boolean>(false);
  const [recordSuccess, setRecordSuccess] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [bibleData, workstationData] = await Promise.all([
        apiClient.getLivingBible(),
        apiClient.getWorkstationState(),
      ]);
      setRequirements(bibleData);
      setWorkstation(workstationData);
    } catch (err: any) {
      setError(err.message || 'Failed to load Living Bible / Workstation state.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRecordIteration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descInput.trim() || !outcomeInput.trim()) return;

    setRecording(true);
    setError(null);
    setRecordSuccess(null);

    try {
      const affectedList = affectedReqsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await apiClient.recordWorkstationIteration({
        description: descInput.trim(),
        outcome: outcomeInput.trim(),
        reason: reasonInput.trim() || undefined,
        affectedRequirements: affectedList.length > 0 ? affectedList : undefined,
      });

      setWorkstation(res.workstationState);
      setRecordSuccess(`Recorded Iteration #${res.iteration.iteration} successfully!`);
      setDescInput('');
      setOutcomeInput('');
      setReasonInput('');
      setAffectedReqsInput('');
    } catch (err: any) {
      setError(err.message || 'Failed to record iteration.');
    } finally {
      setRecording(false);
    }
  };

  const filteredRequirements = requirements.filter((req) => {
    const matchesStatus = statusFilter === 'ALL' || req.status === statusFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      req.id.toLowerCase().includes(q) ||
      req.title.toLowerCase().includes(q) ||
      req.requirementText.toLowerCase().includes(q) ||
      req.area.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const getStatusBadgeClass = (status: RequirementStatus) => {
    switch (status) {
      case 'VERIFIED':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'IMPLEMENTED':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'FOUNDATION':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'DOCUMENTED':
        return 'bg-stone-600/20 text-stone-300 border-stone-500/40';
      case 'BLOCKED':
        return 'bg-red-500/20 text-red-300 border-red-500/40';
      default:
        return 'bg-stone-700/20 text-stone-400 border-stone-600/40';
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-950/80 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-stone-900 border border-stone-700/80 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-stone-800 bg-stone-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-stone-100 flex items-center gap-2">
                Living Bible Registry & Developer Workstation
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  CH17 OPERATIONAL LEDGER
                </span>
              </h2>
              <p className="text-xs text-stone-400">
                Specification traceability, evidence verification, and persistent workstation audit log
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-stone-100 border border-stone-700 transition"
              title="Refresh State"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-100 border border-stone-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 bg-stone-950/30 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2 pt-2">
            <button
              id="living-bible-tab"
              onClick={() => setActiveTab('bible')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
                activeTab === 'bible'
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Living Bible Requirements ({requirements.length})</span>
            </button>

            <button
              id="workstation-tab"
              onClick={() => setActiveTab('workstation')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
                activeTab === 'workstation'
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Developer Workstation ({workstation?.iterationHistory.length || 0} Iterations)</span>
            </button>
          </div>

          {workstation && (
            <div className="hidden sm:flex items-center gap-3 text-xs font-mono">
              <span className="text-emerald-400">Verified: {workstation.counts.verified}</span>
              <span className="text-blue-400">Implemented: {workstation.counts.implemented}</span>
              <span className="text-amber-400">Foundation: {workstation.counts.foundation}</span>
              <span className="text-stone-400">Documented: {workstation.counts.documented}</span>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: LIVING BIBLE REQUIREMENTS */}
          {activeTab === 'bible' && (
            <div className="space-y-4">
              {/* Controls bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-stone-950/40 p-3 rounded-xl border border-stone-800">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search requirement ID, title, area, or description..."
                  className="bg-stone-900 border border-stone-700/80 rounded-lg px-3 py-1.5 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-emerald-500/50 flex-1"
                />

                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-400 font-medium">Status Filter:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-stone-900 border border-stone-700/80 rounded-lg px-3 py-1.5 text-xs text-stone-200 focus:outline-none focus:border-emerald-500/50"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="VERIFIED">VERIFIED</option>
                    <option value="IMPLEMENTED">IMPLEMENTED</option>
                    <option value="FOUNDATION">FOUNDATION</option>
                    <option value="DOCUMENTED">DOCUMENTED</option>
                  </select>
                </div>
              </div>

              {/* Requirement Cards List */}
              <div className="space-y-3">
                {filteredRequirements.map((req) => (
                  <div
                    key={req.id}
                    className="bg-stone-950/50 border border-stone-800 hover:border-stone-700/80 rounded-xl p-4 transition space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/20">
                          {req.id}
                        </span>
                        <span className="text-xs text-stone-400 font-medium">{req.area}</span>
                        <span className="text-xs text-stone-600">•</span>
                        <span className="text-xs text-stone-500 font-mono">{req.dreamBookRef}</span>
                      </div>

                      <span
                        className={`text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded border ${getStatusBadgeClass(
                          req.status
                        )}`}
                      >
                        {req.status}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-stone-200">{req.title}</h3>
                      <p className="text-xs text-stone-300 mt-1 leading-relaxed">{req.requirementText}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                      <div className="bg-stone-900/80 p-2.5 rounded-lg border border-stone-800/80">
                        <span className="text-stone-400 font-medium block mb-1 flex items-center gap-1">
                          <FileCode className="w-3.5 h-3.5 text-blue-400" />
                          Code Evidence
                        </span>
                        <code className="text-[11px] text-stone-300 font-mono break-all">{req.codeEvidence || 'None'}</code>
                      </div>

                      <div className="bg-stone-900/80 p-2.5 rounded-lg border border-stone-800/80">
                        <span className="text-stone-400 font-medium block mb-1 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          Test Evidence
                        </span>
                        <code className="text-[11px] text-stone-300 font-mono break-all">{req.testEvidence || 'None'}</code>
                      </div>
                    </div>

                    {req.evidences && req.evidences.length > 0 && (
                      <div className="pt-2 border-t border-stone-800/60">
                        <span className="text-[11px] text-stone-400 font-medium block mb-1">
                          Recorded Verification Evidences ({req.evidences.length}):
                        </span>
                        <div className="space-y-1.5">
                          {req.evidences.map((ev) => (
                            <div
                              key={ev.evidenceId}
                              className="text-[11px] font-mono bg-stone-900/60 p-2 rounded border border-stone-800 flex flex-wrap items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                  {ev.evidenceType}
                                </span>
                                <span className="text-stone-300">{ev.description}</span>
                              </div>
                              <span className="text-stone-500 text-[10px]">{ev.sourceReference}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {req.notes && (
                      <div className="text-[11px] text-amber-300/80 bg-amber-500/5 px-3 py-1.5 rounded border border-amber-500/20">
                        <span className="font-semibold text-amber-400">Notes:</span> {req.notes}
                      </div>
                    )}
                  </div>
                ))}

                {filteredRequirements.length === 0 && (
                  <div className="text-center py-12 text-stone-500 text-xs">
                    No requirements match the current search or status filter.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: DEVELOPER WORKSTATION LEDGER */}
          {activeTab === 'workstation' && workstation && (
            <div className="space-y-6">
              {/* Phase & Objectives */}
              <div className="bg-stone-950/60 border border-stone-800 p-5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    Active Development Phase
                  </span>
                  <span className="text-xs font-mono text-stone-400">Last Audit: {workstation.lastAuditDate}</span>
                </div>

                <h3 className="text-base font-bold text-stone-100">{workstation.currentPhase}</h3>
                <p className="text-xs text-stone-300 leading-relaxed">{workstation.phaseObjective}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                  <div className="bg-stone-900/80 p-3 rounded-xl border border-stone-800">
                    <span className="text-stone-400 font-medium block mb-1">Next Immediate Task:</span>
                    <span className="text-amber-300 font-semibold">{workstation.nextTask}</span>
                  </div>

                  <div className="bg-stone-900/80 p-3 rounded-xl border border-stone-800">
                    <span className="text-stone-400 font-medium block mb-1">Active Blockers:</span>
                    {workstation.blockers.length === 0 ? (
                      <span className="text-emerald-400 font-medium">None (Zero Active Blockers)</span>
                    ) : (
                      <ul className="list-disc list-inside text-red-300 space-y-0.5">
                        {workstation.blockers.map((b, idx) => (
                          <li key={idx}>{b}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              {/* Status Metric Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl text-center">
                  <span className="text-2xl font-bold text-emerald-400 font-mono block">{workstation.counts.verified}</span>
                  <span className="text-[11px] text-emerald-300/80 font-medium">VERIFIED</span>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded-xl text-center">
                  <span className="text-2xl font-bold text-blue-400 font-mono block">{workstation.counts.implemented}</span>
                  <span className="text-[11px] text-blue-300/80 font-medium">IMPLEMENTED</span>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-center">
                  <span className="text-2xl font-bold text-amber-400 font-mono block">{workstation.counts.foundation}</span>
                  <span className="text-[11px] text-amber-300/80 font-medium">FOUNDATION</span>
                </div>

                <div className="bg-stone-800/50 border border-stone-700/60 p-3 rounded-xl text-center">
                  <span className="text-2xl font-bold text-stone-300 font-mono block">{workstation.counts.documented}</span>
                  <span className="text-[11px] text-stone-400 font-medium">DOCUMENTED</span>
                </div>

                <div className="bg-stone-800/50 border border-stone-700/60 p-3 rounded-xl text-center col-span-2 sm:col-span-1">
                  <span className="text-2xl font-bold text-stone-400 font-mono block">{workstation.counts.planned}</span>
                  <span className="text-[11px] text-stone-500 font-medium">PLANNED</span>
                </div>
              </div>

              {/* Record Iteration Form */}
              <div className="bg-stone-950/80 border border-stone-800 p-5 rounded-2xl space-y-4">
                <h3 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
                  <PlusCircle className="w-4 h-4 text-emerald-400" />
                  Append New Development Iteration
                </h3>

                {recordSuccess && (
                  <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs">
                    {recordSuccess}
                  </div>
                )}

                <form onSubmit={handleRecordIteration} className="space-y-3">
                  <div>
                    <label className="block text-xs text-stone-400 mb-1 font-medium">Iteration Change Summary / Description *</label>
                    <input
                      type="text"
                      required
                      value={descInput}
                      onChange={(e) => setDescInput(e.target.value)}
                      placeholder="e.g. Implemented CH17 evidence model and persistent iteration ledger."
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-stone-400 mb-1 font-medium">Verified Outcome / Result *</label>
                    <input
                      type="text"
                      required
                      value={outcomeInput}
                      onChange={(e) => setOutcomeInput(e.target.value)}
                      placeholder="e.g. Iteration ledger is appendable and survives process restarts."
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-stone-400 mb-1 font-medium">Reason / Context (Optional)</label>
                      <input
                        type="text"
                        value={reasonInput}
                        onChange={(e) => setReasonInput(e.target.value)}
                        placeholder="e.g. DEF-CH17-04 repair pass"
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-200 focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-stone-400 mb-1 font-medium">Affected Requirements (Comma-separated)</label>
                      <input
                        type="text"
                        value={affectedReqsInput}
                        onChange={(e) => setAffectedReqsInput(e.target.value)}
                        placeholder="e.g. CH17.CONTROLS, CH14.SENSORY"
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-200 focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={recording || !descInput.trim() || !outcomeInput.trim()}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-stone-800 text-stone-100 disabled:text-stone-500 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2"
                  >
                    {recording ? 'Recording Iteration...' : 'Record Iteration to Persistent Ledger'}
                  </button>
                </form>
              </div>

              {/* Iteration Audit History List */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Chronological Iteration Ledger ({workstation.iterationHistory.length})
                </h3>

                <div className="space-y-3">
                  {workstation.iterationHistory.slice().reverse().map((iter) => (
                    <div
                      key={iter.id || iter.iteration}
                      className="bg-stone-950/60 border border-stone-800 rounded-xl p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between border-b border-stone-800/80 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/20">
                            Iteration #{iter.iteration}
                          </span>
                          <span className="text-xs text-stone-400 font-mono">{iter.date}</span>
                        </div>

                        {iter.affectedRequirements && iter.affectedRequirements.length > 0 && (
                          <div className="flex items-center gap-1 font-mono text-[10px]">
                            {iter.affectedRequirements.map((reqId) => (
                              <span key={reqId} className="px-1.5 py-0.5 bg-stone-800 text-amber-300 rounded border border-stone-700">
                                {reqId}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <p className="text-xs font-semibold text-stone-200">{iter.description}</p>
                      <p className="text-xs text-stone-300 bg-stone-900/80 p-2.5 rounded-lg border border-stone-800">
                        <span className="text-emerald-400 font-semibold">Outcome:</span> {iter.outcome}
                      </p>

                      {iter.reason && (
                        <p className="text-[11px] text-stone-400 italic">Context: {iter.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
