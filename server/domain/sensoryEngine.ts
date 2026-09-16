export type HapticIntensity = 'off' | 'light' | 'medium' | 'heavy';
export type NarrationMode = 'auto' | 'dialogue-only' | 'off';

export interface AudioSettings {
  narration: NarrationMode;
  characterVoiceEnabled: boolean;
  sfxEnabled: boolean;
  sfxVolume: number;
  ambienceEnabled: boolean;
  hapticIntensity: HapticIntensity;
}

export interface VoiceProfile {
  actorId: string;
  providerId: string;
  voiceId: string;
  speed: number;
  pitch: number;
  styleHints: string[];
  language: string;
  enabled: boolean;
}

export interface SpatialAudioCue {
  cueId: string;
  soundId: string;
  sourceEntityId?: string;
  worldPosition?: { x: number; y: number; z: number };
  listenerRelativePosition?: { x: number; y: number; z: number };
  radius: number;
  volume: number;
  duration?: number;
  semanticEvent?: string;
}

export interface SemanticSensoryEvent {
  eventId: string;
  type: 'SHOUT' | 'STAB' | 'HEAL' | 'FIRE' | 'DEATH' | 'DIVERGENCE' | 'GENERAL';
  visualDirection?: string;
  audioDirection?: SpatialAudioCue;
  hapticDirection?: HapticIntensity;
  intensity: number;
  presentationMetadata?: any;
}

export interface SoundscapeProjection {
  environmentTrack: string | null;
  musicStem: string | null;
  intensity: number;
}

export interface SensoryProjection {
  soundscape: SoundscapeProjection;
  events: SemanticSensoryEvent[];
}

export class SensoryEngine {
  private audioSettings: Map<string, AudioSettings> = new Map();
  private voiceProfiles: Map<string, VoiceProfile> = new Map();

  public getDefaultSettings(): AudioSettings {
    return {
      narration: 'auto',
      characterVoiceEnabled: true,
      sfxEnabled: true,
      sfxVolume: 1.0,
      ambienceEnabled: true,
      hapticIntensity: 'medium',
    };
  }

  public getSettings(storyId: string): AudioSettings {
    if (!this.audioSettings.has(storyId)) {
      this.audioSettings.set(storyId, this.getDefaultSettings());
    }
    return this.audioSettings.get(storyId)!;
  }

  public updateSettings(storyId: string, settings: Partial<AudioSettings>): void {
    const current = this.getSettings(storyId);
    this.audioSettings.set(storyId, { ...current, ...settings });
  }

  public getVoiceProfile(storyId: string, actorId: string): VoiceProfile | null {
    const key = `${storyId}:${actorId}`;
    return this.voiceProfiles.get(key) || null;
  }

  public setVoiceProfile(storyId: string, profile: VoiceProfile): void {
    const key = `${storyId}:${profile.actorId}`;
    this.voiceProfiles.set(key, profile);
  }

  public getAllVoiceProfiles(storyId: string): VoiceProfile[] {
    const prefix = `${storyId}:`;
    const profiles: VoiceProfile[] = [];
    for (const [key, profile] of Array.from(this.voiceProfiles.entries())) {
      if (key.startsWith(prefix)) {
        profiles.push(profile);
      }
    }
    return profiles;
  }

  public restoreVoiceProfiles(storyId: string, profiles: VoiceProfile[]): void {
    for (const profile of profiles) {
      this.setVoiceProfile(storyId, profile);
    }
  }

  public evaluateSoundscape(storyId: string, locationId: string, timePhase: string, currentActivity: string, combatActive: boolean): SoundscapeProjection {
    let environmentTrack = null;
    let musicStem = null;
    let intensity = 0.1;

    // Epistemic safety: we only evaluate based on known world state strings
    if (combatActive) {
      musicStem = 'combat_intense';
      intensity = 0.8;
    } else if (locationId.includes('forest')) {
      environmentTrack = timePhase === 'Night' ? 'forest_night_crickets' : 'forest_day_birds';
      musicStem = 'exploration_light';
      intensity = 0.3;
    } else if (locationId.includes('orrery') || locationId.includes('scriptorium')) {
      environmentTrack = 'indoor_ambient_hum';
      musicStem = 'mystery_drone';
      intensity = 0.2;
    } else {
      environmentTrack = 'wind_plains';
      musicStem = 'exploration_light';
    }

    if (currentActivity === 'sleeping') {
      musicStem = null;
      intensity = 0.05;
    }

    return {
      environmentTrack,
      musicStem,
      intensity,
    };
  }

  public resolveAudioCuesToEvents(
    cues: string[],
    context?: {
      listenerPosition?: { x: number; y: number; z?: number };
      entities?: { name: string; x: number; y: number; z?: number }[];
    }
  ): SemanticSensoryEvent[] {
    const events: SemanticSensoryEvent[] = [];
    for (const cue of cues) {
      let type: SemanticSensoryEvent['type'] = 'GENERAL';
      let hapticDirection: HapticIntensity | undefined;
      
      const lowerCue = cue.toLowerCase();
      if (lowerCue.includes('shout')) type = 'SHOUT';
      else if (lowerCue.includes('stab') || lowerCue.includes('slash')) { type = 'STAB'; hapticDirection = 'heavy'; }
      else if (lowerCue.includes('heal') || lowerCue.includes('chime')) { type = 'HEAL'; hapticDirection = 'light'; }
      else if (lowerCue.includes('fire') || lowerCue.includes('burn')) { type = 'FIRE'; hapticDirection = 'medium'; }
      else if (lowerCue.includes('death')) { type = 'DEATH'; hapticDirection = 'heavy'; }
      else if (lowerCue.includes('divergence')) { type = 'DIVERGENCE'; hapticDirection = 'heavy'; }

      events.push({
        eventId: `evt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        type,
        visualDirection: cue,
        audioDirection: (function() {
          let radius = 10;
          let volume = 1.0;
          let distance = 0;
          if (context?.listenerPosition && context?.entities) {
            const source = context.entities.find(e => lowerCue.includes(e.name.toLowerCase()));
            if (source) {
              const dx = source.x - context.listenerPosition.x;
              const dy = source.y - context.listenerPosition.y;
              distance = Math.sqrt(dx * dx + dy * dy);
              if (distance === 0) {
                volume = 1.0;
              } else {
                volume = Math.max(0.1, 1.0 / Math.max(1, (distance / 5)));
              }
              radius = Math.max(5, distance + 10);
            }
          }
          return {
            cueId: cue,
            soundId: cue,
            radius,
            volume,
          };
        })(),
        hapticDirection,
        intensity: hapticDirection === 'heavy' ? 1.0 : hapticDirection === 'medium' ? 0.6 : 0.3,
      });
    }
    return events;
  }
}
