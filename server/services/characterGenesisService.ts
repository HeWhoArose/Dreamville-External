import { deterministicId } from '../domain/deterministicRng';
import { worldRepository } from '../repositories/worldRepository';
import { narrativeProfileEngine } from '../domain/narrativeProfileEngine';
import {
  CharacterGenesisDraft,
  ConfirmedCharacter,
  CharacterExtractionRequest,
  CustomCapabilityProposalRequest,
  CustomFeatProposalRequest,
  CustomAttributeProposalRequest,
  CustomSkillProposalRequest,
  CustomEquipmentProposalRequest,
  CapabilityDefinition,
  GeneratedTechnique,
  CharacterFeat,
  CharacterSkill,
  CharacterStatDefinition,
  CharacterCoreStats,
  StartingEquipmentConfig,
  StartingEquipmentItem,
  StartingLocationConfig,
  StartingSituationConfig,
  CharacterPortraitAsset,
  CharacterProvenanceSource,
  CharacterEffect,
  CharacterStoryMode,
  WorldTemplate,
  CharacterConditionInstance,
  CharacterStartingConditionState,
  CharacterProgressionCustomModule,
  CombatEffectDefinition,
} from '../../src/types';
import { CharacterProgressionEngine } from '../domain/characterProgressionEngine';
import { normalizeDiceFormula } from '../../src/data/rulesDice';

export class CharacterGenesisAiUnavailableError extends Error {
  public readonly code = 'AI_UNAVAILABLE';
  public readonly requiresDeterministicConfirmation = true;

  constructor(message: string) {
    super(message);
    this.name = 'CharacterGenesisAiUnavailableError';
  }
}

