import type {
	CustomRuleCondition,
	CustomRuleDefinition,
	CustomRuleEffect,
	CustomRuleEvent,
	CustomRuleEvaluationResult,
	CustomRuleState,
} from '../../src/types';
import type { InMemoryWorldRepository } from '../repositories/worldRepository';
import { captureCanonicalStateSnapshot } from './canonicalSnapshot';
import { Phase8SimulationEngine } from './phase8SimulationEngine';

const MAX_RULES_PER_EVENT = 128;
const phase8SimulationEngine = new Phase8SimulationEngine();
const MAX_EFFECTS_PER_RULE = 32;
const MAX_EVENT_CHAIN_DEPTH = 8;
const MAX_FIRED_EVENT_HISTORY = 2048;

export interface CustomRuleEvaluationContext {
	repository: InMemoryWorldRepository;
	event: CustomRuleEvent;
	depth?: number;
}

export interface CustomRuleValidationResult {
	success: boolean;
	errors: string[];
	warnings: string[];
}

function clone<T>(value: T): T {
	return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function readPath(root: unknown, path: string): unknown {
	if (!path.trim()) return root;
	return path.split('.').reduce<unknown>((current, key) => {
		if (current === null || current === undefined || typeof current !== 'object') return undefined;
		return (current as Record<string, unknown>)[key];
	}, root);
}

function valuesEqual(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function evaluateOperator(operator: CustomRuleCondition['operator'], actual: unknown, expected: unknown): boolean {
	switch (operator) {
		case 'EQ': return valuesEqual(actual, expected);
		case 'NEQ': return !valuesEqual(actual, expected);
		case 'GT': return Number(actual) > Number(expected);
		case 'GTE': return Number(actual) >= Number(expected);
		case 'LT': return Number(actual) < Number(expected);
		case 'LTE': return Number(actual) <= Number(expected);
		case 'CONTAINS':
			return Array.isArray(actual)
				? actual.some((item) => valuesEqual(item, expected))
				: typeof actual === 'string' && actual.includes(String(expected));
		case 'NOT_CONTAINS': return !evaluateOperator('CONTAINS', actual, expected);
		case 'TRUTHY': return Boolean(actual);
		case 'FALSY': return !actual;
		case 'IN': return Array.isArray(expected) && expected.some((item) => valuesEqual(actual, item));
		case 'NOT_IN': return Array.isArray(expected) && !expected.some((item) => valuesEqual(actual, item));
		default: return false;
	}
}

function defaultState(now: number): CustomRuleState {
	return {
		schemaVersion: 1,
		flags: {},
		counters: {},
		values: {},
		activeRuleIds: [],
		capabilityModifiers: {},
		firedEventIds: [],
		updatedAtSeconds: now,
	};
}

export class CustomRuleEngine {
	public validateRule(rule: CustomRuleDefinition): CustomRuleValidationResult {
		const errors: string[] = [];
		const warnings: string[] = [];
		if (!rule?.id?.trim()) errors.push('Rule id is required.');
		if (!rule?.name?.trim()) errors.push('Rule name is required.');
		if (!Number.isInteger(rule?.version) || rule.version < 1) errors.push('Rule version must be a positive integer.');
		if (!Number.isFinite(rule?.priority)) errors.push('Rule priority must be finite.');
		if (!rule?.scope || !['WORLD', 'ACTOR', 'TARGET', 'LOCATION', 'EVENT'].includes(rule.scope)) errors.push('Rule scope is invalid.');
		if (!rule?.trigger?.event?.trim()) errors.push('Rule trigger event is required.');
		if (!Array.isArray(rule?.conditions)) errors.push('Rule conditions must be an array.');
		if (!Array.isArray(rule?.effects)) errors.push('Rule effects must be an array.');
		if ((rule?.effects?.length || 0) > MAX_EFFECTS_PER_RULE) errors.push(`Rule may contain at most ${MAX_EFFECTS_PER_RULE} effects.`);
		if (!rule?.provenance) errors.push('Rule provenance is required.');

		for (const [index, condition] of (rule.conditions || []).entries()) {
			if (!condition?.source || !condition?.path || !condition?.operator) {
				errors.push(`Condition ${index} is incomplete.`);
			}
		}
		for (const [index, effect] of (rule.effects || []).entries()) {
			if (!effect?.type) errors.push(`Effect ${index} has no type.`);
			if (effect?.type === 'INCREMENT_RULE_STATE' && !Number.isFinite(effect.amount)) {
				errors.push(`Effect ${index} has a non-finite increment.`);
			}
			if (effect?.type === 'SET_CAPABILITY_MODIFIER' && !Number.isFinite(effect.value)) {
				errors.push(`Effect ${index} has a non-finite capability modifier.`);
			}
			if ((effect?.type === 'APPLY_CONDITION' || effect?.type === 'REMOVE_CONDITION') && !effect.conditionDefinitionId?.trim()) {
				errors.push(`Effect ${index} requires conditionDefinitionId.`);
			}
		}
		if (rule.trigger.event === 'CUSTOM' && !rule.trigger.eventType) {
			warnings.push('CUSTOM rules should provide trigger.eventType for deterministic routing.');
		}
		return { success: errors.length === 0, errors, warnings };
	}

	public validateRules(rules: CustomRuleDefinition[]): CustomRuleValidationResult {
		const errors: string[] = [];
		const warnings: string[] = [];
		const ids = new Set<string>();
		for (const rule of rules) {
			if (ids.has(rule.id)) errors.push(`Duplicate rule id '${rule.id}'.`);
			ids.add(rule.id);
			const result = this.validateRule(rule);
			errors.push(...result.errors);
			warnings.push(...result.warnings);
		}
		return { success: errors.length === 0, errors, warnings };
	}

	private loadRules(repository: InMemoryWorldRepository, storyId: string): CustomRuleDefinition[] {
		const run = repository.getStoryRun(storyId);
		const world = run?.worldId ? repository.getWorldTemplate(run.worldId) : null;
		const worldRules = Array.isArray(world?.customRules) ? world.customRules : [];
		const protagonistRules = Array.isArray(run?.protagonist?.customRules) ? run.protagonist.customRules : [];
		const characterRules = Array.isArray(run?.customRules) ? run.customRules : [];
		const itemRules: CustomRuleDefinition[] = [];
		if (event.actorId) {
			const inventory = repository.getInventoryEngine(storyId);
			for (const item of [
				...inventory.getInventoryItems(event.actorId),
				...inventory.getEquippedItems(event.actorId),
			]) {
				itemRules.push(...inventory.getCustomRulesForItem(item.id));
			}
		}
		const commandItemRules = Array.isArray(event.payload?.command?.itemCustomRules)
			? event.payload.command.itemCustomRules
			: [];
		const byId = new Map<string, CustomRuleDefinition>();
		for (const rule of [...worldRules, ...protagonistRules, ...characterRules, ...itemRules, ...commandItemRules]) {
			if (rule?.id) byId.set(rule.id, clone(rule));
		}
		return Array.from(byId.values());
	}

	private loadState(repository: InMemoryWorldRepository, storyId: string, now: number): CustomRuleState {
		const run = repository.getStoryRun(storyId);
		const state = run?.runtimeState?.customRules;
		return state && typeof state === 'object'
			? {
				...defaultState(now),
				...clone(state),
				flags: { ...defaultState(now).flags, ...(state.flags || {}) },
				counters: { ...defaultState(now).counters, ...(state.counters || {}) },
				values: { ...defaultState(now).values, ...(state.values || {}) },
				activeRuleIds: Array.isArray(state.activeRuleIds) ? [...state.activeRuleIds] : [],
				capabilityModifiers: clone(state.capabilityModifiers || {}),
				firedEventIds: Array.isArray(state.firedEventIds) ? [...state.firedEventIds] : [],
				updatedAtSeconds: Number.isFinite(state.updatedAtSeconds) ? state.updatedAtSeconds : now,
			}
			: defaultState(now);
	}

	private saveState(repository: InMemoryWorldRepository, storyId: string, state: CustomRuleState): void {
		const run = repository.getStoryRun(storyId) || { storyId, id: storyId, runtimeState: {} };
		run.runtimeState = {
			...(run.runtimeState || {}),
			customRules: clone(state),
		};
		repository.saveStoryRun(run);
	}

	private resolveConditionSource(
		condition: CustomRuleCondition,
		event: CustomRuleEvent,
		state: CustomRuleState,
		repository: InMemoryWorldRepository,
	): unknown {
		switch (condition.source) {
			case 'EVENT': return readPath(event, condition.path);
			case 'RULE_STATE': return readPath(state, condition.path);
			case 'ACTOR': return readPath(repository.getEntityCard(event.storyId, event.actorId || ''), condition.path);
			case 'TARGET': return readPath(repository.getEntityCard(event.storyId, event.targetId || ''), condition.path);
			case 'WORLD_FACT': {
				const facts = repository.getWorldFacts(event.storyId);
				const match = facts.find((fact: any) =>
					fact?.factId === condition.path ||
					fact?.id === condition.path ||
					fact?.predicate === condition.path
				);
				return match;
			}
			case 'KNOWLEDGE': {
				const state = phase8SimulationEngine.load(repository, event.storyId);
				const knowledge = event.actorId ? state.knowledge[event.actorId] : undefined;
				return condition.path ? knowledge?.facts[condition.path] : knowledge;
			}
			case 'RELATIONSHIP': {
				const state = phase8SimulationEngine.load(repository, event.storyId);
				const key = event.actorId && event.targetId ? `${event.actorId}::${event.targetId}` : '';
				return key ? readPath(state.consequences.relationships[key], condition.path) : undefined;
			}
			case 'ITEM':
				return readPath(
					event.payload?.items ??
					event.payload?.command?.item ??
					event.payload?.result?.itemBefore ??
					event.payload?.result?.definition,
					condition.path
				);
			case 'LOCATION_STATE': {
				const state = phase8SimulationEngine.load(repository, event.storyId);
				const facility = event.locationId ? state.facilities[event.locationId] : undefined;
				return readPath(facility, condition.path);
			}
			case 'TIME': return readPath({ timestampSeconds: event.timestampSeconds, hour: Math.floor(event.timestampSeconds / 3600) % 24 }, condition.path);
			case 'DOMAIN': return readPath(event.payload?.domains, condition.path);
			default: return undefined;
		}
	}

	private conditionsMatch(
		rule: CustomRuleDefinition,
		event: CustomRuleEvent,
		state: CustomRuleState,
		repository: InMemoryWorldRepository,
	): boolean {
		return rule.conditions.every((condition) => {
			const actual = this.resolveConditionSource(condition, event, state, repository);
			const matched = evaluateOperator(condition.operator, actual, condition.value);
			return condition.negate ? !matched : matched;
		});
	}

	private triggerMatches(rule: CustomRuleDefinition, event: CustomRuleEvent): boolean {
		const trigger = rule.trigger;
		const triggerEvent = trigger.eventType || trigger.event;
		if (triggerEvent !== event.type && trigger.event !== event.type) return false;
		if (trigger.capabilityId && trigger.capabilityId !== event.capabilityId) return false;
		if (trigger.subjectEntityId && trigger.subjectEntityId !== event.actorId && trigger.subjectEntityId !== event.targetId) return false;
		if (trigger.actionKeywords?.length) {
			const text = String(event.actionText || '').toLowerCase();
			if (!trigger.actionKeywords.some((keyword) => text.includes(keyword.toLowerCase()))) return false;
		}
		return true;
	}

	private async applyEffect(
		effect: CustomRuleEffect,
		context: CustomRuleEvaluationContext,
		state: CustomRuleState,
	): Promise<void> {
		const { repository, event } = context;
		if (['APPLY_DAMAGE','MODIFY_RESOURCE','CREATE_ENTITY','DESTROY_ENTITY','MOVE_ENTITY','TELEPORT','ALTER_WORLD_FACT','CREATE_MISSION','MODIFY_MISSION','CREATE_EVIDENCE','CHANGE_RELATIONSHIP','ADD_KNOWLEDGE','REMOVE_KNOWLEDGE','SCHEDULE_EVENT'].includes(effect.type)) {
			phase8SimulationEngine.applyRuleEffect(repository, event.storyId, event.eventId, event.timestampSeconds, effect, event.actorId, event.targetId);
			return;
		}
		switch (effect.type) {
			case 'SET_RULE_STATE':
				state.values[effect.key] = clone(effect.value);
				if (typeof effect.value === 'boolean') state.flags[effect.key] = effect.value;
				break;
			case 'INCREMENT_RULE_STATE': {
				const current = Number(state.counters[effect.key] ?? state.values[effect.key] ?? 0);
				let next = current + effect.amount;
				if (effect.min !== undefined) next = Math.max(effect.min, next);
				if (effect.max !== undefined) next = Math.min(effect.max, next);
				state.counters[effect.key] = next;
				state.values[effect.key] = next;
				break;
			}
			case 'SET_WORLD_FACT': {
				const existing = repository.getWorldFacts(event.storyId).find((fact: any) =>
					fact?.subjectEntityId === effect.subjectEntityId && fact?.predicate === effect.predicate
				);
				const fact = {
					...(existing || {}),
					factId: existing?.factId || `rule_fact_${event.storyId}_${effect.subjectEntityId}_${effect.predicate}`,
					statement: existing?.statement || `${effect.subjectEntityId} ${effect.predicate} ${effect.objectValue}`,
					subjectEntityId: effect.subjectEntityId,
					predicate: effect.predicate,
					objectValue: effect.objectValue,
					truthState: effect.truthState || 'TRUE',
					confidence: effect.confidence ?? 1,
					provenanceSummary: effect.provenanceSummary || 'custom_rule',
					acquiredAtTimestamp: repository.getWorldClock(event.storyId).getTimestamp(),
				};
				repository.saveWorldFact(event.storyId, fact);
				break;
			}
			case 'INVERT_WORLD_FACT': {
				const facts = repository.getWorldFacts(event.storyId);
				const existing = facts.find((fact: any) => fact?.subjectEntityId === effect.subjectEntityId && fact?.predicate === effect.predicate);
				if (!existing) throw new Error(`Cannot invert missing world fact '${effect.subjectEntityId}/${effect.predicate}'.`);
				existing.truthState = existing.truthState === 'TRUE' ? 'FALSE' : existing.truthState === 'FALSE' ? 'TRUE' : 'UNKNOWN';
				repository.saveWorldFact(event.storyId, { ...existing });
				break;
			}
			case 'APPLY_CONDITION': {
				const actorId = this.resolveActorId(effect.target, effect.actorId, event);
				if (!actorId) throw new Error('APPLY_CONDITION could not resolve a target actor.');
				const condEngine = repository.getConditionEngine(event.storyId);
				const def = condEngine.getDefinition(effect.conditionDefinitionId);
				if (!def) {
					throw new Error(`Condition definition '${effect.conditionDefinitionId}' not found.`);
				}
				const result = condEngine.applyCondition(actorId, {
					definitionIdOrName: effect.conditionDefinitionId,
					durationSeconds: effect.durationSeconds,
					intensity: effect.intensity,
					nowSeconds: event.timestampSeconds,
					source: `custom_rule:${event.eventId}`,
				});
				if (!result.applied && !result.immune) throw new Error(result.reason || 'Condition application failed.');
				break;
			}
			case 'REMOVE_CONDITION': {
				const actorId = this.resolveActorId(effect.target, effect.actorId, event);
				if (!actorId) throw new Error('REMOVE_CONDITION could not resolve a target actor.');
				repository.getConditionEngine(event.storyId).removeCondition(actorId, effect.conditionDefinitionId);
				break;
			}
			case 'SET_CAPABILITY_MODIFIER': {
				const actorId = effect.actorId || event.actorId;
				if (!actorId) throw new Error('SET_CAPABILITY_MODIFIER requires actorId or an event actor.');
				const actorModifiers = state.capabilityModifiers[actorId] ||= {};
				const capabilityModifiers = actorModifiers[effect.capabilityId] ||= {};
				capabilityModifiers[effect.modifier] = effect.value;
				break;
			}
			case 'CLEAR_CAPABILITY_MODIFIER': {
				const actorId = effect.actorId || event.actorId;
				if (!actorId) throw new Error('CLEAR_CAPABILITY_MODIFIER requires actorId or an event actor.');
				delete state.capabilityModifiers[actorId]?.[effect.capabilityId]?.[effect.modifier];
				break;
			}
			case 'ENABLE_RULE':
				if (!state.activeRuleIds.includes(effect.ruleId)) state.activeRuleIds.push(effect.ruleId);
				break;
			case 'DISABLE_RULE':
				state.activeRuleIds = state.activeRuleIds.filter((id) => id !== effect.ruleId);
				break;
			default:
				throw new Error(`Unsupported custom-rule effect '${(effect as any).type}'.`);
		}
	}

	private resolveActorId(
		target: Extract<CustomRuleEffect, { type: 'APPLY_CONDITION' | 'REMOVE_CONDITION' }>['target'],
		explicitActorId: string | undefined,
		event: CustomRuleEvent,
	): string | undefined {
		if (target === 'EXPLICIT' || target === 'ACTOR' || target === 'TARGET') return explicitActorId || (target === 'ACTOR' ? event.actorId : target === 'TARGET' ? event.targetId : undefined);
		if (target === 'EVENT_ACTOR') return event.actorId;
		if (target === 'EVENT_TARGET') return event.targetId;
		return undefined;
	}

	public async evaluate(context: CustomRuleEvaluationContext): Promise<CustomRuleEvaluationResult> {
		const depth = context.depth ?? 0;
		const { repository, event } = context;
		if (depth > MAX_EVENT_CHAIN_DEPTH) {
			return { success: false, eventId: event.eventId, matchedRuleIds: [], appliedRuleIds: [], emittedWarnings: [], errorReason: 'Custom-rule event chain depth exceeded.' };
		}

		const state = this.loadState(repository, event.storyId, event.timestampSeconds);
		if (state.firedEventIds.includes(event.eventId)) {
			return { success: true, eventId: event.eventId, matchedRuleIds: [], appliedRuleIds: [], emittedWarnings: ['Event was already evaluated by custom rules.'] };
		}

		const rules = this.loadRules(repository, event.storyId)
			.filter((rule) => rule.enabled || state.activeRuleIds.includes(rule.id))
			.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
		const validation = this.validateRules(rules);
		if (!validation.success) {
			return { success: false, eventId: event.eventId, matchedRuleIds: [], appliedRuleIds: [], emittedWarnings: validation.warnings, errorReason: validation.errors.join(' ') };
		}

		const candidates = rules.filter((rule) => this.triggerMatches(rule, event));
		if (candidates.length > MAX_RULES_PER_EVENT) {
			return { success: false, eventId: event.eventId, matchedRuleIds: [], appliedRuleIds: [], emittedWarnings: [], errorReason: 'Custom-rule event exceeded the per-event rule budget.' };
		}

		const matchedRuleIds: string[] = [];
		const appliedRuleIds: string[] = [];
		const warnings = [...validation.warnings];
		const before = captureCanonicalStateSnapshot(event.storyId, repository);
		try {
			for (const rule of candidates) {
				if (!this.conditionsMatch(rule, event, state, repository)) continue;
				matchedRuleIds.push(rule.id);
				for (const effect of rule.effects) {
					await this.applyEffect(effect, context, state);
				}
				appliedRuleIds.push(rule.id);
			}

			state.firedEventIds = [...state.firedEventIds, event.eventId].slice(-MAX_FIRED_EVENT_HISTORY);
			state.updatedAtSeconds = event.timestampSeconds;
			this.saveState(repository, event.storyId, state);
			return { success: true, eventId: event.eventId, matchedRuleIds, appliedRuleIds, emittedWarnings: warnings };
		} catch (error) {
			repository.restoreCanonicalStateSnapshot(before, { persist: false, preserveCanonicalEvents: true });
			return {
				success: false,
				eventId: event.eventId,
				matchedRuleIds: [],
				appliedRuleIds: [],
				emittedWarnings: warnings,
				errorReason: error instanceof Error ? error.message : String(error),
			};
		}
	}

	public getState(repository: InMemoryWorldRepository, storyId: string): CustomRuleState {
		return this.loadState(repository, storyId, repository.getWorldClock(storyId).getTimestamp().totalElapsedSeconds);
	}

	public getRules(repository: InMemoryWorldRepository, storyId: string): CustomRuleDefinition[] {
		return this.loadRules(repository, storyId).map((rule) => clone(rule));
	}

	public validateSingleRule(rule: CustomRuleDefinition): CustomRuleValidationResult {
		return this.validateRule(rule);
	}

	public validateRuleSet(rules: CustomRuleDefinition[]): CustomRuleValidationResult {
		return this.validateRules(rules);
	}
}
