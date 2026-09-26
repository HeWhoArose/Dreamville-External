import { deterministicId, formatCanonicalTimestamp } from './deterministicRng';
import { NpcTacticalDecisionPolicy, TacticalActionProposal, TacticalActionType, TacticalGroupContext } from './tacticalDecisionPolicy';
import { TacticalCombatEngine, BattlefieldParticipant, CombatPerceptionOptions } from './combatEngine';
import { CapabilityEngine } from './capabilityEngine';
import type { TacticalPlanState, TacticalPlanStepState } from '../../src/types';
import type { WorldRepository } from '../repositories/worldRepository';

interface CombatTacticsAiStep {
	id?: string;
	actionType?: TacticalActionType;
	targetId?: string;
	targetPosition?: { x?: number; y?: number };
	capabilityId?: string;
	trigger?: string;
	contingency?: string;
}

interface CombatTacticsAiResponse {
	objective?: string;
	replan?: boolean;
	reason?: string;
	steps?: CombatTacticsAiStep[];
}

export interface CombatTacticsDecisionResult {
	proposal: TacticalActionProposal;
	plan?: TacticalPlanState;
	source: 'AI' | 'DETERMINISTIC_FALLBACK';
	modelId?: string;
	providerId?: string;
	fallbackReason?: string;
}

function parseJson(text: string): unknown {
	const trimmed = String(text || '').trim();
	const withoutFence = trimmed.replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/i, '').trim();
	try {
		return JSON.parse(withoutFence);
	} catch {
		const first = withoutFence.indexOf('{');
		const last = withoutFence.lastIndexOf('}');
		if (first >= 0 && last > first) return JSON.parse(withoutFence.slice(first, last + 1));
		throw new Error('Combat tactics model did not return valid JSON.');
	}
}

function finitePosition(value: unknown): { x: number; y: number } | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const x = Number((value as any).x);
	const y = Number((value as any).y);
	return Number.isFinite(x) && Number.isFinite(y) ? { x: Math.trunc(x), y: Math.trunc(y) } : undefined;
}

function clampStep(step: CombatTacticsAiStep, index: number): TacticalPlanStepState | undefined {
	if (!step || !step.actionType) return undefined;
	if (!['MOVE', 'ATTACK', 'CAST', 'RETREAT', 'DEFEND_ALLY', 'END_TURN'].includes(step.actionType)) return undefined;
	const position = finitePosition(step.targetPosition);
	return {
		id: String(step.id || 'step_' + (index + 1)),
		actionType: step.actionType,
		targetId: typeof step.targetId === 'string' ? step.targetId : undefined,
		targetPosition: position,
		capabilityId: typeof step.capabilityId === 'string' ? step.capabilityId : undefined,
		trigger: typeof step.trigger === 'string' ? step.trigger.slice(0, 300) : undefined,
		contingency: typeof step.contingency === 'string' ? step.contingency.slice(0, 300) : undefined,
	};
}

export class CombatTacticsService {
	private deriveGroupContext(
		storyId: string,
		actorId: string,
		combatEngine: TacticalCombatEngine,
		capabilityEngine: CapabilityEngine,
		repository: WorldRepository,
	): TacticalGroupContext | undefined {
		const actor = combatEngine.getParticipant(actorId);
		if (!actor) return undefined;

		const agency = repository.getDynamicCharacterAgencyEngine(storyId).getCharacter(storyId, actorId);
		const allies = combatEngine.getParticipants()
			.filter((participant) => participant.team === actor.team && !participant.isDead)
			.sort((a, b) => a.id.localeCompare(b.id));

		const members = allies.map((member) => {
			const caps = capabilityEngine.getEffectiveActorCapabilities(
				member.id,
				repository.getInventoryEngine(storyId),
			);
			const hasSupportCapability = caps.some((capability) =>
				['Support', 'Healing', 'Utility'].includes(String(capability.category))
			);
			const role =
				hasSupportCapability
					? 'SUPPORT'
					: member.hpMax >= 25 && member.armorClass >= 14
						? 'VANGUARD'
						: member.speedCells >= 5
							? 'SKIRMISHER'
							: 'REARGUARD';

			return {
				actorId: member.id,
				role: role as TacticalGroupContext['members'][number]['role'],
			};
		});

		const goalText = String(
			agency?.canonicalGoal ||
			agency?.goals.find((goal) => goal.active)?.description ||
			'',
		).toLowerCase();

		const groupObjective: TacticalGroupContext['groupObjective'] =
			/retreat|withdraw|flee|escape/.test(goalText)
				? 'RETREAT'
				: /protect|guard|defend/.test(goalText)
					? 'PROTECT_VIP'
					: /hold|line/.test(goalText)
						? 'HOLD_LINE'
						: 'ASSAULT';

		const enemies = combatEngine.getParticipants()
			.filter((participant) =>
				!participant.isDead &&
				participant.team !== actor.team &&
				participant.team !== 'neutral'
			)
			.sort((a, b) =>
				a.hpCurrent - b.hpCurrent ||
				a.id.localeCompare(b.id)
			);

		return {
			groupId: deterministicId('combat_group', storyId, actor.team),
			team: actor.team,
			members,
			focusTargetId: enemies[0]?.id,
			groupObjective,
		};
	}