export class CharacterGenesisService {
  /**
   * Extracts a structured CharacterGenesisDraft from a natural language concept,
   * respecting world template constraints and preserving any user-edited fields.
   */
  public async extractCharacterDraft(
    input: CharacterExtractionRequest,
    worldTemplate: WorldTemplate
  ): Promise<CharacterGenesisDraft> {
    const concept = input.naturalLanguageConcept || '';
    const worldId = worldTemplate?.worldId || input.worldId || 'unknown_world';
    const worldVersion = worldTemplate?.worldManifestVersion ?? 1;
    const existingDraft = input.existingDraft;
    const userEditedFields = new Set([
      ...(input.userEditedFields || []),
      ...((existingDraft as any)?.fieldLocks || []),
    ]);
    const narrativeResolution = narrativeProfileEngine.resolve({
      mode: input.narrativeRole,
      narrativeProfile: (existingDraft as any)?.narrativeProfile,
      fallbackMode:
        (existingDraft as any)?.storyMode ||
        worldTemplate?.storyMode ||
        worldTemplate?.narrativeProfile?.mode ||
        'PROTAGONIST',
      source: 'WORLD',
    });
    const narrativeRole: CharacterStoryMode = narrativeResolution.profile.mode;
    const narrativeProfile = narrativeResolution.profile;
    const hasNarrativeSelection = Boolean(
      input.narrativeRole ||
      (existingDraft as any)?.storyMode ||
      (existingDraft as any)?.narrativeProfile?.mode ||
      worldTemplate?.storyMode ||
      worldTemplate?.narrativeProfile?.mode
    );

    const narrativeRoleGuidance: Record<CharacterStoryMode, string> = {
      PROTAGONIST:
        'PROTAGONIST: the player character is the central viewpoint and primary driver of the campaign. The world, major conflicts, opening situation, and narrative opportunities should meaningfully center on this character.',
      SIDE_CHARACTER:
        'SIDE_CHARACTER: the player character exists inside a larger story rather than being its central hero. Major canonical protagonists, factions, and conflicts may continue independently. The character has agency and personal goals, but the main plot does not need to revolve around them.',
      FREE_ROAM:
        'FREE_ROAM: the player character is an autonomous participant in an open-ended sandbox. Do not force a predetermined hero arc. Give the character a coherent reason to exist in the world while leaving long-term direction, alliances, exploration, occupations, and conflicts open to player choice.',
    };

    const draftId = existingDraft?.draftId || `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    let extracted: any = null;
    const prompt = `You are the canonical Character Genesis extraction engine for a narrative RPG.

The player's natural-language concept is authoritative. Interpret it faithfully and transform it into a complete editable structured character dossier.

Do NOT normalize unusual concepts into generic fantasy archetypes.
Do NOT replace player intent with world defaults.
The world provides context and constraints, but the PLAYER CONCEPT defines who the character is.

WORLD CONTEXT:
Title: ${worldTemplate?.title || 'Unknown World'}
Genre: ${worldTemplate?.genreTags?.join(', ') || 'Unknown'}
Tone: ${worldTemplate?.toneTags?.join(', ') || 'Unknown'}
Setting: ${worldTemplate?.setting || 'Unknown'}
Era: ${worldTemplate?.defaultEra || worldTemplate?.era || 'Current Era'}
World Rules: ${JSON.stringify(worldTemplate?.worldRules || worldTemplate?.ruleConstraints || [])}
Available Locations: ${JSON.stringify(
      (worldTemplate?.geography?.nodes || []).map((n: any) => ({
        id: n.id,
        name: n.name,
        region: n.region,
        description: n.description,
      }))
    )}

PLAYER CHARACTER CONCEPT:
"${concept}"

NARRATIVE ROLE MODE:
${input.narrativeRole || (existingDraft as any)?.storyMode || worldTemplate?.storyMode || worldTemplate?.narrativeProfile?.mode || 'NOT_SELECTED_YET'}

CANONICAL NARRATIVE PROFILE:
${JSON.stringify(narrativeProfile)}

NARRATIVE ROLE SEMANTICS:
${hasNarrativeSelection
        ? narrativeRoleGuidance[narrativeRole]
        : 'The player will choose the narrative role in the Character Dossier step. Do not assume Protagonist, Side Character, or Free Roam semantics during initial concept extraction.'}

Apply these semantics to the character's background, motivations, relationships, starting situation, and overall narrative positioning only when a narrative role has already been selected. The three modes are gameplay/narrative positioning, not in-world professions.

Return ONLY one JSON object matching this contract:

{
  "identity": {
    "name": string,
    "species": string,
    "age": number | string,
    "gender": string
  },
  "appearance": {
    "physicalDescription": string,
    "distinguishingTraits": [string]
  },
  "personality": {
    "traits": [string],
    "temperament": string,
    "values": [string]
  },
  "background": {
    "history": string,
    "upbringing": string,
    "importantEvents": [string]
  },
  "role": {
    "archetype": string,
    "profession": string,
    "role": string
  },
  "motivations": {
    "goals": [string],
    "fears": [string],
    "desires": [string]
  },
  "relationships": {
    "allies": [string],
    "rivals": [string],
    "family": [string],
    "factions": [string]
  },
  "condition": {
    "injuries": [string],
    "curses": [string],
    "forms": [string],
    "specialStates": [string]
  },
  "conditionState": {
    "customDefinitions": [
      {
        "id": string,
        "name": string,
        "description": string,
        "category": string,
        "alignment": "HARMFUL" | "BENEFICIAL" | "NEUTRAL" | "MIXED",
        "defaultSeverity": number,
        "defaultIntensity": number,
        "maxIntensity": number | null,
        "stackMode": "REPLACE" | "ADD" | "MAX" | "REFRESH",
        "defaultDurationSeconds": number | null,
        "tickUnit": "ACTION" | "TURN" | "ROUND" | "MINUTE" | "HOUR" | "DAY" | "WORLD_TIME" | null,
        "tickEvery": number | null,
        "damagePerTick": number | null,
        "damageType": string | null,
        "healingPerTick": number | null,
        "intensityDeltaPerTick": number | null,
        "tags": [string],
        "triggers": [object],
        "stages": [object]
      }
    ],
    "instances": [
      {
        "name": string,
        "definitionId": string,
        "alignment": "HARMFUL" | "BENEFICIAL" | "NEUTRAL" | "MIXED",
        "severity": number,
        "intensity": number,
        "maxIntensity": number | null,
        "source": string,
        "durationSeconds": number | null,
        "tickUnit": "ACTION" | "TURN" | "ROUND" | "MINUTE" | "HOUR" | "DAY" | "WORLD_TIME" | null,
        "tickEvery": number | null,
        "tags": [string],
        "affectedBodyRegions": [string]
      }
    ],
    "damageProfile": {
      "damageImmunities": [string],
      "damageResistances": [string],
      "damageVulnerabilities": [string]
    },
    "conditionProfile": {
      "conditionImmunities": [string],
      "conditionResistances": [string],
      "conditionVulnerabilities": [string]
    },
    "bodyRegions": [
      {
        "id": string,
        "label": string,
        "integrityCurrent": number,
        "integrityMax": number,
        "destroyed": boolean,
        "conditionIds": [string]
      }
    ]
  },
  "attributes": [
    {
      "name": string,
      "value": number,
      "baseValue": number,
      "min": number | null,
      "max": number | null,
      "description": string
    }
  ],
  "stats": [
    {
      "name": string,
      "value": number,
      "baseValue": number,
      "min": number | null,
      "max": number | null,
      "description": string
    }
  ],
  "traits": [string],
  "capabilities": [
    {
      "id": string,
      "name": string,
      "category": string,
      "activationMode": string,
      "powerTier": string,
      "baseEnergyCost": number,
      "baseStrainCost": number,
      "description": string,
      "effects": [
        {
          "type": string,
          "target": string,
          "scope": string,
          "modifier": number,
          "value": string | number | boolean,
          "condition": string,
          "description": string
        }
      ],
      "effectDefinition": {
        "resolutionMode": "SINGLE_ATTACK" | "MULTI_INSTANCE" | "SAVE" | "AREA" | "CHAIN" | "SEQUENCE" | "OUTCOME" | "WORLD_EFFECT",
        "scale": "PERSON" | "GROUP" | "ENCOUNTER" | "STRUCTURE" | "DISTRICT" | "CITY" | "REGION" | "CONTINENT" | "PLANET" | "COSMIC",
        "actionCost": "ACTION" | "BONUS_ACTION" | "REACTION" | "FREE",
        "executionMode": "AUTOMATIC" | "CHECK_REQUIRED" | "CONTEXTUAL" | "CONCENTRATION",
        "executionDifficultyClass": number | null,
        "executionFormula": string | null,
        "targetingMode": "SELF" | "ALLY" | "ENEMY" | "ONE_TARGET" | "MULTI_TARGET" | "PER_INSTANCE" | "ALL_IN_AREA" | "CHAIN" | "RANDOM_LEGAL_TARGET",
        "instanceCount": number | null,
        "instanceTargetIds": [string],
        "attackFormula": string | null,
        "saveFormula": string | null,
        "savingThrowAbility": string | null,
        "difficultyClass": number | null,
        "damageFormula": string | null,
        "damageType": string | null,
        "rangeCells": number | null,
        "requiresLineOfSight": boolean | null,
        "chainJumpRangeCells": number | null,
        "chainCount": number | null,
        "retargetPolicy": "NONE" | "RETARGET_ON_DEATH" | null,
        "forcedMovement": {
          "type": "PUSH" | "PULL",
          "distanceCells": number,
          "collision": {
            "damageFormula": string | null,
            "damageType": string | null,
            "objectDamageFormula": string | null,
            "creatureDamageFormula": string | null,
            "stopOnCollision": boolean | null,
            "maxCollisions": number | null
          } | null
        } | null,
        "outcome": string | null,
        "outcomeReason": string | null,
        "outcomePayload": object | null,
        "visualStyle": string | null
      },
      "storyCheckChallenges": [
        {
          "id": string,
          "label": string,
          "keywords": [string],
          "testType": "SAVING_THROW" | "ABILITY_CHECK",
          "savingThrowAbility": "Strength" | "Dexterity" | "Constitution" | "Intelligence" | "Wisdom" | "Charisma",
          "difficultyClass": number,
          "reason": string,
          "triggerReason": string,
          "onFailure": object,
          "onSuccess": object
        }
      ]
    }
  ],
  "generatedSkills": [
    {
      "id": string,
      "name": string,
      "description": string,
      "parentCapabilityName": string,
      "activationType": string,
      "energyCost": number,
      "cooldownTurns": number,
      "range": string,
      "checkFormula": string,
      "damageFormula": string | null
    }
  ],
  "feats": [
    {
      "id": string,
      "name": string,
      "description": string,
      "prerequisites": [string],
      "tags": [string],
      "effects": [
        {
          "type": string,
          "target": string,
          "scope": string,
          "modifier": number,
          "value": string | number | boolean,
          "condition": string,
          "description": string
        }
      ]
    }
  ],
  "titles": [
    {
      "id": string,
      "name": string,
      "description": string,
      "effects": [
        {
          "type": string,
          "target": string,
          "scope": string,
          "modifier": number,
          "value": string | number | boolean,
          "condition": string,
          "description": string
        }
      ]
    }
  ],
  "startingEquipment": {
    "weapons": [string],
    "armor": [string],
    "tools": [string],
    "consumables": [string],
    "inventory": [
      {
        "name": string,
        "category": string,
        "description": string,
        "quantity": number,
        "isEquipped": boolean,
        "slot": string,
        "rarity": string,
        "weightKg": number,
        "durability": number,
        "maxDurability": number,
        "properties": object
      }
    ]
  },
  "startingLocation": {
    "locationId": string,
    "name": string,
    "region": string,
    "description": string
  },
  "startingSituation": {
    "summary": string,
    "hook": string,
    "initialConditions": string,
    "whyHereNow": string
  },
  "portraitAsset": {
    "promptFallback": string,
    "emoji": string
  },
  "coreStats": {
    "level": number,
    "armorClass": number,
    "speed": number,
    "hitDice": string,
    "hpCurrent": number,
    "hpMax": number,
    "strength": number,
    "dexterity": number,
    "constitution": number,
    "intelligence": number,
    "wisdom": number,
    "charisma": number,
    "savingThrowProficiencies": ["Strength" | "Dexterity" | "Constitution" | "Intelligence" | "Wisdom" | "Charisma"]
  },
  "aiExtractionSummary": {
    "interpretation": string,
    "keyFacts": [string],
    "proposedHighlights": [string],
    "uncertainties": [string]
  }
}

Rules:
- Preserve any explicit names, origins, species, jobs, powers, affiliations, source-fiction references, transport/isekaied state, equipment, motivations and conditions from the player's concept.
- Treat mechanically meaningful current circumstances (imprisoned, poisoned, weak, starving, burning, transformed, restrained, hunted, etc.) as conditionState instances, not as prose-only flavor.
- Use customDefinitions when a condition has ongoing damage, healing, intensity growth/decay, body-region progression, self-damage, recovery, triggers, or terminal consequences.
- Self-inflicted mechanics are valid. A condition may damage, heal, transform, or progressively destroy the same character who carries it.
- Do not invent a generic Human/Scout identity merely to fill fields.
- Generated values may add coherent detail, but must remain faithful to the player's concept and world.
- If something is genuinely uncertain, put it in aiExtractionSummary.uncertainties instead of silently contradicting the player.`;

    let generationSource: 'AI_PRIMARY' | 'AI_FALLBACK' | 'DETERMINISTIC_FALLBACK' = 'DETERMINISTIC_FALLBACK';
    let generationFailureReason = '';
    let generationAttemptsTrail: any[] = [];
    let generationActiveModel = '';
    let generationActiveProvider = '';

    if (input.allowDeterministicFallback) {
      // This path is reached only after the player explicitly accepted the fallback prompt.
      extracted = this.proceduralExtraction(concept, worldTemplate);
      generationSource = 'DETERMINISTIC_FALLBACK';
      generationFailureReason =
        'Player explicitly chose deterministic character extraction after AI unavailability.';
    } else {
      // Use the canonical model orchestrator so Genesis respects configured task routing
      // and provider health. Deterministic extraction is deliberately NOT automatic.
      try {
        const orchestrator = worldRepository.getAiOrchestrator();
        const response = await orchestrator.executeTaskGeneration(
          'narrative.generate',
          prompt,
          'Return only the requested Character Genesis JSON. Treat the player concept as authoritative input; do not overwrite preserved user fields.',
          {
            timeoutMs: 20000,
            maxTokens: 4096,
            validateResponse: (text) => {
              const parsed = this.parseJsonFromAiResponse(text);
              if (!parsed || !this.isValidCharacterExtractionShape(parsed)) {
                return {
                  valid: false,
                  errorReason: 'Character Genesis response does not satisfy the required structured extraction schema.',
                };
              }
              return { valid: true };
            },
          }
        );

        generationAttemptsTrail = response.attemptsTrail || [];
        generationActiveModel = response.modelId;
        generationActiveProvider = response.providerId;

        // The orchestrator may report a deterministic emergency source. Treat that as
        // AI unavailability here so the player can explicitly consent before we use it.
        if (response.source === 'DETERMINISTIC_FALLBACK') {
          generationFailureReason =
            response.fallbackReason ||
            'AI providers did not return usable Character Genesis output.';
          const error: any = new Error(generationFailureReason);
          error.code = 'AI_UNAVAILABLE';
          error.requiresDeterministicConfirmation = true;
          error.attemptsTrail = generationAttemptsTrail;
          throw error;
        } else if (response.text) {
          const parsed = this.parseJsonFromAiResponse(response.text);
          if (parsed && this.isValidCharacterExtractionShape(parsed)) {
            extracted = parsed;
            generationSource = response.source;
            generationFailureReason = response.fallbackReason || '';
          } else {
            generationFailureReason = 'AI returned invalid or incomplete Character Genesis structure.';
            const error: any = new Error(generationFailureReason);
            error.code = 'AI_UNAVAILABLE';
            error.requiresDeterministicConfirmation = true;
            error.attemptsTrail = generationAttemptsTrail;
            throw error;
          }
        } else {
          generationFailureReason =
            response.fallbackReason ||
            'AI providers returned no usable Character Genesis text.';
          const error: any = new Error(generationFailureReason);
          error.code = 'AI_UNAVAILABLE';
          error.requiresDeterministicConfirmation = true;
          error.attemptsTrail = generationAttemptsTrail;
          throw error;
        }
      } catch (err: any) {
        if (err?.code === 'AI_UNAVAILABLE') {
          throw err;
        }
        generationFailureReason = err?.message || String(err);
        const error: any = new Error(generationFailureReason);
        error.code = 'AI_UNAVAILABLE';
        error.requiresDeterministicConfirmation = true;
        error.attemptsTrail = generationAttemptsTrail;
        throw error;
      }
    // Build canonical draft assembling all sections
    const generatedProvenance: CharacterProvenanceSource =
      generationSource === 'DETERMINISTIC_FALLBACK' ? 'DETERMINISTIC_FALLBACK' : 'AI_GENERATED';

    const provenance: Record<string, CharacterProvenanceSource> = {
      sourceDescription: 'PLAYER_INPUT',
      identity: userEditedFields.has('identity') || userEditedFields.has('identity.name') ? 'USER_EDITED' : generatedProvenance,
      appearance: userEditedFields.has('appearance') ? 'USER_EDITED' : generatedProvenance,
      personality: userEditedFields.has('personality') ? 'USER_EDITED' : generatedProvenance,
      background: userEditedFields.has('background') ? 'USER_EDITED' : generatedProvenance,
      role: userEditedFields.has('role') ? 'USER_EDITED' : generatedProvenance,
      motivations: userEditedFields.has('motivations') ? 'USER_EDITED' : generatedProvenance,
      relationships: userEditedFields.has('relationships') ? 'USER_EDITED' : generatedProvenance,
      condition: userEditedFields.has('condition') ? 'USER_EDITED' : generatedProvenance,
      capabilities: userEditedFields.has('capabilities') ? 'USER_EDITED' : generatedProvenance,
      generatedSkills: userEditedFields.has('generatedSkills') ? 'USER_EDITED' : generatedProvenance,
      startingEquipment: userEditedFields.has('startingEquipment') ? 'USER_EDITED' : generatedProvenance,
      startingLocation: userEditedFields.has('startingLocation') ? 'USER_EDITED' : 'WORLD_DERIVED',
      startingSituation: userEditedFields.has('startingSituation') ? 'USER_EDITED' : generatedProvenance,
      portraitAsset: userEditedFields.has('portraitAsset') ? 'USER_EDITED' : 'SYSTEM_DERIVED',
    };

    // Sanitize & link capabilities
    let capabilities: CapabilityDefinition[] = (
      userEditedFields.has('capabilities') && existingDraft?.capabilities
        ? existingDraft.capabilities
        : (extracted.capabilities || []).map((c: any, idx: number) => ({
            id: c.id || `cap_${draftId}_${idx + 1}`,
            name: c.name || `Ability ${idx + 1}`,
            category: c.category || 'Combat',
            activationMode: c.activationMode || 'immediate',
            powerTier: c.powerTier || 'Moderate',
            baseEnergyCost: Number(c.baseEnergyCost ?? 15),
            baseStrainCost: Number(c.baseStrainCost ?? 5),
            minVesselCapacityRequired: Number(c.minVesselCapacityRequired ?? 15),
            description: c.description || 'Special capability.',
            effects: this.mapCharacterEffects(c.effects, c.id || `cap_${draftId}_${idx + 1}`, generatedProvenance),
            storyCheckChallenges: Array.isArray(c.storyCheckChallenges) ? c.storyCheckChallenges : undefined,
            checkFormula: worldTemplate?.dndRulesMode === 'FULL_DND' || !worldTemplate?.dndRulesMode
              ? '1d20'
              : normalizeDiceFormula(c.checkFormula, '1d20'),
            damageFormula: typeof c.damageFormula === 'string' ? c.damageFormula : undefined,
            effectDefinition: (() => {
              const raw = c.effectDefinition && typeof c.effectDefinition === 'object' ? c.effectDefinition : {};
              const capId = c.id || `cap_${draftId}_${idx + 1}`;
              return {
                id: capId + '_effect',
                name: c.name || `Ability ${idx + 1}`,
                resolutionMode: ['SINGLE_ATTACK', 'MULTI_INSTANCE', 'SAVE', 'AREA', 'CHAIN', 'SEQUENCE', 'OUTCOME', 'WORLD_EFFECT'].includes(raw.resolutionMode) ? raw.resolutionMode : 'SINGLE_ATTACK',
                scale: ['PERSON', 'GROUP', 'ENCOUNTER', 'STRUCTURE', 'DISTRICT', 'CITY', 'REGION', 'CONTINENT', 'PLANET', 'COSMIC'].includes(raw.scale) ? raw.scale : (c.powerTier === 'WorldScale' ? 'CITY' : 'PERSON'),
                actionCost: ['ACTION', 'BONUS_ACTION', 'REACTION', 'FREE'].includes(raw.actionCost)
                  ? raw.actionCost
                  : (c.actionType === 'bonus_action' ? 'BONUS_ACTION' : c.actionType === 'reaction' ? 'REACTION' : c.actionType === 'free' ? 'FREE' : 'ACTION'),
                executionMode: ['AUTOMATIC', 'CHECK_REQUIRED', 'CONTEXTUAL', 'CONCENTRATION'].includes(raw.executionMode) ? raw.executionMode : 'AUTOMATIC',
                executionDifficultyClass: Number.isFinite(Number(raw.executionDifficultyClass)) ? Math.max(1, Math.trunc(Number(raw.executionDifficultyClass))) : undefined,
                executionFormula: worldTemplate?.dndRulesMode === 'FULL_DND' || !worldTemplate?.dndRulesMode ? '1d20' : normalizeDiceFormula(raw.executionFormula || c.checkFormula, '1d20'),
                executionFailureOutcome: raw.executionFailureOutcome,
                targetingMode: ['SELF', 'ALLY', 'ENEMY', 'ONE_TARGET', 'MULTI_TARGET', 'PER_INSTANCE', 'ALL_IN_AREA', 'CHAIN', 'RANDOM_LEGAL_TARGET'].includes(raw.targetingMode)
                  ? raw.targetingMode
                  : (c.targetType === 'self' ? 'SELF' : c.targetType === 'area_of_effect' ? 'ALL_IN_AREA' : c.targetType === 'all_enemies' ? 'ALL_IN_AREA' : 'ONE_TARGET'),
                instanceCount: raw.instanceCount == null ? undefined : Math.max(1, Math.min(50, Math.trunc(Number(raw.instanceCount) || 1))),
                instanceTargetIds: Array.isArray(raw.instanceTargetIds) ? raw.instanceTargetIds.map(String) : undefined,
                attackFormula: worldTemplate?.dndRulesMode === 'FULL_DND' || !worldTemplate?.dndRulesMode ? '1d20' : normalizeDiceFormula(raw.attackFormula || c.checkFormula, '1d20'),
                saveFormula: worldTemplate?.dndRulesMode === 'FULL_DND' || !worldTemplate?.dndRulesMode ? '1d20' : normalizeDiceFormula(raw.saveFormula || c.checkFormula, '1d20'),
                savingThrowAbility: typeof raw.savingThrowAbility === 'string' ? raw.savingThrowAbility : undefined,
                difficultyClass: Number.isFinite(Number(raw.difficultyClass)) ? Math.max(1, Math.trunc(Number(raw.difficultyClass))) : undefined,
                damageFormula: typeof raw.damageFormula === 'string' ? raw.damageFormula : (typeof c.damageFormula === 'string' ? c.damageFormula : undefined),
                damageType: typeof raw.damageType === 'string' ? raw.damageType : undefined,
                rangeCells: Number.isFinite(Number(raw.rangeCells)) ? Math.max(0, Number(raw.rangeCells)) : undefined,
                requiresLineOfSight: Boolean(raw.requiresLineOfSight),
                chainJumpRangeCells: Number.isFinite(Number(raw.chainJumpRangeCells)) ? Math.max(0, Number(raw.chainJumpRangeCells)) : undefined,
                chainCount: Number.isFinite(Number(raw.chainCount)) ? Math.max(1, Math.min(50, Math.trunc(Number(raw.chainCount)))) : undefined,
                retargetPolicy: raw.retargetPolicy === 'RETARGET_ON_DEATH' ? 'RETARGET_ON_DEATH' : 'NONE',
                forcedMovement: (() => {
                  const movement = raw.forcedMovement && typeof raw.forcedMovement === 'object'
                    ? raw.forcedMovement
                    : undefined;
                  if (!movement || !['PUSH', 'PULL'].includes(String(movement.type))) return undefined;
                  const collision = movement.collision && typeof movement.collision === 'object'
                    ? movement.collision
                    : undefined;
                  return {
                    type: String(movement.type) as 'PUSH' | 'PULL',
                    distanceCells: Math.max(0, Math.min(50, Math.trunc(Number(movement.distanceCells) || 0))),
                    collision: collision
                      ? {
                          damageFormula: typeof collision.damageFormula === 'string' ? collision.damageFormula : undefined,
                          damageType: typeof collision.damageType === 'string' ? collision.damageType : undefined,
                          objectDamageFormula: typeof collision.objectDamageFormula === 'string' ? collision.objectDamageFormula : undefined,
                          creatureDamageFormula: typeof collision.creatureDamageFormula === 'string' ? collision.creatureDamageFormula : undefined,
                          stopOnCollision: collision.stopOnCollision !== false,
                          maxCollisions: Math.max(1, Math.min(3, Math.trunc(Number(collision.maxCollisions ?? 1) || 1))),
                        }
                      : undefined,
                  };
                })(),
                outcome: raw.outcome,
                outcomeReason: typeof raw.outcomeReason === 'string' ? raw.outcomeReason : undefined,
                outcomePayload: raw.outcomePayload && typeof raw.outcomePayload === 'object' ? raw.outcomePayload : undefined,
                visualStyle: typeof raw.visualStyle === 'string' ? raw.visualStyle : undefined,
                provenance: generatedProvenance,
                aiGenerated: generatedProvenance !== 'DETERMINISTIC_FALLBACK',
              };
            })(),
            provenance: generatedProvenance,
          }))
    );

    if (capabilities.length === 0) {
      const defaultCapName = extracted.role?.archetype ? `${extracted.role.archetype} Stance` : 'Signature Technique';
      capabilities = [
        {
          id: `cap_${draftId}_1`,
          name: defaultCapName,
          category: 'Combat',
          activationMode: 'immediate',
          powerTier: 'Moderate',
          baseEnergyCost: 15,
          baseStrainCost: 5,
          minVesselCapacityRequired: 15,
          description: `Primary signature capability derived from ${extracted.identity?.name || concept}.`,
          effects: [],
          checkFormula: '1d20',
          damageFormula: '1d4',
          effectDefinition: {
            id: `cap_${draftId}_1_effect`,
            name: defaultCapName,
            resolutionMode: 'SINGLE_ATTACK',
            scale: 'PERSON',
            actionCost: 'ACTION',
            targetingMode: 'ONE_TARGET',
            attackFormula: '1d20',
            damageFormula: '1d4',
            damageType: 'force',
            provenance: generatedProvenance,
            aiGenerated: generatedProvenance !== 'DETERMINISTIC_FALLBACK',
          },
          provenance: generatedProvenance,
        },
      ];
    }

    // Link skills/techniques to their parent capabilities
    const generatedSkills: GeneratedTechnique[] = (
      userEditedFields.has('generatedSkills') && existingDraft?.generatedSkills
        ? existingDraft.generatedSkills
        : (extracted.generatedSkills || []).map((s: any, idx: number) => {
            const matchedCap =
              capabilities.find(
                (c) => c.name.toLowerCase() === (s.parentCapabilityName || '').toLowerCase()
              ) || capabilities[0];

            return {
              id: s.id || `skill_${draftId}_${idx + 1}`,
              name: s.name || `Technique ${idx + 1}`,
              description: s.description || 'Focused execution technique.',
              parentCapabilityId: matchedCap ? matchedCap.id : (capabilities[0]?.id || `cap_root`),
              parentCapabilityName: matchedCap ? matchedCap.name : (capabilities[0]?.name || 'Innate'),
              activationType: s.activationType || 'Active Action',
              energyCost: Number(s.energyCost ?? 10),
              cooldownTurns: Number(s.cooldownTurns ?? 1),
              range: s.range || 'Melee',
              provenance: generatedProvenance as CharacterProvenanceSource,
            };
          })
    );

    // Starting location resolution from worldTemplate geography
    let startingLocation: StartingLocationConfig;
    if (userEditedFields.has('startingLocation') && existingDraft?.startingLocation) {
      startingLocation = existingDraft.startingLocation;
    } else {
      const worldNodes = worldTemplate?.geography?.nodes || [];
      const extractedLocId = extracted.startingLocation?.locationId;
      const matchedNode =
        worldNodes.find((n: any) => n.id === extractedLocId || n.name?.toLowerCase() === extracted.startingLocation?.name?.toLowerCase()) ||
        worldNodes[0];

      if (matchedNode) {
        startingLocation = {
          locationId: matchedNode.id,
          name: matchedNode.name,
          region: matchedNode.region || worldTemplate?.setting || 'Heartland',
          description: matchedNode.description || 'Initial waypoint.',
          coordinates: matchedNode.coordinates || { x: 0, y: 0 },
        };
      } else {
        startingLocation = {
          locationId: extracted.startingLocation?.locationId || 'loc_start_1',
          name: extracted.startingLocation?.name || worldTemplate?.setting || 'Starting Enclave',
          region: extracted.startingLocation?.region || 'Frontier',
          description: 'Initial starting location.',
        };
      }
    }

    // Equipment processing
    let startingEquipment: StartingEquipmentConfig;
    if (userEditedFields.has('startingEquipment') && existingDraft?.startingEquipment) {
      startingEquipment = existingDraft.startingEquipment;
    } else {
      const rawEq = extracted.startingEquipment || {};
      const weapons = Array.isArray(rawEq.weapons) ? rawEq.weapons.map(String) : ['Iron Longsword'];
      const armor = Array.isArray(rawEq.armor) ? rawEq.armor.map(String) : ['Leather Cuirass'];
      const tools = Array.isArray(rawEq.tools) ? rawEq.tools.map(String) : ['Torch', 'Lockpicks'];
      const consumables = Array.isArray(rawEq.consumables) ? rawEq.consumables.map(String) : ['Bread Rations (x3)', 'Healing Salve'];
      const aiInventory = Array.isArray(rawEq.inventory) ? rawEq.inventory : [];

      const equipped: StartingEquipmentItem[] = [
        ...weapons.slice(0, 1).map((w: string, i: number) => ({
          id: `eq_w_${i}`,
          name: w,
          category: 'Weapon',
          slot: 'mainHand',
          isEquipped: true,
          quantity: 1,
          provenance: generatedProvenance as CharacterProvenanceSource,
        })),
        ...armor.slice(0, 1).map((a: string, i: number) => ({
          id: `eq_a_${i}`,
          name: a,
          category: 'Armor',
          slot: 'body',
          isEquipped: true,
          quantity: 1,
          provenance: generatedProvenance as CharacterProvenanceSource,
        })),
      ];

      const inventory: StartingEquipmentItem[] = [
        ...aiInventory.map((item: any, i: number) => ({
          id: item.id || `inv_ai_${i}`,
          name: String(item.name || `Item ${i + 1}`),
          category: String(item.category || 'Miscellaneous'),
          description: item.description ? String(item.description) : undefined,
          slot: item.slot ? String(item.slot) : undefined,
          isEquipped: Boolean(item.isEquipped),
          quantity: Number(item.quantity ?? 1),
          rarity: item.rarity ? String(item.rarity) : undefined,
          weightKg: typeof item.weightKg === 'number' ? item.weightKg : undefined,
          durability: typeof item.durability === 'number' ? item.durability : undefined,
          maxDurability: typeof item.maxDurability === 'number' ? item.maxDurability : undefined,
          properties: item.properties && typeof item.properties === 'object' ? item.properties : undefined,
          provenance: generatedProvenance as CharacterProvenanceSource,
          sourceUserPrompt: concept,
        })),
        ...weapons.slice(1).map((w: string, i: number) => ({
          id: `inv_w_${i}`,
          name: w,
          category: 'Weapon',
          isEquipped: false,
          quantity: 1,
          provenance: generatedProvenance as CharacterProvenanceSource,
        })),
        ...armor.slice(1).map((a: string, i: number) => ({
          id: `inv_a_${i}`,
          name: a,
          category: 'Armor',
          isEquipped: false,
          quantity: 1,
          provenance: generatedProvenance as CharacterProvenanceSource,
        })),
        ...tools.map((t: string, i: number) => ({
          id: `inv_t_${i}`,
          name: t,
          category: 'Tool',
          isEquipped: false,
          quantity: 1,
          provenance: generatedProvenance as CharacterProvenanceSource,
        })),
        ...consumables.map((c: string, i: number) => ({
          id: `inv_c_${i}`,
          name: c,
          category: 'Food',
          isEquipped: false,
          quantity: 1,
          provenance: generatedProvenance as CharacterProvenanceSource,
        })),
      ];

      startingEquipment = {
        equipped,
        inventory,
        weapons,
        armor,
        tools,
        consumables,
      };
    }

    // Merge identity, preserving user edits if specified
    const identity = userEditedFields.has('identity') && existingDraft?.identity
      ? existingDraft.identity
      : {
          name: extracted.identity?.name || 'Vaelen Darkthorn',
          species: extracted.identity?.species || 'Human',
          age: extracted.identity?.age || 28,
          gender: extracted.identity?.gender || 'Unknown',
        };

    const appearance = userEditedFields.has('appearance') && existingDraft?.appearance
      ? existingDraft.appearance
      : {
          physicalDescription: extracted.appearance?.physicalDescription || 'Weathered traveler with vigilant eyes.',
          distinguishingTraits: extracted.appearance?.distinguishingTraits || ['Faint scar across cheek', 'Silver-threaded traveling cloak'],
        };

    const personality = userEditedFields.has('personality') && existingDraft?.personality
      ? existingDraft.personality
      : {
          traits: extracted.personality?.traits || ['Observant', 'Pragmatic', 'Resilient'],
          temperament: extracted.personality?.temperament || 'Measured and calculating',
          values: extracted.personality?.values || ['Self-reliance', 'Discretion'],
        };

    const background = userEditedFields.has('background') && existingDraft?.background
      ? existingDraft.background
      : {
          history: extracted.background?.history || 'Spent early years wandering the borderlands before taking up arms.',
          upbringing: extracted.background?.upbringing || 'Frontier outpost settlement',
          importantEvents: extracted.background?.importantEvents || ['Survived the Winter Siege', 'Earned fellowship rites'],
        };

    const role = userEditedFields.has('role') && existingDraft?.role
      ? existingDraft.role
      : {
          archetype: extracted.role?.archetype || 'Wanderer / Specialist',
          profession: extracted.role?.profession || 'Ranger',
          role:
            narrativeRole === 'PROTAGONIST'
              ? 'Protagonist'
              : narrativeRole === 'SIDE_CHARACTER'
              ? 'Side Character'
              : 'Free Roam',
        };

    const motivations = userEditedFields.has('motivations') && existingDraft?.motivations
      ? existingDraft.motivations
      : {
          goals: extracted.motivations?.goals || ['Uncover truth behind the frontier anomalies'],
          fears: extracted.motivations?.fears || ['Loss of autonomy'],
          desires: extracted.motivations?.desires || ['Mastery over latent abilities'],
        };

    const relationships = userEditedFields.has('relationships') && existingDraft?.relationships
      ? existingDraft.relationships
      : {
          allies: extracted.relationships?.allies || ['Captain Danor'],
          rivals: extracted.relationships?.rivals || ['The Whispering Guild'],
          family: extracted.relationships?.family || ['Estranged elder sibling'],
          factions: extracted.relationships?.factions || ['Frontier Watch'],
        };

    const condition = userEditedFields.has('condition') && existingDraft?.condition
      ? existingDraft.condition
      : {
          injuries: extracted.condition?.injuries || [],
          curses: extracted.condition?.curses || [],
          forms: extracted.condition?.forms || ['Standard Physical Form'],
          specialStates: extracted.condition?.specialStates || ['Well-rested'],
        };

    const normalizeBodyRegions = (regions: any[]): any[] => {
      const source = Array.isArray(regions) ? regions : [];
      return source.map((region: any) => ({
        id: String(region?.id || 'WHOLE_BODY'),
        label: String(region?.label || region?.id || 'Body'),
        integrityCurrent: Math.max(0, Number(region?.integrityCurrent ?? 100)),
        integrityMax: Math.max(1, Number(region?.integrityMax ?? 100)),
        destroyed: Boolean(region?.destroyed || Number(region?.integrityCurrent ?? 100) <= 0),
        conditionIds: Array.isArray(region?.conditionIds) ? region.conditionIds.map(String) : [],
      }));
    };

    const legacyConditionNames = [
      ...condition.injuries.map(String),
      ...condition.curses.map(String),
      ...condition.specialStates.map(String),
    ].filter(Boolean);

    const rawConditionState = userEditedFields.has('conditionState') && existingDraft?.conditionState
      ? existingDraft.conditionState
      : extracted.conditionState;

    const conditionInstances: CharacterConditionInstance[] = Array.isArray(rawConditionState?.instances)
      ? rawConditionState.instances.map((instance: any, index: number) => ({
          id: String(instance?.id || `condition_${draftId}_${index + 1}`),
          definitionId: String(instance?.definitionId || String(instance?.name || 'custom_condition').toLowerCase().replace(/[^a-z0-9]+/g, '_')),
          name: String(instance?.name || `Condition ${index + 1}`),
          alignment: ['HARMFUL','BENEFICIAL','NEUTRAL','MIXED'].includes(instance?.alignment) ? instance.alignment : 'HARMFUL',
          severity: Math.max(0, Number(instance?.severity ?? 1)),
          intensity: Math.max(0, Number(instance?.intensity ?? 1)),
          maxIntensity: instance?.maxIntensity == null ? undefined : Math.max(1, Number(instance.maxIntensity)),
          source: instance?.source ? String(instance.source) : undefined,
          appliedAtSeconds: Math.max(0, Number(instance?.appliedAtSeconds ?? 0)),
          durationSeconds: instance?.durationSeconds == null ? null : Math.max(0, Number(instance.durationSeconds)),
          remainingDurationSeconds: instance?.remainingDurationSeconds == null ? null : Math.max(0, Number(instance.remainingDurationSeconds)),
          tickUnit: instance?.tickUnit || undefined,
          tickEvery: instance?.tickEvery == null ? undefined : Math.max(1, Number(instance.tickEvery)),
          nextTickAtSeconds: instance?.nextTickAtSeconds == null ? undefined : Math.max(0, Number(instance.nextTickAtSeconds)),
          stackCount: Math.max(1, Number(instance?.stackCount ?? 1)),
          stackMode: ['REPLACE','ADD','MAX','REFRESH'].includes(instance?.stackMode) ? instance.stackMode : 'REFRESH',
          tags: Array.isArray(instance?.tags) ? instance.tags.map(String) : [],
          affectedBodyRegions: Array.isArray(instance?.affectedBodyRegions) ? instance.affectedBodyRegions.map(String) : undefined,
          notes: instance?.notes ? String(instance.notes) : undefined,
        }))
      : legacyConditionNames.map((name: string, index: number) => ({
          id: `condition_${draftId}_legacy_${index + 1}`,
          definitionId: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          name,
          alignment: 'HARMFUL',
          severity: 1,
          intensity: 1,
          stackCount: 1,
          stackMode: 'REFRESH',
          appliedAtSeconds: 0,
          durationSeconds: null,
          remainingDurationSeconds: null,
          tags: ['legacy_condition'],
        }));

    const customDefinitions = Array.isArray(rawConditionState?.customDefinitions)
      ? rawConditionState.customDefinitions.map((definition: any) => ({
          id: String(definition?.id || '').trim(),
          name: String(definition?.name || '').trim(),
          description: String(definition?.description || ''),
          category: String(definition?.category || 'CUSTOM'),
          alignment: ['HARMFUL','BENEFICIAL','NEUTRAL','MIXED'].includes(definition?.alignment) ? definition.alignment : 'NEUTRAL',
          defaultSeverity: Math.max(0, Number(definition?.defaultSeverity ?? 1)),
          defaultIntensity: Math.max(0, Number(definition?.defaultIntensity ?? 1)),
          maxIntensity: definition?.maxIntensity == null ? undefined : Math.max(1, Number(definition.maxIntensity)),
          stackMode: ['REPLACE','ADD','MAX','REFRESH'].includes(definition?.stackMode) ? definition.stackMode : 'REFRESH',
          defaultDurationSeconds: definition?.defaultDurationSeconds == null ? null : Math.max(0, Number(definition.defaultDurationSeconds)),
          tickUnit: definition?.tickUnit || undefined,
          tickEvery: definition?.tickEvery == null ? undefined : Math.max(1, Number(definition.tickEvery)),
          tags: Array.isArray(definition?.tags) ? definition.tags.map(String) : [],
          conditionKeywords: Array.isArray(definition?.conditionKeywords) ? definition.conditionKeywords.map(String) : [],
          damagePerTick: definition?.damagePerTick == null ? undefined : Math.max(0, Number(definition.damagePerTick)),
          damageType: definition?.damageType ? String(definition.damageType) : undefined,
          healingPerTick: definition?.healingPerTick == null ? undefined : Math.max(0, Number(definition.healingPerTick)),
          intensityDeltaPerTick: definition?.intensityDeltaPerTick == null ? undefined : Number(definition.intensityDeltaPerTick),
          decayIntensityPerRestTick: definition?.decayIntensityPerRestTick == null ? undefined : Math.max(0, Number(definition.decayIntensityPerRestTick)),
          triggers: Array.isArray(definition?.triggers) ? definition.triggers : [],
          stages: Array.isArray(definition?.stages) ? definition.stages : [],
          bodyRegionDefaults: Array.isArray(definition?.bodyRegionDefaults) ? definition.bodyRegionDefaults.map(String) : [],
          blocksActions: Array.isArray(definition?.blocksActions) ? definition.blocksActions.map(String) : [],
          modifierEffects: Array.isArray(definition?.modifierEffects) ? definition.modifierEffects : [],
        })).filter((definition: any) => definition.id && definition.name)
      : [];

    const conditionState: CharacterStartingConditionState = {
      instances: conditionInstances,
      customDefinitions,
      damageProfile: {
        damageImmunities: Array.isArray(rawConditionState?.damageProfile?.damageImmunities)
          ? rawConditionState.damageProfile.damageImmunities.map(String)
          : [],
        damageResistances: Array.isArray(rawConditionState?.damageProfile?.damageResistances)
          ? rawConditionState.damageProfile.damageResistances.map(String)
          : [],
        damageVulnerabilities: Array.isArray(rawConditionState?.damageProfile?.damageVulnerabilities)
          ? rawConditionState.damageProfile.damageVulnerabilities.map(String)
          : [],
      },
      conditionProfile: {
        conditionImmunities: Array.isArray(rawConditionState?.conditionProfile?.conditionImmunities)
          ? rawConditionState.conditionProfile.conditionImmunities.map(String)
          : [],
        conditionResistances: Array.isArray(rawConditionState?.conditionProfile?.conditionResistances)
          ? rawConditionState.conditionProfile.conditionResistances.map(String)
          : [],
        conditionVulnerabilities: Array.isArray(rawConditionState?.conditionProfile?.conditionVulnerabilities)
          ? rawConditionState.conditionProfile.conditionVulnerabilities.map(String)
          : [],
      },
      bodyRegions: normalizeBodyRegions(rawConditionState?.bodyRegions),
    };

    const startingSituation: StartingSituationConfig = userEditedFields.has('startingSituation') && existingDraft?.startingSituation
      ? existingDraft.startingSituation
      : {
          summary: extracted.startingSituation?.summary || `Arriving under cover of dusk at ${startingLocation.name}.`,
          hook: extracted.startingSituation?.hook || 'An urgent summons arrived bearing an unsealed crest.',
          initialConditions: extracted.startingSituation?.initialConditions || 'Tension lingers in the air as guards inspect incoming travelers.',
          whyHereNow: extracted.startingSituation?.whyHereNow || 'Seeking contact with an informant regarding recent unrest.',
        };

    const portraitAsset: CharacterPortraitAsset = userEditedFields.has('portraitAsset') && existingDraft?.portraitAsset
      ? existingDraft.portraitAsset
      : {
          emoji: extracted.portraitAsset?.emoji || this.getEmojiForRole(role.profession || role.archetype),
          promptFallback:
            extracted.portraitAsset?.promptFallback ||
            `Digital portrait of ${identity.name}, ${identity.age} year old ${identity.species} ${role.profession}. ${appearance.physicalDescription}. Stylized oil painting, atmospheric lighting.`,
          isFallback: true,
          status: 'idle',
        };

    const toStat = (entry: any, idx: number, prefix: string) => ({
      id: entry?.id || prefix + '_' + draftId + '_' + (idx + 1),
      name: String(entry?.name || prefix + ' ' + (idx + 1)),
      value: typeof entry?.value === 'number' ? entry.value : 10,
      baseValue: typeof entry?.baseValue === 'number' ? entry.baseValue : (typeof entry?.value === 'number' ? entry.value : 10),
      description: entry?.description || '',
      provenance: generatedProvenance as CharacterProvenanceSource,
    });

    const attributes = userEditedFields.has('attributes') && Array.isArray(existingDraft?.attributes)
      ? existingDraft.attributes
      : (Array.isArray(extracted.attributes) ? extracted.attributes.map((entry: any, idx: number) => toStat(entry, idx, 'Attribute')) : []);

    const stats = userEditedFields.has('stats') && Array.isArray(existingDraft?.stats)
      ? existingDraft.stats
      : (Array.isArray(extracted.stats) ? extracted.stats.map((entry: any, idx: number) => toStat(entry, idx, 'Stat')) : []);

    const traits = userEditedFields.has('traits') && Array.isArray(existingDraft?.traits)
      ? existingDraft.traits
      : (Array.isArray(extracted.traits) ? extracted.traits.map(String) : (Array.isArray(extracted.personality?.traits) ? extracted.personality.traits.map(String) : []));

    const mapEffects = (effects: any, sourceId: string): any[] =>
      this.mapCharacterEffects(effects, sourceId, generatedProvenance);

    const feats = userEditedFields.has('feats') && Array.isArray(existingDraft?.feats)
      ? existingDraft.feats
      : (Array.isArray(extracted.feats) ? extracted.feats.map((feat: any, idx: number) => {
      const id = feat?.id || 'feat_' + draftId + '_' + (idx + 1);
      return { id, name: String(feat?.name || 'Feat ' + (idx + 1)), description: String(feat?.description || ''), effects: mapEffects(feat?.effects, id), prerequisites: Array.isArray(feat?.prerequisites) ? feat.prerequisites.map(String) : [], tags: Array.isArray(feat?.tags) ? feat.tags.map(String) : [], provenance: generatedProvenance as CharacterProvenanceSource, worldId };
    }) : []);

    const titles = userEditedFields.has('titles') && Array.isArray(existingDraft?.titles)
      ? existingDraft.titles
      : (Array.isArray(extracted.titles) ? extracted.titles.map((title: any, idx: number) => {
      const id = title?.id || 'title_' + draftId + '_' + (idx + 1);
      return { id, name: String(title?.name || 'Title ' + (idx + 1)), description: String(title?.description || ''), effects: mapEffects(title?.effects, id), provenance: generatedProvenance as CharacterProvenanceSource, worldId };
    }) : []);

    const aiExtractionSummary = userEditedFields.has('aiExtractionSummary') && existingDraft?.aiExtractionSummary
      ? {
          ...existingDraft.aiExtractionSummary,
          keyFacts: [...existingDraft.aiExtractionSummary.keyFacts],
          proposedHighlights: [...existingDraft.aiExtractionSummary.proposedHighlights],
          uncertainties: [...(existingDraft.aiExtractionSummary.uncertainties || [])],
          generationSource: existingDraft.aiExtractionSummary.generationSource,
          activeModel: generationActiveModel || (existingDraft.aiExtractionSummary as any)?.activeModel,
          activeProvider: generationActiveProvider || (existingDraft.aiExtractionSummary as any)?.activeProvider,
          fallbackReason: generationFailureReason || (existingDraft.aiExtractionSummary as any)?.fallbackReason,
          attemptsTrail: generationAttemptsTrail.length > 0 ? generationAttemptsTrail : (existingDraft.aiExtractionSummary as any)?.attemptsTrail,
        }
      : {
          interpretation:
            generationSource === 'DETERMINISTIC_FALLBACK'
              ? `AI extraction unavailable. Deterministic concept extraction preserved the player's input: ${concept}`
              : String(extracted.aiExtractionSummary?.interpretation || `Interpreted from the player's concept: ${concept}`),
          keyFacts: Array.isArray(extracted.aiExtractionSummary?.keyFacts)
            ? extracted.aiExtractionSummary.keyFacts.map(String)
            : [identity.name, identity.species, role.profession || role.archetype].filter(Boolean),
          proposedHighlights: Array.isArray(extracted.aiExtractionSummary?.proposedHighlights)
            ? extracted.aiExtractionSummary.proposedHighlights.map(String)
            : capabilities.map((cap) => cap.name),
          uncertainties: Array.isArray(extracted.aiExtractionSummary?.uncertainties)
            ? extracted.aiExtractionSummary.uncertainties.map(String)
            : [],
          generationSource,
          activeModel: generationActiveModel,
          activeProvider: generationActiveProvider,
          fallbackReason: generationFailureReason,
          attemptsTrail: generationAttemptsTrail,
        };

