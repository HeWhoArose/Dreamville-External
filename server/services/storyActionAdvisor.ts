
import { deterministicId } from '../domain/deterministicRng';
import type {
	CapabilityDefinition,
	EffectiveCapability,
} from '../domain/capabilityEngine';
import type {
	CapabilitySimulationResult,
	CapabilitySimulationContext,
} from '../domain/capabilitySimulationEngine';
import { CapabilitySimulationEngine } from '../domain/capabilitySimulationEngine';
import type { WorldRepository } from '../repositories/worldRepository';
import { worldRepository } from '../repositories/worldRepository';
import { UnifiedAiActionOrchestrator, type UnifiedActionPipelineResult } from './unifiedAiActionOrchestrator';

export type ActionAdviceMode =
	| 'EXECUTE_EXISTING'
	| 'CAPABILITY_SIMULATION'
	| 'SUGGEST_ALTERNATIVE'
	| 'NORMAL_ACTION';

export interface ActionTip {
	id: string;
	title: string;
	description: string;
	intent: string;
	actionText: string;
	source: 'DETERMINISTIC' | 'AI';
}

export interface ActionCapabilityProposal {
	aiPipeline?: UnifiedActionPipelineResult;
	proposalId: string;
	requestedAction: string;
	requestedCapabilityId?: string;
	requestedCapabilityName?: string;
	reasonRequestedCapabilityUnavailable: string;
	alternative: CapabilityDefinition & {
		generatedSkills?: Array<{
			name: string;
			description: string;
			activationType?: string;
		}>;
	};
	simulation: CapabilitySimulationResult;
	acceptLabel: string;
	rejectLabel: string;
}

export interface ActionAdvice {
	mode: ActionAdviceMode;
	actionText: string;
	actorId: string;
	tips: ActionTip[];
	proposal?: ActionCapabilityProposal;
	recognizedCapability?: CapabilityDefinition;
	simulation?: CapabilitySimulationResult;
	canExecuteNow: boolean;
	aiPipeline?: UnifiedActionPipelineResult;
}

export interface StoryActionSceneContext {
	locationName?: string;
	locationRegion?: string;
	locationDescription?: string;
	worldTime?: string;
	openingNarrative?: string;
	startingSituation?: string;
	activeDialogue?: string;
	recentActions?: string[];
}
function normalize(value: unknown): string {
	return String(value || '').trim().toLowerCase();
}

function buildSimulationEnvironment(
	repository: WorldRepository,
	storyId: string,
	sceneContext?: StoryActionSceneContext,
): CapabilitySimulationContext['environment'] {
	const player = repository.getPlayerLifecycle(storyId);
	const locationId = player?.locationId || repository.getCurrentLocation(storyId) || undefined;
	const node = locationId ? repository.getGeographyGraph(storyId).getNode(locationId) : undefined;

	return {
		locationId,
		locationName: sceneContext?.locationName || node?.name,
		description: sceneContext?.locationDescription || node?.description,
		ambientSensory: sceneContext?.locationRegion
			? [node?.ambientSensory, `Region: ${sceneContext.locationRegion}`].filter(Boolean).join(' ')
			: node?.ambientSensory,
		conditions: [
			...(Array.isArray((player as any)?.activeEffects) ? (player as any).activeEffects : []),
			...(Array.isArray((player as any)?.conditions) ? (player as any).conditions : []),
			sceneContext?.activeDialogue || '',
		].filter(Boolean),
	};
}

function actorNarrativeText(run: any): string {
	const protagonist = run?.protagonist || {};
	const role = protagonist?.role || {};
	const personality = protagonist?.personality || {};
	const background = protagonist?.background || {};
	const motivations = protagonist?.motivations || {};

	return [
		role.profession,
		role.archetype,
		protagonist.title,
		protagonist.identity?.species,
		background.history,
		...(Array.isArray(personality.traits) ? personality.traits : []),
		...(Array.isArray(motivations.goals) ? motivations.goals : []),
	].filter(Boolean).join(' ');
}

function capabilityMatchesAction(capability: CapabilityDefinition, text: string): boolean {
	const normalized = normalize(text);
	const capabilityName = normalize(capability.name);
	if (!capabilityName) return false;
	const capId = String(capability?.id || '');
	return normalized.includes(capabilityName) || (capId ? normalized === capId.toLowerCase() : false);
}

function actorAlreadyHasCapability(capabilities: EffectiveCapability[], capabilityId: string): boolean {
	return capabilities.some((capability) => capability.id === capabilityId && capability.isLearned);
}