	public async decideNpcTurn(params: {
		storyId: string;
		actorId: string;
		combatEngine: TacticalCombatEngine;
		capabilityEngine: CapabilityEngine;
		repository: WorldRepository;
		perceptionOptions?: CombatPerceptionOptions;
		groupContext?: TacticalGroupContext;
	}): Promise<CombatTacticsDecisionResult> {
		const {
			storyId,
			actorId,
			combatEngine,
			capabilityEngine,
			repository,
			perceptionOptions,
			groupContext,
		} = params;

		const effectiveGroupContext =
			groupContext ||
			this.deriveGroupContext(storyId, actorId, combatEngine, capabilityEngine, repository);

		const deterministic = () => NpcTacticalDecisionPolicy.decide({
			actorId,
			combatEngine,
			capabilityEngine,
			groupContext: effectiveGroupContext,
			perceptionOptions,
		});

		const deterministicProposal = deterministic();
		const actor = combatEngine.getParticipant(actorId);
		if (!actor) {
			return {
				proposal: deterministicProposal,
				source: 'DETERMINISTIC_FALLBACK',
				fallbackReason: 'NPC actor was not present in canonical combat state.',
			};
		}

		const knownParticipants = combatEngine
			.getParticipants()
			.filter((participant) =>
				!participant.isDead &&
				combatEngine.isParticipantKnownToActor(actorId, participant, perceptionOptions)
			)
			.map((participant) => this.projectParticipant(participant));

		const effectiveCapabilities = capabilityEngine.getEffectiveActorCapabilities(
			actorId,
			repository.getInventoryEngine(storyId),
		).map((capability) => ({
			id: capability.id,
			name: capability.name,
			category: capability.category,
			actionType: capability.actionType,
			powerTier: capability.powerTier,
			baseEnergyCost: capability.baseEnergyCost,
			effectDefinition: capability.effectDefinition,
		}));

		const agency = repository.getDynamicCharacterAgencyEngine(storyId).getCharacter(storyId, actorId);
		const currentPlan = combatEngine.getTacticalPlan(actorId);
		const perception = {
			knownParticipantIds: knownParticipants.map((participant) => participant.id),
		};

		const prompt = JSON.stringify({
			task: 'combat.tactics',
			rules: [
				'You are proposing a tactical plan for one NPC.',
				'Use only the supplied actor capabilities and perceived participants.',
				'Never invent a capability, target, position, condition, resource or hidden fact.',
				'Return JSON only.',
				'The first step is the action to execute this turn.',
				'Later steps are a conditional plan and will be revalidated after every canonical event.',
				'If the current plan is no longer valid, set replan=true and replace it.',
			],
			actor: {
				id: actor.id,
				name: actor.name,
				team: actor.team,
				hpCurrent: actor.hpCurrent,
				hpMax: actor.hpMax,
				armorClass: actor.armorClass,
				speedCells: actor.speedCells,
				conditions: actor.conditions,
				morale: combatEngine.getMoraleState(actorId) || actor.moraleState,
				knowledgeBoundary: perception,
			},
			agency: agency || null,
			groupContext: effectiveGroupContext || null,
			participants: knownParticipants,
			hazards: combatEngine.getHazards(),
			obstacles: combatEngine.getObstacles(),
			mapBounds: combatEngine.getMapBounds(),
			turnResources: combatEngine.getTurnResources(actorId),
			pendingActivation: combatEngine.getPendingActivation(actorId),
			capabilities: effectiveCapabilities,
			currentPlan,
			deterministicFallback: deterministicProposal,
			outputSchema: {
				objective: 'string',
				replan: 'boolean',
				reason: 'string',
				steps: [{
					id: 'string',
					actionType: 'MOVE|ATTACK|CAST|RETREAT|DEFEND_ALLY|END_TURN',
					targetId: 'optional known participant id',
					targetPosition: 'optional {x,y}',
					capabilityId: 'required for CAST',
					trigger: 'optional condition',
					contingency: 'optional fallback condition',
				}],
			},
		});

		try {
			const orchestrator = repository.getAiOrchestrator();
			const generated = await orchestrator.executeTaskGeneration(
				'combat.tactics',
				prompt,
				'Return a legal tactical proposal and a conditional multi-step plan. The authoritative combat engine validates every step.',
				{
					timeoutMs: 7000,
					maxTokens: 1800,
					contextTokens: Math.ceil(prompt.length / 4),
					validateResponse: (text) => {
						try {
							const parsed = parseJson(text) as CombatTacticsAiResponse;
							const first = Array.isArray(parsed.steps) ? parsed.steps[0] : undefined;
							const firstStep = first ? clampStep(first, 0) : undefined;
							return firstStep
								? { valid: true }
								: { valid: false, errorReason: 'No valid first tactical step was returned.' };
						} catch (error) {
							return {
								valid: false,
								errorReason: error instanceof Error ? error.message : 'Invalid tactical JSON.',
							};
						}
					},
				},
			);

			if (generated.source === 'DETERMINISTIC_FALLBACK' || !generated.text) {
				const step: TacticalPlanStepState = {
					id: 'fallback_step_1',
					actionType: deterministicProposal.actionType,
					targetId: deterministicProposal.targetId,
					targetPosition: deterministicProposal.targetPosition,
					capabilityId: deterministicProposal.capabilityId,
					trigger: deterministicProposal.reason,
				};
				const fallbackPlan: TacticalPlanState = {
					planId: deterministicId('tactical_plan_fallback', storyId, actorId, combatEngine.getCurrentRound(), String((currentPlan?.revision || 0) + 1)),
					actorId,
					objective: 'Deterministic fallback tactical response.',
					steps: [step],
					currentStepIndex: 0,
					status: 'ACTIVE',
					revision: (currentPlan?.revision || 0) + 1,
					source: 'DETERMINISTIC_FALLBACK',
					updatedTurn: combatEngine.getCurrentRound(),
					updatedAt: formatCanonicalTimestamp(repository.getWorldClock(storyId).getTimestamp()),
				};
				combatEngine.setTacticalPlan(fallbackPlan);
				return {
					proposal: deterministicProposal,
					plan: fallbackPlan,
					source: 'DETERMINISTIC_FALLBACK',
					modelId: generated.modelId,
					providerId: generated.providerId,
					fallbackReason: generated.fallbackReason || 'No AI tactical model produced a usable proposal.',
				};
			}

			const parsed = parseJson(generated.text) as CombatTacticsAiResponse;
			const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : [];
			const steps = rawSteps
				.map((step, index) => clampStep(step, index))
				.filter((step): step is TacticalPlanStepState => Boolean(step))
				.slice(0, 6);

			if (!steps.length) throw new Error('Tactical response contained no usable steps.');

			const first = this.validateProposal(
				actor,
				steps[0],
				combatEngine,
				effectiveCapabilities,
				knownParticipants,
			);

			if (!first.success || !first.proposal) {
				throw new Error(first.errorReason || 'AI tactical proposal failed canonical preflight.');
			}

			const timestamp = formatCanonicalTimestamp(repository.getWorldClock(storyId).getTimestamp());
			const plan: TacticalPlanState = {
				planId: deterministicId('tactical_plan', storyId, actorId, combatEngine.getCurrentRound(), String((currentPlan?.revision || 0) + 1)),
				actorId,
				objective: String(parsed.objective || 'Win the current combat while preserving survival and role objectives.').slice(0, 500),
				steps,
				currentStepIndex: 0,
				status: 'ACTIVE',
				revision: (currentPlan?.revision || 0) + 1,
				source: 'AI',
				updatedTurn: combatEngine.getCurrentRound(),
				updatedAt: timestamp,
			};
			combatEngine.setTacticalPlan(plan);

			return {
				proposal: first.proposal,
				plan,
				source: 'AI',
				modelId: generated.modelId,
				providerId: generated.providerId,
				fallbackReason: generated.fallbackReason,
			};
		} catch (error) {
			return {
				proposal: deterministicProposal,
				source: 'DETERMINISTIC_FALLBACK',
				fallbackReason: error instanceof Error ? error.message : String(error),
			};
		}
	}