    const rawCore = extracted.coreStats || {};
    const clampAbility = (v: any) => Math.max(1, Math.min(20, Math.floor(Number(v) || 10)));
    const coreStats: CharacterCoreStats = userEditedFields.has('coreStats') && existingDraft?.coreStats
      ? existingDraft.coreStats
      : {
          level: Math.max(1, Math.min(30, Math.floor(Number(rawCore.level) || 1))),
          armorClass: Math.max(1, Math.min(50, Math.floor(Number(rawCore.armorClass) || 10))),
          speed: Math.max(0, Math.min(300, Math.floor(Number(rawCore.speed) || 30))),
          hitDice: String(rawCore.hitDice || '1d8').trim() || '1d8',
          hpCurrent: Math.max(1, Math.floor(Number(rawCore.hpCurrent) || Number(rawCore.hpMax) || 10)),
          hpMax: Math.max(1, Math.floor(Number(rawCore.hpMax) || 10)),
          strength: clampAbility(rawCore.strength),
          dexterity: clampAbility(rawCore.dexterity),
          constitution: clampAbility(rawCore.constitution),
          intelligence: clampAbility(rawCore.intelligence),
          wisdom: clampAbility(rawCore.wisdom),
          charisma: clampAbility(rawCore.charisma),
          savingThrowProficiencies: Array.isArray(rawCore.savingThrowProficiencies)
            ? rawCore.savingThrowProficiencies.filter((ability: any) =>
                ['Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma'].includes(ability)
              )
            : [],
        };

