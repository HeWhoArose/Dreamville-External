import type { CombatAnimationPlan, CombatEffectDefinition, CombatEventRecord } from '../../src/types';
import type { WorldRepository } from '../repositories/worldRepository';

function safeJson(text: string): any {
  const trimmed = (text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(trimmed); } catch { return null; }
}

export class CombatAnimationService {
  public deterministicPlan(definition: CombatEffectDefinition): CombatAnimationPlan {
    const composition = definition.resolutionMode === 'MULTI_INSTANCE' ? 'MULTI_BEAM' :
      definition.resolutionMode === 'CHAIN' ? 'CHAIN' :
      definition.resolutionMode === 'AREA' ? 'AREA_BURST' :
      definition.resolutionMode === 'WORLD_EFFECT' ? 'WORLD_CINEMATIC' : 'SINGLE_EFFECT';
    return {
      id: `anim_${definition.id}`,
      composition,
      sequence: definition.resolutionMode === 'MULTI_INSTANCE' ? 'SEQUENTIAL' : 'INSTANT',
      count: definition.instanceCount,
      origin: 'ABILITY_ORIGIN',
      impact: 'IMPACT',
      criticalImpact: 'CRITICAL_IMPACT',
      missBehavior: 'PASS_TARGET',
      style: definition.damageType || definition.name,
      assetRefs: [...(definition.assetRefs || [])],
      assetUrls: [],
      generatedBy: 'SYSTEM',
      provenance: 'PHASE_8_5_DETERMINISTIC_ANIMATION_FALLBACK',
    };
  }

  public async generatePlan(params: { repository: WorldRepository; storyId: string; definition: CombatEffectDefinition; events?: CombatEventRecord[] }): Promise<{ plan: CombatAnimationPlan; source: 'AI' | 'SYSTEM'; fallbackReason?: string }> {
    const fallback = this.deterministicPlan(params.definition);
    const cached = params.repository.getActiveEffects(params.storyId).find(
      (effect: any) =>
        effect?.type === 'COMBAT_ANIMATION_PLAN' &&
        effect?.effectId === params.definition.id &&
        effect?.presentationOnly === true &&
        effect?.plan?.generatedBy === 'AI'
    );
    if (cached?.plan) {
      return {
        plan: {
          ...JSON.parse(JSON.stringify(cached.plan)),
          assetUrls: Array.isArray(cached.plan.assetUrls) ? [...cached.plan.assetUrls] : [],
        },
        source: cached.plan.generatedBy === 'AI' ? 'AI' : 'SYSTEM',
      };
    }
    try {
      const prompt = `Create a presentation-only animation plan for this Dreamville combat effect. Never decide combat outcomes.\nEffect: ${JSON.stringify(params.definition)}\nResolved events: ${JSON.stringify(params.events || [])}\nReturn only JSON with composition, sequence, count, origin, impact, criticalImpact, missBehavior, style, assetRefs.`;
      const response = await params.repository.getAiOrchestrator().executeTaskGeneration(
        'combat.animation.plan',
        prompt,
        'Return only valid JSON. This output is presentation-only and must not alter combat mechanics.',
        { timeoutMs: 30000 }
      );
      if (!response.text || response.source === 'DETERMINISTIC_FALLBACK') {
        params.repository.saveActiveEffect({
          id: 'combat_animation_' + params.storyId + '_' + params.definition.id,
          type: 'COMBAT_ANIMATION_PLAN',
          storyId: params.storyId,
          effectId: params.definition.id,
          plan: JSON.parse(JSON.stringify(fallback)),
          presentationOnly: true,
          cacheDisposable: true,
        });
        return { plan: fallback, source: 'SYSTEM', fallbackReason: response.fallbackReason || 'AI animation planning unavailable.' };
      }
      const parsed = safeJson(response.text);
      if (!parsed || typeof parsed.composition !== 'string') {
        params.repository.saveActiveEffect({
          id: 'combat_animation_' + params.storyId + '_' + params.definition.id,
          type: 'COMBAT_ANIMATION_PLAN',
          storyId: params.storyId,
          effectId: params.definition.id,
          plan: JSON.parse(JSON.stringify(fallback)),
          presentationOnly: true,
          cacheDisposable: true,
        });
        return { plan: fallback, source: 'SYSTEM', fallbackReason: 'AI returned invalid animation plan JSON.' };
      }
      const compositions = new Set([
        'SINGLE_EFFECT',
        'MULTI_BEAM',
        'CHAIN',
        'AREA_BURST',
        'WORLD_CINEMATIC',
      ]);
      const composition = compositions.has(String(parsed.composition)) ? String(parsed.composition) : fallback.composition;
      const sequence =
        parsed.sequence === 'PARALLEL' || parsed.sequence === 'SEQUENTIAL' || parsed.sequence === 'INSTANT'
          ? parsed.sequence
          : fallback.sequence;
      const rawCount = Number(parsed.count ?? fallback.count ?? 1);
      const count = Number.isFinite(rawCount)
        ? Math.max(1, Math.min(50, Math.trunc(rawCount)))
        : Math.max(1, Math.min(50, fallback.count ?? 1));
      const assetRefs = Array.isArray(parsed.assetRefs)
        ? parsed.assetRefs.map(String).filter(Boolean).slice(0, 12)
        : fallback.assetRefs || [];
      const safeStyle = typeof parsed.style === 'string'
        ? parsed.style.trim().slice(0, 160)
        : fallback.style;

      const plan: CombatAnimationPlan = {
        ...fallback,
        composition,
        sequence,
        count,
        origin: typeof parsed.origin === 'string' ? parsed.origin.trim().slice(0, 80) : fallback.origin,
        impact: typeof parsed.impact === 'string' ? parsed.impact.trim().slice(0, 80) : fallback.impact,
        criticalImpact: typeof parsed.criticalImpact === 'string' ? parsed.criticalImpact.trim().slice(0, 80) : fallback.criticalImpact,
        missBehavior: typeof parsed.missBehavior === 'string' ? parsed.missBehavior.trim().slice(0, 80) : fallback.missBehavior,
        style: safeStyle,
        assetRefs,
        assetUrls: [],
        id: fallback.id,
        generatedBy: 'AI',
        provenance: 'AI_COMBAT_ANIMATION_PLAN',
      };
      params.repository.saveActiveEffect({
        id: 'combat_animation_' + params.storyId + '_' + params.definition.id,
        type: 'COMBAT_ANIMATION_PLAN',
        storyId: params.storyId,
        effectId: params.definition.id,
        plan: JSON.parse(JSON.stringify(plan)),
        presentationOnly: true,
        cacheDisposable: true,
      });
      return { plan, source: 'AI' };
    } catch (error: any) {
      params.repository.saveActiveEffect({
        id: 'combat_animation_' + params.storyId + '_' + params.definition.id,
        type: 'COMBAT_ANIMATION_PLAN',
        storyId: params.storyId,
        effectId: params.definition.id,
        plan: JSON.parse(JSON.stringify(fallback)),
        presentationOnly: true,
        cacheDisposable: true,
      });
      return { plan: fallback, source: 'SYSTEM', fallbackReason: error?.message || 'AI animation planning failed.' };
    }
  }
}

export const combatAnimationService = new CombatAnimationService();
