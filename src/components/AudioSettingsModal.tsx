import React from 'react';
import { useAudioHaptic, HapticIntensity, NarrationMode } from './AudioHapticManager';
import {
  Volume2,
  VolumeX,
  Sliders,
  Sparkles,
  Smartphone,
  Wifi,
  Play,
  X,
  RotateCcw,
  Check,
} from 'lucide-react';

interface AudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AudioSettingsModal: React.FC<AudioSettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings, isMuted, toggleMute, playSfx, triggerHaptic } = useAudioHaptic();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-stone-900 border border-stone-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-stone-800 flex items-center justify-between bg-stone-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-serif font-bold text-stone-100">
                Sensory & Audio Architecture
              </h2>
              <p className="text-[11px] font-mono text-stone-400">
                CH14 • Soundscapes, Speech, and Haptic Feedback
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

        {/* Modal Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 font-sans text-xs">
          {/* Master Control Section */}
          <div className="bg-stone-950/60 rounded-xl p-4 border border-stone-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-stone-200 flex items-center gap-2">
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
                Master Volume
              </span>
              <button
                onClick={toggleMute}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition ${
                  isMuted
                    ? 'bg-red-950/60 border-red-800 text-red-300'
                    : 'bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-750'
                }`}
              >
                {isMuted ? 'Unmute All' : 'Mute All'}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.masterAudio}
                disabled={isMuted}
                onChange={(e) => updateSettings({ masterAudio: parseFloat(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer disabled:opacity-40"
              />
              <span className="font-mono text-stone-400 w-10 text-right">
                {Math.round(settings.masterAudio * 100)}%
              </span>
            </div>
          </div>

          {/* Narration & Voice Settings */}
          <div className="space-y-3">
            <h3 className="font-mono uppercase tracking-wider text-[11px] text-stone-400 font-semibold flex items-center gap-1.5">
              <span>🗣️</span> Narration & Character Voices
            </h3>
            <div className="bg-stone-950/40 rounded-xl p-4 border border-stone-800/60 space-y-4">
              <div>
                <label className="text-stone-300 font-medium block mb-1.5">Narration Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['auto', 'dialogue-only', 'off'] as NarrationMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => updateSettings({ narration: mode })}
                      className={`py-2 px-3 rounded-lg border text-center font-medium capitalize transition ${
                        settings.narration === mode
                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                          : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-stone-300 font-medium">Voice Audio Level</span>
                  <span className="font-mono text-stone-400">
                    {Math.round(settings.voiceVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.voiceVolume}
                  onChange={(e) => updateSettings({ voiceVolume: parseFloat(e.target.value) })}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div>
                  <span className="text-stone-200 font-medium block">Character Distinct Voices</span>
                  <span className="text-stone-500 text-[10px]">
                    Use custom assigned pitch and style profiles for NPCs
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.characterVoiceEnabled}
                  onChange={(e) => updateSettings({ characterVoiceEnabled: e.target.checked })}
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Sound Effects & Ambience */}
          <div className="space-y-3">
            <h3 className="font-mono uppercase tracking-wider text-[11px] text-stone-400 font-semibold flex items-center gap-1.5">
              <span>⚔️</span> SFX & World Ambience
            </h3>
            <div className="bg-stone-950/40 rounded-xl p-4 border border-stone-800/60 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-stone-300 font-medium">Sound Effects (SFX)</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => playSfx('combat.stab', 'HIGH', 1.0)}
                      className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-750 text-amber-400 border border-stone-700 text-[10px] font-mono flex items-center gap-1"
                    >
                      <Play className="w-2.5 h-2.5" /> Test SFX
                    </button>
                    <span className="font-mono text-stone-400 w-8 text-right">
                      {Math.round(settings.sfxVolume * 100)}%
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.sfxVolume}
                  onChange={(e) => updateSettings({ sfxVolume: parseFloat(e.target.value) })}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-stone-800/60">
                <div className="flex items-center justify-between">
                  <span className="text-stone-300 font-medium">Ambient Soundscape</span>
                  <span className="font-mono text-stone-400">
                    {Math.round(settings.ambienceVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.ambienceVolume}
                  onChange={(e) => updateSettings({ ambienceVolume: parseFloat(e.target.value) })}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Haptic Sensory Feedback */}
          <div className="space-y-3">
            <h3 className="font-mono uppercase tracking-wider text-[11px] text-stone-400 font-semibold flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-amber-400" /> Haptic Feedback
            </h3>
            <div className="bg-stone-950/40 rounded-xl p-4 border border-stone-800/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-stone-300 font-medium">Vibration Intensity</span>
                <button
                  onClick={() => triggerHaptic(settings.hapticIntensity)}
                  className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-750 text-amber-400 border border-stone-700 text-[10px] font-mono flex items-center gap-1"
                >
                  <Sparkles className="w-2.5 h-2.5" /> Test Pulse
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(['off', 'light', 'medium', 'heavy'] as HapticIntensity[]).map((intensity) => (
                  <button
                    key={intensity}
                    onClick={() => {
                      updateSettings({ hapticIntensity: intensity });
                      triggerHaptic(intensity);
                    }}
                    className={`py-2 px-2 rounded-lg border text-center font-medium capitalize transition ${
                      settings.hapticIntensity === intensity
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                        : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {intensity}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bandwidth & Battery Optimization */}
          <div className="bg-stone-950/40 rounded-xl p-4 border border-stone-800/60 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-stone-200 font-medium flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5 text-sky-400" />
                  Data-Saving Mode (Wi-Fi-Only Speech)
                </span>
                <p className="text-stone-500 text-[11px] mt-0.5">
                  Suppresses non-essential TTS network requests to conserve bandwidth
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.dataSavingMode}
                onChange={(e) => updateSettings({ dataSavingMode: e.target.checked })}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-stone-800 bg-stone-950/60 flex items-center justify-between">
          <button
            onClick={() =>
              updateSettings({
                masterAudio: 1.0,
                masterMuted: false,
                narration: 'auto',
                voiceVolume: 1.0,
                characterVoiceEnabled: true,
                sfxEnabled: true,
                sfxVolume: 1.0,
                ambienceEnabled: true,
                ambienceVolume: 0.6,
                hapticIntensity: 'medium',
                dataSavingMode: false,
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-stone-400 hover:text-stone-200 text-xs font-mono transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold transition"
          >
            <Check className="w-3.5 h-3.5" />
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