function inferDirectCompatibility(
	capability: CapabilityDefinition,
	run: any,
	progressionState?: any,
): boolean {
	const actorText = actorNarrativeText(run);
	const role = normalize(run?.protagonist?.role?.archetype || run?.protagonist?.role?.profession);
	const capabilityText = normalize(capability.name + ' ' + capability.description);
	const classId = normalize(
		progressionState?.classId ||
		run?.progression?.classId ||
		run?.protagonist?.progression?.classId
	);

	const darkAffinity =
		role.includes('dark mage') ||
		role.includes('shadow mage') ||
		role.includes('warlock') ||
		role.includes('necromancer') ||
		actorText.includes('curse') ||
		actorText.includes('shadow magic') ||
		actorText.includes('void magic');

	if (
		darkAffinity &&
		(capabilityText.includes('fire') || capabilityText.includes('flame'))
	) {
		return false;
	}

	if (
		(classId.includes('wizard') || classId.includes('sorcerer') || classId.includes('pyromancer')) &&
		(capabilityText.includes('fire') || capabilityText.includes('flame'))
	) {
		return true;
	}

	if (
		(classId.includes('cleric') || classId.includes('paladin')) &&
		(capabilityText.includes('light') || capabilityText.includes('radiant') || capabilityText.includes('holy'))
	) {
		return true;
	}

	if (Array.isArray(capability.restrictions) && capability.restrictions.length > 0) {
		return capability.restrictions.every((restriction) =>
			actorText.includes(normalize(restriction)) || role.includes(normalize(restriction))
		);
	}

	const provenance = normalize(capability.provenance);
	const schoolMatch = provenance.match(/(?:skill|school|tradition|class):([^:]+)/);
	if (schoolMatch?.[1]) {
		const school = schoolMatch[1].replace(/[_-]/g, ' ');
		if (actorText.includes(school) || role.includes(school) || classId.includes(school)) return true;
	}

	const elementalFireAffinity =
		classId.includes('wizard') ||
		classId.includes('sorcerer') ||
		classId.includes('pyromancer') ||
		role.includes('mage') ||
		role.includes('elementalist') ||
		role.includes('pyromancer') ||
		role.includes('wizard') ||
		role.includes('sorcerer') ||
		actorText.includes('fire magic') ||
		actorText.includes('flame magic') ||
		actorText.includes('elemental magic') ||
		actorText.includes('pyromancy');

	if (
		capabilityText.includes('fire') ||
		capabilityText.includes('flame')
	) {
		if (darkAffinity) return false;
		if (elementalFireAffinity) return true;
	}

	const domainKeywords: Record<string, string[]> = {
		shadow: ['dark mage', 'shadow mage', 'warlock', 'necromancer', 'shadow', 'void', 'curse'],
		ice: ['ice mage', 'frost mage', 'cryomancer', 'frost', 'ice', 'winter'],
		light: ['cleric', 'paladin', 'priest', 'light', 'radiant', 'holy'],
	};

	for (const [domain, compatibleRoles] of Object.entries(domainKeywords)) {
		if (capabilityText.includes(domain)) {
			if (compatibleRoles.some((keyword) => role.includes(keyword) || actorText.includes(keyword) || classId.includes(keyword))) {
				return true;
			}
		}
	}

	return false;
}

function deterministicAlternativeConcept(requestedName: string, run: any): string {
	const actorText = actorNarrativeText(run);
	const role = normalize(run?.protagonist?.role?.archetype || run?.protagonist?.role?.profession);
	const name = String(requestedName || 'Custom Capability');
	const requested = name.toLowerCase();

	if (requested.includes('fireball') || requested.includes('fire')) {
		if (role.includes('dark') || actorText.includes('curse') || actorText.includes('shadow') || actorText.includes('void')) {
			return 'Dark Fire';
		}
		return 'Personalized ' + name;
	}

	if (requested.includes('ice') || requested.includes('frost')) {
		if (role.includes('dark') || actorText.includes('shadow') || actorText.includes('curse')) {
			return 'Black Frost';
		}
		return 'Personalized ' + name;
	}

	if (requested.includes('lightning') || requested.includes('thunder')) {
		if (role.includes('dark') || actorText.includes('shadow') || actorText.includes('curse')) {
			return 'Void Lightning';
		}
		return 'Personalized ' + name;
	}

	return 'Personalized ' + name;
}

export class StoryActionAdvisor {
	private readonly pendingProposals = new Map<string, ActionCapabilityProposal>();
	private readonly capabilityProposalGenerator?: (
		concept: string,
		worldTemplate: any
	) => Promise<any>;

	constructor(
		private readonly repository: WorldRepository,
		capabilityProposalGenerator?: (
			concept: string,
			worldTemplate: any
		) => Promise<any>,
	) {
		this.capabilityProposalGenerator = capabilityProposalGenerator;
	}

	public getPendingProposal(proposalId: string): ActionCapabilityProposal | null {
		return this.pendingProposals.get(proposalId) || null;
	}

	public consumePendingProposal(proposalId: string): ActionCapabilityProposal | null {
		const proposal = this.pendingProposals.get(proposalId) || null;
		if (proposal) {
			this.pendingProposals.delete(proposalId);
		}
		return proposal;
	}

