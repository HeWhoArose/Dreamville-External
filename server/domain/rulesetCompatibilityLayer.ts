export interface RulesetCompatibilityRule {
	id: string;
	sourceRulesetId: string;
	targetRulesetId: string;
	description: string;
	condition: Record<string, unknown>;
	effect: Record<string, unknown>;
	priority: number;
	enabled: boolean;
}

export interface RuntimeRuleContext {
	worldRulesetId: string;
	importedRulesetIds: string[];
	activeCompatibilityRuleIds: string[];
}

export class RulesetCompatibilityLayer {
	private rules: RulesetCompatibilityRule[] = [];

	public register(rule: RulesetCompatibilityRule): void {
		if (!rule.id || !rule.sourceRulesetId || !rule.targetRulesetId) throw new Error('Compatibility rule requires id and both ruleset ids.');
		this.rules = this.rules.filter((r) => r.id !== rule.id);
		this.rules.push(JSON.parse(JSON.stringify(rule)));
		this.rules.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
	}

	public buildContext(worldRulesetId: string, importedRulesetIds: string[]): RuntimeRuleContext {
		const imported = new Set(importedRulesetIds);
		const active = this.rules
			.filter((r) => r.enabled && r.targetRulesetId === worldRulesetId && imported.has(r.sourceRulesetId))
			.map((r) => r.id);
		return { worldRulesetId, importedRulesetIds: [...imported].sort(), activeCompatibilityRuleIds: active };
	}

	public getActiveRules(context: RuntimeRuleContext): RulesetCompatibilityRule[] {
		const ids = new Set(context.activeCompatibilityRuleIds);
		return this.rules.filter((r) => ids.has(r.id)).map((r) => JSON.parse(JSON.stringify(r)));
	}

	public exportState(): RulesetCompatibilityRule[] {
		return JSON.parse(JSON.stringify(this.rules));
	}

	public importState(rules: RulesetCompatibilityRule[]): void {
		this.rules = [];
		for (const rule of rules || []) this.register(rule);
	}
}
