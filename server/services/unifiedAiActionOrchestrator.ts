import type { WorldRepository } from '../repositories/worldRepository';
import type { CapabilityDefinition } from '../domain/capabilityEngine';
import { CapabilitySimulationEngine, type CapabilitySimulationResult } from '../domain/capabilitySimulationEngine';
import type { TaskId } from '../domain/aiOrchestrator';
import { getAiTaskContract } from '../domain/aiTaskContracts';
import { AiCallBudget, decideAiHelperNeed, type AiHelperRole } from '../domain/aiCallPolicy';
import { WorkingContextEngine } from '../domain/workingContextEngine';

export interface ActionResolutionHint {
	item?: { requested: boolean; itemName?: string; amount?: number };
	check?: { kind: 'ABILITY_CHECK' | 'SAVING_THROW' | 'NONE'; skillId?: string; ability?: string };
	hazard?: { type: 'FALL' | 'TRAP' | 'DEBRIS' | 'POISON' | 'FIRE' | 'OTHER'; distanceFeet?: number };
}

export interface UnifiedActionPipelineResult {
	actionText: string;
	intent: { baseAction: string; intent: string; requestedEffects: string[]; modifiers: string[]; target?: string; confidence: number; source: 'AI' | 'DETERMINISTIC_FALLBACK' };
	resolutionHint?: ActionResolutionHint;
	research: { required: boolean; brief: string; facts: string[]; sources?: string[]; source: 'AI' | 'DETERMINISTIC_FALLBACK' | 'NOT_REQUIRED' };
	capability?: CapabilityDefinition;
	alternativeCapability?: CapabilityDefinition;
	capabilityIntent: boolean;
	simulation: CapabilitySimulationResult;
	rules: { status: 'PASS' | 'BLOCK' | 'REVIEW'; reason: string; source: 'DETERMINISTIC' | 'AI_ASSISTED' };
	explanation: string;
	ruleAnalysis?: string;
	tacticalContext?: { required: boolean; plan?: string; source: 'AI' | 'DETERMINISTIC_FALLBACK' | 'NOT_REQUIRED' };
	narrationDirective: string;
	telemetry: Array<{ task: TaskId; helperRole?: AiHelperRole; modelId: string; providerId: string; source: string; attempts: number }>;
	aiCallPolicy: ReturnType<AiCallBudget['snapshot']>;
	helperDecision: { strategy: string; reason: string };
}

function json<T>(text: string): T | null { try { const value = JSON.parse(text); return value && typeof value === 'object' ? value as T : null; } catch { return null; } }

function deterministicIntent(actionText: string): UnifiedActionPipelineResult['intent'] {
	const normalized = actionText.toLowerCase();
	const modifiers: string[] = [];
	if (/overcharg|full power|maximum|all my (magic|energy)|concentrat/.test(normalized)) modifiers.push('AMPLIFY');
	if (/charge|gather|prepare/.test(normalized)) modifiers.push('CHARGE');
	if (/sprint|run as fast|push myself/.test(normalized)) modifiers.push('MAXIMUM_OUTPUT');
	const baseAction = /cast|spell|magic|conjur|invoke|channel/.test(normalized) ? 'CAST_OR_CHANNEL' : /attack|strike|hit|slash|shoot/.test(normalized) ? 'ATTACK' : /move|sprint|run|dash|flee/.test(normalized) ? 'MOVE' : 'INTERACT';
	return { baseAction, intent: modifiers.length ? modifiers.join('_') : baseAction, requestedEffects: modifiers.map((m) => m.toLowerCase()), modifiers, confidence: 0.55, source: 'DETERMINISTIC_FALLBACK' };
}

function capabilityCandidateFromWorld(world: any, actionText: string): CapabilityDefinition | undefined {
	const caps = [...((world?.canonicalCapabilities || []) as CapabilityDefinition[]), ...((world?.capabilities || []) as CapabilityDefinition[])];
	const normalized = actionText.toLowerCase();
	return caps.filter((cap) => typeof cap?.name === 'string' && normalized.includes(cap.name.toLowerCase())).sort((a,b) => b.name.length-a.name.length)[0];
}

export class UnifiedAiActionOrchestrator {
	constructor(private readonly repository: WorldRepository) {}

