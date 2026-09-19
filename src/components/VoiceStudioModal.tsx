import React, { useState, useEffect } from 'react';
import { useAudioHaptic } from './AudioHapticManager';
import {
  Mic,
  Volume2,
  Sparkles,
  Save,
  Check,
  X,
  Loader2,
  Play,
  Sliders,
  User,
  ShieldCheck,
} from 'lucide-react';

interface VoiceStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  storyId?: string;
}

interface VoiceProfile {
  actorId: string;
  providerId: string;
  voiceId: string;
  speed: number;
  pitch: number;
  styleHints: string[];
  language: string;
  enabled: boolean;
}

const AVAILABLE_ACTORS = [
  { id: 'player_actor_default_story', name: 'Player Character (Hero)', role: 'Protagonist' },
  { id: 'npc_maren', name: 'Maren the Archivist', role: 'Scholar of the Orrery' },
  { id: 'npc_eloria', name: 'Lady Eloria', role: 'High Enchanter' },
  { id: 'npc_garrick', name: 'Garrick Ironbound', role: 'Veteran Blacksmith' },
  { id: 'narrator', name: 'Grand Chronicler', role: 'Ambient Narrator' },
];

const AVAILABLE_VOICES = [
  { id: 'gemini-voice-neutral', name: 'Gemini Balanced (Neutral)', provider: 'google_gemini' },
  { id: 'gemini-voice-deep', name: 'Gemini Resonant (Deep Timber)', provider: 'google_gemini' },
  { id: 'gemini-voice-melodic', name: 'Gemini Melodic (High Harmonic)', provider: 'google_gemini' },
  { id: 'gemini-voice-whisper', name: 'Gemini Ethereal (Whisper/Drone)', provider: 'google_gemini' },
  { id: 'neural-en-warm', name: 'Neural English (Warm Storyteller)', provider: 'google_gemini' },
];

const STYLE_HINT_OPTIONS = [
  'calm',
  'dramatic',
  'mysterious',
  'whispering',
  'urgent',
  'heroic',
  'gruff',
  'solemn',
];