	public async advise(
		storyId: string,
		actionText: string,
		sceneContext?: StoryActionSceneContext,
	): Promise<ActionAdvice> {

		const cleanAction = String(actionText || '').trim();
		const ordinaryActionPattern = /^(?:i|we|the character|my character)\s+(?:walk|walks|move|moves|step|steps|approach|approaches|go|goes|head|heads|travel|travels|look|looks|observe|observes|inspect|inspects|search|searches|listen|listens|wait|waits|rest|rests|sit|sits|stand|stands|touch|touches|pick up|picks up|take|takes|open|opens|close|closes|enter|enters|leave|leaves|follow|follows|speak|speaks|talk|talks|ask|asks|say|says)\b/i;
		const explicitCapabilityIntent = new CapabilitySimulationEngine().isCapabilityLikeRequest(cleanAction);
		if (cleanAction && ordinaryActionPattern.test(cleanAction) && !explicitCapabilityIntent) {
			const player = this.repository.getPlayerLifecycle(storyId);
			const run = this.repository.getStoryRun(storyId);
			const actorId =
				player?.actorId ||
				run?.protagonist?.characterId ||
				'player_actor_' + storyId;
			const tips = await this.generateTips(storyId, actorId, cleanAction, [], canonicalSceneContext);
			return {
				mode: 'NORMAL_ACTION',
				actionText: cleanAction,
				actorId,
				tips,
				canExecuteNow: true,
			};
		}
		const player = this.repository.getPlayerLifecycle(storyId);
		const run = this.repository.getStoryRun(storyId);
		// Prefer the canonical lifecycle actor, then the confirmed protagonist identity.
		// This keeps progression/skill state aligned for story runs whose lifecycle is
		// not materialized yet (tests, previews, and import-time simulations).
		const actorId =
			player?.actorId ||
			run?.protagonist?.characterId ||
			'player_actor_' + storyId;

		const canonicalPlayerLocationId = player?.locationId || run?.currentLocationId;
		const canonicalLocation = canonicalPlayerLocationId
			? this.repository.getGeographyGraph(storyId).getNode(canonicalPlayerLocationId)
			: undefined;
		const dynamicState = this.repository.getDynamicStoryState(storyId);
		const canonicalSceneContext: StoryActionSceneContext = {
			locationName: sceneContext?.locationName || canonicalLocation?.name,
			locationRegion: sceneContext?.locationRegion || canonicalLocation?.regionId,
			locationDescription: sceneContext?.locationDescription || canonicalLocation?.description,
			worldTime: sceneContext?.worldTime,
			startingSituation:
				sceneContext?.startingSituation ||
				run?.startingSituation?.summary ||
				run?.startingSituation?.hook ||
				run?.initialScene,
			openingNarrative:
				sceneContext?.openingNarrative ||
				run?.openingScene?.narrativeText ||
				dynamicState?.actionHistory?.[0]?.narrativeResponse ||
				dynamicState?.actionHistory?.[0]?.description,
			activeDialogue:
				sceneContext?.activeDialogue ||
				(dynamicState?.activeDialogue
					? `${dynamicState.activeDialogue.speakerName}: ${dynamicState.activeDialogue.text}`
					: undefined),
			recentActions:
				sceneContext?.recentActions ||
				dynamicState?.actionHistory
					?.slice(0, 4)
					.map((entry: any) => entry.narrativeResponse || entry.description)
					.filter(Boolean),
		};
		const capabilityEngine = this.repository.getCapabilityEngine(storyId);
		const actorCapabilities = capabilityEngine.getEffectiveActorCapabilities(
			actorId,
			this.repository.getInventoryEngine(storyId)
		);
		const allCapabilities = capabilityEngine.getAllCapabilities();
		const normalizedAction = normalize(actionText);
		const learnedCapabilities = capabilityEngine.getActorLearnedCapabilities(actorId);
		const world = run?.worldId ? this.repository.getWorldTemplate(run.worldId) : undefined;
		const worldCapabilities = [
			...((world?.canonicalCapabilities || []) as CapabilityDefinition[]),
			...((world?.capabilities || []) as CapabilityDefinition[]),
		];
		const simulator = new CapabilitySimulationEngine();
		const capabilityLikeRequest = simulator.isCapabilityLikeRequest(actionText);
		// Closed AI action pipeline: only capability-like requests enter the multi-model
		// interpretation/research/synthesis/rules/tactics flow. Ordinary narrative actions
		// retain the lightweight path and cannot be turned into powers accidentally.
		const aiPipeline = capabilityLikeRequest
			? await new UnifiedAiActionOrchestrator(this.repository).resolveAction(storyId, actionText, {
				locationName: canonicalSceneContext.locationName,
				locationDescription: canonicalSceneContext.locationDescription,
				startingSituation: canonicalSceneContext.startingSituation,
				recentActions: canonicalSceneContext.recentActions,
			})
			: undefined;


		const tips = await this.generateTips(
			storyId,
			actorId,
			actionText,
			actorCapabilities,
			canonicalSceneContext,
		);

		// Player-owned capabilities always win first. The global registry is never
		// allowed to turn an ordinary narrative action into a supernatural request.
		const learnedMatch = learnedCapabilities
			.filter((capability) => capabilityMatchesAction(capability, normalizedAction))
			.sort((a, b) => normalize(b.name).length - normalize(a.name).length)[0];
		const effectiveMatch = actorCapabilities
			.filter((capability) => capabilityMatchesAction(capability, normalizedAction))
			.sort((a, b) => normalize(b.name).length - normalize(a.name).length)[0];

		// A learned capability remains owned even when current vessel/resource gates
		// make it temporarily ineffective. The canonical execution path is responsible
		// for rejecting that execution; ownership must never be mistaken for absence.
		if (learnedMatch) {
			return {
				mode: 'EXECUTE_EXISTING',
				actionText,
				actorId,
				recognizedCapability: effectiveMatch || learnedMatch,
				tips,
				canExecuteNow: Boolean(effectiveMatch),
				aiPipeline,
			};
		}

		if (effectiveMatch && actorAlreadyHasCapability(actorCapabilities, effectiveMatch.id)) {
			return {
				mode: 'EXECUTE_EXISTING',
				actionText,
				actorId,
				recognizedCapability: effectiveMatch,
				tips,
				canExecuteNow: true,
				aiPipeline,
			};
		}

		// An unlearned capability may come from the authored current world or from the
		// internal registry as a candidate, but only after the request is clearly a
		// capability request and before any proposal is synthesized.
		const worldMatch = worldCapabilities
			.filter((capability) => capabilityMatchesAction(capability, normalizedAction))
			.sort((a, b) => normalize(b.name).length - normalize(a.name).length)[0];
		const registryMatch = capabilityLikeRequest
			? allCapabilities
				.filter((capability) => capabilityMatchesAction(capability, normalizedAction))
				.sort((a, b) => normalize(b.name).length - normalize(a.name).length)[0]
			: undefined;
		let candidate = worldMatch || registryMatch || aiPipeline?.capability;

		if (!candidate) {
			const preview = capabilityEngine.interpretFreeformAction({
				actorId,
				actionText,
				executeIfValid: false,
			});

			if (capabilityLikeRequest && preview.interpretationType === 'NOVEL_CAPABILITY_PROPOSAL' && preview.proposedCapability) {
				candidate = preview.proposedCapability;
			} else if (!capabilityLikeRequest) {
				// Ordinary freeform actions stay on the normal narrative/action path.
				return {
					mode: 'NORMAL_ACTION',
					actionText,
					actorId,
					tips,
					canExecuteNow: true,
					aiPipeline,
				};
			}
		}

		const progressionState = this.repository.getCharacterProgressionEngine(storyId).getState(actorId);
		const progressionPolicy = capabilityEngine.getProgressionPolicy();
		const rulesProfile = this.repository.getRulesProfile(storyId);
		const customRules = world?.worldId
			? new (await import('../domain/customRuleEngine')).CustomRuleEngine().getRules(this.repository as any, storyId)
			: [];

		const simulationContext: CapabilitySimulationContext = {
			actorId,
			character: run?.protagonist,
			world: world || {
				title: 'Current World',
				description: '',
				dndRulesMode: rulesProfile?.mode || 'FULL_DND',
			},
			rulesProfile,
			progressionPolicy,
			progressionState: {
				...progressionState,
				maxCharacterLevel: progressionPolicy.maxLevel,
			},
			customRules,
			powerState: capabilityEngine.getPowerState(actorId),
			ownedCapabilities: actorCapabilities,
			skillInstances: capabilityEngine.getActorSkillInstances(actorId),
			// Only capabilities authored for the active world can establish a
			// world-specific supernatural mechanism. The global registry is internal
			// candidate data, not world canon.
			allWorldCapabilities: worldCapabilities,
			environment: buildSimulationEnvironment(this.repository, storyId, sceneContext),
		};

		const simulation = simulator.simulate(actionText, simulationContext, candidate);

		if (simulation.status === 'UNSUPPORTED_REQUEST') {
			return {
				mode: 'NORMAL_ACTION',
				actionText,
				actorId,
				tips,
				canExecuteNow: true,
				aiPipeline,
			};
		}

		// World-forbidden or progression-locked requests stop here. Character incompatibility
		// is different: when the world permits the concept, the simulator may search for a
		// coherent character-specific mechanism without granting the requested skill.
		if (
			simulation.status === 'WORLD_FORBIDDEN' ||
			simulation.status === 'CURRENTLY_BLOCKED'
		) {
			return {
				mode: 'CAPABILITY_SIMULATION',
				actionText,
				actorId,
				tips,
				recognizedCapability: candidate,
				simulation,
				canExecuteNow: false,
				aiPipeline,
			};
		}

		// A fully world/character-compatible capability that is not yet learned is
		// a direct acquisition candidate. We do not invent a renamed clone just to
		// manufacture a proposal; the canonical capability itself is the candidate.
		if (simulation.status === 'DEVELOPABLE' && (candidate || simulation.candidateCapability)) {
			const proposalCandidate = candidate || simulation.candidateCapability!;
			const proposal = this.createDirectAcquisitionProposal(
				storyId,
				actorId,
				actionText,
				proposalCandidate,
				simulation,
				aiPipeline,
			);
			this.pendingProposals.set(proposal.proposalId, proposal);
			return {
				mode: 'SUGGEST_ALTERNATIVE',
				actionText,
				actorId,
				tips,
				recognizedCapability: candidate,
				simulation,
				proposal,
				canExecuteNow: false,
					aiPipeline,
				};
		}

		// Character incompatibility may justify an AI-generated alternate mechanism,
		// but an alternate-route hint alone must never be turned into a renamed copy
		// of the forbidden request. The generated candidate is dry-run validated below.
		if (
			simulation.worldAllowed &&
			(simulation.status === 'CHARACTER_INCOMPATIBLE' ||
				simulation.status === 'ALTERNATE_ROUTE') &&
			this.capabilityProposalGenerator
		) {
			const proposalCandidate = candidate || simulation.candidateCapability;
			if (proposalCandidate) {
				const proposal = await this.createAlternativeProposal(
					storyId,
					actorId,
					actionText,
					proposalCandidate,
					run,
					simulation,
					aiPipeline,
				);
				if (proposal) {
					this.pendingProposals.set(proposal.proposalId, proposal);
					return {
						mode: 'SUGGEST_ALTERNATIVE',
						actionText,
						actorId,
						tips,
						recognizedCapability: candidate,
						simulation: proposal.simulation,
						proposal,
						canExecuteNow: false,
					};
				}
			}
		}

		if (simulation.status === 'CONDITIONALLY_DEVELOPABLE' || simulation.status === 'DEVELOPABLE') {
			return {
				mode: 'CAPABILITY_SIMULATION',
				actionText,
				actorId,
				tips,
				recognizedCapability: candidate,
				simulation,
				canExecuteNow: false,
				aiPipeline,
			};
		}
		return {
			mode: 'CAPABILITY_SIMULATION',
			actionText,
			actorId,
			tips,
			recognizedCapability: candidate,
			simulation,
			canExecuteNow: false,
			aiPipeline,
		};
	}

