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
  const [fallbackSelectedTask, setFallbackSelectedTask] = useState<string>('narrative.generate');
  const [addingModelKey, setAddingModelKey] = useState<string>('');

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

  const currentChain = fallbackChains[fallbackSelectedTask] || [
    'google_gemini::gemini-3.6-flash',
    'google_gemini::gemini-2.5-flash',
    'provider_deterministic_emergency::emergency-fallback-local',
  ];

  const handleSaveChain = async (newChain: string[]) => {
    try {
      const res = await apiClient.setOrchestratorFallbackChain({ task: fallbackSelectedTask, chain: newChain });
      if (res?.fallbackChains) {
        setFallbackChains(res.fallbackChains);
      }
    } catch (err) {
      console.error('Failed to update fallback chain:', err);
    }
  };

  const handleMoveFallbackItem = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx <= 0 || targetIdx >= currentChain.length) return;
    const updated = [...currentChain];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    handleSaveChain(updated);
  };

  const handleRemoveFallbackItem = (index: number) => {
    if (index === 0 || currentChain.length <= 1) return;
    const updated = currentChain.filter((_, i) => i !== index);
    handleSaveChain(updated);
  };

  const handleReplaceFallbackItem = (index: number, newModelKey: string) => {
    const updated = [...currentChain];
    updated[index] = newModelKey;
    handleSaveChain(updated);
  };

  const handleAddFallbackModel = () => {
    if (!addingModelKey) return;
    if (currentChain.includes(addingModelKey)) return;
    const emergencyKey = 'provider_deterministic_emergency::emergency-fallback-local';
    let updated = [...currentChain];
    const emergencyIdx = updated.indexOf(emergencyKey);
    if (emergencyIdx !== -1) {
      updated.splice(emergencyIdx, 0, addingModelKey);
    } else {
      updated.push(addingModelKey);
    }
    handleSaveChain(updated);
    setAddingModelKey('');
  };

  const handleToggleFallbackModel = (modelKey: string, enabled: boolean) => {
    const emergencyKey = 'provider_deterministic_emergency::emergency-fallback-local';
    const primaryKey =
      taskPins[fallbackSelectedTask] ||
      currentChain.find((key) => key !== emergencyKey) ||
      '';

    const selectedFallbacks = currentChain.filter(
      (key) => key !== emergencyKey && key !== primaryKey
    );

    const nextFallbacks = enabled
      ? Array.from(new Set([...selectedFallbacks, modelKey]))
      : selectedFallbacks.filter((key) => key !== modelKey);

    handleSaveChain([
      ...(primaryKey ? [primaryKey] : []),
      ...nextFallbacks,
      emergencyKey,
    ]);
  };

  const handlePinTaskModel = async (taskKey: string, fullModelKey: string) => {
    const orchestratorTaskId = TASK_ID_MAP[taskKey];
    try {
      setTaskPins((prev) => ({ ...prev, [orchestratorTaskId]: fullModelKey }));
      await apiClient.pinModelForTask({ task: orchestratorTaskId, modelKey: fullModelKey });

      const emergencyKey = 'provider_deterministic_emergency::emergency-fallback-local';
      const existingChain = fallbackChains[orchestratorTaskId] || [];
      const nextFallbacks = existingChain.filter(
        (key) => key !== emergencyKey && key !== fullModelKey
      );

      await apiClient.setOrchestratorFallbackChain({
        task: orchestratorTaskId,
        chain: [fullModelKey, ...nextFallbacks, emergencyKey],
      });

      await loadOrchestratorData();
    } catch (err) {
      console.error(`Failed to pin model for task ${taskKey}:`, err);
    }
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
              <h3 className="text-base font-serif font-bold text-[var(--db-text-primary)]">Task Primary & Fallback Routing</h3>
              <p className="text-xs text-[var(--db-text-muted)] mt-0.5">
                Each task has its own primary AI and its own ordered AI fallback set. These choices are authoritative for runtime routing.
              </p>
            </div>

            <div className="pt-5 space-y-4">
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
                const chain = fallbackChains[taskId] || [];
                const emergencyKey = 'provider_deterministic_emergency::emergency-fallback-local';
                const primaryKey = taskPins[taskId] || chain.find((key) => key !== emergencyKey) || '';
                const eligible = getEligibleModelsForTask(task.key)
                  .filter((m) => !m.isEmergencyFloor);

                const selectedFallbacks = new Set(
                  chain.filter((key) => key !== emergencyKey && key !== primaryKey)
                );

                return (
                  <div key={task.key} className="p-4 rounded-[var(--db-radius-md)] bg-[var(--db-bg-canvas)] border border-[var(--db-border-default)] space-y-4">
                    <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-[var(--db-text-primary)]">{task.label}</div>
                        <div className="text-[11px] text-[var(--db-text-muted)]">{task.desc}</div>
                      </div>
                      <select
                        value={primaryKey}
                        onChange={(e) => handlePinTaskModel(task.key, e.target.value)}
                        className="w-full xl:w-80 px-3 py-2 rounded bg-[var(--db-bg-card)] border border-[var(--db-border-default)] text-xs text-[var(--db-text-primary)]"
                      >
                        <option value="">Choose primary model...</option>
                        {eligible.map((model) => {
                          const fullKey = `${model.providerId}::${model.modelId}`;
                          return <option key={fullKey} value={fullKey}>{getProviderDisplayName(model.providerId)} • {model.displayName || model.modelId}</option>;
                        })}
                      </select>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-[var(--db-text-secondary)] mb-2">
                        Allowed AI fallbacks — checked models are tried in the order shown below.
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {eligible
                          .filter((model) => `${model.providerId}::${model.modelId}` !== primaryKey)
                          .map((model) => {
                            const fullKey = `${model.providerId}::${model.modelId}`;
                            const info = getModelStatusInfo(model);
                            const checked = selectedFallbacks.has(fullKey);
                            return (
                              <label
                                key={fullKey}
                                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[var(--db-border-default)] bg-[var(--db-bg-card)] cursor-pointer hover:border-[var(--db-purple-500)]/50"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => handleToggleFallbackModel(fullKey, e.target.checked)}
                                    className="w-4 h-4 accent-[var(--db-purple-500)] cursor-pointer shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <div className="text-xs text-[var(--db-text-primary)] truncate">
                                      {model.displayName || model.modelId}
                                    </div>
                                    <div className="text-[10px] text-[var(--db-text-muted)] truncate">
                                      {getProviderDisplayName(model.providerId)}
                                    </div>
                                  </div>
                                </div>
                                <Badge variant={info.variant} size="sm">{info.label}</Badge>
                              </label>
                            );
                          })}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[var(--db-border-subtle)] text-[10px] text-[var(--db-text-muted)]">
                      Runtime order: <span className="font-mono text-[var(--db-text-secondary)]">
                        {primaryKey ? getProviderDisplayName(primaryKey.split('::')[0]) + ' / ' + (primaryKey.split('::')[1] || primaryKey) : 'No primary selected'}
                        {' → your checked AI fallbacks → deterministic emergency floor'}
                      </span>
                    </div>
                  </div>
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

      {/* TAB 6: DATA */}
      {activeTab === 'DATA' && (
        <div className="space-y-6 max-w-4xl">
          <div className="p-5 rounded-[var(--db-radius-lg)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] space-y-4">
            <h3 className="text-sm font-serif font-bold text-[var(--db-text-primary)] flex items-center gap-2">
              <span>💾</span> Data Backup & Export
            </h3>
            <p className="text-xs text-[var(--db-text-muted)]">
              Export story runs, worlds, and personal compendium collection entries.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <Button variant="subtle" size="sm">
                Export Local Cache JSON
              </Button>
              <Button variant="subtle" size="sm">
                Clear Asset Cache
              </Button>
            </div>
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
