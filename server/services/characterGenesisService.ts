import { GoogleGenAI, Type } from '@google/genai';
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

    // Try Gemini extraction if API key is present
    let extracted: any = null;
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey && concept.trim().length > 0) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });

        const prompt = `You are a master character designer for narrative RPGs.
Given this character concept and world context, extract and design a complete, deeply detailed character draft.

Treat feats and titles as extensible data. Do not restrict them to a predefined list. Propose custom feats/titles when the concept, background, achievements, or world context imply them. A feat may have structured narrative effects such as reputation, NPC disposition, proficiency, or other rules effects. Keep those effects explainable and structured.

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
  "attributes": [{ "name": string, "value": number, "description": string }],
  "stats": [{ "name": string, "value": number, "description": string }],
  "traits": [string],
  "feats": [{ "name": string, "description": string, "effects": [{ "type": string, "scope": string, "modifier": number, "description": string }] }],
  "titles": [{ "name": string, "description": string, "effects": [{ "type": string, "scope": string, "modifier": number, "description": string }] }],
  "aiExtractionSummary": { "interpretation": string, "keyFacts": [string], "proposedHighlights": [string], "uncertainties": [string] },
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

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            temperature: 0.4,
            responseMimeType: 'application/json',
          },
        });

        if (response.text) {
          extracted = JSON.parse(response.text);
        }
      } catch (err) {
        console.warn('[CharacterGenesisService] Gemini extraction failed or unavailable, using procedural fallback:', err);
        extracted = null;
      }
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
    const apiKey = process.env.GEMINI_API_KEY;

    let proposal: any = null;

    if (apiKey && concept.trim().length > 0) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });

        const prompt = `Propose a balanced, structured capability definition and 2 complementary techniques for this concept in an RPG world.

WORLD: ${worldTemplate?.title} (${worldTemplate?.genreTags?.join(', ')})
CONCEPT: "${concept}"
CHARACTER CONTEXT: ${JSON.stringify(input.characterContext || {})}