export const VoiceStudioModal: React.FC<VoiceStudioModalProps> = ({
  isOpen,
  onClose,
  storyId = 'default_story',
}) => {
  const { playSpeech } = useAudioHaptic();

  const [selectedActorId, setSelectedActorId] = useState<string>(AVAILABLE_ACTORS[0].id);
  const [voiceId, setVoiceId] = useState<string>('gemini-voice-neutral');
  const [speed, setSpeed] = useState<number>(1.0);
  const [pitch, setPitch] = useState<number>(1.0);
  const [styleHints, setStyleHints] = useState<string[]>(['calm']);
  const [sampleText, setSampleText] = useState<string>(
    'The celestial orrery turns, echoing whispers from forgotten stars.'
  );

  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Load existing profile when selected actor changes
  useEffect(() => {
    if (!isOpen) return;
    fetch(`/api/game/sensory/state?storyId=${storyId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.voiceProfiles && Array.isArray(data.voiceProfiles)) {
          const found = data.voiceProfiles.find((p: VoiceProfile) => p.actorId === selectedActorId);
          if (found) {
            setVoiceId(found.voiceId || 'gemini-voice-neutral');
            setSpeed(found.speed ?? 1.0);
            setPitch(found.pitch ?? 1.0);
            setStyleHints(found.styleHints || ['calm']);
          }
        }
      })
      .catch((e) => console.warn('Failed to load profile for actor:', e));
  }, [selectedActorId, storyId, isOpen]);

  if (!isOpen) return null;

  const toggleStyleHint = (hint: string) => {
    setStyleHints((prev) =>
      prev.includes(hint) ? prev.filter((h) => h !== hint) : [...prev, hint]
    );
  };

  const handlePreviewSpeech = async () => {
    setIsPreviewing(true);
    try {
      const selectedVoice = AVAILABLE_VOICES.find((v) => v.id === voiceId);
      const res = await fetch('/api/game/sensory/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          actorId: selectedActorId,
          text: sampleText,
          voiceProfile: {
            actorId: selectedActorId,
            providerId: selectedVoice?.provider || 'google_gemini',
            voiceId,
            speed,
            pitch,
            styleHints,
            language: 'en-US',
            enabled: true,
          },
        }),
      });
      const data = await res.json();
      if (data.audioResult) {
        const audioSrc = data.audioResult.startsWith('data:')
          ? data.audioResult
          : `data:audio/mp3;base64,${data.audioResult}`;
        const audio = new Audio(audioSrc);
        audio.play().catch(() => {});
      } else {
        // Fallback tone
        playSpeech(sampleText, selectedActorId);
      }
    } catch (e) {
      console.warn('Speech preview failed:', e);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const selectedVoice = AVAILABLE_VOICES.find((v) => v.id === voiceId);
      const profile: VoiceProfile = {
        actorId: selectedActorId,
        providerId: selectedVoice?.provider || 'google_gemini',
        voiceId,
        speed,
        pitch,
        styleHints,
        language: 'en-US',
        enabled: true,
      };

      await fetch('/api/game/sensory/voice-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId, profile }),
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      console.error('Failed to save voice profile:', e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-stone-900 border border-stone-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-stone-800 flex items-center justify-between bg-stone-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-serif font-bold text-stone-100">
                Voice & Character Studio
              </h2>
              <p className="text-[11px] font-mono text-stone-400">
                Configure Neural Voices, Speed, Pitch & Stylistic Inflections
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 font-sans text-xs">
          {/* Target Actor Selector */}
          <div>
            <label className="text-stone-300 font-medium block mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-amber-400" /> Select Character / Entity
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AVAILABLE_ACTORS.map((actor) => (
                <button
                  key={actor.id}
                  onClick={() => setSelectedActorId(actor.id)}
                  className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between ${
                    selectedActorId === actor.id
                      ? 'bg-amber-500/10 border-amber-500/40 text-stone-100'
                      : 'bg-stone-950/40 border-stone-800/80 text-stone-400 hover:text-stone-200 hover:border-stone-700'
                  }`}
                >
                  <div>
                    <span className="font-semibold block text-stone-200">{actor.name}</span>
                    <span className="text-[10px] text-stone-500 font-mono">{actor.role}</span>
                  </div>
                  {selectedActorId === actor.id && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Voice Model Selection */}
          <div className="bg-stone-950/40 rounded-xl p-4 border border-stone-800/60 space-y-4">
            <div>
              <label className="text-stone-300 font-medium block mb-1.5">Voice Model Identity</label>
              <select
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-stone-200 focus:outline-none focus:border-amber-500 font-mono text-xs"
              >
                {AVAILABLE_VOICES.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name} ({voice.provider})
                  </option>
                ))}
              </select>
            </div>

            {/* Sliders for Speed and Pitch */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-stone-300 font-medium">Pacing / Speed</span>
                  <span className="font-mono text-amber-400">{speed.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-stone-300 font-medium">Harmonic Pitch</span>
                  <span className="font-mono text-amber-400">{pitch.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={pitch}
                  onChange={(e) => setPitch(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Stylistic Emotion Hints */}
            <div className="space-y-2 pt-1 border-t border-stone-800/60">
              <label className="text-stone-300 font-medium block">
                Stylistic Inflections & Emotion Hints
              </label>
              <div className="flex flex-wrap gap-1.5">
                {STYLE_HINT_OPTIONS.map((hint) => {
                  const active = styleHints.includes(hint);
                  return (
                    <button
                      key={hint}
                      onClick={() => toggleStyleHint(hint)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono transition capitalize ${
                        active
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-semibold'
                          : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-300'
                      }`}
                    >
                      {active ? `✓ ${hint}` : hint}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sample Text & Preview Playground */}
          <div className="bg-stone-950/60 rounded-xl p-4 border border-stone-800/80 space-y-3">
            <label className="text-stone-300 font-medium block">Acoustic Audition Text</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={sampleText}
                onChange={(e) => setSampleText(e.target.value)}
                className="flex-1 bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-stone-200 text-xs font-serif italic focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={handlePreviewSpeech}
                disabled={isPreviewing || !sampleText.trim()}
                className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-750 text-amber-300 border border-stone-700 font-mono text-xs flex items-center gap-1.5 disabled:opacity-50 transition flex-shrink-0"
              >
                {isPreviewing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>Audition</span>
              </button>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-stone-500 font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Speech generation is a presentation utility; zero canonical game mutation.</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-800 bg-stone-950/60 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl border border-stone-800 text-stone-400 hover:text-stone-200 text-xs transition"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="text-emerald-400 font-mono text-xs flex items-center gap-1 animate-in fade-in">
                <Check className="w-3.5 h-3.5" /> Saved to Authority
              </span>
            )}
            <button
              onClick={handleSaveProfile}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold transition disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