	private async runTask(
		task: TaskId,
		prompt: string,
		systemInstruction: string,
		options: any = {},
		budget?: AiCallBudget,
		role?: AiHelperRole,
	) {
		const contract = getAiTaskContract(task);
		const requestedMaxTokens = options.maxTokens ?? contract.defaultMaxTokens;
		const decision = budget?.authorize(task, requestedMaxTokens, role);
		if (decision && !decision.allowed) {
			throw new Error('AI_CALL_POLICY_BLOCKED: ' + decision.reason);
		}
		return this.repository.getAiOrchestrator().executeTaskGeneration(task, prompt, systemInstruction, {
			timeoutMs: options.timeoutMs ?? contract.defaultTimeoutMs,
			maxTokens: decision?.maxTokens ?? requestedMaxTokens,
			contextTokens: Math.min(12000, Math.max(0, Math.ceil(prompt.length / 4))),
			validateResponse: options.validateResponse,
		});
	}

	public async resolveAction(storyId: string, actionText: string, sceneContext?: Record<string, unknown>): Promise<UnifiedActionPipelineResult> {
		const cleanAction = String(actionText || '').trim();
		const run = this.repository.getStoryRun(storyId);
		const player = this.repository.getPlayerLifecycle(storyId);
		const actorId = player?.actorId || run?.protagonist?.characterId || ('player_actor_' + storyId);
		const world = run?.worldId ? this.repository.getWorldTemplate(run.worldId) : undefined;
		const capabilityEngine = this.repository.getCapabilityEngine(storyId);
		const inventoryEngine = this.repository.getInventoryEngine(storyId);
		const owned = capabilityEngine.getEffectiveActorCapabilities(actorId, inventoryEngine);
		const simulator = new CapabilitySimulationEngine();
		const telemetry: UnifiedActionPipelineResult['telemetry'] = [];
		const normalizedAction = cleanAction.toLowerCase();
		const itemMatch = inventoryEngine.getActorInventory(actorId)
			.map((item) => ({ item, score: normalizedAction.includes(String(item.name || '').toLowerCase()) ? String(item.name || '').length : 0 }))
			.filter((entry) => entry.score > 0)
			.sort((a, b) => b.score - a.score)[0]?.item;
		// `read` is an information-seeking action, not an implicit item/capability use request.
		// Treating bare reads as unknown item use causes benign text such as "re-read the note"
		// to enter novel-capability synthesis and be rejected as CHARACTER_INCOMPATIBLE.
		// Explicit item-use verbs remain strict and still require a canonical inventory match.
		const itemUseRequested = /\b(use|consume|drink|eat|apply|activate)\b/i.test(cleanAction);
		const checkOrHazardRequested = /\b(hide|sneak|search|inspect|investigate|climb|jump|dodge|evade|resist|persuade|deceive|intimidate|swim|fall|fell|falling|trap|poison|gas|fumes|debris|collapse)\b/i.test(cleanAction);
		const explicitCapabilitySyntax = /\b(cast|activate|invoke|channel|release)\b/i.test(cleanAction);
		const preCandidate =
			owned.find((cap) => typeof cap?.name === 'string' && normalizedAction.includes(cap.name.toLowerCase())) ||
			capabilityCandidateFromWorld(world, cleanAction);
		const ambiguousLanguage =
			/\b(that|this|it|something|somehow|maybe|try something|figure it out|do something)\b/i.test(cleanAction) &&
			!preCandidate &&
			!itemMatch;
		const compoundAction = /\b(then|after that|and then|followed by|while)\b|[,;]\s*(?:then|and|while)\b/i.test(cleanAction);
		const semanticNoveltyRequested =
			!preCandidate &&
			(
				simulator.isCapabilityLikeRequest(cleanAction) ||
				(compoundAction && /\b(create|make|turn|combine|shape|freeze|burn|break|seal|open|enhance|alter|manipulate)\b/i.test(cleanAction))
			);
		const helperDecision = decideAiHelperNeed({
			hasCanonicalCapability: Boolean(preCandidate),
			itemKnown: Boolean(itemMatch),
			requiresCheckOrHazardInterpretation: checkOrHazardRequested,
			explicitCapabilitySyntax,
			unknownUseTarget: itemUseRequested && !itemMatch,
			ambiguousLanguage,
			compoundAction,
			semanticNoveltyRequested,
		});
		const aiCallBudget = new AiCallBudget(helperDecision.mode);
		let intent = deterministicIntent(cleanAction);
		let capabilityIntent = Boolean(preCandidate);
		let resolutionHint: ActionResolutionHint | undefined;

		const applyIntentResult = (result: { text: string; source: string }) => {
			const p = json<any>(result.text);
			if (p) {
				intent = {
					baseAction: p.baseAction,
					intent: p.intent,
					requestedEffects: Array.isArray(p.requestedEffects) ? p.requestedEffects.map(String) : [],
					modifiers: Array.isArray(p.modifiers) ? p.modifiers.map(String) : [],
					target: typeof p.target === 'string' ? p.target : undefined,
					confidence: Number.isFinite(p.confidence) ? Math.max(0, Math.min(1, p.confidence)) : 0.8,
					source: result.source === 'DETERMINISTIC_FALLBACK' ? 'DETERMINISTIC_FALLBACK' : 'AI',
				};
				const hint = p.resolutionHint;
				if (hint && typeof hint === 'object') {
					resolutionHint = {
						item: hint.item && typeof hint.item === 'object' && hint.item.requested
							? { requested: true, itemName: typeof hint.item.itemName === 'string' ? hint.item.itemName : undefined, amount: Number.isFinite(Number(hint.item.amount)) ? Math.max(1, Math.trunc(Number(hint.item.amount))) : undefined }
							: undefined,
						check: hint.check && typeof hint.check === 'object' && ['ABILITY_CHECK', 'SAVING_THROW', 'NONE'].includes(String(hint.check.kind))
							? { kind: hint.check.kind, skillId: typeof hint.check.skillId === 'string' ? hint.check.skillId : undefined, ability: typeof hint.check.ability === 'string' ? hint.check.ability : undefined }
							: undefined,
						hazard: hint.hazard && typeof hint.hazard === 'object' && ['FALL', 'TRAP', 'DEBRIS', 'POISON', 'FIRE', 'OTHER'].includes(String(hint.hazard.type))
							? { type: hint.hazard.type, distanceFeet: Number.isFinite(Number(hint.hazard.distanceFeet)) ? Math.max(0, Number(hint.hazard.distanceFeet)) : undefined }
							: undefined,
					};
				}
			}
			return p;
		};

		const runIntentHelper = async (role: AiHelperRole, purpose: string, extraContext: Record<string, unknown> = {}) => {
			const result = await this.runTask(
				'intent.interpret',
				JSON.stringify({
					action: cleanAction,
					purpose,
					character: run?.protagonist?.identity?.name,
					scene: sceneContext || {},
					knownItem: itemMatch ? { name: itemMatch.name, quantity: itemMatch.quantity, charges: itemMatch.charges } : undefined,
					...extraContext,
				}),
				'RETURN ONLY JSON: {"baseAction":"...","intent":"...","capabilityIntent":true|false,"requestedEffects":[],"modifiers":[],"target":"","confidence":0..1,"resolutionHint":{"item":{"requested":true,"itemName":"","amount":1},"check":{"kind":"ABILITY_CHECK|SAVING_THROW|NONE","skillId":"","ability":""},"hazard":{"type":"FALL|TRAP|DEBRIS|POISON|FIRE|OTHER","distanceFeet":0}}}. Use hints only to identify what the canonical engine should resolve. Never invent ownership, HP, damage, DC, dice, costs, or success. Hazard distance is valid only when explicitly stated in action or scene. For repair, correct only the semantic interpretation using the supplied canonical validation result.',
				{ timeoutMs: role === 'SEMANTIC_REPAIR' ? 5000 : 4500, maxTokens: 350, validateResponse: (text: string) => { const p = json<any>(text); return p && typeof p.baseAction === 'string' && typeof p.intent === 'string' ? { valid: true } : { valid: false, errorReason: 'Invalid intent schema.' }; } },
				aiCallBudget,
				role,
			);
			const parsed = applyIntentResult(result);
			telemetry.push({ task: 'intent.interpret', helperRole: role, modelId: result.modelId, providerId: result.providerId, source: result.source, attempts: result.attempts });
			return { result, parsed };
		};

		if (helperDecision.strategy !== 'NONE') {
			try {
				const initial = await runIntentHelper('INTENT_INTERPRET', 'INITIAL_INTERPRETATION');
				if (helperDecision.strategy === 'INTERPRET_SYNTHESIZE_AND_REPAIR') {
					capabilityIntent = true;
				} else {
					capabilityIntent = initial.result.source === 'DETERMINISTIC_FALLBACK'
						? simulator.isCapabilityLikeRequest(cleanAction)
						: Boolean(initial.parsed?.capabilityIntent);
					const firstInterpretationNeedsRepair =
						intent.confidence < 0.65 ||
						(checkOrHazardRequested && !resolutionHint?.check && !resolutionHint?.hazard);
					if (firstInterpretationNeedsRepair) {
						await runIntentHelper('SEMANTIC_REPAIR', 'SEMANTIC_REPAIR', {
							previousInterpretation: intent,
						previousResolutionHint: resolutionHint,
						});
					}
				}
			} catch {
				capabilityIntent = helperDecision.strategy === 'INTERPRET_SYNTHESIZE_AND_REPAIR'
					? true
					: Boolean(preCandidate) || simulator.isCapabilityLikeRequest(cleanAction);
			}
		} else {
			capabilityIntent = Boolean(preCandidate);
		}
		const candidate = preCandidate;
		// Explicit ownership/canonical world matches always enter capability resolution.
		// Otherwise, the LLM intent interpretation is the primary classifier. The
		// deterministic capability regex is only the fallback when intent AI fails.
		const capabilityLike = Boolean(candidate) || capabilityIntent;
		let research: UnifiedActionPipelineResult['research'] = {required:false,brief:'',facts:[],sources:[],source:'NOT_REQUIRED'};
		if (capabilityLike && !candidate) {
			try {
				const researchResult = WorkingContextEngine.researchForAction({
					storyId,
					playerAction: cleanAction,
					viewerActorId: actorId,
					worldRepo: this.repository,
					hardTokenBudget: 900,
				});
				research = {
					required: researchResult.required,
					brief: researchResult.brief,
					facts: researchResult.facts,
					sources: researchResult.sources,
					source: 'DETERMINISTIC_FALLBACK',
				};
			} catch {
				// Capability-only previews may have no established geography. Do not fabricate
				// scene research; continue through canonical capability simulation with empty research.
				research = {
					required: false,
					brief: 'No canonical scene research is available for this preview.',
					facts: [],
					sources: [],
					source: 'DETERMINISTIC_FALLBACK',
				};
			}
		}
		let synthesized: CapabilityDefinition | undefined;
		if (capabilityLike && !candidate && capabilityIntent && helperDecision.strategy === 'INTERPRET_SYNTHESIZE_AND_REPAIR') {
			try {
				const result = await this.runTask(
					'capability.synthesize',
					JSON.stringify({
						action: cleanAction,
						intent,
						research,
						character: run?.protagonist,
						world,
						ownedCapabilities: owned.map((c) => ({ id: c.id, name: c.name, description: c.description })),
					}),
					'Return ONLY JSON describing one proposal with name, category, activationMode, powerTier, costs, description, targetType, rangeScope, actionType. It is never a grant and must use canonical research only as evidence.',
					{
						timeoutMs: 10000,
						maxTokens: 850,
						validateResponse: (text: string) => {
							const p = json<any>(text);
							return p && typeof p.name === 'string' && typeof p.description === 'string'
								? { valid: true }
								: { valid: false, errorReason: 'Invalid capability proposal schema.' };
						},
					},
					aiCallBudget,
					'CAPABILITY_SYNTHESIZE',
				);
				const p = json<any>(result.text);
				if (p) synthesized = { ...p, id: 'proposal_' + storyId + '_' + actorId, provenance: 'AI_GENERATED' };
				telemetry.push({ task: 'capability.synthesize', modelId: result.modelId, providerId: result.providerId, source: result.source, attempts: result.attempts });
			} catch {}
		}
		let finalCandidate: CapabilityDefinition | undefined = candidate || synthesized;
		const progressionState=this.repository.getCharacterProgressionEngine(storyId).getState(actorId);
		const progressionPolicy=capabilityEngine.getProgressionPolicy();
		const rulesProfile=this.repository.getRulesProfile(storyId);
		const customRules=world?new (await import('../domain/customRuleEngine')).CustomRuleEngine().getRules(this.repository as any,storyId):[];
		let simulation=simulator.simulate(cleanAction,{actorId,character:run?.protagonist,world:world||{title:'Current World',dndRulesMode:rulesProfile?.mode||'FULL_DND'},rulesProfile,progressionPolicy,progressionState:{...progressionState,maxCharacterLevel:progressionPolicy.maxLevel},customRules,powerState:capabilityEngine.getPowerState(actorId),ownedCapabilities:owned,skillInstances:capabilityEngine.getActorSkillInstances(actorId),allWorldCapabilities:[...((world?.canonicalCapabilities||[]) as CapabilityDefinition[]),...((world?.capabilities||[]) as CapabilityDefinition[])],environment:{}},finalCandidate);
		let alternativeCapability: CapabilityDefinition | undefined;
		const repairableStatuses = new Set(['UNSUPPORTED_REQUEST', 'CURRENTLY_BLOCKED', 'CHARACTER_INCOMPATIBLE', 'ALTERNATE_ROUTE']);
		if (
			helperDecision.strategy === 'INTERPRET_SYNTHESIZE_AND_REPAIR' &&
			!candidate &&
			synthesized &&
			repairableStatuses.has(simulation.status)
		) {
			try {
				const result = await this.runTask(
					'capability.synthesize',
					JSON.stringify({
						mode: 'SEMANTIC_REPAIR',
						requestedAction: cleanAction,
						intent,
						failedProposal: synthesized,
						validation: simulation,
						research,
						character: run?.protagonist,
						world,
					}),
					'RETURN ONLY JSON describing one repaired capability proposal. Preserve the player intent, but correct the failed mechanism. Proposal only; never invent ownership, success, HP, damage, DC, dice, or resource outcomes.',
					{
						timeoutMs: 10000,
						maxTokens: 850,
						validateResponse: (text: string) => {
							const p = json<any>(text);
							return p && typeof p.name === 'string' && typeof p.description === 'string'
								? { valid: true }
								: { valid: false, errorReason: 'Invalid repaired capability schema.' };
						},
					},
					aiCallBudget,
					'SEMANTIC_REPAIR',
				);
				const p = json<any>(result.text);
				if (p) {
					const repaired = { ...p, id: 'proposal_repair_' + storyId + '_' + actorId, provenance: 'AI_GENERATED' } as CapabilityDefinition;
					const repairedSimulation = simulator.simulate(cleanAction, { actorId, character: run?.protagonist, world: world || { title: 'Current World', dndRulesMode: rulesProfile?.mode || 'FULL_DND' }, rulesProfile, progressionPolicy, progressionState: { ...progressionState, maxCharacterLevel: progressionPolicy.maxLevel }, customRules, powerState: capabilityEngine.getPowerState(actorId), ownedCapabilities: owned, skillInstances: capabilityEngine.getActorSkillInstances(actorId), allWorldCapabilities: [...((world?.canonicalCapabilities || []) as CapabilityDefinition[]), ...((world?.capabilities || []) as CapabilityDefinition[])], environment: {} }, repaired);
					if (!repairableStatuses.has(repairedSimulation.status)) {
						finalCandidate = repaired;
						synthesized = repaired;
						simulation = repairedSimulation;
					}
				}
				telemetry.push({ task: 'capability.synthesize', helperRole: 'SEMANTIC_REPAIR', modelId: result.modelId, providerId: result.providerId, source: result.source, attempts: result.attempts });
			} catch {}
		}

		if (
			helperDecision.strategy === 'INTERPRET_SYNTHESIZE_AND_REPAIR' &&
			!candidate &&
			finalCandidate &&
			repairableStatuses.has(simulation.status)
		) {
			try {
				const result = await this.runTask(
					'capability.synthesize',
					JSON.stringify({
						mode: 'ALTERNATIVE_MECHANISM',
						requestedAction: cleanAction,
						intent,
						research,
						requestedCapability: finalCandidate,
						simulation,
						character: run?.protagonist,
						world,
					}),
					'RETURN ONLY JSON describing one alternative capability that can achieve a coherent approximation of the repaired intent while respecting the character, world, and rules. It must be meaningfully different from the unavailable proposal and is a proposal only.',
					{
						timeoutMs: 12000,
						maxTokens: 850,
						validateResponse: (text: string) => {
							const p = json<any>(text);
							return p && typeof p.name === 'string' && typeof p.description === 'string'
								? { valid: true }
								: { valid: false, errorReason: 'Invalid alternative capability schema.' };
						},
					},
					aiCallBudget,
					'ALTERNATIVE_SYNTHESIZE',
				);
				const p = json<any>(result.text);
				if (p) {
					alternativeCapability = { ...p, id: 'proposal_alt_' + storyId + '_' + actorId, provenance: 'AI_GENERATED' };
					const alternativeSimulation = simulator.simulate(cleanAction, { actorId, character: run?.protagonist, world: world || { title: 'Current World', dndRulesMode: rulesProfile?.mode || 'FULL_DND' }, rulesProfile, progressionPolicy, progressionState: { ...progressionState, maxCharacterLevel: progressionPolicy.maxLevel }, customRules, powerState: capabilityEngine.getPowerState(actorId), ownedCapabilities: owned, skillInstances: capabilityEngine.getActorSkillInstances(actorId), allWorldCapabilities: [...((world?.canonicalCapabilities || []) as CapabilityDefinition[]), ...((world?.capabilities || []) as CapabilityDefinition[])], environment: {} }, alternativeCapability);
					if (!repairableStatuses.has(alternativeSimulation.status)) {
						finalCandidate = alternativeCapability;
						simulation = alternativeSimulation;
					}
				}
				telemetry.push({ task: 'capability.synthesize', helperRole: 'ALTERNATIVE_SYNTHESIZE', modelId: result.modelId, providerId: result.providerId, source: result.source, attempts: result.attempts });
			} catch {}
		}

		const rules: UnifiedActionPipelineResult['rules'] =
			simulation.status === 'WORLD_FORBIDDEN' || simulation.worldAllowed === false
				? { status:'BLOCK', reason:simulation.explanation, source:'DETERMINISTIC' }
				: simulation.status === 'UNSUPPORTED_REQUEST'
					? { status:'REVIEW', reason:'No capability mechanism was identified; use normal action resolution.', source:'DETERMINISTIC' }
					: { status:'PASS', reason:simulation.explanation, source:'DETERMINISTIC' };

		const ruleAnalysis = capabilityLike
			? 'Canonical rules profile and deterministic capability simulation are authoritative. No advisory rules-model call was used.'
			: '';

		const explanation = capabilityLike
			? [rules.reason, research.brief ? 'Relevant canonical context was retrieved deterministically.' : ''].filter(Boolean).join(' ')
			: rules.reason;

		let tacticalContext: UnifiedActionPipelineResult['tacticalContext']={required:false,source:'NOT_REQUIRED'};
		if (Boolean(this.repository.getCombatEngine(storyId).getCurrentActor()) && capabilityLike) {
			tacticalContext = {
				required: true,
				plan: simulation.explanation || 'Use the canonical combat engine to resolve the action.',
				source: 'DETERMINISTIC_FALLBACK',
			};
		}
		const tacticalDirective = tacticalContext?.required
			? ' Tactical context: ' + (tacticalContext.plan || 'No tactical plan was produced; keep the canonical action outcome authoritative.')
			: '';
		return {
			actionText:cleanAction,
			intent,
			resolutionHint,
			capabilityIntent,
			research,
			capability:finalCandidate,
			alternativeCapability,
			simulation,
			rules,
			explanation,
			ruleAnalysis,
			tacticalContext,
			narrationDirective: rules.status==='PASS'
				? ('Describe only the canonical outcome after resolution. Intent: '+intent.intent+'. Requested effects: '+intent.requestedEffects.join(', ')+'. Mechanical result: '+simulation.explanation+'. Capability explanation: '+explanation+'. Research context: '+research.brief+'. Rule analysis context: '+ruleAnalysis+'.'+tacticalDirective)
				: ('Explain the canonical rejection/block without inventing success. '+explanation+'. Research context: '+research.brief+'. Rule analysis context: '+ruleAnalysis+'.'+tacticalDirective),
			telemetry,
			aiCallPolicy: aiCallBudget.snapshot(),
			helperDecision: {
				strategy: helperDecision.strategy,
				reason: helperDecision.reason,
			},
		};
	}
}