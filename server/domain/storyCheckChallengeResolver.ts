import type { StoryCheckChallenge } from '../../src/types';
import type { CapabilityDefinition } from './capabilityEngine';

export interface StoryCheckChallengeSourceContext {
  actionText: string;
  sceneText?: string;
  run?: any;
  worldTemplate?: any;
  activeEffects?: any[];
  capabilities?: CapabilityDefinition[];
}

function normalize(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\\s]/g, ' ').replace(/\\s+/g, ' ').trim();
}

function asArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function normalizeChallenge(raw: any, sourceType: StoryCheckChallenge['sourceType'], fallbackId: string): StoryCheckChallenge | null {
  const source = raw?.storyCheckChallenge || raw?.savingThrowChallenge || raw;
  if (!source || typeof source !== 'object') return null;
  if (!source.id && !source.challengeId) return null;
  const difficultyClass = Number(source.difficultyClass ?? source.dc);
  if (!Number.isFinite(difficultyClass)) return null;
  const keywords = asArray(source.keywords || source.triggerKeywords || source.triggers)
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (keywords.length === 0) return null;
  const id = String(source.id || source.challengeId || fallbackId);
  const sourceId = String(source.sourceId || raw?.id || raw?.eventId || raw?.capabilityId || id);
  return {
    ...source,
    id,
    label: String(source.label || source.name || id),
    sourceType: source.sourceType || sourceType,
    sourceId,
    keywords,
    difficultyClass,
    reason: source.reason ? String(source.reason) : undefined,
    triggerReason: source.triggerReason ? String(source.triggerReason) : undefined,
    provenance: source.provenance ? String(source.provenance) : undefined,
  } as StoryCheckChallenge;
}

function collectFromContainer(container: any, sourceType: StoryCheckChallenge['sourceType'], prefix: string): StoryCheckChallenge[] {
  if (!container) return [];
  const results: StoryCheckChallenge[] = [];
  const directCollections = [
    container.storyCheckChallenges,
    container.savingThrowChallenges,
  ];
  directCollections.forEach((collection, index) => {
    asArray(collection).forEach((raw, itemIndex) => {
      const challenge = normalizeChallenge(raw, sourceType, prefix + '_challenge_' + index + '_' + itemIndex);
      if (challenge) results.push(challenge);
    });
  });
  const nested = [container.storyCheckChallenge, container.savingThrowChallenge];
  nested.forEach((raw, index) => {
    const challenge = normalizeChallenge(raw, sourceType, prefix + '_nested_' + index);
    if (challenge) results.push(challenge);
  });
  return results;
}

export class StoryCheckChallengeResolver {
  public resolve(context: StoryCheckChallengeSourceContext): StoryCheckChallenge | null {
    const candidates: StoryCheckChallenge[] = [];
    candidates.push(...collectFromContainer(context.run, 'EVENT', 'run'));
    candidates.push(...collectFromContainer(context.worldTemplate, 'HAZARD', 'world'));
    for (const effect of context.activeEffects || []) {
      candidates.push(...collectFromContainer(effect, 'EFFECT', 'effect_' + String(effect?.id || 'unknown')));
    }
    for (const capability of context.capabilities || []) {
      candidates.push(...collectFromContainer(capability, 'CAPABILITY', 'cap_' + capability.id));
      for (const effect of (capability as any).effects || []) {
        candidates.push(...collectFromContainer(effect, 'CAPABILITY', 'cap_effect_' + capability.id));
      }
    }

    const action = normalize(context.actionText);
    const scene = normalize(context.sceneText || '');
    const ranked = candidates
      .map((challenge) => {
        const matches = challenge.keywords.filter((keyword) => {
          const needle = normalize(keyword);
          return needle && (action.includes(needle) || scene.includes(needle));
        });
        return { challenge, score: matches.reduce((sum, keyword) => sum + normalize(keyword).length + 1, 0), matchCount: matches.length };
      })
      .filter((entry) => entry.matchCount > 0)
      .sort((a, b) => b.score - a.score);

    return ranked[0]?.challenge || null;
  }
}

export const storyCheckChallengeResolver = new StoryCheckChallengeResolver();