    const progression = userEditedFields.has('progression') && existingDraft?.progression
      ? {
          classId: existingDraft.progression.classId,
          subclassId: existingDraft.progression.subclassId,
          speciesId: existingDraft.progression.speciesId,
          featIds: [...(existingDraft.progression.featIds || [])],
          moduleIds: [...(existingDraft.progression.moduleIds || [])],
          customModules: [...(existingDraft.progression.customModules || [])],
        }
      : {
          classId: undefined,
          subclassId: undefined,
          speciesId: undefined,
          featIds: feats.map((feat: any) => feat.id),
          moduleIds: [],
          customModules: [],
        };

    const draft: CharacterGenesisDraft = {
      draftId,
      worldId,
      worldVersion,
      sourceDescription: concept || existingDraft?.sourceDescription || '',
      identity,
      appearance,
      personality,
      background,
      role,
      motivations,
      relationships,
      condition,
      conditionState,
      coreStats,
      attributes,
      stats,
      traits,
      capabilities,
      generatedSkills,
      feats,
      titles,
      startingEquipment,
      startingLocation,
      startingSituation,
      startingLocationMode: existingDraft?.startingLocationMode || 'AI_SUGGEST',
      startingSituationMode: existingDraft?.startingSituationMode || 'AI_SUGGEST',
      storyMode: narrativeRole,
      narrativeProfile,
      startingState: {
        healthCurrent: coreStats.hpCurrent,
        healthMax: coreStats.hpMax,
        energyCurrent: 100,
        energyMax: 100,
        fatigue: 0,
        stress: 0,
        conditions: [...new Set([
          ...conditionState.instances.map((instance: CharacterConditionInstance) => instance.name),
          ...condition.injuries.map(String),
          ...condition.curses.map(String),
          ...condition.specialStates.map(String),
        ])],
        activeEffects: [],
        reputations: {},
        relationshipModifiers: {},
        conditionState: conditionState,
      },
      portraitAsset,
      aiExtractionSummary,
      progression,
      provenance,
      fieldLocks: [...new Set([...(existingDraft?.fieldLocks || []), ...Array.from(userEditedFields)])],
      revision: 1,
      revisionHistory: [],
      validationState: {
        isValid: true,
        errors: [],
        warnings: generationFailureReason
          ? [`Generation note: ${generationSource === 'DETERMINISTIC_FALLBACK' ? 'AI extraction was unavailable or invalid; deterministic concept extraction was used.' : generationFailureReason}`]
          : [],
      },
      createdAt: existingDraft?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Run structural & world rule validation
    const validation = this.validateCharacterDraft(draft, worldTemplate);
    if (generationFailureReason) {
      validation.warnings = [
        ...validation.warnings,
        generationSource === 'DETERMINISTIC_FALLBACK'
          ? 'AI extraction was unavailable or invalid; deterministic concept extraction was used.'
          : `Character extraction used ${generationSource === 'AI_FALLBACK' ? 'an AI fallback provider' : 'the primary AI provider'}.`,
      ];
    }
    draft.validationState = validation;

    return draft;
  }

