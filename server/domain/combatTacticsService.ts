import { deterministicId, formatCanonicalTimestamp } from './deterministicRng';
import { NpcTacticalDecisionPolicy, TacticalActionProposal, TacticalActionType, TacticalGroupContext } from './tacticalDecisionPolicy';
import { TacticalCombatEngine, BattlefieldParticipant, CombatPerceptionOptions } from './combatEngine';
import { CapabilityEngine } from './capabilityEngine';
import type { TacticalPlanState, TacticalPlanStepState } from '../../src/types';
import type { WorldRepository } from '../repositories/worldRepository';
import { NpcAutonomyEngine, type NpcAgentState, type NpcDecision } from './npcAutonomyEngine';

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

export interface TacticalIntelligenceProfile {
	strategyRating: number;
	planningHorizon: number;
	adaptability: number;
	threatAssessment: number;
	spatialAwareness: number;
	teamCoordination: number;
	riskTolerance: number;
	resourceDiscipline: number;
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
		const actorIntelligence = this.deriveTacticalIntelligence(actor, agency);
		const memoryKeywords = [
			actor.name,
			...(currentPlan?.steps || []).slice(currentPlan?.currentStepIndex || 0).map((step) => step.actionType),
			...knownParticipants.slice(0, 4).map((participant) => participant.name),
		]
			.map((value) => String(value).toLowerCase())
			.filter((value) => value.length >= 3)
			.slice(0, 12);
		const autonomyEngine = new NpcAutonomyEngine();
		const autonomyState: NpcAgentState = autonomyEngine.createState(
			actorId,
			repository.getWorldClock(storyId).getTimestamp().totalElapsedSeconds,
		);
		if (agency) {
			autonomyState.goals = (agency.goals || []).map((goal: any) => ({
				id: goal.goalId,
				description: goal.description || goal.title,
				priority: Number(goal.priority || 0),
				visibility: 'PRIVATE',
				active: goal.active !== false,
			}));
			autonomyState.fears = [...(agency.fears || [])];
			autonomyState.desires = [...(agency.desires || [])];
			autonomyState.loyalties = agency.factionId ? { [agency.factionId]: Number(agency.personality?.factionLoyalty || 0) } : {};
			autonomyState.beliefs = repository.getDynamicCharacterAgencyEngine(storyId)
			.getBeliefs(storyId, actorId)
			.map((belief: any) => ({
				id: belief.beliefId,
				factId: belief.believedValue,
				confidence: belief.confidence,
				source: belief.sourceEventIds?.[0] || 'agency',
			}));
			autonomyState.riskTolerance = Number(actorIntelligence.riskTolerance || 50);
		}
		const autonomyActions = [
			{
				id: 'deterministic:' + deterministicProposal.actionType,
				description: deterministicProposal.reason,
				targetEntityId: deterministicProposal.targetId,
				baseUtility: deterministicProposal.priorityScore,
				risk: Math.max(0, 100 - deterministicProposal.priorityScore),
			},
			{
				id: 'end_turn',
				description: 'End the current turn without taking a new tactical action.',
				baseUtility: 5,
				risk: 0,
			},
		];
		if (currentPlan?.steps?.[currentPlan.currentStepIndex]) {
			const plannedStep = currentPlan.steps[currentPlan.currentStepIndex];
			autonomyActions.push({
				id: 'plan:' + plannedStep.id,
				description: plannedStep.actionType + (plannedStep.targetId ? ' against ' + plannedStep.targetId : ''),
				targetEntityId: plannedStep.targetId,
				baseUtility: 60 + Math.max(0, 20 - currentPlan.currentStepIndex * 5),
				risk: plannedStep.actionType === 'RETREAT' ? 15 : 40,
			});
		}
		const autonomyDecision: NpcDecision | undefined = autonomyEngine.decide(
			autonomyState,
			{
				actorId,
				availableActions: autonomyActions,
				knownFactIds: [],
				opportunityScore: 0,
				nowSeconds: repository.getWorldClock(storyId).getTimestamp().totalElapsedSeconds,
			},
		);

