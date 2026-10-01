import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { DEFAULT_DICE_THEME, DiceThemeId } from './common/diceThemes';
import { apiClient } from '../services/apiClient';

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
  diceTheme: DiceThemeId;
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
  soundscape?: {
    environmentTrack: string | null;
    musicStem: string | null;
    intensity: number;
  } | null;
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

export const AudioHapticProvider: React.FC<{ children: React.ReactNode; storyId?: string }> = ({ children, storyId = 'default_story' }) => {
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
      diceTheme: DEFAULT_DICE_THEME,
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
          diceTheme: typeof parsed.diceTheme === 'string' ? parsed.diceTheme as DiceThemeId : defaultSettings.diceTheme,
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
  const ambienceGainRef = useRef<GainNode | null>(null);
  const ambientNodesRef = useRef<{ sources: (AudioNode & { stop?: () => void })[]; timers: NodeJS.Timeout[] }>({
    sources: [],
    timers: [],
  });
  const activeAudioElRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<QueuedAudioEvent[]>([]);

  // Helper: create smooth looping noise buffer (Pink/Brown noise)
  const createNoiseBuffer = useCallback((ctx: AudioContext, type: 'pink' | 'brown' = 'brown', duration = 4.0): AudioBuffer => {
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let lastOut = 0.0;
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        if (type === 'pink') {
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
          b6 = white * 0.115926;
        } else {
          // Brown noise (integrated white noise with gentle decay)
          lastOut = (lastOut + 0.02 * white) / 1.02;
          data[i] = lastOut * 1.5;
        }
      }
    }
    return buffer;
  }, []);

  // Stop and disconnect any active ambient sound generator safely
  const stopAmbientGenerator = useCallback(() => {
    ambientNodesRef.current.timers.forEach((t) => clearTimeout(t));
    ambientNodesRef.current.timers = [];

    ambientNodesRef.current.sources.forEach((node) => {
      try {
        if (typeof node.stop === 'function') {
          node.stop();
        }
        node.disconnect();
      } catch {
        // Safe disconnect fallback
      }
    });
    ambientNodesRef.current.sources = [];

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

  // Load story-scoped sensory state. Local storage remains a fallback for offline startup.
  useEffect(() => {
    let cancelled = false;
    apiClient.getSensoryState(storyId)
      .then((data) => {
        if (cancelled) return;
        if (data.soundscape) setSoundscape(data.soundscape);
        if (data.settings) {
          setSettings((current) => ({
            ...current,
            ...data.settings,
            diceTheme: data.settings.diceTheme || current.diceTheme || DEFAULT_DICE_THEME,
          }));
        }
      })
      .catch((err) => console.warn('Failed to load story sensory state', err));
    return () => {
      cancelled = true;
    };
  }, [storyId]);

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

  // Controlled Procedural Ambient Soundscape Engine
  useEffect(() => {
    // If disabled, muted, or zero volume -> immediately stop and clean up
    if (!settings.ambienceEnabled || settings.masterMuted || settings.ambienceVolume <= 0) {
      stopAmbientGenerator();
      return;
    }

    const envTrack = (soundscape?.environmentTrack || 'wind_plains').toLowerCase();

    try {
      const ctx = getAudioContext();
      if (!ctx || !masterGainRef.current) return;

      // Stop previous instance before spawning a fresh soundscape
      stopAmbientGenerator();

      const mainAmbienceGain = ctx.createGain();
      const targetVolume = Math.max(0, Math.min(1, settings.ambienceVolume)) * 0.12;
      mainAmbienceGain.gain.setValueAtTime(0.001, ctx.currentTime);
      mainAmbienceGain.gain.exponentialRampToValueAtTime(targetVolume, ctx.currentTime + 0.6);
      mainAmbienceGain.connect(masterGainRef.current);
      ambienceGainRef.current = mainAmbienceGain;

      const activeNodes: (AudioNode & { stop?: () => void })[] = [];
      const timers: NodeJS.Timeout[] = [];

      if (envTrack.includes('forest') || envTrack.includes('crickets') || envTrack.includes('night') || envTrack.includes('nature')) {
        // True Forest / Night Nature Soundscape
        // 1. Soft breeze rustle through canopy (pink noise through high-pass & modulated band-pass)
        const noiseBuf = createNoiseBuffer(ctx, 'pink', 5.0);
        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuf;
        noiseSource.loop = true;

        const leafFilter = ctx.createBiquadFilter();
        leafFilter.type = 'bandpass';
        leafFilter.frequency.value = 680;
        leafFilter.Q.value = 1.2;

        const leafGain = ctx.createGain();
        leafGain.gain.value = 0.45;

        noiseSource.connect(leafFilter);
        leafFilter.connect(leafGain);
        leafGain.connect(mainAmbienceGain);
        noiseSource.start();
        activeNodes.push(noiseSource, leafFilter, leafGain);

        // 2. Organic Cricket / Night Chorus Micro-Chirps
        const spawnCricketChirp = () => {
          if (!ambienceGainRef.current || !audioContextRef.current || audioContextRef.current.state !== 'running') return;
          try {
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const chirpGain = ctx.createGain();
            osc.type = 'sine';
            const baseFreq = 4200 + Math.random() * 800;
            osc.frequency.setValueAtTime(baseFreq, now);

            // Double micro-pulse
            chirpGain.gain.setValueAtTime(0, now);
            chirpGain.gain.linearRampToValueAtTime(0.08, now + 0.02);
            chirpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
            chirpGain.gain.linearRampToValueAtTime(0.07, now + 0.08);
            chirpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

            osc.connect(chirpGain);
            chirpGain.connect(mainAmbienceGain);
            osc.start(now);
            osc.stop(now + 0.16);

            setTimeout(() => {
              try { osc.disconnect(); chirpGain.disconnect(); } catch {}
            }, 300);
          } catch {}

          // Schedule next chirp randomly between 1.2s and 4.0s
          const nextDelay = 1200 + Math.random() * 2800;
          const t = setTimeout(spawnCricketChirp, nextDelay);
          timers.push(t);
        };

        const initialTimer = setTimeout(spawnCricketChirp, 800);
        timers.push(initialTimer);
      } else if (envTrack.includes('indoor') || envTrack.includes('scriptorium') || envTrack.includes('orrery') || envTrack.includes('hearth') || envTrack.includes('tavern')) {
        // True Cozy Indoor / Library / Hearth Soundscape
        // 1. Warm room acoustic air (Brown noise with warm low-pass filter)
        const brownBuf = createNoiseBuffer(ctx, 'brown', 4.0);
        const airSource = ctx.createBufferSource();
        airSource.buffer = brownBuf;
        airSource.loop = true;

        const roomFilter = ctx.createBiquadFilter();
        roomFilter.type = 'lowpass';
        roomFilter.frequency.value = 220;

        const airGain = ctx.createGain();
        airGain.gain.value = 0.6;

        airSource.connect(roomFilter);
        roomFilter.connect(airGain);
        airGain.connect(mainAmbienceGain);
        airSource.start();
        activeNodes.push(airSource, roomFilter, airGain);

        // 2. Soft hearth ember crackle simulator
        const spawnHearthCrackle = () => {
          if (!ambienceGainRef.current || !audioContextRef.current || audioContextRef.current.state !== 'running') return;
          try {
            const now = ctx.currentTime;
            const popBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
            const popData = popBuf.getChannelData(0);
            for (let i = 0; i < popData.length; i++) {
              popData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (popData.length * 0.2));
            }
            const popSource = ctx.createBufferSource();
            popSource.buffer = popBuf;

            const popFilter = ctx.createBiquadFilter();
            popFilter.type = 'bandpass';
            popFilter.frequency.value = 1400 + Math.random() * 1200;
            popFilter.Q.value = 3.0;

            const popGain = ctx.createGain();
            popGain.gain.value = 0.12;

            popSource.connect(popFilter);
            popFilter.connect(popGain);
            popGain.connect(mainAmbienceGain);
            popSource.start(now);

            setTimeout(() => {
              try { popSource.disconnect(); popFilter.disconnect(); popGain.disconnect(); } catch {}
            }, 100);
          } catch {}

          const nextDelay = 300 + Math.random() * 1200;
          const t = setTimeout(spawnHearthCrackle, nextDelay);
          timers.push(t);
        };

        const hearthTimer = setTimeout(spawnHearthCrackle, 500);
        timers.push(hearthTimer);
      } else if (envTrack.includes('dungeon') || envTrack.includes('cavern') || envTrack.includes('crypt') || envTrack.includes('ruins')) {
        // Deep Subterranean / Cavern Atmosphere
        const brownBuf = createNoiseBuffer(ctx, 'brown', 6.0);
        const caveSource = ctx.createBufferSource();
        caveSource.buffer = brownBuf;
        caveSource.loop = true;

        const caveFilter = ctx.createBiquadFilter();
        caveFilter.type = 'lowpass';
        caveFilter.frequency.value = 140;

        const caveGain = ctx.createGain();
        caveGain.gain.value = 0.7;

        caveSource.connect(caveFilter);
        caveFilter.connect(caveGain);
        caveGain.connect(mainAmbienceGain);
        caveSource.start();
        activeNodes.push(caveSource, caveFilter, caveGain);
      } else {
        // Default Open Plains / Mountain Wind Soundscape
        // Realistic dynamic wind gusts via filtered noise and smooth LFO sweep
        const brownBuf = createNoiseBuffer(ctx, 'brown', 6.0);
        const windSource = ctx.createBufferSource();
        windSource.buffer = brownBuf;
        windSource.loop = true;

        const windFilter = ctx.createBiquadFilter();
        windFilter.type = 'bandpass';
        windFilter.frequency.value = 340;
        windFilter.Q.value = 1.8;

        // Gentle 0.18 Hz LFO to modulate the wind gusts naturally
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = 0.18;
        lfoGain.gain.value = 180; // Sweeps filter between 160Hz and 520Hz
        lfo.connect(lfoGain);
        lfoGain.connect(windFilter.frequency);
        lfo.start();

        const windGain = ctx.createGain();
        windGain.gain.value = 0.55;

        windSource.connect(windFilter);
        windFilter.connect(windGain);
        windGain.connect(mainAmbienceGain);
        windSource.start();

        activeNodes.push(windSource, windFilter, lfo, lfoGain, windGain);
      }

      ambientNodesRef.current = {
        sources: activeNodes,
        timers,
      };
    } catch {
      // AudioContext safe catch
    }
  }, [settings.ambienceEnabled, settings.masterMuted, settings.ambienceVolume, soundscape, getAudioContext, stopAmbientGenerator, createNoiseBuffer]);

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
      const result = await apiClient.updateSensorySettings(newSettings, storyId);
      if (result?.settings?.diceTheme && result.settings.diceTheme !== updated.diceTheme) {
        setSettings((current) => ({ ...current, diceTheme: result.settings.diceTheme }));
      }
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
        } else if (cleanCue.includes('dice.roll') || cleanCue.includes('dice result') || cleanCue.includes('dice.critical') || cleanCue.includes('dice.failure')) {
          // Procedural dice SFX: a short rolling hiss/click sequence followed by a
          // distinct result chime. No external audio asset is required.
          const duration = cleanCue.includes('dice.roll') ? 0.75 : 0.32;
          const bufferSize = Math.floor(ctx.sampleRate * duration);
          const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
            const envelope = 1 - i / bufferSize;
            data[i] = (Math.random() * 2 - 1) * envelope * 0.32;
          }

          const source = ctx.createBufferSource();
          const noiseGain = ctx.createGain();
          source.buffer = buffer;
          noiseGain.gain.setValueAtTime(effVolume * (cleanCue.includes('dice.roll') ? 0.24 : 0.08), now);
          noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
          source.connect(noiseGain);
          noiseGain.connect(masterGainRef.current);
          source.start(now);
          source.stop(now + duration);

          if (cleanCue.includes('dice.roll')) {
            for (let i = 0; i < 6; i++) {
              const click = ctx.createOscillator();
              const clickGain = ctx.createGain();
              const clickStart = now + 0.06 + i * 0.095;
              click.type = 'square';
              click.frequency.value = 180 + (i % 3) * 55;
              clickGain.gain.setValueAtTime(effVolume * 0.07, clickStart);
              clickGain.gain.exponentialRampToValueAtTime(0.001, clickStart + 0.035);
              click.connect(clickGain);
              clickGain.connect(masterGainRef.current);
              click.start(clickStart);
              click.stop(clickStart + 0.04);
            }
          } else {
            const tone = ctx.createOscillator();
            const toneGain = ctx.createGain();
            tone.type = 'sine';
            tone.frequency.value = cleanCue.includes('dice.failure') ? 170 : cleanCue.includes('dice.critical') ? 880 : 660;
            toneGain.gain.setValueAtTime(effVolume * 0.18, now);
            toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            tone.connect(toneGain);
            toneGain.connect(masterGainRef.current);
            tone.start(now);
            tone.stop(now + 0.3);
          }

          setTimeout(() => {
            try { source.disconnect(); noiseGain.disconnect(); } catch {}
          }, Math.ceil((duration + 0.1) * 1000));
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
        soundscape,
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