	private createDirectAcquisitionProposal(
		storyId: string,
		actorId: string,
		actionText: string,
		capability: CapabilityDefinition,
		simulation: CapabilitySimulationResult,
		aiPipeline?: UnifiedActionPipelineResult,
	): ActionCapabilityProposal {
		return {
			aiPipeline,
			proposalId: deterministicId(
				'action_capability_proposal',
				storyId,
				actorId,
				actionText,
				capability.id,
				'direct',
			),
			requestedAction: actionText,
			requestedCapabilityId: capability.id,
			requestedCapabilityName: capability.name,
			reasonRequestedCapabilityUnavailable:
				`The character does not currently have '${capability.name}'. The world and character support it, but explicit acquisition is required; nothing has been acquired yet.`,
			alternative: capability,
			simulation,
			acceptLabel: 'Learn ' + capability.name + ' and use it',
			rejectLabel: 'Do not learn it',
		};
	}

	public async validatePendingProposal(
		storyId: string,
		proposalId: string,
	): Promise<ActionCapabilityProposal | null> {
		const pending = this.pendingProposals.get(proposalId);
		if (!pending) return null;

		const player = this.repository.getPlayerLifecycle(storyId);
		const run = this.repository.getStoryRun(storyId);
		const actorId =
			player?.actorId ||
			run?.protagonist?.characterId ||
			'player_actor_' + storyId;
		const capabilityEngine = this.repository.getCapabilityEngine(storyId);
		const actorCapabilities = capabilityEngine.getEffectiveActorCapabilities(
			actorId,
			this.repository.getInventoryEngine(storyId)
		);

		if (actorCapabilities.some((capability) => capability.id === pending.alternative.id)) {
			return null;
		}

		const allCapabilities = capabilityEngine.getAllCapabilities();
		const world = run?.worldId ? this.repository.getWorldTemplate(run.worldId) : undefined;
		const progressionState = this.repository.getCharacterProgressionEngine(storyId).getState(actorId);
		const progressionPolicy = capabilityEngine.getProgressionPolicy();
		const customRules = world?.worldId
			? new (await import('../domain/customRuleEngine')).CustomRuleEngine().getRules(this.repository as any, storyId)
			: [];
		const worldCapabilities = [
			...((world?.canonicalCapabilities || []) as CapabilityDefinition[]),
			...((world?.capabilities || []) as CapabilityDefinition[]),
		];

		const simulator = new CapabilitySimulationEngine();
		const simulation = simulator.simulate(
			pending.requestedAction,
			{
				actorId,
				character: run?.protagonist,
				world: world || {
					title: 'Current World',
					dndRulesMode: this.repository.getRulesProfile(storyId)?.mode || 'FULL_DND',
				},
				rulesProfile: this.repository.getRulesProfile(storyId) || undefined,
				progressionPolicy,
				progressionState: {
					...progressionState,
					maxCharacterLevel: progressionPolicy.maxLevel,
				},
				customRules,
				powerState: capabilityEngine.getPowerState(actorId),
				ownedCapabilities: actorCapabilities,
				skillInstances: capabilityEngine.getActorSkillInstances(actorId),
				allWorldCapabilities: worldCapabilities,
				environment: buildSimulationEnvironment(this.repository, storyId),
			},
			pending.alternative,
		);

		if (simulation.status !== 'DEVELOPABLE' || simulation.creationAllowed === false) {
			return null;
		}

		const refreshed: ActionCapabilityProposal = {
			...pending,
			simulation,
		};
		this.pendingProposals.set(proposalId, refreshed);
		return refreshed;
	}

