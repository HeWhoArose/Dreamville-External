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
  onWorldAccepted?: (world: any) => void;
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

export const CreateStoryWizard: React.FC<CreateStoryWizardProps> = ({ onSelectRun, onWorldAccepted, onCancel }) => {
  const [stage, setStage] = useState<number>(1);
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
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
        title: '',
        genreTags: selectedGenres,
        toneTags: selectedTones,
        mediumTags: selectedMediums,
        generationSeed: `seed_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
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


  return (
    <div className="w-full max-w-5xl mx-auto py-10 px-6 text-stone-100 bg-stone-950 rounded-2xl border border-stone-800/80 shadow-2xl" id="create-story-wizard">
      {/* Step Header */}
      <div className="flex justify-between items-center mb-8 border-b border-stone-800 pb-4">
        <div>
          <span className="text-xs uppercase tracking-widest text-purple-400 font-semibold">Stage {stage} of 2</span>
          <h2 className="text-2xl font-serif font-bold text-stone-100 tracking-wide mt-1">
            {stage === 1 && 'Create Your World'}
            {stage === 2 && 'Generated World Concept'}

          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          {[1, 2].map((s) => (
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
                  <div className="flex items-center gap-2">
                    <span className="font-semibold block text-stone-100">{synthesizedWorld.title || 'Dynamic World Concept'}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-stone-900/80 border border-purple-500/30 text-purple-300 font-medium">
                      {synthesizedWorld.generationStatus || (
                        synthesizedWorld.provenance?.generationSource === 'AI_PRIMARY'
                          ? 'Generated with DreamBook AI'
                          : synthesizedWorld.provenance?.generationSource === 'AI_FALLBACK'
                          ? 'Primary AI unavailable · Generated with fallback AI'
                          : 'AI unavailable · DreamBook used its offline world generator'
                      )}
                    </span>
                  </div>
                  <span className="text-xs text-purple-300 mt-0.5 block">{synthesizedWorld.summary || 'Generated successfully from your premise.'}</span>
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
                      <span className="text-stone-500 uppercase tracking-wider block text-[10px]">Genre</span>
                      <span className="text-stone-200 font-medium">{(synthesizedWorld.genreTags || []).join(', ') || 'Original'}</span>
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

        {stage === 1 ? (
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
        ) : (
          <button
            onClick={() => {
              if (onWorldAccepted && synthesizedWorld) onWorldAccepted(synthesizedWorld);
            }}
            disabled={!synthesizedWorld}
            className="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-semibold transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)] disabled:opacity-50 flex items-center gap-2 cursor-pointer text-sm"
          >
            Accept World & Open Character Genesis <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