		const tacticalMemories = repository.getMemoryEngine(storyId).retrieveMemories({
			storyId,
			viewerActorId: actorId,
			queryKeywords: memoryKeywords,
			currentTurn: combatEngine.getCurrentRound(),
			currentTimestamp: repository.getWorldClock(storyId).getTimestamp(),
			maxResults: 6,
			includeDormant: false,
			includeArchived: false,
		});
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
				tacticalIntelligence: actorIntelligence,
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
			npcAutonomy: autonomyDecision ? {
				actionId: autonomyDecision.actionId,
				utility: autonomyDecision.utility,
				deception: autonomyDecision.deception,
				goalId: autonomyDecision.goalId,
				rationale: autonomyDecision.rationale,
			} : null,
			tacticalMemory: tacticalMemories.map((memory) => ({
				id: memory.id,
				content: memory.content,
				importance: memory.importance,
				confidence: memory.confidence,
				sourceEventId: memory.sourceEventId,
			})),
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
		repository?: WorldRepository,
		storyId?: string,
		commandId?: string,
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
		combatEngine.addEncounterNote({
			actorId,
			text: success ? 'Tactical plan step resolved successfully: ' + plan.objective : 'Tactical plan step failed; replanning required: ' + plan.objective,
			category: success ? 'OUTCOME' : 'TACTICAL',
			source: plan.source === 'AI' ? 'AI' : 'SYSTEM',
		});

		if (repository && storyId) {
			const actor = combatEngine.getParticipant(actorId);
			if (actor) {
				const memoryId = deterministicId(
					'combat_tactical_memory',
					storyId,
					actorId,
					combatEngine.getCurrentRound(),
					plan.revision,
					commandId || 'turn',
				);
				const memoryEngine = repository.getMemoryEngine(storyId);
				if (!memoryEngine.getMemory(memoryId)) {
					memoryEngine.storeMemory({
						id: memoryId,
						storyId,
						memoryClass: 'CAUSAL',
						subjectEntityId: actorId,
						relatedEntityIds: combatEngine.getParticipants()
							.filter((participant) => participant.id !== actorId && !participant.isDead)
							.slice(0, 6)
							.map((participant) => participant.id),
						content: success
							? 'Combat tactic succeeded: ' + plan.objective
							: 'Combat tactic failed and required replanning: ' + plan.objective,
						importance: success ? 70 : 80,
						confidence: 1,
						status: 'active',
						visibility: 'PRIVATE',
						accessibleToEntityIds: [actorId],
						isPersistentCritical: false,
						provenance: 'combat_tactical_execution',
						sourceEventId: commandId,
						validFromTurn: combatEngine.getCurrentRound(),
						lastRecalledTurn: combatEngine.getCurrentRound(),
						createdAtTimestamp: repository.getWorldClock(storyId).getTimestamp(),
						lastRecalledTimestamp: repository.getWorldClock(storyId).getTimestamp(),
						triggerConditionTags: [
							'combat',
							success ? 'tactic_success' : 'tactic_failure',
							...plan.steps.slice(0, 3).map((step) => step.actionType.toLowerCase()),
						],
					});
				}
			}
		}
	}

	private deriveTacticalIntelligence(
		actor: BattlefieldParticipant,
		agency: any,
	): TacticalIntelligenceProfile {
		const personality = agency?.personality || {};
		const goals = Array.isArray(agency?.goals) ? agency.goals.filter((goal: any) => goal.active !== false).length : 0;
		const strategyRating = Math.max(
			0,
			Math.min(
				100,
				50 +
					Number(actor.initiativeModifier || 0) * 4 +
					Number(actor.attackBonus || 0) * 3 +
					Number(personality.ambition || 0) * 0.1 +
					goals * 5,
			),
		);
		return {
			strategyRating,
			planningHorizon: Math.max(1, Math.min(6, 1 + Math.floor(strategyRating / 20))),
			adaptability: Math.max(10, Math.min(100, 50 + Number(personality.courage || 0) * 0.25 + Number(personality.empathy || 0) * 0.15)),
			threatAssessment: Math.max(10, Math.min(100, 50 + Number(actor.armorClass || 10) - 10)),
			spatialAwareness: Math.max(10, Math.min(100, 45 + Number(actor.speedCells || 3) * 6)),
			teamCoordination: Math.max(10, Math.min(100, 50 + Number(personality.loyalty || 0) * 0.4)),
			riskTolerance: Math.max(10, Math.min(100, 50 + Number(personality.courage || 0) * 0.5 - Number(personality.fearfulness || 0) * 0.4)),
			resourceDiscipline: Math.max(10, Math.min(100, 60 + Number(actor.combatResources ? Object.keys(actor.combatResources).length : 0) * 3)),
		};
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
