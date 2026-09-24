export interface VoiceIdentity {
  voiceId: string;
  name: string;
  provider: string;
  model: string;
  pitch: number;
  rate: number;
  gender: 'male' | 'female' | 'neutral';
  toneTag: string;
}

export interface CharacterVoiceConfig {
  characterId: string;
  characterName: string;
  mode: 'auto' | 'override';
  customVoiceId?: string;
  customProvider?: string;
}

export const PRESET_VOICES: VoiceIdentity[] = [
  { voiceId: 'en-US-Aura-Deep', name: 'Aura Deep (Male)', provider: 'Google TTS', model: 'Neural2-D', pitch: 0.95, rate: 1.0, gender: 'male', toneTag: 'Deep & Resonant' },
  { voiceId: 'en-US-Aura-Warm', name: 'Aura Warm (Female)', provider: 'Google TTS', model: 'Neural2-F', pitch: 1.02, rate: 1.0, gender: 'female', toneTag: 'Warm & Melodic' },
  { voiceId: 'en-US-Zephyr-Elder', name: 'Zephyr Elder (Male)', provider: 'Google TTS', model: 'Neural2-J', pitch: 0.88, rate: 0.95, gender: 'male', toneTag: 'Wise & Aged' },
  { voiceId: 'en-US-Echo-Command', name: 'Echo Command (Female)', provider: 'Google TTS', model: 'Neural2-C', pitch: 1.0, rate: 1.05, gender: 'female', toneTag: 'Crisp & Authoritative' },
  { voiceId: 'en-US-Nova-Youth', name: 'Nova Youth (Neutral)', provider: 'Google TTS', model: 'Neural2-A', pitch: 1.1, rate: 1.0, gender: 'neutral', toneTag: 'Spirited & Energetic' },
  { voiceId: 'en-US-Narrator-Classic', name: 'Narrator Classic', provider: 'Google TTS', model: 'Studio-O', pitch: 1.0, rate: 0.98, gender: 'neutral', toneTag: 'Soothing Narrator' },
];

/**
 * Automatic Character Voice Identity Resolver
 * Stable, deterministic voice profile assignment for characters/NPCs.
 */
export function resolveCharacterVoice(
  character: { id?: string; name: string; gender?: string; traits?: string[] },
  overrides?: Record<string, CharacterVoiceConfig>
): VoiceIdentity {
  const charId = character.id || character.name;
  const override = overrides?.[charId] || overrides?.[character.name];
  if (override && override.mode === 'override' && override.customVoiceId) {
    const matched = PRESET_VOICES.find((v) => v.voiceId === override.customVoiceId);
    if (matched) return matched;
  }

  // Deterministic seed hash
  let hash = 0;
  const seed = `${charId}_${character.name}_${character.gender || ''}_${(character.traits || []).join(',')}`;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const npcPool = PRESET_VOICES.filter((v) => v.voiceId !== 'en-US-Narrator-Classic');
  const index = Math.abs(hash) % npcPool.length;
  return npcPool[index];
}

export interface CharacterSpeakerTheme {
  nameColor: string;
  badgeBg: string;
  badgeBorder: string;
  textColor: string;
  bubbleBorder: string;
  accentHex: string;
}

const CHARACTER_ACCENT_PALETTE: CharacterSpeakerTheme[] = [
  { nameColor: 'text-amber-300', badgeBg: 'bg-amber-500/10', badgeBorder: 'border-amber-500/30', textColor: 'text-amber-100', bubbleBorder: 'border-amber-500/30', accentHex: '#f59e0b' },
  { nameColor: 'text-emerald-300', badgeBg: 'bg-emerald-500/10', badgeBorder: 'border-emerald-500/30', textColor: 'text-emerald-100', bubbleBorder: 'border-emerald-500/30', accentHex: '#10b981' },
  { nameColor: 'text-cyan-300', badgeBg: 'bg-cyan-500/10', badgeBorder: 'border-cyan-500/30', textColor: 'text-cyan-100', bubbleBorder: 'border-cyan-500/30', accentHex: '#06b6d4' },
  { nameColor: 'text-purple-300', badgeBg: 'bg-purple-500/10', badgeBorder: 'border-purple-500/30', textColor: 'text-purple-100', bubbleBorder: 'border-purple-500/30', accentHex: '#a855f7' },
  { nameColor: 'text-rose-300', badgeBg: 'bg-rose-500/10', badgeBorder: 'border-rose-500/30', textColor: 'text-rose-100', bubbleBorder: 'border-rose-500/30', accentHex: '#f43f5e' },
  { nameColor: 'text-blue-300', badgeBg: 'bg-blue-500/10', badgeBorder: 'border-blue-500/30', textColor: 'text-blue-100', bubbleBorder: 'border-blue-500/30', accentHex: '#3b82f6' },
  { nameColor: 'text-indigo-300', badgeBg: 'bg-indigo-500/10', badgeBorder: 'border-indigo-500/30', textColor: 'text-indigo-100', bubbleBorder: 'border-indigo-500/30', accentHex: '#6366f1' },
  { nameColor: 'text-teal-300', badgeBg: 'bg-teal-500/10', badgeBorder: 'border-teal-500/30', textColor: 'text-teal-100', bubbleBorder: 'border-teal-500/30', accentHex: '#14b8a6' },
];

/**
 * Deterministic character speaker theme assignment for dialogue text rendering.
 * Ensures stable accent styling per speaker across all turns.
 */
export function getCharacterSpeakerTheme(
  speakerName: string,
  worldId?: string,
  speakerId?: string,
): CharacterSpeakerTheme {
  if (!speakerName || speakerName.toLowerCase() === 'narrator' || speakerName.toLowerCase() === 'system') {
    return {
      nameColor: 'text-stone-300',
      badgeBg: 'bg-stone-800/50',
      badgeBorder: 'border-stone-700',
      textColor: 'text-stone-200',
      bubbleBorder: 'border-stone-800',
      accentHex: '#78716c',
    };
  }

  const worldScope = worldId?.trim() || 'global';
  const speakerScope = speakerId?.trim() || speakerName.trim().toLowerCase();
  const seed = `${worldScope}::${speakerScope}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  const index = Math.abs(hash) % CHARACTER_ACCENT_PALETTE.length;
  return CHARACTER_ACCENT_PALETTE[index];
}
