export const PHASE15_RULE_MODES = [
	'FULL_DND',
	'HYBRID_DND',
	'CUSTOM_HOMEBREW_DND',
] as const;

export const PHASE15_NARRATIVE_MODES = [
	'PROTAGONIST',
	'SIDE_CHARACTER',
	'FREE_ROAM',
] as const;

export type Phase15RuleMode = typeof PHASE15_RULE_MODES[number];
export type Phase15NarrativeMode = typeof PHASE15_NARRATIVE_MODES[number];

export interface Phase15Scenario {
	id: string;
	rulesMode: Phase15RuleMode;
	narrativeMode: Phase15NarrativeMode;
	criticalBoundaries: string[];
}

export const PHASE15_SCENARIO_MATRIX: Phase15Scenario[] =
	PHASE15_RULE_MODES.flatMap((rulesMode) =>
		PHASE15_NARRATIVE_MODES.map((narrativeMode) => ({
			id: `phase15_${rulesMode.toLowerCase()}_${narrativeMode.toLowerCase()}`,
			rulesMode,
			narrativeMode,
			criticalBoundaries: [
				'canonical-rule-profile',
				'canonical-narrative-profile',
				'epistemic-boundary',
				'canonical-command-routing',
				'persistence-replay',
				'fallback-no-state-mutation',
			],
		}))
	);

export const PHASE15_ACCEPTANCE_GATES = [
	{ id: 'scenario-matrix', title: 'Master scenario matrix', source: 'tests/phase15.master-acceptance.test.ts' },
	{ id: 'rules-narrative-9x', title: 'Nine rules × narrative combinations', source: 'tests/phase15.master-acceptance.test.ts' },
	{ id: 'combat-spells-conditions-death', title: 'Combat, spells, conditions and death', source: 'tests/phase5.*.test.ts + tests/phase6.*.test.ts + tests/conditionEngine.test.ts + tests/deathSaveEngine.test.ts' },
	{ id: 'world-narrative', title: 'World simulation, Free Roam, protagonist and side-character flows', source: 'tests/worldSimulationService.ch10.test.ts + tests/phase2.narrative-profile.test.ts' },
	{ id: 'persistence-migration', title: 'Persistence and migration', source: 'tests/phase13.persistence.test.ts' },
	{ id: 'ai-failure-modes', title: 'AI failure and fallback paths', source: 'tests/phase12.ai-orchestration-runtime.test.ts' },
	{ id: 'deterministic-replay', title: 'Deterministic replay', source: 'tests/phase4.deterministic-rng-replay.test.ts' },
	{ id: 'stress', title: 'Stress / scale probes', source: 'tests/phase15.master-acceptance.test.ts' },
	{ id: 'clean-build-gate', title: 'Type-check / lint / build / complete test gate', source: 'Final external execution gate' },
	{ id: 'repository-audit', title: 'Final repository and clean-room handover audit', source: 'docs/PHASE15_CLEAN_ROOM_HANDOVER.md' },
] as const;

export function getPhase15Scenario(id: string): Phase15Scenario | undefined {
	return PHASE15_SCENARIO_MATRIX.find((scenario) => scenario.id === id);
}

export function getPhase15CoverageSummary(): {
	totalScenarios: number;
	totalGates: number;
	rulesModes: readonly Phase15RuleMode[];
	narrativeModes: readonly Phase15NarrativeMode[];
} {
	return {
		totalScenarios: PHASE15_SCENARIO_MATRIX.length,
		totalGates: PHASE15_ACCEPTANCE_GATES.length,
		rulesModes: PHASE15_RULE_MODES,
		narrativeModes: PHASE15_NARRATIVE_MODES,
	};
}