Respond in pure JSON:
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

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            temperature: 0.3,
            responseMimeType: 'application/json',
          },
        });

        if (response.text) {
          proposal = JSON.parse(response.text);
        }
      } catch (err) {
        console.warn('[CharacterGenesisService] Custom capability AI proposal failed, using procedural fallback:', err);
      }
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

  private proceduralExtraction(concept: string, worldTemplate: WorldTemplate): any {
    const lower = concept.toLowerCase();

    // Extract name or archetype
    let name = 'Kaelen Thorne';
    if (lower.includes('named ')) {
      const match = concept.match(/named\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
      if (match) name = match[1];
    } else if (lower.includes('warrior')) {
      name = 'Valen Ironheart';
    } else if (lower.includes('mage') || lower.includes('wizard') || lower.includes('sorcerer')) {
      name = 'Eldrin Spellweaver';
    } else if (lower.includes('rogue') || lower.includes('thief') || lower.includes('shadow')) {
      name = 'Lyra Nightshade';
    } else if (lower.includes('paladin') || lower.includes('knight')) {
      name = 'Sir Donald the Resolute';
    }

    // Role / Archetype
    let archetype = 'Adventurer';
    let profession = 'Scout';
    if (lower.includes('mage') || lower.includes('wizard')) {
      archetype = 'Arcanist';
      profession = 'Mage';
    } else if (lower.includes('warrior') || lower.includes('soldier') || lower.includes('knight')) {
      archetype = 'Martial Specialist';
      profession = 'Warrior';
    } else if (lower.includes('rogue') || lower.includes('assassin') || lower.includes('ranger')) {
      archetype = 'Covert Scout';
      profession = 'Ranger';
    }

    // Species
    let species = 'Human';
    if (lower.includes('elf') || lower.includes('elven')) species = 'Elf';
    else if (lower.includes('dwarf') || lower.includes('dwarven')) species = 'Dwarf';
    else if (lower.includes('orc') || lower.includes('half-orc')) species = 'Orc';
    else if (lower.includes('tiefling')) species = 'Tiefling';
    else if (lower.includes('android') || lower.includes('cyborg')) species = 'Synthetic';

    // Capabilities based on concept
    const caps: any[] = [];
    if (lower.includes('shadow') || lower.includes('stealth')) {
      caps.push({
        id: 'cap_proc_1',
        name: 'Shadow Weaving',
        category: 'Magic',
        activationMode: 'channelled',
        powerTier: 'Moderate',
        baseEnergyCost: 20,
        baseStrainCost: 5,
        description: 'Ability to meld into shadows and obscure one\'s presence from detection.',
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
    } else if (lower.includes('magic') || lower.includes('fire') || lower.includes('elemental')) {
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
    } else {
      caps.push({
        id: 'cap_proc_1',
        name: 'Battle Rhythm',
        category: 'Combat',
        activationMode: 'passive',
        powerTier: 'Moderate',
        baseEnergyCost: 10,
        baseStrainCost: 10,
        description: 'Heightened reflexes and tempo control under active physical duress.',
      });
      caps.push({
        id: 'cap_proc_2',
        name: 'Keen Eye',
        category: 'Perception',
        activationMode: 'passive',
        powerTier: 'Minor',
        baseEnergyCost: 5,
        baseStrainCost: 0,
        description: 'Instinctively spot structural weaknesses and concealed ambushes.',
      });
    }

    // Skills derived from capabilities
    const skills: any[] = caps.flatMap((c) => [
      {
        name: `${c.name} Pulse`,
        description: `Active discharge invoking ${c.name}.`,
        parentCapabilityName: c.name,
        activationType: 'Action',
        energyCost: 12,
        cooldownTurns: 1,
        range: 'Close',
      },
    ]);

    // Locations from world
    const worldNodes = worldTemplate?.geography?.nodes || [];
    const firstLoc = worldNodes[0] || { id: 'loc_start_1', name: 'Sanctuary Gates', region: 'Borderland' };

    return {
      identity: {
        name,
        species,
        age: 30,
        gender: 'Not Specified',
      },
      appearance: {
        physicalDescription: `Stalwart ${species} bearing field-worn traveling attire and watchful demeanor.`,
        distinguishingTraits: ['Signature hooded cloak', 'Scar on knuckle'],
      },
      personality: {
        traits: ['Methodical', 'Pragmatic', 'Vigilant'],
        temperament: 'Calm under pressure',
        values: ['Honor', 'Curiosity'],
      },
      background: {
        history: `Trained across various frontiers before answering the call to explore ${worldTemplate?.title || 'the region'}.`,
        upbringing: 'Settlement fringe',
        importantEvents: ['Survived perilous crossing', 'Forged initial pact of neutrality'],
      },
      role: {
        archetype,
        profession,
        role: 'Protagonist',
      },
      motivations: {
        goals: ['Unravel rumors of ancient relics', 'Secure foothold in new territory'],
        fears: ['Entrapment in forgotten depths'],
        desires: ['Mastery and freedom'],
      },
      relationships: {
        allies: ['Local guildmaster'],
        rivals: ['Encroaching syndicate'],
        family: ['Distant kinsfolk'],
        factions: ['Explorers Guild'],
      },
      condition: {
        injuries: [],
        curses: [],
        forms: ['Humanoid'],
        specialStates: ['Well-prepared'],
      },
      capabilities: caps,
      generatedSkills: skills,
      startingEquipment: {
        weapons: [profession === 'Mage' ? 'Runed Oak Staff' : 'Tempered Steel Blade'],
        armor: ['Reinforced Traveling Leathers'],
        tools: ['Flint & Steel', 'Writ of Passage', 'Surveyor Map'],
        consumables: ['Field Rations (3 days)', 'Vial of Antidote'],
      },
      startingLocation: {
        locationId: firstLoc.id,
        name: firstLoc.name,
        region: firstLoc.region || 'Frontier',
      },
      startingSituation: {
        summary: `Standing at the threshold of ${firstLoc.name}.`,
        hook: 'A messenger has failed to return from the outbound road.',
        initialConditions: 'Dense twilight descending across the landscape.',
        whyHereNow: 'Contracted to investigate anomalies within the local sector.',
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
    if (r.includes('mage') || r.includes('wizard')) return '🧙';
    if (r.includes('warrior') || r.includes('knight') || r.includes('paladin')) return '⚔️';
    if (r.includes('rogue') || r.includes('thief') || r.includes('shadow') || r.includes('assassin')) return '🗡️';
    if (r.includes('ranger') || r.includes('scout') || r.includes('archer')) return '🏹';
    if (r.includes('cleric') || r.includes('priest')) return '✨';
    if (r.includes('cyborg') || r.includes('synthetic')) return '🤖';
    return '👤';
  }
}

export const characterGenesisService = new CharacterGenesisService();
