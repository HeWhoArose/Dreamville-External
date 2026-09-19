import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  MapPin, 
  User, 
  Compass, 
  CheckCircle, 
  ChevronRight, 
  ChevronLeft, 
  Wand2, 
  Shield, 
  Dice5, 
  Feather, 
  RotateCcw,
  Loader2,
  Calendar,
  Globe,
  Layers,
  RefreshCw
} from 'lucide-react';
import { apiClient } from '../services/apiClient';

interface CreateStoryWizardProps {
  onSelectRun: (storyId: string) => void;
  onCancel: () => void;
}

const GENRES = ['Epic Fantasy', 'Grimdark', 'Cyberpunk', 'Solarpunk', 'Cosmic Horror', 'Steampunk'];
const TONES = ['Mysterious', 'Melancholic', 'Heroic', 'Satirical', 'Cynical', 'Atmospheric'];
const MEDIUMS = ['Anime', 'Visual Novel', 'Retro Pixel', 'Tabletop RPG', 'Cinematic', 'Dark Novel'];

const EXAMPLE_PROMPTS = [
  "A world made entirely of glass.",
  "A kingdom floating above an endless ocean.",
  "A city where every memory can be bought and sold.",
  "A dark fantasy world where I am the only werewolf.",
  "A post-apocalyptic world reclaimed by enormous plants."
];

const PORTRAITS = [
  { emoji: '🧙‍♂️', label: 'Mage' },
  { emoji: '🥷', label: 'Rogue' },
  { emoji: '🛡️', label: 'Knight' },
  { emoji: '🏹', label: 'Ranger' },
  { emoji: '🧛', label: 'Vampire' },
  { emoji: '🦁', label: 'Beast' },
  { emoji: '🤖', label: 'Construct' },
  { emoji: '🧝‍♀️', label: 'Elf' }
];

