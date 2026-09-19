import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';

export type HapticIntensity = 'off' | 'light' | 'medium' | 'heavy';
export type NarrationMode = 'auto' | 'dialogue-only' | 'off';

export interface AudioSettings {
  masterAudio: number;
  masterMuted: boolean;
  narration: NarrationMode;
  voiceVolume: number;
  characterVoiceEnabled: boolean;
  sfxEnabled: boolean;
  sfxVolume: number;
  musicVolume: number;
  ambienceEnabled: boolean;
  ambienceVolume: number;
  autoplay: boolean;
  dataSavingMode: boolean;
  hapticIntensity: HapticIntensity;
}

export interface QueuedAudioEvent {
  id: string;
  cue: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  volume: number;
  timestamp: number;
}

interface AudioHapticContextValue {
  settings: AudioSettings;
  isMuted: boolean;
  toggleMute: () => void;
  updateSettings: (newSettings: Partial<AudioSettings>) => Promise<void>;
  triggerHaptic: (intensity?: HapticIntensity) => void;
  playSpeech: (text: string, actorId?: string) => Promise<string | null>;
  playSfx: (cue: string, priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL', volume?: number) => void;
  clearQueue: () => void;
  isPlayingSpeech: boolean;
  activeSpeechText: string | null;
}

const AudioHapticContext = createContext<AudioHapticContextValue | null>(null);

export const useAudioHaptic = () => {
  const ctx = useContext(AudioHapticContext);
  if (!ctx) throw new Error('useAudioHaptic must be used within AudioHapticProvider');
  return ctx;
};

export const AUDIO_STORAGE_KEY = 'dreambook_audio_preferences';

export const AudioHapticProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Silence by default during dashboard and navigation (ambienceEnabled: false)
  const [settings, setSettings] = useState<AudioSettings>(() => {
    const defaultSettings: AudioSettings = {
      masterAudio: 1.0,
      masterMuted: false,
      narration: 'auto',
      voiceVolume: 1.0,
      characterVoiceEnabled: true,
      sfxEnabled: true,
      sfxVolume: 1.0,
      musicVolume: 0.8,
      ambienceEnabled: false, // Default to silence - no automatic continuous hum
      ambienceVolume: 0.5,
      autoplay: false,
      dataSavingMode: false,
      hapticIntensity: 'medium',
    };

    try {
      const stored = localStorage.getItem(AUDIO_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Only restore valid configuration properties
        return {
          ...defaultSettings,
          masterAudio: typeof parsed.masterAudio === 'number' ? parsed.masterAudio : defaultSettings.masterAudio,
          masterMuted: typeof parsed.masterMuted === 'boolean' ? parsed.masterMuted : defaultSettings.masterMuted,
          narration: parsed.narration || defaultSettings.narration,
          voiceVolume: typeof parsed.voiceVolume === 'number' ? parsed.voiceVolume : defaultSettings.voiceVolume,
          characterVoiceEnabled: typeof parsed.characterVoiceEnabled === 'boolean' ? parsed.characterVoiceEnabled : defaultSettings.characterVoiceEnabled,
          sfxEnabled: typeof parsed.sfxEnabled === 'boolean' ? parsed.sfxEnabled : defaultSettings.sfxEnabled,
          sfxVolume: typeof parsed.sfxVolume === 'number' ? parsed.sfxVolume : defaultSettings.sfxVolume,
          musicVolume: typeof parsed.musicVolume === 'number' ? parsed.musicVolume : defaultSettings.musicVolume,
          ambienceEnabled: typeof parsed.ambienceEnabled === 'boolean' ? parsed.ambienceEnabled : defaultSettings.ambienceEnabled,
          ambienceVolume: typeof parsed.ambienceVolume === 'number' ? parsed.ambienceVolume : defaultSettings.ambienceVolume,
          autoplay: typeof parsed.autoplay === 'boolean' ? parsed.autoplay : defaultSettings.autoplay,
          dataSavingMode: typeof parsed.dataSavingMode === 'boolean' ? parsed.dataSavingMode : defaultSettings.dataSavingMode,
          hapticIntensity: parsed.hapticIntensity || defaultSettings.hapticIntensity,
        };
      }
    } catch {
      // Local storage fallback
    }

    return defaultSettings;
  });

