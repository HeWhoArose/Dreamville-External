import type { WorldRepository } from '../repositories/worldRepository';
import type { CapabilityDefinition } from '../domain/capabilityEngine';
import { CapabilitySimulationEngine, type CapabilitySimulationResult } from '../domain/capabilitySimulationEngine';
import type { TaskId } from '../domain/aiOrchestrator';
import { getAiTaskContract } from '../domain/aiTaskContracts';

export interface UnifiedActionPipelineResult {
	actionText: string;
	intent: { baseAction: string; intent: string; requestedEffects: string[]; modifiers: string[]; target?: string; confidence: number; source: 'AI' | 'DETERMINISTIC_FALLBACK' };
	research: { required: boolean; brief: string; facts: string[]; source: 'AI' | 'DETERMINISTIC_FALLBACK' | 'NOT_REQUIRED' };
	capability?: CapabilityDefinition;
	alternativeCapability?: CapabilityDefinition;
	simulation: CapabilitySimulationResult;
	rules: { status: 'PASS' | 'BLOCK' | 'REVIEW'; reason: string; source: 'DETERMINISTIC' | 'AI_ASSISTED' };
	explanation: string;
	ruleAnalysis?: string;
	tacticalContext?: { required: boolean; plan?: string; source: 'AI' | 'DETERMINISTIC_FALLBACK' | 'NOT_REQUIRED' };
	narrationDirective: string;
	telemetry: Array<{ task: TaskId; modelId: string; providerId: string; source: string; attempts: number }>;
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

	private async runTask(task: TaskId, prompt: string, systemInstruction: string, options: any = {}) {
		const result = await this.repository.getAiOrchestrator().executeTaskGeneration(task, prompt, systemInstruction, {
			timeoutMs: options.timeoutMs ?? getAiTaskContract(task).defaultTimeoutMs,
			maxTokens: options.maxTokens ?? getAiTaskContract(task).defaultMaxTokens,
			contextTokens: Math.min(12000, Math.max(0, Math.ceil(prompt.length / 4))),
			validateResponse: options.validateResponse,
		});
		return result;
	}