	public recordExecution(
		combatEngine: TacticalCombatEngine,
		actorId: string,
		success: boolean,
	): void {
		const plan = combatEngine.getTacticalPlan(actorId);
		if (!plan) return;

		const nowTurn = combatEngine.getCurrentRound();
		if (!success) {
			plan.status = 'REPLANNING';
		} else {
			plan.currentStepIndex += 1;
			plan.status = plan.currentStepIndex >= plan.steps.length ? 'COMPLETED' : 'ACTIVE';
		}

		plan.updatedTurn = nowTurn;
		plan.updatedAt = new Date().toISOString();
		plan.revision += 1;
		combatEngine.setTacticalPlan(plan);
	}

	private validateProposal(
		actor: BattlefieldParticipant,
		step: TacticalPlanStepState,
		combatEngine: TacticalCombatEngine,
		effectiveCapabilities: any[],
		knownParticipants: BattlefieldParticipant[],
	): { success: boolean; proposal?: TacticalActionProposal; errorReason?: string } {
		const target = step.targetId ? knownParticipants.find((participant) => participant.id === step.targetId) : undefined;

		if (step.actionType === 'ATTACK' && (!target || target.isDead || target.team === actor.team)) {
			return { success: false, errorReason: 'AI attack target is not a valid known hostile participant.' };
		}
		if (step.actionType === 'DEFEND_ALLY' && (!target || target.team !== actor.team || target.id === actor.id)) {
			return { success: false, errorReason: 'AI defensive target is not a valid known ally.' };
		}
		if (step.actionType === 'CAST') {
			const capability = effectiveCapabilities.find((candidate) => candidate.id === step.capabilityId);
			if (!capability) return { success: false, errorReason: 'AI selected a capability not available to this actor.' };
			if (!target && capability.effectDefinition?.targetingMode !== 'SELF') {
				return { success: false, errorReason: 'AI cast target is missing or not known.' };
			}
			return {
				success: true,
				proposal: {
					actorId: actor.id,
					actionType: 'CAST',
					targetId: target?.id,
					capabilityId: capability.id,
					effectDefinition: capability.effectDefinition,
					reason: String(step.trigger || 'AI tactical plan selected this capability.').slice(0, 500),
					priorityScore: 100,
				},
			};
		}
		if (step.actionType === 'MOVE' || step.actionType === 'RETREAT' || step.actionType === 'DEFEND_ALLY') {
			if (!step.targetPosition) return { success: false, errorReason: 'AI movement proposal did not include a position.' };
			if (step.targetPosition.x < 0 || step.targetPosition.y < 0) return { success: false, errorReason: 'AI movement position is outside the battlefield.' };
		}

		return {
			success: true,
			proposal: {
				actorId: actor.id,
				actionType: step.actionType,
				targetId: step.targetId,
				targetPosition: step.targetPosition,
				capabilityId: step.capabilityId,
				reason: String(step.trigger || step.contingency || 'AI tactical plan selected this action.').slice(0, 500),
				priorityScore: 100,
			},
		};
	}

	private projectParticipant(participant: BattlefieldParticipant): BattlefieldParticipant {
		return {
			...JSON.parse(JSON.stringify(participant)),
			conditions: [...participant.conditions],
		};
	}
}

export const combatTacticsService = new CombatTacticsService();
