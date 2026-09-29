import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/apiClient';
import { Button } from './common/Button';
import { Badge } from './common/Badge';

export interface TokenUsageMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenModelRouting?: () => void;
}

export const TokenUsageMonitorModal: React.FC<TokenUsageMonitorModalProps> = ({
  isOpen,
  onClose,
  onOpenModelRouting,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'models' | 'ledger' | 'optimizer'>('overview');
  const [report, setReport] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchReport = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const response = await apiClient.getTokenUsageReport();
      if (response.success && response.report) {
        setReport(response.report);
        setError(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch token usage data.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchReport(false);
    }
  }, [isOpen, fetchReport]);

  // Live polling timer when modal is open and autoRefresh is enabled
  useEffect(() => {
    if (!isOpen || !autoRefresh) return;
    const interval = setInterval(() => {
      fetchReport(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [isOpen, autoRefresh, fetchReport]);

  const handleResetTelemetry = async () => {
    if (!window.confirm('Reset accumulated token consumption metrics and request logs?')) return;
    setIsLoading(true);
    try {
      const result = await apiClient.resetTokenTelemetry();
      if (result.report) setReport(result.report);
      setActionMessage('Token telemetry reset successfully.');
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to reset telemetry.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetCooldown = async (providerId?: string, modelId?: string) => {
    setIsLoading(true);
    try {
      const result = await apiClient.resetModelCooldown(providerId, modelId);
      if (result.report) setReport(result.report);
      setActionMessage(result.message || 'Model cooldown and rate limit circuit breakers reset.');
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to reset cooldown.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const totals = report?.totals || {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedTokens: 0,
    toolTokens: 0,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    rateLimitedRequests: 0,
    serverErrorRequests: 0,
    timeoutRequests: 0,
    averageLatencyMs: 0,
  };

  const rateLimitStatus = report?.rateLimitStatus || {
    isAnyModelThrottled: false,
    isAnyModelCoolingDown: false,
    activeCooldowns: [],
    total429Events: 0,
  };

  const byModel = Array.isArray(report?.byModel) ? report.byModel : [];
  const byProvider = report?.byProvider || {};
  const byCategory = report?.byCategory || {};
  const recentLedger = Array.isArray(report?.recentLedger) ? report.recentLedger : [];

  const successRate = totals.totalRequests > 0
    ? Math.round((totals.successfulRequests / totals.totalRequests) * 100)
    : 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in overflow-hidden">
      <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl bg-[var(--db-bg-card)] border border-[var(--db-border-subtle)] shadow-2xl text-[var(--db-text-primary)]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--db-border-subtle)] bg-[var(--db-bg-surface)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--db-gold-500)]/15 border border-[var(--db-gold-500)]/30 flex items-center justify-center text-[var(--db-gold-400)]">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-serif font-bold text-[var(--db-text-primary)] flex items-center gap-2">
                API Token & Rate Limit Monitor
                {isRefreshing && (
                  <span className="inline-block w-2 h-2 rounded-full bg-[var(--db-gold-400)] animate-ping" title="Live Polling..." />
                )}
              </h2>
              <p className="text-xs text-[var(--db-text-muted)]">
                Real-time API token consumption, reasoning token tracking, and model quota health
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Auto Refresh Toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors ${
                autoRefresh
                  ? 'bg-[var(--db-emerald-500)]/15 border-[var(--db-emerald-500)]/30 text-[var(--db-emerald-400)]'
                  : 'bg-[var(--db-bg-elevated)] border-[var(--db-border-subtle)] text-[var(--db-text-muted)]'
              }`}
              title="Toggle live 4-second auto refresh"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-[var(--db-emerald-400)] animate-pulse' : 'bg-gray-500'}`} />
              Auto-Sync {autoRefresh ? 'ON' : 'OFF'}
            </button>

            <Button
              variant="subtle"
              size="sm"
              onClick={() => fetchReport(false)}
              disabled={isLoading}
              className="text-xs py-1 px-2.5"
            >
              🔄 Refresh
            </Button>

            <button
              onClick={onClose}
              className="p-1.5 text-[var(--db-text-muted)] hover:text-[var(--db-text-primary)] rounded-lg hover:bg-[var(--db-bg-elevated)] transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Action / Error Banner */}
        {actionMessage && (
          <div className="px-6 py-2 bg-[var(--db-emerald-500)]/15 border-b border-[var(--db-emerald-500)]/30 text-[var(--db-emerald-300)] text-xs flex items-center justify-between">
            <span>✓ {actionMessage}</span>
          </div>
        )}
        {error && (
          <div className="px-6 py-2 bg-[var(--db-crimson-500)]/15 border-b border-[var(--db-crimson-500)]/30 text-[var(--db-crimson-300)] text-xs flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)} className="underline ml-2">Dismiss</button>
          </div>
        )}

        {/* Top Summary Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 sm:p-6 bg-[var(--db-bg-elevated)] border-b border-[var(--db-border-subtle)]">
          {/* Card 1: Total Tokens */}
          <div className="p-3.5 rounded-lg bg-[var(--db-bg-card)] border border-[var(--db-border-subtle)]">
            <div className="text-[11px] font-medium text-[var(--db-text-muted)] uppercase tracking-wider mb-1">
              Total Tokens Used
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--db-gold-400)]">
              {totals.totalTokens.toLocaleString()}
            </div>
            <div className="mt-2 text-[11px] text-[var(--db-text-secondary)] flex flex-wrap gap-x-2 gap-y-0.5">
              <span>In: <strong className="text-[var(--db-text-primary)]">{totals.inputTokens.toLocaleString()}</strong></span>
              <span>Out: <strong className="text-[var(--db-text-primary)]">{totals.outputTokens.toLocaleString()}</strong></span>
              {totals.reasoningTokens > 0 && (
                <span className="text-[var(--db-amber-400)] font-medium">
                  Reasoning: <strong>{totals.reasoningTokens.toLocaleString()}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Card 2: Rate Limit Health */}
          <div className="p-3.5 rounded-lg bg-[var(--db-bg-card)] border border-[var(--db-border-subtle)]">
            <div className="text-[11px] font-medium text-[var(--db-text-muted)] uppercase tracking-wider mb-1">
              Rate Limit Health
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${
                rateLimitStatus.isAnyModelCoolingDown || rateLimitStatus.isAnyModelThrottled
                  ? 'bg-[var(--db-amber-400)] animate-pulse'
                  : 'bg-[var(--db-emerald-400)]'
              }`} />
              <div className="text-lg font-bold font-serif text-[var(--db-text-primary)]">
                {rateLimitStatus.isAnyModelCoolingDown
                  ? 'Cooldown Active'
                  : rateLimitStatus.isAnyModelThrottled
                  ? 'Throttled'
                  : 'All Systems Normal'}
              </div>
            </div>
            <div className="mt-2 text-[11px] text-[var(--db-text-secondary)]">
              <span>429 Rate Hits: <strong className={totals.rateLimitedRequests > 0 ? 'text-[var(--db-amber-400)]' : ''}>{totals.rateLimitedRequests}</strong></span>
              {rateLimitStatus.activeCooldowns.length > 0 && (
                <span className="ml-2 text-[var(--db-crimson-400)] font-semibold">
                  ({rateLimitStatus.activeCooldowns.length} cooling down)
                </span>
              )}
            </div>
          </div>

          {/* Card 3: Requests & Success */}
          <div className="p-3.5 rounded-lg bg-[var(--db-bg-card)] border border-[var(--db-border-subtle)]">
            <div className="text-[11px] font-medium text-[var(--db-text-muted)] uppercase tracking-wider mb-1">
              Total API Calls
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--db-text-primary)]">
              {totals.totalRequests.toLocaleString()}
            </div>
            <div className="mt-2 text-[11px] text-[var(--db-text-secondary)] flex items-center justify-between">
              <span>Success: <strong className="text-[var(--db-emerald-400)]">{successRate}%</strong></span>
              <span>Avg: <strong>{totals.averageLatencyMs}ms</strong></span>
            </div>
          </div>

          {/* Card 4: Reasoning & Overhead */}
          <div className="p-3.5 rounded-lg bg-[var(--db-bg-card)] border border-[var(--db-border-subtle)]">
            <div className="text-[11px] font-medium text-[var(--db-text-muted)] uppercase tracking-wider mb-1">
              Reasoning Overhead
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--db-amber-400)]">
              {totals.totalTokens > 0
                ? `${Math.round((totals.reasoningTokens / totals.totalTokens) * 100)}%`
                : '0%'}
            </div>
            <div className="mt-2 text-[11px] text-[var(--db-text-muted)] truncate">
              {totals.reasoningTokens > 0
                ? `${totals.reasoningTokens.toLocaleString()} thinking tokens spent`
                : 'No reasoning overhead detected'}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[var(--db-border-subtle)] px-6 bg-[var(--db-bg-surface)]">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-4 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-[var(--db-gold-400)] text-[var(--db-gold-400)]'
                : 'border-transparent text-[var(--db-text-muted)] hover:text-[var(--db-text-primary)]'
            }`}
          >
            📊 Consumption Breakdown
          </button>
          <button
            onClick={() => setActiveTab('models')}
            className={`py-3 px-4 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'models'
                ? 'border-[var(--db-gold-400)] text-[var(--db-gold-400)]'
                : 'border-transparent text-[var(--db-text-muted)] hover:text-[var(--db-text-primary)]'
            }`}
          >
            ⚡ Model Rate Limits & Cooldowns
            {rateLimitStatus.activeCooldowns.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-[var(--db-crimson-400)]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            className={`py-3 px-4 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'ledger'
                ? 'border-[var(--db-gold-400)] text-[var(--db-gold-400)]'
                : 'border-transparent text-[var(--db-text-muted)] hover:text-[var(--db-text-primary)]'
            }`}
          >
            📜 Live Request Ledger ({recentLedger.length})
          </button>
          <button
            onClick={() => setActiveTab('optimizer')}
            className={`py-3 px-4 text-xs font-medium border-b-2 transition-colors text-[var(--db-emerald-400)] ${
              activeTab === 'optimizer'
                ? 'border-[var(--db-emerald-400)] font-semibold'
                : 'border-transparent opacity-80 hover:opacity-100'
            }`}
          >
            💡 Token & Rate Saver Guide
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* TAB 1: CONSUMPTION BREAKDOWN */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Provider Breakdown */}
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--db-text-muted)] mb-3">
                  Token Consumption by AI Provider
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(byProvider).map(([providerId, data]: [string, any]) => {
                    const pct = totals.totalTokens > 0
                      ? Math.round((data.totalTokens / totals.totalTokens) * 100)
                      : 0;
                    return (
                      <div key={providerId} className="p-4 rounded-lg bg-[var(--db-bg-elevated)] border border-[var(--db-border-subtle)]">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm text-[var(--db-text-primary)] capitalize">
                            {providerId.replace(/_/g, ' ')}
                          </span>
                          <Badge variant="stone" size="sm">{pct}% of Total</Badge>
                        </div>
                        <div className="text-xl font-bold font-mono text-[var(--db-gold-400)] mb-2">
                          {data.totalTokens.toLocaleString()} tokens
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="w-full bg-[var(--db-bg-card)] rounded-full h-2 mb-3 overflow-hidden border border-[var(--db-border-subtle)]">
                          <div
                            className="bg-[var(--db-gold-500)] h-full transition-all duration-500"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>

                        <div className="text-xs text-[var(--db-text-secondary)] space-y-1">
                          <div className="flex justify-between">
                            <span>Requests:</span>
                            <span className="font-mono text-[var(--db-text-primary)]">{data.requests} ({data.successCount} ok, {data.failureCount} err)</span>
                          </div>
                          <div className="flex justify-between">
                            <span>429 Rate Limits:</span>
                            <span className={`font-mono ${data.rateLimit429Count > 0 ? 'text-[var(--db-amber-400)] font-bold' : ''}`}>
                              {data.rateLimit429Count}
                            </span>
                          </div>
                          {data.quotaStatus?.remaining !== undefined && (
                            <div className="flex justify-between text-[var(--db-emerald-400)]">
                              <span>Credits / Remaining:</span>
                              <span className="font-mono">{data.quotaStatus.remaining}</span>
                            </div>
                          )}
                          {data.quotaStatus?.billingState && (
                            <div className="flex justify-between text-[var(--db-text-muted)] text-[11px]">
                              <span>Billing Tier:</span>
                              <span>{data.quotaStatus.billingState}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(byProvider).length === 0 && (
                    <div className="col-span-3 py-6 text-center text-xs text-[var(--db-text-muted)]">
                      No provider requests recorded in the current session.
                    </div>
                  )}
                </div>
              </div>

              {/* Task Category Consumption */}
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--db-text-muted)] mb-3">
                  Token Usage by Task Category
                </h3>
                <div className="bg-[var(--db-bg-elevated)] rounded-lg border border-[var(--db-border-subtle)] overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[var(--db-bg-surface)] text-[var(--db-text-muted)] uppercase border-b border-[var(--db-border-subtle)]">
                      <tr>
                        <th className="px-4 py-2.5">Category</th>
                        <th className="px-4 py-2.5 text-right">Total Tokens</th>
                        <th className="px-4 py-2.5 text-right">Input</th>
                        <th className="px-4 py-2.5 text-right">Output</th>
                        <th className="px-4 py-2.5 text-right">Reasoning</th>
                        <th className="px-4 py-2.5 text-right">Calls</th>
                        <th className="px-4 py-2.5 text-right">429s</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--db-border-subtle)]">
                      {Object.entries(byCategory).map(([category, catData]: [string, any]) => (
                        <tr key={category} className="hover:bg-[var(--db-bg-card)]">
                          <td className="px-4 py-2 font-medium text-[var(--db-text-primary)]">
                            {category.replace(/_/g, ' ')}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[var(--db-gold-400)] font-semibold">
                            {catData.totalTokens.toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[var(--db-text-secondary)]">
                            {catData.inputTokens.toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[var(--db-text-secondary)]">
                            {catData.outputTokens.toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[var(--db-amber-400)]">
                            {catData.reasoningTokens > 0 ? catData.reasoningTokens.toLocaleString() : '-'}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[var(--db-text-secondary)]">
                            {catData.requests}
                          </td>
                          <td className="px-4 py-2 text-right font-mono">
                            {catData.rateLimit429Count > 0 ? (
                              <span className="text-[var(--db-crimson-400)] font-bold">{catData.rateLimit429Count}</span>
                            ) : (
                              <span className="text-[var(--db-text-muted)]">0</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {Object.keys(byCategory).length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-6 text-center text-[var(--db-text-muted)]">
                            No task category activity recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MODEL RATE LIMITS & HEALTH */}
          {activeTab === 'models' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--db-text-primary)]">
                    Model Operational State & Rate Limits
                  </h3>
                  <p className="text-xs text-[var(--db-text-muted)]">
                    Track model throttling, 429 rate limit errors, and active failover cooldown countdowns.
                  </p>
                </div>
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => handleResetCooldown()}
                  className="text-xs"
                >
                  ⚡ Reset All Cooldowns & Breakers
                </Button>
              </div>

              <div className="bg-[var(--db-bg-elevated)] rounded-lg border border-[var(--db-border-subtle)] overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[var(--db-bg-surface)] text-[var(--db-text-muted)] uppercase border-b border-[var(--db-border-subtle)]">
                    <tr>
                      <th className="px-4 py-2.5">Model</th>
                      <th className="px-4 py-2.5">Provider</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Tokens</th>
                      <th className="px-4 py-2.5 text-right">Calls (Ok/Err)</th>
                      <th className="px-4 py-2.5 text-right">429s</th>
                      <th className="px-4 py-2.5 text-right">Avg Latency</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--db-border-subtle)]">
                    {byModel.map((model: any) => {
                      const isCoolingDown = model.cooldownRemainingSec > 0;
                      const statusVariant: 'rose' | 'amber' | 'stone' | 'emerald' = isCoolingDown
                        ? 'rose'
                        : model.operationalStatus === 'THROTTLED'
                        ? 'amber'
                        : model.operationalStatus === 'DISABLED'
                        ? 'stone'
                        : 'emerald';

                      return (
                        <tr key={`${model.providerId}::${model.modelId}`} className="hover:bg-[var(--db-bg-card)]">
                          <td className="px-4 py-3">
                            <div className="font-medium text-[var(--db-text-primary)] truncate max-w-[200px]" title={model.displayName}>
                              {model.displayName}
                            </div>
                            <div className="text-[10px] text-[var(--db-text-muted)] font-mono">
                              {model.modelId} ({model.pool})
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[var(--db-text-secondary)] capitalize">
                            {model.providerId.replace(/_/g, ' ')}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Badge variant={statusVariant} size="sm">
                                {isCoolingDown
                                  ? `Cooldown (${model.cooldownRemainingSec}s)`
                                  : model.operationalStatus}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-[var(--db-gold-400)]">
                            {model.observedTokens.total.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            <span className="text-[var(--db-emerald-400)]">{model.successCount}</span> / <span className={model.failureCount > 0 ? 'text-[var(--db-crimson-400)]' : 'text-[var(--db-text-muted)]'}>{model.failureCount}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {model.rateLimit429Count > 0 ? (
                              <span className="text-[var(--db-crimson-400)] font-bold">
                                {model.rateLimit429Count}
                              </span>
                            ) : (
                              <span className="text-[var(--db-text-muted)]">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-[var(--db-text-secondary)]">
                            {model.averageLatencyMs > 0 ? `${model.averageLatencyMs}ms` : '-'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {(isCoolingDown || model.health === 'Throttled' || model.rateLimit429Count > 0) && (
                              <button
                                onClick={() => handleResetCooldown(model.providerId, model.modelId)}
                                className="text-[11px] px-2 py-0.5 rounded bg-[var(--db-bg-card)] border border-[var(--db-border-subtle)] text-[var(--db-text-secondary)] hover:text-[var(--db-text-primary)] hover:border-[var(--db-gold-500)] transition-colors"
                              >
                                Clear Cooldown
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: LIVE API REQUEST LEDGER */}
          {activeTab === 'ledger' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--db-text-primary)]">
                    Live AI Request Stream
                  </h3>
                  <p className="text-xs text-[var(--db-text-muted)]">
                    Audit individual API calls, token breakdowns, and response times across all systems.
                  </p>
                </div>
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={handleResetTelemetry}
                  className="text-xs text-[var(--db-crimson-400)] hover:text-[var(--db-crimson-300)]"
                >
                  Clear History Log
                </Button>
              </div>

              <div className="bg-[var(--db-bg-elevated)] rounded-lg border border-[var(--db-border-subtle)] overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[var(--db-bg-surface)] text-[var(--db-text-muted)] uppercase border-b border-[var(--db-border-subtle)]">
                    <tr>
                      <th className="px-3 py-2.5">Time</th>
                      <th className="px-3 py-2.5">Task / Category</th>
                      <th className="px-3 py-2.5">Model</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5 text-right">In / Out / Reason</th>
                      <th className="px-3 py-2.5 text-right">Total Tokens</th>
                      <th className="px-3 py-2.5 text-right">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--db-border-subtle)] font-mono">
                    {recentLedger.slice().reverse().map((entry: any, index: number) => {
                      const timeStr = new Date(entry.timestamp).toLocaleTimeString();
                      const statusVariant: 'rose' | 'amber' | 'stone' | 'emerald' = entry.success
                        ? 'emerald'
                        : entry.failureType === '429'
                        ? 'rose'
                        : entry.failureType === 'TIMEOUT'
                        ? 'amber'
                        : 'stone';

                      return (
                        <tr key={`${entry.timestamp}-${index}`} className="hover:bg-[var(--db-bg-card)]">
                          <td className="px-3 py-2 text-[var(--db-text-muted)] whitespace-nowrap">
                            {timeStr}
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-sans font-medium text-[var(--db-text-primary)] block">
                              {entry.task}
                            </span>
                            <span className="text-[10px] text-[var(--db-text-muted)]">
                              {entry.category}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[var(--db-text-secondary)] truncate max-w-[150px]" title={entry.modelId}>
                            {entry.modelId}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant={statusVariant} size="sm">
                              {entry.success ? '200 OK' : entry.failureType || 'FAILED'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right text-[var(--db-text-secondary)] text-[11px]">
                            {entry.inputTokens} / {entry.outputTokens}
                            {entry.reasoningTokens > 0 && (
                              <span className="text-[var(--db-amber-400)] ml-1">
                                (+{entry.reasoningTokens} thk)
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-[var(--db-gold-400)]">
                            {entry.totalTokens.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right text-[var(--db-text-muted)]">
                            {entry.latencyMs}ms
                          </td>
                        </tr>
                      );
                    })}
                    {recentLedger.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-[var(--db-text-muted)] font-sans">
                          No recent API calls logged in the active session.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: TOKEN & RATE SAVER GUIDE */}
          {activeTab === 'optimizer' && (
            <div className="space-y-6 text-xs text-[var(--db-text-secondary)]">
              <div className="p-4 rounded-lg bg-[var(--db-emerald-500)]/10 border border-[var(--db-emerald-500)]/20 text-[var(--db-text-primary)]">
                <h3 className="text-sm font-semibold text-[var(--db-emerald-300)] mb-1 flex items-center gap-2">
                  <span>🛡️</span> Token Depletion & Rate-Limit Reduction Strategies
                </h3>
                <p className="text-xs text-[var(--db-text-muted)]">
                  Apply these techniques to prevent reaching free-tier RPM/RPD rate limits and reduce token depletion by over 80%.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tip 1 */}
                <div className="p-4 rounded-lg bg-[var(--db-bg-elevated)] border border-[var(--db-border-subtle)] space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--db-gold-400)]">
                    <span>1.</span> Disable Thinking for Simple Extractions
                  </div>
                  <p className="leading-relaxed">
                    Reasoning models (like <code className="text-[var(--db-text-primary)]">deepseek-r1</code>) spend up to 4,000 hidden reasoning tokens before outputting a short skill name or character trait. Pin non-reasoning or fast models for structured JSON tasks.
                  </p>
                </div>

                {/* Tip 2 */}
                <div className="p-4 rounded-lg bg-[var(--db-bg-elevated)] border border-[var(--db-border-subtle)] space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--db-gold-400)]">
                    <span>2.</span> Pin Fast Models for Frequent Tasks
                  </div>
                  <p className="leading-relaxed">
                    High-frequency tasks like <code className="text-[var(--db-text-primary)]">intent.interpret</code>, <code className="text-[var(--db-text-primary)]">story.advice</code>, and <code className="text-[var(--db-text-primary)]">ooc.respond</code> execute quickly on <strong className="text-[var(--db-text-primary)]">Gemini 3.5 Flash Lite</strong> or <strong className="text-[var(--db-text-primary)]">Llama 3.3 70B</strong> with minimal token overhead.
                  </p>
                </div>

                {/* Tip 3 */}
                <div className="p-4 rounded-lg bg-[var(--db-bg-elevated)] border border-[var(--db-border-subtle)] space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--db-gold-400)]">
                    <span>3.</span> OpenRouter Free Tier Quota Limits
                  </div>
                  <p className="leading-relaxed">
                    OpenRouter <code className="text-[var(--db-text-primary)]">:free</code> models have hard rate limits (~10–20 requests per minute and 200 requests/day). If you encounter frequent 429s, transition to low-cost paid endpoints (e.g. Gemini 2.5 Flash at $0.0001/turn).
                  </p>
                </div>

                {/* Tip 4 */}
                <div className="p-4 rounded-lg bg-[var(--db-bg-elevated)] border border-[var(--db-border-subtle)] space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--db-gold-400)]">
                    <span>4.</span> Zero-Token Deterministic Combat & Rules
                  </div>
                  <p className="leading-relaxed">
                    Dice rolls, combat damage calculations, inventory changes, and condition status timers are handled locally by the authoritative TypeScript game engine, spending <strong>0 API tokens</strong>.
                  </p>
                </div>
              </div>

              {onOpenModelRouting && (
                <div className="p-4 rounded-lg bg-[var(--db-bg-surface)] border border-[var(--db-border-subtle)] flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-[var(--db-text-primary)]">Configure Model Fallback Chains & Task Pins</h4>
                    <p className="text-xs text-[var(--db-text-muted)]">
                      Customize model routing and failovers per task category in the advanced routing workstation.
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      onClose();
                      onOpenModelRouting();
                    }}
                  >
                    Open Model Routing Workstation →
                  </Button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-[var(--db-border-subtle)] bg-[var(--db-bg-surface)] text-xs text-[var(--db-text-muted)]">
          <div>
            Last updated: {report?.timestamp ? new Date(report.timestamp).toLocaleTimeString() : 'Never'}
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetTelemetry}
              className="text-xs"
            >
              Reset Session Stats
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
};