	public async resolveAction(storyId: string, actionText: string, sceneContext?: Record<string, unknown>): Promise<UnifiedActionPipelineResult> {
		const cleanAction = String(actionText || '').trim();
		const run = this.repository.getStoryRun(storyId);
		const player = this.repository.getPlayerLifecycle(storyId);
		const actorId = player?.actorId || run?.protagonist?.characterId || ('player_actor_' + storyId);
		const world = run?.worldId ? this.repository.getWorldTemplate(run.worldId) : undefined;
		const capabilityEngine = this.repository.getCapabilityEngine(storyId);
		const owned = capabilityEngine.getEffectiveActorCapabilities(actorId, this.repository.getInventoryEngine(storyId));
		const simulator = new CapabilitySimulationEngine();
		const telemetry: UnifiedActionPipelineResult['telemetry'] = [];
		let intent = deterministicIntent(cleanAction);
		try {
			const result = await this.runTask('intent.interpret', JSON.stringify({ action: cleanAction, character: run?.protagonist?.identity?.name, scene: sceneContext || {} }), 'Return ONLY JSON: {"baseAction":"...","intent":"...","requestedEffects":[],"modifiers":[],"target":"","confidence":0..1}. Do not adjudicate mechanics.', { timeoutMs: 4500, maxTokens: 700, validateResponse: (text: string) => { const p=json<any>(text); return p && typeof p.baseAction==='string' && typeof p.intent==='string' ? {valid:true}:{valid:false,errorReason:'Invalid intent schema.'}; } });
			const p=json<any>(result.text);
			if(p) intent={ baseAction:p.baseAction, intent:p.intent, requestedEffects:Array.isArray(p.requestedEffects)?p.requestedEffects.map(String):[], modifiers:Array.isArray(p.modifiers)?p.modifiers.map(String):[], target:typeof p.target==='string'?p.target:undefined, confidence:Number.isFinite(p.confidence)?Math.max(0,Math.min(1,p.confidence)):0.8, source:result.source==='DETERMINISTIC_FALLBACK'?'DETERMINISTIC_FALLBACK':'AI' };
			telemetry.push({task:'intent.interpret',modelId:result.modelId,providerId:result.providerId,source:result.source,attempts:result.attempts});
		} catch {}
		const candidate = owned.find((cap) => typeof cap?.name === 'string' && cleanAction.toLowerCase().includes(cap.name.toLowerCase())) || capabilityCandidateFromWorld(world, cleanAction);
		const capabilityLike = simulator.isCapabilityLikeRequest(cleanAction, candidate);
		let research: UnifiedActionPipelineResult['research'] = {required:false,brief:'',facts:[],source:'NOT_REQUIRED'};
		if (capabilityLike && !candidate || /research|study|investigate|ancient|lore|unknown|how does|is it possible/i.test(cleanAction)) {
			research={required:true,brief:'Research remains advisory evidence until explicitly qualified and promoted.',facts:[],source:'DETERMINISTIC_FALLBACK'};
			try {
				const result=await this.runTask('research.query',JSON.stringify({query:cleanAction,world:{title:world?.title,description:world?.description,rules:world?.worldRules||world?.customRules||[]},instruction:'Advisory only; do not mutate canon.'}),'Return ONLY JSON: {"brief":"...","facts":["..."]}. Never claim generated facts are canonical.',{timeoutMs:8000,maxTokens:1200,validateResponse:(text:string)=>{const p=json<any>(text);return p&&typeof p.brief==='string'&&Array.isArray(p.facts)?{valid:true}:{valid:false,errorReason:'Invalid research schema.'};}});
				const p=json<any>(result.text); if(p) research={required:true,brief:p.brief,facts:p.facts.map(String).slice(0,12),source:result.source==='DETERMINISTIC_FALLBACK'?'DETERMINISTIC_FALLBACK':'AI'};
				telemetry.push({task:'research.query',modelId:result.modelId,providerId:result.providerId,source:result.source,attempts:result.attempts});
			} catch {}
		}
		let synthesized: CapabilityDefinition | undefined;
		if(capabilityLike && !candidate) {
			try {
				const result=await this.runTask('capability.synthesize',JSON.stringify({action:cleanAction,intent,research,character:run?.protagonist,world,ownedCapabilities:owned.map(c=>({id:c.id,name:c.name,description:c.description}))}),'Return ONLY JSON describing one proposal with name, category, activationMode, powerTier, costs, description, targetType, rangeScope, actionType. It is never a grant.',{timeoutMs:12000,maxTokens:1600,validateResponse:(text:string)=>{const p=json<any>(text);return p&&typeof p.name==='string'&&typeof p.description==='string'?{valid:true}:{valid:false,errorReason:'Invalid capability proposal schema.'};}});
				const p=json<any>(result.text); if(p) synthesized={...p,id:'proposal_'+storyId+'_'+actorId,provenance:'AI_GENERATED'};
				telemetry.push({task:'capability.synthesize',modelId:result.modelId,providerId:result.providerId,source:result.source,attempts:result.attempts});
			} catch {}
		}
		const finalCandidate=candidate||synthesized;
		const progressionState=this.repository.getCharacterProgressionEngine(storyId).getState(actorId);
		const progressionPolicy=capabilityEngine.getProgressionPolicy();
		const rulesProfile=this.repository.getRulesProfile(storyId);
		const customRules=world?new (await import('../domain/customRuleEngine')).CustomRuleEngine().getRules(this.repository as any,storyId):[];
		const simulation=simulator.simulate(cleanAction,{actorId,character:run?.protagonist,world:world||{title:'Current World',dndRulesMode:rulesProfile?.mode||'FULL_DND'},rulesProfile,progressionPolicy,progressionState:{...progressionState,maxCharacterLevel:progressionPolicy.maxLevel},customRules,powerState:capabilityEngine.getPowerState(actorId),ownedCapabilities:owned,skillInstances:capabilityEngine.getActorSkillInstances(actorId),allWorldCapabilities:[...((world?.canonicalCapabilities||[]) as CapabilityDefinition[]),...((world?.capabilities||[]) as CapabilityDefinition[])],environment:{}},finalCandidate);
		let alternativeCapability: CapabilityDefinition | undefined;
		if (
			capabilityLike &&
			finalCandidate &&
			(simulation.status === 'CHARACTER_INCOMPATIBLE' || simulation.status === 'ALTERNATE_ROUTE')
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
					'Return ONLY JSON describing one alternative capability that can achieve a coherent approximation of the requested intent while respecting the character, world, and rules. It must be meaningfully different from the unavailable capability and is a proposal only.',
					{
						timeoutMs: 12000,
						maxTokens: 1600,
						validateResponse: (text: string) => {
							const p = json<any>(text);
							return p && typeof p.name === 'string' && typeof p.description === 'string'
								? { valid: true }
								: { valid: false, errorReason: 'Invalid alternative capability schema.' };
						},
					},
				);
				const p = json<any>(result.text);
				if (p) {
					alternativeCapability = {
						...p,
						id: 'proposal_alt_' + storyId + '_' + actorId,
						provenance: 'AI_GENERATED',
					};
				}
				telemetry.push({
					task: 'capability.synthesize',
					modelId: result.modelId,
					providerId: result.providerId,
					source: result.source,
					attempts: result.attempts,
				});
			} catch {}
		}

		const rules: UnifiedActionPipelineResult['rules']=simulation.status==='WORLD_FORBIDDEN'||simulation.worldAllowed===false?{status:'BLOCK',reason:simulation.explanation,source:'DETERMINISTIC'}:simulation.status==='UNSUPPORTED_REQUEST'?{status:'REVIEW',reason:'No capability mechanism was identified; use normal action resolution.',source:'DETERMINISTIC'}:{status:'PASS',reason:simulation.explanation,source:'DETERMINISTIC'};
		let ruleAnalysis = '';
		if (capabilityLike) {
			try {
				const result = await this.runTask(
					'rules.analyze',
					JSON.stringify({
						action: cleanAction,
						intent,
						research,
						simulation,
						worldRules: world?.worldRules || world?.customRules || [],
						rulesProfile,
					}),
					'Return ONLY a concise JSON object {"analysis":"..."}. Analyze applicable rules as advisory context only. Never override deterministic resolution.',
					{
						timeoutMs: 6000,
						maxTokens: 800,
						validateResponse: (text: string) => {
							const p = json<any>(text);
							return p && typeof p.analysis === 'string'
								? { valid: true }
								: { valid: false, errorReason: 'Invalid rule analysis schema.' };
						},
					},
				);
				const p = json<any>(result.text);
				if (p) ruleAnalysis = p.analysis;
				telemetry.push({
					task: 'rules.analyze',
					modelId: result.modelId,
					providerId: result.providerId,
					source: result.source,
					attempts: result.attempts,
				});
			} catch {}
		}
		let explanation=rules.reason;
		if(capabilityLike){
			try{
				const result=await this.runTask(
					'capability.explain',
					JSON.stringify({
						action:cleanAction,
						intent,
						research,
						simulation,
						rules,
						ruleAnalysis,
					}),
					'Explain the canonical result plainly, including why the action is allowed, blocked, or requires progression. Never override or invent mechanics.',
					{timeoutMs:4500,maxTokens:700}
				);
				explanation=result.text||explanation;
				telemetry.push({
					task:'capability.explain',
					modelId:result.modelId,
					providerId:result.providerId,
					source:result.source,
					attempts:result.attempts,
				});
			}catch{}
		}
		let tacticalContext: UnifiedActionPipelineResult['tacticalContext']={required:false,source:'NOT_REQUIRED'};
		if(Boolean(this.repository.getCombatEngine(storyId).getCurrentActor())&&capabilityLike){
			tacticalContext={required:true,source:'DETERMINISTIC_FALLBACK'};
			try{const result=await this.runTask('tactical.reason',JSON.stringify({action:cleanAction,intent,research,rules,ruleAnalysis,simulation,combat:this.repository.getCombatEngine(storyId).getParticipants()}),'Return ONLY JSON {"plan":"..."}. Never invent actors, abilities, positions, or outcomes.',{timeoutMs:6000,maxTokens:900,validateResponse:(text:string)=>{const p=json<any>(text);return p&&typeof p.plan==='string'?{valid:true}:{valid:false,errorReason:'Invalid tactical plan.'};}});const p=json<any>(result.text);if(p)tacticalContext={required:true,plan:p.plan,source:result.source==='DETERMINISTIC_FALLBACK'?'DETERMINISTIC_FALLBACK':'AI'};telemetry.push({task:'tactical.reason',modelId:result.modelId,providerId:result.providerId,source:result.source,attempts:result.attempts});}catch{}
		}
		const tacticalDirective = tacticalContext?.required
			? ' Tactical context: ' + (tacticalContext.plan || 'No tactical plan was produced; keep the canonical action outcome authoritative.')
			: '';
		return {
			actionText:cleanAction,
			intent,
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
		};
	}
}