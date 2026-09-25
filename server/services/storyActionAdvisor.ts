
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

export type ActionAdviceMode =
	| 'EXECUTE_EXISTING'
	| 'AUTO_LEARN_AND_EXECUTE'
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
	return normalized.includes(capabilityName) || normalized === capability.id.toLowerCase();
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
	const requested = requestedName.toLowerCase();

	if (requested.includes('fireball') || requested.includes('fire')) {
		if (role.includes('dark') || actorText.includes('curse') || actorText.includes('shadow') || actorText.includes('void')) {
			return 'Dark Fire';
		}
		return 'Personalized ' + requestedName;
	}

	if (requested.includes('ice') || requested.includes('frost')) {
		if (role.includes('dark') || actorText.includes('shadow') || actorText.includes('curse')) {
			return 'Black Frost';
		}
		return 'Personalized ' + requestedName;
	}

	if (requested.includes('lightning') || requested.includes('thunder')) {
		if (role.includes('dark') || actorText.includes('shadow') || actorText.includes('curse')) {
			return 'Void Lightning';
		}
		return 'Personalized ' + requestedName;
	}

	return 'Personalized ' + requestedName;
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
		const player = this.repository.getPlayerLifecycle(storyId);
		const actorId = player?.actorId || 'player_actor_' + storyId;
		const run = this.repository.getStoryRun(storyId);
		const capabilityEngine = this.repository.getCapabilityEngine(storyId);
		const actorCapabilities = capabilityEngine.getEffectiveActorCapabilities(
			actorId,
			this.repository.getInventoryEngine(storyId)
		);
		const allCapabilities = capabilityEngine.getAllCapabilities();
		const normalizedAction = normalize(actionText);

		const tips = await this.generateTips(
			storyId,
			actorId,
			actionText,
			actorCapabilities,
			sceneContext,
		);

		const recognizedCapability = allCapabilities
			.filter((capability) => capabilityMatchesAction(capability, normalizedAction))
			.sort((a, b) => normalize(b.name).length - normalize(a.name).length)[0];

		// Ownership is always checked against actor-owned/effective capabilities first.
		// The global registry is an AI/internal candidate source, never a grant source.
		if (recognizedCapability && actorAlreadyHasCapability(actorCapabilities, recognizedCapability.id)) {
			return {
				mode: 'EXECUTE_EXISTING',
				actionText,
				actorId,
				recognizedCapability,
				tips,
				canExecuteNow: true,
			};
		}

		let candidate = recognizedCapability;
		if (!candidate) {
			const preview = capabilityEngine.interpretFreeformAction({
				actorId,
				actionText,
				executeIfValid: false,
			});
			if (preview.interpretationType !== 'NOVEL_CAPABILITY_PROPOSAL' || !preview.proposedCapability) {
				return {
					mode: 'NORMAL_ACTION',
					actionText,
					actorId,
					tips,
					canExecuteNow: true,
				};
			}
			candidate = preview.proposedCapability;
		}

		const world = run?.worldId ? this.repository.getWorldTemplate(run.worldId) : undefined;
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
				capabilities: allCapabilities,
				canonicalCapabilities: allCapabilities,
				dndRulesMode: 'FULL_DND',
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
			allWorldCapabilities: allCapabilities,
			environment: buildSimulationEnvironment(this.repository, storyId, sceneContext),
		};

		const simulator = new CapabilitySimulationEngine();
		const simulation = simulator.simulate(actionText, simulationContext, candidate);

		if (simulation.status === 'UNSUPPORTED_REQUEST') {
			return {
				mode: 'NORMAL_ACTION',
				actionText,
				actorId,
				tips,
				canExecuteNow: true,
			};
		}

		if (simulation.status === 'WORLD_FORBIDDEN' ||
			simulation.status === 'CHARACTER_INCOMPATIBLE' ||
			simulation.status === 'CURRENTLY_BLOCKED' ||
			simulation.status === 'ALTERNATE_ROUTE') {
			return {
				mode: 'CAPABILITY_SIMULATION',
				actionText,
				actorId,
				tips,
				recognizedCapability: candidate,
				simulation,
				canExecuteNow: false,
			};
		}

		if (simulation.status === 'DEVELOPABLE' && simulation.creationAllowed !== false) {
			const proposal = await this.createAlternativeProposal(
				storyId,
				actorId,
				actionText,
				candidate,
				run,
				simulation,
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

		if (simulation.status === 'CONDITIONALLY_DEVELOPABLE' || simulation.status === 'DEVELOPABLE') {
			return {
				mode: 'CAPABILITY_SIMULATION',
				actionText,
				actorId,
				tips,
				recognizedCapability: candidate,
				simulation,
				canExecuteNow: false,
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
		};
	}

	public async validatePendingProposal(
		storyId: string,
		proposalId: string,
	): Promise<ActionCapabilityProposal | null> {
		const pending = this.pendingProposals.get(proposalId);
		if (!pending) return null;

		const player = this.repository.getPlayerLifecycle(storyId);
		const actorId = player?.actorId || 'player_actor_' + storyId;
		const run = this.repository.getStoryRun(storyId);
		const capabilityEngine = this.repository.getCapabilityEngine(storyId);
		const actorCapabilities = capabilityEngine.getEffectiveActorCapabilities(
			actorId,
			this.repository.getInventoryEngine(storyId)
		);

		if (actorCapabilities.some((capability) => capability.id === pending.alternative.id)) {
			return null;
		}

		const allCapabilities = capabilityEngine.getAllCapabilities();
		const progressionState = this.repository.getCharacterProgressionEngine(storyId).getState(actorId);
		const progressionPolicy = capabilityEngine.getProgressionPolicy();
		const world = run?.worldId ? this.repository.getWorldTemplate(run.worldId) : undefined;
		const customRules = world?.worldId
			? new (await import('../domain/customRuleEngine')).CustomRuleEngine().getRules(this.repository as any, storyId)
			: [];

		const simulator = new CapabilitySimulationEngine();
		const simulation = simulator.simulate(
			pending.requestedAction,
			{
				actorId,
				character: run?.protagonist,
				world: world || { title: 'Current World' },
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
				allWorldCapabilities: allCapabilities,
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
	): Promise<ActionCapabilityProposal | null> {
		const world = run?.worldId ? this.repository.getWorldTemplate(run.worldId) : undefined;
		const concept = deterministicAlternativeConcept(requestedCapability.name, run);

		let alternative: any;
		try {
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
					capabilityConcept: concept + ': an adaptation of ' + requestedCapability.name + ' that fits this character.',
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

		if (!alternative) {
			alternative = {
				id: deterministicId('cap_advisor_preview', storyId, actorId, actionText),
				name: concept,
				category: requestedCapability.category,
				activationMode: requestedCapability.activationMode,
				powerTier: requestedCapability.powerTier,
				baseEnergyCost: requestedCapability.baseEnergyCost,
				baseStrainCost: requestedCapability.baseStrainCost,
				minVesselCapacityRequired: requestedCapability.minVesselCapacityRequired,
				description: 'A character-compatible adaptation of ' + requestedCapability.name + ', expressed through the character’s established power domain.',
				provenance: 'ACTION_ADVISOR_DETERMINISTIC_PREVIEW',
				actionType: requestedCapability.actionType,
				targetType: requestedCapability.targetType,
				rangeScope: requestedCapability.rangeScope,
			};
		}

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
			capabilities: proposalCapEngine.getAllCapabilities(),
			canonicalCapabilities: proposalCapEngine.getAllCapabilities(),
			dndRulesMode: 'FULL_DND',
		};
		const proposalCustomRules = proposalWorld?.worldId
			? new (await import('../domain/customRuleEngine')).CustomRuleEngine().getRules(this.repository as any, storyId)
			: [];
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
				allWorldCapabilities: proposalCapEngine.getAllCapabilities(),
				environment: buildSimulationEnvironment(this.repository, storyId),
			},
			alternative,
		);

		if (proposalSimulation.status !== 'DEVELOPABLE' || proposalSimulation.creationAllowed === false) {
			return null;
		}

		initialSimulation = proposalSimulation;
		// A generated alternative is still only a proposal until the explicit acceptance endpoint commits it.
		return {
			proposalId: deterministicId(
				'action_capability_proposal',
				storyId,
				actorId,
				actionText,
				requestedCapability.id,
				alternative.name
			),
			requestedAction: actionText,
			requestedCapabilityId: requestedCapability.id,
			requestedCapabilityName: requestedCapability.name,
			reasonRequestedCapabilityUnavailable:
				"'" + requestedCapability.name + "' is not currently learned. The simulation found a world/character-compatible development route; nothing has been acquired yet.",
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
		const actorId = player?.actorId || 'player_actor_' + storyId;
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

		const deterministicTips: ActionTip[] = actorCapabilities
			.filter((capability) => {
				const action = normalize(actionText);
				return (
					(action.includes('attack') || action.includes('fight')) &&
					capability.category === 'Combat'
				) || (
					(action.includes('move') || action.includes('escape')) &&
					capability.category === 'Movement'
				) || (
					(action.includes('inspect') || action.includes('search')) &&
					capability.category === 'Perception'
				);
			})
			.slice(0, 4)
			.map((capability) => ({
				id: deterministicId('action_tip', storyId, actorId, actionText, capability.id),
				title: capability.name,
				description: capability.description,
				intent: capability.id,
				actionText: capability.name,
				source: 'DETERMINISTIC' as const,
			}));

		const genericTips = actorCapabilities
			.slice(0, 4)
			.map((capability) => ({
				id: deterministicId('generic_action_tip', storyId, actorId, capability.id),
				title: 'Use ' + capability.name,
				description: capability.description,
				intent: capability.id,
				actionText: capability.name,
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
				`Suggestions should react to the supplied visible scene, not generic RPG advice.\n` +
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
				if (aiTips.length > 0) return aiTips;
			}
		} catch {
			// Deterministic suggestions remain the guaranteed fallback.
		}

		return deterministicTips.length > 0 ? deterministicTips : genericTips;
	}
}


export const storyActionAdvisor = new StoryActionAdvisor(worldRepository);
