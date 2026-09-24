import React, { useState, useEffect } from 'react';
import { useAudioHaptic } from '../AudioHapticManager';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { PRESET_VOICES } from '../voiceResolver';
import { apiClient } from '../../services/apiClient';

export type SettingsTab =
  | 'GENERAL'
  | 'APPEARANCE'
  | 'STORYTELLING'
  | 'AUDIO'
  | 'PROVIDERS'
  | 'MODELS'
  | 'FALLBACKS'
  | 'REGISTRY_TEST'
  | 'DATA'
  | 'ADVANCED';

export interface SettingsViewProps {
  initialTab?: SettingsTab;
  onOpenAdvancedRouting?: () => void;
  onOpenLivingBible?: () => void;
  onOpenEpistemicInspector?: () => void;
  onOpenContextInspector?: () => void;
  onOpenDeveloperDiagnostics?: () => void;
  className?: string;
}

interface ProviderInfo {
  id: string;
  name: string;
  type: 'BUILTIN' | 'CONNECTED';
  status: 'CONNECTED' | 'FAILED' | 'NOT_CONFIGURED';
  modelCount: number;
  modalities: string[];
  health: 'Healthy' | 'Degraded' | 'Offline' | 'Unconfigured';
  lastTested?: string;
  hasKeySaved?: boolean;
}

const INITIAL_PROVIDERS: ProviderInfo[] = [
  {
    id: 'dreambook-native',
    name: 'DreamBook Native Engine',
    type: 'BUILTIN',
    status: 'CONNECTED',
    modelCount: 3,
    modalities: ['Text', 'State', 'Logic'],
    health: 'Healthy',
    lastTested: 'Just now',
  },
  {
    id: 'google-gemini',
    name: 'Google Gemini AI',
    type: 'CONNECTED',
    status: 'CONNECTED',
    modelCount: 6,
    modalities: ['Text', 'Vision', 'Multimodal'],
    health: 'Healthy',
    lastTested: 'Just now',
    hasKeySaved: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'CONNECTED',
    status: 'NOT_CONFIGURED',
    modelCount: 0,
    modalities: ['Text', 'Vision', 'Multimodal'],
    health: 'Unconfigured',
    hasKeySaved: false,
  },
  {
    id: 'openai',
    name: 'OpenAI API',
    type: 'CONNECTED',
    status: 'NOT_CONFIGURED',
    modelCount: 4,
    modalities: ['Text', 'Audio'],
    health: 'Unconfigured',
    hasKeySaved: false,
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    type: 'CONNECTED',
    status: 'NOT_CONFIGURED',
    modelCount: 3,
    modalities: ['Text'],
    health: 'Unconfigured',
    hasKeySaved: false,
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs Voice',
    type: 'CONNECTED',
    status: 'CONNECTED',
    modelCount: 8,
    modalities: ['TTS Audio'],
    health: 'Healthy',
    lastTested: '5 mins ago',
    hasKeySaved: true,
  },
];

