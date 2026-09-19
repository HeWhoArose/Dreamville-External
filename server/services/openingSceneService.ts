import { GoogleGenAI, Type } from '@google/genai';
import { worldRepository, WorldRepository } from '../repositories/worldRepository';
import { WorkingContextEngine, AssembledOpeningContext } from '../domain/workingContextEngine';
import { OpeningScene, StructuredNarrativeEvent } from '../../src/types';
import { serverMockAuthority } from '../mockEngine/serverMockAuthority';

export interface GenerateOpeningSceneOptions {
  storyId: string;
  forceRegenerate?: boolean;
  timeoutMs?: number;
  worldRepo?: WorldRepository;
  simulateFailure?: boolean;
}

export class OpeningSceneService {
  private static simulateFailureFlag = false;

  public static setSimulateFailure(flag: boolean): void {
    OpeningSceneService.simulateFailureFlag = flag;
  }

  /**
   * Retrieves an existing opening scene for a story run without generating a new one.
   */
  public static getOpeningScene(storyId: string, repo: WorldRepository = worldRepository): OpeningScene | null {
    if (!storyId) return null;
    const run = repo.getStoryRun(storyId);
    return run?.openingScene || null;
  }

  /**
   * Generates or retrieves the canonical opening scene for a StoryRun.
   * Enforces strict idempotency, epistemic boundaries, and deterministic persistence.
   */
  public static async generateOpeningScene(options: GenerateOpeningSceneOptions): Promise<OpeningScene> {
    const { storyId, forceRegenerate = false, timeoutMs = 7000, worldRepo = worldRepository, simulateFailure = false } = options;

    if (!storyId) {
      throw new Error('storyId is required to generate an opening scene.');
    }

    if (simulateFailure || OpeningSceneService.simulateFailureFlag) {
      throw new Error('Simulated narrative generation service failure.');
    }

    const run = worldRepo.getStoryRun(storyId);
    if (!run) {
      throw new Error(`StoryRun with ID "${storyId}" does not exist in repository.`);
    }

    // Idempotency: return existing opening scene if already generated and not forced
    if (run.openingScene && !forceRegenerate) {
      return run.openingScene;
    }

    // 1. Build bounded opening working context strictly from canonical state
    const workingContext: AssembledOpeningContext = WorkingContextEngine.assembleOpeningContext({
      storyId,
      hardTokenBudget: 750,
      worldRepo,
    });

    const { rawOpeningFacts } = workingContext;
    const idempotencyKey = `open_${storyId}_${run.worldId}_v1`;

    let generatedText = '';
    let generatedEvents: StructuredNarrativeEvent[] = [];

    // 2. Attempt live generation via Gemini if API key is provided
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const systemInstruction = `You are the Authoritative World Narrator for an interactive story engine.
Generate the initial opening scene for a newly begun story run based strictly on the canonical context provided.
You MUST answer all 6 canonical grounding questions naturally woven into the prose:
1. Where am I? (${rawOpeningFacts.location.name}, ${rawOpeningFacts.location.region} - visual & atmospheric sensory details)
2. When is this? (${rawOpeningFacts.time.formattedHeader})
3. What does my character perceive? (sensory cues: light, sounds, textures, air)
4. What immediate situation am I in? (character background, condition, role, immediate situation hook)
5. What is happening around me? (surroundings, presence or absence of others, tension)
6. What meaningful possibility exists right now? (initial inquiry, caution, actionable horizon)

STRICT ANTI-CONTAMINATION RULES:
- Ground ONLY in the provided world ("${rawOpeningFacts.world.title}") and location ("${rawOpeningFacts.location.name}").
- NEVER mention Citadel, The End, Whispering Orrery, Scribe Vael, Maren, Master Elian, or Astral Prism unless explicitly part of this world's canonical context.
- Output JSON strictly matching the requested schema.`;

        const promptText = `Assemble the dynamic opening scene using this canonical working context:
${workingContext.assembledText}

Produce a vivid narrative between 120 and 280 words, plus 4 to 6 structured narrative events.
Event types MUST be chosen from: ["location", "normal", "action", "dialogue", "magic", "damage", "heal", "quest", "item", "system"].`;

        const responsePromise = ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: promptText,
          config: {
            systemInstruction,
            temperature: 0.7,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                narrativeText: {
                  type: Type.STRING,
                  description: 'The immersive opening narrative paragraph(s).',
                },
                structuredEvents: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      type: {
                        type: Type.STRING,
                        enum: ['location', 'normal', 'action', 'dialogue', 'magic', 'damage', 'heal', 'quest', 'item', 'system'],
                      },
                      text: { type: Type.STRING },
                      speaker: { type: Type.STRING },
                    },
                    required: ['id', 'type', 'text'],
                  },
                },
              },
              required: ['narrativeText', 'structuredEvents'],
            },
          },
        });

        // Timeout wrapper
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI generation timed out')), timeoutMs)
        );

        const aiResult = (await Promise.race([responsePromise, timeoutPromise])) as any;
        const parsed = JSON.parse(aiResult.text || '{}');
        if (parsed.narrativeText && Array.isArray(parsed.structuredEvents) && parsed.structuredEvents.length > 0) {
          generatedText = parsed.narrativeText.trim();
          generatedEvents = parsed.structuredEvents.map((evt: any, idx: number) => ({
            id: evt.id || `evt_open_${storyId}_${idx}`,
            type: evt.type || 'normal',
            text: evt.text,
            speaker: evt.speaker || (evt.type === 'dialogue' ? 'Narrator' : undefined),
            timestamp: rawOpeningFacts.time.formattedHeader,
          }));
        }
      } catch (aiErr) {
        // Fall back gracefully to deterministic generator
        console.warn(`[OpeningSceneService] Live AI generation fallback for ${storyId}:`, (aiErr as any)?.message || aiErr);
      }
    }

    // 3. Deterministic Canonical Generator (Guaranteed sandbox & offline safety)
    if (!generatedText || generatedEvents.length === 0) {
      const canonical = OpeningSceneService.synthesizeDeterministicOpening(rawOpeningFacts, storyId);
      generatedText = canonical.narrativeText;
      generatedEvents = canonical.structuredEvents;
    }

    // Sanitize any accidental fixture leakage
    generatedText = OpeningSceneService.sanitizeFixtureLeaks(generatedText, rawOpeningFacts);

    const openingScene: OpeningScene = {
      storyId,
      worldId: run.worldId,
      worldName: rawOpeningFacts.world.title,
      startingLocationId: rawOpeningFacts.location.id,
      startingLocationName: rawOpeningFacts.location.name,
      characterId: run.characterId || `char_${storyId}`,
      characterName: rawOpeningFacts.character.name,
      characterRole: rawOpeningFacts.character.role || 'Protagonist',
      worldTime: {
        cycle: rawOpeningFacts.time.cycle,
        period: rawOpeningFacts.time.period,
        era: rawOpeningFacts.time.era,
        formattedTime: rawOpeningFacts.time.formattedHeader,
      },
      startingSituation: rawOpeningFacts.character.startingSituation || 'Awakened into the world.',
      narrativeText: generatedText,
      structuredEvents: generatedEvents,
      generatedAt: new Date().toISOString(),
      idempotencyKey,
    };

    // 4. Persist opening scene onto the canonical StoryRun
    run.openingScene = openingScene;
    worldRepo.registerStoryRun(run);

    // 5. Update server authority's dynamic state for immediate external consistency
    serverMockAuthority.recordOpeningScene(storyId, openingScene);

    return openingScene;
  }

  /**
   * Synthesizes a high-fidelity, deterministic narrative that completely fulfills all 6 questions
   * grounded strictly in the canonical world, character, location, and time parameters.
   */
  public static synthesizeDeterministicOpening(
    facts: AssembledOpeningContext['rawOpeningFacts'],
    storyId: string
  ): { narrativeText: string; structuredEvents: StructuredNarrativeEvent[] } {
    const { world, character, location, time } = facts;

    // Detect key thematic elements from background, conditions, genre, or starting situation
    const charSummary = `${character.name} ${character.role} ${character.background} ${character.startingSituation} ${character.conditions.join(' ')}`.toLowerCase();
    const isWerewolf = charSummary.includes('werewolf') || charSummary.includes('wolf') || charSummary.includes('lycanthro');
    const isScholar = charSummary.includes('scholar') || charSummary.includes('archive') || charSummary.includes('book') || charSummary.includes('study');
    const isSciFi = (world.genre || '').toLowerCase().includes('sci-fi') || (world.title || '').toLowerCase().includes('astral') || (world.setting || '').toLowerCase().includes('space') || (world.setting || '').toLowerCase().includes('cyber');

    let p1 = '';
    let p2 = '';
    let p3 = '';

    if (isWerewolf && isScholar) {
      // Dark Fantasy Werewolf Scholar canonical prose
      p1 = `${time.formattedHeader}. The cold, quiet gloom of ${location.name} in the ${location.region} clings to the ancient stonework. ${location.ambientSensory}. Outside, the world remains entirely ignorant of what walks among them; to common folk and temple archons alike, werewolves are dismissed as bedtime horrors and forgotten myths. Yet beneath ${character.name}'s scholar's robes, the beast's pulse beats in lockstep with the human heart—a condition hidden through years of disciplined silence, cautious study, and suffocating vigilance.`;
      p2 = `Surrounded by ${location.description}, ${character.name} checks the bindings of parchment folios and inkwells with steady, measured fingers. ${character.startingSituation || 'The research has reached a perilous precipice.'} If anyone were to pierce the veil and discover the curse lurking under the scholar's quiet demeanor, fear would outstrip reason in an instant. The burning question remains an obsession: where did this monstrous affliction truly originate, and why does its dormant savagery awaken only here?`;
      p3 = `A faint tremor passes through the stillness of ${location.name}. Before ${character.name} lie scattered leads, guarded notes, and the immediate imperative to tread unseen. The path forward demands equal parts keen intellect and primal restraint.`;
    } else if (isSciFi) {
      // Sci-fi / Astral canonical prose
      p1 = `${time.formattedHeader}. Across the pressurized bulkheads of ${location.name} in the ${location.region}, the hum of life-support filters echoes steadily. ${location.ambientSensory}. ${character.name}, designated as ${character.role || 'Specialist'}, monitors the ambient telemetry. ${location.description}`;
      p2 = `${character.startingSituation || 'Systems have completed initialization.'} Equipped with standard kit and operational discipline, ${character.name} stands amid the flickering instrument arrays. The expanse of ${world.title} stretches beyond the observation ports, filled with unresolved trajectories and unmapped horizons.`;
      p3 = `Telemetry feeds blink into readiness. ${character.name} prepares to calibrate navigation vectors and execute the initial protocol.`;
    } else {
      // General atmospheric fantasy / adventure canonical prose
      p1 = `${time.formattedHeader}. The air in ${location.name}, nestled within the ${location.region}, stirs with an expectant quiet. ${location.ambientSensory}. ${character.name}, recognized as ${character.role || 'Traveler'}, steps into the space, taking measure of every contour and shadow. ${location.description}`;
      p2 = `${character.startingSituation || 'The initial journey begins.'} With belongings secured and senses sharp, ${character.name} reflects on the road that led to ${world.title}. The world's quiet currents are already in motion, indifferent yet brimming with latent promise.`;
      p3 = `As the light of ${time.period} deepens across ${location.name}, immediate paths and unanswered questions present themselves. The moment has arrived to make the first deliberate move.`;
    }

    const narrativeText = `${p1}\n\n${p2}\n\n${p3}`;

    const structuredEvents: StructuredNarrativeEvent[] = [
      {
        id: `evt_open_${storyId}_0`,
        type: 'location',
        text: `Arrived at ${location.name} (${location.region}) at ${time.period}, Cycle ${time.cycle}.`,
        timestamp: time.formattedHeader,
      },
      {
        id: `evt_open_${storyId}_1`,
        type: 'normal',
        text: location.ambientSensory || `The ambient atmosphere of ${location.name} surrounds ${character.name}.`,
        timestamp: time.formattedHeader,
      },
      {
        id: `evt_open_${storyId}_2`,
        type: 'normal',
        text: `${character.name} reflects on the immediate situation: ${character.startingSituation || 'A new chapter begins.'}`,
        timestamp: time.formattedHeader,
      },
      {
        id: `evt_open_${storyId}_3`,
        type: isWerewolf ? 'system' : 'action',
        text: isWerewolf
          ? `Condition verified: Hidden lycanthropy held in check beneath scholar's mantle.`
          : `${character.name} surveys the immediate surroundings and readies equipment.`,
        timestamp: time.formattedHeader,
      },
      {
        id: `evt_open_${storyId}_4`,
        type: 'quest',
        text: isWerewolf
          ? `Objective: Uncover the true origin of the werewolf curse while preserving concealment.`
          : `Horizon: Investigate the surrounding mysteries of ${location.name}.`,
        timestamp: time.formattedHeader,
      },
    ];

    return { narrativeText, structuredEvents };
  }

  /**
   * Firewall filter that scrubs out any forbidden demo fixture names if they were inadvertently hallucinated.
   */
  private static sanitizeFixtureLeaks(
    text: string,
    facts: AssembledOpeningContext['rawOpeningFacts']
  ): string {
    const forbidden = [
      { pattern: /\bCitadel\b/gi, replacement: facts.location.region || 'the realm' },
      { pattern: /\bThe End\b/gi, replacement: 'the frontier' },
      { pattern: /\bWhispering Orrery\b/gi, replacement: facts.location.name },
      { pattern: /\bScribe Vael\b/gi, replacement: 'a quiet observer' },
      { pattern: /\bMaren\b/gi, replacement: 'a local resident' },
      { pattern: /\bMaster Elian\b/gi, replacement: 'the instructor' },
      { pattern: /\bAstral Prism\b/gi, replacement: 'the ancient relic' },
    ];

    let sanitized = text;
    for (const { pattern, replacement } of forbidden) {
      // Only replace if it wasn't canonically provided in this world's name or location
      if (
        !facts.world.title.toLowerCase().includes(pattern.source.toLowerCase().replace(/\\b/g, '')) &&
        !facts.location.name.toLowerCase().includes(pattern.source.toLowerCase().replace(/\\b/g, ''))
      ) {
        sanitized = sanitized.replace(pattern, replacement);
      }
    }
    return sanitized;
  }
}
