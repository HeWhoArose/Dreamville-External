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
      // Analyze premise keywords for theme
      const premiseLower = input.naturalLanguagePremise.toLowerCase();
      const isDarkTheme = premiseLower.includes('dark') || premiseLower.includes('grim') || premiseLower.includes('doom') || premiseLower.includes('shadow') || premiseLower.includes('blood') || premiseLower.includes('death') || premiseLower.includes('horror') || premiseLower.includes('sunken');
      const isSpaceTheme = premiseLower.includes('space') || premiseLower.includes('star') || premiseLower.includes('solar') || premiseLower.includes('void') || premiseLower.includes('alien') || premiseLower.includes('ship');
      const isIndustrialTheme = premiseLower.includes('steam') || premiseLower.includes('gear') || premiseLower.includes('iron') || premiseLower.includes('clockwork') || premiseLower.includes('forge');

      if (isDarkTheme) {
        title = title || 'Gloomspire Under-Plains';
        summary = 'A shadow-shrouded sunken realm where basalt spires harvest residual spiritual embers.';
        description = 'An atmospheric, grim fantasy setting. Deep basalt canyons house defensive settlements keeping watch against the shifting abyssal tide.';
        genreTags = input.genreTags && input.genreTags.length > 0 ? input.genreTags : ['Dark Fantasy', 'Grimdark'];
        toneTags = input.toneTags && input.toneTags.length > 0 ? input.toneTags : ['Grim', 'Ominous'];
        era = 'Age of Smothered Flames';
        setting = 'Gloomspire Abyssal Rift';

        locations = [
          { id: 'loc_syn_temple', name: 'The Obsidian Cathedral', description: 'A massive basalt vault where acolytes tend the last dying spark of solar fire.', coordinates: { x: 30, y: 40 }, ambientSensory: 'Visual: Heavy ash drifting in candlelight. Auditory: Low, continuous harmonic chanting.' },
          { id: 'loc_syn_keep', name: 'The Ashen Keep', description: 'A jagged stone military fortress overlooking the northern canyons.', coordinates: { x: 50, y: 25 }, ambientSensory: 'Visual: Flickering iron braziers lighting massive stonework. Auditory: Clanking armor and high-altitude wind.' },
          { id: 'loc_syn_mire', name: 'Mire of Lost Embers', description: 'A dense, waterlogged peat bog illuminated by green bioluminescent gasses.', coordinates: { x: 70, y: 45 }, ambientSensory: 'Visual: Green phosphoresces shifting above bubbling dark mud. Auditory: Squelching wet earth and distant frog calls.' },
          { id: 'loc_syn_rift', name: 'The Umbral Maw', description: 'A sheer, bottomless chasm where shadowy entities crawl from the deepest depths.', coordinates: { x: 45, y: 75 }, ambientSensory: 'Visual: Infinite darkness with occasional violet lightning. Auditory: Shrill, unearthly whisperings.' }
        ];

        factions = [
          { id: 'fac_syn_wardens', name: 'The Obsidian Wardens', description: 'The sworn protectors of the Cathedral dedicated to keeping the dark flame active.' },
          { id: 'fac_syn_cult', name: 'The Void-Bound Tribunal', description: 'A radical sect seeking to plunge the remaining spires into the chasm.' }
        ];

        characters = [
          { id: 'char_syn_vaelen', name: 'Inquisitor Vaelen', role: 'Cathedral Commander', locationId: 'loc_syn_temple', motivation: 'To find and secure a legendary prism-resonance seed before the Tribunal.' },
          { id: 'char_syn_morana', name: 'Lady Morana', role: 'Tribunal High Priestess', locationId: 'loc_syn_rift', motivation: 'To trigger the Eclipse Protocol and shatter the solar crystalline barrier.' },
          { id: 'char_syn_maren', name: 'Acolyte Maren', role: 'Archivist Priest', locationId: 'loc_syn_temple', motivation: 'To translate the ancient basalt slabs containing the planetary alignment calendar.' }
        ];

        events = [
          {
            id: 'evt_syn_tremor',
            title: 'Subterranean Bedrock Tremor',
            description: 'A massive geological anomaly causes structural micro-fractures in the foundation of the Obsidian Cathedral.',
            category: 'DISASTER',
            scheduledTime: { year: 42, month: 10, day: 15, hour: 6, minute: 0, second: 0 },
            participatingActors: ['fac_syn_wardens'],
            locationId: 'loc_syn_temple',
            preconditions: { requiredEvents: [], requiredWorldFacts: [] },
            plannedConsequences: [
              { type: 'location_state_change', targetId: 'loc_syn_temple', detail: 'Structural damage to the Prism pillars increases danger levels.' }
            ],
            visibility: 'PUBLIC'
          },
          {
            id: 'evt_syn_infiltration',
            title: 'Tribunal Infiltration Attempt',
            description: 'Void-Bound Tribunal agents attempt to steal key liturgical records detailing the Cathedral seals.',
            category: 'FACTION',
            scheduledTime: { year: 42, month: 10, day: 18, hour: 23, minute: 15, second: 0 },
            participatingActors: ['char_syn_morana', 'char_syn_vaelen'],
            locationId: 'loc_syn_temple',
            preconditions: { requiredEvents: ['evt_syn_tremor'], requiredWorldFacts: [] },
            plannedConsequences: [
              { type: 'world_fact', targetId: 'fac_syn_cult', detail: 'The cult obtains half of the ancient alignment blueprints.' }
            ],
            visibility: 'SECRET'
          },
          {
            id: 'evt_syn_mobilization',
            title: 'Warden Fortress Mobilization',
            description: 'In response to increased cult activity, the Ashen Keep command sends armed patrols down into the canyons.',
            category: 'MILITARY',
            scheduledTime: { year: 42, month: 10, day: 22, hour: 8, minute: 0, second: 0 },
            participatingActors: ['char_syn_vaelen'],
            locationId: 'loc_syn_keep',
            preconditions: { requiredEvents: ['evt_syn_infiltration'], requiredWorldFacts: [] },
            plannedConsequences: [
              { type: 'actor_state', targetId: 'char_syn_vaelen', detail: 'Commander Vaelen shifts his primary presence to the canyon patrol routes.' }
            ],
            visibility: 'PUBLIC'
          },
          {
            id: 'evt_syn_consecration',
            title: 'Ritual of Umbral Summoning',
            description: 'The Void-Bound Tribunal initiates a deep summoning ceremony inside the bubbling vents of the Mire.',
            category: 'SUPERNATURAL',
            scheduledTime: { year: 42, month: 10, day: 26, hour: 2, minute: 0, second: 0 },
            participatingActors: ['char_syn_morana'],
            locationId: 'loc_syn_mire',
            preconditions: { requiredEvents: ['evt_syn_infiltration'], requiredWorldFacts: [] },
            plannedConsequences: [
              { type: 'world_fact', targetId: 'loc_syn_mire', detail: 'Bioluminescent bog gas levels spike, triggering wild mutations.' }
            ],
            visibility: 'HIDDEN'
          },
          {
            id: 'evt_syn_climax_clash',
            title: 'The Great Shadow Aligning',
            description: 'The ancient basalt alignment calendar reaches its zenith, temporarily weakening the solar crystalline shields.',
            category: 'POLITICAL',
            scheduledTime: { year: 42, month: 11, day: 2, hour: 12, minute: 0, second: 0 },
            participatingActors: ['char_syn_morana', 'char_syn_vaelen', 'char_syn_maren'],
            locationId: 'loc_syn_temple',
            preconditions: { requiredEvents: ['evt_syn_consecration', 'evt_syn_mobilization'], requiredWorldFacts: [] },
            plannedConsequences: [
              { type: 'location_state_change', targetId: 'loc_syn_temple', detail: 'The solar fire dims significantly, plunging the temple into absolute shadow.' }
            ],
            visibility: 'PUBLIC'
          }
        ];

        capabilities = [
          { capabilityId: 'cap_syn_flame', name: 'Basalt Resonance Spark', description: 'Manipulate residual solar embers inside basalt items to manifest fire magic.', source: 'AI_PROPOSAL', powerTier: 'Moderate', validated: true }
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
          { id: 'loc_syn_command', name: 'Apex Control Terraces', description: 'The main administrative orbital hub regulating sector gravity beams.', coordinates: { x: 30, y: 35 }, ambientSensory: 'Visual: Holographic stellar maps drifting over chrome terminals. Auditory: Hum of gravity drives.' },
          { id: 'loc_syn_hangar', name: 'Solaris Launch Deck', description: 'A massive vacuum-isolated shipyard holding light-skiff explorers.', coordinates: { x: 55, y: 30 }, ambientSensory: 'Visual: Distant star fields visible through forcefields. Auditory: Sparks flying from plasma welders.' },
          { id: 'loc_syn_rift_edge', name: 'The Aether Rift Border', description: 'An observation station built extremely close to the stellar anomaly.', coordinates: { x: 45, y: 70 }, ambientSensory: 'Visual: Blinding purple and cyan plasma cascades swirling in space. Auditory: Heavy radio static pulses.' }
        ];

        factions = [
          { id: 'fac_syn_scientists', name: 'The Apex Research Union', description: 'Pioneers researching high-efficiency gravity manipulation.' },
          { id: 'fac_syn_scavengers', name: 'Void-Stray Alliance', description: 'A loose syndicate of space salvagers who trade in cosmic debris.' }
        ];

        characters = [
          { id: 'char_syn_archon', name: 'Commander Selene', role: 'Apex Chief Director', locationId: 'loc_syn_command', motivation: 'To activate the super-rift using concentrated solar plasma arrays.' },
          { id: 'char_syn_skiff_captain', name: 'Pilot Jax', role: 'Skiff Captain', locationId: 'loc_syn_hangar', motivation: 'To rescue a stray crew ship trapped near the event horizon.' }
        ];

        events = [
          {
            id: 'evt_syn_alignment',
            title: 'Hyper-Spatial Star Conjunction',
            description: 'Three local binary stars align, triggering an extreme gravitation flare from the Super-Rift.',
            category: 'SUPERNATURAL',
            scheduledTime: { year: 42, month: 10, day: 15, hour: 14, minute: 0, second: 0 },
            participatingActors: ['fac_syn_scientists'],
            locationId: 'loc_syn_rift_edge',
            preconditions: { requiredEvents: [], requiredWorldFacts: [] },
            plannedConsequences: [
              { type: 'location_state_change', targetId: 'loc_syn_rift_edge', detail: 'Event horizon expands. Gravity-well pull increases by 35%.' }
            ],
            visibility: 'PUBLIC'
          },
          {
            id: 'evt_syn_scav_raid',
            title: 'Stray Void Incursion',
            description: 'Void-Stray salvagers take advantage of sensor distortion to raid the Apex Launch Deck for plasma parts.',
            category: 'FACTION',
            scheduledTime: { year: 42, month: 10, day: 19, hour: 4, minute: 30, second: 0 },
            participatingActors: ['char_syn_skiff_captain'],
            locationId: 'loc_syn_hangar',
            preconditions: { requiredEvents: ['evt_syn_alignment'], requiredWorldFacts: [] },
            plannedConsequences: [
              { type: 'resource_effect', targetId: 'loc_syn_hangar', detail: 'A solar-fusion engine is stolen from containment.' }
            ],
            visibility: 'PUBLIC'
          },
          {
            id: 'evt_syn_realign',
            title: 'Rift-Gate Super-Ignition Protocol',
            description: 'Commander Selene attempts a controlled firing of the Apex solar laser to stabilize the spatial gravity rift.',
            category: 'DISCOVERY',
            scheduledTime: { year: 42, month: 10, day: 25, hour: 18, minute: 0, second: 0 },
            participatingActors: ['char_syn_archon'],
            locationId: 'loc_syn_command',
            preconditions: { requiredEvents: ['evt_syn_scav_raid'], requiredWorldFacts: [] },
            plannedConsequences: [
              { type: 'world_fact', targetId: 'loc_syn_rift_edge', detail: 'A stable hyperspace pathway opens between the Command Center and the Inner Rift.' }
            ],
            visibility: 'SECRET'
          }
        ];

        capabilities = [
          { capabilityId: 'cap_syn_gravity', name: 'Grav-Beam Coalescence', description: 'Manipulate artificial gravity parameters to levitate and launch metallic structures.', source: 'AI_PROPOSAL', powerTier: 'Major', validated: true }
        ];

        worldRules = [
          { ruleId: 'rule_syn_vacuum', ruleType: 'ENVIRONMENTAL_CONSTRAINT', description: 'Atmosphere is strictly limited. Void zones require pressurized suits or active magnetic domes.', validated: true }
        ];

      } else {
        // Standard high fantasy default
        title = title || 'Aetheria Resonant Orrery';
        summary = 'A floating civilization of mechanical spires powered by pure celestial acoustics.';
        description = 'An elegant, high-fantasy setting. Spire cities hover above misty clouds, powered by giant rotating celestial brass armatures.';
        genreTags = input.genreTags && input.genreTags.length > 0 ? input.genreTags : ['High Fantasy', 'Steampunk'];
        toneTags = input.toneTags && input.toneTags.length > 0 ? input.toneTags : ['Heroic', 'Inspiring'];
        era = 'Age of Divine Resonance';
        setting = 'The Whispering Spire Clusters';

        locations = [
          { id: 'loc_syn_orrery', name: 'The Whispering Orrery', description: 'A cavernous brass observatory where massive clockwork rings mimic star movements.', coordinates: { x: 30, y: 30 }, ambientSensory: 'Visual: Concentric gleaming copper and brass rings revolving. Auditory: Deep rhythmic rhythmic metal hum and clicks.' },
          { id: 'loc_syn_terrace', name: 'Highcrest Sky Terrace', description: 'A limestone platform overlooking the vast, sea-like misty cloud floor.', coordinates: { x: 60, y: 25 }, ambientSensory: 'Visual: Bright sunbeams reflecting off white marble pillars. Auditory: High-altitude birds chirping and gentle breezes.' },
          { id: 'loc_syn_archive', name: 'The Core Scriptorium', description: 'The grand library storing thousands of ancient stellar frequency scrolls.', coordinates: { x: 45, y: 65 }, ambientSensory: 'Visual: Towers of parchment and stone slates. Auditory: Soft rustle of paper and ancient incense scent.' }
        ];

        factions = [
          { id: 'fac_syn_scribes', name: 'Scribes of the Astral Prism', description: 'An scholarly order devoted to keeping the clockwork mechanics calibrated.' },
          { id: 'fac_syn_weavers', name: 'Resonant Sound-Weavers', description: 'Artisans who translate physical brass rotations into magical acoustic energy.' }
        ];

        characters = [
          { id: 'char_syn_maren', name: 'Maren the Archivist', role: 'Head Librarian', locationId: 'loc_syn_archive', motivation: 'To prevent the ancient brass alignment gears from seizing.' },
          { id: 'char_syn_selene', name: 'Archon Selene', role: 'Prism Commander', locationId: 'loc_syn_orrery', motivation: 'To find and cleanse a mysterious crystalline resonance blight.' }
        ];

        events = [
          {
            id: 'evt_syn_alignment',
            title: 'Great Celestial Alignment',
            description: 'The three moons of Aetheria line up perfectly, producing a powerful harmonic vibration across the clockwork structures.',
            category: 'SUPERNATURAL',
            scheduledTime: { year: 42, month: 10, day: 15, hour: 12, minute: 0, second: 0 },
            participatingActors: ['char_syn_maren'],
            locationId: 'loc_syn_orrery',
            preconditions: { requiredEvents: [], requiredWorldFacts: [] },
            plannedConsequences: [
              { type: 'location_state_change', targetId: 'loc_syn_orrery', detail: 'The clockwork rings spin with extreme friction, triggering thermal sparks.' }
            ],
            visibility: 'PUBLIC'
          },
          {
            id: 'evt_syn_blight_bloom',
            title: 'Crystalline Blight Outbreak',
            description: 'A parasitic crystal formation, fed by thermal friction sparks, blooms along the base gears of the Scriptorium.',
            category: 'MONSTER',
            scheduledTime: { year: 42, month: 10, day: 20, hour: 18, minute: 0, second: 0 },
            participatingActors: ['char_syn_selene'],
            locationId: 'loc_syn_archive',
            preconditions: { requiredEvents: ['evt_syn_alignment'], requiredWorldFacts: [] },
            plannedConsequences: [
              { type: 'world_fact', targetId: 'loc_syn_archive', detail: 'Lower archives are quarantined due to aggressive crystal spikes.' }
            ],
            visibility: 'PUBLIC'
          },
          {
            id: 'evt_syn_scribe_council',
            title: 'Prism Order Emergency Convocation',
            description: 'Scholar delegates meet to vote on executing the gear-override sequence to save the lower Scriptorium.',
            category: 'POLITICAL',
            scheduledTime: { year: 42, month: 10, day: 24, hour: 10, minute: 0, second: 0 },
            participatingActors: ['char_syn_maren', 'char_syn_selene'],
            locationId: 'loc_syn_orrery',
            preconditions: { requiredEvents: ['evt_syn_blight_bloom'], requiredWorldFacts: [] },
            plannedConsequences: [
              { type: 'faction_state_change', targetId: 'fac_syn_scribes', detail: 'The order agrees to release classified high-reverb acoustic frequencies.' }
            ],
            visibility: 'SECRET'
          }
        ];

        capabilities = [
          { capabilityId: 'cap_syn_acoustics', name: 'Celestial Resonance Acoustics', description: 'Channel physical gear frequencies through brass tuning rods to manifest kinetic shields.', source: 'AI_PROPOSAL', powerTier: 'Moderate', validated: true }
        ];

        worldRules = [
          { ruleId: 'rule_syn_acoustics_only', ruleType: 'CANON_RULE', description: 'All active magic is acoustic and must draw upon rotating gears, wind, or voice frequencies.', validated: true }
        ];
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
