import { SfxRegistry, SfxDefinition } from './sfxRegistry';
import * as crypto from 'crypto';

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
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  semanticEvent?: string;
}

export interface SemanticSensoryEvent {
  eventId: string;
  type: 'SHOUT' | 'STAB' | 'HEAL' | 'FIRE' | 'DEATH' | 'DIVERGENCE' | 'GENERAL' | string;
  text?: string;
  participants?: string[];
  severity?: 'LOW' | 'MEDIUM' | 'HIGH';
  audio?: {
    cue: string;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
    volume?: number;
  };
  visualDirection?: string;
  audioDirection?: SpatialAudioCue;
  hapticDirection?: HapticIntensity;
  intensity: number;
  presentationMetadata?: any;
  suppressed?: boolean;
  state_proposal?: any;
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

/**
 * Derived Presentation Speech Cache (R12)
 * Purely in-memory, bounded LRU cache.
 * Keyed by text, voiceProfile, model, settings.
 * Invalidated when voice profiles or settings change.
 * MUST NEVER become canonical game state or be saved in archives.
 */
export class SpeechCache {
  private cache: Map<string, { audioBase64: string; timestamp: number }> = new Map();
  private maxEntries: number = 200;

  public computeKey(
    text: string,
    voiceProfile?: VoiceProfile | null,
    providerId?: string,
    modelId?: string
  ): string {
    const normText = (text || '').trim().toLowerCase();
    const payload = [
      normText,
      voiceProfile?.providerId || providerId || 'default_provider',
      voiceProfile?.voiceId || modelId || 'default_voice',
      voiceProfile?.speed ?? 1.0,
      voiceProfile?.pitch ?? 1.0,
      voiceProfile?.language || 'en-US',
      (voiceProfile?.styleHints || []).slice().sort().join(','),
      voiceProfile?.enabled ?? true,
    ].join('::');

    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  public get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    // Bump recency
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.audioBase64;
  }

  public set(key: string, audioBase64: string): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      // Evict oldest entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { audioBase64, timestamp: Date.now() });
  }

  public invalidateAll(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}

export class SensoryEngine {
  private audioSettings: Map<string, AudioSettings> = new Map();
  private voiceProfiles: Map<string, VoiceProfile> = new Map();
  private speechCache: SpeechCache = new SpeechCache();

  public getDefaultSettings(): AudioSettings {
    return {
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
    };
  }

  public getSpeechCache(): SpeechCache {
    return this.speechCache;
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
    // Invalidate speech cache if speech-affecting settings change
    this.speechCache.invalidateAll();
  }

  public getVoiceProfile(storyId: string, actorId: string): VoiceProfile | null {
    const key = `${storyId}:${actorId}`;
    return this.voiceProfiles.get(key) || null;
  }

