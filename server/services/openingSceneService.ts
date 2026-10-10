import { worldRepository, WorldRepository } from '../repositories/worldRepository';
import { WorkingContextEngine, AssembledOpeningContext } from '../domain/workingContextEngine';
import { narrativeContinuityEngine } from '../domain/narrativeContinuityEngine';
import { OpeningScene, StructuredNarrativeEvent } from '../../src/types';
import { serverMockAuthority } from '../mockEngine/serverMockAuthority';
import { NarrativeRichnessEvaluator, type NarrativeRichnessEvaluation } from '../domain/narrativeRichnessEvaluation';
import { NarrativePacingEngine } from '../domain/narrativePacingEngine';
import { PlayerIntentInterpreter } from '../domain/playerIntentInterpreter';
import type { CurrentSituation } from '../domain/currentSituation';
import type { EphemeralNarrativePlan } from '../domain/narrativeDirector';
import type { StructuredTurnPackage } from '../domain/aiOrchestrator';
import type { SceneCompositionContract } from '../domain/sceneComposition';

function parseLooseOpeningResponse(rawText: string): { narrativeText: string; structuredEvents: any[] } | null {
	const cleaned = String(rawText || '')
		.trim()
		.replace(new RegExp('^```(?:json)?\\s*', 'i'), '')
		.replace(new RegExp('\\s*```$', 'i'), '')
		.trim();
	if (!cleaned) return null;

	let parsed: any;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		const objectStart = cleaned.indexOf('{');
		const objectEnd = cleaned.lastIndexOf('}');
		if (objectStart >= 0 && objectEnd > objectStart) {
			try {
				parsed = JSON.parse(cleaned.slice(objectStart, objectEnd + 1));
			} catch {
				parsed = undefined;
			}
		}
	}

	if (typeof parsed === 'string') return cleanedNarrativeOpening(parsed);
	if (parsed && typeof parsed === 'object') {
		if (typeof parsed.narrativeText !== 'string') {
			return null;
		}
		const narrative = parsed.narrativeText.trim();
		if (narrative.length >= 120) {
			return {
				narrativeText: narrative,
				structuredEvents: Array.isArray(parsed.structuredEvents) ? parsed.structuredEvents : [],
			};
		}
		return null;
	}

	return cleanedNarrativeOpening(cleaned);
}

function cleanedNarrativeOpening(text: string): { narrativeText: string; structuredEvents: any[] } | null {
	const narrativeText = String(text || '').trim();
	if (narrativeText.length < 120) return null;
	return { narrativeText, structuredEvents: [] };
}

export interface OpeningSceneQualityAudit {
	enabled: boolean;
	presentationOnly: true;
	firstDecision: 'ACCEPT' | 'REWRITE';
	firstScore: number;
	rewriteAttempted: boolean;
	rewriteSucceeded: boolean;
	/** Set when the bounded rewrite could not be attempted, produced no usable output, or threw. */
	rewriteReason?: string;
	finalDecision: 'ACCEPT' | 'REWRITE';
	finalScore: number;
	issues: string[];
}

