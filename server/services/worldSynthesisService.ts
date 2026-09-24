import { rulesProfileEngine } from '../domain/rulesProfileEngine';
import { narrativeProfileEngine } from '../domain/narrativeProfileEngine';
import { worldRepository } from '../repositories/worldRepository';
import { WorldTemplate, WorldSynthesisInput } from '../../src/types';
import { MultiModelOrchestrator } from '../domain/aiOrchestrator';
import { deterministicId, hashStringToSeed } from '../domain/deterministicRng';

export interface StructuredWorldRule {
  ruleId: string;
  ruleType: 'CAPABILITY_RESTRICTION' | 'CANON_RULE' | 'ENVIRONMENTAL_CONSTRAINT';
  description: string;
  validated: boolean;
}

export interface StructuredWorldCapability {
  capabilityId: string;
  source: 'AI_PROPOSAL' | 'SYSTEM_DEFAULT';
  name: string;
  powerTier: 'Minor' | 'Moderate' | 'Major' | 'WorldScale';
  validated: boolean;
  description?: string;
}

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'could', 'did', 'do', 'does', 'doing', 'down',
  'during', 'each', 'entirely', 'few', 'for', 'from', 'further', 'had', 'has',
  'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just',
  'made', 'make', 'makes', 'me', 'more', 'most', 'my', 'myself', 'no', 'nor',
  'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours',
  'ourselves', 'out', 'over', 'own', 'people', 'same', 'she', 'should', 'so',
  'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves',
  'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
  'turn', 'turned', 'turning', 'turns', 'under', 'until', 'up', 'very', 'was',
  'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why',
  'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves'
]);