  /**
   * Synthesizes and proposes a structured Custom Capability based on natural language input.
   * Preserves original description as provenance and creates linked concrete techniques.
   */
  public async proposeCustomCapability(
    input: CustomCapabilityProposalRequest,
    worldTemplate: WorldTemplate
  ): Promise<CapabilityDefinition & { generatedSkills: GeneratedTechnique[] }> {
    const concept = input.capabilityConcept || 'Unique Ability';
    const capId = `cap_custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let proposal: any = null;

    const charCtxStr = input.characterContext
      ? `CHARACTER CONTEXT:\nProfession/Role: ${input.characterContext.role || 'N/A'}\nSpecies: ${input.characterContext.species || 'N/A'}\nBackground: ${input.characterContext.background || 'N/A'}\n`
      : '';

    const prompt = `You are a system designer for narrative RPG magic and combat systems.
Given this custom capability concept, character context, and world setting, generate a structured capability definition with 2 to 3 linked concrete techniques.

WORLD CONTEXT:
Title: ${worldTemplate?.title || 'Unknown World'}
Genre: ${worldTemplate?.genreTags?.join(', ') || 'Fantasy'}

${charCtxStr}CAPABILITY CONCEPT:
"${concept}"

OUTPUT STRICT JSON with this structure:
{
  "name": string,
  "category": "Combat" | "Magic" | "Movement" | "Domain" | "Perception" | "Biological" | "Social",
  "activationMode": "immediate" | "passive" | "reaction" | "charged" | "channelled" | "toggled",
  "powerTier": "Minor" | "Moderate" | "Major" | "WorldScale",
  "baseEnergyCost": number,
  "baseStrainCost": number,
  "description": string,
  "actionType": "action" | "bonus_action" | "reaction" | "free",
  "targetType": "single_target" | "self" | "area_of_effect" | "all_allies" | "all_enemies",
  "rangeScope": "melee" | "close" | "ranged" | "realm" | "global",
  "checkFormula": string,
  "damageFormula": string | null,
  "effectDefinition": {
    "resolutionMode": "SINGLE_ATTACK" | "MULTI_INSTANCE" | "SAVE" | "AREA" | "CHAIN" | "SEQUENCE" | "OUTCOME" | "WORLD_EFFECT",
    "scale": "PERSON" | "GROUP" | "ENCOUNTER" | "STRUCTURE" | "DISTRICT" | "CITY" | "REGION" | "CONTINENT" | "PLANET" | "COSMIC",
    "targetingMode": "ONE_TARGET" | "MULTI_TARGET" | "PER_INSTANCE" | "ALL_IN_AREA" | "CHAIN",
    "instanceCount": number | null,
    "attackFormula": string | null,
    "saveFormula": string | null,
    "savingThrowAbility": string | null,
    "difficultyClass": number | null,
    "damageFormula": string | null,
    "damageType": string | null,
    "outcome": "INSTANT_DEFEAT" | "ERASE_FROM_WORLD" | "DOWNED" | "BANISHED" | "TELEPORTED" | "TRANSFORMED" | "SEALED" | "SUMMONED" | "RESOURCE_GRANTED" | "RESOURCE_REMOVED" | "WORLD_STATE_CHANGED" | null,
    "outcomeReason": string | null
  },
  "techniques": [
    {
      "name": string,
      "description": string,
      "activationType": string,
      "energyCost": number,
      "cooldownTurns": number,
      "range": string
    }
  ]
}

IMPORTANT:
- Tailor the capability to the exact concept.
- FULL_DND: any capability check MUST use "1d20".
- HYBRID_DND: default to "1d20"; an explicitly authored capability may use a simple alternative such as "2d6" or "1d8".
- CUSTOM_HOMEBREW_DND: never silently apply D&D dice rules.
- damageFormula is optional and must be a simple dice formula when present.
- Use MULTI_INSTANCE when the concept explicitly contains multiple independent hits/projectiles/beams. Set instanceCount to the actual intended number and keep one action semantics.
- Use AREA for area effects; use SAVE when each target receives a saving throw.
- Use OUTCOME or WORLD_EFFECT for semantic extreme outcomes such as erasure or city-scale destruction instead of inventing absurdly large HP damage.
- Never use an animation or visual property to decide a mechanical result.`;

    let generatedProvenance: CharacterProvenanceSource = 'AI_GENERATED';
    try {
      const orchestrator = worldRepository.getAiOrchestrator();
      const response = await orchestrator.executeTaskGeneration(
        'narrative.generate',
        prompt,
        'Return only the requested structured custom capability JSON.'
      );
      if (response.text) {
        proposal = this.parseJsonFromAiResponse(response.text);
        if (response.source === 'DETERMINISTIC_FALLBACK') {
          generatedProvenance = 'DETERMINISTIC_FALLBACK';
        }
      }
    } catch (err) {
      console.warn('[CharacterGenesisService] Orchestrated custom capability proposal failed, using procedural fallback:', err);
    }

    if (!proposal || !proposal.name) {
      proposal = this.proceduralCustomCapability(concept);
      generatedProvenance = 'DETERMINISTIC_FALLBACK';
    }

    const rawEffect = proposal?.effectDefinition && typeof proposal.effectDefinition === 'object' ? proposal.effectDefinition : {};
    const capability = {
      id: capId,
      name: proposal.name || concept,
      category: proposal.category || 'Magic',
      activationMode: proposal.activationMode || 'immediate',
      powerTier: proposal.powerTier || 'Moderate',
      baseEnergyCost: Number(proposal.baseEnergyCost ?? 20),
      baseStrainCost: Number(proposal.baseStrainCost ?? 10),
      minVesselCapacityRequired: 15,
      description: proposal.description || `Specialized mastery of ${concept}.`,
      actionType: ['action', 'bonus_action', 'reaction', 'free'].includes(proposal?.actionType) ? proposal.actionType : 'action',
      targetType: ['single_target', 'self', 'area_of_effect', 'all_allies', 'all_enemies'].includes(proposal?.targetType) ? proposal.targetType : 'single_target',
      rangeScope: ['melee', 'close', 'ranged', 'realm', 'global'].includes(proposal?.rangeScope) ? proposal.rangeScope : 'close',
      provenance: generatedProvenance,
      sourceUserPrompt: concept,
      checkFormula: worldTemplate?.dndRulesMode === 'FULL_DND' || !worldTemplate?.dndRulesMode
        ? '1d20'
        : normalizeDiceFormula(proposal?.checkFormula, '1d20'),
      damageFormula: typeof proposal?.damageFormula === 'string' ? proposal.damageFormula : undefined,
      storyCheckChallenges: Array.isArray(proposal.storyCheckChallenges) ? proposal.storyCheckChallenges : undefined,
    };

    const effectDefinition: CombatEffectDefinition = {
      id: capId + '_effect',
      name: capability.name,
      resolutionMode: ['SINGLE_ATTACK', 'MULTI_INSTANCE', 'SAVE', 'AREA', 'CHAIN', 'SEQUENCE', 'OUTCOME', 'WORLD_EFFECT'].includes(rawEffect.resolutionMode)
        ? rawEffect.resolutionMode
        : 'SINGLE_ATTACK',
      scale: ['PERSON', 'GROUP', 'ENCOUNTER', 'STRUCTURE', 'DISTRICT', 'CITY', 'REGION', 'CONTINENT', 'PLANET', 'COSMIC'].includes(rawEffect.scale)
        ? rawEffect.scale
        : 'PERSON',
      actionCost: capability.actionType === 'bonus_action' ? 'BONUS_ACTION' : capability.actionType === 'reaction' ? 'REACTION' : capability.actionType === 'free' ? 'FREE' : 'ACTION',
      targetingMode: rawEffect.targetingMode || (capability.targetType === 'area_of_effect' ? 'ALL_IN_AREA' : 'ONE_TARGET'),
      instanceCount: rawEffect.instanceCount == null ? undefined : Math.max(1, Math.min(50, Math.trunc(Number(rawEffect.instanceCount) || 1))),
      attackFormula: worldTemplate?.dndRulesMode === 'FULL_DND' || !worldTemplate?.dndRulesMode
        ? '1d20'
        : normalizeDiceFormula(rawEffect.attackFormula || capability.checkFormula, '1d20'),
      saveFormula: worldTemplate?.dndRulesMode === 'FULL_DND' || !worldTemplate?.dndRulesMode
        ? '1d20'
        : normalizeDiceFormula(rawEffect.saveFormula || capability.checkFormula, '1d20'),
      savingThrowAbility: typeof rawEffect.savingThrowAbility === 'string' ? rawEffect.savingThrowAbility : undefined,
      difficultyClass: Number.isFinite(Number(rawEffect.difficultyClass)) ? Math.max(1, Math.trunc(Number(rawEffect.difficultyClass))) : undefined,
      damageFormula: typeof rawEffect.damageFormula === 'string' ? rawEffect.damageFormula : capability.damageFormula,
      damageType: typeof rawEffect.damageType === 'string' ? rawEffect.damageType : undefined,
      outcome: rawEffect.outcome,
      outcomeReason: typeof rawEffect.outcomeReason === 'string' ? rawEffect.outcomeReason : undefined,
      outcomePayload: rawEffect.outcomePayload && typeof rawEffect.outcomePayload === 'object' ? rawEffect.outcomePayload : undefined,
      provenance: 'CHARACTER_GENESIS',
      aiGenerated: generatedProvenance !== 'DETERMINISTIC_FALLBACK',
    };

    const generatedSkills: GeneratedTechnique[] = (proposal.techniques || []).map((t: any, idx: number) => ({
      id: `skill_${capId}_${idx + 1}`,
      name: t.name || `${capability.name} Strike`,
      description: t.description || `Focused application of ${capability.name}.`,
      parentCapabilityId: capId,
      parentCapabilityName: capability.name,
      activationType: t.activationType || 'Active Action',
      energyCost: Number(t.energyCost ?? 15),
      cooldownTurns: Number(t.cooldownTurns ?? 1),
      range: t.range || 'Close',
      checkFormula: worldTemplate?.dndRulesMode === 'FULL_DND' || !worldTemplate?.dndRulesMode
        ? '1d20'
        : normalizeDiceFormula(t.checkFormula || proposal?.checkFormula, '1d20'),
      damageFormula: typeof t.damageFormula === 'string' ? t.damageFormula : undefined,
      provenance: generatedProvenance as CharacterProvenanceSource,
    }));

    return {
      ...capability,
      effectDefinition,
      generatedSkills,
    };
  }

  /**
   * Infers a character's class, subclass, and species from the supplied context,
   * but only from modules that actually exist in the world's progression catalogue.
   */
  public async inferCharacterProgression(
    input: {
      worldId: string;
      concept?: string;
      background?: string;
      profession?: string;
      archetype?: string;
      species?: string;
      classId?: string;
      narrativeRole?: string;
    },
    worldTemplate: WorldTemplate
  ): Promise<{
    classId?: string;
    subclassId?: string;
    speciesId?: string;
    createdCustomModules?: CharacterProgressionCustomModule[];
    reasoning: string;
    provenance: CharacterProvenanceSource;
  }> {
    const engine = new CharacterProgressionEngine();
    const worldModules = Array.isArray((worldTemplate as any)?.characterProgressionModules)
      ? (worldTemplate as any).characterProgressionModules
      : [];
    if (worldModules.length) engine.registerModules(worldModules);

    const modules = engine.getAllModules()
      .filter((module) => ['CLASS', 'SUBCLASS', 'SPECIES'].includes(module.type))
      .map((module) => ({
        id: module.id,
        type: module.type,
        name: module.name,
        aliases: module.aliases || [],
        parentClassId: module.parentClassId,
        minLevel: module.minLevel,
      }));

    const context = [
      input.concept ? `CONCEPT: ${input.concept}` : '',
      input.background ? `BACKGROUND: ${input.background}` : '',
      input.profession ? `PROFESSION: ${input.profession}` : '',
      input.archetype ? `ARCHETYPE: ${input.archetype}` : '',
      input.species ? `SPECIES: ${input.species}` : '',
      input.classId ? `CURRENT CLASS: ${input.classId}` : '',
      input.narrativeRole ? `NARRATIVE ROLE: ${input.narrativeRole}` : '',
    ].filter(Boolean).join('\n');

    const prompt = `You are a progression-assignment and character systems assistant for an RPG story engine.

Analyze this character's concept, backstory, profession, archetype, and species:
1. If an existing module in the catalogue is a suitable match, return its ID in classId, subclassId, or speciesId.
2. If the character's bio/concept represents a custom or distinct class (e.g. "Knight", "Blood Hunter", "Death Knight", "Witch", "Gunslinger"), specialized subclass (e.g. "Dark Knight", "Shadowblade", "Pyromancer"), or distinct ancestry (e.g. "Undead", "Revenant", "Dhampir", "Celestial"), propose custom progression modules in customClass, customSubclass, and/or customSpecies with name and concept.

CHARACTER CONTEXT:
${context}

MODULE CATALOGUE:
${JSON.stringify(modules, null, 2)}

OUTPUT STRICT JSON:
{
  "classId": string | null,
  "subclassId": string | null,
  "speciesId": string | null,
  "customClass": { "name": string, "concept": string } | null,
  "customSubclass": { "name": string, "concept": string } | null,
  "customSpecies": { "name": string, "concept": string } | null,
  "reasoning": string
}`;

    let proposal: any = null;
    let provenance: CharacterProvenanceSource = 'AI_GENERATED';

    try {
      const response = await worldRepository.getAiOrchestrator().executeTaskGeneration(
        'narrative.generate',
        prompt,
        'Return only the requested progression selection JSON.'
      );
      if (response.text) {
        proposal = this.parseJsonFromAiResponse(response.text);
        if (response.source === 'DETERMINISTIC_FALLBACK') {
          provenance = 'DETERMINISTIC_FALLBACK';
        }
      }
    } catch (error) {
      console.warn('[CharacterGenesisService] Progression inference failed; using deterministic catalogue matching.', error);
      provenance = 'DETERMINISTIC_FALLBACK';
    }

    const findModule = (type: 'CLASS' | 'SUBCLASS' | 'SPECIES', value?: string) => {
      const normalized = String(value || '').trim().toLowerCase();
      if (!normalized) return undefined;
      return modules.find((module) =>
        module.type === type &&
        (
          module.id.toLowerCase() === normalized ||
          module.name.toLowerCase() === normalized ||
          module.aliases.some((alias: string) => alias.toLowerCase() === normalized)
        )
      )?.id;
    };

    let inferredClass =
      findModule('CLASS', proposal?.classId) ||
      findModule('CLASS', input.classId) ||
      findModule('CLASS', input.profession) ||
      findModule('CLASS', input.archetype);

    let inferredSpecies =
      findModule('SPECIES', proposal?.speciesId) ||
      findModule('SPECIES', input.species);

    const candidateSubclass = findModule('SUBCLASS', proposal?.subclassId);
    let inferredSubclass =
      candidateSubclass && inferredClass &&
      modules.some((module) =>
        module.id === candidateSubclass &&
        module.type === 'SUBCLASS' &&
        (!module.parentClassId || module.parentClassId === inferredClass)
      )
        ? candidateSubclass
        : undefined;

    const createdCustomModules: CharacterProgressionCustomModule[] = [];

    // Check if custom class is proposed or if proposal.classId is a novel custom class name
    const proposedCustomClass = proposal?.customClass || (proposal?.classId && !inferredClass ? { name: proposal.classId, concept: `${proposal.classId} specialized combat progression` } : null);
    if (proposedCustomClass && proposedCustomClass.name) {
      try {
        const customClassModule = await this.proposeCustomProgressionModule(
          {
            worldId: input.worldId,
            type: 'CLASS',
            name: proposedCustomClass.name,
            concept: proposedCustomClass.concept || proposedCustomClass.name,
            background: input.background,
            species: input.species,
            profession: input.profession,
            archetype: input.archetype,
          },
          worldTemplate
        );
        if (customClassModule?.id) {
          inferredClass = customClassModule.id;
          createdCustomModules.push(customClassModule);
        }
      } catch (err) {
        console.warn('[CharacterGenesisService] Failed to create custom class module during inference:', err);
      }
    }

    // Check if custom subclass is proposed or if proposal.subclassId is a novel custom subclass name
    const proposedCustomSubclass = proposal?.customSubclass || (proposal?.subclassId && !inferredSubclass ? { name: proposal.subclassId, concept: `${proposal.subclassId} specialized archetype progression` } : null);
    if (proposedCustomSubclass && proposedCustomSubclass.name) {
      try {
        const customSubclassModule = await this.proposeCustomProgressionModule(
          {
            worldId: input.worldId,
            type: 'SUBCLASS',
            name: proposedCustomSubclass.name,
            concept: proposedCustomSubclass.concept || proposedCustomSubclass.name,
            parentClassId: inferredClass || input.classId || 'class_fighter',
            background: input.background,
            species: input.species,
            profession: input.profession,
            archetype: input.archetype,
          },
          worldTemplate
        );
        if (customSubclassModule?.id) {
          inferredSubclass = customSubclassModule.id;
          createdCustomModules.push(customSubclassModule);
        }
      } catch (err) {
        console.warn('[CharacterGenesisService] Failed to create custom subclass module during inference:', err);
      }
    }

    // Check if custom species is proposed or if proposal.speciesId is a novel custom species name
    const proposedCustomSpecies = proposal?.customSpecies || (proposal?.speciesId && !inferredSpecies ? { name: proposal.speciesId, concept: `${proposal.speciesId} lineage and ancestry traits` } : null);
    if (proposedCustomSpecies && proposedCustomSpecies.name) {
      try {
        const customSpeciesModule = await this.proposeCustomProgressionModule(
          {
            worldId: input.worldId,
            type: 'SPECIES',
            name: proposedCustomSpecies.name,
            concept: proposedCustomSpecies.concept || proposedCustomSpecies.name,
            background: input.background,
            species: input.species,
            profession: input.profession,
            archetype: input.archetype,
          },
          worldTemplate
        );
        if (customSpeciesModule?.id) {
          inferredSpecies = customSpeciesModule.id;
          createdCustomModules.push(customSpeciesModule);
        }
      } catch (err) {
        console.warn('[CharacterGenesisService] Failed to create custom species module during inference:', err);
      }
    }

    if (!proposal?.classId && !proposal?.speciesId && !proposal?.subclassId && createdCustomModules.length === 0) {
      provenance = 'DETERMINISTIC_FALLBACK';
    }

    return {
      classId: inferredClass,
      subclassId: inferredSubclass,
      speciesId: inferredSpecies,
      createdCustomModules,
      reasoning: String(
        proposal?.reasoning ||
        'Inferred progression modules tailored to the character concept and backstory.'
      ),
      provenance,
    };
  }

  /**
   * Generates one player-authored custom class, subclass, or species module.
   * The AI supplies structure; the server validates and normalizes the result.
   */
  public async proposeCustomProgressionModule(
    input: {
      worldId: string;
      type: 'CLASS' | 'SUBCLASS' | 'SPECIES';
      name?: string;
      concept?: string;
      parentClassId?: string;
      background?: string;
      species?: string;
      profession?: string;
      archetype?: string;
    },
    worldTemplate: WorldTemplate
  ): Promise<CharacterProgressionCustomModule> {
    const requestedName = input.name?.trim() || `Custom ${input.type.toLowerCase()}`;
    const concept = input.concept?.trim() || requestedName;
    const moduleId = deterministicId(
      'custom_progression_module',
      input.worldId || 'world',
      input.type,
      requestedName,
      concept
    );
    const prefix = deterministicId('custom_progression_feature', moduleId);
    const precedence = input.type === 'CLASS' ? 30 : input.type === 'SUBCLASS' ? 40 : 20;

    const prompt = `You are a production RPG progression systems designer.

Create one coherent custom ${input.type.toLowerCase()} module for this character/world.
Do not create unrelated systems.
Use explicit numeric passive modifiers only.

NAME: ${requestedName}
CONCEPT: ${concept}
BACKGROUND: ${input.background || 'N/A'}
SPECIES: ${input.species || 'N/A'}
PROFESSION: ${input.profession || 'N/A'}
ARCHETYPE: ${input.archetype || 'N/A'}
PARENT CLASS ID: ${input.parentClassId || 'N/A'}
RULES MODE: ${worldTemplate?.dndRulesMode || 'FULL_DND'}

SAFE MODIFIER TARGETS:
combat.attackBonus
combat.criticalRange
coreStats.hpMax
coreStats.speed
coreStats.strength
coreStats.dexterity
coreStats.constitution
coreStats.intelligence
coreStats.wisdom
coreStats.charisma
spell.attackBonus
spell.saveDC
spell.damage

OUTPUT STRICT JSON:
{
  "name": string,
  "aliases": [string],
  "minLevel": number | null,
  "features": [
    {
      "name": string,
      "description": string,
      "level": number,
      "passiveModifiers": [
        { "target": string, "value": number, "stackGroup": string }
      ]
    }
  ]
}

A subclass normally begins at level 3 and must remain compatible with its parent class.
Provide at least one useful feature.
`;

    let proposal: any = null;
    let provenance = 'AI_GENERATED';

    try {
      const response = await worldRepository.getAiOrchestrator().executeTaskGeneration(
        'narrative.generate',
        prompt,
        'Return only the requested custom progression module JSON.'
      );
      if (response.text) {
        proposal = this.parseJsonFromAiResponse(response.text);
        if (response.source === 'DETERMINISTIC_FALLBACK') provenance = 'DETERMINISTIC_FALLBACK';
      }
    } catch (error) {
      console.warn('[CharacterGenesisService] Custom progression generation failed; using deterministic fallback.', error);
      provenance = 'DETERMINISTIC_FALLBACK';
    }

    const fallbackFeature = {
      name: `${requestedName} Training`,
      description: `Core progression benefits granted by ${requestedName}.`,
      level: input.type === 'SUBCLASS' ? 3 : 1,
      passiveModifiers: [],
    };
    const rawFeatures = Array.isArray(proposal?.features) && proposal.features.length
      ? proposal.features
      : [fallbackFeature];

    const safeTargets = new Set([
      'combat.attackBonus',
      'combat.criticalRange',
      'coreStats.hpMax',
      'coreStats.speed',
      'coreStats.strength',
      'coreStats.dexterity',
      'coreStats.constitution',
      'coreStats.intelligence',
      'coreStats.wisdom',
      'coreStats.charisma',
      'spell.attackBonus',
      'spell.saveDC',
      'spell.damage',
    ]);

    const features = rawFeatures.slice(0, 8).map((rawFeature: any, index: number) => {
      const featureId = deterministicId(prefix, index, String(rawFeature?.name || 'feature'));
      const level = Math.max(
        input.type === 'SUBCLASS' ? 3 : 1,
        Math.min(20, Math.trunc(Number(rawFeature?.level) || (input.type === 'SUBCLASS' ? 3 : 1)))
      );
      const passiveModifiers = Array.isArray(rawFeature?.passiveModifiers)
        ? rawFeature.passiveModifiers
            .filter((modifier: any) => safeTargets.has(String(modifier?.target || '').trim()))
            .slice(0, 6)
            .map((modifier: any, modifierIndex: number) => {
              const target = String(modifier.target).trim();
              const value = Number(modifier.value);
              if (!Number.isFinite(value) || value === 0) return null;
              const safeValue = Math.max(-10, Math.min(10, value));
              const stackGroup = String(modifier.stackGroup || 'CUSTOM_PROGRESSION');
              return {
                id: deterministicId('custom_progression_modifier', moduleId, featureId, modifierIndex, target, safeValue),
                target,
                mode: 'ADD' as const,
                value: safeValue,
                precedence,
                stackGroup,
                source: {
                  moduleId,
                  moduleType: input.type,
                  featureId,
                  sourceId: deterministicId('custom_progression_source', moduleId, featureId, target),
                  sourceName: String(rawFeature?.name || requestedName),
                  precedence,
                  stackGroup,
                },
              };
            })
            .filter(Boolean)
        : [];

      return {
        id: featureId,
        name: String(rawFeature?.name || `${requestedName} Feature ${index + 1}`),
        description: String(rawFeature?.description || `Progression feature for ${requestedName}.`),
        level,
        enabled: true,
        passiveModifiers,
        triggeredAbilities: [],
      };
    });

    if (features.every((feature: any) => (feature.passiveModifiers || []).length === 0)) {
      const fallback = features[0];
      const target = input.type === 'CLASS'
        ? 'combat.attackBonus'
        : input.type === 'SPECIES'
          ? 'coreStats.speed'
          : 'coreStats.hpMax';
      fallback.passiveModifiers = [{
        id: deterministicId('custom_progression_modifier', moduleId, fallback.id, target),
        target,
        mode: 'ADD',
        value: 1,
        precedence,
        stackGroup: 'CUSTOM_PROGRESSION',
        source: {
          moduleId,
          moduleType: input.type,
          featureId: fallback.id,
          sourceId: deterministicId('custom_progression_source', moduleId, fallback.id, target),
          sourceName: fallback.name,
          precedence,
          stackGroup: 'CUSTOM_PROGRESSION',
        },
      }];
    }

    return {
      id: moduleId,
      type: input.type,
      name: String(proposal?.name || requestedName),
      version: 1,
      enabled: true,
      aliases: Array.isArray(proposal?.aliases)
        ? proposal.aliases.map(String).slice(0, 8)
        : [requestedName.toLowerCase()],
      parentClassId: input.type === 'SUBCLASS' ? (input.parentClassId || undefined) : undefined,
      minLevel: input.type === 'SUBCLASS'
        ? Math.max(3, Math.trunc(Number(proposal?.minLevel) || 3))
        : undefined,
      prerequisites: Array.isArray(proposal?.prerequisites) ? proposal.prerequisites.map(String).slice(0, 8) : [],
      features,
      provenance,
    };
  }

  /**
   * Synthesizes and proposes a structured Custom Feat based on natural language input.
   */
  public async proposeCustomFeat(
    input: CustomFeatProposalRequest,
    worldTemplate: WorldTemplate
  ): Promise<CharacterFeat> {
    const featName = input.featName?.trim() || 'Custom Feat';
    const concept = input.featConcept?.trim() || featName;
    const featId = deterministicId('feat_custom', input.worldId || 'world', featName, concept);
    let proposal: any = null;

    const charCtxStr = input.characterContext
      ? `CHARACTER CONTEXT:\nProfession/Role: ${input.characterContext.role || 'N/A'}\nSpecies: ${input.characterContext.species || 'N/A'}\nBackground: ${input.characterContext.background || 'N/A'}\n`
      : '';

    const prompt = `You are a game mechanics designer for narrative RPG and D&D systems.
Given this custom feat name, feat concept, character context, and world setting, generate a structured feat definition with mechanical effects, tags, and prerequisites.

WORLD CONTEXT:
Title: ${worldTemplate?.title || 'Unknown World'}
Genre: ${worldTemplate?.genreTags?.join(', ') || 'Fantasy'}

${charCtxStr}FEAT NAME: "${featName}"
FEAT CONCEPT/DESCRIPTION: "${concept}"

OUTPUT STRICT JSON with this structure:
{
  "name": string,
  "description": string,
  "prerequisites": [string],
  "tags": [string],
  "effects": [
    {
      "type": string,
      "target": string,
      "scope": string,
      "modifier": number,
      "value": string | number | boolean,
      "condition": string,
      "description": string
    }
  ]
}

IMPORTANT:
- Description should expand on "${concept}" with clear narrative flair and mechanical implications.
- Generate 1-3 specific mechanical effects (e.g. STAT_MODIFIER, CAPABILITY_BOOST, SKILL_BONUS, PASSIVE_TRAIT) that reflect the feat's theme.
- Name must match or refine "${featName}".`;

    let generatedProvenance: CharacterProvenanceSource = 'AI_GENERATED';
    try {
      const orchestrator = worldRepository.getAiOrchestrator();
      const response = await orchestrator.executeTaskGeneration(
        'narrative.generate',
        prompt,
        'Return only the requested structured custom feat JSON.'
      );
      if (response.text) {
        proposal = this.parseJsonFromAiResponse(response.text);
        if (response.source === 'DETERMINISTIC_FALLBACK') {
          generatedProvenance = 'DETERMINISTIC_FALLBACK';
        }
      }
    } catch (err) {
      console.warn('[CharacterGenesisService] Custom feat proposal failed, using procedural fallback:', err);
    }

    if (!proposal || !proposal.name) {
      proposal = {
        name: featName || 'Custom Feat',
        description: concept || `Mastery associated with ${featName}.`,
        prerequisites: [],
        tags: ['Custom', 'Feat'],
        effects: [
          {
            type: 'PASSIVE_TRAIT',
            target: featName,
            scope: 'GENERAL',
            modifier: 1,
            value: true,
            condition: 'Always active',
            description: `Grants benefits of ${featName}.`,
          },
        ],
      };
      generatedProvenance = 'DETERMINISTIC_FALLBACK';
    }

    const feat: CharacterFeat = {
      id: featId,
      name: proposal.name || featName,
      description: proposal.description || concept,
      prerequisites: Array.isArray(proposal.prerequisites) ? proposal.prerequisites.map(String) : [],
      tags: Array.isArray(proposal.tags) ? proposal.tags.map(String) : ['Custom'],
      effects: Array.isArray(proposal.effects)
        ? this.mapCharacterEffects(proposal.effects, featId, generatedProvenance)
        : [],
      provenance: generatedProvenance,
      worldId: worldTemplate.worldId,
    };

    return feat;
  }

  /**
   * Synthesizes and proposes a structured Custom Attribute or World Stat based on natural language input.
   */
  public async proposeCustomAttribute(
    input: CustomAttributeProposalRequest,
    worldTemplate: WorldTemplate
  ): Promise<CharacterStatDefinition> {
    const name = input.attributeName?.trim() || 'Custom Attribute';
    const concept = input.attributeConcept?.trim() || name;
    const category = input.category || 'custom_attribute';
    const attrId = `stat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let proposal: any = null;

    const charCtxStr = input.characterContext
      ? `CHARACTER CONTEXT:\nProfession/Role: ${input.characterContext.role || 'N/A'}\nSpecies: ${input.characterContext.species || 'N/A'}\nBackground: ${input.characterContext.background || 'N/A'}\n`
      : '';

    const prompt = `You are a system designer for narrative RPG mechanics.
Given this attribute name, concept, character context, and world setting, generate a structured stat/attribute definition.
Do NOT modify or propose changes to the 6 core D&D ability scores (Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma).

WORLD CONTEXT:
Title: ${worldTemplate?.title || 'Unknown World'}
Genre: ${worldTemplate?.genreTags?.join(', ') || 'Fantasy'}

${charCtxStr}ATTRIBUTE/STAT NAME: "${name}"
ATTRIBUTE/STAT CONCEPT: "${concept}"
CATEGORY: "${category}"

OUTPUT STRICT JSON with this structure:
{
  "name": string,
  "value": number,
  "baseValue": number,
  "min": number | null,
  "max": number | null,
  "description": string,
  "mechanicalRole": string,
  "worldCompatibility": string
}

IMPORTANT: Provide sensible starting default value, optional min/max, clear description and mechanical role for this stat.`;

    let generatedProvenance: CharacterProvenanceSource = 'AI_GENERATED';
    try {
      const orchestrator = worldRepository.getAiOrchestrator();
      const response = await orchestrator.executeTaskGeneration(
        'narrative.generate',
        prompt,
        'Return only the requested structured stat definition JSON.'
      );
      if (response.text) {
        proposal = this.parseJsonFromAiResponse(response.text);
        if (response.source === 'DETERMINISTIC_FALLBACK') {
          generatedProvenance = 'DETERMINISTIC_FALLBACK';
        }
      }
    } catch (err) {
      console.warn('[CharacterGenesisService] Custom attribute proposal failed, using fallback:', err);
    }

    if (!proposal || !proposal.name) {
      proposal = {
        name,
        value: 10,
        baseValue: 10,
        min: 0,
        max: 100,
        description: concept,
        mechanicalRole: 'Custom stat defining character capability.',
        worldCompatibility: 'Compatible with world rules.',
      };
      generatedProvenance = 'DETERMINISTIC_FALLBACK';
    }

    return {
      id: attrId,
      name: proposal.name || name,
      value: Number(proposal.value ?? 10),
      baseValue: Number(proposal.baseValue ?? proposal.value ?? 10),
      min: proposal.min != null ? Number(proposal.min) : undefined,
      max: proposal.max != null ? Number(proposal.max) : undefined,
      description: proposal.description || concept,
      category,
      mechanicalRole: proposal.mechanicalRole,
      worldCompatibility: proposal.worldCompatibility,
      provenance: generatedProvenance,
    };
  }