  public setVoiceProfile(storyId: string, profile: VoiceProfile): void {
    const key = `${storyId}:${profile.actorId}`;
    this.voiceProfiles.set(key, profile);
    // Profile change invalidates cache entries for safety
    this.speechCache.invalidateAll();
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

  public evaluateSoundscape(
    storyId: string,
    locationId: string,
    timePhase: string,
    currentActivity: string,
    combatActive: boolean
  ): SoundscapeProjection {
    let environmentTrack = null;
    let musicStem = null;
    let intensity = 0.1;

    // Epistemic safety: evaluate based on known world state strings
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

  /**
   * Resolves audio cues or typed semantic events into verified presentation events (R9, R19, R20, DEF-CH14-04).
   * Strictly enforces epistemic boundaries:
   * When suppressed:
   * - eventId is opaque ('evt_suppressed_<seq>')
   * - visualDirection is undefined
   * - raw cue text and secret entity names are NEVER returned to the client
   */
  public resolveAudioCuesToEvents(
    cues: (string | SemanticSensoryEvent)[],
    context?: {
      listenerPosition?: { x: number; y: number; z?: number };
      entities?: { name: string; x: number; y: number; z?: number }[];
    }
  ): SemanticSensoryEvent[] {
    const events: SemanticSensoryEvent[] = [];
    let cueSequence = 0;

    for (const item of cues) {
      cueSequence++;
      let rawCueString = typeof item === 'string' ? item : item.audio?.cue || item.visualDirection || item.type;
      let type: SemanticSensoryEvent['type'] = typeof item === 'object' && item.type ? item.type : 'GENERAL';
      let hapticDirection: HapticIntensity | undefined = typeof item === 'object' ? item.hapticDirection : undefined;
      let sfxDef: SfxDefinition | null = null;
      let audioCueKey = '';

      // 1. Check SFX Registry (DEF-CH14-05)
      if (typeof item === 'object' && item.audio?.cue) {
        sfxDef = SfxRegistry.resolve(item.audio.cue);
        audioCueKey = item.audio.cue;
      } else if (typeof item === 'string') {
        sfxDef = SfxRegistry.resolve(item);
        if (sfxDef) {
          audioCueKey = sfxDef.key;
        }
      }

      if (sfxDef) {
        if (!hapticDirection) hapticDirection = sfxDef.defaultHaptic;
        if (type === 'GENERAL') {
          type = sfxDef.category === 'combat' ? 'STAB' : sfxDef.category.toUpperCase();
        }
      } else {
        // Fallback for legacy prose cues (backward compatibility for existing tests)
        const lowerCue = rawCueString.toLowerCase();
        if (lowerCue.includes('shout')) type = 'SHOUT';
        else if (lowerCue.includes('stab') || lowerCue.includes('slash')) {
          type = 'STAB';
          if (!hapticDirection) hapticDirection = 'heavy';
        } else if (lowerCue.includes('heal') || lowerCue.includes('chime')) {
          type = 'HEAL';
          if (!hapticDirection) hapticDirection = 'light';
        } else if (lowerCue.includes('fire') || lowerCue.includes('burn')) {
          type = 'FIRE';
          if (!hapticDirection) hapticDirection = 'medium';
        } else if (lowerCue.includes('death')) {
          type = 'DEATH';
          if (!hapticDirection) hapticDirection = 'heavy';
        } else if (lowerCue.includes('divergence')) {
          type = 'DIVERGENCE';
          if (!hapticDirection) hapticDirection = 'heavy';
        }
        audioCueKey = rawCueString;
      }

      let radius = 10;
      let volume = sfxDef?.defaultVolume ?? 1.0;
      let distance = 0;
      let audioDirection: SpatialAudioCue | undefined = undefined;
      let suppressed = false;

      const lowerSearch = rawCueString.toLowerCase();

      if (context?.listenerPosition && context?.entities) {
        const source = context.entities.find((e) => lowerSearch.includes(e.name.toLowerCase()));
        if (source) {
          const dx = source.x - context.listenerPosition.x;
          const dy = source.y - context.listenerPosition.y;
          distance = Math.sqrt(dx * dx + dy * dy);
          if (distance === 0) {
            volume = 1.0;
          } else {
            volume = Math.max(0.1, 1.0 / Math.max(1, distance / 5));
          }
          radius = Math.max(5, distance + 10);
          audioDirection = {
            cueId: audioCueKey,
            soundId: audioCueKey,
            radius,
            volume,
            priority: sfxDef?.priority || 'NORMAL',
          };
        } else {
          // DEF-CH14-04: If entities context is provided but the source cannot be resolved
          // to an authorized canonical entity, the cue MUST be suppressed.
          suppressed = true;
        }
      } else if (context?.listenerPosition) {
        audioDirection = {
          cueId: audioCueKey,
          soundId: audioCueKey,
          radius: 10,
          volume,
          priority: sfxDef?.priority || 'NORMAL',
        };
      } else {
        audioDirection = {
          cueId: audioCueKey,
          soundId: audioCueKey,
          radius: 10,
          volume,
          priority: sfxDef?.priority || 'NORMAL',
        };
      }

      if (suppressed) {
        // DEF-CH14-04: Suppressed events MUST NOT leak raw secret text, entity names, or visualDirection
        events.push({
          eventId: `evt_suppressed_${cueSequence}`,
          type,
          visualDirection: undefined,
          intensity: 0,
          suppressed: true,
        });
      } else {
        events.push({
          eventId: `evt_${audioCueKey.replace(/[^a-zA-Z0-9_-]/g, '_')}_${cueSequence}`,
          type,
          visualDirection: rawCueString,
          audio: {
            cue: audioCueKey,
            priority: sfxDef?.priority || 'NORMAL',
            volume,
          },
          audioDirection,
          hapticDirection,
          intensity:
            hapticDirection === 'heavy'
              ? 1.0
              : hapticDirection === 'medium'
              ? 0.6
              : hapticDirection === 'light'
              ? 0.3
              : 0,
        });
      }
    }

    return events;
  }
}