	private async createAlternativeProposal(
		storyId: string,
		actorId: string,
		actionText: string,
		requestedCapability: CapabilityDefinition,
		run: any,
		initialSimulation: CapabilitySimulationResult,
		aiPipeline?: UnifiedActionPipelineResult,
	): Promise<ActionCapabilityProposal | null> {
		const world = run?.worldId ? this.repository.getWorldTemplate(run.worldId) : undefined;
		const capName = requestedCapability?.name || actionText || 'Custom Capability';
		const concept = deterministicAlternativeConcept(capName, run);

		let alternative: any;
		const worldCapabilityPool = [
			...((world?.canonicalCapabilities || []) as any[]),
			...((world?.capabilities || []) as any[]),
		];
		const canonicalWorldCapability = worldCapabilityPool.find((capability) =>
			capability?.id === requestedCapability?.id ||
			(typeof capability?.name === 'string' && requestedCapability?.name && capability.name.trim().toLowerCase() === requestedCapability.name.trim().toLowerCase())
		);

		if (canonicalWorldCapability) {
			// The capability already exists in this world's canon. Offer the canonical skill
			// itself for explicit acquisition instead of inventing a duplicate adaptation.
			alternative = requestedCapability;
		}

		if (!alternative && aiPipeline?.alternativeCapability) {
			// Prefer the alternative synthesized by the closed AI action pipeline so
			// intent -> research -> synthesis -> simulation remains one connected chain.
			alternative = aiPipeline.alternativeCapability;
		}

		if (!alternative) try {
			if (this.capabilityProposalGenerator) {
				alternative = await this.capabilityProposalGenerator(
					concept,
					world || {
						title: 'Current World',
						genreTags: [],
						dndRulesMode: 'FULL_DND',
					}
				);
			} else {
				const { CharacterGenesisService } = await import('../services/characterGenesisService');
				const service = new CharacterGenesisService();
				alternative = await service.proposeCustomCapability(
				{
					worldId: run?.worldId || storyId,
					capabilityConcept: concept + ': an adaptation of ' + capName + ' that fits this character.',
					characterContext: {
						role: run?.protagonist?.role?.archetype || run?.protagonist?.role?.profession,
						species: run?.protagonist?.identity?.species,
						background: run?.protagonist?.background?.history,
					},
				},
				world || {
					title: 'Current World',
					genreTags: [],
					dndRulesMode: 'FULL_DND',
				} as any
				);
			}
		} catch {
			alternative = undefined;
		}

		// No generated alternate means there is no safe alternative. Do not fall back
		// to a renamed copy of the forbidden request; that would defeat world/character
		// compatibility checks.
		if (!alternative) return null;

		// Never trust an AI/deterministic synthesis result by itself. Re-run the generated
		// candidate through the same dry-run simulator before presenting it as learnable.
		const proposalCapEngine = this.repository.getCapabilityEngine(storyId);
		const proposalActorCaps = proposalCapEngine.getEffectiveActorCapabilities(
			actorId,
			this.repository.getInventoryEngine(storyId),
		);
		const proposalProgressionState = this.repository.getCharacterProgressionEngine(storyId).getState(actorId);
		const proposalProgressionPolicy = proposalCapEngine.getProgressionPolicy();
		const proposalWorld = world || {
			title: 'Current World',
			description: '',
			dndRulesMode: this.repository.getRulesProfile(storyId)?.mode || 'FULL_DND',
		};
		const proposalCustomRules = proposalWorld?.worldId
			? new (await import('../domain/customRuleEngine')).CustomRuleEngine().getRules(this.repository as any, storyId)
			: [];
		const proposalWorldCapabilities = [
			...((proposalWorld.canonicalCapabilities || []) as CapabilityDefinition[]),
			...((proposalWorld.capabilities || []) as CapabilityDefinition[]),
		];
		const proposalSimulation = new CapabilitySimulationEngine().simulate(
			actionText,
			{
				actorId,
				character: run?.protagonist,
				world: proposalWorld,
				rulesProfile: this.repository.getRulesProfile(storyId) || undefined,
				progressionPolicy: proposalProgressionPolicy,
				progressionState: {
					...proposalProgressionState,
					maxCharacterLevel: proposalProgressionPolicy.maxLevel,
				},
				customRules: proposalCustomRules,
				powerState: proposalCapEngine.getPowerState(actorId),
				ownedCapabilities: proposalActorCaps,
				skillInstances: proposalCapEngine.getActorSkillInstances(actorId),
				allWorldCapabilities: proposalWorldCapabilities,
				environment: buildSimulationEnvironment(this.repository, storyId),
			},
			alternative,
		);

		if (
			proposalSimulation.status !== 'DEVELOPABLE' ||
			proposalSimulation.creationAllowed === false ||
			proposalSimulation.worldAllowed === false ||
			proposalSimulation.characterCompatible === false
		) {
			return null;
		}

		initialSimulation = proposalSimulation;
		// A generated alternative is still only a proposal until the explicit acceptance endpoint commits it.
		return {
			aiPipeline,
			proposalId: deterministicId(
				'action_capability_proposal',
				storyId,
				actorId,
				actionText,
				requestedCapability?.id || 'unknown_cap',
				alternative.name
			),
			requestedAction: actionText,
			requestedCapabilityId: requestedCapability?.id || 'unknown_cap',
			requestedCapabilityName: requestedCapability?.name || capName,
			reasonRequestedCapabilityUnavailable:
				"The character does not currently have '" + (requestedCapability?.name || capName) + "'. The simulation found a world/character-compatible development route; nothing has been acquired yet.",
			alternative,
			simulation: initialSimulation,
			acceptLabel: 'Learn ' + alternative.name + ' and use it',
			rejectLabel: 'Do not learn it',
		};
	}