function createSeededRng(seedStr: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let state = h;
  return function next(): number {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickOne<T>(rng: () => number, list: T[]): T {
  const idx = Math.floor(rng() * list.length);
  return list[Math.max(0, Math.min(list.length - 1, idx))];
}

function extractPremiseTokens(premise: string): string[] {
  const words = premise
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(Boolean);

  const filtered = words.filter(w => !STOP_WORDS.has(w.toLowerCase()) && w.length > 2);
  const selected = filtered.length > 0 ? filtered : words.filter(w => w.length > 1);
  return selected.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export class WorldSynthesisService {
  private readonly getAiOrchestrator: () => MultiModelOrchestrator;

  constructor(orchestratorProvider?: () => MultiModelOrchestrator) {
    this.getAiOrchestrator = orchestratorProvider || (() => worldRepository.getAiOrchestrator());
  }

  /**
   * Synthesizes a WorldTemplate based on the user premise.
   * Leverages the MultiModelOrchestrator for AI generation.
   * Falls back to a deterministic, premise-faithful procedural world builder when offline.
   */
  public async synthesizeWorldFromPremise(input: WorldSynthesisInput): Promise<WorldTemplate> {
    const generationSeed = input.generationSeed && input.generationSeed.trim()
      ? input.generationSeed.trim()
      : `seed_${hashStringToSeed(JSON.stringify({
          premise: input.naturalLanguagePremise,
          title: input.title || '',
          setting: input.setting || '',
          era: input.defaultEra || '',
          genreTags: input.genreTags || [],
          toneTags: input.toneTags || [],
          mediumTags: input.mediumTags || [],
          dndRulesMode: input.dndRulesMode || 'FULL_DND',
          storyMode: input.storyMode || 'PROTAGONIST',
        })).toString(16)}`;

    const worldId = deterministicId('world_syn', generationSeed, input.naturalLanguagePremise, input.title || '');
    const timestamp = hashStringToSeed(generationSeed).toString(16);

    let title = input.title || '';
    let summary = '';
    let description = '';
    let genreTags = input.genreTags && input.genreTags.length > 0 ? input.genreTags : [];
    let toneTags = input.toneTags && input.toneTags.length > 0 ? input.toneTags : [];
    let mediumTags = input.mediumTags && input.mediumTags.length > 0 ? input.mediumTags : [];
    let era = input.defaultEra || '';
    let setting = input.setting || '';

    let locations: any[] = [];
    let characters: any[] = [];
    let factions: any[] = [];
    let events: any[] = [];
    let capabilities: any[] = [];
    let worldRules: any[] = [];
    let storyCheckChallenges: any[] = [];
    let hazards: any[] = [];
    let parsedAiPayload: any = null;

    let generationSource: 'AI_PRIMARY' | 'AI_FALLBACK' | 'DETERMINISTIC_FALLBACK' = 'AI_PRIMARY';
    let providerId = 'google_gemini';
    let modelId = 'gemini-3.6-flash';
    let fallbackReason: string | undefined;
    let attemptCount = 1;

    const resolvedNarrativeProfile = narrativeProfileEngine.resolve({
      mode: input.storyMode,
      narrativeProfile: input.narrativeProfile,
      fallbackMode: 'PROTAGONIST',
      source: 'WORLD',
    });
    const requestedStoryMode = resolvedNarrativeProfile.profile.mode;

    const requestedRulesMode = input.dndRulesMode || 'FULL_DND';
    const challengeResolutionInstruction = requestedRulesMode === 'CUSTOM_HOMEBREW_DND'
      ? 'ACTIVE RULE MODE: CUSTOM_HOMEBREW_DND.\n- Do not assume D&D checks, saving throws, spell slots, attack rolls, or tactical combat.\n- Every authored storyCheckChallenge MUST declare resolutionMode as "CUSTOM_D20" or "NARRATIVE".\n- Use "DND_STANDARD" only when the authored world rule explicitly requires the D&D resolver.\n- CUSTOM_D20 may include customModifier; its modifier is the authored custom rule, not a D&D ability/proficiency modifier.'
      : requestedRulesMode === 'HYBRID_DND'
      ? 'ACTIVE RULE MODE: HYBRID_DND.\n- D&D mechanics are the baseline.\n- Any deviation must be explicit in an authored rule or override.\n- Challenge resolutionMode may be "DND_STANDARD", "CUSTOM_D20", or "NARRATIVE" when the world explicitly defines it.'
      : 'ACTIVE RULE MODE: FULL_DND.\n- Use standard D&D mechanics for mechanical challenges.\n- Do not invent custom overrides from prose; explicit world overrides are not permitted in FULL_DND.';

    const systemInstruction = `You are an expert campaign director and world builder for premium tabletop-style fantasy/scifi simulators.
Your task is to take a natural language world premise and synthesize a complete, highly structured campaign world template.
You must return a valid, pure JSON object with NO markdown formatting, wrapping, or extra text.

CRITICAL INSTRUCTIONS FOR RULE RESOLUTION:
${challengeResolutionInstruction}

CRITICAL INSTRUCTIONS FOR NARRATIVE MODE:
- ACTIVE NARRATIVE MODE: ${requestedStoryMode}
- NARRATIVE PROFILE ID: ${resolvedNarrativeProfile.profile.profileId}
- CAMERA: ${resolvedNarrativeProfile.profile.camera}
- PLAYER AGENCY: ${resolvedNarrativeProfile.profile.playerAgency}
- ${resolvedNarrativeProfile.profile.description}
- Narrative mode is canonical campaign metadata. Do not encode it as a world event and do not let generated prose silently change it.

CRITICAL INSTRUCTIONS FOR PLANNED WORLD EVENTS:
- You must generate between 5 and 10 meaningful planned world events.
- These events represent plausible future or background developments belonging to the world itself BEFORE the player begins playing.
- The events MUST NOT assume that the player exists, participates, accepts any quests, or is the hero of these events.
- Some events should have causal dependencies on preceding events (referenced in preconditions.requiredEvents by their ID).
- Each event must have structured consequences that modify world facts, location states, faction influence, actor states, etc.
- Do NOT encode story mode or rule modes inside the events.
- All scheduled times must start from Year 42, Month 10, Day 14 (or later) and use standard numbers for month, day, hour, etc.
- Return locations, factions, characters, and events with aligned, cross-referenced IDs.

The JSON schema must strictly be:
{
  "title": "A short, evocative world title",
  "summary": "A concise, elegant single-sentence summary of the world",
  "description": "A detailed multi-paragraph background detailing history, atmosphere, and state of affairs",
  "genreTags": ["string"],
  "toneTags": ["string"],
  "mediumTags": ["string"],
  "era": "e.g. Age of Ruin",
  "setting": "The geographic setting name",
  "geography": {
    "locations": [
      {
        "id": "loc_xxx",
        "name": "Location Name",
        "description": "Atmospheric description of location.",
        "coordinates": {"x": number, "y": number},
        "ambientSensory": "Visual: ... Auditory: ..."
      }
    ]
  },
  "factions": [
    {
      "id": "fac_xxx",
      "name": "Faction Name",
      "description": "Background and beliefs."
    }
  ],
  "characters": [
    {
      "id": "char_xxx",
      "name": "Character Name",
      "role": "Their role in the world",
      "locationId": "loc_xxx",
      "motivation": "Their personal goal"
    }
  ],
  "capabilities": [
    {
      "capabilityId": "cap_xxx",
      "source": "AI_PROPOSAL",
      "name": "Capability Name",
      "powerTier": "Minor" | "Moderate" | "Major" | "WorldScale",
      "description": "How the magic or tech capability works",
      "storyCheckChallenges": [
        {
          "id": "challenge_xxx",
          "label": "Human-readable challenge name",
          "sourceType": "CAPABILITY",
          "sourceId": "cap_xxx",
          "keywords": ["action phrase", "hazard phrase"],
          "testType": "SAVING_THROW",
          "savingThrowAbility": "Dexterity" | "Constitution" | "Wisdom" | "Intelligence" | "Charisma" | "Strength",
          "difficultyClass": 13,
          "resolutionMode": "DND_STANDARD" | "CUSTOM_D20" | "NARRATIVE",
          "customModifier": number,
          "reason": "Why the resolution is required",
          "triggerReason": "What in the world triggers it",
          "onFailure": {
            "damageFormula": "1d6",
            "damageType": "poison",
            "conditions": [
              { "definitionIdOrName": "Poisoned", "durationSeconds": 60 }
            ],
            "summary": "Authored failure consequence"
          },
          "onSuccess": {
            "summary": "Authored success consequence"
          }
        }
      ]
    }
  ],
  "worldRules": [
    {
      "ruleId": "rule_xxx",
      "ruleType": "CAPABILITY_RESTRICTION" | "CANON_RULE" | "ENVIRONMENTAL_CONSTRAINT",
      "description": "The specific campaign mechanical constraint"
    }
  ],
  "events": [
    {
      "id": "evt_xxx",
      "title": "Event Title",
      "description": "What happens in the background.",
      "category": "POLITICAL" | "FACTION" | "MILITARY" | "SUPERNATURAL" | "DISCOVERY" | "DISASTER" | "ECONOMIC" | "SOCIAL" | "MONSTER" | "LOCATION" | "OTHER",
      "scheduledTime": {
        "year": 42,
        "month": 10,
        "day": 15,
        "hour": 12,
        "minute": 0,
        "second": 0
      },
      "participatingActors": ["char_xxx", "fac_xxx"],
      "locationId": "loc_xxx",
      "preconditions": {
        "requiredEvents": ["evt_yyy"],
        "requiredWorldFacts": []
      },
      "plannedConsequences": [
        {
          "type": "world_fact" | "faction_state_change" | "location_state_change" | "actor_state",
          "targetId": "loc_xxx" | "char_xxx" | "fac_xxx",
          "detail": "What specifically changes"
        }
      ],
      "storyCheckChallenges": [
        {
          "id": "challenge_xxx",
          "label": "Hazard or event challenge",
          "sourceType": "HAZARD" | "EVENT",
          "sourceId": "evt_xxx",
          "keywords": ["walk", "open", "touch"],
          "testType": "SAVING_THROW",
          "savingThrowAbility": "Dexterity",
          "difficultyClass": 13,
          "resolutionMode": "DND_STANDARD" | "CUSTOM_D20" | "NARRATIVE",
          "customModifier": number,
          "reason": "Why the resolution is required",
          "triggerReason": "What hazard or event triggers the save",
          "onFailure": {
            "damageFormula": "1d6",
            "damageType": "bludgeoning",
            "summary": "What happens on failure"
          },
          "onSuccess": {
            "summary": "What happens on success"
          }
        }
      ],
      "visibility": "PUBLIC" | "SECRET" | "HIDDEN",
      "status": "PLANNED"
    }
  ]
}`;

    const genresStr = input.genreTags?.join(', ') || 'None specified';
    const tonesStr = input.toneTags?.join(', ') || 'None specified';
    const mediumsStr = input.mediumTags?.join(', ') || 'None specified';

    const prompt = `Synthesize a rich, coherent campaign world template matching this specific natural language premise: "${input.naturalLanguagePremise}".

CRITICAL SEMANTIC PRIORITY & GUIDANCE INSTRUCTIONS:
1. PREMISE PRIORITY: The user's natural language premise "${input.naturalLanguagePremise}" is the absolute highest semantic priority. The core subject of the user's premise MUST anchor the entire world concept.
2. GENRE GUIDANCE: ${genresStr} (Optional modifier to flavor the world, never override the premise).
3. TONE GUIDANCE: ${tonesStr} (Optional modifier for narrative atmosphere).
4. MEDIUM GUIDANCE: ${mediumsStr} (Optional stylistic expression).
0. CANONICAL NARRATIVE MODE: ${requestedStoryMode} (${resolvedNarrativeProfile.profile.profileId}).
5. Ensure factions are active, locations are sensory-rich, and the planned background events show a complex, living timeline of 5 to 10 events starting from Year 42, Month 10, Day 14.`;

    try {
      const orchestrator = this.getAiOrchestrator();
      const execResult = await orchestrator.executeTaskGeneration('narrative.generate', prompt, systemInstruction);
      generationSource = execResult.source;
      providerId = execResult.providerId;
      modelId = execResult.modelId;
      fallbackReason = execResult.fallbackReason;
      attemptCount = execResult.attempts;

      if (generationSource !== 'DETERMINISTIC_FALLBACK' && execResult.text) {
        try {
          const parsed = JSON.parse(execResult.text);
          const isTurnPackage = Array.isArray(parsed.narrative) && !parsed.geography && !parsed.title;
          const hasStructuredLocations = (Array.isArray(parsed.geography?.locations) && parsed.geography.locations.length > 0) || (Array.isArray(parsed.locations) && parsed.locations.length > 0);
          const hasStructuredEvents = Array.isArray(parsed.events) && parsed.events.length > 0 && typeof parsed.events[0] === 'object' && parsed.events[0] !== null && Boolean(parsed.events[0].title || parsed.events[0].id);
          const hasWorldStructure = !isTurnPackage && Boolean(
            hasStructuredLocations ||
            (Array.isArray(parsed.factions) && parsed.factions.length > 0) ||
            hasStructuredEvents ||
            (parsed.title && (parsed.summary || parsed.description))
          );

          if (!hasWorldStructure) {
            generationSource = 'DETERMINISTIC_FALLBACK';
            fallbackReason = 'AI response did not contain world candidate structure; fell back to deterministic candidate';
          } else {
            parsedAiPayload = parsed;
            title = input.title || parsed.title || title;
            summary = parsed.summary || summary;
            description = parsed.description || description;
            if (input.genreTags && input.genreTags.length > 0) genreTags = input.genreTags;
            else if (Array.isArray(parsed.genreTags) && parsed.genreTags.length > 0) genreTags = parsed.genreTags;
            if (input.toneTags && input.toneTags.length > 0) toneTags = input.toneTags;
            else if (Array.isArray(parsed.toneTags) && parsed.toneTags.length > 0) toneTags = parsed.toneTags;
            if (input.mediumTags && input.mediumTags.length > 0) mediumTags = input.mediumTags;
            else if (Array.isArray(parsed.mediumTags) && parsed.mediumTags.length > 0) mediumTags = parsed.mediumTags;
            era = input.defaultEra || parsed.era || era;
            setting = input.setting || parsed.setting || setting;

            locations = parsed.geography?.locations || parsed.locations || [];
            factions = parsed.factions || [];
            characters = parsed.characters || [];
            capabilities = parsed.capabilities || [];
            worldRules = parsed.worldRules || [];
            storyCheckChallenges = Array.isArray(parsed.storyCheckChallenges) ? parsed.storyCheckChallenges : [];
            hazards = Array.isArray(parsed.hazards) ? parsed.hazards : [];
            events = parsed.events || [];
          }
        } catch (jsonErr: any) {
          generationSource = 'DETERMINISTIC_FALLBACK';
          fallbackReason = `Failed to parse AI response JSON: ${jsonErr.message}`;
        }
      } else {
        generationSource = 'DETERMINISTIC_FALLBACK';
      }
    } catch (err: any) {
      generationSource = 'DETERMINISTIC_FALLBACK';
      fallbackReason = err?.message || String(err);
    }

    if (generationSource === 'DETERMINISTIC_FALLBACK') {
      providerId = 'provider_deterministic_emergency';
      modelId = 'emergency-fallback-local';

      // Build completely deterministic, premise-faithful world candidate
      const candidate = this.buildDeterministicCandidate(input, generationSeed);
      title = input.title || candidate.title;
      summary = candidate.summary;
      description = candidate.description;
      genreTags = input.genreTags && input.genreTags.length > 0 ? input.genreTags : candidate.genreTags;
      toneTags = input.toneTags && input.toneTags.length > 0 ? input.toneTags : candidate.toneTags;
      mediumTags = input.mediumTags && input.mediumTags.length > 0 ? input.mediumTags : candidate.mediumTags;
      era = input.defaultEra || candidate.era;
      setting = input.setting || candidate.setting;
      locations = candidate.locations;
      factions = candidate.factions;
      characters = candidate.characters;
      capabilities = candidate.capabilities;
      worldRules = candidate.worldRules;
      events = candidate.events;
      storyCheckChallenges = Array.isArray(input.storyCheckChallenges) ? input.storyCheckChallenges : [];
      hazards = Array.isArray(input.hazards) ? input.hazards : [];
    } else {
      // Preserve explicit authored challenge/hazard definitions supplied by the caller.
      storyCheckChallenges = Array.isArray(input.storyCheckChallenges)
        ? input.storyCheckChallenges
        : storyCheckChallenges;
      hazards = Array.isArray(input.hazards) ? input.hazards : hazards;
      // Ensure genreTags/toneTags/mediumTags defaults if AI didn't return them
      if (genreTags.length === 0) genreTags = input.genreTags || ['Original'];
      if (toneTags.length === 0) toneTags = input.toneTags || ['Dynamic'];
      if (mediumTags.length === 0) mediumTags = input.mediumTags || ['Original'];
      if (!era) era = input.defaultEra || 'Current Age';
      if (!setting) setting = input.setting || title || 'The Central Expanse';
    }

    // Handle user-supplied geography overrides if provided
    if (input.geography && (Array.isArray(input.geography.locations) || Array.isArray(input.geography.majorLocations))) {
      const rawLocs = input.geography.locations || input.geography.majorLocations || [];
      locations = rawLocs.map((l: any, idx: number) => ({
        id: l.id || `loc_${timestamp}_${idx}`,
        name: l.name || l.title || `Location ${idx + 1}`,
        description: l.description || `Location in ${setting}`,
        coordinates: l.coordinates || { x: 40 + idx * 20, y: 50 },
        ambientSensory: l.ambientSensory || `Visual: ${l.name || 'Location'}.`,
      }));
    }

    // Player-friendly generation status
    const generationStatus =
      generationSource === 'AI_PRIMARY'
        ? 'Generated with DreamBook AI'
        : generationSource === 'AI_FALLBACK'
        ? 'Primary AI unavailable · Generated with fallback AI'
        : 'AI unavailable · DreamBook used its offline world generator';

    const provenance = {
      generationSource,
      providerId,
      modelId,
      task: 'narrative.generate',
      attemptCount,
      fallbackReason,
      generationSeed,
    };

    // Ensure preview geography nodes for UI compatibility
    const nodes = locations.map(loc => ({
      id: loc.id,
      name: loc.name,
      description: loc.description,
      regionId: setting || title
    }));

    // Enforce 5 to 10 events with full causal validation and repair
    const validatedEvents = this.validateAndNormalizeEvents(
      events,
      locations,
      characters,
      factions,
      input.naturalLanguagePremise,
      generationSeed,
      true
    );

    // Explicit caller-provided authored challenges take precedence over generated duplicates.
    const explicitChallenges = Array.isArray(input.storyCheckChallenges) ? input.storyCheckChallenges : [];
    const nestedEventChallenges = validatedEvents.flatMap((event: any) => (
      Array.isArray(event.storyCheckChallenges) ? event.storyCheckChallenges : []
    ));
    const capabilityChallenges = capabilities.flatMap((capability: any) => (
      Array.isArray(capability.storyCheckChallenges) ? capability.storyCheckChallenges : []
    ));
    const allAuthoredChallenges = [
      ...explicitChallenges,
      ...storyCheckChallenges,
      ...nestedEventChallenges,
      ...capabilityChallenges,
    ];
    const seenChallengeIds = new Set<string>();
    storyCheckChallenges = allAuthoredChallenges.filter((challenge: any) => {
      if (!challenge || typeof challenge !== 'object') return false;
      const id = String(challenge.id || challenge.challengeId || '');
      if (!id || seenChallengeIds.has(id)) return false;
      seenChallengeIds.add(id);
      return true;
    });

    const premiseTokens = extractPremiseTokens(input.naturalLanguagePremise);
    const primaryToken = premiseTokens[0] || 'Core';

    // Canonical WorldTemplate construction without unrelated legacy fixture lore
    const resolvedRules = rulesProfileEngine.resolve({
      mode: input.dndRulesMode,
      rulesProfile: input.rulesProfile,
      worldRules,
      ruleConstraints: worldRules.map((r: any) => r.description),
      canonicalCapabilities: capabilities,
    });
    const world: WorldTemplate = {
      worldId,
      title: title || `${primaryToken} Realm`,
      summary: summary || `Synthesized from premise: ${input.naturalLanguagePremise}`,
      description: description || `Synthesized from premise: ${input.naturalLanguagePremise}. An expansive world featuring rich lore, factions, and emergent narrative opportunities.`,
      genreTags,
      toneTags,
      mediumTags,
      canonMode: input.canonMode || 'Original',
      rulesetId: resolvedRules.profile.mode,
      dndRulesMode: resolvedRules.profile.mode,
      rulesProfile: resolvedRules.profile,
      storyMode: requestedStoryMode,
      narrativeProfile: resolvedNarrativeProfile.profile,
      visibility: 'public',
      creatorId: 'system',
      sourcePolicy: input.sourcePolicy || 'Synthesized Template',
      defaultEra: era,
      worldManifestVersion: 1,
      versionHash: `syn_${timestamp}_hash`,
      canonicalCapabilities: capabilities.map((c: any) => c.id || c.capabilityId),
      capabilities: capabilities,
      worldRules: worldRules,
      ruleConstraints: worldRules.map((r: any) => r.description),
      worldFacts: [
        {
          factId: `fact_premise_${timestamp}`,
          statement: `Core World Constraint: ${input.naturalLanguagePremise}`,
          category: 'world_lore',
          subjectEntityId: 'world',
          predicate: 'premise_rule',
          objectValue: input.naturalLanguagePremise,
          provenanceClass: 'DIRECT_RECORD',
          provenanceSummary: 'Natural Language Premise Synthesis',
          sourceSegmentIds: [],
          confidence: 1.0,
          acquiredAtTimestamp: { year: 42, month: 10, day: 14, hour: 17, minute: 42, second: 0, totalElapsedSeconds: 393934920 },
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      setting: setting,
      era: era,
      source: input.sourcePolicy || 'Synthesized Template',
      // Narrative mode is canonical metadata and intentionally remains separate from
      // the legacy gameplay-oriented playstyle axis.
      rules: resolvedRules.profile.mode,
      imageAsset: input.imageAsset,
      imageMetadata: input.imageMetadata || (input.imageAsset ? {
        promptFallback: `Visual rendition for ${title}`,
        rightsStatus: 'canonical_rights_retained',
        provenance: 'WorldSynthesisPipeline',
        mediaSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      } : undefined),
      geography: {
        ...(input.geography || {}),
        locations,
        nodes
      },
      timeline: input.timeline || [{ era: era, event: `Genesis of ${setting}` }],
      characters: characters,
      factions: factions,
      magicRules: input.magicRules || (parsedAiPayload?.magicRules ? parsedAiPayload.magicRules : {
        systemName: `${title || primaryToken} World System`,
        system: `World-defining principles anchored to ${primaryToken.toLowerCase()}.`,
        laws: [`Core interactions are constrained by the premise: ${input.naturalLanguagePremise.trim()}`],
        cost: 'Context-dependent consequence'
      }),
      economy: input.economy || (parsedAiPayload?.economy ? parsedAiPayload.economy : {
        currency: `${primaryToken} Scrip`,
        tradeHubs: locations.slice(0, 2).map((l: any) => l.name)
      }),
      forbiddenContradictions: input.forbiddenContradictions || (parsedAiPayload?.forbiddenContradictions ? parsedAiPayload.forbiddenContradictions : [
        `The fundamental reality of ${setting} cannot be rewritten without triggering systemic collapse.`
      ]),
      startingStarts: input.startingStarts || (parsedAiPayload?.startingStarts ? parsedAiPayload.startingStarts : locations.slice(0, 2).map((l: any) => l.name)),
      terminology: input.terminology || (parsedAiPayload?.terminology ? parsedAiPayload.terminology : {
        [`${primaryToken} Core`]: `Primary energetic feature within ${setting}`
      }),
      knowledgeBoundaries: input.knowledgeBoundaries || (parsedAiPayload?.knowledgeBoundaries ? parsedAiPayload.knowledgeBoundaries : {
        forbiddenKnowledgeLevel: 'Restricted Tier'
      }),
      artConfig: input.artConfig || (parsedAiPayload?.artConfig ? parsedAiPayload.artConfig : {
        palette: 'cinematic_natural',
        style: input.mediumTags?.[0] || 'illustrative_concept'
      }),
      audioConfig: input.audioConfig || (parsedAiPayload?.audioConfig ? parsedAiPayload.audioConfig : {
        ambientTrack: 'ambient_exploration',
        reverbPreset: 'natural_acoustic'
      }),
      narrativeConfig: input.narrativeConfig || (parsedAiPayload?.narrativeConfig ? parsedAiPayload.narrativeConfig : {
        pacing: 'deliberate_epic',
        pov: 'third_person_limited'
      }),
      events: validatedEvents,
      hazards,
      storyCheckChallenges,
      generationStatus,
      provenance,
    };

    worldRepository.saveWorldTemplate(world);
    return world;
  }

  /**
   * Deterministic, premise-faithful procedural world builder.
   * Derives all world entities, locations, factions, and rules from the premise and seed.
   */
  public buildDeterministicCandidate(input: WorldSynthesisInput, seed: string): {
    title: string;
    summary: string;
    description: string;
    genreTags: string[];
    toneTags: string[];
    mediumTags: string[];
    era: string;
    setting: string;
    locations: any[];
    factions: any[];
    characters: any[];
    capabilities: any[];
    worldRules: any[];
    events: any[];
  } {
    const seedString = `${seed}::${input.naturalLanguagePremise}::${(input.genreTags || []).join(',')}::${(input.toneTags || []).join(',')}::${(input.mediumTags || []).join(',')}`;
    const rng = createSeededRng(seedString);

    const tokens = extractPremiseTokens(input.naturalLanguagePremise);
    const primary = tokens[0] || (input.genreTags?.[0] || 'Aether');
    const secondary = tokens[1] || (tokens[0] ? 'Frontier' : 'Vanguard');
    const tertiary = tokens[2] || 'Horizon';

    const genrePool = ['High Fantasy', 'Sci-Fi', 'Dark Fantasy', 'Cyberpunk', 'Solarpunk', 'Steampunk', 'Cosmic Horror'];
    const tonePool = ['Atmospheric', 'Mysterious', 'Heroic', 'Grim', 'Adventurous', 'Ominous', 'Melancholic'];

    const genreTags = input.genreTags && input.genreTags.length > 0
      ? input.genreTags
      : [pickOne(rng, genrePool)];
    const toneTags = input.toneTags && input.toneTags.length > 0
      ? input.toneTags
      : [pickOne(rng, tonePool)];
    const mediumTags = input.mediumTags && input.mediumTags.length > 0
      ? input.mediumTags
      : ['Original'];

    // Title construction
    const titlePatterns = [
      `The ${primary} ${pickOne(rng, ['Expanse', 'Domain', 'Sanctuary', 'Reach', 'Threshold', 'Wilds', 'Dominion', 'Enclave', 'Frontier'])}`,
      `${pickOne(rng, ['Sovereign', 'Ashen', 'Prismatic', 'Boundless', 'Echoing', 'Silent', 'Obsidian', 'Radiant', 'Vibrant', 'Shadowed'])} ${primary}`,
      `${primary} of ${secondary}`,
      `Chronicles of the ${primary} ${pickOne(rng, ['Spire', 'Basin', 'Canopy', 'Colony', 'Wasteland', 'Haven'])}`,
      `${primary} & the ${secondary} ${pickOne(rng, ['Order', 'Frontier', 'Remnant', 'Vigil'])}`
    ];
    const title = input.title && input.title.trim() ? input.title.trim() : pickOne(rng, titlePatterns);

    // Setting and Era
    const setting = input.setting || `The ${primary} ${pickOne(rng, ['Territories', 'Basin', 'Expanse', 'Marches', 'Dominion', 'Reaches'])}`;
    const era = input.defaultEra || `Age of the ${primary} ${pickOne(rng, ['Awakening', 'Convergence', 'Ascension', 'Reckoning', 'Dominion', 'Flux'])}`;

    const summary = `A ${toneTags.join('/')} ${genreTags.join('/')} realm anchored by the premise: "${input.naturalLanguagePremise.trim()}".`;

    const description = `Anchored directly in the premise: "${input.naturalLanguagePremise.trim()}". In the era known as ${era}, the geographic landscape and natural order of ${setting} are fundamentally shaped by ${primary.toLowerCase()}${secondary !== 'Frontier' ? ' and ' + secondary.toLowerCase() : ''}. Ancient structures and everyday life adapt to this singular reality, creating an environment unlike any other.

Civilization across ${setting} has developed distinct cultural traditions, survival strategies, and localized economies attuned to ${primary.toLowerCase()}. From fortified bastions to treacherous borderlands, local populations contend with unique ecological and geopolitical currents.

As regional tensions rise, rival factions maneuver for influence over critical resources and territory. With scheduled developments unfolding on the horizon, the fragile balance across ${setting} stands on the brink of enduring transformation.`;

    const primaryKey = primary.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const secondaryKey = secondary.toLowerCase().replace(/[^a-z0-9]/g, '_');

    // Locations
    const locations = [
      {
        id: `loc_1_${primaryKey}`,
        name: `The ${primary} ${pickOne(rng, ['Citadel', 'Nexus', 'Sanctuary', 'Spire', 'Heartland', 'Keep'])}`,
        description: `The central seat of power and epicenter of ${primary.toLowerCase()} phenomena in ${setting}.`,
        coordinates: { x: 45, y: 50 },
        ambientSensory: `Visual: Formations of ${primary.toLowerCase()} under ambient illumination. Auditory: Low continuous humming resonating across corridors.`
      },
      {
        id: `loc_2_${secondaryKey}`,
        name: `${secondary} ${pickOne(rng, ['Outpost', 'Watch', 'Terrace', 'Ridge', 'Quarry', 'Crossing'])}`,
        description: `A fortified regional station monitoring the volatile perimeter of ${setting}.`,
        coordinates: { x: 75, y: 35 },
        ambientSensory: `Visual: Weathered observation parapets overlooking uncharted zones. Auditory: Shifting winds and distant seismic echoes.`
      },
      {
        id: `loc_3_depths`,
        name: `The ${pickOne(rng, ['Sunken', 'Whispering', 'Shattered', 'Veiled', 'Silent', 'Hallowed'])} ${pickOne(rng, ['Hollows', 'Glade', 'Chasm', 'Vault', 'Canyon', 'Ruins'])}`,
        description: `An isolated anomaly zone where deep secrets and concentrated ${primary.toLowerCase()} energies remain hidden.`,
        coordinates: { x: 25, y: 70 },
        ambientSensory: `Visual: Dense atmospheric haze reflecting shimmering luminescence. Auditory: Faint intermittent resonance in the still air.`
      }
    ];

    // Factions
    const factions = [
      {
        id: `fac_1_${primaryKey}`,
        name: `The ${primary} ${pickOne(rng, ['Consortium', 'Vanguard', 'Order', 'Syndicate', 'Keepers', 'Enclave'])}`,
        description: `An organized force dedicated to harnessing and directing ${primary.toLowerCase()} influence throughout ${setting}.`
      },
      {
        id: `fac_2_${secondaryKey}`,
        name: `${secondary} ${pickOne(rng, ['Reclamation Front', 'Sentinels', 'Free Coalition', 'Defenders', 'Covenant'])}`,
        description: `A resilient collective determined to protect sovereign territories and prevent unchecked exploitation.`
      }
    ];

    // Characters
    const charNames = ['Valen', 'Seraphina', 'Corvus', 'Thorne', 'Kaelen', 'Lyra', 'Darius', 'Morwen', 'Zephyr', 'Talia'];
    const characters = [
      {
        id: `char_1_leader`,
        name: `${pickOne(rng, ['Commander', 'Archon', 'Overseer', 'Magister', 'Director', 'High Warden'])} ${pickOne(rng, charNames)}`,
        role: `High Leader of ${factions[0].name}`,
        locationId: locations[0].id,
        motivation: `To consolidate authority and master the secrets of ${primary.toLowerCase()}.`
      },
      {
        id: `char_2_scout`,
        name: `${pickOne(rng, ['Pathfinder', 'Scout', 'Agent', 'Navigator', 'Scholar', 'Tracker'])} ${pickOne(rng, charNames)}`,
        role: `Frontier Scout for ${factions[1].name}`,
        locationId: locations[1].id,
        motivation: `To investigate emerging anomalies and safeguard the outer perimeter.`
      }
    ];

    // Capabilities
    const capabilities = [
      {
        capabilityId: `cap_1_${primaryKey}`,
        source: 'AI_PROPOSAL' as const,
        name: `${primary} ${pickOne(rng, ['Channeling', 'Resonance', 'Transmutation', 'Attunement', 'Infusion', 'Manipulation'])}`,
        powerTier: 'Major' as const,
        description: `Specialized ability to interact with and channel ${primary.toLowerCase()} properties directly.`,
        validated: true
      },
      {
        capabilityId: `cap_2_${secondaryKey}`,
        source: 'AI_PROPOSAL' as const,
        name: `${secondary} ${pickOne(rng, ['Adaptation', 'Warding', 'Navigation', 'Surge', 'Defense'])}`,
        powerTier: 'Moderate' as const,
        description: `Field techniques developed to navigate hazardous environmental anomalies across ${setting}.`,
        validated: true
      }
    ];

    // World Rules
    const worldRules = [
      {
        ruleId: `rule_1_${primaryKey}`,
        ruleType: 'CANON_RULE' as const,
        description: `Interactions involving ${primary.toLowerCase()} follow strict conservation of energy and require deliberate focus.`,
        validated: true
      },
      {
        ruleId: `rule_2_${secondaryKey}`,
        ruleType: 'ENVIRONMENTAL_CONSTRAINT' as const,
        description: `Severe environmental shifts across ${setting} can destabilize standard equipment and travel routes.`,
        validated: true
      }
    ];

    // 6 Structured Planned Events
    const events = [
      {
        id: `evt_1_surge`,
        title: `${primary} ${pickOne(rng, ['Awakening', 'Surge', 'Incursion', 'Convergence', 'Fluctuation', 'Manifestation'])}`,
        description: `An environmental surge of ${primary.toLowerCase()} activity manifests at ${locations[0].name}.`,
        category: 'SUPERNATURAL',
        scheduledTime: { year: 42, month: 10, day: 14, hour: 12, minute: 0, second: 0, totalElapsedSeconds: 393914400 },
        participatingActors: [factions[0].id],
        locationId: locations[0].id,
        preconditions: { requiredEvents: [], requiredWorldFacts: [] },
        plannedConsequences: [{ type: 'location_state_change', targetId: locations[0].id, detail: `Initial surge alters regional equilibrium at ${locations[0].name}.` }],
        visibility: 'PUBLIC',
        status: 'PLANNED'
      },
      {
        id: `evt_2_response`,
        title: `${factions[1].name} ${pickOne(rng, ['Mobilization', 'Reconnaissance', 'Patrol', 'Expedition', 'Countermeasure'])}`,
        description: `${factions[1].name} dispatches operatives from ${locations[1].name} to investigate the anomaly.`,
        category: 'FACTION',
        scheduledTime: { year: 42, month: 10, day: 15, hour: 8, minute: 0, second: 0, totalElapsedSeconds: 393986400 },
        participatingActors: [characters[1].id, factions[1].id],
        locationId: locations[1].id,
        preconditions: { requiredEvents: [`evt_1_surge`], requiredWorldFacts: [] },
        plannedConsequences: [{ type: 'actor_state', targetId: characters[1].id, detail: 'Dispatched to observe outer boundary shifts.' }],
        visibility: 'PUBLIC',
        status: 'PLANNED'
      },
      {
        id: `evt_3_skirmish`,
        title: `Skirmish near ${locations[2].name}`,
        description: `Rival scouts encounter volatile anomalies and competing patrols near ${locations[2].name}.`,
        category: 'MILITARY',
        scheduledTime: { year: 42, month: 10, day: 16, hour: 14, minute: 0, second: 0, totalElapsedSeconds: 394095600 },
        participatingActors: [characters[0].id, factions[0].id],
        locationId: locations[2].id,
        preconditions: { requiredEvents: [`evt_2_response`], requiredWorldFacts: [] },
        plannedConsequences: [{ type: 'world_fact', targetId: 'world', detail: `Hostilities increase along the border of ${locations[2].name}.` }],
        visibility: 'PUBLIC',
        status: 'PLANNED'
      },
      {
        id: `evt_4_discovery`,
        title: `${pickOne(rng, ['Cryptic Revelation', 'Primordial Vault Breach', 'Signal Decryption', 'Ancient Catalyst Discovery'])}`,
        description: `Explorers uncover a critical secret concerning the historical origin of ${primary.toLowerCase()}.`,
        category: 'DISCOVERY',
        scheduledTime: { year: 42, month: 10, day: 17, hour: 18, minute: 0, second: 0, totalElapsedSeconds: 394196400 },
        participatingActors: [characters[0].id],
        locationId: locations[0].id,
        preconditions: { requiredEvents: [`evt_3_skirmish`], requiredWorldFacts: [] },
        plannedConsequences: [{ type: 'location_state_change', targetId: locations[0].id, detail: 'Ancient records deciphered.' }],
        visibility: 'PUBLIC',
        status: 'PLANNED'
      },
      {
        id: `evt_5_conclave`,
        title: `The ${setting} ${pickOne(rng, ['Emergency Conclave', 'Council of Powers', 'Frontier Summit', 'Treaty Assembly'])}`,
        description: `Delegates from ${factions[0].name} and ${factions[1].name} meet at ${locations[0].name} to contest territorial control.`,
        category: 'POLITICAL',
        scheduledTime: { year: 42, month: 10, day: 18, hour: 20, minute: 0, second: 0, totalElapsedSeconds: 394290000 },
        participatingActors: [factions[0].id, factions[1].id],
        locationId: locations[0].id,
        preconditions: { requiredEvents: [`evt_4_discovery`], requiredWorldFacts: [] },
        plannedConsequences: [{ type: 'faction_state_change', targetId: factions[0].id, detail: 'Diplomatic alert escalated.' }],
        visibility: 'PUBLIC',
        status: 'PLANNED'
      },
      {
        id: `evt_6_climax`,
        title: `The ${primary} ${pickOne(rng, ['Culmination', 'Ascension Apex', 'Great Muster', 'Threshold Reckoning'])}`,
        description: `Atmospheric, geological, and political pressures culminate across ${setting}, initiating the campaign era.`,
        category: 'SUPERNATURAL',
        scheduledTime: { year: 42, month: 10, day: 19, hour: 12, minute: 0, second: 0, totalElapsedSeconds: 394347600 },
        participatingActors: [characters[1].id, factions[0].id],
        locationId: locations[2].id,
        preconditions: { requiredEvents: [`evt_5_conclave`], requiredWorldFacts: [] },
        plannedConsequences: [{ type: 'world_fact', targetId: 'world', detail: 'The campaign setting transitions into active systemic conflict.' }],
        visibility: 'PUBLIC',
        status: 'PLANNED'
      }
    ];

    return {
      title,
      summary,
      description,
      genreTags,
      toneTags,
      mediumTags,
      era,
      setting,
      locations,
      factions,
      characters,
      capabilities,
      worldRules,
      events
    };
  }

  /**
   * Deterministic event validation, repair, and count enforcement pipeline.
   * Ensures:
   * 1. 5 to 10 planned events
   * 2. Valid referential integrity (locations, actors, preconditions)
   * 3. Structured consequences and chronology
   */
  public validateAndNormalizeEvents(
    eventsRaw: any[],
    locations: any[],
    characters: any[],
    factions: any[],
    premise: string = '',
    seed: string = 'event_seed',
    enforceCountRange: boolean = false
  ): any[] {
    if (!Array.isArray(eventsRaw)) {
      eventsRaw = [];
    }

    const validCategories = [
      'POLITICAL', 'FACTION', 'MILITARY', 'SUPERNATURAL', 'DISCOVERY',
      'DISASTER', 'ECONOMIC', 'SOCIAL', 'MONSTER', 'LOCATION', 'OTHER'
    ];
    const validVisibilities = ['PUBLIC', 'SECRET', 'HIDDEN'];
    const validConsequenceTypes = [
      'world_fact', 'faction_state_change', 'location_state_change',
      'actor_state', 'resource_effect', 'relationship_change', 'event_activation'
    ];

    const locationIds = new Set(locations.map(loc => loc.id));
    const characterIds = new Set(characters.map(char => char.id || char.subjectId));
    const factionIds = new Set(factions.map(fac => fac.id || fac.factionId));
    const entityIds = new Set([...locationIds, ...characterIds, ...factionIds]);

    const cleanedEvents: any[] = [];
    const eventIds = new Set<string>();

    for (let idx = 0; idx < eventsRaw.length; idx++) {
      const raw = eventsRaw[idx];
      if (!raw || typeof raw !== 'object') {
        continue;
      }

      // 1. Unique ID Generation / De-duplication
      let id = typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : deterministicId('evt_syn_event', seed, idx, raw.title || raw.name || raw.kind || 'event');
      if (eventIds.has(id)) {
        id = deterministicId('evt_syn_event_unique', seed, idx, raw.title || raw.name || raw.kind || 'event');
      }
      eventIds.add(id);

      // 2. Text validations
      const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : `Unnamed Event ${idx + 1}`;
      const description = typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim() : `A plausible future background event in the world.`;

      // 3. Category matching and repair
      let category = typeof raw.category === 'string' ? raw.category.toUpperCase() : 'OTHER';
      if (!validCategories.includes(category)) {
        category = 'OTHER';
      }

      // 4. Status and Visibility
      const status = 'PLANNED';
      let visibility = typeof raw.visibility === 'string' ? raw.visibility.toUpperCase() : 'PUBLIC';
      if (!validVisibilities.includes(visibility)) {
        visibility = 'PUBLIC';
      }

      // 5. Scheduled Time Repair
      let scheduledTime = raw.scheduledTime || {};
      let year = typeof scheduledTime.year === 'number' && scheduledTime.year > 0 ? scheduledTime.year : 42;
      let month = typeof scheduledTime.month === 'number' && scheduledTime.month >= 1 && scheduledTime.month <= 12 ? scheduledTime.month : 10;
      let day = typeof scheduledTime.day === 'number' && scheduledTime.day >= 1 && scheduledTime.day <= 30 ? scheduledTime.day : 14 + idx;

      if (
        year < 42 ||
        (year === 42 && month < 10) ||
        (year === 42 && month === 10 && day < 14)
      ) {
        year = 42;
        month = 10;
        day = Math.min(30, 14 + idx);
      }

      const hour = typeof scheduledTime.hour === 'number' && scheduledTime.hour >= 0 && scheduledTime.hour < 24 ? scheduledTime.hour : 12;
      const minute = typeof scheduledTime.minute === 'number' && scheduledTime.minute >= 0 && scheduledTime.minute < 60 ? scheduledTime.minute : 0;
      const second = 0;
      const totalElapsedSeconds = (year * 360 * 24 * 3600) + ((month - 1) * 30 * 24 * 3600) + ((day - 1) * 24 * 3600) + (hour * 3600) + (minute * 60);

      const validatedTimestamp = {
        year, month, day, hour, minute, second, totalElapsedSeconds
      };

      // 6. Location ID Validation
      let locationId = typeof raw.locationId === 'string' && raw.locationId.trim() ? raw.locationId.trim() : undefined;
      if (locationId && !locationIds.has(locationId)) {
        locationId = locations.length > 0 ? locations[0].id : undefined;
      } else if (!locationId && locations.length > 0) {
        locationId = locations[idx % locations.length].id;
      }

      // 7. Actor references validation
      let participatingActors: string[] = [];
      if (Array.isArray(raw.participatingActors)) {
        participatingActors = raw.participatingActors.filter((actorId: any) => {
          return typeof actorId === 'string' && (characterIds.has(actorId) || factionIds.has(actorId));
        });
      }
      if (participatingActors.length === 0) {
        if (characters.length > 0) participatingActors.push(characters[idx % characters.length].id || characters[idx % characters.length].subjectId);
        else if (factions.length > 0) participatingActors.push(factions[idx % factions.length].id || factions[idx % factions.length].factionId);
      }

      // 8. Preconditions validation (Self dependency filter)
      const preconditionsRaw = raw.preconditions || {};
      let requiredEvents: string[] = [];
      if (Array.isArray(preconditionsRaw.requiredEvents)) {
        requiredEvents = preconditionsRaw.requiredEvents.filter((depId: any) => {
          return typeof depId === 'string' && depId !== id;
        });
      }
      let requiredWorldFacts: string[] = [];
      if (Array.isArray(preconditionsRaw.requiredWorldFacts)) {
        requiredWorldFacts = preconditionsRaw.requiredWorldFacts.filter((fact: any) => typeof fact === 'string' && fact.trim());
      }

      const preconditions = {
        requiredEvents,
        requiredWorldFacts
      };

      // 9. Consequences duplicate detection and validation
      const consequencesRaw = raw.plannedConsequences || raw.consequences || [];
      const plannedConsequences: any[] = [];
      const seenConsequences = new Set<string>();

      if (Array.isArray(consequencesRaw)) {
        consequencesRaw.forEach((con: any) => {
          if (!con || typeof con !== 'object') return;
          let cType = typeof con.type === 'string' ? con.type.toLowerCase() : 'world_fact';
          if (!validConsequenceTypes.includes(cType)) {
            cType = 'world_fact';
          }
          const detail = typeof con.detail === 'string' && con.detail.trim() ? con.detail.trim() : 'Changes status';
          let targetId = typeof con.targetId === 'string' && con.targetId.trim() ? con.targetId.trim() : (locationId || id);
          if (targetId && !entityIds.has(targetId) && targetId !== 'world' && targetId !== id) {
            targetId = locationId || id;
          }

          const uniqKey = `${cType}_${targetId}_${detail}`;
          if (!seenConsequences.has(uniqKey)) {
            seenConsequences.add(uniqKey);
            plannedConsequences.push({
              type: cType,
              targetId,
              detail
            });
          }
        });
      }

      if (plannedConsequences.length === 0) {
        plannedConsequences.push({
          type: 'location_state_change',
          targetId: locationId || id,
          detail: `State modified during ${title}`
        });
      }

      const rawChallenges = Array.isArray(raw.storyCheckChallenges)
        ? raw.storyCheckChallenges
        : Array.isArray(raw.savingThrowChallenges)
        ? raw.savingThrowChallenges
        : [];
      const storyCheckChallenges = rawChallenges
        .filter((challenge: any) => challenge && typeof challenge === 'object')
        .map((challenge: any, challengeIndex: number) => ({
          ...challenge,
          id: String(challenge.id || challenge.challengeId || `challenge_${id}_${challengeIndex + 1}`),
          label: String(challenge.label || challenge.name || `Challenge in ${title}`),
          sourceType: challenge.sourceType || 'EVENT',
          sourceId: String(challenge.sourceId || id),
          keywords: Array.isArray(challenge.keywords)
            ? challenge.keywords.filter((keyword: any) => typeof keyword === 'string' && keyword.trim())
            : typeof challenge.keywords === 'string'
            ? [challenge.keywords]
            : [],
          difficultyClass: Number(challenge.difficultyClass ?? challenge.dc ?? 13),
          resolutionMode: ['DND_STANDARD', 'CUSTOM_D20', 'NARRATIVE'].includes(challenge.resolutionMode)
            ? challenge.resolutionMode
            : undefined,
          customModifier: Number.isFinite(Number(challenge.customModifier))
            ? Number(challenge.customModifier)
            : undefined,
        }))
        .filter((challenge: any) => challenge.keywords.length > 0 && Number.isFinite(challenge.difficultyClass));

      cleanedEvents.push({
        id,
        title,
        description,
        category,
        scheduledTime: validatedTimestamp,
        participatingActors,
        locationId,
        preconditions,
        plannedConsequences,
        storyCheckChallenges,
        visibility,
        status
      });
    }

    // Enforce Event Limits: Max 10, Min 5 (when requested)
    let finalEvents = [...cleanedEvents];

    if (enforceCountRange) {
      if (finalEvents.length > 10) {
        const remaining = [...finalEvents];
        const selected: any[] = [];
        const selectedIds = new Set<string>();

        while (selected.length < 10 && remaining.length > 0) {
          const nextIndex = remaining.findIndex(event => {
            const deps = Array.isArray(event.preconditions?.requiredEvents) ? event.preconditions.requiredEvents : [];
            return deps.every((depId: string) => selectedIds.has(depId));
          });

          if (nextIndex === -1) {
            const fallback = remaining.shift()!;
            fallback.preconditions.requiredEvents = [];
            selected.push(fallback);
            selectedIds.add(fallback.id);
            continue;
          }

          const [nextEvent] = remaining.splice(nextIndex, 1);
          selected.push(nextEvent);
          selectedIds.add(nextEvent.id);
        }

        finalEvents = selected;
      }

      if (finalEvents.length < 5) {
        const tokens = extractPremiseTokens(premise);
        const primaryToken = tokens[0] || 'Realm';
        const secondaryToken = tokens[1] || 'Frontier';
        const rng = createSeededRng(`${seed}::complete_events::${finalEvents.length}`);
        const titlePatterns = [
          (s: string) => `${s} Discovery`,
          (s: string) => `${s} Emergence`,
          (s: string) => `The ${s} Shift`,
          (s: string) => `${s} Boundary Event`,
          (s: string) => `The ${s} Assembly`,
          (s: string) => `${s} Critical Change`
        ];
        const descriptionPatterns = [
          (s: string) => `New evidence surrounding ${s.toLowerCase()} changes how communities respond to the current situation.`,
          (s: string) => `A consequential development involving ${s.toLowerCase()} alters conditions and forces local actors to adapt.`,
          (s: string) => `Observers record an unusual development tied directly to ${s.toLowerCase()} within the world.`,
          (s: string) => `Regional activity centered on ${s.toLowerCase()} creates new pressure on settlements and factions.`
        ];
        const categories = ['DISCOVERY', 'FACTION', 'MILITARY', 'SUPERNATURAL', 'POLITICAL', 'DISASTER'];

        while (finalEvents.length < 5) {
          const idx = finalEvents.length;
          const autoId = `evt_syn_auto_${idx + 1}`;
          const prevId = idx > 0 ? finalEvents[idx - 1].id : undefined;
          const subject = idx % 2 === 0 ? primaryToken : secondaryToken;
          const titleBuilder = pickOne(rng, titlePatterns);
          const descriptionBuilder = pickOne(rng, descriptionPatterns);
          const category = pickOne(rng, categories);
          const day = Math.min(30, 14 + idx);
          const totalElapsedSeconds = (42 * 360 * 24 * 3600) + ((10 - 1) * 30 * 24 * 3600) + ((day - 1) * 24 * 3600) + (12 * 3600);
          const loc = locations.length > 0 ? locations[idx % locations.length] : { id: 'loc_primary', name: 'Primary Region' };
          const actor = characters.length > 0
            ? (characters[idx % characters.length].id || characters[idx % characters.length].subjectId)
            : factions.length > 0
            ? (factions[idx % factions.length].id || factions[idx % factions.length].factionId)
            : 'actor_system';

          finalEvents.push({
            id: autoId,
            title: titleBuilder(subject),
            description: descriptionBuilder(subject),
            category,
            scheduledTime: { year: 42, month: 10, day, hour: 12, minute: 0, second: 0, totalElapsedSeconds },
            participatingActors: [actor],
            locationId: loc.id,
            preconditions: { requiredEvents: prevId ? [prevId] : [], requiredWorldFacts: [] },
            plannedConsequences: [{ type: 'location_state_change', targetId: loc.id, detail: `Regional conditions changed because of ${subject.toLowerCase()}.` }],
            visibility: 'PUBLIC',
            status: 'PLANNED'
          });
        }
      }
    }
    // Referential integrity check for requiredEvents
    const finalEventIds = new Set(finalEvents.map(e => e.id));
    finalEvents.forEach(e => {
      e.preconditions.requiredEvents = (e.preconditions?.requiredEvents || []).filter((depId: string) => finalEventIds.has(depId) && depId !== e.id);
    });

    return finalEvents;
  }
}

export const worldSynthesisService = new WorldSynthesisService();
