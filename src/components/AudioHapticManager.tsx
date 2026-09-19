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

export const AudioHapticProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AudioSettings>({
    masterAudio: 1.0,
    masterMuted: false,
    narration: 'auto',
    voiceVolume: 1.0,
    characterVoiceEnabled: true,
    sfxEnabled: true,
    sfxVolume: 1.0,
    musicVolume: 0.8,
    ambienceEnabled: true,
    ambienceVolume: 0.6,
    autoplay: true,
    dataSavingMode: false,
    hapticIntensity: 'medium',
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

  // Initialize or retrieve safe AudioContext
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

  // Initial fetch of settings & soundscape
  useEffect(() => {
    fetch('/api/game/sensory/state')
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) setSettings((prev) => ({ ...prev, ...data.settings }));
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

  // Soft ambient drone generator via Web Audio API
  useEffect(() => {
    if (!settings.ambienceEnabled || settings.masterMuted || settings.ambienceVolume <= 0) {
      if (ambienceGainRef.current && audioContextRef.current) {
        ambienceGainRef.current.gain.setTargetAtTime(0, audioContextRef.current.currentTime, 0.2);
      }
      return;
    }

    try {
      const ctx = getAudioContext();
      if (!ctx || !masterGainRef.current) return;

      if (!ambienceOscRef.current) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = soundscape?.environmentTrack?.includes('forest') ? 220 : 110;
        gain.gain.value = settings.ambienceVolume * 0.05; // Gentle whisper volume
        osc.connect(gain);
        gain.connect(masterGainRef.current);
        osc.start();

        ambienceOscRef.current = osc;
        ambienceGainRef.current = gain;
      } else if (ambienceGainRef.current) {
        ambienceGainRef.current.gain.setTargetAtTime(
          settings.ambienceVolume * 0.05,
          ctx.currentTime,
          0.1
        );
      }
    } catch {
      // Audio context might need user gesture
    }
  }, [settings.ambienceEnabled, settings.masterMuted, settings.ambienceVolume, soundscape, getAudioContext]);

  const updateSettings = async (newSettings: Partial<AudioSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
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

  // Local-first Web Audio SFX synthesis
  const playSfx = useCallback(
    (cue: string, priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL' = 'NORMAL', volume = 1.0) => {
      if (!settings.sfxEnabled || settings.masterMuted || settings.sfxVolume <= 0) return;

      const ctx = getAudioContext();
      if (!ctx || !masterGainRef.current) return;

      const effVolume = volume * settings.sfxVolume;

      // Duck ambience during HIGH / CRITICAL SFX
      if ((priority === 'HIGH' || priority === 'CRITICAL') && ambienceGainRef.current) {
        ambienceGainRef.current.gain.setTargetAtTime(0.005, ctx.currentTime, 0.05);
        setTimeout(() => {
          if (ambienceGainRef.current && audioContextRef.current) {
            ambienceGainRef.current.gain.setTargetAtTime(
              settings.ambienceVolume * 0.05,
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
          // Sharp metallic whoosh + blade contact
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
        } else if (cleanCue.includes('heal') || cleanCue.includes('holy') || cleanCue.includes('chime')) {
          // Restorative major triad chime
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
          });
        } else if (cleanCue.includes('fire') || cleanCue.includes('burn')) {
          // Warm noise / flame burst
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
        } else if (cleanCue.includes('quest') || cleanCue.includes('victory')) {
          // Fanfare
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
        }
      } catch (e) {
        console.warn('SFX audio play error:', e);
      }
    },
    [settings.sfxEnabled, settings.masterMuted, settings.sfxVolume, settings.ambienceVolume, getAudioContext]
  );

  const playSpeech = async (text: string, actorId?: string): Promise<string | null> => {
    if (settings.narration === 'off' || settings.masterMuted) return null;
    if (settings.dataSavingMode) {
      console.log('[Sensory] Data-saving mode active: skipping automated speech download.');
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
        // If data URL or raw base64
        const audioSrc = data.audioResult.startsWith('data:')
          ? data.audioResult
          : `data:audio/mp3;base64,${data.audioResult}`;

        const audio = new Audio(audioSrc);
        activeAudioElRef.current = audio;
        audio.volume = Math.max(0, Math.min(1, settings.voiceVolume * (settings.masterMuted ? 0 : settings.masterAudio)));

        audio.onended = () => {
          setIsPlayingSpeech(false);
          setActiveSpeechText(null);
        };
        audio.onerror = () => {
          setIsPlayingSpeech(false);
          setActiveSpeechText(null);
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
      activeAudioElRef.current.pause();
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
