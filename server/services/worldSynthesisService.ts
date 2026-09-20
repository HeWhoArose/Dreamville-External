import { worldRepository } from '../repositories/worldRepository';
import { WorldTemplate, WorldSynthesisInput } from '../../src/types';
import { GoogleGenAI } from '@google/genai';

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
}

export class WorldSynthesisService {
  /**
   * Synthesizes a WorldTemplate based on the user premise.
   * Leverages Gemini 3.8 Flash for structured generation when GEMINI_API_KEY is available.
   * Falls back to a premium, theme-responsive template engine when no API key exists.
   */
  public async synthesizeWorldFromPremise(input: WorldSynthesisInput): Promise<WorldTemplate> {
    const timestamp = Date.now();
    const worldId = `world_syn_${timestamp}`;

    const apiKey = process.env.GEMINI_API_KEY;

    let title = input.title || '';
    let summary = '';
    let description = '';
    let genreTags = input.genreTags && input.genreTags.length > 0 ? input.genreTags : ['High Fantasy'];
    let toneTags = input.toneTags && input.toneTags.length > 0 ? input.toneTags : ['Heroic'];
    let mediumTags = input.mediumTags && input.mediumTags.length > 0 ? input.mediumTags : ['Original'];
    let era = input.defaultEra || 'Third Age';
    let setting = input.setting || 'Aether Plains';
    
    let locations: any[] = [];
    let characters: any[] = [];
    let factions: any[] = [];
    let events: any[] = [];
    let capabilities: any[] = [];
    let worldRules: any[] = [];

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });

        const systemInstruction = `You are an expert campaign director and world builder for premium tabletop-style fantasy/scifi simulators.
Your task is to take a natural language world premise and synthesize a complete, highly structured campaign world template.
You must return a valid, pure JSON object with NO markdown formatting, wrapping, or extra text.

CRITICAL INSTRUCTIONS FOR PLANNED WORLD EVENTS:
- You must generate approximately 5 to 10 meaningful planned world events.
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
      "description": "How the magic or tech capability works"
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
5. Ensure factions are active, locations are sensory-rich, and the planned background events show a complex, living timeline spanning a few weeks of fictional time starting from Year 42, Month 10, Day 14.`;

        const orchestrator = worldRepository.getAiOrchestrator();
        const selection = orchestrator.selectBestModel('narrative.generate');
        const modelToUse = selection.selectedModel.modelId;
        const providerToUse = selection.selectedModel.providerId;
        console.log(`[WorldSynthesisService] Using MultiModelOrchestrator task 'narrative.generate' -> model: ${modelToUse} (provider: ${providerToUse}, reason: ${selection.selectionReason})`);

        const response = await ai.models.generateContent({
          model: modelToUse,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            temperature: 0.2,
          }
        });

        const parsed = JSON.parse(response.text || '{}');
        title = parsed.title || title;
        summary = parsed.summary || summary;
        description = parsed.description || description;
        if (Array.isArray(parsed.genreTags)) genreTags = parsed.genreTags;
        if (Array.isArray(parsed.toneTags)) toneTags = parsed.toneTags;
        if (Array.isArray(parsed.mediumTags)) mediumTags = parsed.mediumTags;
        era = parsed.era || era;
        setting = parsed.setting || setting;

        locations = parsed.geography?.locations || parsed.locations || [];
        factions = parsed.factions || [];
        characters = parsed.characters || [];
        capabilities = parsed.capabilities || [];
        worldRules = parsed.worldRules || [];
        events = parsed.events || [];

      } catch (err: any) {
        console.warn('World AI synthesis rate limited or timed out (falling back to procedural builder):', err?.message || err);
      }
    }

    // FALLBACK PROCEDURAL GENERATION & VALIDATION Swappers
    if (locations.length === 0) {
      if (input.geography && (Array.isArray(input.geography.locations) || Array.isArray(input.geography.majorLocations))) {
        const rawLocs = input.geography.locations || input.geography.majorLocations || [];
        locations = rawLocs.map((l: any, idx: number) => ({
          id: l.id || `loc_${timestamp}_${idx}`,
          name: l.name || l.title || `Location ${idx + 1}`,
          description: l.description || `Location in ${setting}`,
          coordinates: l.coordinates || { x: 40 + idx * 20, y: 50 },
          ambientSensory: l.ambientSensory || `Visual: ${l.name || 'Location'}.`,
        }));
        capabilities = [
          { capabilityId: 'cap_synthesized_primary', name: 'Synthesized Core Capability', description: 'Primary world capability.', source: 'AI_PROPOSAL', powerTier: 'Moderate', validated: true }
        ];
        worldRules = [
          { ruleId: 'rule_synthesized_constraint', ruleType: 'CANON_RULE', description: 'Primary world operational constraint.', validated: true }
        ];
      } else {
        // Analyze premise keywords for theme
      const premiseLower = input.naturalLanguagePremise.toLowerCase();
      const isGlassTheme = premiseLower.includes('glass') || premiseLower.includes('crystal') || premiseLower.includes('prism') || premiseLower.includes('shard');
      const isPlantTheme = premiseLower.includes('plant') || premiseLower.includes('overrun') || premiseLower.includes('forest') || premiseLower.includes('vine') || premiseLower.includes('flora');
      const isDarkTheme = premiseLower.includes('dark') || premiseLower.includes('grim') || premiseLower.includes('doom') || premiseLower.includes('shadow') || premiseLower.includes('blood') || premiseLower.includes('death') || premiseLower.includes('horror') || premiseLower.includes('sunken');
      const isSpaceTheme = premiseLower.includes('space') || premiseLower.includes('star') || premiseLower.includes('solar') || premiseLower.includes('void') || premiseLower.includes('alien') || premiseLower.includes('ship');

      if (isGlassTheme) {
        title = title || 'Glassbound Horizon';
        summary = 'A breathtaking realm forged of translucent glass, reflective spires, and prismatic energy.';
        description = `Grounded in the premise: "${input.naturalLanguagePremise}". A high-tech cybernetic and crystalline domain where architecture and technology are fused with indestructible tempered glass.`;
        genreTags = input.genreTags && input.genreTags.length > 0 ? input.genreTags : ['Cyberpunk', 'Sci-Fi'];
        toneTags = input.toneTags && input.toneTags.length > 0 ? input.toneTags : ['Sleek', 'Prismatic'];
        era = 'Age of Crystalline Grid';
        setting = 'The Prism Spire Metropolis';

        locations = [
          { id: 'loc_glass_core', name: 'The Obsidian Glass Spire', description: 'A towering monolith of black tempered glass housing quantum core terminals.', coordinates: { x: 30, y: 30 }, ambientSensory: 'Visual: Prismatic light bending through dark glass. Auditory: Humming quantum servers.' },
          { id: 'loc_shard_district', name: 'Shattered Shard Market', description: 'A bustling commercial sector built among floating glass platforms.', coordinates: { x: 60, y: 35 }, ambientSensory: 'Visual: Neon reflections on transparent walkways. Auditory: Chimes and transaction pings.' }
        ];

        factions = [
          { id: 'fac_glass_syndicate', name: 'The Prismatic Syndicate', description: 'Cybernetic architects who control the glass-fusion refineries.' },
          { id: 'fac_glass_rebels', name: 'The Shard-Breaker Resistance', description: 'Outlaws fighting against corporate glass monopolies.' }
        ];

        characters = [
          { id: 'char_glass_kora', name: 'Kora the Refractor', role: 'Chief Glasswright', locationId: 'loc_glass_core', motivation: 'To forge an unbreakable optical network across the sector.' }
        ];

        events = [
          {
            id: 'evt_glass_surge',
            title: 'Prismatic Energy Surge',
            description: 'A massive refraction overload causes glowing light pulses across all glass district conduits.',
            category: 'SUPERNATURAL',
            scheduledTime: { year: 42, month: 10, day: 15, hour: 12, minute: 0, second: 0 },
            participatingActors: ['fac_glass_syndicate'],
            locationId: 'loc_glass_core',
            preconditions: { requiredEvents: [], requiredWorldFacts: [] },
            plannedConsequences: [{ type: 'world_fact', targetId: 'loc_glass_core', detail: 'Grid efficiency increases by 20%.' }],
            visibility: 'PUBLIC'
          }
        ];

        capabilities = [
          { capabilityId: 'cap_glass_refraction', name: 'Prismatic Laser Refraction', description: 'Bend light and energy beams through quantum glass focusers.', source: 'AI_PROPOSAL', powerTier: 'Major', validated: true }
        ];

        worldRules = [
          { ruleId: 'rule_glass_integrity', ruleType: 'ENVIRONMENTAL_CONSTRAINT', description: 'Structural integrity of glass infrastructure must be maintained via cooling fields.', validated: true }
        ];

      } else if (isPlantTheme) {
        title = title || 'Verdant Reclamation';
        summary = 'An untamed world where colossal sentient flora and sprawling vines have choked industrial machinery.';
        description = `Grounded in the premise: "${input.naturalLanguagePremise}". A cynical steampunk realm where massive, adaptive plant life constantly threatens rust-covered factories and brass boilers.`;
        genreTags = input.genreTags && input.genreTags.length > 0 ? input.genreTags : ['Steampunk', 'Post-Apocalyptic'];
        toneTags = input.toneTags && input.toneTags.length > 0 ? input.toneTags : ['Cynical', 'Wild'];
        era = 'Age of the Great Root';
        setting = 'The Overgrown Industrial Basin';

        locations = [
          { id: 'loc_plant_canopy', name: 'The Colossal World Root', description: 'A mile-thick ancient trunk housing steam-powered elevators and vine balconies.', coordinates: { x: 40, y: 40 }, ambientSensory: 'Visual: Bioluminescent moss and dripping sap. Auditory: Creaking wood and rhythmic steam pistons.' },
          { id: 'loc_boiler_yard', name: 'Rust-Iron Boiler Yard', description: 'A smog-choked factory floor locked in constant battle with encroaching briars.', coordinates: { x: 65, y: 50 }, ambientSensory: 'Visual: Black smoke curling through emerald leaves. Auditory: Hissing steam valves and snapping vines.' }
        ];

        factions = [
          { id: 'fac_plant_wardens', name: 'The Thorn Guild', description: 'Engineers who harvest resilient plant fibers to reinforce steampunk machinery.' },
          { id: 'fac_plant_purists', name: 'The Root Ascendancy', description: 'Radicals seeking to completely purge industrial engines in favor of primordial nature.' }
        ];

        characters = [
          { id: 'char_plant_silas', name: 'Mechanist Silas', role: 'Boiler Foreman', locationId: 'loc_boiler_yard', motivation: 'To keep the steam engines running against the suffocating overgrowth.' }
        ];

        events = [
          {
            id: 'evt_plant_bloom',
            title: 'Great Spore Bloom',
            description: 'Colossal spores burst across the industrial basin, inducing metallic corrosion in steam boilers.',
            category: 'DISASTER',
            scheduledTime: { year: 42, month: 10, day: 16, hour: 8, minute: 0, second: 0 },
            participatingActors: ['fac_plant_wardens'],
            locationId: 'loc_boiler_yard',
            preconditions: { requiredEvents: [], requiredWorldFacts: [] },
            plannedConsequences: [{ type: 'location_state_change', targetId: 'loc_boiler_yard', detail: 'Boiler efficiency drops; maintenance required.' }],
            visibility: 'PUBLIC'
          }
        ];

        capabilities = [
          { capabilityId: 'cap_plant_sap', name: 'Bio-Steam Infusion', description: 'Combine botanical sap with pressurized steam to generate organic propulsion.', source: 'AI_PROPOSAL', powerTier: 'Moderate', validated: true }
        ];

        worldRules = [
          { ruleId: 'rule_plant_corrosion', ruleType: 'ENVIRONMENTAL_CONSTRAINT', description: 'Unchecked botanical sap rapidly corrodes exposed iron and brass.', validated: true }
        ];

      } else if (isDarkTheme) {
        title = title || 'Gloomspire Under-Plains';
        summary = 'A shadow-shrouded sunken realm where basalt spires harvest residual spiritual embers.';
        description = 'An atmospheric, grim fantasy setting. Deep basalt canyons house defensive settlements keeping watch against the shifting abyssal tide.';
        genreTags = input.genreTags && input.genreTags.length > 0 ? input.genreTags : ['Dark Fantasy', 'Grimdark'];
        toneTags = input.toneTags && input.toneTags.length > 0 ? input.toneTags : ['Grim', 'Ominous'];
        era = 'Age of Smothered Flames';
        setting = 'Gloomspire Abyssal Rift';

        locations = [
          { id: 'loc_syn_temple', name: 'The Obsidian Cathedral', description: 'A massive basalt vault where acolytes tend the last dying spark of solar fire.', coordinates: { x: 30, y: 40 }, ambientSensory: 'Visual: Heavy ash drifting in candlelight. Auditory: Low, continuous harmonic chanting.' },
          { id: 'loc_syn_keep', name: 'The Ashen Keep', description: 'A jagged stone military fortress overlooking the northern canyons.', coordinates: { x: 50, y: 25 }, ambientSensory: 'Visual: Flickering iron braziers lighting massive stonework. Auditory: Clanking armor and high-altitude wind.' }
        ];

        factions = [
          { id: 'fac_syn_wardens', name: 'The Obsidian Wardens', description: 'The sworn protectors of the Cathedral dedicated to keeping the dark flame active.' }
        ];

        characters = [
          { id: 'char_syn_vaelen', name: 'Inquisitor Vaelen', role: 'Cathedral Commander', locationId: 'loc_syn_temple', motivation: 'To find and secure a legendary resonance seed.' }
        ];

        events = [
          {
            id: 'evt_syn_tremor',
            title: 'Subterranean Bedrock Tremor',
            description: 'A geological anomaly causes structural micro-fractures.',
            category: 'DISASTER',
            scheduledTime: { year: 42, month: 10, day: 15, hour: 6, minute: 0, second: 0 },
            participatingActors: ['fac_syn_wardens'],
            locationId: 'loc_syn_temple',
            preconditions: { requiredEvents: [], requiredWorldFacts: [] },
            plannedConsequences: [{ type: 'location_state_change', targetId: 'loc_syn_temple', detail: 'Structural micro-fractures increase danger.' }],
            visibility: 'PUBLIC'
          }
        ];

        capabilities = [
          { capabilityId: 'cap_syn_flame', name: 'Basalt Resonance Spark', description: 'Manipulate residual solar embers.', source: 'AI_PROPOSAL', powerTier: 'Moderate', validated: true }
        ];

        worldRules = [
          { ruleId: 'rule_syn_flame_restriction', ruleType: 'CAPABILITY_RESTRICTION', description: 'All magical activations must draw from physical fire embers or crystal conduits.', validated: true }
        ];

      } else if (isSpaceTheme) {
        title = title || 'Vanguard Star-Terraces';
        summary = 'An orbital complex in deep space built around a glowing, dormant super-rift.';
        description = 'A high-concept space science setting. Gleaming metal structures house scientists and void explorers monitoring anomalous star alignments.';
        genreTags = input.genreTags && input.genreTags.length > 0 ? input.genreTags : ['Space Opera', 'Sci-Fi'];
        toneTags = input.toneTags && input.toneTags.length > 0 ? input.toneTags : ['Heroic', 'Luminescent'];
        era = 'First Radiance of the Void';
        setting = 'The Deep Space Void Basin';

        locations = [
          { id: 'loc_syn_command', name: 'Apex Control Terraces', description: 'The main administrative orbital hub regulating sector gravity beams.', coordinates: { x: 30, y: 35 }, ambientSensory: 'Visual: Holographic stellar maps. Auditory: Hum of gravity drives.' }
        ];

        factions = [
          { id: 'fac_syn_scientists', name: 'The Apex Research Union', description: 'Pioneers researching high-efficiency gravity manipulation.' }
        ];

        characters = [
          { id: 'char_syn_archon', name: 'Commander Selene', role: 'Apex Chief Director', locationId: 'loc_syn_command', motivation: 'To activate the super-rift.' }
        ];

        events = [
          {
            id: 'evt_syn_alignment',
            title: 'Hyper-Spatial Star Conjunction',
            description: 'Binary stars align, triggering gravitation flares.',
            category: 'SUPERNATURAL',
            scheduledTime: { year: 42, month: 10, day: 15, hour: 14, minute: 0, second: 0 },
            participatingActors: ['fac_syn_scientists'],
            locationId: 'loc_syn_command',
            preconditions: { requiredEvents: [], requiredWorldFacts: [] },
            plannedConsequences: [{ type: 'location_state_change', targetId: 'loc_syn_command', detail: 'Gravity-well pull increases.' }],
            visibility: 'PUBLIC'
          }
        ];

        capabilities = [
          { capabilityId: 'cap_syn_gravity', name: 'Grav-Beam Coalescence', description: 'Manipulate artificial gravity parameters.', source: 'AI_PROPOSAL', powerTier: 'Major', validated: true }
        ];

        worldRules = [
          { ruleId: 'rule_syn_vacuum', ruleType: 'ENVIRONMENTAL_CONSTRAINT', description: 'Atmosphere is strictly limited. Void zones require pressurized suits.', validated: true }
        ];

      } else {
        // General Premise-Faithful Fallback
        const cleanPremise = input.naturalLanguagePremise.trim();
        title = title || (cleanPremise.length > 30 ? cleanPremise.substring(0, 27) + '...' : cleanPremise);
        summary = `A dynamic world synthesized from premise: "${cleanPremise}".`;
        description = `An expansive campaign setting grounded in the premise: "${cleanPremise}". Featuring local factions, emergent challenges, and dynamic geography.`;
        genreTags = input.genreTags && input.genreTags.length > 0 ? input.genreTags : ['Original'];
        toneTags = input.toneTags && input.toneTags.length > 0 ? input.toneTags : ['Dynamic'];
        era = input.defaultEra || 'Current Age';
        setting = input.setting || 'The Central Expanse';

        locations = [
          { id: 'loc_gen_center', name: 'Core Convergence Hub', description: `The primary nexus point of ${setting}.`, coordinates: { x: 50, y: 50 }, ambientSensory: 'Visual: Shifting horizons. Auditory: Ambient echoes.' }
        ];
        factions = [
          { id: 'fac_gen_vanguard', name: 'Vanguard Alliance', description: 'Independent actors navigating the shifting frontier.' }
        ];
        characters = [
          { id: 'char_gen_protagonist', name: 'Guide Vane', role: 'Expedition Lead', locationId: 'loc_gen_center', motivation: 'To chart the expanding frontiers of the realm.' }
        ];
        events = [
          {
            id: 'evt_gen_start',
            title: 'Convergence Threshold',
            description: 'Local energies align to initiate the campaign era.',
            category: 'DISCOVERY',
            scheduledTime: { year: 42, month: 10, day: 14, hour: 12, minute: 0, second: 0 },
            participatingActors: ['fac_gen_vanguard'],
            locationId: 'loc_gen_center',
            preconditions: { requiredEvents: [], requiredWorldFacts: [] },
            plannedConsequences: [{ type: 'world_fact', targetId: 'loc_gen_center', detail: 'Exploration vectors open.' }],
            visibility: 'PUBLIC'
          }
        ];
        capabilities = [
          { capabilityId: 'cap_gen_adapt', name: 'Adaptive Resonance', description: 'Adapt to regional anomalies seamlessly.', source: 'AI_PROPOSAL', powerTier: 'Moderate', validated: true }
        ];
        worldRules = [
          { ruleId: 'rule_gen_frontier', ruleType: 'CANON_RULE', description: 'Frontier conditions require active resource management.', validated: true }
        ];
      }
      }
    }

    // ENSURE EVERY LOCATION NODE HAS A CORRESPONDING PREVIEW GEOGRAPHY NODE FOR FRONT-END RECT WIZARD COMPATIBILITY
    const nodes = locations.map(loc => ({
      id: loc.id,
      name: loc.name,
      description: loc.description,
      regionId: setting || title
    }));

    // RUN DETERMINISTIC EVENT VALIDATION AND REPAIR BEFORE SAVING TO THE REPOSITORY
    const validatedEvents = this.validateAndNormalizeEvents(
      events,
      locations,
      characters,
      factions
    );

    // BUILD FINAL STRUCTURED WORLD TEMPLATE CONFORMING TO DREAMBOOK & SPECIFICATION STANDARDS
    const world: WorldTemplate = {
      worldId,
      title: title || 'Synthesized World Realm',
      summary: summary || `Synthesized from premise: ${input.naturalLanguagePremise}`,
      description: description || `Synthesized from premise: ${input.naturalLanguagePremise}. An expansive world featuring rich lore, factions, and emergent narrative opportunities.`,
      genreTags,
      toneTags,
      mediumTags,
      canonMode: input.canonMode || 'Original',
      rulesetId: input.rulesetId || 'rules_std',
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
      playstyle: input.storyMode || 'PROTAGONIST',
      rules: input.dndRulesMode || 'FULL_DND',
      supportedPlaystyles: ['PROTAGONIST', 'SIDE_CHARACTER', 'FREE_ROAM'],
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
      timeline: input.timeline || [{ era: era, event: `Genesis of the ${setting}` }],
      characters: characters,
      factions: factions,
      magicRules: input.magicRules || { system: 'Resonant Harmonics', cost: 'Fatigue' },
      economy: input.economy || { currency: 'Silver Shards', tradeHubs: ['Grand Bazaar'] },
      forbiddenContradictions: input.forbiddenContradictions || ['Magic cannot create true perpetual motion without resonant toll.'],
      startingStarts: input.startingStarts || locations.slice(0, 2).map(l => l.name),
      terminology: input.terminology || { 'Orrery': 'Celestial mechanical simulator' },
      knowledgeBoundaries: input.knowledgeBoundaries || { forbiddenKnowledgeLevel: 'Tier-4 Anomaly' },
      artConfig: input.artConfig || { palette: 'mythic_amber_stone', style: 'painterly_realism' },
      audioConfig: input.audioConfig || { ambientTrack: 'ambient_whispering_wind', reverbPreset: 'stone_cathedral' },
      narrativeConfig: input.narrativeConfig || { pacing: 'deliberate_epic', pov: 'third_person_limited' },
      events: validatedEvents,
    };

    worldRepository.saveWorldTemplate(world);
    return world;
  }

  /**
   * Deterministic event validation and repair pipeline.
   * Ensures that AI-generated events conform completely to campaign schemas,
   * resolve IDs, link with valid locations, and maintain valid causal preconditions.
   */
  private validateAndNormalizeEvents(
    eventsRaw: any[],
    locations: any[],
    characters: any[],
    factions: any[]
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
      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `evt_syn_event_${Date.now()}_${idx}`;
      if (eventIds.has(id)) {
        id = `evt_syn_event_${Date.now()}_${idx}_unique`;
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
      const year = typeof scheduledTime.year === 'number' && scheduledTime.year > 0 ? scheduledTime.year : 42;
      const month = typeof scheduledTime.month === 'number' && scheduledTime.month >= 1 && scheduledTime.month <= 12 ? scheduledTime.month : 10;
      const day = typeof scheduledTime.day === 'number' && scheduledTime.day >= 1 && scheduledTime.day <= 30 ? scheduledTime.day : 15 + idx;
      const hour = typeof scheduledTime.hour === 'number' && scheduledTime.hour >= 0 && scheduledTime.hour < 24 ? scheduledTime.hour : 12;
      const minute = typeof scheduledTime.minute === 'number' && scheduledTime.minute >= 0 && scheduledTime.minute < 60 ? scheduledTime.minute : 0;
      const second = 0;
      // standard month elapsed seconds logic
      const totalElapsedSeconds = (year * 360 * 24 * 3600) + ((month - 1) * 30 * 24 * 3600) + ((day - 1) * 24 * 3600) + (hour * 3600) + (minute * 60);

      const validatedTimestamp = {
        year, month, day, hour, minute, second, totalElapsedSeconds
      };

      // 6. Location ID Validation
      let locationId = typeof raw.locationId === 'string' && raw.locationId.trim() ? raw.locationId.trim() : undefined;
      if (locationId && !locationIds.has(locationId)) {
        locationId = locations.length > 0 ? locations[0].id : undefined;
      }

      // 7. Actor references validation
      let participatingActors: string[] = [];
      if (Array.isArray(raw.participatingActors)) {
        participatingActors = raw.participatingActors.filter((actorId: any) => {
          return typeof actorId === 'string' && (characterIds.has(actorId) || factionIds.has(actorId));
        });
      }

      // 8. Preconditions validation (Impossible self dependency filter)
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
          let targetId = typeof con.targetId === 'string' && con.targetId.trim() ? con.targetId.trim() : id;
          if (targetId && !entityIds.has(targetId) && targetId !== id) {
            targetId = id;
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
        visibility,
        status
      });
    }

    // 10. Post-filtering of requiredEvents to enforce strict referential integrity
    const finalEventIds = new Set(cleanedEvents.map(e => e.id));
    cleanedEvents.forEach(e => {
      e.preconditions.requiredEvents = e.preconditions.requiredEvents.filter((depId: string) => finalEventIds.has(depId));
    });

    return cleanedEvents;
  }
}

export const worldSynthesisService = new WorldSynthesisService();