  /**
   * Synthesizes and proposes a structured Custom Skill based on natural language input.
   */
  public async proposeCustomSkill(
    input: CustomSkillProposalRequest,
    worldTemplate: WorldTemplate
  ): Promise<CharacterSkill> {
    const skillName = input.skillName?.trim() || 'Custom Skill';
    const concept = input.skillConcept?.trim() || skillName;
    const skillId = `skill_custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let proposal: any = null;

    const charCtxStr = input.characterContext
      ? `CHARACTER CONTEXT:\nProfession/Role: ${input.characterContext.role || 'N/A'}\nSpecies: ${input.characterContext.species || 'N/A'}\nBackground: ${input.characterContext.background || 'N/A'}\n`
      : '';

    const prompt = `You are a game mechanics designer for narrative RPG and D&D systems.
Given this custom skill name, concept, character context, and world setting, generate a structured custom skill definition.

WORLD CONTEXT:
Title: ${worldTemplate?.title || 'Unknown World'}
Genre: ${worldTemplate?.genreTags?.join(', ') || 'Fantasy'}

${charCtxStr}SKILL NAME: "${skillName}"
SKILL CONCEPT: "${concept}"

OUTPUT STRICT JSON with this structure:
{
  "name": string,
  "governingAbility": "Strength" | "Dexterity" | "Constitution" | "Intelligence" | "Wisdom" | "Charisma",
  "description": string,
  "mechanicalDescription": string,
  "checkFormula": string,
  "tags": [string],
  "worldCompatibility": string
}

IMPORTANT:
- Select the most appropriate governing D&D ability score.
- FULL_DND MUST use "1d20".
- HYBRID_DND defaults to "1d20" but may use an authored simple formula such as "2d6" or "1d8".
- CUSTOM_HOMEBREW_DND must not receive an implicit D&D formula.
- Provide a clear description and special mechanical behavior.`;

    let generatedProvenance: CharacterProvenanceSource = 'AI_GENERATED';
    try {
      const orchestrator = worldRepository.getAiOrchestrator();
      const response = await orchestrator.executeTaskGeneration(
        'narrative.generate',
        prompt,
        'Return only the requested structured custom skill JSON.'
      );
      if (response.text) {
        proposal = this.parseJsonFromAiResponse(response.text);
        if (response.source === 'DETERMINISTIC_FALLBACK') {
          generatedProvenance = 'DETERMINISTIC_FALLBACK';
        }
      }
    } catch (err) {
      console.warn('[CharacterGenesisService] Custom skill proposal failed, using fallback:', err);
    }

    if (!proposal || !proposal.name) {
      proposal = {
        name: skillName,
        governingAbility: 'Dexterity',
        description: concept,
        mechanicalDescription: `Specialized skill proficiency derived from ${concept}.`,
        tags: ['Custom', 'Skill'],
        worldCompatibility: 'Fits world setting.',
      };
      generatedProvenance = 'DETERMINISTIC_FALLBACK';
    }

    return {
      id: skillId,
      name: proposal.name || skillName,
      governingAbility: proposal.governingAbility || 'Dexterity',
      proficiency: 'NONE',
      isProficient: false,
      isExpertise: false,
      isCustom: true,
      description: proposal.description || concept,
      mechanicalDescription: proposal.mechanicalDescription,
      checkFormula: worldTemplate?.dndRulesMode === 'FULL_DND' || !worldTemplate?.dndRulesMode
        ? '1d20'
        : normalizeDiceFormula(proposal?.checkFormula, '1d20'),
      tags: Array.isArray(proposal.tags) ? proposal.tags.map(String) : ['Custom'],
      worldCompatibility: proposal.worldCompatibility,
      provenance: generatedProvenance,
    };
  }

  /**
   * AI proposal for the character's current starting condition and defensive profile.
   * The player reviews this proposal before it becomes the draft's canonical starting state.
   */
  public async proposeStartingConditionState(
    input: {
      worldId: string;
      concept?: string;
      background?: string;
      identity?: string;
      startingSituation?: string;
      currentStateNote?: string;
    },
    worldTemplate: WorldTemplate
  ): Promise<CharacterStartingConditionState> {
    const prompt = `You are a game-state adjudicator for a narrative RPG.

Infer only the character's CURRENT STARTING CONDITION from the supplied context.
Do not invent unrelated injuries, curses, conditions, immunities, resistances, or vulnerabilities.
A healthy character should normally have no harmful conditions.

WORLD: ${worldTemplate?.title || 'Unknown'}
RULES MODE: ${worldTemplate?.dndRulesMode || 'FULL_DND'}
CONCEPT: ${input.concept || ''}
IDENTITY: ${input.identity || ''}
BACKGROUND: ${input.background || ''}
STARTING SITUATION: ${input.startingSituation || ''}
PLAYER STATE NOTE: ${input.currentStateNote || ''}

OUTPUT STRICT JSON:
{
  "instances": [
    {
      "name": string,
      "alignment": "HARMFUL" | "BENEFICIAL" | "NEUTRAL" | "MIXED",
      "severity": number,
      "intensity": number,
      "durationSeconds": number | null,
      "stackMode": "REPLACE" | "ADD" | "MAX" | "REFRESH",
      "affectedBodyRegions": [string]
    }
  ],
  "damageProfile": {
    "damageImmunities": [string],
    "damageResistances": [string],
    "damageVulnerabilities": [string]
  },
  "conditionProfile": {
    "conditionImmunities": [string],
    "conditionResistances": [string],
    "conditionVulnerabilities": [string]
  }
}`;

    let raw: any = null;
    try {
      const response = await worldRepository.getAiOrchestrator().executeTaskGeneration(
        'narrative.generate',
        prompt,
        'Return only the requested current condition state JSON.'
      );
      if (response.text) raw = this.parseJsonFromAiResponse(response.text);
    } catch (error) {
      console.warn('[CharacterGenesisService] Starting condition inference failed; using safe baseline.', error);
    }

    if (!raw || typeof raw !== 'object') {
      throw new CharacterGenesisAiUnavailableError('AI did not return a usable current-condition proposal. Existing condition state was not changed.');
    }

    const strings = (value: unknown): string[] =>
      Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, 20) : [];

    const rawInstances = Array.isArray(raw?.instances) ? raw.instances : [];
    const instances: CharacterConditionInstance[] = rawInstances.slice(0, 12).map((instance: any, index: number) => ({
      id: deterministicId('condition_ai', input.worldId, String(instance?.name || 'condition'), index),
      definitionId: String(instance?.definitionId || String(instance?.name || 'custom_condition').toLowerCase().replace(/[^a-z0-9]+/g, '_')),
      name: String(instance?.name || 'Starting Condition'),
      alignment: ['HARMFUL', 'BENEFICIAL', 'NEUTRAL', 'MIXED'].includes(instance?.alignment) ? instance.alignment : 'NEUTRAL',
      severity: Math.max(0, Math.min(10, Number(instance?.severity ?? 1))),
      intensity: Math.max(0, Math.min(100, Number(instance?.intensity ?? 1))),
      stackCount: 1,
      stackMode: ['REPLACE', 'ADD', 'MAX', 'REFRESH'].includes(instance?.stackMode) ? instance.stackMode : 'REFRESH',
      appliedAtSeconds: 0,
      durationSeconds: instance?.durationSeconds == null ? null : Math.max(0, Number(instance.durationSeconds)),
      remainingDurationSeconds: instance?.durationSeconds == null ? null : Math.max(0, Number(instance.durationSeconds)),
      tags: ['AI_INFERRED_STARTING_STATE'],
      affectedBodyRegions: strings(instance?.affectedBodyRegions),
    }));

    return {
      instances,
      customDefinitions: [],
      damageProfile: {
        damageImmunities: strings(raw?.damageProfile?.damageImmunities),
        damageResistances: strings(raw?.damageProfile?.damageResistances),
        damageVulnerabilities: strings(raw?.damageProfile?.damageVulnerabilities),
      },
      conditionProfile: {
        conditionImmunities: strings(raw?.conditionProfile?.conditionImmunities),
        conditionResistances: strings(raw?.conditionProfile?.conditionResistances),
        conditionVulnerabilities: strings(raw?.conditionProfile?.conditionVulnerabilities),
      },
      bodyRegions: [],
    };
  }

  /**
   * Synthesizes and proposes a structured Custom Starting Equipment Item based on natural language input.
   */
  public async proposeCustomEquipment(
    input: CustomEquipmentProposalRequest,
    worldTemplate: WorldTemplate
  ): Promise<StartingEquipmentItem> {
    const itemName = input.itemName?.trim() || 'Custom Item';
    const concept = input.itemConcept?.trim() || itemName;
    const itemId = `eq_custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let proposal: any = null;

    const charCtxStr = input.characterContext
      ? `CHARACTER CONTEXT:\nProfession/Role: ${input.characterContext.role || 'N/A'}\nSpecies: ${input.characterContext.species || 'N/A'}\nBackground: ${input.characterContext.background || 'N/A'}\n`
      : '';

    const prompt = `You are an equipment and item designer for a narrative RPG.
Given this equipment concept, character context, and world setting, generate a complete structured starting equipment item.

WORLD CONTEXT:
Title: ${worldTemplate?.title || 'Unknown World'}
Genre: ${worldTemplate?.genreTags?.join(', ') || 'Fantasy'}

${charCtxStr}ITEM NAME: "${itemName}"
ITEM CONCEPT: "${concept}"

OUTPUT STRICT JSON with this structure:
{
  "name": string,
  "category": "Weapon" | "Armor" | "Shield" | "Potion" | "Scroll" | "Tool" | "Consumable" | "Accessory" | "Miscellaneous",
  "slot": "head" | "neck" | "back" | "body" | "mainHand" | "offHand" | "gloves" | "belt" | "ring" | "legs" | "feet" | "ammunition" | null,
  "description": string,
  "rarity": "Common" | "Uncommon" | "Rare" | "Very Rare" | "Legendary",
  "quantity": number,
  "durability": number | null,
  "maxDurability": number | null,
  "properties": Record<string, string>,
  "effects": [
    {
      "type": string,
      "target": string,
      "scope": string,
      "modifier": number,
      "value": string | number | boolean,
      "condition": string,
      "description": string
    }
  ]
}

IMPORTANT: Select an appropriate category and paper-doll slot. If the item is a weapon or armor, suggest a valid equipment slot like mainHand or body. Provide clear effects and properties matching "${concept}".`;

    let generatedProvenance: CharacterProvenanceSource = 'AI_GENERATED';
    try {
      const orchestrator = worldRepository.getAiOrchestrator();
      const response = await orchestrator.executeTaskGeneration(
        'narrative.generate',
        prompt,
        'Return only the requested structured custom equipment JSON.'
      );
      if (response.text) {
        proposal = this.parseJsonFromAiResponse(response.text);
        if (response.source === 'DETERMINISTIC_FALLBACK') {
          generatedProvenance = 'DETERMINISTIC_FALLBACK';
        }
      }
    } catch (err) {
      console.warn('[CharacterGenesisService] Custom equipment proposal failed, using fallback:', err);
    }

    if (!proposal || !proposal.name) {
      proposal = {
        name: itemName,
        category: 'Weapon',
        slot: 'mainHand',
        description: concept,
        rarity: 'Uncommon',
        quantity: 1,
        properties: { Special: concept },
        effects: [],
      };
      generatedProvenance = 'DETERMINISTIC_FALLBACK';
    }

    const finalCategory = proposal.category || 'Weapon';
    const catLower = finalCategory.toLowerCase();
    const itemLower = (proposal.name || itemName).toLowerCase();

    let eqClass = 'MISC';
    let equipable = false;
    let handUsage = 'NONE';
    let allowedSlots: string[] = [];

    if (catLower.includes('weapon') || itemLower.includes('blade') || itemLower.includes('sword') || itemLower.includes('bow') || itemLower.includes('dagger') || itemLower.includes('staff')) {
      eqClass = 'WEAPON';
      equipable = true;
      if (itemLower.includes('two-hand') || itemLower.includes('2h') || itemLower.includes('greatsword') || itemLower.includes('bow') || itemLower.includes('staff')) {
        handUsage = 'TWO_HAND';
        allowedSlots = ['mainHand', 'offHand'];
      } else {
        handUsage = 'ONE_HAND';
        allowedSlots = ['mainHand', 'offHand'];
      }
    } else if (catLower.includes('shield') || itemLower.includes('shield')) {
      eqClass = 'SHIELD';
      equipable = true;
      handUsage = 'OFF_HAND';
      allowedSlots = ['offHand'];
    } else if (catLower.includes('armor') || itemLower.includes('cuirass') || itemLower.includes('plate') || itemLower.includes('robes') || itemLower.includes('helmet')) {
      eqClass = 'ARMOR';
      equipable = true;
      handUsage = 'NONE';
      if (itemLower.includes('helmet') || itemLower.includes('hat') || itemLower.includes('hood')) allowedSlots = ['head'];
      else if (itemLower.includes('boots') || itemLower.includes('shoes')) allowedSlots = ['feet'];
      else if (itemLower.includes('gloves') || itemLower.includes('bracers')) allowedSlots = ['gloves'];
      else allowedSlots = ['body'];
    } else if (catLower.includes('accessory') || catLower.includes('ring') || catLower.includes('necklace') || itemLower.includes('ring') || itemLower.includes('amulet')) {
      eqClass = 'ACCESSORY';
      equipable = true;
      handUsage = 'NONE';
      if (itemLower.includes('ring')) allowedSlots = ['ring'];
      else if (itemLower.includes('neck') || itemLower.includes('amulet')) allowedSlots = ['neck'];
      else allowedSlots = ['ring'];
    } else {
      eqClass = catLower.includes('potion') ? 'POTION' : catLower.includes('food') ? 'FOOD' : catLower.includes('tool') ? 'TOOL' : 'MISC';
      equipable = false;
    }

    return {
      id: itemId,
      name: proposal.name || itemName,
      category: finalCategory,
      equipmentClass: eqClass as any,
      equipable,
      allowedSlots: allowedSlots as any,
      handUsage: handUsage as any,
      slot: equipable ? (proposal.slot || allowedSlots[0] || undefined) : undefined,
      description: proposal.description || concept,
      isEquipped: false,
      quantity: Number(proposal.quantity ?? 1),
      rarity: proposal.rarity || 'Common',
      durability: proposal.durability != null ? Number(proposal.durability) : undefined,
      maxDurability: proposal.maxDurability != null ? Number(proposal.maxDurability) : undefined,
      properties: proposal.properties || {},
      effects: Array.isArray(proposal.effects)
        ? this.mapCharacterEffects(proposal.effects, itemId, generatedProvenance)
        : [],
      sourceUserPrompt: concept,
      provenance: generatedProvenance,
      icon: { source: 'DEFAULT', status: 'DEFAULT' },
    };
  }

