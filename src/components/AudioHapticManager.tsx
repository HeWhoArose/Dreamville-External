import React, { createContext, useContext, useEffect, useState, useRef } from 'react';

interface AudioSettings {
  narration: 'auto' | 'dialogue-only' | 'off';
  characterVoiceEnabled: boolean;
  sfxEnabled: boolean;
  sfxVolume: number;
  ambienceEnabled: boolean;
  hapticIntensity: 'off' | 'light' | 'medium' | 'heavy';
}

interface AudioHapticContextValue {
  settings: AudioSettings;
  updateSettings: (settings: Partial<AudioSettings>) => Promise<void>;
  triggerHaptic: (intensity?: 'light' | 'medium' | 'heavy') => void;
  playSpeech: (text: string, actorId: string) => Promise<void>;
}

const AudioHapticContext = createContext<AudioHapticContextValue | null>(null);

export const useAudioHaptic = () => {
  const ctx = useContext(AudioHapticContext);
  if (!ctx) throw new Error('useAudioHaptic must be used within AudioHapticProvider');
  return ctx;
};

export const AudioHapticProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AudioSettings>({
    narration: 'auto',
    characterVoiceEnabled: true,
    sfxEnabled: true,
    sfxVolume: 1.0,
    ambienceEnabled: true,
    hapticIntensity: 'medium',
  });
  
  const [soundscape, setSoundscape] = useState<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Initial fetch of settings
    fetch('/api/game/sensory/state')
      .then(r => r.json())
      .then(data => {
        if (data.settings) setSettings(data.settings);
        if (data.soundscape) setSoundscape(data.soundscape);
      })
      .catch(console.error);
  }, []);

  // Sync ambience based on state
  useEffect(() => {
    if (settings.ambienceEnabled && soundscape?.environmentTrack) {
      // Presentation only: simulate playing the environment track
      console.log(`[AudioHapticManager] Playing environment track: ${soundscape.environmentTrack}`);
    }
  }, [soundscape, settings.ambienceEnabled]);

  const updateSettings = async (newSettings: Partial<AudioSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
    await fetch('/api/game/sensory/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: newSettings }),
    });
  };

  const triggerHaptic = (intensity: 'light' | 'medium' | 'heavy' = 'medium') => {
    if (settings.hapticIntensity === 'off' || !('vibrate' in navigator)) return;
    
    // Map abstract intensity to vibration pattern
    let pattern = [50]; // light
    if (settings.hapticIntensity === 'heavy' || intensity === 'heavy') {
      pattern = [100, 50, 100];
    } else if (settings.hapticIntensity === 'medium' || intensity === 'medium') {
      pattern = [80];
    }

    try {
      navigator.vibrate(pattern);
    } catch (e) {
      console.warn('Haptics failed or not supported', e);
    }
  };

  const playSpeech = async (text: string, actorId: string) => {
    if (settings.narration === 'off') return;
    try {
      const res = await fetch('/api/game/sensory/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, actorId }),
      });
      const data = await res.json();
      console.log(`[AudioHapticManager] Speech played: ${data.audioResult}`);
    } catch (e) {
      console.error('Failed to play speech', e);
    }
  };

  return (
    <AudioHapticContext.Provider value={{ settings, updateSettings, triggerHaptic, playSpeech }}>
      {children}
    </AudioHapticContext.Provider>
  );
};