export const CreateStoryWizard: React.FC<CreateStoryWizardProps> = ({ onSelectRun, onCancel }) => {
  const [stage, setStage] = useState<number>(1);
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [isLaunching, setIsLaunching] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Stage 1 State: Premise & Optional Style
  const [premise, setPremise] = useState<string>('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedTones, setSelectedTones] = useState<string[]>([]);
  const [selectedMediums, setSelectedMediums] = useState<string[]>([]);

  // Stage 2 State: Synthesized World Preview & Evaluation
  const [synthesizedWorld, setSynthesizedWorld] = useState<any | null>(null);

  React.useEffect(() => {
    setSynthesizedWorld(null);
  }, [premise, selectedGenres, selectedTones, selectedMediums]);

  // Stage 3 State: Character Genesis
  const [charName, setCharName] = useState<string>('');
  const [charRole, setCharRole] = useState<string>('Mage');
  const [charBackground, setCharBackground] = useState<string>('');
  const [charAppearance, setCharAppearance] = useState<string>('');
  const [charPersonality, setCharPersonality] = useState<string>('');
  const [charMotivations, setCharMotivations] = useState<string>('');
  const [charEquipment, setCharEquipment] = useState<string>('');
  const [charPortraitEmoji, setCharPortraitEmoji] = useState<string>('🧙‍♂️');

  // Stage 4 State: Starting Conditions & Rules
  const [storyMode, setStoryMode] = useState<string>('PROTAGONIST');
  const [rulesetMode, setRulesetMode] = useState<string>('FULL_DND');

  const toggleTag = (tag: string, list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (list.includes(tag)) {
      setList(list.filter(t => t !== tag));
    } else {
      setList([...list, tag]);
    }
  };

  const handleSynthesizeWorld = async () => {
    if (!premise.trim()) {
      setError('Please provide a natural language idea or premise for your world.');
      return;
    }
    setError(null);
    setIsSynthesizing(true);
    try {
      const result = await apiClient.synthesizeWorld({
        naturalLanguagePremise: premise,
        title: selectedGenres.length > 0 ? `${selectedGenres[0]} Campaign` : 'DreamBook Campaign',
        genreTags: selectedGenres,
        toneTags: selectedTones,
        mediumTags: selectedMediums,
      });
      setSynthesizedWorld(result);
      if (result.suggestedProtagonist) {
        setCharName(result.suggestedProtagonist.name || '');
        setCharRole(result.suggestedProtagonist.role || 'Adventurer');
        setCharBackground(result.suggestedProtagonist.background || '');
        setCharAppearance(result.suggestedProtagonist.appearance || '');
        setCharPersonality(result.suggestedProtagonist.personality || '');
        setCharMotivations(result.suggestedProtagonist.motivations || '');
        setCharEquipment((result.suggestedProtagonist.equipment || []).join(', '));
      }
      setStage(2);
    } catch (e: any) {
      setError(e.message || 'We couldn\'t generate your world right now.');
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleLaunchStory = async () => {
    if (!synthesizedWorld) return;
    setError(null);
    setIsLaunching(true);
    try {
      const response = await apiClient.startWorldRun(synthesizedWorld.worldId, {
        storyMode,
        dndRulesMode: rulesetMode,
        characterName: charName || 'Unnamed Protagonist',
        characterRole: charRole,
        characterBackground: charBackground,
        characterAppearance: charAppearance,
        characterPersonality: charPersonality,
        characterMotivations: charMotivations,
        characterEquipment: charEquipment ? charEquipment.split(',').map(s => s.trim()).filter(Boolean) : [],
        characterPortraitEmoji: charPortraitEmoji,
        capabilities: synthesizedWorld.capabilities || [],
      });
      if (response && response.storyId) {
        onSelectRun(response.storyId);
      } else {
        throw new Error('Server starting run did not return a valid storyId.');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to launch the story. Please try again.');
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-10 px-6 text-stone-100 bg-stone-950 rounded-2xl border border-stone-800/80 shadow-2xl" id="create-story-wizard">
      {/* Step Header */}
      <div className="flex justify-between items-center mb-8 border-b border-stone-800 pb-4">
        <div>
          <span className="text-xs uppercase tracking-widest text-purple-400 font-semibold">Stage {stage} of 5</span>
          <h2 className="text-2xl font-serif font-bold text-stone-100 tracking-wide mt-1">
            {stage === 1 && 'Create Your World'}
            {stage === 2 && 'Generated World Concept'}
            {stage === 3 && 'Character Genesis'}
            {stage === 4 && 'Starting Scene & Campaign Rules'}
            {stage === 5 && 'Final Campaign Dossier'}
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`h-2 w-8 rounded-full transition-all duration-300 ${
                s <= stage ? 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.4)]' : 'bg-stone-800'
              }`}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-sm flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-xs underline text-rose-400 hover:text-rose-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Wizard Content */}
      <div className="min-h-[480px]">
        {stage === 1 && (
          <div className="space-y-8">
            {/* AI Concept Hero Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
                <h3 className="text-lg font-serif font-semibold text-stone-200">Start with an idea</h3>
              </div>
              <p className="text-stone-400 text-sm leading-relaxed max-w-3xl">
                Tell DreamBook what kind of world you imagine. Our synthesis engine will expand your premise into a rich living world with geography, factions, lore, and background events.
              </p>

              {/* Natural Language Prompt Input */}
              <div className="relative mt-4">
                <textarea
                  id="premise-input"
                  className="w-full h-36 p-4 border border-stone-800 rounded-xl bg-stone-900/80 text-stone-100 placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 font-serif leading-relaxed text-base resize-none shadow-inner"
                  placeholder="Describe the world you imagine... (e.g. A world made entirely of glass, or a city where memories are currency)"
                  value={premise}
                  onChange={(e) => setPremise(e.target.value)}
                />
              </div>

              {/* Quick Prompt Ideas */}
              <div className="space-y-2 pt-1">
                <span className="text-xs font-medium uppercase tracking-wider text-stone-500 block">Try an inspiring idea:</span>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_PROMPTS.map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => setPremise(ex)}
                      className="text-xs bg-stone-900/90 border border-stone-800 text-stone-300 px-3 py-1.5 rounded-lg hover:border-purple-500/40 hover:bg-stone-800/80 transition-all text-left flex items-center gap-1.5 cursor-pointer"
                    >
                      <span className="text-purple-400">✦</span> {ex}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Optional Style Guidance Section */}
            <div className="border-t border-stone-800 pt-6 space-y-6">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wider text-stone-300 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-400" /> Style & Guidance (Optional)
                </h4>
                <p className="text-xs text-stone-400 mt-0.5">
                  Select zero, one, or multiple styles to guide the generation, or leave them all unselected for pure AI inference from your premise.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Genre */}
                <div className="bg-stone-900/50 border border-stone-800/80 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-stone-300 uppercase tracking-wider">Genre — optional</span>
                    {selectedGenres.length > 0 && (
                      <button onClick={() => setSelectedGenres([])} className="text-[10px] text-purple-400 hover:underline cursor-pointer">Clear</button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {GENRES.map((g) => {
                      const isSelected = selectedGenres.includes(g);
                      return (
                        <button
                          key={g}
                          onClick={() => toggleTag(g, selectedGenres, setSelectedGenres)}
                          className={`px-2.5 py-1 rounded-lg text-xs border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-purple-600/30 text-purple-200 border-purple-500/60 font-medium shadow-[0_0_8px_rgba(168,85,247,0.2)]'
                              : 'bg-stone-900 text-stone-400 border-stone-800 hover:border-stone-700'
                          }`}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Tone */}
                <div className="bg-stone-900/50 border border-stone-800/80 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-stone-300 uppercase tracking-wider">Tone — optional</span>
                    {selectedTones.length > 0 && (
                      <button onClick={() => setSelectedTones([])} className="text-[10px] text-purple-400 hover:underline cursor-pointer">Clear</button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {TONES.map((t) => {
                      const isSelected = selectedTones.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => toggleTag(t, selectedTones, setSelectedTones)}
                          className={`px-2.5 py-1 rounded-lg text-xs border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-purple-600/30 text-purple-200 border-purple-500/60 font-medium shadow-[0_0_8px_rgba(168,85,247,0.2)]'
                              : 'bg-stone-900 text-stone-400 border-stone-800 hover:border-stone-700'
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Medium */}
                <div className="bg-stone-900/50 border border-stone-800/80 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-stone-300 uppercase tracking-wider">Medium — optional</span>
                    {selectedMediums.length > 0 && (
                      <button onClick={() => setSelectedMediums([])} className="text-[10px] text-purple-400 hover:underline cursor-pointer">Clear</button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {MEDIUMS.map((m) => {
                      const isSelected = selectedMediums.includes(m);
                      return (
                        <button
                          key={m}
                          onClick={() => toggleTag(m, selectedMediums, setSelectedMediums)}
                          className={`px-2.5 py-1 rounded-lg text-xs border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-purple-600/30 text-purple-200 border-purple-500/60 font-medium shadow-[0_0_8px_rgba(168,85,247,0.2)]'
                              : 'bg-stone-900 text-stone-400 border-stone-800 hover:border-stone-700'
                          }`}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {stage === 2 && synthesizedWorld && (
          <div className="space-y-6">
            <div className="p-4 bg-purple-950/40 border border-purple-800/60 rounded-xl text-purple-200 text-sm flex items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <div>
                  <span className="font-semibold block text-stone-100">{synthesizedWorld.title || 'Dynamic World Concept'}</span>
                  <span className="text-xs text-purple-300">{synthesizedWorld.summary || 'Generated successfully from your premise.'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSynthesizeWorld}
                  disabled={isSynthesizing}
                  className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSynthesizing ? 'animate-spin' : ''}`} /> Regenerate
                </button>
                <button
                  onClick={() => setStage(1)}
                  className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  Edit Premise
                </button>
              </div>
            </div>

            {/* Rich Generated World Preview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left 2 Cols: World Overview & Description */}
              <div className="md:col-span-2 space-y-6">
                <div className="border border-stone-800 rounded-xl p-6 bg-stone-900/60 space-y-4">
                  <h3 className="text-lg font-serif font-semibold text-stone-100 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-purple-400" /> World Overview & Lore
                  </h3>
                  <p className="text-stone-300 text-sm leading-relaxed whitespace-pre-line font-serif">
                    {synthesizedWorld.description || synthesizedWorld.summary}
                  </p>

                  <div className="pt-4 border-t border-stone-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-stone-500 uppercase tracking-wider block text-[10px]">Setting</span>
                      <span className="text-stone-200 font-medium">{synthesizedWorld.setting || 'Known Realm'}</span>
                    </div>
                    <div>
                      <span className="text-stone-500 uppercase tracking-wider block text-[10px]">Era</span>
                      <span className="text-stone-200 font-medium">{synthesizedWorld.era || 'Current Age'}</span>
                    </div>
                    <div>
                      <span className="text-stone-500 uppercase tracking-wider block text-[10px]">World ID</span>
                      <span className="text-stone-400 font-mono text-[11px]">{synthesizedWorld.worldId}</span>
                    </div>
                    <div>
                      <span className="text-stone-500 uppercase tracking-wider block text-[10px]">Capabilities</span>
                      <span className="text-stone-200 font-medium">{(synthesizedWorld.capabilities || []).length} active</span>
                    </div>
                  </div>
                </div>

                {/* Geography & Key Locations */}
                <div className="border border-stone-800 rounded-xl p-6 bg-stone-900/60 space-y-4">
                  <h3 className="text-lg font-serif font-semibold text-stone-100 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-blue-400" /> Key Locations & Regions
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(synthesizedWorld.geography?.nodes || synthesizedWorld.geography?.locations || []).slice(0, 4).map((node: any) => (
                      <div key={node.id} className="p-3 bg-stone-950/60 rounded-lg border border-stone-800">
                        <div className="font-semibold text-stone-200 text-sm">{node.name}</div>
                        <p className="text-xs text-stone-400 mt-1 line-clamp-2">{node.description || 'No description available.'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Col: Factions & Timeline Preview */}
              <div className="space-y-6">
                <div className="border border-stone-800 rounded-xl p-6 bg-stone-900/60 space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-300 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-400" /> Major Factions
                  </h3>
                  <div className="space-y-3">
                    {(!synthesizedWorld.factions || synthesizedWorld.factions.length === 0) ? (
                      <p className="text-xs text-stone-500 italic">No major factions recorded.</p>
                    ) : (
                      synthesizedWorld.factions.slice(0, 3).map((f: any) => (
                        <div key={f.id} className="p-3 bg-stone-950/60 rounded-lg border border-stone-800 text-xs">
                          <strong className="text-stone-200 block mb-0.5">{f.name}</strong>
                          <p className="text-stone-400 line-clamp-2">{f.description}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="border border-stone-800 rounded-xl p-6 bg-stone-900/60 space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-300 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-purple-400" /> Planned World Events
                  </h3>
                  <div className="space-y-2">
                    {(!synthesizedWorld.events || synthesizedWorld.events.length === 0) ? (
                      <p className="text-xs text-stone-500 italic">No scheduled background developments.</p>
                    ) : (
                      synthesizedWorld.events.slice(0, 3).map((ev: any, idx: number) => (
                        <div key={ev.id || idx} className="p-2.5 bg-stone-950/60 rounded-lg border border-stone-800 text-xs">
                          <div className="font-semibold text-stone-200">{ev.title}</div>
                          <div className="text-[10px] text-stone-400 mt-0.5">{ev.category} • Year 42</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {stage === 3 && (
          <div className="space-y-6">
            <p className="text-stone-300 text-sm leading-relaxed max-w-3xl">
              Establish the profile of your protagonist. This dossier is bound with server authority checks and determines how NPCs perceive and interact with you.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Details & BIO */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1">Character Name</label>
                  <input
                    type="text"
                    id="char-name-input"
                    className="w-full px-4 py-2 border border-stone-800 rounded-xl bg-stone-900 text-stone-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-sm"
                    placeholder="E.g., Vaelen of Highcrest"
                    value={charName}
                    onChange={(e) => setCharName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1">Role / Archetype</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-stone-800 rounded-xl bg-stone-900 text-stone-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-sm"
                    placeholder="E.g., Sky Warden, Aether Scribe, Rogue"
                    value={charRole}
                    onChange={(e) => setCharRole(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1">Background & History</label>
                  <textarea
                    className="w-full h-24 p-3 border border-stone-800 rounded-xl bg-stone-900 text-stone-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-xs resize-none"
                    placeholder="Exiled astronomer from the lower terraces who discovered the armatures are drifting..."
                    value={charBackground}
                    onChange={(e) => setCharBackground(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1">Starting Equipment</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-stone-800 rounded-xl bg-stone-900 text-stone-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-xs"
                    placeholder="E.g., Iron Staff, Windstone Diapason, Ancient Astral Atlas"
                    value={charEquipment}
                    onChange={(e) => setCharEquipment(e.target.value)}
                  />
                </div>
              </div>

              {/* Portraits, Persona & Motivations */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2">Dossier Portrait</label>
                  <div className="grid grid-cols-4 gap-3">
                    {PORTRAITS.map((p) => (
                      <button
                        key={p.emoji}
                        onClick={() => setCharPortraitEmoji(p.emoji)}
                        className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                          charPortraitEmoji === p.emoji
                            ? 'bg-purple-600/30 text-stone-100 border-purple-500/60 scale-105 shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                            : 'bg-stone-900 text-stone-400 border-stone-800 hover:border-stone-700'
                        }`}
                      >
                        <div className="text-2xl mb-1">{p.emoji}</div>
                        <div className="text-[10px] font-medium tracking-wide uppercase">{p.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1">Personality</label>
                    <input
                      type="text"
                      className="w-full px-3 py-1.5 border border-stone-800 rounded-xl bg-stone-900 text-stone-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-xs"
                      placeholder="E.g., Pragmatic, obsessive, quiet"
                      value={charPersonality}
                      onChange={(e) => setCharPersonality(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1">Motivations</label>
                    <input
                      type="text"
                      className="w-full px-3 py-1.5 border border-stone-800 rounded-xl bg-stone-900 text-stone-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-xs"
                      placeholder="E.g., Save family, solve anomaly"
                      value={charMotivations}
                      onChange={(e) => setCharMotivations(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1">Physical Appearance</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-stone-800 rounded-xl bg-stone-900 text-stone-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-xs"
                    placeholder="E.g., Tall, clad in dust-stained dark robes, glowing gray eyes"
                    value={charAppearance}
                    onChange={(e) => setCharAppearance(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {stage === 4 && (
          <div className="space-y-6">
            <p className="text-stone-300 text-sm leading-relaxed max-w-3xl">
              Configure the mechanical and roleplaying ruleset mode for this campaign. The server enforces rulesets to ensure consistency in action adjudication and narrative pacing.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Campaign Rulesets */}
              <div className="space-y-4">
                <h3 className="text-lg font-serif font-semibold text-stone-100 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-purple-400" />
                  Campaign Ruleset Mode
                </h3>

                <div className="space-y-3">
                  <label className={`block p-4 rounded-xl border cursor-pointer transition-all ${
                    rulesetMode === 'FULL_DND'
                      ? 'bg-purple-950/40 text-stone-100 border-purple-500/60 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                      : 'bg-stone-900/60 text-stone-300 border-stone-800 hover:border-stone-700'
                  }`}>
                    <input
                      type="radio"
                      name="ruleset"
                      value="FULL_DND"
                      checked={rulesetMode === 'FULL_DND'}
                      onChange={() => setRulesetMode('FULL_DND')}
                      className="sr-only"
                    />
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-sm">Full D&D d20 Engine</span>
                      <Dice5 className="w-4 h-4 text-purple-400" />
                    </div>
                    <p className="text-xs text-stone-400">Full attributes, combat rounds, spell levels, and mechanical item stats are mathematically calculated.</p>
                  </label>

                  <label className={`block p-4 rounded-xl border cursor-pointer transition-all ${
                    rulesetMode === 'LITE_DND'
                      ? 'bg-purple-950/40 text-stone-100 border-purple-500/60 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                      : 'bg-stone-900/60 text-stone-300 border-stone-800 hover:border-stone-700'
                  }`}>
                    <input
                      type="radio"
                      name="ruleset"
                      value="LITE_DND"
                      checked={rulesetMode === 'LITE_DND'}
                      onChange={() => setRulesetMode('LITE_DND')}
                      className="sr-only"
                    />
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-sm">Lite D&D Mechanics</span>
                      <Feather className="w-4 h-4 text-purple-400" />
                    </div>
                    <p className="text-xs text-stone-400">Soft mechanical checks and rules. Prioritizes narrative flow but keeps basic attribute-based probability checks.</p>
                  </label>
                </div>
              </div>

              {/* Story/Play Modes */}
              <div className="space-y-4">
                <h3 className="text-lg font-serif font-semibold text-stone-100 flex items-center gap-2">
                  <Compass className="w-5 h-5 text-blue-400" />
                  Story Director Play Mode
                </h3>

                <div className="space-y-3">
                  <label className={`block p-4 rounded-xl border cursor-pointer transition-all ${
                    storyMode === 'PROTAGONIST'
                      ? 'bg-purple-950/40 text-stone-100 border-purple-500/60 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                      : 'bg-stone-900/60 text-stone-300 border-stone-800 hover:border-stone-700'
                  }`}>
                    <input
                      type="radio"
                      name="storyMode"
                      value="PROTAGONIST"
                      checked={storyMode === 'PROTAGONIST'}
                      onChange={() => setStoryMode('PROTAGONIST')}
                      className="sr-only"
                    />
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-sm">Active Protagonist</span>
                      <User className="w-4 h-4 text-blue-400" />
                    </div>
                    <p className="text-xs text-stone-400">You play as the central actor of the story. Actions, dialogue, and travel decisions are explicitly driven by you.</p>
                  </label>

                  <label className={`block p-4 rounded-xl border cursor-pointer transition-all ${
                    storyMode === 'SPECTATOR'
                      ? 'bg-purple-950/40 text-stone-100 border-purple-500/60 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                      : 'bg-stone-900/60 text-stone-300 border-stone-800 hover:border-stone-700'
                  }`}>
                    <input
                      type="radio"
                      name="storyMode"
                      value="SPECTATOR"
                      checked={storyMode === 'SPECTATOR'}
                      onChange={() => setStoryMode('SPECTATOR')}
                      className="sr-only"
                    />
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-sm">Astral Spectator</span>
                      <Wand2 className="w-4 h-4 text-blue-400" />
                    </div>
                    <p className="text-xs text-stone-400">The protagonist acts offscreen. You observe the events, periodically shaping destiny through divine interventions or environment shifts.</p>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {stage === 5 && (
          <div className="space-y-6">
            <p className="text-stone-300 text-sm leading-relaxed max-w-3xl">
              Excellent! Review your campaign dossier before seeding the dynamic sandbox. Once started, you can immediately begin playing, travelling, and executing actions within this world.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column: World Overview */}
              <div className="border border-stone-800 rounded-xl p-6 bg-stone-900/60 space-y-4">
                <h3 className="text-lg font-serif font-semibold text-stone-100">The World of {synthesizedWorld?.title}</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-xs font-semibold uppercase text-stone-500 block">World ID</span>
                    <span className="text-stone-300 font-mono text-xs">{synthesizedWorld?.worldId}</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase text-stone-500 block">Original Premise</span>
                    <p className="text-stone-300 text-xs italic bg-stone-950/60 p-3 rounded-lg border border-stone-800 mt-1">"{premise}"</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-stone-950/60 p-2 rounded-lg text-center border border-stone-800">
                      <span className="text-[10px] uppercase text-stone-500 block">Genre</span>
                      <span className="text-xs font-semibold text-stone-200">{selectedGenres.join(', ') || 'AI Inferred'}</span>
                    </div>
                    <div className="bg-stone-950/60 p-2 rounded-lg text-center border border-stone-800">
                      <span className="text-[10px] uppercase text-stone-500 block">Tone</span>
                      <span className="text-xs font-semibold text-stone-200">{selectedTones.join(', ') || 'AI Inferred'}</span>
                    </div>
                    <div className="bg-stone-950/60 p-2 rounded-lg text-center border border-stone-800">
                      <span className="text-[10px] uppercase text-stone-500 block">Medium</span>
                      <span className="text-xs font-semibold text-stone-200">{selectedMediums.join(', ') || 'AI Inferred'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Character & Rules Review */}
              <div className="border border-stone-800 rounded-xl p-6 bg-stone-900/60 space-y-4">
                <h3 className="text-lg font-serif font-semibold text-stone-100 flex items-center gap-2">
                  <span className="text-2xl">{charPortraitEmoji}</span>
                  {charName || 'Unnamed Hero'}
                </h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-xs font-semibold uppercase text-stone-500 block">Role & Archetype</span>
                    <span className="text-stone-200">{charRole}</span>
                  </div>
                  {charBackground && (
                    <div>
                      <span className="text-xs font-semibold uppercase text-stone-500 block">Background</span>
                      <p className="text-stone-300 text-xs">{charBackground}</p>
                    </div>
                  )}
                  {charEquipment && (
                    <div>
                      <span className="text-xs font-semibold uppercase text-stone-500 block">Equipment</span>
                      <span className="text-stone-300 text-xs">{charEquipment}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-stone-800">
                    <div>
                      <span className="text-[10px] uppercase text-stone-500 block">Story Mode</span>
                      <span className="text-xs font-semibold text-stone-200">{storyMode}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-stone-500 block">Ruleset</span>
                      <span className="text-xs font-semibold text-stone-200">{rulesetMode}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Control Buttons */}
      <div className="mt-10 flex justify-between border-t border-stone-800 pt-6">
        <button
          onClick={() => {
            if (stage === 1) {
              onCancel();
            } else {
              setStage((s) => s - 1);
            }
          }}
          disabled={isSynthesizing || isLaunching}
          className="px-6 py-2.5 border border-stone-700 text-stone-300 hover:bg-stone-900 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        {stage < 5 ? (
          stage === 1 ? (
            <button
              onClick={handleSynthesizeWorld}
              disabled={isSynthesizing || !premise.trim()}
              id="generate-world-btn"
              className="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-semibold transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)] disabled:opacity-50 flex items-center gap-2 cursor-pointer text-sm"
            >
              {isSynthesizing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Dreaming up your world...
                </>
              ) : (
                <>
                  Create With AI <Sparkles className="w-4 h-4 text-purple-200" />
                </>
              )}
            </button>
          ) : stage === 2 ? (
            <button
              onClick={() => setStage(3)}
              className="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-semibold transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)] flex items-center gap-2 cursor-pointer text-sm"
            >
              Accept World & Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setStage((s) => s + 1)}
              className="px-6 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-100 rounded-xl font-medium transition-colors flex items-center gap-2 cursor-pointer"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )
        ) : (
          <button
            onClick={handleLaunchStory}
            disabled={isLaunching}
            id="launch-story-btn"
            className="px-8 py-3 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-stone-950 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center gap-2 shadow-[0_0_20px_rgba(245,158,11,0.4)] cursor-pointer text-sm"
          >
            {isLaunching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Seeding Sandbox...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" /> Bring World to Life
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