  /**
   * Validates a character draft against canonical world rules, location validity, and schema completeness.
   */
  public validateCharacterDraft(
    draft: CharacterGenesisDraft,
    worldTemplate: WorldTemplate
  ): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Identity validation
    if (!draft.identity?.name || draft.identity.name.trim() === '') {
      errors.push('Character name cannot be empty.');
    }
    if (!draft.identity?.species || draft.identity.species.trim() === '') {
      errors.push('Character species cannot be empty.');
    }

    // Role validation
    if (!draft.role?.profession && !draft.role?.archetype) {
      warnings.push('Character should have a defined profession or archetype.');
    }

    // Capabilities validation
    if (!draft.capabilities || draft.capabilities.length === 0) {
      errors.push('Character must possess at least one capability or innate trait.');
    }

    // World Version Check
    if (worldTemplate && draft.worldVersion !== worldTemplate.worldManifestVersion) {
      warnings.push(
        `Draft world version (${draft.worldVersion}) does not match template version (${worldTemplate.worldManifestVersion}). Auto-updating binding.`
      );
      draft.worldVersion = worldTemplate.worldManifestVersion;
    }

    // World compatibility is a warning-first gate: player creativity is allowed,
    // but contradictions with hard world rules are surfaced before confirmation.
    const conceptText = [
      draft.sourceDescription,
      draft.identity.species,
      draft.background.history,
      draft.capabilities.map((cap) => cap.name).join(' '),
    ].join(' ').toLowerCase();

    const hardConstraints = [...(worldTemplate?.ruleConstraints || []), ...(worldTemplate?.worldRules || [])]
      .filter((rule: any) => rule && (rule.isHardConstraint || rule.hardConstraint));

    for (const rule of hardConstraints) {
      const ruleText = String(rule.description || rule.statement || '').toLowerCase();
      if (ruleText.includes('no magic') && /(magic|spell|sorcer|wizard|arcane)/i.test(conceptText)) {
        warnings.push('Character concept may conflict with a hard world rule: magic is restricted in this world.');
      }
      if (ruleText.includes('no supernatural') && /(supernatural|immortal|cosmic|telepath|teleport)/i.test(conceptText)) {
        warnings.push('Character concept may conflict with a hard world rule: supernatural traits are restricted in this world.');
      }
    }

    // World Rules / Capability Constraints Check
    const worldRules = worldTemplate?.worldRules || [];
    const ruleConstraints = worldTemplate?.ruleConstraints || [];
    const allConstraints = [...ruleConstraints, ...worldRules.map((r: any) => r.description || r)];

    for (const cap of draft.capabilities || []) {
      if (!cap.name || cap.name.trim() === '') {
        errors.push(`Capability is missing a name.`);
      }
      if (!cap.description || cap.description.trim() === '') {
        warnings.push(`Capability "${cap.name}" has an empty description.`);
      }
      // Check tier bounds against world restrictions if low-magic/grounded
      if (
        (worldTemplate?.rulesetId === 'low_magic' || worldTemplate?.canonMode === 'GROUNDED') &&
        cap.powerTier === 'WorldScale'
      ) {
        warnings.push(`WorldScale capability "${cap.name}" exceeds grounded world recommendations.`);
      }
    }

    // Starting location validation
    const worldNodes = worldTemplate?.geography?.nodes || [];
    if (!draft.startingLocation?.locationId || draft.startingLocation.locationId.trim() === '') {
      errors.push('Starting location is required.');
    } else if (worldNodes.length > 0) {
      const exists = worldNodes.some((n: any) => n.id === draft.startingLocation.locationId);
      if (!exists) {
        errors.push(
          `Starting location ID "${draft.startingLocation.locationId}" does not exist in world's canonical geography.`
        );
      }
    }