const TASK_ID_MAP: Record<string, string> = {
  narrative: 'narrative.generate',
  dialogue: 'character.dialogue',
  memory: 'memory.extract',
  summarization: 'summary.scene',
  consistency: 'rules.adjudicate',
  tts: 'speech.generate',
  image: 'image.generate',
  research: 'utility.inspect',
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  initialTab = 'MODELS',
  onOpenAdvancedRouting,
  onOpenLivingBible,
  onOpenEpistemicInspector,
  onOpenContextInspector,
  onOpenDeveloperDiagnostics,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const { settings, updateSettings, isMuted, toggleMute } = useAudioHaptic();

  // Provider Key Form State
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [keySaveMessage, setKeySaveMessage] = useState<string | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isRefreshingRegistry, setIsRefreshingRegistry] = useState(false);
  const [providers, setProviders] = useState<ProviderInfo[]>(INITIAL_PROVIDERS);

  // Active Tooltip Explanations
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // Dynamic Orchestrator Registry & Pins State
  const [orchestratorModels, setOrchestratorModels] = useState<any[]>([]);
  const [taskPins, setTaskPins] = useState<Record<string, string>>({});
  const [testingModelKey, setTestingModelKey] = useState<string | null>(null);
  const [testResultFeedback, setTestResultFeedback] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedModel, setSelectedModel] = useState<any | null>(null);

  // Fallback Chain State
  const [fallbackChains, setFallbackChains] = useState<Record<string, string[]>>({});
  const [fallbackEditorTask, setFallbackEditorTask] = useState<string | null>(null);
  const [fallbackEditorSearch, setFallbackEditorSearch] = useState('');
  // Phase 13 persistence state
  const [persistenceStatus, setPersistenceStatus] = useState<any>(null);
  const [persistenceBusy, setPersistenceBusy] = useState(false);
  const [persistenceMessage, setPersistenceMessage] = useState<string | null>(null);

  const loadPersistenceStatus = async () => {
    try {
      const result = await apiClient.getPersistenceStatus();
      setPersistenceStatus(result.persistence || null);
    } catch (err: any) {
      setPersistenceMessage(err?.message || 'Failed to inspect persistence state.');
    }
  };

  const handlePersistenceMigration = async () => {
    setPersistenceBusy(true);
    setPersistenceMessage(null);
    try {
      const result = await apiClient.migratePersistence();
      setPersistenceStatus(result.persistence || null);
      setPersistenceMessage(
        result.restartRequired
          ? 'Migration completed safely. The original save was backed up. Restart the server to load the migrated state.'
          : 'Persistence is already current.'
      );
    } catch (err: any) {
      setPersistenceMessage(err?.message || 'Migration failed. Source data was preserved.');
      await loadPersistenceStatus();
    } finally {
      setPersistenceBusy(false);
    }
  };

  const handlePersistenceRepair = async () => {
    setPersistenceBusy(true);
    setPersistenceMessage(null);
    try {
      const result = await apiClient.repairPersistence();
      setPersistenceStatus(result.inspection || null);
      setPersistenceMessage(
        result.changed
          ? 'Repair completed and the original save was backed up. Restart the server before continuing.'
          : 'No repair was required.'
      );
    } catch (err: any) {
      setPersistenceMessage(err?.message || 'Repair failed. Source data was preserved.');
      await loadPersistenceStatus();
    } finally {
      setPersistenceBusy(false);
    }
  };

  const loadOrchestratorData = async (forceRefresh = false) => {
    if (forceRefresh) setIsRefreshingRegistry(true);
    try {
      await apiClient.discoverOrchestratorModels(forceRefresh);

      const [modelsRes, pinsRes, fallbacksRes, openRouterStatus] = await Promise.all([
        apiClient.getOrchestratorModels(),
        apiClient.getOrchestratorPins(),
        apiClient.getOrchestratorFallbacks(),
        apiClient.getProviderCredentialStatus('openrouter').catch(() => ({ configured: false })),
      ]);

      if (modelsRes?.models) {
        setOrchestratorModels(modelsRes.models);
        setProviders((prev) =>
          prev.map((p) =>
            p.id === 'openrouter'
              ? {
                  ...p,
                  status: openRouterStatus?.configured ? 'CONNECTED' : 'NOT_CONFIGURED',
                  health: openRouterStatus?.configured ? 'Healthy' : 'Unconfigured',
                  hasKeySaved: openRouterStatus?.configured === true,
                  modelCount: modelsRes.models.filter((m: any) => m.providerId === 'openrouter').length,
                  lastTested: openRouterStatus?.configured ? 'Server verified' : undefined,
                }
              : p
          )
        );
      }
      if (pinsRes?.pins) setTaskPins(pinsRes.pins);
      if (fallbacksRes?.fallbackChains) setFallbackChains(fallbacksRes.fallbackChains);
    } catch (err: any) {
      console.error('Failed to load orchestrator data:', err);
      setTestResultFeedback(err?.message || 'Failed to refresh the model registry.');
    } finally {
      if (forceRefresh) setIsRefreshingRegistry(false);
    }
  };

  useEffect(() => {
    loadOrchestratorData(false);
  }, []);
  useEffect(() => {
    if (activeTab === 'DATA') {
      loadPersistenceStatus();
    }
  }, [activeTab]);

  const toggleTooltip = (id: string) => {
    setActiveTooltip(activeTooltip === id ? null : id);
  };

  const handleTestKey = async (providerId: string) => {
    if (!apiKeyInput.trim()) {
      setKeySaveMessage('Enter an API key before testing.');
      return;
    }

    setIsTestingConnection(true);
    setKeySaveMessage(null);
    try {
      await apiClient.saveProviderApiKey(providerId, apiKeyInput.trim());
      await loadOrchestratorData(true);
      setKeySaveMessage('Connection verified. Provider models refreshed.');
    } catch (err: any) {
      setKeySaveMessage(err?.message || 'Connection test failed.');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSaveKey = async (providerId: string) => {
    if (!apiKeyInput.trim()) return;

    setIsTestingConnection(true);
    setKeySaveMessage(null);
    try {
      await apiClient.saveProviderApiKey(providerId, apiKeyInput.trim());
      setApiKeyInput('');
      await loadOrchestratorData(true);
      setKeySaveMessage('API key saved securely on the server. Provider models refreshed.');
      setTimeout(() => {
        setEditingProviderId(null);
        setKeySaveMessage(null);
      }, 1800);
    } catch (err: any) {
      setKeySaveMessage(err?.message || 'Failed to save API key.');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const getTaskChain = (taskId: string): string[] => {
    const emergencyKey = 'provider_deterministic_emergency::emergency-fallback-local';
    const configured = fallbackChains[taskId] || [];
    return configured.filter((key, index, arr) => key !== emergencyKey && arr.indexOf(key) === index);
  };

  const persistTaskRoute = async (taskId: string, orderedModelKeys: string[]) => {
    const emergencyKey = 'provider_deterministic_emergency::emergency-fallback-local';
    const cleanKeys = Array.from(new Set(orderedModelKeys.filter(Boolean)));

    try {
      const primaryKey = cleanKeys[0] || null;

      if (primaryKey) {
        await apiClient.pinModelForTask({
          task: taskId,
          modelKey: primaryKey,
        });
      } else {
        await apiClient.pinModelForTask({
          task: taskId,
          modelKey: '',
        });
      }

      const res = await apiClient.setOrchestratorFallbackChain({
        task: taskId,
        chain: [...cleanKeys, emergencyKey],
      });

      if (res?.fallbackChains) {
        setFallbackChains(res.fallbackChains);
      } else {
        setFallbackChains((prev) => ({
          ...prev,
          [taskId]: [...cleanKeys, emergencyKey],
        }));
      }

      setTaskPins((prev) => {
        const next = { ...prev };
        if (primaryKey) next[taskId] = primaryKey;
        else delete next[taskId];
        return next;
      });
    } catch (err) {
      console.error(`Failed to update ${taskId} model route:`, err);
    }
  };

  const openFallbackEditor = (taskId: string) => {
    setFallbackEditorTask(taskId);
    setFallbackEditorSearch('');
  };

  const closeFallbackEditor = () => {
    setFallbackEditorTask(null);
    setFallbackEditorSearch('');
  };

  const handleReorderFallbackModel = async (
    taskId: string,
    index: number,
    direction: 'up' | 'down'
  ) => {
    const current = getTaskChain(taskId);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || index >= current.length || targetIndex < 0 || targetIndex >= current.length) {
      return;
    }

    const updated = [...current];
    [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
    await persistTaskRoute(taskId, updated);
  };

  const handleRemoveFallbackModel = async (taskId: string, modelKey: string) => {
    const current = getTaskChain(taskId);
    if (!current.includes(modelKey)) return;
    await persistTaskRoute(
      taskId,
      current.filter((key) => key !== modelKey)
    );
  };

  const handleAddFallbackModel = async (taskId: string, modelKey: string) => {
    const current = getTaskChain(taskId);
    if (current.includes(modelKey)) return;

    // The first chosen model becomes primary. Every later selection is appended
    // beneath the current last model and therefore becomes the next fallback.
    await persistTaskRoute(taskId, [...current, modelKey]);
  };

  const handlePinTaskModel = async (taskKey: string, fullModelKey: string) => {
    const orchestratorTaskId = TASK_ID_MAP[taskKey];
    await persistTaskRoute(orchestratorTaskId, [
      fullModelKey,
      ...getTaskChain(orchestratorTaskId).filter((key) => key !== fullModelKey),
    ]);
  };

  const handleTestModel = async (providerId: string, modelId: string) => {
    const key = `${providerId}::${modelId}`;
    setTestingModelKey(key);
    setTestResultFeedback(null);
    try {
      const res = await apiClient.testOrchestratorModel({ providerId, modelId });
      if (res?.result) {
        const { status, message, latencyMs } = res.result;
        setTestResultFeedback(`[${modelId}] Status: ${status} — ${message} (${latencyMs}ms)`);
      }
      await loadOrchestratorData();
    } catch (err: any) {
      setTestResultFeedback(`[${modelId}] TEST ERROR: ${err.message || String(err)}`);
    } finally {
      setTestingModelKey(null);
    }
  };

  const getModelStatusInfo = (model: any) => {
    if (model.health === 'Healthy' && model.accessStatus === 'accessible') {
      return { emoji: '🟢', label: 'READY', color: 'text-emerald-400', variant: 'emerald' as const };
    }
    if (model.health === 'Throttled' || model.quota === 'Exhausted' || model.accessStatus === 'quota_limited') {
      return { emoji: '🟠', label: 'QUOTA LIMIT (429)', color: 'text-amber-400', variant: 'amber' as const };
    }
    if (model.health === 'Unavailable' || model.accessStatus === 'unavailable') {
      return { emoji: '🔴', label: 'UNAVAILABLE (404)', color: 'text-rose-400', variant: 'rose' as const };
    }
    return { emoji: '⚪', label: 'NOT CONFIGURED', color: 'text-slate-400', variant: 'stone' as const };
  };

  const getProviderDisplayName = (providerId: string) => {
    if (providerId === 'google_gemini' || providerId === 'provider_google_gemini') return 'Google Gemini';
    if (providerId === 'openrouter') return 'OpenRouter';
    if (providerId === 'openai') return 'OpenAI';
    if (providerId === 'anthropic') return 'Anthropic';
    if (providerId === 'elevenlabs') return 'ElevenLabs';
    if (providerId === 'dreambook-native') return 'DreamBook Native';
    if (providerId === 'provider_deterministic_emergency') return 'DreamBook Emergency';
    return providerId;
  };

  const getUniqueModels = (models: any[]) => {
    const seen = new Set<string>();
    return models.filter((model) => {
      const key = `${model.providerId}::${model.modelId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const getFilteredModels = () => {
    const query = modelSearch.trim().toLowerCase();
    return getUniqueModels(orchestratorModels)
      .filter((model) => {
        if (!query) return true;
        const haystack = [
          model.displayName,
          model.modelId,
          model.providerId,
          model.description,
          ...(Array.isArray(model.capabilities) ? model.capabilities : []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => {
        const providerDiff = getProviderDisplayName(a.providerId).localeCompare(
          getProviderDisplayName(b.providerId)
        );
        if (providerDiff !== 0) return providerDiff;
        return String(a.displayName || a.modelId).localeCompare(String(b.displayName || b.modelId));
      });
  };

  const getEligibleModelsForTask = (taskKey: string) => {
    const orchestratorTaskId = TASK_ID_MAP[taskKey];
    if (!orchestratorModels || orchestratorModels.length === 0) return [];

    return orchestratorModels.filter((m) => {
      if (m.roleEligibility && m.roleEligibility.includes(orchestratorTaskId)) {
        return true;
      }
      if (taskKey === 'tts' && m.capabilities?.includes('tts')) return true;
      if (taskKey === 'image' && (m.capabilities?.includes('image_generation') || m.providerId === 'google_imagen')) return true;
      if (['narrative', 'dialogue', 'memory', 'summarization', 'consistency', 'research'].includes(taskKey)) {
        if (m.capabilities?.includes('creative_writing') || m.capabilities?.includes('fast') || m.isEmergencyFloor) return true;
      }
      return false;
    });
  };

  return (
    <div className={`space-y-6 animate-in fade-in duration-200 ${className}`} data-testid="settings-view">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--db-border-default)] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="purple" size="sm">
              Unified System Workspace
            </Badge>
            <Badge variant="blue" size="sm">
              DreamBook v10.8.35
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[var(--db-text-primary)]">
            SETTINGS
          </h1>
          <p className="text-xs text-[var(--db-text-secondary)] mt-0.5">
            Configure system engine parameters, model providers, storytelling parameters, and sensory audio controls.
          </p>
        </div>
      </div>

      {/* Internal Workspace Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-[var(--db-border-subtle)]">
        {[
          { id: 'GENERAL', label: 'General', icon: '⚙️' },
          { id: 'APPEARANCE', label: 'Appearance', icon: '🎨' },
          { id: 'STORYTELLING', label: 'Storytelling', icon: '📜' },
          { id: 'AUDIO', label: 'Audio & Voice', icon: '🔊' },
          { id: 'PROVIDERS', label: 'Providers', icon: '🔑' },
          { id: 'MODELS', label: 'Models', icon: '🧠' },
          { id: 'FALLBACKS', label: 'Fallbacks', icon: '🔁' },
          { id: 'REGISTRY_TEST', label: 'Registry & Tests', icon: '🧪' },
          { id: 'DATA', label: 'Data & Backup', icon: '💾' },
          { id: 'ADVANCED', label: 'Advanced', icon: '🛠️' },
        ].map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-[var(--db-radius-md)] text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[var(--db-surface-purple)] text-[var(--db-purple-200)] border border-[var(--db-purple-500)]/40 shadow-[var(--db-shadow-glow-purple)]'
                  : 'text-[var(--db-text-secondary)] hover:text-[var(--db-text-primary)] hover:bg-[var(--db-bg-card)] border border-transparent'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: GENERAL */}
      {activeTab === 'GENERAL' && (
        <div className="space-y-6 max-w-4xl">
          <div className="p-5 rounded-[var(--db-radius-lg)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] space-y-4">
            <h3 className="text-sm font-serif font-bold text-[var(--db-text-primary)] flex items-center gap-2">
              <span>⚙️</span> Engine System Environment
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="text-xs font-semibold text-[var(--db-text-secondary)] block mb-1">
                  Interface Language
                </label>
                <select className="w-full px-3 py-2 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] text-xs text-[var(--db-text-primary)]">
                  <option>English (US) — Default</option>
                  <option>English (UK)</option>
                  <option>Japanese (日本語)</option>
                  <option>Spanish (Español)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--db-text-secondary)] block mb-1">
                  Auto-Save Frequency
                </label>
                <select className="w-full px-3 py-2 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] text-xs text-[var(--db-text-primary)]">
                  <option>Every Turn (Immediate)</option>
                  <option>Every 5 Seconds</option>
                  <option>Every 15 Seconds</option>
                  <option>Manual Save Only</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--db-border-subtle)] flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-[var(--db-text-primary)] block">
                  DreamBook Version & Health
                </span>
                <span className="text-[11px] text-[var(--db-text-muted)] font-mono">
                  Engine Kernel v10.8.35 • Cloud Run Connected
                </span>
              </div>
              <Badge variant="emerald" size="sm">
                System Healthy
              </Badge>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: APPEARANCE */}
      {activeTab === 'APPEARANCE' && (
        <div className="space-y-6 max-w-4xl">
          <div className="p-5 rounded-[var(--db-radius-lg)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] space-y-4">
            <h3 className="text-sm font-serif font-bold text-[var(--db-text-primary)] flex items-center gap-2">
              <span>🎨</span> Visual Styling & Atmosphere
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-[var(--db-text-secondary)] block mb-1">
                  Interface Density
                </label>
                <select className="w-full px-3 py-2 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] text-xs text-[var(--db-text-primary)]">
                  <option>Spacious (Default)</option>
                  <option>Balanced</option>
                  <option>Compact</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--db-text-secondary)] block mb-1">
                  Typography Scale
                </label>
                <select className="w-full px-3 py-2 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] text-xs text-[var(--db-text-primary)]">
                  <option>Standard (16px Base)</option>
                  <option>Large (18px Base)</option>
                  <option>Compact (14px Base)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: STORYTELLING */}
      {activeTab === 'STORYTELLING' && (
        <div className="space-y-6 max-w-4xl">
          <div className="p-5 rounded-[var(--db-radius-lg)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] space-y-4">
            <h3 className="text-sm font-serif font-bold text-[var(--db-text-primary)] flex items-center gap-2">
              <span>📜</span> Storytelling & Game Master Personality
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[var(--db-text-secondary)] block mb-1">
                  Narrative Prose Style
                </label>
                <select className="w-full px-3 py-2 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] text-xs text-[var(--db-text-primary)]">
                  <option>Atmospheric & Descriptive (Gothic / High Fantasy)</option>
                  <option>Crisp & Action-Oriented (Tactical / Mystery)</option>
                  <option>Poetic & Lore-Heavy (Mythic)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--db-text-secondary)] block mb-1">
                  Sensory Ambient Detail Level
                </label>
                <select className="w-full px-3 py-2 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] text-xs text-[var(--db-text-primary)]">
                  <option>High (Rich ambient smells, lighting, weather cues)</option>
                  <option>Medium (Standard sensory field)</option>
                  <option>Low (Minimal ambient prose)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AUDIO & VOICE */}
      {activeTab === 'AUDIO' && (
        <div className="space-y-6 max-w-4xl">
          <div className="p-5 rounded-[var(--db-radius-lg)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--db-border-subtle)]">
              <div>
                <h3 className="text-sm font-serif font-bold text-[var(--db-text-primary)] flex items-center gap-2">
                  <span>🔊</span> Global Audio & TTS Settings
                </h3>
                <p className="text-xs text-[var(--db-text-muted)] mt-0.5">
                  Master volume, soundscape ambience, and speech audio playback defaults.
                </p>
              </div>
              <Button variant="subtle" size="sm" onClick={toggleMute}>
                {isMuted ? '🔇 Unmute All' : '🔊 Mute All'}
              </Button>
            </div>

            {/* Master Volume Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-[var(--db-text-secondary)]">Master Audio Level</span>
                <span className="font-mono text-[var(--db-gold-400)]">
                  {Math.round(settings.masterAudio * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.masterAudio}
                disabled={isMuted}
                onChange={(e) => updateSettings({ masterAudio: parseFloat(e.target.value) })}
                className="w-full accent-[var(--db-purple-500)] cursor-pointer disabled:opacity-40"
              />
            </div>

            {/* Voice / TTS Configuration */}
            <div className="space-y-4 pt-3 border-t border-[var(--db-border-subtle)]">
              <h4 className="text-xs font-semibold text-[var(--db-text-primary)] uppercase tracking-wider">
                Voice & TTS Engine Policy
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-[var(--db-text-secondary)] block mb-1">
                    Default TTS Provider
                  </label>
                  <select className="w-full px-3 py-2 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] text-xs text-[var(--db-text-primary)]">
                    <option>Google Cloud TTS (Neural2)</option>
                    <option>ElevenLabs AI Voice</option>
                    <option>Browser Web Speech Native</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--db-text-secondary)] block mb-1">
                    Speech Autoplay Policy
                  </label>
                  <select className="w-full px-3 py-2 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] text-xs text-[var(--db-text-primary)]">
                    <option>Dialogue Only (Auto-play character speech)</option>
                    <option>Full Narration + Dialogue</option>
                    <option>Manual Click to Listen Only</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)]">
                <div>
                  <span className="text-xs font-medium text-[var(--db-text-primary)] block">
                    Automatic Character Voice Identity
                  </span>
                  <span className="text-[11px] text-[var(--db-text-muted)]">
                    Automatically assigns stable distinct voices to NPCs via deterministic Voice Identity Resolver.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.characterVoiceEnabled}
                  onChange={(e) => updateSettings({ characterVoiceEnabled: e.target.checked })}
                  className="w-4 h-4 accent-[var(--db-purple-500)] cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: PROVIDERS */}
      {activeTab === 'PROVIDERS' && (
        <div className="space-y-6 max-w-5xl">
          <div className="p-5 rounded-[var(--db-radius-lg)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--db-border-subtle)]">
              <div>
                <h3 className="text-base font-serif font-bold text-[var(--db-text-primary)]">AI Providers</h3>
                <p className="text-xs text-[var(--db-text-muted)] mt-0.5">
                  Connect and manage the services that supply DreamBook's models.
                </p>
              </div>
              <Badge variant="purple" size="sm">Secure Secret Vault</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {providers.map((p) => {
                const isEditing = editingProviderId === p.id;
                return (
                  <div
                    key={p.id}
                    className="p-4 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs font-bold text-[var(--db-text-primary)]">{p.name}</h4>
                          {p.type === 'BUILTIN' && <Badge variant="gold" size="sm">Built-In</Badge>}
                        </div>
                        <div className="text-[11px] text-[var(--db-text-muted)] mt-0.5">
                          {p.modelCount} Available Models • {p.modalities.join(', ')}
                        </div>
                      </div>
                      <Badge variant={p.status === 'CONNECTED' ? 'emerald' : 'amber'} size="sm">
                        {p.status === 'CONNECTED' ? 'Connected' : 'Not Configured'}
                      </Badge>
                    </div>

                    <div className="pt-2 border-t border-[var(--db-border-subtle)] flex items-center justify-between gap-3 text-xs">
                      <span className="text-[11px] text-[var(--db-text-muted)]">
                        {p.hasKeySaved
                          ? 'API Key Saved (Secret Vault Protected)'
                          : p.type === 'BUILTIN'
                          ? 'Internal Runtime'
                          : 'No Key Configured'}
                      </span>
                      {p.type !== 'BUILTIN' && (
                        <button
                          type="button"
                          onClick={() => setEditingProviderId(isEditing ? null : p.id)}
                          className="text-xs text-[var(--db-purple-400)] hover:text-[var(--db-purple-300)] font-medium cursor-pointer"
                        >
                          {isEditing ? 'Cancel' : p.hasKeySaved ? 'Manage' : 'Connect'}
                        </button>
                      )}
                    </div>

                    {isEditing && (
                      <div className="mt-3 p-3 rounded bg-[var(--db-bg-card)] border border-[var(--db-border-default)] space-y-3">
                        <label className="text-[11px] font-semibold text-[var(--db-text-secondary)] block">
                          Enter {p.name} API Key
                        </label>
                        <input
                          type="password"
                          placeholder="••••••••••••••••••••••••"
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          className="w-full px-3 py-1.5 rounded bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] text-xs text-[var(--db-text-primary)] font-mono focus:outline-none focus:border-[var(--db-purple-500)]"
                        />
                        {keySaveMessage && (
                          <div className="text-[11px] text-[var(--db-emerald-400)] font-mono">{keySaveMessage}</div>
                        )}
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            variant="subtle"
                            size="sm"
                            disabled={isTestingConnection}
                            onClick={() => handleTestKey(p.id)}
                          >
                            {isTestingConnection ? 'Testing...' : 'Test Connection'}
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={isTestingConnection}
                            onClick={() => handleSaveKey(p.id)}
                          >
                            Save API Key
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: MODELS */}
      {activeTab === 'MODELS' && (
        <div className="space-y-6 max-w-6xl">
          <div className="p-5 rounded-[var(--db-radius-lg)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-serif font-bold text-[var(--db-text-primary)]">Model Catalog</h3>
                <p className="text-xs text-[var(--db-text-muted)] mt-0.5">
                  Browse every registered model, grouped by provider. Click a model for its full capability profile.
                </p>
              </div>
              <div className="relative w-full lg:w-96">
                <input
                  type="search"
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder="Search by model, provider, capability..."
                  className="w-full px-3 py-2 rounded-lg bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] text-xs text-[var(--db-text-primary)] focus:outline-none focus:border-[var(--db-purple-500)]"
                />
              </div>
            </div>

            <div className="space-y-6">
              {(() => {
                const filteredModels = getFilteredModels();
                const groups = filteredModels.reduce<Record<string, any[]>>((acc, model) => {
                  const providerName = getProviderDisplayName(model.providerId);
                  if (!acc[providerName]) acc[providerName] = [];
                  acc[providerName].push(model);
                  return acc;
                }, {});

                const providerNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

                return providerNames.length > 0 ? (
                  providerNames.map((providerName) => (
                    <div key={providerName} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-serif font-bold text-[var(--db-text-primary)]">{providerName}</h4>
                        <Badge variant="stone" size="sm">{groups[providerName].length} models</Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {groups[providerName].map((model) => {
                          const info = getModelStatusInfo(model);
                          return (
                            <button
                              key={`${model.providerId}::${model.modelId}`}
                              type="button"
                              onClick={() => setSelectedModel(model)}
                              className="text-left p-4 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] hover:border-[var(--db-purple-500)]/60 hover:bg-[var(--db-surface-purple)]/30 transition-colors cursor-pointer"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-[var(--db-text-primary)] truncate">
                                    {model.displayName || model.modelId}
                                  </div>
                                  <div className="text-[10px] font-mono text-[var(--db-text-muted)] truncate mt-0.5">
                                    {model.modelId}
                                  </div>
                                </div>
                                <Badge variant={info.variant} size="sm">{info.label}</Badge>
                              </div>
                              <div className="mt-3 text-[10px] text-[var(--db-text-muted)] space-y-1">
                                <div>{(model.contextWindow || 0).toLocaleString()} token context</div>
                                <div className="truncate">
                                  {Array.isArray(model.roleEligibility) ? model.roleEligibility.slice(0, 3).join(' • ') : 'General AI'}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 rounded-lg border border-dashed border-[var(--db-border-default)] text-center text-xs text-[var(--db-text-muted)]">
                    No models match “{modelSearch}”. Try a model ID, provider name, or capability.
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: FALLBACKS */}
      {activeTab === 'FALLBACKS' && (
        <div className="space-y-6 max-w-6xl">
          <div className="p-5 rounded-[var(--db-radius-lg)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)]">
            <div className="pb-4 border-b border-[var(--db-border-subtle)]">
              <h3 className="text-base font-serif font-bold text-[var(--db-text-primary)]">
                Task Fallback Routing
              </h3>
              <p className="text-xs text-[var(--db-text-muted)] mt-0.5">
                Choose a task, then manage its exact ordered model route. The first model is primary;
                the models below it are tried in order when the previous model fails.
              </p>
            </div>

            <div className="pt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { key: 'narrative', label: 'Narrative Storytelling', desc: 'Main prose, scene descriptions, world narration' },
                { key: 'dialogue', label: 'Character Dialogue', desc: 'NPC speech and interpersonal exchanges' },
                { key: 'memory', label: 'Memory & Extraction', desc: 'Fact extraction and chronicle indexing' },
                { key: 'summarization', label: 'Summarization', desc: 'Context compression and story memory' },
                { key: 'consistency', label: 'Canon Consistency', desc: 'Rules, canon, and world validation' },
                { key: 'research', label: 'Research & Search', desc: 'Codex lookup and grounded inspection' },
                { key: 'tts', label: 'Voice TTS', desc: 'Speech synthesis' },
                { key: 'image', label: 'Image Generation', desc: 'Artwork and cover generation' },
              ].map((task) => {
                const taskId = TASK_ID_MAP[task.key];
                const chain = getTaskChain(taskId);
                const primaryKey = chain[0] || '';
                const fallbackCount = Math.max(0, chain.length - 1);
                const primaryModel = orchestratorModels.find(
                  (model) => `${model.providerId}::${model.modelId}` === primaryKey
                );

                return (
                  <button
                    key={task.key}
                    type="button"
                    onClick={() => openFallbackEditor(taskId)}
                    className="text-left p-4 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] hover:border-[var(--db-purple-500)]/60 hover:bg-[var(--db-surface-purple)]/20 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[var(--db-text-primary)]">{task.label}</div>
                        <div className="text-[11px] text-[var(--db-text-muted)] mt-0.5">{task.desc}</div>
                      </div>
                      <span className="text-[var(--db-text-muted)] text-sm shrink-0">›</span>
                    </div>

                    <div className="mt-4 p-3 rounded-lg bg-[var(--db-bg-card)] border border-[var(--db-border-subtle)]">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--db-text-muted)]">Current route</div>
                      {primaryModel ? (
                        <>
                          <div className="text-xs font-semibold text-[var(--db-text-primary)] mt-1 truncate">
                            1. {primaryModel.displayName || primaryModel.modelId}
                          </div>
                          <div className="text-[10px] text-[var(--db-text-muted)] mt-0.5 truncate">
                            {getProviderDisplayName(primaryModel.providerId)}
                          </div>
                          <div className="text-[10px] text-[var(--db-text-muted)] mt-2">
                            {fallbackCount} fallback model{fallbackCount === 1 ? '' : 's'} configured
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-[var(--db-text-muted)] mt-1">No model selected yet</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: REGISTRY & REAL-TIME TESTS */}
      {activeTab === 'REGISTRY_TEST' && (
        <div className="space-y-6 max-w-6xl">
          <div className="p-5 rounded-[var(--db-radius-lg)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--db-border-subtle)]">
              <div>
                <h3 className="text-base font-serif font-bold text-[var(--db-text-primary)]">Registered Models</h3>
                <p className="text-xs text-[var(--db-text-muted)] mt-0.5">
                  The live server-side model registry after provider discovery.
                </p>
              </div>
              <Button
                variant="subtle"
                size="sm"
                onClick={() => loadOrchestratorData(true)}
                disabled={isRefreshingRegistry}
              >
                {isRefreshingRegistry ? '⟳ Discovering...' : '🔄 Refresh & Discover'}
              </Button>
            </div>

            {orchestratorModels.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--db-text-muted)]">
                No registered models are currently available. Configure a provider and refresh discovery.
              </div>
            ) : (
              <div className="space-y-2">
                {getFilteredModels().map((model) => (
                  <div key={`${model.providerId}::${model.modelId}`} className="p-3 rounded-lg bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedModel(model)}
                      className="text-left min-w-0 cursor-pointer"
                    >
                      <div className="text-xs font-bold text-[var(--db-text-primary)] truncate">{model.displayName || model.modelId}</div>
                      <div className="text-[10px] font-mono text-[var(--db-text-muted)] mt-0.5">
                        {getProviderDisplayName(model.providerId)} • {model.modelId}
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <Badge variant={getModelStatusInfo(model).variant} size="sm">{getModelStatusInfo(model).label}</Badge>
                      <Button
                        variant="subtle"
                        size="sm"
                        disabled={testingModelKey === `${model.providerId}::${model.modelId}`}
                        onClick={() => handleTestModel(model.providerId, model.modelId)}
                      >
                        {testingModelKey === `${model.providerId}::${model.modelId}` ? 'Testing...' : 'Test Model'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {testResultFeedback && (
            <div className="p-3 rounded-[var(--db-radius-md)] bg-[var(--db-surface-purple)] border border-[var(--db-purple-500)]/40 text-xs font-mono text-[var(--db-purple-300)]">
              {testResultFeedback}
            </div>
          )}

          <div className="p-5 rounded-[var(--db-radius-lg)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)]">
            <h3 className="text-base font-serif font-bold text-[var(--db-text-primary)]">Provider Discovery & Test Notes</h3>
            <p className="text-xs text-[var(--db-text-muted)] mt-1">
              Refresh performs provider discovery. Test Model performs a live readiness request against the specific model.
              Discovery and testing are separate so an available catalog entry is not mistaken for a healthy runtime model.
            </p>
          </div>
        </div>
      )}

      {selectedModel && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl bg-[var(--db-bg-card)] border border-[var(--db-border-default)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 p-5 border-b border-[var(--db-border-subtle)]">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-[var(--db-text-muted)]">
                  {getProviderDisplayName(selectedModel.providerId)}
                </div>
                <h3 className="text-lg font-serif font-bold text-[var(--db-text-primary)] mt-1">
                  {selectedModel.displayName || selectedModel.modelId}
                </h3>
                <div className="text-xs font-mono text-[var(--db-text-muted)] mt-1 break-all">
                  {selectedModel.modelId}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedModel(null)}
                className="px-3 py-1.5 rounded-lg border border-[var(--db-border-default)] text-xs text-[var(--db-text-secondary)] hover:text-[var(--db-text-primary)] cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)]">
                <div className="text-[10px] text-[var(--db-text-muted)]">Health</div>
                <div className="text-sm text-[var(--db-text-primary)] mt-1">
                  {getModelStatusInfo(selectedModel).label}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)]">
                <div className="text-[10px] text-[var(--db-text-muted)]">Provider</div>
                <div className="text-sm text-[var(--db-text-primary)] mt-1">{getProviderDisplayName(selectedModel.providerId)}</div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)]">
                <div className="text-[10px] text-[var(--db-text-muted)]">Context Window</div>
                <div className="text-sm text-[var(--db-text-primary)] mt-1">{(selectedModel.contextWindow || 0).toLocaleString()} tokens</div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)]">
                <div className="text-[10px] text-[var(--db-text-muted)]">Pool</div>
                <div className="text-sm text-[var(--db-text-primary)] mt-1">{selectedModel.pool || 'general'}</div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)]">
                <div className="text-[10px] text-[var(--db-text-muted)]">Access</div>
                <div className="text-sm text-[var(--db-text-primary)] mt-1">{selectedModel.accessStatus || 'unknown'}</div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)]">
                <div className="text-[10px] text-[var(--db-text-muted)]">Lifecycle</div>
                <div className="text-sm text-[var(--db-text-primary)] mt-1">{selectedModel.lifecycleState || 'active'}</div>
              </div>
            </div>

            <div className="px-5 pb-5 space-y-4">
              <div>
                <div className="text-xs font-semibold text-[var(--db-text-secondary)] mb-2">Eligible Tasks</div>
                <div className="flex flex-wrap gap-2">
                  {(Array.isArray(selectedModel.roleEligibility) ? selectedModel.roleEligibility : []).map((role: string) => (
                    <Badge key={role} variant="stone" size="sm">{role}</Badge>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-[var(--db-text-secondary)] mb-2">Capabilities</div>
                <div className="flex flex-wrap gap-2">
                  {(Array.isArray(selectedModel.capabilities) ? selectedModel.capabilities : []).map((cap: string) => (
                    <Badge key={cap} variant="blue" size="sm">{cap}</Badge>
                  ))}
                </div>
              </div>

              {selectedModel.description && (
                <div>
                  <div className="text-xs font-semibold text-[var(--db-text-secondary)] mb-2">Description</div>
                  <p className="text-xs leading-relaxed text-[var(--db-text-muted)]">{selectedModel.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {fallbackEditorTask && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl bg-[var(--db-bg-card)] border border-[var(--db-border-default)] shadow-2xl flex flex-col">
            {(() => {
              const taskLabelMap: Record<string, string> = {
                'narrative.generate': 'Narrative Storytelling',
                'character.dialogue': 'Character Dialogue',
                'memory.extract': 'Memory & Extraction',
                'summary.scene': 'Summarization',
                'rules.adjudicate': 'Canon Consistency',
                'utility.inspect': 'Research & Search',
                'speech.generate': 'Voice TTS',
                'image.generate': 'Image Generation',
              };
              const taskKeyMap: Record<string, string> = {
                'narrative.generate': 'narrative',
                'character.dialogue': 'dialogue',
                'memory.extract': 'memory',
                'summary.scene': 'summarization',
                'rules.adjudicate': 'consistency',
                'utility.inspect': 'research',
                'speech.generate': 'tts',
                'image.generate': 'image',
              };

              const taskId = fallbackEditorTask;
              const taskKey = taskKeyMap[taskId] || 'narrative';
              const activeKeys = getTaskChain(taskId);
              const selectedSet = new Set(activeKeys);
              const eligibleModels = getUniqueModels(
                getEligibleModelsForTask(taskKey).filter((model) => !model.isEmergencyFloor)
              );

              const query = fallbackEditorSearch.trim().toLowerCase();
              const availableModels = eligibleModels
                .filter((model) => !selectedSet.has(`${model.providerId}::${model.modelId}`))
                .filter((model) => {
                  if (!query) return true;
                  const haystack = [
                    model.displayName,
                    model.modelId,
                    model.providerId,
                    model.description,
                    ...(Array.isArray(model.capabilities) ? model.capabilities : []),
                  ].filter(Boolean).join(' ').toLowerCase();
                  return haystack.includes(query);
                })
                .sort((a, b) => {
                  const providerDiff = getProviderDisplayName(a.providerId).localeCompare(
                    getProviderDisplayName(b.providerId)
                  );
                  if (providerDiff !== 0) return providerDiff;
                  return String(a.displayName || a.modelId).localeCompare(
                    String(b.displayName || b.modelId)
                  );
                });

              const grouped = availableModels.reduce<Record<string, any[]>>((acc, model) => {
                const provider = getProviderDisplayName(model.providerId);
                if (!acc[provider]) acc[provider] = [];
                acc[provider].push(model);
                return acc;
              }, {});

              const providersSorted = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

              return (
                <>
                  <div className="p-5 border-b border-[var(--db-border-subtle)] space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-[var(--db-text-muted)]">Fallback route editor</div>
                        <h3 className="text-lg font-serif font-bold text-[var(--db-text-primary)] mt-1">
                          {taskLabelMap[taskId] || taskId}
                        </h3>
                        <p className="text-xs text-[var(--db-text-muted)] mt-1">
                          The models at the top are the active ordered route. The first is primary; the rest are fallbacks.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={closeFallbackEditor}
                        className="px-3 py-1.5 rounded-lg border border-[var(--db-border-default)] text-xs text-[var(--db-text-secondary)] hover:text-[var(--db-text-primary)] cursor-pointer"
                      >
                        Close
                      </button>
                    </div>

                    <input
                      type="search"
                      autoFocus
                      value={fallbackEditorSearch}
                      onChange={(e) => setFallbackEditorSearch(e.target.value)}
                      placeholder="Search models by name, model ID, provider, or capability..."
                      className="w-full px-4 py-2.5 rounded-lg bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] text-xs text-[var(--db-text-primary)] focus:outline-none focus:border-[var(--db-purple-500)]"
                    />
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-6">
                    <section>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="text-xs font-semibold text-[var(--db-text-secondary)] uppercase tracking-wider">
                            Active Route
                          </h4>
                          <p className="text-[10px] text-[var(--db-text-muted)] mt-1">
                            Checkboxes show which models are selected. Use the arrows to change their order.
                          </p>
                        </div>
                        <Badge variant="purple" size="sm">{activeKeys.length} selected</Badge>
                      </div>

                      {activeKeys.length === 0 ? (
                        <div className="p-5 rounded-lg border border-dashed border-[var(--db-border-default)] text-center text-xs text-[var(--db-text-muted)]">
                          No AI models selected. Click a model below to add the first primary model.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {activeKeys.map((key, index) => {
                            const model = orchestratorModels.find(
                              (candidate) => `${candidate.providerId}::${candidate.modelId}` === key
                            );
                            const [providerId, ...modelParts] = key.split('::');
                            const modelId = modelParts.join('::');
                            const info = model ? getModelStatusInfo(model) : null;

                            return (
                              <div
                                key={key}
                                className="flex items-center gap-3 p-3 rounded-lg bg-[var(--db-bg-canvas)] border border-[var(--db-purple-500)]/30"
                              >
                                <input
                                  type="checkbox"
                                  checked
                                  onChange={() => handleRemoveFallbackModel(taskId, key)}
                                  className="w-4 h-4 accent-[var(--db-purple-500)] cursor-pointer shrink-0"
                                  aria-label={`Remove ${model?.displayName || modelId} from route`}
                                />

                                <div className="w-7 text-center text-xs font-mono text-[var(--db-text-muted)]">
                                  {index + 1}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-bold text-[var(--db-text-primary)]">
                                      {model?.displayName || modelId}
                                    </span>
                                    {index === 0 ? (
                                      <Badge variant="purple" size="sm">PRIMARY</Badge>
                                    ) : (
                                      <Badge variant="stone" size="sm">FALLBACK {index}</Badge>
                                    )}
                                    {info && <Badge variant={info.variant} size="sm">{info.label}</Badge>}
                                  </div>
                                  <div className="text-[10px] text-[var(--db-text-muted)] mt-0.5 font-mono">
                                    {getProviderDisplayName(providerId)} • {model?.modelId || modelId}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    disabled={index === 0}
                                    onClick={() => handleReorderFallbackModel(taskId, index, 'up')}
                                    className="w-7 h-7 rounded border border-[var(--db-border-default)] text-xs text-[var(--db-text-secondary)] hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                                    title="Move up"
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    disabled={index === activeKeys.length - 1}
                                    onClick={() => handleReorderFallbackModel(taskId, index, 'down')}
                                    className="w-7 h-7 rounded border border-[var(--db-border-default)] text-xs text-[var(--db-text-secondary)] hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                                    title="Move down"
                                  >
                                    ↓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFallbackModel(taskId, key)}
                                    className="w-7 h-7 rounded border border-rose-900/60 text-xs text-rose-300 hover:text-rose-200 cursor-pointer"
                                    title="Remove from route"
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    <section className="space-y-4">
                      <div>
                        <h4 className="text-xs font-semibold text-[var(--db-text-secondary)] uppercase tracking-wider">
                          Available Models
                        </h4>
                        <p className="text-[10px] text-[var(--db-text-muted)] mt-1">
                          Click any model to add it to the bottom of this task's fallback route.
                        </p>
                      </div>

                      {providersSorted.length === 0 ? (
                        <div className="p-5 rounded-lg border border-dashed border-[var(--db-border-default)] text-center text-xs text-[var(--db-text-muted)]">
                          No models match your search for this task.
                        </div>
                      ) : (
                        providersSorted.map((provider) => (
                          <div key={provider} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <h5 className="text-xs font-bold text-[var(--db-text-primary)]">{provider}</h5>
                              <Badge variant="stone" size="sm">{grouped[provider].length}</Badge>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {grouped[provider].map((model) => {
                                const fullKey = `${model.providerId}::${model.modelId}`;
                                const info = getModelStatusInfo(model);

                                return (
                                  <button
                                    key={fullKey}
                                    type="button"
                                    onClick={() => handleAddFallbackModel(taskId, fullKey)}
                                    className="text-left flex items-center justify-between gap-3 p-3 rounded-lg bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] hover:border-[var(--db-purple-500)]/60 cursor-pointer transition-colors"
                                  >
                                    <div className="min-w-0">
                                      <div className="text-xs font-semibold text-[var(--db-text-primary)] truncate">
                                        {model.displayName || model.modelId}
                                      </div>
                                      <div className="text-[10px] text-[var(--db-text-muted)] font-mono truncate mt-0.5">
                                        {model.modelId}
                                      </div>
                                      <div className="text-[10px] text-[var(--db-text-muted)] mt-1">
                                        {getProviderDisplayName(model.providerId)}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Badge variant={info.variant} size="sm">{info.label}</Badge>
                                      <span className="text-[var(--db-purple-300)] text-lg">+</span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      )}
                    </section>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* TAB 6: DATA */}
      {activeTab === 'DATA' && (
        <div className="space-y-6 max-w-4xl">
          <div className="p-5 rounded-[var(--db-radius-lg)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] space-y-4">
            <div>
              <h3 className="text-sm font-serif font-bold text-[var(--db-text-primary)] flex items-center gap-2">
                <span>💾</span> Persistence, Migration & Repair
              </h3>
              <p className="text-xs text-[var(--db-text-muted)] mt-1">
                Phase 13 protects long-lived worlds when the engine schema evolves. Migration and repair always validate before replacing the live save.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(['world', 'character', 'rules', 'content'] as const).map((key) => (
                <div key={key} className="rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-subtle)] p-3">
                  <p className="text-[10px] uppercase tracking-wide text-[var(--db-text-muted)]">{key} schema</p>
                  <p className="mt-1 text-lg font-mono text-[var(--db-text-primary)]">
                    {persistenceStatus?.schemaVersions?.[key] ?? '—'}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[var(--db-text-primary)]">
                    Save version {persistenceStatus?.currentVersion ?? '—'} → target {persistenceStatus?.targetVersion ?? '—'}
                  </p>
                  <p className="text-[11px] text-[var(--db-text-muted)]">
                    {persistenceStatus?.exists ? (persistenceStatus?.needsMigration ? 'Migration required' : 'Current and validated') : 'No on-disk save found'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="subtle" size="sm" onClick={() => void loadPersistenceStatus()} disabled={persistenceBusy}>
                    Refresh
                  </Button>
                  <Button variant="subtle" size="sm" onClick={() => void handlePersistenceMigration()} disabled={persistenceBusy || !persistenceStatus?.needsMigration}>
                    {persistenceBusy ? 'Working…' : 'Migrate Save'}
                  </Button>
                  <Button variant="subtle" size="sm" onClick={() => void handlePersistenceRepair()} disabled={persistenceBusy || !persistenceStatus?.exists}>
                    Repair & Validate
                  </Button>
                </div>
              </div>

              {persistenceStatus?.path && (
                <p className="text-[10px] text-[var(--db-text-muted)] font-mono break-all">
                  {persistenceStatus.path}
                </p>
              )}
              {persistenceStatus?.errors?.length > 0 && (
                <div className="rounded-md border border-red-900/50 bg-red-950/20 p-2 text-[11px] text-red-300">
                  {persistenceStatus.errors.join(' ')}
                </div>
              )}
              {persistenceStatus?.warnings?.length > 0 && (
                <div className="rounded-md border border-amber-900/50 bg-amber-950/20 p-2 text-[11px] text-amber-300">
                  {persistenceStatus.warnings.join(' ')}
                </div>
              )}
              {persistenceMessage && (
                <div className="rounded-md border border-stone-800 bg-stone-900/60 p-2 text-[11px] text-stone-300">
                  {persistenceMessage}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[var(--db-border-subtle)]">
              <p className="text-[11px] text-[var(--db-text-muted)]">
                Failed migration or repair never overwrites the original without a pre-operation backup. Restart after a successful disk migration so the in-memory canonical repository reloads the migrated state.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-[var(--db-radius-lg)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] space-y-4">
            <h3 className="text-sm font-serif font-bold text-[var(--db-text-primary)]">Campaign Archive</h3>
            <p className="text-xs text-[var(--db-text-muted)]">
              Existing lossless campaign archive export/restore remains available separately from schema migration.
            </p>
          </div>
        </div>
      )}

      {/* TAB 7: ADVANCED */}
      {activeTab === 'ADVANCED' && (
        <div className="space-y-6 max-w-4xl">
          <div className="p-5 rounded-[var(--db-radius-lg)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] space-y-4">
            <h3 className="text-sm font-serif font-bold text-[var(--db-text-primary)] flex items-center gap-2">
              <span>🛠️</span> Advanced Engine Workstations & Diagnostic Tools
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] space-y-2">
                <h4 className="text-xs font-bold text-[var(--db-text-primary)]">Model Routing Workstation</h4>
                <p className="text-[11px] text-[var(--db-text-muted)]">Live model pool, telemetry graphs, circuit breakers, and simulation testbench.</p>
                <Button variant="subtle" size="sm" onClick={() => onOpenAdvancedRouting?.()}>
                  Launch Workstation
                </Button>
              </div>

              <div className="p-4 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] space-y-2">
                <h4 className="text-xs font-bold text-[var(--db-text-primary)]">Living Bible Workstation</h4>
                <p className="text-[11px] text-[var(--db-text-muted)]">Living world canon, entity graph inspection, and rule validation.</p>
                <Button variant="subtle" size="sm" onClick={() => onOpenLivingBible?.()}>
                  Launch Living Bible
                </Button>
              </div>

              <div className="p-4 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] space-y-2">
                <h4 className="text-xs font-bold text-[var(--db-text-primary)]">Epistemic Inspector</h4>
                <p className="text-[11px] text-[var(--db-text-muted)]">Inspect knowledge boundaries and NPC awareness states.</p>
                <Button variant="subtle" size="sm" onClick={() => onOpenEpistemicInspector?.()}>
                  Launch Epistemic Inspector
                </Button>
              </div>

              <div className="p-4 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] space-y-2">
                <h4 className="text-xs font-bold text-[var(--db-text-primary)]">Developer Diagnostics</h4>
                <p className="text-[11px] text-[var(--db-text-muted)]">Read-only Chronicle timeline, rule authority, runtime state, validation, persistence diagnostics, and canonical evidence explanations.</p>
                <Button variant="subtle" size="sm" onClick={() => onOpenDeveloperDiagnostics?.()}>
                  Launch Developer Diagnostics
                </Button>
              </div>

              <div className="p-4 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] space-y-2">
                <h4 className="text-xs font-bold text-[var(--db-text-primary)]">Context Inspector</h4>
                <p className="text-[11px] text-[var(--db-text-muted)]">Examine dynamic engine context windows and prompt compilation.</p>
                <Button variant="subtle" size="sm" onClick={() => onOpenContextInspector?.()}>
                  Launch Context Inspector
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