	public async getTipsForAction(
		storyId: string,
		actionText: string,
		sceneContext?: StoryActionSceneContext,
	): Promise<ActionTip[]> {
		const player = this.repository.getPlayerLifecycle(storyId);
		const run = this.repository.getStoryRun(storyId);
		const actorId =
			player?.actorId ||
			run?.protagonist?.characterId ||
			'player_actor_' + storyId;
		const actorCapabilities = this.repository.getCapabilityEngine(storyId).getEffectiveActorCapabilities(
			actorId,
			this.repository.getInventoryEngine(storyId)
		);
		return this.generateTips(
			storyId,
			actorId,
			actionText,
			actorCapabilities,
			sceneContext,
		);
	}

	private async generateTips(
		storyId: string,
		actorId: string,
		actionText: string,
		actorCapabilities: EffectiveCapability[],
		sceneContext?: StoryActionSceneContext,
	): Promise<ActionTip[]> {
		const run = this.repository.getStoryRun(storyId);
		const location = this.repository.getGeographyGraph(storyId)
			.getAllNodes()
			.find((node) => node.id === this.repository.getPlayerLifecycle(storyId)?.locationId);

		const sceneSources = [
			sceneContext?.locationName,
			sceneContext?.locationDescription,
			sceneContext?.startingSituation,
			sceneContext?.activeDialogue,
			sceneContext?.openingNarrative,
			...(sceneContext?.recentActions || []),
		].filter(Boolean).map((value) => String(value).trim()).filter(Boolean);

		const normalizedScene = normalize(sceneSources.join(' '));
		const locationLabel = sceneContext?.locationName || location?.name || 'the current area';
		const contextualTips: ActionTip[] = [];
		const addContextTip = (title: string, description: string, actionText: string, intent: string) => {
			if (contextualTips.some((tip) => normalize(tip.actionText) === normalize(actionText))) return;
			contextualTips.push({
				id: deterministicId('context_action_tip', storyId, actorId, title, actionText),
				title,
				description,
				intent,
				actionText,
				source: 'DETERMINISTIC',
			});
		};

		if (sceneContext?.activeDialogue) {
			const speaker = String(sceneContext.activeDialogue).split(':')[0]?.trim() || 'the nearby character';
			addContextTip('Press the conversation', `Respond to ${speaker} and test what they are willing to reveal.`, `I respond to ${speaker} and ask what they are hiding.`, 'DIALOGUE');
		}

		if (/(anomal|disturb|strange|rift|collapse|unstable|temporal|magic|energy|threat|danger|trap|blood|fire|smoke|ice|footprint|sound|noise)/i.test(normalizedScene)) {
			addContextTip('Investigate the immediate disturbance', `Study the unusual details currently visible in ${locationLabel} before committing to an action.`, `I carefully inspect the immediate area of ${locationLabel} for the source of the disturbance.`, 'INVESTIGATE_SCENE');
		}

		if (sceneContext?.locationDescription || sceneContext?.openingNarrative) {
			addContextTip('Read the environment', 'Use the visible terrain, sounds, traces, exits, cover, and other physical clues to understand what the scene is offering.', `I carefully examine the terrain and visible details around me in ${locationLabel}.`, 'OBSERVE_ENVIRONMENT');
		}

		if (sceneContext?.recentActions?.length) {
			addContextTip('Follow up on what just happened', 'Build on the most recent event instead of treating the scene as a reset.', 'I follow up on the immediate consequence of what just happened before moving on.', 'FOLLOW_UP_RECENT_EVENT');
		}

		const actionLooksThreatened = /(enemy|attacked|combat|fight|battle|ambush|threat|danger|chase|pursuit|hostile)/i.test(normalizedScene);
		if (actionLooksThreatened) {
			addContextTip('Take a safer position', 'Create distance, seek cover, or move toward a position that gives you more information before committing to a fight.', 'I reposition toward safer ground and keep the current threat in sight.', 'TACTICAL_REPOSITION');
		}

		const contextualCapabilityTips: ActionTip[] = actorCapabilities
			.filter((capability) => capability.name && capability.description)
			.filter((capability) => {
				const capabilityText = normalize(capability.name + ' ' + capability.description);
				return actionLooksThreatened
					? /attack|defend|shield|heal|guard|counter|protect|move|escape|evade|stealth/i.test(capabilityText)
					: /inspect|perceive|search|sense|detect|talk|persuade|stealth|move|travel|interact/i.test(capabilityText);
			})
			.slice(0, 2)
			.map((capability) => ({
				id: deterministicId('context_capability_tip', storyId, actorId, capability.id, locationLabel),
				title: `Use ${capability.name} here`,
				description: actionLooksThreatened
					? `Your ${capability.name} may be useful against the current threat or positioning problem in ${locationLabel}.`
					: `Your ${capability.name} may help you interact with the current scene rather than simply using it in isolation.`,
				intent: capability.id,
				actionText: actionLooksThreatened
					? `I use ${capability.name} to respond to the current threat in ${locationLabel}.`
					: `I use ${capability.name} to investigate or interact with what is happening in ${locationLabel}.`,
				source: 'DETERMINISTIC' as const,
			}));

		const deterministicTips: ActionTip[] = [...contextualTips, ...contextualCapabilityTips].slice(0, 4);
		const genericTips: ActionTip[] = actorCapabilities.slice(0, 4).map((capability) => ({
			id: deterministicId('generic_action_tip', storyId, actorId, capability.id),
			title: 'Use ' + capability.name,
			description: capability.description,
			intent: capability.id,
			actionText: 'I use ' + capability.name + '.',
			source: 'DETERMINISTIC' as const,
		}));

		try {
			const actorSummary = [
				run?.protagonist?.role?.profession,
				run?.protagonist?.role?.archetype,
				run?.protagonist?.title,
				...(run?.protagonist?.personality?.traits || []),
				...(run?.protagonist?.motivations?.goals || []),
			].filter(Boolean).join(', ');

			const capabilitySummary = actorCapabilities
				.slice(0, 18)
				.map((capability) => `-${capability.name}: ${capability.description}`)
				.join('\n');

			const currentScene = [
				sceneContext?.worldTime ? `World time: ${sceneContext.worldTime}` : '',
				sceneContext?.locationName ? `Current location: ${sceneContext.locationName}` : '',
				sceneContext?.locationRegion ? `Region: ${sceneContext.locationRegion}` : '',
				sceneContext?.locationDescription ? `Location description: ${sceneContext.locationDescription}` : '',
				sceneContext?.startingSituation ? `Starting/current situation: ${sceneContext.startingSituation}` : '',
				sceneContext?.openingNarrative ? `Recent scene narration: ${sceneContext.openingNarrative}` : '',
				sceneContext?.activeDialogue ? `Active dialogue: ${sceneContext.activeDialogue}` : '',
				sceneContext?.recentActions?.length
					? `Recent player actions:\n${sceneContext.recentActions.map((entry) => '- ' + entry).join('\n')}`
					: '',
			].filter(Boolean).join('\n');

			const prompt =
				`You are the gameplay suggestion assistant for an AI RPG.\n` +
				`Give the player 2 to 4 actionable possibilities for the current situation.\n` +
				`Every suggestion MUST be grounded in a concrete visible scene cue such as location, terrain, danger, anomaly, dialogue, recent consequence, visible object, or environmental condition.\n` +
				`Do NOT output a generic "use a known ability" suggestion unless the ability is explicitly connected to the current situation and explains why it is useful here.\n` +
				`When the scene contains an active problem, vary suggestions across investigation, social interaction, movement/positioning, environmental interaction, and relevant known abilities when supported by the scene.\n` +
				`Use the supplied character capabilities when relevant, but basic physical, social, stealth, environmental, and tactical actions are allowed when the scene supports them.\n` +
				`Do not invent hidden information, unavailable items, learned abilities, enemies, or guaranteed outcomes.\n` +
				`If an action would require a capability the character does not have, phrase it as an attempt only if the player could reasonably attempt that action without possessing a special ability.\n` +
				`Return ONLY JSON: {"tips":[{"title":"short title","description":"one concise explanation","actionText":"what the player could type"}]}.\n\n` +
				`Character: ${actorSummary || 'unspecified'}\n` +
				`Current visible scene:\n${currentScene || '- unavailable'}\n\n` +
				`Current player action: ${actionText || '- none'}\n` +
				`Known capabilities:\n${capabilitySummary || '- none'}`;

			const orchestrator = this.repository.getAiOrchestrator();
			const response = await orchestrator.executeTaskGeneration(
				'story.advice',
				prompt,
				'Return only the requested JSON object with 2 to 4 tips.',
				{
					timeoutMs: 3500,
					contextTokens: Math.min(6000, Math.ceil(prompt.length / 4)),
					validateResponse: (text) => {
						try {
							const parsed = JSON.parse(text);
							return Array.isArray(parsed?.tips) && parsed.tips.length >= 1
								? { valid: true }
								: { valid: false, errorReason: 'Advice JSON must contain a non-empty tips array.' };
						} catch {
							return { valid: false, errorReason: 'Advice response was not valid JSON.' };
						}
					},
				}
			);

			const parsed = JSON.parse(response.text);
			if (Array.isArray(parsed?.tips)) {
				const aiTips = parsed.tips
					.filter((tip: any) => tip && typeof tip.title === 'string' && typeof tip.description === 'string' && typeof tip.actionText === 'string')
					.slice(0, 4)
					.map((tip: any, index: number) => ({
						id: deterministicId('ai_action_tip', storyId, actorId, actionText, String(index), tip.title),
						title: tip.title.trim(),
						description: tip.description.trim(),
						intent: tip.actionText.trim(),
						actionText: tip.actionText.trim(),
						source: 'AI' as const,
					}));
				if (aiTips.length > 0) {
					const groundedAiTips = aiTips.filter((tip) => {
						const haystack = normalize(tip.title + ' ' + tip.description + ' ' + tip.actionText);
						const cueWords = sceneSources.flatMap((cue) => normalize(cue).split(/\s+/)).filter((word) => word.length >= 5);
						return cueWords.length === 0 || cueWords.some((word) => haystack.includes(word));
					});
					if (groundedAiTips.length > 0) {
						return [...groundedAiTips, ...deterministicTips].slice(0, 4);
					}
				}
			}
		} catch {
			// Deterministic suggestions remain the guaranteed fallback.
		}

		return deterministicTips.length > 0 ? deterministicTips : genericTips;
	}
}


export const storyActionAdvisor = new StoryActionAdvisor(worldRepository);
