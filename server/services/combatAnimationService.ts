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
      generatedBy: 'SYSTEM',
      provenance: 'PHASE_8_5_DETERMINISTIC_ANIMATION_FALLBACK',
    };
  }

  public async generatePlan(params: { repository: WorldRepository; storyId: string; definition: CombatEffectDefinition; events?: CombatEventRecord[] }): Promise<{ plan: CombatAnimationPlan; source: 'AI' | 'SYSTEM'; fallbackReason?: string }> {
    const fallback = this.deterministicPlan(params.definition);
    try {
      const prompt = `Create a presentation-only animation plan for this Dreamville combat effect. Never decide combat outcomes.\nEffect: ${JSON.stringify(params.definition)}\nResolved events: ${JSON.stringify(params.events || [])}\nReturn only JSON with composition, sequence, count, origin, impact, criticalImpact, missBehavior, style, assetRefs.`;
      const response = await params.repository.getAiOrchestrator().executeTaskGeneration(
        'combat.animation.plan',
        prompt,
        'Return only valid JSON. This output is presentation-only and must not alter combat mechanics.',
        { timeoutMs: 30000 }
      );
      if (!response.text || response.source === 'DETERMINISTIC_FALLBACK') {
        return { plan: fallback, source: 'SYSTEM', fallbackReason: response.fallbackReason || 'AI animation planning unavailable.' };
      }
      const parsed = safeJson(response.text);
      if (!parsed || typeof parsed.composition !== 'string') return { plan: fallback, source: 'SYSTEM', fallbackReason: 'AI returned invalid animation plan JSON.' };
      const plan: CombatAnimationPlan = {
        ...fallback,
        ...parsed,
        id: fallback.id,
        sequence: parsed.sequence === 'PARALLEL' || parsed.sequence === 'SEQUENTIAL' ? parsed.sequence : fallback.sequence,
        count: Math.max(1, Math.min(50, Number(parsed.count ?? fallback.count ?? 1))),
        generatedBy: 'AI',
        provenance: 'AI_COMBAT_ANIMATION_PLAN',
      };
      return { plan, source: 'AI' };
    } catch (error: any) {
      return { plan: fallback, source: 'SYSTEM', fallbackReason: error?.message || 'AI animation planning failed.' };
    }
  }
}

export const combatAnimationService = new CombatAnimationService();
