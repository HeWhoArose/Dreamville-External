import type { CombatEffectDefinition } from '../../src/types';
import type { WorldRepository } from '../repositories/worldRepository';
import { TacticalCombatEngine } from '../domain/combatEngine';
import { combatEffectEngine } from '../domain/combatEffectEngine';
import { combatSimulationEngine, type CombatSimulationAuthorityDiagnostics } from '../domain/combatSimulationEngine';
import { deterministicId } from '../domain/deterministicRng';
import type { CapabilityDefinition } from '../domain/capabilityEngine';

/**
 * The player-facing ability creation flow of the combat design:
 *
 *   describe it  ->  structured definition (AI or an editor)  ->  schema validation  ->  sandbox simulation and diagnostics
 *   ->  the player reviews the result  ->  the player confirms  ->  the ability is registered and acquired.
 *
 * Nothing is registered until the player confirms an approved draft. The AI proposes; it cannot grant itself authority,
 * bypass an immunity or invent unlimited resources: the definition passes the same validation and authority checks as every
 * other effect, and an unauthorised or unsafe definition is rejected with reasons.
 */

export type AbilityDraftStatus = 'READY_FOR_CONFIRMATION' | 'REJECTED' | 'CONFIRMED' | 'DISCARDED';

export interface AbilityDraft {
  id: string;
  storyId: string;
  actorId: string;
  description: string;
  definition?: CombatEffectDefinition;
  source: 'AI' | 'EDITOR' | 'NONE';
  status: AbilityDraftStatus;
  reasons: string[];
  diagnostics?: CombatSimulationAuthorityDiagnostics;
  /** The sandbox preview the player reviews before confirming. Runs on a copy; the live world is untouched. */
  preview?: {
    runs: number;
    successfulRuns: number;
    averageDamage: number;
    minDamage: number;
    maxDamage: number;
    abstraction: 'TACTICAL' | 'MACRO';
    summary: string;
  };
  capabilityId?: string;
  createdAt: number;
}

const PREVIEW_SEEDS = [101, 202, 303, 404, 505];

function safeJson(text: string): any {
  const trimmed = (text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(trimmed); } catch { return null; }
}

export class AbilityDraftService {
  private drafts = new Map<string, AbilityDraft>();

  public getDraft(draftId: string): AbilityDraft | undefined {
    const draft = this.drafts.get(draftId);
    return draft ? JSON.parse(JSON.stringify(draft)) : undefined;
  }

  public listDrafts(storyId: string): AbilityDraft[] {
    return Array.from(this.drafts.values()).filter((draft) => draft.storyId === storyId).map((draft) => JSON.parse(JSON.stringify(draft)));
  }

  /** A throwaway battlefield: the caster and a training dummy, so any ability can be previewed outside a fight. */
  private sandbox(repository: WorldRepository, storyId: string, actorId: string, definition: CombatEffectDefinition): TacticalCombatEngine {
    const live = repository.getCombatEngine(storyId);
    const sandbox = new TacticalCombatEngine(live.getDiceEngine().getSeed());
    const profile = live.getRulesProfile();
    if (profile) sandbox.setRulesProfile(profile);
    const base = { initiative: 100, initiativeModifier: 100, speedCells: 8, conditions: [] as string[], isDead: false };
    sandbox.addParticipant({ id: actorId, name: 'You', team: 'player_allies', x: 0, y: 0, hpCurrent: 100, hpMax: 100, armorClass: 14, attackBonus: 6, damageFormula: '1d6+3', ...base });
    const enemies = ['training_dummy_a', 'training_dummy_b', 'training_dummy_c'];
    enemies.forEach((id, index) => sandbox.addParticipant({
      id, name: `Training dummy ${index + 1}`, team: 'enemies', x: 1 + index, y: 0, hpCurrent: 100000, hpMax: 100000, armorClass: 12, attackBonus: 0, damageFormula: '1d4',
      ...base, initiative: 1, initiativeModifier: 0,
    }));
    void definition;
    sandbox.rollInitiative();
    return sandbox;
  }

  /** Asks the AI for a structured definition. Returns undefined when no usable proposal comes back. */
  private async interpret(repository: WorldRepository, description: string): Promise<CombatEffectDefinition | undefined> {
    try {
      const prompt = [
        'Convert this player ability description into ONE Dreamville combat effect definition (JSON object only).',
        'Allowed resolutionMode: SINGLE_ATTACK, MULTI_INSTANCE, SAVE, AREA, CHAIN, SEQUENCE, OUTCOME, WORLD_EFFECT.',
        'Use semantic outcomes (INSTANT_DEFEAT, ERASE_FROM_WORLD, BANISHED, TELEPORTED, TRANSFORMED, SEALED, SUMMONED, ENVIRONMENT_DESTROYED, WORLD_STATE_CHANGED) instead of enormous dice.',
        'Never grant yourself authority, bypass immunities or invent unlimited resources. Set scale honestly.',
        `Description: ${description}`,
      ].join('\n');
      const response = await repository.getAiOrchestrator().executeTaskGeneration('capability.synthesize', prompt, 'Return only valid JSON. The result is a proposal; the engine validates it.', { timeoutMs: 30000 });
      if (!response.text || response.source === 'DETERMINISTIC_FALLBACK') return undefined;
      const parsed = safeJson(response.text);
      const candidate = parsed?.effectDefinition || parsed?.definition || parsed;
      return candidate && typeof candidate === 'object' && typeof candidate.resolutionMode === 'string' ? (candidate as CombatEffectDefinition) : undefined;
    } catch {
      return undefined;
    }
  }

