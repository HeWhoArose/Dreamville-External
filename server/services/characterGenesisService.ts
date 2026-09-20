import { worldRepository } from '../repositories/worldRepository';
import {
  CharacterGenesisDraft,
  ConfirmedCharacter,
  CharacterExtractionRequest,
  CustomCapabilityProposalRequest,
  CapabilityDefinition,
  GeneratedTechnique,
  StartingEquipmentConfig,
  StartingEquipmentItem,
  StartingLocationConfig,
  StartingSituationConfig,
  CharacterPortraitAsset,
  CharacterProvenanceSource,
  WorldTemplate,
} from '../../src/types';

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
    const userEditedFields = new Set(input.userEditedFields || []);

    const draftId = existingDraft?.draftId || `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    let extracted: any = null;
    const prompt = `You are a master character designer for narrative RPGs.
Given this character concept and world context, extract and design a complete, deeply detailed character draft.

WORLD CONTEXT:
Title: ${worldTemplate?.title || 'Unknown World'}
Genre: ${worldTemplate?.genreTags?.join(', ') || 'Fantasy'}
Tone: ${worldTemplate?.toneTags?.join(', ') || 'Heroic'}
Setting: ${worldTemplate?.setting || 'Realm'}
Era: ${worldTemplate?.defaultEra || worldTemplate?.era || 'Current Era'}
World Rules: ${JSON.stringify(worldTemplate?.worldRules || worldTemplate?.ruleConstraints || [])}
Available Locations: ${JSON.stringify(
      (worldTemplate?.geography?.nodes || []).map((n: any) => ({ id: n.id, name: n.name, region: n.region }))
    )}

CHARACTER CONCEPT:
"${concept}"

