
import { deterministicId } from './deterministicRng';
import type {
	CapabilityDefinition,
	EffectiveCapability,
} from '../domain/capabilityEngine';
import type { WorldRepository } from '../repositories/worldRepository';

export type ActionAdviceMode =
	| 'EXECUTE_EXISTING'
	| 'AUTO_LEARN_AND_EXECUTE'
	| 'SUGGEST_ALTERNATIVE'
	| 'NORMAL_ACTION';

export interface ActionTip {
	id: string;
	title: string;
	description: string;
	intent: string;
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
	canExecuteNow: boolean;
}

function normalize(value: unknown): string {
	return String(value || '').trim().toLowerCase();
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
): boolean {
	const actorText = actorNarrativeText(run);
	const role = normalize(run?.protagonist?.role?.archetype || run?.protagonist?.role?.profession);

	if (Array.isArray(capability.restrictions) && capability.restrictions.length > 0) {
		return capability.restrictions.every((restriction) =>
			actorText.includes(normalize(restriction)) || role.includes(normalize(restriction))
		);
	}

	const provenance = normalize(capability.provenance);
	const schoolMatch = provenance.match(/(?:skill|school|tradition|class):([^:]+)/);
	if (schoolMatch?.[1]) {
		const school = schoolMatch[1].replace(/[_-]/g, ' ');
		if (actorText.includes(school) || role.includes(school)) return true;
	}

	const capabilityText = normalize(capability.name + ' ' + capability.description);
	const domainKeywords: Record<string, string[]> = {
		fire: ['mage', 'wizard', 'sorcerer', 'pyromancer', 'fire', 'flame', 'elementalist', 'arcane'],
		shadow: ['dark mage', 'shadow mage', 'warlock', 'necromancer', 'shadow', 'void', 'curse'],
		ice: ['ice mage', 'frost mage', 'cryomancer', 'frost', 'ice', 'winter'],
		light: ['cleric', 'paladin', 'priest', 'light', 'radiant', 'holy'],
	};

	for (const [domain, compatibleRoles] of Object.entries(domainKeywords)) {
		if (capabilityText.includes(domain)) {
			if (compatibleRoles.some((keyword) => role.includes(keyword) || actorText.includes(keyword))) {
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
	constructor(
		private readonly repository: WorldRepository,
	) {}

	public async advise(storyId: string, actionText: string): Promise<ActionAdvice> {
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

		const recognizedCapability = allCapabilities.find((capability) =>
			capabilityMatchesAction(capability, normalizedAction)
		);

		const tips = await this.generateTips(storyId, actorId, actionText, actorCapabilities);

		if (!recognizedCapability) {
			return {
				mode: 'NORMAL_ACTION',
				actionText,
				actorId,
				tips,
				canExecuteNow: true,
			};
		}

		if (actorAlreadyHasCapability(actorCapabilities, recognizedCapability.id)) {
			return {
				mode: 'EXECUTE_EXISTING',
				actionText,
				actorId,
				recognizedCapability,
				tips,
				canExecuteNow: true,
			};
		}

		if (inferDirectCompatibility(recognizedCapability, run)) {
			return {
				mode: 'AUTO_LEARN_AND_EXECUTE',
				actionText,
				actorId,
				recognizedCapability,
				tips,
				canExecuteNow: false,
			};
		}

		const alternative = await this.createAlternativeProposal(
			storyId,
			actorId,
			actionText,
			recognizedCapability,
			run
		);

		return {
			mode: 'SUGGEST_ALTERNATIVE',
			actionText,
			actorId,
			recognizedCapability,
			tips,
			proposal: alternative,
			canExecuteNow: false,
		};
	}

	private async createAlternativeProposal(
		storyId: string,
		actorId: string,
		actionText: string,
		requestedCapability: CapabilityDefinition,
		run: any,
	): Promise<ActionCapabilityProposal> {
		const world = run?.worldId ? this.repository.getWorldTemplate(run.worldId) : undefined;
		const concept = deterministicAlternativeConcept(requestedCapability.name, run);

		let alternative: any;
		try {
			const { CharacterGenesisService } = await import('../services/characterGenesisService');
			const service = new CharacterGenesisService(this.repository);
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
				"Your character does not currently have '" + requestedCapability.name + "' and their established role/domain does not support directly invoking it.",
			alternative,
			acceptLabel: 'Learn ' + alternative.name + ' and use it',
			rejectLabel: 'Keep my current abilities',
		};
	}

	private async generateTips(
		storyId: string,
		actorId: string,
		actionText: string,
		actorCapabilities: EffectiveCapability[],
	): Promise<ActionTip[]> {
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
			.slice(0, 3)
			.map((capability) => ({
				id: deterministicId('action_tip', storyId, actorId, actionText, capability.id),
				title: capability.name,
				description: capability.description,
				intent: capability.id,
				source: 'DETERMINISTIC' as const,
			}));

		return deterministicTips;
	}
}
