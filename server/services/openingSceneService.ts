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
Generate a concise, player-friendly opening scene for a newly begun story run based strictly on the canonical context provided.
The opening should orient the player without over-explaining. Mention the place, time, immediate sensory impression, current situation, and one clear thing that could be acted on next.
Use the canonical narrative mode and rules mode from the supplied context. Do not reinterpret or overwrite them.
For PROTAGONIST, frame the player as the primary narrative focus and make the immediate situation meaningfully responsive to them.
For SIDE_CHARACTER, preserve a wider story beyond the player: the player is a meaningful participant but not automatically the central hero, and other principal actors may continue independently.
For FREE_ROAM, preserve open agency: do not impose a chosen-one or predetermined hero arc, and make clear that the world can evolve independently of the player.
Use 60–120 words of prose and at least 4 short structured events (e.g. 4 to 5 events).
Do not recap the entire world history, character biography, or quest lore unless it is necessary to understand the first moment.
Do not use headings such as "Key Narrative Moments" or "Immediate Epistemic Horizon" in the generated prose.

STRICT ANTI-CONTAMINATION RULES:
- Ground ONLY in the provided world ("${rawOpeningFacts.world.title}") and location ("${rawOpeningFacts.location.name}").
- NEVER mention Citadel, The End, Whispering Orrery, Scribe Vael, Maren, Master Elian, or Astral Prism unless explicitly part of this world's canonical context.
- Output JSON strictly matching the requested schema.`;

        const promptText = `Assemble the dynamic opening scene using this canonical working context:
${workingContext.assembledText}

Produce a concise narrative between 60 and 120 words, plus 4 to 5 structured narrative events.
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
        if (parsed.narrativeText && Array.isArray(parsed.structuredEvents) && parsed.structuredEvents.length >= 4) {
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
      narrativeProfile: rawOpeningFacts.world.narrativeProfile,
      dndRulesMode: rawOpeningFacts.world.dndRulesMode,
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
    const summary = `${character.name} ${character.role} ${character.background} ${character.startingSituation} ${character.conditions.join(' ')}`.toLowerCase();
    const isSciFi =
      (world.genre || '').toLowerCase().includes('sci-fi') ||
      (world.title || '').toLowerCase().includes('space') ||
      (world.setting || '').toLowerCase().includes('cyber');

    let p1 = '';
    let p2 = '';

    if (isSciFi) {
      p1 = `${time.formattedHeader}. ${character.name} stands in ${location.name}, listening to the quiet machinery beneath the floor. ${location.ambientSensory}`;
      p2 = `${character.startingSituation || 'The immediate systems are stable.'} Ahead, the scene offers a small number of obvious choices, but nothing forces your hand.`;
    } else if (summary.includes('werewolf') || summary.includes('lycanthro')) {
      p1 = `${time.formattedHeader}. ${location.name} is still, cold, and close around ${character.name}, the ${character.role || 'scholar'}. ${location.ambientSensory}`;
      p2 = `${character.startingSituation || 'Your hidden werewolf condition remains under control for now.'} Sifting through archives for a cure to your curse, something in the surroundings gives you reason to pay attention.`;
    } else {
      p1 = `${time.formattedHeader}. ${character.name} arrives in ${location.name}, within ${location.region}. ${location.ambientSensory}`;
      p2 = `${character.startingSituation || 'For the moment, the way forward is open.'} Nothing has happened yet that demands a single answer; the next move is yours.`;
    }

    const structuredEvents: StructuredNarrativeEvent[] = [
      {
        id: `evt_open_${storyId}_0`,
        type: 'location',
        text: `${location.name} — ${location.region}`,
        timestamp: time.formattedHeader,
      },
      {
        id: `evt_open_${storyId}_1`,
        type: 'normal',
        text: location.ambientSensory || `The immediate surroundings of ${location.name} are quiet.`,
        timestamp: time.formattedHeader,
      },
      {
        id: `evt_open_${storyId}_2`,
        type: 'action',
        text: `You take a breath, preparing to act.`,
        timestamp: time.formattedHeader,
      },
      {
        id: `evt_open_${storyId}_3`,
        type: 'quest',
        text: 'The scene is established. Decide what to do next.',
        timestamp: time.formattedHeader,
      },
    ];

    return {
      narrativeText: `${p1}\n\n${p2}`,
      structuredEvents,
    };
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