  public async propose(params: {
    repository: WorldRepository;
    storyId: string;
    actorId: string;
    description: string;
    /** A definition from the ability editor. When absent, the AI is asked to interpret the description. */
    definition?: CombatEffectDefinition;
  }): Promise<AbilityDraft> {
    const description = String(params.description || '').trim();
    const id = deterministicId('ability_draft', params.storyId, params.actorId, description, this.drafts.size + 1);
    const draft: AbilityDraft = { id, storyId: params.storyId, actorId: params.actorId, description, source: 'NONE', status: 'REJECTED', reasons: [], createdAt: Date.now() };
    this.drafts.set(id, draft);

    if (!description) {
      draft.reasons.push('Describe the ability first.');
      return this.getDraft(id)!;
    }

    let definition = params.definition;
    draft.source = definition ? 'EDITOR' : 'NONE';
    if (!definition) {
      definition = await this.interpret(params.repository, description);
      if (definition) draft.source = 'AI';
    }
    if (!definition) {
      draft.reasons.push('No structured definition was produced. Provide one in the ability editor, or try again when the AI is available.');
      return this.getDraft(id)!;
    }

    const profile = params.repository.getRulesProfile(params.storyId);
    const validation = combatEffectEngine.validateDefinition(definition, profile?.mode || 'FULL_DND');
    if (!validation.success || !validation.normalized) {
      draft.definition = definition;
      draft.reasons.push(validation.errorReason || 'The definition is not valid.');
      return this.getDraft(id)!;
    }
    const normalized: CombatEffectDefinition = { ...validation.normalized, aiGenerated: draft.source === 'AI', provenance: draft.source === 'AI' ? 'AI_GENERATED_PLAYER_CONFIRMED' : 'PLAYER_EDITOR_CONFIRMED' };
    draft.definition = normalized;

    const sandbox = this.sandbox(params.repository, params.storyId, params.actorId, normalized);
    const targetIds = ['training_dummy_a', 'training_dummy_b', 'training_dummy_c'];
    draft.diagnostics = combatSimulationEngine.diagnose({ engine: sandbox, actorId: params.actorId, targetIds, definition: normalized });
    if (!draft.diagnostics.simulatable) {
      draft.reasons.push(...draft.diagnostics.reasons);
      return this.getDraft(id)!;
    }

    const batch = combatSimulationEngine.batchSimulate({ engine: sandbox, actorId: params.actorId, targetIds, definition: normalized, seeds: PREVIEW_SEEDS });
    const firstWorld = batch.runs.find((run) => run.result?.worldEffectPreview)?.result?.worldEffectPreview;
    draft.preview = {
      runs: batch.runs.length,
      successfulRuns: batch.summary.successfulRuns,
      averageDamage: batch.summary.averageDamage,
      minDamage: batch.summary.minDamage,
      maxDamage: batch.summary.maxDamage,
      abstraction: firstWorld?.abstraction || 'TACTICAL',
      summary: firstWorld
        ? `${normalized.name} would resolve at ${firstWorld.scale} scale as a world event, without mutating the live world.`
        : `${normalized.name}: ${batch.summary.successfulRuns} of ${batch.runs.length} simulated runs resolved; damage ${batch.summary.minDamage} to ${batch.summary.maxDamage}.`,
    };
    if (batch.summary.successfulRuns === 0) {
      draft.reasons.push(batch.runs.find((run) => run.errorReason)?.errorReason || 'The ability did not resolve in any simulated run.');
      return this.getDraft(id)!;
    }
    draft.status = 'READY_FOR_CONFIRMATION';
    return this.getDraft(id)!;
  }

  /** Registers and acquires the ability. Only an approved draft, and only with an explicit player confirmation. */
  public confirm(params: { repository: WorldRepository; draftId: string; playerConfirmed: boolean }): { success: boolean; errorReason?: string; draft?: AbilityDraft } {
    const draft = this.drafts.get(params.draftId);
    if (!draft) return { success: false, errorReason: 'Unknown ability draft.' };
    if (params.playerConfirmed !== true) return { success: false, errorReason: 'The player has to confirm the ability.', draft: this.getDraft(draft.id) };
    if (draft.status !== 'READY_FOR_CONFIRMATION' || !draft.definition) return { success: false, errorReason: 'Only a draft that passed validation and simulation can be confirmed.', draft: this.getDraft(draft.id) };

    const capabilityEngine = params.repository.getCapabilityEngine(draft.storyId);
    const definition = draft.definition;
    const capability: CapabilityDefinition = {
      id: `player_ability_${draft.id}`,
      name: definition.name,
      category: 'Combat',
      activationMode: 'immediate',
      powerTier: ['PERSON', 'GROUP', 'ENCOUNTER'].includes(definition.scale) ? 'Moderate' : definition.scale === 'COSMIC' || definition.scale === 'PLANET' ? 'WorldScale' : 'Major',
      baseEnergyCost: 0,
      baseStrainCost: 0,
      minVesselCapacityRequired: 0,
      description: draft.description,
      provenance: 'PLAYER_CONFIRMED_DRAFT',
      effectDefinition: definition,
    } as CapabilityDefinition;
    try {
      capabilityEngine.registerCapability(capability);
      capabilityEngine.acquireSkill(draft.actorId, capability.id);
    } catch (error: any) {
      return { success: false, errorReason: error?.message || 'The ability could not be acquired.', draft: this.getDraft(draft.id) };
    }
    draft.status = 'CONFIRMED';
    draft.capabilityId = capability.id;
    return { success: true, draft: this.getDraft(draft.id) };
  }

  public discard(draftId: string): boolean {
    const draft = this.drafts.get(draftId);
    if (!draft || draft.status === 'CONFIRMED') return false;
    draft.status = 'DISCARDED';
    return true;
  }
}

export const abilityDraftService = new AbilityDraftService();