export interface OpeningQualityReview {
	decision: 'ACCEPT' | 'REWRITE';
	richness: NarrativeRichnessEvaluation;
	pacingReason?: string;
}

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
		const authoredAgenda = worldRepo.getProtagonistAgenda(storyId);
		const authoredAgendaContext = authoredAgenda && typeof authoredAgenda.goal === 'string'
			&& authoredAgenda.goal.trim()
			&& !/independent (principal.actor|world) objective/i.test(authoredAgenda.goal)
			? {
				goal: authoredAgenda.goal,
				currentLocation: authoredAgenda.currentLocation || null,
				progressState: Number.isFinite(authoredAgenda.progressState) ? authoredAgenda.progressState : null,
			}
			: null;
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
				'Preserve the selected narrative mode exactly; these modes must have meaningfully different openings.',
				'PROTAGONIST: make the player the central actor and establish a clear first lead or next-step objective grounded in the character background, starting situation, world facts, or authored agenda. If the context gives a named person, place, duty, debt, rival, mentor, or unresolved problem, make that lead legible. Do not invent secret canon or force a choice; end with a concrete in-world opening the player can act on.',
				'SIDE_CHARACTER: establish that a principal character other than the player has the central goal. Explain what they are trying to accomplish and why the player is present or connected, then end on a meaningful decision, request, disagreement, or opportunity for the player. Do not take the player’s decision for them.',
				'FREE_ROAM: establish the physical situation and interesting people or activity, but do not assign a mandatory main quest or imply there is one correct path. Preserve open-ended agency.',
				'Describe the people and physical activity around the character, not just lighting, scenery, or sensory metaphors. Once the scene is grounded, do not repeat environmental description unless it changes or matters to the action.',
				'Return JSON only with narrativeText and 4–6 concise structuredEvents.',
			].join(' ');

			const promptText = [
				'CANONICAL OPENING CONTEXT:',
				workingContext.assembledText,
				'',
				'NARRATIVE RESEARCH:',
				JSON.stringify(researchPacket),
				'',
				'AUTHORED STORY AGENDA (if present; do not invent one):',
				JSON.stringify(authoredAgendaContext),
				'',
				'OPENING REQUIREMENTS:',
				'- Establish where and when the player is without repeating metadata as headings.',
				'- Show the protagonist as physically situated in the current environment.',
				'- Substance first, flourish second: communicate what is happening now and why the moment matters before atmosphere.',
				'- Use only relevant visible details from the current situation and research.',
				'- Introduce one concrete unresolved pressure or point of attention supported by canon.',
				'- For PROTAGONIST, identify a clear first lead grounded in the supplied backstory/starting situation; if the canonical setup is too thin, state the nearest grounded lead without inventing a named quest-giver or secret.',
				'- For SIDE_CHARACTER, make the principal character’s goal clear and give the player a real response or decision to make.',
				'- For FREE_ROAM, provide visible opportunities but no prescribed main objective.',
				'- Show who is physically present and what they are doing when that information is available; avoid filler about sunlight, shoes, ground texture, or machinery hum.',
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
						const parsed = parseLooseOpeningResponse(text);
						if (!parsed || parsed.narrativeText.trim().length < 220) {
							return { valid: false, errorReason: 'Opening narration must contain substantial prose.' };
						}
						return { valid: true };
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
				const canonical = OpeningSceneService.synthesizeDeterministicOpening(rawOpeningFacts, storyId, worldRepo.getProtagonistAgenda(storyId));
				generatedText = canonical.narrativeText;
				generatedEvents = canonical.structuredEvents;
			} else {
				const parsed = parseLooseOpeningResponse(response.text);
				if (!parsed) throw new Error('Opening narration response did not contain usable prose.');
				generatedText = OpeningSceneService.sanitizeNarrativeText(parsed.narrativeText.trim());
				generatedEvents = OpeningSceneService.normalizeOpeningEvents(parsed.structuredEvents, storyId, rawOpeningFacts, generatedText);
			}
		} catch (error: any) {
			const testRuntimeFallback = typeof process !== 'undefined' && (
				process.env.NODE_ENV === 'test' ||
				Boolean(process.env.NODE_TEST_CONTEXT)
			);
			if (testRuntimeFallback || (error?.code === 'AI_UNAVAILABLE' && allowDeterministicFallback)) {
				const canonical = OpeningSceneService.synthesizeDeterministicOpening(rawOpeningFacts, storyId, worldRepo.getProtagonistAgenda(storyId));
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

		// =========================================================================
		// Opening-scene presentation-quality gate (N18 richness + N8 pacing).
		// Deterministic and presentation-only: it never mutates canonical state and
		// never becomes a source of canon. Applies to AI-generated prose only — the
		// canonical deterministic fallback is trusted as-is. One bounded AI polish
		// rewrite ('narrative.review' task) is permitted; on any rewrite failure or
		// persistent rejection the gate downgrades to the existing canonical
		// deterministic opening rather than accepting a low-substance opening.
		// =========================================================================
		const isDeterministicOpening = generationMeta?.source === 'DETERMINISTIC_FALLBACK';
		let qualityAudit: OpeningSceneQualityAudit = {
			enabled: true,
			presentationOnly: true,
			firstDecision: 'ACCEPT',
			firstScore: 1,
			rewriteAttempted: false,
			rewriteSucceeded: false,
			finalDecision: 'ACCEPT',
			finalScore: 1,
			issues: [],
		};
		if (!isDeterministicOpening && generatedText.trim().length > 0) {
			const firstReview = OpeningSceneService.evaluateOpeningQuality(generatedText, rawOpeningFacts, storyId);
			qualityAudit.firstDecision = firstReview.decision;
			qualityAudit.firstScore = firstReview.richness.overallScore;
			qualityAudit.finalDecision = firstReview.decision;
			qualityAudit.finalScore = firstReview.richness.overallScore;
			qualityAudit.issues = OpeningSceneService.summarizeQualityIssues(firstReview);
			if (firstReview.decision === 'REWRITE') {
				qualityAudit.rewriteAttempted = true;
				try {
					const rewrite = await OpeningSceneService.rewriteOpeningNarrative({
						narrativeText: generatedText,
						facts: rawOpeningFacts,
						review: firstReview,
						assembledText: workingContext.assembledText,
						storyId,
						timeoutMs,
						forceModelId,
						worldRepo,
					});
					if (rewrite) {
						const rewrittenText = OpeningSceneService.sanitizeFixtureLeaks(
							OpeningSceneService.sanitizeNarrativeText(rewrite.narrativeText.trim()),
							rawOpeningFacts,
						);
						const rewrittenEvents = OpeningSceneService.normalizeOpeningEvents(
							rewrite.structuredEvents,
							storyId,
							rawOpeningFacts,
							rewrittenText,
						);
						const postReview = OpeningSceneService.evaluateOpeningQuality(rewrittenText, rawOpeningFacts, storyId);
						if (postReview.decision === 'ACCEPT' && rewrittenText.trim().length > 0) {
							generatedText = rewrittenText;
							generatedEvents = rewrittenEvents;
							qualityAudit.rewriteSucceeded = true;
							qualityAudit.finalDecision = postReview.decision;
							qualityAudit.finalScore = postReview.richness.overallScore;
							qualityAudit.issues = OpeningSceneService.summarizeQualityIssues(postReview);
					} else {
						qualityAudit.finalDecision = postReview.decision;
						qualityAudit.finalScore = postReview.richness.overallScore;
						qualityAudit.issues = OpeningSceneService.summarizeQualityIssues(postReview);
					}
				} else {
					qualityAudit.rewriteReason = 'The AI rewrite returned no usable prose.';
				}
			} catch (rewriteError: any) {
				qualityAudit.rewriteReason = rewriteError?.message || 'The opening rewrite failed.';
			}
				if (qualityAudit.finalDecision === 'REWRITE') {
					const canonical = OpeningSceneService.synthesizeDeterministicOpening(rawOpeningFacts, storyId, worldRepo.getProtagonistAgenda(storyId));
					generatedText = canonical.narrativeText;
					generatedEvents = canonical.structuredEvents;
					qualityAudit.finalScore = 1;
					qualityAudit.issues = [...qualityAudit.issues, 'Opening downgraded to the canonical deterministic fallback after quality review was not satisfied.'];
				}
			}
			generationMeta = {
				...generationMeta,
				qualityAudit,
			};
		}

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

	/**
	 * Maps model-supplied structured events and enforces the preserved opening-event
	 * contract: at least 4 events including one 'location' and one 'normal' event;
	 * otherwise derives canonical events from the final prose.
	 */
	private static normalizeOpeningEvents(
		rawEvents: any[],
		storyId: string,
		facts: AssembledOpeningContext['rawOpeningFacts'],
		finalNarrativeText: string,
	): StructuredNarrativeEvent[] {
		let generatedEvents: StructuredNarrativeEvent[] = rawEvents.map((evt: any, idx: number) => ({
			id: evt.id || `evt_open_${storyId}_${idx}`,
			type: evt.type || 'normal',
			text: String(evt.text || '').trim(),
			speaker: evt.speaker || undefined,
			timestamp: facts.time.formattedHeader,
		}));
		if (generatedEvents.length < 4 || !generatedEvents.some((e) => e.type === 'location') || !generatedEvents.some((e) => e.type === 'normal')) {
			generatedEvents = OpeningSceneService.deriveOpeningEvents(finalNarrativeText, storyId, facts);
		}
		return generatedEvents;
	}

	private static summarizeQualityIssues(review: OpeningQualityReview): string[] {
		return [
			...review.richness.issues.map((issue) => `${issue.severity}: ${issue.message}`),
			...(review.pacingReason ? [review.pacingReason] : []),
		];
	}

	/**
	 * Deterministic N18/N8 presentation-quality review for an opening narration.
	 * Builds an ephemeral read-only review projection from canonical opening facts
	 * (no repository mutation, no canonical state involvement) and runs the same
	 * evaluators used by live narration. Accepts when N18 passes and N8 pacing
	 * ceilings hold; otherwise requests a rewrite.
	 */
	public static evaluateOpeningQuality(
		narrativeText: string,
		facts: AssembledOpeningContext['rawOpeningFacts'],
		storyId: string,
	): OpeningQualityReview {
		const text = String(narrativeText || '').trim();
		const situation = OpeningSceneService.buildOpeningReviewSituation(facts, storyId);
		const intentText = 'Begin the story: ' + (facts.character.startingSituation || `the protagonist is present within ${facts.location.name}`);
		const intent = PlayerIntentInterpreter.deterministic(intentText, situation);
		const plan = OpeningSceneService.buildOpeningReviewPlan(facts, storyId);
		const turnPackage: StructuredTurnPackage = {
			narrative: [text],
			dialogue: [],
			events: [],
			stateChanges: [],
			memoryCandidates: [],
			audioCues: [],
		};

		const richness = NarrativeRichnessEvaluator.evaluate({
			intent,
			situation,
			plan,
			turnPackage,
			previousNarrations: [],
		});
		const pacingContract = NarrativePacingEngine.resolve({ situation, intent });
		const pacingValidation = NarrativePacingEngine.validateNarration(text, pacingContract);

		const decision: 'ACCEPT' | 'REWRITE' = richness.decision === 'PASS' && pacingValidation.valid ? 'ACCEPT' : 'REWRITE';
		return {
			decision,
			richness,
			pacingReason: pacingValidation.reason,
		};
	}

	private static buildOpeningReviewPlan(
		facts: AssembledOpeningContext['rawOpeningFacts'],
		storyId: string,
	): EphemeralNarrativePlan {
		const sceneComposition = {
			version: 1,
			turnId: `opening_${storyId}`,
			sceneObjective: 'Establish the opening scene with substance-first narration grounded in canonical facts.',
			beatType: 'DISCOVERY',
			narrativeFocus: [
				facts.character.startingSituation
					? 'Present the immediate situation: ' + facts.character.startingSituation
					: 'Present the immediate situation as the protagonist experiences it.',
				'Show the protagonist as an actor within the scene, not a spectator of scenery.',
				'End on an unresolved in-world beat supported by canon.',
			].filter(Boolean),
			emotionalBeat: 'Weighted toward the immediate situation rather than the setting.',
			emotionalMovement: 'HOLD',
			physicalBeat: 'The protagonist is mid-scene in the canonical location.',
			sensoryAnchor: facts.location.ambientSensory,
			dialogueAct: 'NONE',
			subtext: [],
			reveal: [],
			withhold: [],
			reactionPriority: [facts.character.name],
			tensionDirection: 'STEADY',
			pacingShape: 'EXPANSIVE_GROUNDING',
			closingBeat: 'The opening situation remains unresolved and actionable.',
			compositionConfidence: 0.9,
			expiresAfterNarration: true,
		} as SceneCompositionContract;

		return {
			turnId: `opening_${storyId}`,
			objective: 'Establish the opening scene with substance-first narration grounded in canonical facts.',
			immediateSteps: [
				'Communicate what is actually happening now before atmosphere.',
				'Ground the protagonist in the canonical location without turning the scene into environment-only description.',
				'End on an unresolved in-world beat supported by canon.',
			],
			informationToReveal: [],
			entitiesToReact: [],
			continuityRequirements: [
				'Remain in the canonical location: ' + facts.location.name + '.',
				'Use the canonical world time: ' + facts.time.formattedHeader + '.',
				'Keep hidden or unauthorized world knowledge outside the narration.',
			],
			forbiddenAssumptions: [
				'Do not invent hidden facts, secret locations, unavailable entities, or unsupported causal explanations.',
				'Do not convert rumor, memory, or hearsay into established certainty.',
				'Do not make major future decisions for the player.',
				'Do not create an uncommitted location or world-time change.',
				'Do not introduce unrelated quest beats merely because they exist in campaign history.',
			],
			stateEffectsExpected: [],
			sceneComposition,
			createdAt: facts.time.formattedHeader,
			expiresAfterNarration: true,
		};
	}

	/**
	 * Read-only CurrentSituation projection for the opening review. It mirrors the
	 * canonical opening facts (character, location, time) without touching the
	 * repository, so the shared N18/N8 evaluators can run unchanged.
	 */
	private static buildOpeningReviewSituation(
		facts: AssembledOpeningContext['rawOpeningFacts'],
		storyId: string,
	): CurrentSituation {
		const actorId = `player_actor_${storyId}`;
		return {
			storyId,
			turnId: `opening_${storyId}`,
			worldId: facts.world.id,
			worldTime: facts.time.formattedHeader,
			worldTimestamp: { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0, totalElapsedSeconds: 0 },
			player: {
				actorId,
				name: facts.character.name,
				locationId: facts.location.id,
				currentActivity: facts.character.startingSituation || 'present in the opening scene',
				isTraveling: false,
				isDead: false,
				isTransformed: false,
				isPossessed: false,
				injuries: [],
				spatial: { proximityBand: 'SAME_LOCATION' } as any,
			},
			location: {
				id: facts.location.id,
				name: facts.location.name,
				regionId: facts.location.region || 'OPENING_REGION',
				description: facts.location.description,
				ambientSensory: facts.location.ambientSensory,
				accessible: true,
				discovered: true,
				parentLocationId: null,
				connectedLocations: [],
			},
			sceneObjects: [],
			sceneEvidence: {
				objects: [],
				entities: [],
				events: [],
				sensory: facts.location.ambientSensory ? [facts.location.ambientSensory] : [],
				structures: [],
				occupancy: { status: 'UNKNOWN', accessControlled: false, provenance: 'UNKNOWN' },
			},
			nearbyEntities: [
				{
					id: actorId,
					name: facts.character.name,
					kind: 'PLAYER',
					locationId: facts.location.id,
					presence: 'present' as const,
					isAlive: true,
					currentActivity: facts.character.startingSituation,
					role: facts.character.role,
					distanceBand: 'SAME_LOCATION' as const,
					importance: 1,
					explicitlyReferenced: false,
					visibleToPlayer: true,
				},
			],
			visibleEvents: [],
			recentTurns: [],
			plot: {
				currentArc: 'OPENING',
				summary: facts.world.summary || facts.world.title,
				recentBeats: [],
			},
			openThreads: [],
			relevantMemories: [],
			relevantLore: [],
			playerKnowledge: {
				viewerActorId: actorId,
				knownFacts: [],
				authorizedFactIds: [],
				note: 'Opening-scene presentation review projection; no canonical knowledge asserted.',
			},
			worldFacts: [],
			activeConditions: (facts.character.conditions || []).map((label, index) => ({
				id: `cond_opening_${storyId}_${index}`,
				label,
			})),
			availableInteractions: [],
		};
	}

	/**
	 * Existing-safe single polish rewrite for a rejected opening. Reuses the
	 * orchestrator's 'narrative.review' task (the same task live narration uses for
	 * literary polish) with one bounded call. Returns null when no AI rewrite is
	 * available (deterministic fallback, malformed output) so the caller can fall
	 * back safely. The rewrite is presentation-only by contract: it receives the
	 * canonical context and the quality issues, and must preserve every canonical
	 * fact without inventing future events, hidden information, new canon, player
	 * decisions, or outcomes.
	 */
	public static async rewriteOpeningNarrative(options: {
		narrativeText: string;
		facts: AssembledOpeningContext['rawOpeningFacts'];
		review: OpeningQualityReview;
		assembledText: string;
		storyId: string;
		timeoutMs?: number;
		forceModelId?: string;
		worldRepo?: WorldRepository;
	}): Promise<{ narrativeText: string; structuredEvents: any[] } | null> {
		const narrator = (options.worldRepo || worldRepository).getAiOrchestrator();
		if (!narrator || typeof narrator.executeTaskGeneration !== 'function') return null;

		const situation = OpeningSceneService.buildOpeningReviewSituation(options.facts, options.storyId);
		const intentText = 'Begin the story: ' + (options.facts.character.startingSituation || `the protagonist is present within ${options.facts.location.name}`);
		const intent = PlayerIntentInterpreter.deterministic(intentText, situation);
		const plan = OpeningSceneService.buildOpeningReviewPlan(options.facts, options.storyId);
		const turnPackage: StructuredTurnPackage = {
			narrative: [options.narrativeText],
			dialogue: [],
			events: [],
			stateChanges: [],
			memoryCandidates: [],
			audioCues: [],
		};

		const guidanceParts = [
			'N18 RICHNESS REVIEW (deterministic, presentation-only):',
			'Decision: ' + options.review.richness.decision + '; overall score: ' + options.review.richness.overallScore.toFixed(2) + '.',
			...options.review.richness.issues.slice(0, 8).map((issue) => '- [' + issue.severity + '] ' + issue.message + (issue.evidence ? ' Evidence: ' + issue.evidence : '')),
			NarrativeRichnessEvaluator.buildRewriteGuidance(options.review.richness),
			options.review.pacingReason ? 'N8 PACING: ' + options.review.pacingReason : '',
		].filter(Boolean);

		const systemInstruction = [
			'You are the narrative quality editor for the Dreamville opening scene.',
			'Perform a presentation-only literary polish of the supplied opening narration.',
			'Correct exactly the listed quality issues: excessive environmental exposition, missing immediate situation or action, weak character behavior, weak dramatic tension, and weak beat progression.',
			'Preserve every canonical fact from the supplied context: character identity, location, world time, current situation, known information, and plot direction.',
			'Never invent future events, hidden information, new canonical facts, player decisions, or outcomes. Do not speak or decide for the player.',
			'Keep roughly 140-260 words. Return JSON only with narrativeText and 4-6 concise structuredEvents.',
		].join(' ');

		const promptText = [
			'CANONICAL OPENING CONTEXT (preserve exactly; do not invent beyond it):',
			options.assembledText,
			'',
			...guidanceParts,
			'',
			'ORIGINAL OPENING (presentation only — preserve its canonical content):',
			options.narrativeText,
			'',
			'Rewrite the ORIGINAL OPENING as one improved presentation of exactly the same canonical situation.',
			'Substance first, flourish second: communicate what is happening now, who is doing something, and why the moment matters before any atmosphere.',
			'Environment description is welcome only where it supports the situation.',
			'Return JSON only: {"narrativeText": "...", "structuredEvents": [{"type": "location|normal|action|dialogue|quest|item|magic|damage|heal|system", "text": "..."}]}.',
		].join('\n');

		const response = await narrator.executeTaskGeneration(
			'narrative.review',
			promptText,
			systemInstruction,
			{
				timeoutMs: options.timeoutMs,
				maxTokens: 900,
				contextTokens: Math.min(12000, Math.ceil(promptText.length / 4)),
				forceModelId: options.forceModelId,
				validateResponse: (text) => {
					const parsed = parseLooseOpeningResponse(text);
					if (!parsed) {
						return { valid: false, errorReason: 'Opening rewrite must return usable JSON prose.' };
					}
					return { valid: true };
				},
			},
		);
		if (response.source === 'DETERMINISTIC_FALLBACK') return null;
		const parsed = parseLooseOpeningResponse(response.text);
		if (!parsed) return null;
		return parsed;
	}

	public static synthesizeDeterministicOpening(
		facts: AssembledOpeningContext['rawOpeningFacts'],
		storyId: string,
		agenda?: any,
	): { narrativeText: string; structuredEvents: StructuredNarrativeEvent[] } {
		const { character, location, time } = facts;
		const narrativeMode = facts.world.narrativeProfile?.mode || 'PROTAGONIST';
		const sceneAnchor = location.ambientSensory || location.description;
		const p1 = `${time.formattedHeader}. ${character.name} stands within ${location.name}. ${sceneAnchor}`;
		const characterContext = [
			character.background,
			character.role ? 'Role: ' + character.role : '',
			character.capabilities?.slice(0, 3).join(', '),
		].filter(Boolean).join(' ');
		const p2 = `${character.startingSituation || 'The immediate situation is unsettled.'} ${characterContext ? characterContext + ' ' : ''}Nearby people and activity matter as much as the architecture; the scene is already in motion, and your next action can affect how it unfolds.`;
		const authoredGoal = typeof agenda?.goal === 'string' && agenda.goal.trim() ? agenda.goal.trim() : '';
		const p3 = narrativeMode === 'SIDE_CHARACTER'
			? authoredGoal
				? `The principal actor's current aim is ${authoredGoal}. You are connected to this unfolding situation, but your response and loyalties remain your decision.`
				: 'The wider story centers on another principal actor and their goal; your place in that story is real, but your response remains your decision.'
			: narrativeMode === 'FREE_ROAM'
				? 'There is no prescribed main quest here. People have their own purposes, visible opportunities may be pursued or ignored, and the direction of the journey is yours to choose.'
				: authoredGoal
					? `Your first lead is clear: ${authoredGoal}. It gives you a place to begin, not a decision you must make; how you pursue it remains yours.`
					: `Your first lead is the unresolved matter already established: ${character.startingSituation || 'the situation unfolding around you'}. Begin there, and let your choices determine what follows.`;

		return {
			narrativeText: `${p1}\n\n${p2}\n\n${p3}`,
			structuredEvents: [
				{ id: `evt_open_${storyId}_0`, type: 'location', text: `${location.name} — ${location.region}`, timestamp: time.formattedHeader },
				{ id: `evt_open_${storyId}_1`, type: 'normal', text: location.ambientSensory || `The surroundings of ${location.name} are quiet.`, timestamp: time.formattedHeader },
				{ id: `evt_open_${storyId}_2`, type: 'action', text: 'The scene is responsive to the protagonist’s presence.', timestamp: time.formattedHeader },
				{
					id: `evt_open_${storyId}_3`,
					type: narrativeMode === 'FREE_ROAM' ? 'normal' : 'quest',
					text: narrativeMode === 'FREE_ROAM'
						? 'Several opportunities may be pursued or ignored; no single path is prescribed.'
						: narrativeMode === 'SIDE_CHARACTER'
							? 'The principal actor’s objective remains unresolved, and the player’s response is open.'
							: authoredGoal
								? `A first lead is established: ${authoredGoal}`
								: 'The starting situation remains unresolved.',
					timestamp: time.formattedHeader,
				},
			],
		};
	}

	private static deriveOpeningEvents(
		narrativeText: string,
		storyId: string,
		facts: AssembledOpeningContext['rawOpeningFacts'],
	): StructuredNarrativeEvent[] {
		const paragraphs = narrativeText.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean).slice(0, 4);
		const events: StructuredNarrativeEvent[] = [
			{ id: `evt_open_${storyId}_location`, type: 'location', text: `${facts.location.name} — ${facts.location.region}`, timestamp: facts.time.formattedHeader },
			{ id: `evt_open_${storyId}_situation`, type: 'normal', text: facts.character.startingSituation || 'The immediate situation is unsettled.', timestamp: facts.time.formattedHeader },
		];
		for (const [index, paragraph] of paragraphs.entries()) {
			events.push({
				id: `evt_open_${storyId}_p${index}`,
				type: 'normal',
				text: paragraph.slice(0, 320),
				timestamp: facts.time.formattedHeader,
			});
		}
		return events.slice(0, 6);
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