  const [soundscape, setSoundscape] = useState<any>(null);
  const [isPlayingSpeech, setIsPlayingSpeech] = useState<boolean>(false);
  const [activeSpeechText, setActiveSpeechText] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const ambienceOscRef = useRef<OscillatorNode | null>(null);
  const ambienceGainRef = useRef<GainNode | null>(null);
  const activeAudioElRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<QueuedAudioEvent[]>([]);

  // Stop and disconnect any active ambient sound generator safely
  const stopAmbientGenerator = useCallback(() => {
    if (ambienceOscRef.current) {
      try {
        ambienceOscRef.current.stop();
        ambienceOscRef.current.disconnect();
      } catch {
        // Safe disconnect fallback
      }
      ambienceOscRef.current = null;
    }
    if (ambienceGainRef.current) {
      try {
        ambienceGainRef.current.disconnect();
      } catch {
        // Safe disconnect fallback
      }
      ambienceGainRef.current = null;
    }
  }, []);

  // Initialize safe AudioContext only on demand
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const master = ctx.createGain();
        master.gain.value = settings.masterMuted ? 0 : settings.masterAudio;
        master.connect(ctx.destination);

        audioContextRef.current = ctx;
        masterGainRef.current = master;
      }
    }
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  }, [settings.masterAudio, settings.masterMuted]);

  // Sync master gain when volume/mute changes
  useEffect(() => {
    if (masterGainRef.current && audioContextRef.current) {
      const targetGain = settings.masterMuted ? 0 : settings.masterAudio;
      masterGainRef.current.gain.setTargetAtTime(targetGain, audioContextRef.current.currentTime, 0.05);
    }
  }, [settings.masterAudio, settings.masterMuted]);

  // Initial fetch of sensory state from server
  useEffect(() => {
    fetch('/api/game/sensory/state')
      .then((r) => r.json())
      .then((data) => {
        if (data.soundscape) setSoundscape(data.soundscape);
      })
      .catch((err) => console.warn('Failed to load sensory state:', err));
  }, []);

  // Handle browser tab visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (audioContextRef.current && audioContextRef.current.state === 'running') {
          audioContextRef.current.suspend().catch(() => {});
        }
        if (activeAudioElRef.current) {
          activeAudioElRef.current.pause();
        }
      } else {
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume().catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Unmount cleanup: explicitly kill all audio nodes, oscillators, and speech playback
  useEffect(() => {
    return () => {
      stopAmbientGenerator();
      if (activeAudioElRef.current) {
        try {
          activeAudioElRef.current.pause();
          activeAudioElRef.current.src = '';
        } catch {
          // ignore
        }
        activeAudioElRef.current = null;
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close().catch(() => {});
        } catch {
          // ignore
        }
        audioContextRef.current = null;
      }
    };
  }, [stopAmbientGenerator]);

  // Controlled Ambient Generator: only runs if explicitly requested & enabled
  useEffect(() => {
    // If disabled, muted, or zero volume -> immediately stop and disconnect oscillator
    if (!settings.ambienceEnabled || settings.masterMuted || settings.ambienceVolume <= 0) {
      stopAmbientGenerator();
      return;
    }

    // Only start ambient generator if soundscape has a valid active environment track
    if (!soundscape?.environmentTrack) {
      stopAmbientGenerator();
      return;
    }

    try {
      const ctx = getAudioContext();
      if (!ctx || !masterGainRef.current) return;

      if (!ambienceOscRef.current) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = soundscape.environmentTrack.includes('forest') ? 220 : 110;
        gain.gain.value = settings.ambienceVolume * 0.03; // Gentle whisper level
        osc.connect(gain);
        gain.connect(masterGainRef.current);
        osc.start();

        ambienceOscRef.current = osc;
        ambienceGainRef.current = gain;
      } else if (ambienceGainRef.current) {
        ambienceGainRef.current.gain.setTargetAtTime(
          settings.ambienceVolume * 0.03,
          ctx.currentTime,
          0.1
        );
      }
    } catch {
      // Audio context might need user gesture
    }
  }, [settings.ambienceEnabled, settings.masterMuted, settings.ambienceVolume, soundscape, getAudioContext, stopAmbientGenerator]);

  const updateSettings = async (newSettings: Partial<AudioSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);

    // Persist configuration in localStorage
    try {
      localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }

    try {
      await fetch('/api/game/sensory/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: newSettings }),
      });
    } catch (e) {
      console.warn('Failed to update sensory settings on server', e);
    }
  };

  const toggleMute = () => {
    updateSettings({ masterMuted: !settings.masterMuted });
  };

  const triggerHaptic = (intensity: HapticIntensity = 'medium') => {
    if (settings.hapticIntensity === 'off' || intensity === 'off' || !('vibrate' in navigator)) return;

    let pattern: number[] = [40]; // light
    const eff = intensity || settings.hapticIntensity;
    if (eff === 'heavy') {
      pattern = [100, 40, 100];
    } else if (eff === 'medium') {
      pattern = [70];
    }

    try {
      navigator.vibrate(pattern);
    } catch (e) {
      console.warn('Haptic trigger failed', e);
    }
  };

  // Local-first Web Audio SFX synthesis (deterministic finite duration)
  const playSfx = useCallback(
    (cue: string, priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL' = 'NORMAL', volume = 1.0) => {
      if (!settings.sfxEnabled || settings.masterMuted || settings.sfxVolume <= 0) return;

      const ctx = getAudioContext();
      if (!ctx || !masterGainRef.current) return;

      const effVolume = volume * settings.sfxVolume;

      // Duck ambience during HIGH / CRITICAL SFX if ambience is playing
      if ((priority === 'HIGH' || priority === 'CRITICAL') && ambienceGainRef.current) {
        ambienceGainRef.current.gain.setTargetAtTime(0.005, ctx.currentTime, 0.05);
        setTimeout(() => {
          if (ambienceGainRef.current && audioContextRef.current && settings.ambienceEnabled && !settings.masterMuted) {
            ambienceGainRef.current.gain.setTargetAtTime(
              settings.ambienceVolume * 0.03,
              audioContextRef.current.currentTime,
              0.3
            );
          }
        }, 800);
      }

      const now = ctx.currentTime;
      const cleanCue = cue.toLowerCase();

      try {
        if (cleanCue.includes('stab') || cleanCue.includes('blade')) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(800, now);
          osc.frequency.exponentialRampToValueAtTime(120, now + 0.18);
          gain.gain.setValueAtTime(effVolume * 0.4, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          osc.connect(gain);
          gain.connect(masterGainRef.current);
          osc.start(now);
          osc.stop(now + 0.22);
          // Auto cleanup
          setTimeout(() => {
            try { osc.disconnect(); gain.disconnect(); } catch {}
          }, 300);
        } else if (cleanCue.includes('heal') || cleanCue.includes('holy') || cleanCue.includes('chime')) {
          [523.25, 659.25, 783.99].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, now + i * 0.08);
            gain.gain.linearRampToValueAtTime(effVolume * 0.25, now + i * 0.08 + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.8);
            osc.connect(gain);
            gain.connect(masterGainRef.current!);
            osc.start(now + i * 0.08);
            osc.stop(now + i * 0.08 + 0.85);
            setTimeout(() => {
              try { osc.disconnect(); gain.disconnect(); } catch {}
            }, 1000);
          });
        } else if (cleanCue.includes('fire') || cleanCue.includes('burn')) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(180, now);
          osc.frequency.exponentialRampToValueAtTime(60, now + 0.4);
          gain.gain.setValueAtTime(effVolume * 0.35, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
          osc.connect(gain);
          gain.connect(masterGainRef.current);
          osc.start(now);
          osc.stop(now + 0.5);
          setTimeout(() => {
            try { osc.disconnect(); gain.disconnect(); } catch {}
          }, 600);
        } else if (cleanCue.includes('quest') || cleanCue.includes('victory')) {
          [440, 554.37, 659.25, 880].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            const start = now + idx * 0.12;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(effVolume * 0.3, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
            osc.connect(gain);
            gain.connect(masterGainRef.current!);
            osc.start(start);
            osc.stop(start + 0.55);
            setTimeout(() => {
              try { osc.disconnect(); gain.disconnect(); } catch {}
            }, 1200);
          });
        } else {
          // Subtle default tactile tick
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(400, now);
          osc.frequency.exponentialRampToValueAtTime(100, now + 0.08);
          gain.gain.setValueAtTime(effVolume * 0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
          osc.connect(gain);
          gain.connect(masterGainRef.current);
          osc.start(now);
          osc.stop(now + 0.1);
          setTimeout(() => {
            try { osc.disconnect(); gain.disconnect(); } catch {}
          }, 200);
        }
      } catch (e) {
        console.warn('SFX audio play error:', e);
      }
    },
    [settings.sfxEnabled, settings.masterMuted, settings.sfxVolume, settings.ambienceVolume, settings.ambienceEnabled, getAudioContext]
  );

  const playSpeech = async (text: string, actorId?: string): Promise<string | null> => {
    if (settings.narration === 'off' || settings.masterMuted) return null;
    if (settings.dataSavingMode) {
      return null;
    }

    try {
      setIsPlayingSpeech(true);
      setActiveSpeechText(text);

      const res = await fetch('/api/game/sensory/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, actorId }),
      });
      const data = await res.json();

      if (data.audioResult) {
        const audioSrc = data.audioResult.startsWith('data:')
          ? data.audioResult
          : `data:audio/mp3;base64,${data.audioResult}`;

        if (activeAudioElRef.current) {
          try {
            activeAudioElRef.current.pause();
          } catch {}
        }

        const audio = new Audio(audioSrc);
        activeAudioElRef.current = audio;
        audio.volume = Math.max(0, Math.min(1, settings.voiceVolume * (settings.masterMuted ? 0 : settings.masterAudio)));

        audio.onended = () => {
          setIsPlayingSpeech(false);
          setActiveSpeechText(null);
          activeAudioElRef.current = null;
        };
        audio.onerror = () => {
          setIsPlayingSpeech(false);
          setActiveSpeechText(null);
          activeAudioElRef.current = null;
        };

        await audio.play();
        return data.audioResult;
      } else {
        setIsPlayingSpeech(false);
        setActiveSpeechText(null);
        return null;
      }
    } catch (e) {
      console.warn('Failed to play speech audio:', e);
      setIsPlayingSpeech(false);
      setActiveSpeechText(null);
      return null;
    }
  };

  const clearQueue = () => {
    audioQueueRef.current = [];
    if (activeAudioElRef.current) {
      try {
        activeAudioElRef.current.pause();
      } catch {}
      activeAudioElRef.current = null;
    }
    setIsPlayingSpeech(false);
    setActiveSpeechText(null);
  };

  return (
    <AudioHapticContext.Provider
      value={{
        settings,
        isMuted: settings.masterMuted,
        toggleMute,
        updateSettings,
        triggerHaptic,
        playSpeech,
        playSfx,
        clearQueue,
        isPlayingSpeech,
        activeSpeechText,
      }}
    >
      {children}
    </AudioHapticContext.Provider>
  );
};
