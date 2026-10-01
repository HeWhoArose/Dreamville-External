import test from 'node:test';
import assert from 'node:assert/strict';
import { EpistemicBoundaryEnforcer } from '../server/domain/epistemicBoundary';
import { buildNarrationPrompt } from '../server/domain/narrativePromptBuilder';

function situation() {
	return {
		player: { actorId: 'player' },
		playerKnowledge: {
			viewerActorId: 'player',
			knownFacts: [
				{ id: 'known', subjectEntityId: 'guard', predicate: 'wears', objectValue: 'blue cloak' },
			],
		},
		worldFacts: [
			{ id: 'known', subjectEntityId: 'guard', predicate: 'wears', objectValue: 'blue cloak' },
			{ id: 'secret', subjectEntityId: 'guard', predicate: 'hides', objectValue: 'the sealed royal letter' },
		],
	} as any;
}

test('Phase 10 removes research blocks containing unauthorized world truth', () => {
	const input: any = {
		blocks: [
			{ id: 'safe', kind: 'MEMORY', content: 'The guard wears a blue cloak.', estimatedTokens: 8 },
			{ id: 'secret', kind: 'LORE', content: 'The guard hides the sealed royal letter.', estimatedTokens: 10 },
		],
		promptContext: 'safe and secret',
		totalTokens: 18,
	};
	const result = EpistemicBoundaryEnforcer.sanitizeResearch(input, situation());
	assert.equal(result.result.blocks.length, 1);
	assert.equal(result.result.blocks[0].id, 'safe');
	assert.ok(result.report.removedResearchBlockIds.includes('secret'));
});

test('Phase 10 strips unauthorized truth from supporting context lines', () => {
	const result = EpistemicBoundaryEnforcer.sanitizeContext(
		'[authorized] The guard wears a blue cloak.\n[secret] The guard hides the sealed royal letter.',
		situation(),
	);
	assert.match(result.text, /blue cloak/);
	assert.doesNotMatch(result.text, /sealed royal letter/);
	assert.equal(result.report.removedContextLineCount, 1);
});

test('Phase 10 allows a player-known fact through the boundary', () => {
	const result = EpistemicBoundaryEnforcer.sanitizeContext('The guard wears a blue cloak.', situation());
	assert.match(result.text, /blue cloak/);
	assert.equal(result.report.playerSafe, true);
});

test('Phase 10 produces a player-safe situation without private epistemic notes', () => {
	const raw: any = {
		player: { actorId: 'player' },
		worldFacts: [{ id: 'secret', objectValue: 'hidden truth' }],
		activeDialogue: { speakerId: 'guard', speakerName: 'Guard', text: 'Hello', epistemicNote: 'The guard is secretly royal.' },
	};
	const safe = EpistemicBoundaryEnforcer.playerSafeSituation(raw);
	assert.equal((safe as any).worldFacts, undefined);
	assert.equal((safe as any).activeDialogue.epistemicNote, undefined);
	assert.equal((safe as any).worldFactsOmitted, true);
});


test('Phase 10 prevents unauthorized world truth from reaching the narration prompt', () => {
	const prompt = buildNarrationPrompt({
		situation: situation(),
		intent: {
			action: 'observe',
			interactionMode: 'PASSIVE_OBSERVATION',
			speechIntent: false,
			movementIntent: false,
			observationIntent: true,
			explicitTargets: [],
			impliedTargets: [],
			confidence: 1,
			source: 'DETERMINISTIC',
			originalText: 'I look at the guard.',
		} as any,
		research: {
			blocks: [{ id: 'secret', kind: 'LORE', content: 'The guard hides the sealed royal letter.', estimatedTokens: 10 }],
			promptContext: 'The guard hides the sealed royal letter.',
			totalTokens: 10,
		} as any,
		plan: { objective: 'Observe the guard.', immediateSteps: [], informationToReveal: [], entitiesToReact: [], continuityRequirements: [], forbiddenAssumptions: [], stateEffectsExpected: [] } as any,
		workingContext: '[secret] The guard hides the sealed royal letter.',
	}).prompt;
	assert.doesNotMatch(prompt, /sealed royal letter/);
});