OUTPUT MUST BE STRICT JSON with the following structure:
{
  "identity": { "name": string, "species": string, "age": number or string, "gender": string },
  "appearance": { "physicalDescription": string, "distinguishingTraits": [string] },
  "personality": { "traits": [string], "temperament": string, "values": [string] },
  "background": { "history": string, "upbringing": string, "importantEvents": [string] },
  "role": { "archetype": string, "profession": string, "role": string },
  "motivations": { "goals": [string], "fears": [string], "desires": [string] },
  "relationships": { "allies": [string], "rivals": [string], "family": [string], "factions": [string] },
  "condition": { "injuries": [string], "curses": [string], "forms": [string], "specialStates": [string] },
  "capabilities": [
    {
      "id": string,
      "name": string,
      "category": "Combat" | "Magic" | "Movement" | "Domain" | "Perception" | "Biological" | "Social",
      "activationMode": "immediate" | "passive" | "reaction" | "charged" | "channelled" | "toggled",
      "powerTier": "Minor" | "Moderate" | "Major" | "WorldScale",
      "baseEnergyCost": number,
      "baseStrainCost": number,
      "description": string
    }
  ],
  "generatedSkills": [
    {
      "name": string,
      "description": string,
      "parentCapabilityName": string,
      "activationType": string,
      "energyCost": number,
      "cooldownTurns": number,
      "range": string
    }
  ],
  "startingEquipment": {
    "weapons": [string],
    "armor": [string],
    "tools": [string],
    "consumables": [string]
  },
  "startingLocation": {
    "locationId": string,
    "name": string,
    "region": string
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
  }
}`;

    // Use the canonical model orchestrator so Genesis respects configured
    // task routing, provider health, fallbacks, and deterministic emergency behavior.
    try {
      const orchestrator = worldRepository.getAiOrchestrator();
      const response = await orchestrator.executeTaskGeneration(
        'narrative.generate',
        prompt,
        'Return only the requested Character Genesis JSON. Treat the player concept as authoritative input; do not overwrite preserved user fields.'
      );
      if (response.text) {
        extracted = this.parseJsonFromAiResponse(response.text);
      }
    } catch (err) {
      console.warn('[CharacterGenesisService] Orchestrated extraction failed, using procedural fallback:', err);
      extracted = null;
    }

    // If Gemini was unavailable or returned invalid output, run procedural synthesis
    if (!extracted || !extracted.identity?.name) {
      extracted = this.proceduralExtraction(concept, worldTemplate);
    }

    // Build canonical draft assembling all sections
    const provenance: Record<string, CharacterProvenanceSource> = {
      sourceDescription: 'PLAYER_INPUT',
      identity: userEditedFields.has('identity') || userEditedFields.has('identity.name') ? 'USER_EDITED' : 'AI_GENERATED',
      appearance: userEditedFields.has('appearance') ? 'USER_EDITED' : 'AI_GENERATED',
      personality: userEditedFields.has('personality') ? 'USER_EDITED' : 'AI_GENERATED',
      background: userEditedFields.has('background') ? 'USER_EDITED' : 'AI_GENERATED',
      role: userEditedFields.has('role') ? 'USER_EDITED' : 'AI_GENERATED',
      motivations: userEditedFields.has('motivations') ? 'USER_EDITED' : 'AI_GENERATED',
      relationships: userEditedFields.has('relationships') ? 'USER_EDITED' : 'AI_GENERATED',
      condition: userEditedFields.has('condition') ? 'USER_EDITED' : 'AI_GENERATED',
      capabilities: userEditedFields.has('capabilities') ? 'USER_EDITED' : 'AI_GENERATED',
      generatedSkills: userEditedFields.has('generatedSkills') ? 'USER_EDITED' : 'AI_GENERATED',
      startingEquipment: userEditedFields.has('startingEquipment') ? 'USER_EDITED' : 'AI_GENERATED',
      startingLocation: userEditedFields.has('startingLocation') ? 'USER_EDITED' : 'WORLD_DERIVED',
      startingSituation: userEditedFields.has('startingSituation') ? 'USER_EDITED' : 'AI_GENERATED',
      portraitAsset: userEditedFields.has('portraitAsset') ? 'USER_EDITED' : 'SYSTEM_DERIVED',
    };

    // Sanitize & link capabilities
    const capabilities: CapabilityDefinition[] = (
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
            description: c.description || 'Special capability.',
            provenance: 'AI_GENERATED',
          }))
    );

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
              provenance: 'AI_GENERATED' as CharacterProvenanceSource,
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
      const weapons = Array.isArray(rawEq.weapons) ? rawEq.weapons : ['Iron Longsword'];
      const armor = Array.isArray(rawEq.armor) ? rawEq.armor : ['Leather Cuirass'];
      const tools = Array.isArray(rawEq.tools) ? rawEq.tools : ['Torch', 'Lockpicks'];
      const consumables = Array.isArray(rawEq.consumables) ? rawEq.consumables : ['Bread Rations (x3)', 'Healing Salve'];

      const equipped: StartingEquipmentItem[] = [
        ...weapons.slice(0, 1).map((w: string, i: number) => ({
          id: `eq_w_${i}`,
          name: w,
          category: 'Weapon',
          slot: 'mainHand',
          isEquipped: true,
          quantity: 1,
          provenance: 'AI_GENERATED' as CharacterProvenanceSource,
        })),
        ...armor.slice(0, 1).map((a: string, i: number) => ({
          id: `eq_a_${i}`,
          name: a,
          category: 'Armor',
          slot: 'body',
          isEquipped: true,
          quantity: 1,
          provenance: 'AI_GENERATED' as CharacterProvenanceSource,
        })),
      ];

      const inventory: StartingEquipmentItem[] = [
        ...weapons.slice(1).map((w: string, i: number) => ({
          id: `inv_w_${i}`,
          name: w,
          category: 'Weapon',
          isEquipped: false,
          quantity: 1,
          provenance: 'AI_GENERATED' as CharacterProvenanceSource,
        })),
        ...armor.slice(1).map((a: string, i: number) => ({
          id: `inv_a_${i}`,
          name: a,
          category: 'Armor',
          isEquipped: false,
          quantity: 1,
          provenance: 'AI_GENERATED' as CharacterProvenanceSource,
        })),
        ...tools.map((t: string, i: number) => ({
          id: `inv_t_${i}`,
          name: t,
          category: 'Tool',
          isEquipped: false,
          quantity: 1,
          provenance: 'AI_GENERATED' as CharacterProvenanceSource,
        })),
        ...consumables.map((c: string, i: number) => ({
          id: `inv_c_${i}`,
          name: c,
          category: 'Potion',
          isEquipped: false,
          quantity: 1,
          provenance: 'AI_GENERATED' as CharacterProvenanceSource,
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
          role: extracted.role?.role || 'Protagonist',
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
      provenance: 'AI_GENERATED' as CharacterProvenanceSource,
    });

    const attributes = Array.isArray(extracted.attributes) ? extracted.attributes.map((entry: any, idx: number) => toStat(entry, idx, 'Attribute')) : [];
    const stats = Array.isArray(extracted.stats) ? extracted.stats.map((entry: any, idx: number) => toStat(entry, idx, 'Stat')) : [];
    const traits = Array.isArray(extracted.traits) ? extracted.traits.map(String) : (Array.isArray(extracted.personality?.traits) ? extracted.personality.traits.map(String) : []);

    const mapEffects = (effects: any, sourceId: string): any[] => Array.isArray(effects) ? effects.map((effect: any, idx: number) => ({
      id: effect?.id || 'effect_' + sourceId + '_' + (idx + 1),
      type: String(effect?.type || 'narrative_modifier'),
      target: effect?.target,
      scope: effect?.scope,
      modifier: typeof effect?.modifier === 'number' ? effect.modifier : undefined,
      value: effect?.value,
      condition: effect?.condition,
      description: String(effect?.description || 'Contextual effect.'),
      sourceId,
      provenance: 'AI_GENERATED' as CharacterProvenanceSource,
    })) : [];

    const feats = Array.isArray(extracted.feats) ? extracted.feats.map((feat: any, idx: number) => {
      const id = feat?.id || 'feat_' + draftId + '_' + (idx + 1);
      return { id, name: String(feat?.name || 'Feat ' + (idx + 1)), description: String(feat?.description || ''), effects: mapEffects(feat?.effects, id), prerequisites: Array.isArray(feat?.prerequisites) ? feat.prerequisites.map(String) : [], tags: Array.isArray(feat?.tags) ? feat.tags.map(String) : [], provenance: 'AI_GENERATED' as CharacterProvenanceSource, worldId };
    }) : [];

    const titles = Array.isArray(extracted.titles) ? extracted.titles.map((title: any, idx: number) => {
      const id = title?.id || 'title_' + draftId + '_' + (idx + 1);
      return { id, name: String(title?.name || 'Title ' + (idx + 1)), description: String(title?.description || ''), effects: mapEffects(title?.effects, id), provenance: 'AI_GENERATED' as CharacterProvenanceSource, worldId };
    }) : [];

    const aiExtractionSummary = extracted.aiExtractionSummary ? {
      interpretation: String(extracted.aiExtractionSummary.interpretation || ''),
      keyFacts: Array.isArray(extracted.aiExtractionSummary.keyFacts) ? extracted.aiExtractionSummary.keyFacts.map(String) : [],
      proposedHighlights: Array.isArray(extracted.aiExtractionSummary.proposedHighlights) ? extracted.aiExtractionSummary.proposedHighlights.map(String) : [],
      uncertainties: Array.isArray(extracted.aiExtractionSummary.uncertainties) ? extracted.aiExtractionSummary.uncertainties.map(String) : [],
    } : { interpretation: concept, keyFacts: [identity.name, identity.species, role.profession || role.archetype].filter(Boolean), proposedHighlights: capabilities.map((c) => c.name), uncertainties: [] };
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
      startingLocationMode: 'AI_SUGGEST',
      startingSituationMode: 'AI_SUGGEST',
      startingState: {
        healthCurrent: 100,
        healthMax: 100,
        energyCurrent: 100,
        energyMax: 100,
        fatigue: 0,
        stress: 0,
        conditions: [...condition.injuries.map(String), ...condition.curses.map(String), ...condition.specialStates.map(String)],
        activeEffects: [],
        reputations: {},
        relationshipModifiers: {},
      },
      portraitAsset,
      aiExtractionSummary,
      provenance,
      fieldLocks: [],
      revision: 1,
      revisionHistory: [],
      validationState: {
        isValid: true,
        errors: [],
        warnings: [],
      },
      createdAt: existingDraft?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Run structural & world rule validation
    const validation = this.validateCharacterDraft(draft, worldTemplate);
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
    const prompt = `You are a system designer for narrative RPG magic and combat systems.