    // Equipment slot validation
    const validSlots = ['head', 'body', 'hands', 'waist', 'legs', 'feet', 'mainHand', 'offHand', 'relic', 'ring1', 'ring2', 'neck'];
    for (const item of draft.startingEquipment?.equipped || []) {
      if (item.slot && !validSlots.includes(item.slot)) {
        warnings.push(`Equipped item "${item.name}" assigned to non-standard slot "${item.slot}".`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Explicitly confirms a CharacterGenesisDraft into a ConfirmedCharacter,
   * stamping world version binding and validation.
   * CRITICAL GUARANTEE: Does NOT create or launch a StoryRun!
   */
  public confirmCharacter(draft: CharacterGenesisDraft, worldTemplate: WorldTemplate): ConfirmedCharacter {
    const validation = this.validateCharacterDraft(draft, worldTemplate);
    if (!validation.isValid) {
      throw new Error(`Cannot confirm invalid character: ${validation.errors.join(', ')}`);
    }

    const characterId = `char_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const confirmedAt = new Date().toISOString();
    const resolvedNarrativeProfile = narrativeProfileEngine.resolve({
      mode: draft.storyMode,
      narrativeProfile: draft.narrativeProfile,
      fallbackMode: worldTemplate.storyMode || worldTemplate.narrativeProfile?.mode || 'PROTAGONIST',
      source: 'RUN',
    }).profile;

    const confirmed: ConfirmedCharacter = {
      characterId,
      draftId: draft.draftId,
      worldId: worldTemplate.worldId,
      worldVersion: worldTemplate.worldManifestVersion,
      confirmedAt,
      sourceDescription: draft.sourceDescription,
      identity: { ...draft.identity },
      appearance: { ...draft.appearance },
      personality: { ...draft.personality },
      background: { ...draft.background },
      role: { ...draft.role },
      motivations: { ...draft.motivations },
      relationships: { ...draft.relationships },
      condition: { ...draft.condition },
      coreStats: draft.coreStats ? { ...draft.coreStats } : {
        level: 1,
        armorClass: 10,
        speed: 30,
        hitDice: '1d8',
        hpCurrent: 10,
        hpMax: 10,
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      attributes: draft.attributes ? draft.attributes.map((entry) => ({ ...entry })) : [],
      stats: draft.stats ? draft.stats.map((entry) => ({ ...entry })) : [],
      traits: [...(draft.traits || [])],
      capabilities: draft.capabilities ? draft.capabilities.map((c) => ({ ...c, effects: c.effects ? c.effects.map((effect) => ({ ...effect })) : [] })) : [],
      generatedSkills: draft.generatedSkills ? draft.generatedSkills.map((s) => ({ ...s })) : [],
      feats: draft.feats ? draft.feats.map((feat) => ({ ...feat, effects: feat.effects ? feat.effects.map((effect) => ({ ...effect })) : [] })) : [],
      titles: draft.titles ? draft.titles.map((title) => ({ ...title, effects: title.effects ? title.effects.map((effect) => ({ ...effect })) : [] })) : [],
      startingEquipment: {
        equipped: draft.startingEquipment?.equipped?.map((e) => ({ ...e })) || [],
        inventory: draft.startingEquipment?.inventory?.map((i) => ({ ...i })) || [],
        weapons: [...(draft.startingEquipment?.weapons || [])],
        armor: [...(draft.startingEquipment?.armor || [])],
        tools: [...(draft.startingEquipment?.tools || [])],
        consumables: [...(draft.startingEquipment?.consumables || [])],
      },
      startingLocation: { ...draft.startingLocation },
      startingSituation: { ...draft.startingSituation },
      startingLocationMode: draft.startingLocationMode || 'AI_SUGGEST',
      startingSituationMode: draft.startingSituationMode || 'AI_SUGGEST',
      startingState: draft.startingState ? {
        ...draft.startingState,
        conditions: [...draft.startingState.conditions],
        activeEffects: draft.startingState.activeEffects.map((effect) => ({ ...effect })),
        reputations: { ...draft.startingState.reputations },
        relationshipModifiers: { ...draft.startingState.relationshipModifiers },
      } : {
        healthCurrent: 100,
        healthMax: 100,
        conditions: [],
        activeEffects: [],
        reputations: {},
        relationshipModifiers: {},
      },
      portraitAsset: draft.portraitAsset ? { ...draft.portraitAsset } : undefined,
      aiExtractionSummary: draft.aiExtractionSummary ? {
        ...draft.aiExtractionSummary,
        keyFacts: [...draft.aiExtractionSummary.keyFacts],
        proposedHighlights: [...draft.aiExtractionSummary.proposedHighlights],
        uncertainties: [...(draft.aiExtractionSummary.uncertainties || [])],
      } : undefined,
      provenance: { ...draft.provenance },
      fieldLocks: [...(draft.fieldLocks || [])],
      revision: draft.revision || 1,
      storyMode: resolvedNarrativeProfile.mode,
      narrativeProfile: resolvedNarrativeProfile,
      dndRulesMode: draft.dndRulesMode,
      progression: draft.progression ? {
        ...draft.progression,
        featIds: [...(draft.progression.featIds || [])],
        moduleIds: [...(draft.progression.moduleIds || [])],
        customModules: [...(draft.progression.customModules || [])],
      } : undefined,
    };

    return confirmed;
  }

  // -------------------------------------------------------------
  // Internal Procedural Fallbacks & Keyword Parsers
  // -------------------------------------------------------------

  private mapCharacterEffects(
    effects: any,
    sourceId: string,
    provenance: CharacterProvenanceSource
  ): CharacterEffect[] {
    if (!Array.isArray(effects)) return [];
    return effects.map((effect: any, idx: number) => ({
      id: String(effect?.id || `effect_${sourceId}_${idx + 1}`),
      type: String(effect?.type || 'narrative_modifier'),
      target: effect?.target ? String(effect.target) : undefined,
      scope: effect?.scope ? String(effect.scope) : undefined,
      modifier: typeof effect?.modifier === 'number' ? effect.modifier : undefined,
      value:
        typeof effect?.value === 'string' ||
        typeof effect?.value === 'number' ||
        typeof effect?.value === 'boolean'
          ? effect.value
          : undefined,
      condition: effect?.condition ? String(effect.condition) : undefined,
      description: String(effect?.description || 'Contextual effect.'),
      sourceId,
      provenance,
    }));
  }

  /**
   * Robust JSON extractor from model output.
   * Supports raw JSON, fenced JSON, and short conversational wrappers.
   * Uses a quote-aware balanced scanner instead of first/last-brace slicing.
   */
  public parseJsonFromAiResponse(text: string): any {
    if (!text || typeof text !== 'string') return null;

    const candidates: string[] = [];
    const trimmed = text.trim();

    const fencedMatches = Array.from(trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi));
    for (const match of fencedMatches) {
      if (match[1]) candidates.push(match[1].trim());
    }
    candidates.push(trimmed);

    for (const candidate of candidates) {
      const direct = this.tryParseJsonCandidate(candidate);
      if (direct !== null) return direct;

      const extracted = this.extractBalancedJson(candidate);
      if (extracted) {
        const parsed = this.tryParseJsonCandidate(extracted);
        if (parsed !== null) return parsed;
      }
    }

    return null;
  }

  private tryParseJsonCandidate(candidate: string): any {
    try {
      return JSON.parse(candidate);
    } catch {
      try {
        const sanitized = candidate
          .replace(/,\s*([\]\}])/g, '$1')
          .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
        return JSON.parse(sanitized);
      } catch {
        return null;
      }
    }
  }

  private extractBalancedJson(text: string): string | null {
    const firstObject = text.indexOf('{');
    const firstArray = text.indexOf('[');
    let start = -1;
    let opening = '';
    let closing = '';

    if (firstObject !== -1 && (firstArray === -1 || firstObject < firstArray)) {
      start = firstObject;
      opening = '{';
      closing = '}';
    } else if (firstArray !== -1) {
      start = firstArray;
      opening = '[';
      closing = ']';
    }

    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === opening) depth++;
      if (ch === closing) {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }

    return null;
  }

  private isValidCharacterExtractionShape(value: any): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

    const requiredObjectKeys = [
      'identity',
      'appearance',
      'personality',
      'background',
      'role',
      'startingEquipment',
      'startingLocation',
      'startingSituation',
    ];

    if (!requiredObjectKeys.every((key) => value[key] && typeof value[key] === 'object')) return false;
    if (!value.identity.name || !value.identity.species) return false;
    if (!value.role.profession && !value.role.archetype) return false;
    if (!Array.isArray(value.capabilities)) return false;

    return true;
  }

  private proceduralExtraction(concept: string, worldTemplate: WorldTemplate): any {
    const rawConcept = (concept || '').trim();
    const lower = rawConcept.toLowerCase();

    // 1. Name Extraction / Concept-Themed Generation
    let name = '';
    // Check explicit name patterns
    const nameMatch =
      rawConcept.match(/(?:named|called|known as|name is|i am|protagonist|character is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i) ||
      rawConcept.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:is a|was a|who is|who was)/);

    if (nameMatch && nameMatch[1]) {
      name = nameMatch[1].trim();
    }

    // Determine Species/Origin
    let species = 'Human';
    if (lower.includes('soul reaper') || lower.includes('shinigami') || lower.includes('bleach')) {
      species = lower.includes('isekai') ? 'Soul Reaper (Isekai)' : 'Soul Reaper';
    } else if (lower.includes('cyborg') || lower.includes('android') || lower.includes('synthetic') || lower.includes('robot') || lower.includes('automaton')) {
      species = 'Cyborg / Synthetic';
    } else if (lower.includes('elf') || lower.includes('elven')) {
      species = 'Elf';
    } else if (lower.includes('dwarf') || lower.includes('dwarven')) {
      species = 'Dwarf';
    } else if (lower.includes('orc') || lower.includes('half-orc')) {
      species = 'Orc';
    } else if (lower.includes('tiefling') || lower.includes('demon') || lower.includes('fiend')) {
      species = 'Tiefling / Fiend';
    } else if (lower.includes('vampire') || lower.includes('dhampir')) {
      species = 'Vampire';
    } else if (lower.includes('dragonborn') || lower.includes('draconic') || lower.includes('dragon')) {
      species = 'Dragonborn';
    } else if (lower.includes('cosmic entity') || lower.includes('celestial') || lower.includes('astral entity') || lower.includes('starborn')) {
      species = 'Cosmic Entity';
    } else if (lower.includes('undead') || lower.includes('lich') || lower.includes('ghoul') || lower.includes('skeleton')) {
      species = 'Undead';
    } else if (lower.includes('beastfolk') || lower.includes('werewolf') || lower.includes('kitsune') || lower.includes('catgirl')) {
      species = 'Beastfolk';
    } else if (lower.includes('isekai') || lower.includes('transmigrat') || lower.includes('otherworld')) {
      species = 'Otherworlder';
    }

    // Determine Archetype & Profession
    let archetype = 'Adventurer';
    let profession = 'Specialist';

    if (lower.includes('soul reaper') || lower.includes('shinigami') || lower.includes('bleach')) {
      archetype = 'Spiritual Swordsman';
      profession = 'Soul Reaper';
    } else if (lower.includes('spellblade') || (lower.includes('sword') && lower.includes('magic'))) {
      archetype = 'Arcane Combatant';
      profession = 'Spellblade';
    } else if (lower.includes('hacker') || lower.includes('netrunner') || lower.includes('cyber')) {
      archetype = 'Cyber Infiltrator';
      profession = 'Netrunner';
    } else if (lower.includes('necromancer') || lower.includes('death magic')) {
      archetype = 'Death Weaver';
      profession = 'Necromancer';
    } else if (lower.includes('alchemist') || lower.includes('potion')) {
      archetype = 'Esoteric Artisan';
      profession = 'Alchemist';
    } else if (lower.includes('gunslinger') || lower.includes('marksman') || lower.includes('sniper')) {
      archetype = 'Sharpshooter';
      profession = 'Gunslinger';
    } else if (lower.includes('samurai') || lower.includes('ronin') || lower.includes('katana')) {
      archetype = 'Blademaster';
      profession = 'Samurai';
    } else if (lower.includes('paladin') || lower.includes('crusader') || lower.includes('holy knight')) {
      archetype = 'Holy Champion';
      profession = 'Paladin';
    } else if (lower.includes('mage') || lower.includes('wizard') || lower.includes('sorcerer') || lower.includes('witch') || lower.includes('arcanist')) {
      archetype = 'Arcanist';
      profession = 'Mage';
    } else if (lower.includes('assassin') || lower.includes('ninja') || lower.includes('stealth') || lower.includes('shadow')) {
      archetype = 'Shadow Operative';
      profession = 'Assassin';
    } else if (lower.includes('monk') || lower.includes('martial artist') || lower.includes('brawler')) {
      archetype = 'Martial Artist';
      profession = 'Monk';
    } else if (lower.includes('pilot') || lower.includes('mecha') || lower.includes('mech')) {
      archetype = 'Vanguard Pilot';
      profession = 'Mech Pilot';
    } else if (lower.includes('scholar') || lower.includes('researcher') || lower.includes('detective') || lower.includes('inquisitor')) {
      archetype = 'Investigator';
      profession = 'Scholar';
    } else if (lower.includes('ranger') || lower.includes('hunter') || lower.includes('archer')) {
      archetype = 'Wilderness Tracker';
      profession = 'Ranger';
    } else if (lower.includes('warrior') || lower.includes('soldier') || lower.includes('knight') || lower.includes('fighter')) {
      archetype = 'Martial Specialist';
      profession = 'Warrior';
    } else if (rawConcept.length > 0) {
      // Derive profession from key noun in prompt if possible
      const words = rawConcept.replace(/[^a-zA-Z\s]/g, '').split(/\s+/).filter((w) => w.length > 3);
      if (words.length > 0) {
        archetype = `${words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase()} Specialist`;
        profession = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
      }
    }

    // Generate context-themed name if not explicitly provided
    if (!name) {
      if (profession === 'Soul Reaper' || lower.includes('bleach') || lower.includes('samurai')) {
        name = 'Renjiro Kurosaki';
      } else if (species.includes('Cyborg') || profession === 'Netrunner') {
        name = 'Nova-09';
      } else if (species === 'Elf' || profession === 'Spellblade') {
        name = 'Lorien Silverleaf';
      } else if (species === 'Dwarf') {
        name = 'Thorin Ironforge';
      } else if (species.includes('Tiefling') || species.includes('Fiend')) {
        name = 'Malakor Voidwhisper';
      } else if (species === 'Cosmic Entity') {
        name = 'Astraea the Observer';
      } else if (profession === 'Mage' || profession === 'Necromancer') {
        name = 'Eldrin Spellweaver';
      } else if (profession === 'Assassin' || profession === 'Ranger') {
        name = 'Lyra Nightshade';
      } else if (profession === 'Paladin') {
        name = 'Valen Ironheart';
      } else {
        name = 'Dorian Vance';
      }
    }

    // Synthesize Capabilities based on authentic concept keywords
    const caps: any[] = [];
    if (lower.includes('soul reaper') || lower.includes('shinigami') || lower.includes('bleach')) {
      caps.push({
        id: 'cap_proc_1',
        name: 'Zanpakuto Manifestation',
        category: 'Combat',
        activationMode: 'immediate',
        powerTier: 'Major',
        baseEnergyCost: 20,
        baseStrainCost: 10,
        description: 'Awaken the soul-cutter blade to release concentrated spiritual cutting force.',
      });
      caps.push({
        id: 'cap_proc_2',
        name: 'Spiritual Pressure (Reiatsu)',
        category: 'Domain',
        activationMode: 'toggled',
        powerTier: 'Moderate',
        baseEnergyCost: 15,
        baseStrainCost: 5,
        description: 'Radiate dense spiritual aura that suppresses weaker foes and detects spiritual anomalies.',
      });
      caps.push({
        id: 'cap_proc_3',
        name: 'Flash Step (Shunpo)',
        category: 'Movement',
        activationMode: 'reaction',
        powerTier: 'Moderate',
        baseEnergyCost: 12,
        baseStrainCost: 4,
        description: 'Instantaneous high-speed spatial displacement using spirit particles.',
      });
    } else if (lower.includes('void') || lower.includes('spellblade')) {
      caps.push({
        id: 'cap_proc_1',
        name: 'Void Blade Weaving',
        category: 'Magic',
        activationMode: 'immediate',
        powerTier: 'Major',
        baseEnergyCost: 20,
        baseStrainCost: 8,
        description: 'Infuse edge weapons with spatial void energy that ignores physical armor.',
      });
      caps.push({
        id: 'cap_proc_2',
        name: 'Astral Step',
        category: 'Movement',
        activationMode: 'reaction',
        powerTier: 'Moderate',
        baseEnergyCost: 15,
        baseStrainCost: 5,
        description: 'Blink through interstitial reality to evade lethal impacts.',
      });
    } else if (lower.includes('cyber') || lower.includes('hacker') || species.includes('Cyborg')) {
      caps.push({
        id: 'cap_proc_1',
        name: 'Neural Breach Protocol',
        category: 'Domain',
        activationMode: 'immediate',
        powerTier: 'Moderate',
        baseEnergyCost: 15,
        baseStrainCost: 8,
        description: 'Transmit direct synaptic or digital exploits into target systems and synthetic nodes.',
      });
      caps.push({
        id: 'cap_proc_2',
        name: 'Subdermal Overclock',
        category: 'Biological',
        activationMode: 'charged',
        powerTier: 'Moderate',
        baseEnergyCost: 20,
        baseStrainCost: 12,
        description: 'Momentarily accelerate cybernetic reflex pathways to outpace organic adversaries.',
      });
    } else if (lower.includes('magic') || lower.includes('fire') || lower.includes('elemental') || profession === 'Mage') {
      caps.push({
        id: 'cap_proc_1',
        name: 'Elemental Surge',
        category: 'Magic',
        activationMode: 'immediate',
        powerTier: 'Moderate',
        baseEnergyCost: 25,
        baseStrainCost: 10,
        description: 'Harness localized atmospheric energy into offensive concussive blasts.',
      });
      caps.push({
        id: 'cap_proc_2',
        name: 'Arcane Ward',
        category: 'Domain',
        activationMode: 'immediate',
        powerTier: 'Minor',
        baseEnergyCost: 15,
        baseStrainCost: 5,
        description: 'Conjure a shimmering barrier of protective magical resonance.',
      });
    } else if (lower.includes('shadow') || lower.includes('stealth') || profession === 'Assassin') {
      caps.push({
        id: 'cap_proc_1',
        name: 'Shadow Weaving',
        category: 'Magic',
        activationMode: 'channelled',
        powerTier: 'Moderate',
        baseEnergyCost: 20,
        baseStrainCost: 5,
        description: "Ability to meld into shadows and obscure one's presence from detection.",
      });
      caps.push({
        id: 'cap_proc_2',
        name: 'Vanish',
        category: 'Movement',
        activationMode: 'reaction',
        powerTier: 'Minor',
        baseEnergyCost: 15,
        baseStrainCost: 10,
        description: 'Instantly disengage from direct sightlines in response to sudden threat.',
      });
    } else {
      caps.push({
        id: 'cap_proc_1',
        name: `${profession} Mastery`,
        category: 'Combat',
        activationMode: 'passive',
        powerTier: 'Moderate',
        baseEnergyCost: 10,
        baseStrainCost: 5,
        description: `Disciplined mastery and tactical execution tailored to ${profession}.`,
      });
      caps.push({
        id: 'cap_proc_2',
        name: 'Heightened Perception',
        category: 'Perception',
        activationMode: 'passive',
        powerTier: 'Minor',
        baseEnergyCost: 5,
        baseStrainCost: 0,
        description: 'Instinctively spot structural weaknesses and concealed ambushes.',
      });
    }

    // Skills derived directly from capabilities
    const skills: any[] = caps.flatMap((c) => [
      {
        name: `${c.name} Discharge`,
        description: `Focused execution invoking ${c.name}.`,
        parentCapabilityName: c.name,
        activationType: 'Action',
        energyCost: Math.max(8, Math.round(c.baseEnergyCost * 0.8)),
        cooldownTurns: 1,
        range: c.category === 'Movement' ? 'Self' : c.category === 'Combat' ? 'Melee' : 'Close',
      },
    ]);

    // Starting Equipment reflecting concept
    const weapons: string[] = [];
    const armor: string[] = [];
    const tools: string[] = [];
    const consumables: string[] = [];

    // Check if player mentioned weapons explicitly
    if (lower.includes('rapier')) weapons.push('Astral Rapier');
    else if (lower.includes('katana') || lower.includes('zanpakuto') || lower.includes('soul reaper') || lower.includes('bleach') || lower.includes('samurai')) weapons.push('Zanpakuto (Katana)');
    else if (lower.includes('bow')) weapons.push('Recurve Longbow');
    else if (lower.includes('gun') || lower.includes('rifle') || lower.includes('pistol')) weapons.push('Heavy Energy Pistol');
    else if (lower.includes('staff') || profession === 'Mage') weapons.push('Runed Oak Staff');
    else if (lower.includes('dagger') || profession === 'Assassin') weapons.push('Shadowed Dagger');
    else weapons.push('Tempered Steel Blade');

    // Check armor
    if (lower.includes('shihakusho') || lower.includes('soul reaper') || lower.includes('bleach')) armor.push('Black Shihakusho Robes');
    else if (lower.includes('runic leather') || lower.includes('leather armor')) armor.push('Runic Leather Armor');
    else if (lower.includes('plate') || lower.includes('power armor')) armor.push('Reinforced Plate Cuirass');
    else if (lower.includes('robe') || profession === 'Mage') armor.push('Silk Woven Robes');
    else armor.push('Reinforced Traveling Leathers');

    // Tools & Consumables
    if (lower.includes('soul reaper') || lower.includes('bleach')) {
      tools.push('Denreishinki (Soul Pager)', 'Spiritual Tracking Compass');
      consumables.push('Soul Candy (Gikongan)', 'Spirit Recovery Pill');
    } else if (species.includes('Cyborg') || profession === 'Netrunner') {
      tools.push('Cyberdeck Console', 'Multi-Frequency Signal Sniffer');
      consumables.push('Neural Coolant Ampoule (x2)', 'Battery Pack');
    } else {
      tools.push('Flint & Steel', 'Surveyor Map', 'Writ of Passage');
      consumables.push('Field Rations (3 days)', 'Vial of Healing Salve');
    }

    // World geography resolution
    const worldNodes = worldTemplate?.geography?.nodes || [];
    const firstLoc = worldNodes[0] || { id: 'loc_start_1', name: 'Sanctuary Gates', region: 'Borderland' };

    // Background & Lore
    let history = `Originating from distinct circumstances (${rawConcept}), ${name} now navigates ${worldTemplate?.title || 'this realm'}.`;
    if (lower.includes('isekai') || lower.includes('bleach') || lower.includes('soul reaper')) {
      history = `Formerly a Soul Reaper serving spiritual order, ${name} was violently transmigrated across dimensional rifts into ${worldTemplate?.title || 'an unfamiliar apocalyptic reality'}. Retaining spirit awareness and martial doctrine, ${name} must adapt to survive.`;
    }

    return {
      identity: {
        name,
        species,
        age: species === 'Elf' ? 120 : species === 'Soul Reaper' || species.includes('Soul Reaper') ? 150 : 26,
        gender: 'Not Specified',
      },
      appearance: {
        physicalDescription: `Stalwart ${species} ${profession} bearing field-worn traveling attire, focused posture, and an aura resonant with ${rawConcept}.`,
        distinguishingTraits: [
          lower.includes('bleach') || lower.includes('soul reaper') ? 'Black ceremonial robes with sheathed Zanpakuto' : 'Distinctive emblem and observant gaze',
          'Aura of disciplined resolve',
        ],
      },
      personality: {
        traits: ['Methodical', 'Pragmatic', 'Vigilant'],
        temperament: lower.includes('isekai') ? 'Displaced yet resolute' : 'Calm under pressure',
        values: ['Honor', 'Survival', 'Mastery'],
      },
      background: {
        history,
        upbringing: lower.includes('bleach') ? 'Seireitei Spiritual Academy' : 'Frontier territory',
        importantEvents: [
          lower.includes('isekai') ? 'Cataclysmic dimensional crossing' : 'Survived perilous border crossing',
          'Initial foothold established in new realm',
        ],
      },
      role: {
        archetype,
        profession,
        role: 'Protagonist',
      },
      motivations: {
        goals: [
          lower.includes('isekai') ? 'Decipher dimensional rift and find anchor point' : 'Unravel rumors of ancient relics',
          'Secure foothold in this territory',
        ],
        fears: ['Loss of identity or permanent entrapment'],
        desires: ['Mastery and freedom'],
      },
      relationships: {
        allies: ['Local ally'],
        rivals: ['Encroaching syndicate'],
        family: ['Distant origins'],
        factions: [profession === 'Soul Reaper' ? 'Gotei Vanguard (Remnant)' : 'Explorers Guild'],
      },
      condition: {
        injuries: [],
        curses: [],
        forms: ['Humanoid'],
        specialStates: ['Dimensional Acclimation'],
      },
      capabilities: caps,
      generatedSkills: skills,
      startingEquipment: {
        weapons,
        armor,
        tools,
        consumables,
      },
      startingLocation: {
        locationId: firstLoc.id,
        name: firstLoc.name,
        region: firstLoc.region || 'Frontier',
      },
      startingSituation: {
        summary: `Arriving in ${firstLoc.name}, taking measure of the surroundings and strange local atmospheric currents.`,
        hook: lower.includes('apocalyp') ? 'Ruinous anomalies pulse along the horizon as strange beasts prowl.' : 'An urgent summons arrives concerning local disruptions.',
        initialConditions: 'Dense twilight descending across the landscape.',
        whyHereNow: 'Seeking information on how to navigate this world and confront looming threats.',
      },
      portraitAsset: {
        promptFallback: `Heroic portrait of ${name}, ${species} ${profession} in ${worldTemplate?.title || 'fantasy'} setting, cinematic rim lighting.`,
        emoji: this.getEmojiForRole(profession),
      },
    };
  }

  private proceduralCustomCapability(concept: string): any {
    return {
      name: concept.trim() || 'Custom Talent',
      category: 'Magic',
      activationMode: 'immediate',
      powerTier: 'Moderate',
      baseEnergyCost: 20,
      baseStrainCost: 10,
      description: `Innate capability manifesting as ${concept}.`,
      techniques: [
        {
          name: `${concept} Discharge`,
          description: `Focused discharge harnessing ${concept}.`,
          activationType: 'Action',
          energyCost: 15,
          cooldownTurns: 1,
          range: 'Close',
        },
        {
          name: `${concept} Veil`,
          description: `Defensive adaptation channeling ${concept}.`,
          activationType: 'Reaction',
          energyCost: 10,
          cooldownTurns: 2,
          range: 'Self',
        },
      ],
    };
  }

  private getEmojiForRole(role: string): string {
    const r = (role || '').toLowerCase();
    if (r.includes('soul reaper') || r.includes('shinigami') || r.includes('samurai')) return '⚔️';
    if (r.includes('mage') || r.includes('wizard') || r.includes('arcanist')) return '🧙';
    if (r.includes('warrior') || r.includes('knight') || r.includes('paladin')) return '⚔️';
    if (r.includes('rogue') || r.includes('thief') || r.includes('shadow') || r.includes('assassin')) return '🗡️';
    if (r.includes('ranger') || r.includes('scout') || r.includes('archer')) return '🏹';
    if (r.includes('cleric') || r.includes('priest')) return '✨';
    if (r.includes('cyborg') || r.includes('synthetic') || r.includes('netrunner') || r.includes('hacker') || r.includes('robot')) return '🤖';
    return '👤';
  }
}

export const characterGenesisService = new CharacterGenesisService();

