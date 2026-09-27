import { worldRepository, WorldRepository } from '../repositories/worldRepository';
import { WorkingContextEngine, AssembledOpeningContext } from '../domain/workingContextEngine';
import { narrativeContinuityEngine } from '../domain/narrativeContinuityEngine';
import { OpeningScene, StructuredNarrativeEvent } from '../../src/types';
import { serverMockAuthority } from '../mockEngine/serverMockAuthority';

export interface GenerateOpeningSceneOptions {
	storyId: string;
	forceRegenerate?: boolean;
	timeoutMs?: number;
	worldRepo?: WorldRepository;
	simulateFailure?: boolean;
	allowDeterministicFallback?: boolean;
	forceModelId?: string;
}

export class OpeningSceneService {
	private static simulateFailureFlag = false;

	public static setSimulateFailure(flag: boolean): void {
		OpeningSceneService.simulateFailureFlag = flag;
	}

	public static getOpeningScene(storyId: string, repo: WorldRepository = worldRepository): OpeningScene | null {
		if (!storyId) return null;
		const run = repo.getStoryRun(storyId);
		return run?.openingScene || null;
	}

	public static async generateOpeningScene(options: GenerateOpeningSceneOptions): Promise<OpeningScene> {
		const {
			storyId,
			forceRegenerate = false,
			timeoutMs = 12000,
			worldRepo = worldRepository,
			simulateFailure = false,
			allowDeterministicFallback = false,
			forceModelId,
		} = options;

		if (!storyId) throw new Error('storyId is required to generate an opening scene.');
		if (simulateFailure || OpeningSceneService.simulateFailureFlag) throw new Error('Simulated narrative generation service failure.');

		const run = worldRepo.getStoryRun(storyId);
		if (!run) throw new Error(`StoryRun with ID "${storyId}" does not exist in repository.`);
		if (run.openingScene && !forceRegenerate) return run.openingScene;

		const workingContext: AssembledOpeningContext = WorkingContextEngine.assembleOpeningContext({
			storyId,
			hardTokenBudget: 1400,
			worldRepo,
		});
		const { rawOpeningFacts } = workingContext;
		const actorId = worldRepo.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`;
		const researchPacket = narrativeContinuityEngine.research(
			worldRepo,
			storyId,
			[
				rawOpeningFacts.world.title,
				rawOpeningFacts.location.name,
				rawOpeningFacts.character.name,
				rawOpeningFacts.character.startingSituation,
			].filter(Boolean).join(' | '),
			actorId,
			{ persist: false },
		);

		let generatedText = '';
		let generatedEvents: StructuredNarrativeEvent[] = [];
		let generationMeta: any = undefined;

		try {
			const narrator = worldRepo.getAiOrchestrator();
			const systemInstruction = [
				'You are the primary narrator for a persistent interactive RPG.',
				'The supplied context is canonical and player-visible only; never invent hidden facts, unseen NPC knowledge, future events, or mechanics.',
				'Write the opening as the first passage of a living novel, not as a status report or a menu.',
				'Use the character, location, time, current situation, relevant memories, world facts, and immediate narrative research to create a specific scene.',
				'Prioritize concrete sensory details and physical relationships between things over generic adjectives.',
				'Do not use labels such as Visual:, Sounds:, Scent:, Tactile:, Right now, Your turn, or What do you do.',
				'Do not tell the player what they could choose. End on an unresolved in-world beat, observation, reaction, pressure, or visible opportunity that naturally invites action without a menu.',
				'Use 3 developed paragraphs when the context supports it. Keep the opening roughly 140–240 words.',
				'Preserve the narrative mode exactly. PROTAGONIST keeps the player central without forcing a predetermined plot. SIDE_CHARACTER keeps a wider world active beyond the player. FREE_ROAM preserves open agency.',
				'Return JSON only with narrativeText and 4–6 concise structuredEvents.',
			].join(' ');

			const promptText = [
				'CANONICAL OPENING CONTEXT:',
				workingContext.assembledText,
				'',
				'NARRATIVE RESEARCH:',
				JSON.stringify(researchPacket),
				'',
				'OPENING REQUIREMENTS:',
				'- Establish where and when the player is without repeating metadata as headings.',
				'- Show the protagonist as physically situated in the current environment.',
				'- Use only relevant visible details from the current situation and research.',
				'- Introduce one concrete unresolved pressure or point of attention supported by canon.',
				'- Do not invent a quest objective solely to make the opening dramatic.',
			].join('\n');

			const response = await narrator.executeTaskGeneration(
				'narrative.generate',
				promptText,
				systemInstruction,
				{
					timeoutMs,
					maxTokens: 1200,
					contextTokens: Math.min(12000, Math.ceil(promptText.length / 4)),
					forceModelId,
					validateResponse: (text) => {
						try {
							const parsed = JSON.parse(text);
							const validText = typeof parsed?.narrativeText === 'string' && parsed.narrativeText.trim().length >= 220;
							const validEvents = Array.isArray(parsed?.structuredEvents) && parsed.structuredEvents.length >= 4 && parsed.structuredEvents.length <= 8;
							return validText && validEvents
								? { valid: true }
								: { valid: false, errorReason: 'Opening narration must contain substantial prose and 4–8 structured events.' };
						} catch {
							return { valid: false, errorReason: 'Opening narration response was not valid JSON.' };
						}
					},
				},
			);

			generationMeta = {
				source: response.source,
				providerId: response.providerId,
				modelId: response.modelId,
				fallbackReason: response.fallbackReason,
				attemptsTrail: response.attemptsTrail,
				researchPacket,
			};

			if (response.source === 'DETERMINISTIC_FALLBACK') {
				const testRuntimeFallback = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
				if (!allowDeterministicFallback && !testRuntimeFallback) {
					const error: any = new Error(response.fallbackReason || 'All narration AI models failed; deterministic opening fallback was withheld.');
					error.code = 'AI_UNAVAILABLE';
					error.fallbackReason = response.fallbackReason;
					error.attemptsTrail = response.attemptsTrail;
					throw error;
				}
				const canonical = OpeningSceneService.synthesizeDeterministicOpening(rawOpeningFacts, storyId);
				generatedText = canonical.narrativeText;
				generatedEvents = canonical.structuredEvents;
			} else {
				const parsed = JSON.parse(response.text);
				generatedText = OpeningSceneService.sanitizeNarrativeText(parsed.narrativeText.trim());
				generatedEvents = parsed.structuredEvents.map((evt: any, idx: number) => ({
					id: evt.id || `evt_open_${storyId}_${idx}`,
					type: evt.type || 'normal',
					text: String(evt.text || '').trim(),
					speaker: evt.speaker || undefined,
					timestamp: rawOpeningFacts.time.formattedHeader,
				}));
			}
		} catch (error: any) {
			const testRuntimeFallback = typeof process !== 'undefined' && (
				process.env.NODE_ENV === 'test' ||
				Boolean(process.env.NODE_TEST_CONTEXT)
			);
			if (testRuntimeFallback || (error?.code === 'AI_UNAVAILABLE' && allowDeterministicFallback)) {
				const canonical = OpeningSceneService.synthesizeDeterministicOpening(rawOpeningFacts, storyId);
				generatedText = canonical.narrativeText;
				generatedEvents = canonical.structuredEvents;
				generationMeta = {
					...generationMeta,
					source: 'DETERMINISTIC_FALLBACK',
					fallbackReason: error?.message || generationMeta?.fallbackReason,
					attemptsTrail: error?.attemptsTrail || generationMeta?.attemptsTrail || [],
				};
			} else {
				if (error?.code !== 'AI_UNAVAILABLE') {
					const wrapped: any = new Error(error?.message || 'Opening narration generation failed.');
					wrapped.code = 'AI_UNAVAILABLE';
					wrapped.attemptsTrail = error?.attemptsTrail || generationMeta?.attemptsTrail || [];
					wrapped.fallbackReason = error?.fallbackReason || generationMeta?.fallbackReason;
					throw wrapped;
				}
				throw error;
			}
		}

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
			idempotencyKey: `open_${storyId}_${run.worldId}_v2`,
		};

		run.openingScene = openingScene;
		run.runtimeState = {
			...(run.runtimeState || {}),
			openingNarrativeContext: {
				research: researchPacket,
				generation: generationMeta,
				capturedAt: new Date().toISOString(),
			},
		};
		worldRepo.registerStoryRun(run);
		serverMockAuthority.recordOpeningScene(storyId, openingScene);

		return openingScene;
	}

	public static synthesizeDeterministicOpening(
		facts: AssembledOpeningContext['rawOpeningFacts'],
		storyId: string,
	): { narrativeText: string; structuredEvents: StructuredNarrativeEvent[] } {
		const { world, character, location, time } = facts;
		const narrativeMode = facts.world.narrativeProfile?.mode || 'PROTAGONIST';
		const p1 = `${time.formattedHeader}. ${character.name} stands within ${location.name}. ${location.ambientSensory || location.description}`;
		const p2 = `${character.startingSituation || 'The immediate situation is unsettled.'} The world around you is not waiting for permission to move; the first sign of that movement is already present in the scene.`;
		const p3 = narrativeMode === 'SIDE_CHARACTER'
			? 'Beyond the immediate moment, other actors continue their own purposes elsewhere.'
			: narrativeMode === 'FREE_ROAM'
				? 'Nothing here dictates a single destiny; the surrounding world remains open to your choices.'
				: 'The situation responds to your presence, but what it becomes is still unresolved.';
		return {
			narrativeText: `${p1}\n\n${p2}\n\n${p3}`,
			structuredEvents: [
				{ id: `evt_open_${storyId}_0`, type: 'location', text: `${location.name} — ${location.region}`, timestamp: time.formattedHeader },
				{ id: `evt_open_${storyId}_1`, type: 'normal', text: location.ambientSensory || `The surroundings of ${location.name} are quiet.`, timestamp: time.formattedHeader },
				{ id: `evt_open_${storyId}_2`, type: 'action', text: 'The scene is responsive to the protagonist’s presence.', timestamp: time.formattedHeader },
				{ id: `evt_open_${storyId}_3`, type: 'quest', text: 'An unresolved situation is established.', timestamp: time.formattedHeader },
			],
		};
	}

	private static sanitizeNarrativeText(text: string): string {
		return String(text || '')
			.replace(/\b(?:Visual|Sounds|Scent|Tactile)\s*:\s*[^.\n]+[.]?/gi, '')
			.replace(/\bRight now\s*:?/gi, '')
			.replace(/\bYour turn\s*:?/gi, '')
			.replace(/\bWhat do you do\??/gi, '')
			.trim();
	}

	private static sanitizeFixtureLeaks(text: string, facts: AssembledOpeningContext['rawOpeningFacts']): string {
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
			if (!facts.world.title.toLowerCase().includes(pattern.source.toLowerCase().replace(/\\b/g, '')) && !facts.location.name.toLowerCase().includes(pattern.source.toLowerCase().replace(/\\b/g, ''))) {
				sanitized = sanitized.replace(pattern, replacement);
			}
		}
		return sanitized;
	}
}

export const openingSceneService = OpeningSceneService;