Given this custom capability concept and world setting, generate a structured capability definition with 2 to 3 linked concrete techniques.

WORLD CONTEXT:
Title: ${worldTemplate?.title || 'Unknown World'}
Genre: ${worldTemplate?.genreTags?.join(', ') || 'Fantasy'}

CAPABILITY CONCEPT:
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
}`;
    try {
      const orchestrator = worldRepository.getAiOrchestrator();
      const response = await orchestrator.executeTaskGeneration(
        'narrative.generate',
        prompt,
        'Return only the requested structured custom capability JSON.'
      );
      if (response.text) {
        proposal = this.parseJsonFromAiResponse(response.text);
      }
    } catch (err) {
      console.warn('[CharacterGenesisService] Orchestrated custom capability proposal failed, using procedural fallback:', err);
    }

    if (!proposal || !proposal.name) {
      proposal = this.proceduralCustomCapability(concept);
    }

    const capability: CapabilityDefinition = {
      id: capId,
      name: proposal.name || concept,
      category: proposal.category || 'Magic',
      activationMode: proposal.activationMode || 'immediate',
      powerTier: proposal.powerTier || 'Moderate',
      baseEnergyCost: Number(proposal.baseEnergyCost ?? 20),
      baseStrainCost: Number(proposal.baseStrainCost ?? 10),
      minVesselCapacityRequired: 15,
      description: proposal.description || `Specialized mastery of ${concept}.`,
      provenance: 'PLAYER_INPUT',
      sourceUserPrompt: concept,
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
      provenance: 'AI_GENERATED' as CharacterProvenanceSource,
    }));

    return {
      ...capability,
      generatedSkills,
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
      storyMode: draft.storyMode,
      dndRulesMode: draft.dndRulesMode,
    };

    return confirmed;
  }

  // -------------------------------------------------------------
  // Internal Procedural Fallbacks & Keyword Parsers
  // -------------------------------------------------------------

  /**
   * Robust JSON extractor from model output. Handles raw JSON, markdown-fenced JSON,
   * conversational surrounding text, trailing commas, and whitespace/control characters.
   */
  public parseJsonFromAiResponse(text: string): any {
    if (!text || typeof text !== 'string') return null;

    let cleaned = text.trim();

    // 1. Check for markdown code fences (```json ... ``` or ``` ... ```)
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }

    // 2. Extract outermost JSON object or array if embedded in conversational text
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1).trim();
    }

    // 3. First attempt direct parse
    try {
      return JSON.parse(cleaned);
    } catch {
      // 4. Sanitize trailing commas and stray control characters
      try {
        const sanitized = cleaned
          .replace(/,\s*([\]\}])/g, '$1') // remove trailing commas before ] or }
          .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''); // strip non-printable control chars
        return JSON.parse(sanitized);
      } catch {
        return null;
      }
    }
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

