import React, { useState, useEffect } from 'react';
import { WorldTemplate, WorldSearchCriteria, WorldSynthesisInput } from '../types';
import { apiClient } from '../services/apiClient';
import {
  Globe,
  PlusCircle,
  Search,
  SlidersHorizontal,
  Play,
  Layers,
  Sparkles,
  Shield,
  BookOpen,
  Calendar,
  Compass,
  Tag,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RotateCcw,
  X,
  User,
  Swords,
  Scroll,
} from 'lucide-react';

interface WorldLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRun?: (storyId: string) => void;
  onGenesisCharacter?: (world: WorldTemplate) => void;
}

export const WorldLibraryModal: React.FC<WorldLibraryModalProps> = ({
  isOpen,
  onClose,
  onSelectRun,
  onGenesisCharacter,
}) => {
  const [worlds, setWorlds] = useState<WorldTemplate[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const [selectedTone, setSelectedTone] = useState<string>('');
  const [selectedMedium, setSelectedMedium] = useState<string>('');
  const [selectedRules, setSelectedRules] = useState<string>('');
  const [selectedSetting, setSelectedSetting] = useState<string>('');
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [selectedPlaystyle, setSelectedPlaystyle] = useState<string>('');

  // Selected World & Preview Drawer State
  const [previewWorld, setPreviewWorld] = useState<WorldTemplate | null>(null);

  // World Creation Form State
  const [isCreatingWorld, setIsCreatingWorld] = useState<boolean>(false);
  const [premiseText, setPremiseText] = useState<string>('');
  const [creationTitle, setCreationTitle] = useState<string>('');
  const [creationGenre, setCreationGenre] = useState<string>('High Fantasy');
  const [creationTone, setCreationTone] = useState<string>('Heroic');
  const [creationStoryMode, setCreationStoryMode] = useState<'PROTAGONIST' | 'SIDE_CHARACTER' | 'FREE_ROAM'>('PROTAGONIST');
  const [creationRulesMode, setCreationRulesMode] = useState<'FULL_DND' | 'HYBRID_DND' | 'CUSTOM_HOMEBREW_DND'>('FULL_DND');
  const [isSubmittingCreation, setIsSubmittingCreation] = useState<boolean>(false);

  // Run Launcher State
  const [isLaunchingRun, setIsLaunchingRun] = useState<boolean>(false);
  const [launchingWorld, setLaunchingWorld] = useState<WorldTemplate | null>(null);
  const [runCharacterName, setRunCharacterName] = useState<string>('Hero Vael');
  const [runStoryMode, setRunStoryMode] = useState<'PROTAGONIST' | 'SIDE_CHARACTER' | 'FREE_ROAM'>('PROTAGONIST');
  const [runRulesMode, setRunRulesMode] = useState<string>('FULL_DND');
  const [activeRuns, setActiveRuns] = useState<any[]>([]);
  const [launchSuccessMessage, setLaunchSuccessMessage] = useState<string | null>(null);

  const fetchWorlds = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const filters: WorldSearchCriteria = {};
      if (searchQuery.trim()) filters.query = searchQuery.trim();
      if (selectedGenre) filters.genre = selectedGenre;
      if (selectedTone) filters.tone = selectedTone;
      if (selectedMedium) filters.medium = selectedMedium;
      if (selectedRules) filters.rules = selectedRules;
      if (selectedSetting) filters.setting = selectedSetting;
      if (selectedSource) filters.source = selectedSource;
      if (selectedPlaystyle) filters.playstyle = selectedPlaystyle;

      const data = await apiClient.getWorlds(filters);
      setWorlds(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load worlds from repository.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchWorlds();
    }
  }, [
    isOpen,
    searchQuery,
    selectedGenre,
    selectedTone,
    selectedMedium,
    selectedRules,
    selectedSetting,
    selectedSource,
    selectedPlaystyle,
  ]);

  if (!isOpen) return null;

  const handleCreateWorldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!premiseText.trim()) return;

    setIsSubmittingCreation(true);
    try {
      const input: WorldSynthesisInput = {
        naturalLanguagePremise: premiseText.trim(),
        title: creationTitle.trim() || undefined,
        genreTags: [creationGenre],
        toneTags: [creationTone],
        storyMode: creationStoryMode,
        dndRulesMode: creationRulesMode,
      };

      const newWorld = await apiClient.synthesizeWorld(input);
      setIsCreatingWorld(false);
      setPremiseText('');
      setCreationTitle('');
      await fetchWorlds();
      setPreviewWorld(newWorld);
    } catch (err: any) {
      setError(err?.message || 'Failed to synthesize world.');
    } finally {
      setIsSubmittingCreation(false);
    }
  };

  const handleStartRunSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!launchingWorld) return;

    try {
      const run = await apiClient.startWorldRun(launchingWorld.worldId, {
        storyMode: runStoryMode,
        dndRulesMode: runRulesMode,
        characterName: runCharacterName.trim() || 'Hero Vael',
      });

      setActiveRuns((prev) => [run, ...prev]);
      setLaunchSuccessMessage(`Successfully started Story Run ${run.storyId} (Pinned World v${run.pinnedWorldVersion})!`);
      if (onSelectRun) {
        onSelectRun(run.storyId);
      }
      setTimeout(() => {
        setIsLaunchingRun(false);
        setLaunchingWorld(null);
        setLaunchSuccessMessage(null);
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Failed to start world run.');
    }
  };

  return (
    <div
      id="world-library-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 backdrop-blur-md p-4 overflow-y-auto"
    >
      <div
        id="world-library-modal-container"
        className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-xl border border-stone-800 bg-stone-900 shadow-2xl text-stone-200 overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-stone-100 flex items-center gap-2">
                Reusable World Library & Campaign Discovery
                <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                  CH16 Canonical
                </span>
              </h2>
              <p className="text-xs text-stone-400">
                Discover canonical world templates, inspect world rules and capabilities, and launch independent Story Runs.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              id="create-world-premise-btn"
              onClick={() => setIsCreatingWorld(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create World from Premise</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="px-6 py-3 border-b border-stone-800/80 bg-stone-900/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="world-search-input"
                type="text"
                placeholder="Search by title, setting, lore, genre, or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-stone-950/60 border border-stone-800 text-stone-200 placeholder-stone-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              id="genre-filter-select"
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-stone-950/60 border border-stone-800 text-stone-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Genres</option>
              <option value="High Fantasy">High Fantasy</option>
              <option value="Cosmic Horror">Cosmic Horror</option>
              <option value="Steampunk">Steampunk</option>
              <option value="Cyberpunk">Cyberpunk</option>
              <option value="Mythic">Mythic</option>
            </select>

            <select
              id="tone-filter-select"
              value={selectedTone}
              onChange={(e) => setSelectedTone(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-stone-950/60 border border-stone-800 text-stone-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Tones</option>
              <option value="Heroic">Heroic</option>
              <option value="Grimdark">Grimdark</option>
              <option value="Mysterious">Mysterious</option>
              <option value="Whimsical">Whimsical</option>
            </select>

            <select
              id="rules-filter-select"
              value={selectedRules}
              onChange={(e) => setSelectedRules(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-stone-950/60 border border-stone-800 text-stone-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Rulesets</option>
              <option value="FULL_DND">Full D&D SRD</option>
              <option value="HYBRID_DND">Hybrid Narrative D&D</option>
              <option value="CUSTOM_HOMEBREW_DND">Custom Homebrew</option>
            </select>

            <select
              id="setting-filter-select"
              value={selectedSetting}
              onChange={(e) => setSelectedSetting(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-stone-950/60 border border-stone-800 text-stone-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Settings</option>
              <option value="Citadel">Citadel</option>
              <option value="Undersea">Undersea / Trenches</option>
              <option value="Astral">Astral / Void</option>
              <option value="Spire">Clockwork Spire</option>
              <option value="Wilderness">Wilderness / Forest</option>
            </select>

            <select
              id="source-filter-select"
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-stone-950/60 border border-stone-800 text-stone-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Sources</option>
              <option value="ORIGINAL_CANON">Original Canon</option>
              <option value="COMMUNITY_EXTENDED">Community Extended</option>
              <option value="HOMEBREW">Homebrew</option>
            </select>

            <select
              id="playstyle-filter-select"
              value={selectedPlaystyle}
              onChange={(e) => setSelectedPlaystyle(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-stone-950/60 border border-stone-800 text-stone-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Playstyles</option>
              <option value="Tactical">Tactical Combat</option>
              <option value="Exploration">Exploration</option>
              <option value="Survival">Survival</option>
              <option value="Investigation">Investigation</option>
              <option value="Narrative">Narrative-Driven</option>
            </select>

            {(searchQuery || selectedGenre || selectedTone || selectedRules || selectedSetting || selectedSource || selectedPlaystyle) && (
              <button
                id="reset-filters-btn"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedGenre('');
                  setSelectedTone('');
                  setSelectedRules('');
                  setSelectedSetting('');
                  setSelectedSource('');
                  setSelectedPlaystyle('');
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="py-16 text-center text-stone-500 text-sm flex flex-col items-center justify-center gap-3">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span>Loading world templates...</span>
            </div>
          ) : worlds.length === 0 ? (
            <div className="py-16 text-center text-stone-500 text-sm flex flex-col items-center justify-center gap-3">
              <Globe className="w-10 h-10 text-stone-600" />
              <span>No world templates found matching criteria.</span>
              <button
                onClick={() => setIsCreatingWorld(true)}
                className="mt-2 px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium"
              >
                Synthesize New World
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {worlds.map((w) => (
                <div
                  key={w.worldId}
                  id={`world-card-${w.worldId}`}
                  className="rounded-xl border border-stone-800 bg-stone-950/40 hover:border-indigo-500/50 transition p-4 flex flex-col justify-between group shadow-sm hover:shadow-md"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-stone-100 group-hover:text-indigo-300 transition">
                        {w.title}
                      </h3>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-800 text-stone-400 border border-stone-700">
                        v{w.worldManifestVersion || 1}
                      </span>
                    </div>

                    <p className="text-xs text-stone-400 line-clamp-2 mb-3">
                      {w.summary || w.description}
                    </p>

                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {w.genreTags?.map((g) => (
                        <span
                          key={g}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-stone-800 text-stone-300 border border-stone-700"
                        >
                          {g}
                        </span>
                      ))}
                      {w.toneTags?.map((t) => (
                        <span
                          key={t}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950/50 text-indigo-300 border border-indigo-800/40"
                        >
                          {t}
                        </span>
                      ))}
                      {w.defaultEra && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/40 text-amber-300 border border-amber-800/40">
                          {w.defaultEra}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-stone-850 flex items-center justify-between gap-2">
                    <button
                      id={`preview-world-btn-${w.worldId}`}
                      onClick={() => setPreviewWorld(w)}
                      className="px-2.5 py-1.5 text-xs text-stone-300 hover:text-stone-100 hover:bg-stone-800 rounded-lg transition"
                    >
                      Preview Lore & Rules
                    </button>
                    <div className="flex items-center gap-2">
                      {onGenesisCharacter && (
                        <button
                          id={`genesis-char-btn-${w.worldId}`}
                          onClick={() => {
                            onClose();
                            onGenesisCharacter(w);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-800/80 hover:bg-emerald-700 text-emerald-100 text-xs font-medium transition"
                          title="Create Protagonist for this World"
                        >
                          <User className="w-3.5 h-3.5" />
                          <span>Create Character</span>
                        </button>
                      )}
                      <button
                        id={`start-run-btn-${w.worldId}`}
                        onClick={() => {
                          setLaunchingWorld(w);
                          setIsLaunchingRun(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Start Story Run</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* World Preview Drawer / Modal */}
        {previewWorld && (
          <div
            id="world-preview-drawer"
            className="fixed inset-0 z-60 flex items-center justify-center bg-stone-950/70 p-4"
          >
            <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-stone-700 bg-stone-900 shadow-2xl p-6 overflow-y-auto text-stone-200">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-base font-bold text-stone-100">{previewWorld.title}</h3>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Template ID: <span className="font-mono">{previewWorld.worldId}</span> (Manifest v{previewWorld.worldManifestVersion})
                  </p>
                </div>
                <button
                  onClick={() => setPreviewWorld(null)}
                  className="p-1 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <h4 className="font-semibold text-stone-300 mb-1 flex items-center gap-1.5">
                    <Scroll className="w-3.5 h-3.5 text-indigo-400" />
                    Description & Setting
                  </h4>
                  <p className="text-stone-300 leading-relaxed bg-stone-950/50 p-3 rounded-lg border border-stone-800">
                    {previewWorld.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-stone-950/50 p-3 rounded-lg border border-stone-800">
                    <span className="text-stone-400 block mb-1">Era & Timeline</span>
                    <span className="font-medium text-amber-300">{previewWorld.defaultEra || 'Default Era'}</span>
                  </div>
                  <div className="bg-stone-950/50 p-3 rounded-lg border border-stone-800">
                    <span className="text-stone-400 block mb-1">Ruleset & Mode</span>
                    <span className="font-medium text-indigo-300">{previewWorld.rulesetId || 'Standard D&D'}</span>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-stone-300 mb-1 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    Capabilities & Magic System ({previewWorld.capabilities?.length || 0})
                  </h4>
                  <div className="space-y-1.5">
                    {previewWorld.capabilities && previewWorld.capabilities.length > 0 ? (
                      previewWorld.capabilities.map((c: any) => (
                        <div
                          key={c.capabilityId || c.name}
                          className="p-2 rounded bg-stone-950/40 border border-stone-800 flex items-center justify-between"
                        >
                          <span className="font-medium text-stone-200">{c.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/50 text-emerald-300 border border-emerald-800/40">
                            Tier: {c.powerTier || 'Moderate'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-stone-500 italic">No custom capabilities defined.</p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-stone-300 mb-1 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                    World Constraints & Rules ({previewWorld.worldRules?.length || 0})
                  </h4>
                  <div className="space-y-1.5">
                    {previewWorld.worldRules && previewWorld.worldRules.length > 0 ? (
                      previewWorld.worldRules.map((r: any) => (
                        <div
                          key={r.ruleId || r.description}
                          className="p-2 rounded bg-stone-950/40 border border-stone-800 text-stone-300"
                        >
                          {r.description}
                        </div>
                      ))
                    ) : (
                      <p className="text-stone-500 italic">Standard physics and canonical rules apply.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-stone-850 flex items-center justify-end gap-2">
                <button
                  onClick={() => setPreviewWorld(null)}
                  className="px-4 py-1.5 text-xs rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 transition"
                >
                  Close
                </button>
                {onGenesisCharacter && (
                  <button
                    onClick={() => {
                      const target = previewWorld;
                      setPreviewWorld(null);
                      onClose();
                      onGenesisCharacter(target);
                    }}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-medium transition"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Create Character</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    const target = previewWorld;
                    setPreviewWorld(null);
                    setLaunchingWorld(target);
                    setIsLaunchingRun(true);
                  }}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start Run with this World</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create World Modal Form */}
        {isCreatingWorld && (
          <div
            id="create-world-modal-form"
            className="fixed inset-0 z-60 flex items-center justify-center bg-stone-950/70 p-4"
          >
            <div className="relative w-full max-w-xl flex flex-col rounded-xl border border-stone-700 bg-stone-900 shadow-2xl p-6 text-stone-200">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-base font-bold text-stone-100 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    Synthesize New World from Premise
                  </h3>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Describe your world premise in natural language. The synthesis pipeline extracts structured capabilities, lore, and physics rules.
                  </p>
                </div>
                <button
                  onClick={() => setIsCreatingWorld(false)}
                  className="p-1 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateWorldSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-stone-300 font-medium mb-1">
                    World Title (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Celestial Archives of Aethelgard"
                    value={creationTitle}
                    onChange={(e) => setCreationTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-stone-950/60 border border-stone-800 text-stone-200 placeholder-stone-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-stone-300 font-medium mb-1">
                    Natural Language Premise *
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="e.g. A city built inside the rings of a dead star where gravity is manipulated by ancient guild bells..."
                    value={premiseText}
                    onChange={(e) => setPremiseText(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-stone-950/60 border border-stone-800 text-stone-200 placeholder-stone-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-stone-300 font-medium mb-1">Genre</label>
                    <select
                      value={creationGenre}
                      onChange={(e) => setCreationGenre(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-stone-950/60 border border-stone-800 text-stone-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="High Fantasy">High Fantasy</option>
                      <option value="Cosmic Horror">Cosmic Horror</option>
                      <option value="Steampunk">Steampunk</option>
                      <option value="Cyberpunk">Cyberpunk</option>
                      <option value="Mythic">Mythic</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-stone-300 font-medium mb-1">Tone</label>
                    <select
                      value={creationTone}
                      onChange={(e) => setCreationTone(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-stone-950/60 border border-stone-800 text-stone-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Heroic">Heroic</option>
                      <option value="Grimdark">Grimdark</option>
                      <option value="Mysterious">Mysterious</option>
                      <option value="Whimsical">Whimsical</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-stone-300 font-medium mb-1">Story Mode</label>
                    <select
                      value={creationStoryMode}
                      onChange={(e) => setCreationStoryMode(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg bg-stone-950/60 border border-stone-800 text-stone-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="PROTAGONIST">Protagonist</option>
                      <option value="SIDE_CHARACTER">Side Character</option>
                      <option value="FREE_ROAM">Free Roam</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-stone-300 font-medium mb-1">Rules Mode</label>
                    <select
                      value={creationRulesMode}
                      onChange={(e) => setCreationRulesMode(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg bg-stone-950/60 border border-stone-800 text-stone-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="FULL_DND">Full D&D SRD</option>
                      <option value="HYBRID_DND">Hybrid D&D</option>
                      <option value="CUSTOM_HOMEBREW_DND">Custom Homebrew</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-stone-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingWorld(false)}
                    className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingCreation || !premiseText.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium shadow"
                  >
                    {isSubmittingCreation ? (
                      <span>Synthesizing World...</span>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Synthesize World</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Start Story Run Modal */}
        {isLaunchingRun && launchingWorld && (
          <div
            id="start-run-modal-form"
            className="fixed inset-0 z-60 flex items-center justify-center bg-stone-950/70 p-4"
          >
            <div className="relative w-full max-w-lg flex flex-col rounded-xl border border-stone-700 bg-stone-900 shadow-2xl p-6 text-stone-200">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-base font-bold text-stone-100 flex items-center gap-2">
                    <Play className="w-4 h-4 text-indigo-400 fill-current" />
                    Launch Story Run
                  </h3>
                  <p className="text-xs text-stone-400 mt-0.5">
                    World: <span className="font-semibold text-stone-200">{launchingWorld.title}</span> (v{launchingWorld.worldManifestVersion})
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsLaunchingRun(false);
                    setLaunchingWorld(null);
                  }}
                  className="p-1 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {launchSuccessMessage ? (
                <div className="py-8 text-center space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto animate-bounce" />
                  <p className="text-sm font-semibold text-emerald-300">{launchSuccessMessage}</p>
                </div>
              ) : (
                <form onSubmit={handleStartRunSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-stone-300 font-medium mb-1 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-indigo-400" />
                      Character / Hero Name
                    </label>
                    <input
                      type="text"
                      required
                      value={runCharacterName}
                      onChange={(e) => setRunCharacterName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-stone-950/60 border border-stone-800 text-stone-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-300 font-medium mb-1 flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-amber-400" />
                      Story Mode
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['PROTAGONIST', 'SIDE_CHARACTER', 'FREE_ROAM'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setRunStoryMode(mode)}
                          className={`p-2.5 rounded-lg border text-center transition ${
                            runStoryMode === mode
                              ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200 font-semibold'
                              : 'bg-stone-950/40 border-stone-800 text-stone-400 hover:border-stone-700'
                          }`}
                        >
                          <span className="block text-[11px] capitalize">{mode.toLowerCase().replace('_', ' ')}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-stone-300 font-medium mb-1 flex items-center gap-1.5">
                      <Swords className="w-3.5 h-3.5 text-rose-400" />
                      Combat / Ruleset Mode
                    </label>
                    <select
                      value={runRulesMode}
                      onChange={(e) => setRunRulesMode(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-stone-950/60 border border-stone-800 text-stone-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="FULL_DND">Full D&D SRD Tactical Combat</option>
                      <option value="NARRATIVE_DICE_CLASH">Narrative Dice Clash</option>
                      <option value="HYBRID_DND">Hybrid Tactical / Narrative</option>
                      <option value="CUSTOM_HOMEBREW_DND">Custom Homebrew</option>
                    </select>
                  </div>

                  <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-800/40 text-indigo-300 text-[11px] leading-relaxed">
                    <strong>Run Isolation Guarantee:</strong> This Story Run is version-pinned to World Template v{launchingWorld.worldManifestVersion}. State mutations in this run will NEVER modify the base World Template or any other active run.
                  </div>

                  <div className="mt-6 pt-4 border-t border-stone-800 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsLaunchingRun(false);
                        setLaunchingWorld(null);
                      }}
                      className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Launch Run</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
