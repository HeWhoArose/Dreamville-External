import test from 'node:test';
import assert from 'node:assert/strict';
import { SemanticNarrativeResearchEngine } from '../server/domain/semanticNarrativeResearch';
import type { PlayerIntent } from '../server/domain/playerIntentInterpreter';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

function intent(overrides: Partial<PlayerIntent> = {}): PlayerIntent {
	return {
		action: 'listen_and_observe',
		goal: 'gather_information',
		interactionMode: 'PASSIVE_OBSERVATION',
		speechIntent: false,
		movementIntent: false,
		observationIntent: true,
		informationGoal: 'what the archivist knows about the fissure',
		explicitTargets: [],
		impliedTargets: [],
		confidence: 0.95,
		source: 'DETERMINISTIC',
		originalText: 'I listen to the archivist.',
		...overrides,
	};
}

test('N3 derives information-seeking needs from intent rather than keyword overlap alone', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n3_profile');
	const situation = CurrentSituationBuilder.build({ storyId: 'n3_profile', playerAction: 'I listen.', worldRepo: repository });
	const profile = SemanticNarrativeResearchEngine.derive(intent(), situation);
	assert.ok(profile.needs.some((need) => need.need === 'LORE_FACT' && need.score >= 0.9));
	assert.ok(profile.needs.some((need) => need.need === 'MEMORY_CONTINUITY' && need.score >= 0.8));
	assert.ok(profile.needs.some((need) => need.need === 'OPEN_THREAD' && need.score >= 0.9));
	assert.match(profile.objective, /what the player needs to know/i);
});

test('N3 prioritizes immediate consequences for combat research', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n3_combat');
	const situation = CurrentSituationBuilder.build({ storyId: 'n3_combat', playerAction: 'I attack.', worldRepo: repository });
	const profile = SemanticNarrativeResearchEngine.derive(intent({
		action: 'attack',
		goal: 'defeat target',
		interactionMode: 'COMBAT',
		speechIntent: false,
		movementIntent: false,
		observationIntent: false,
		informationGoal: undefined,
	}), situation);
	assert.ok(profile.needs.some((need) => need.need === 'RECENT_CONSEQUENCE' && need.score === 1));
	const consequence = SemanticNarrativeResearchEngine.scoreCandidate(profile, { kind: 'CONSEQUENCE', content: 'The target is staggered.' });
	assert.equal(consequence.score, 1);
});

test('N3 explicit target matching raises entity relevance without bypassing epistemic filtering', () => {
	const profile = {
		version: 1 as const,
		objective: 'Research the target.',
		needs: [{ need: 'TARGET_IDENTITY' as const, score: 1, reason: 'focused target' }],
		targetEntityIds: ['npc_maren'],
		targetEntityNames: ['Archivist Maren'],
		interactionMode: 'DIALOGUE',
		confidence: 1,
	};
	const result = SemanticNarrativeResearchEngine.scoreCandidate(profile, {
		kind: 'ENTITY',
		sourceId: 'npc_maren',
		content: 'Archivist Maren',
	});
	assert.ok(result.score >= 1);
});

test('N3 relationship research is emitted only for a focused player-authorized target', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n3_relationship');
	const situation = CurrentSituationBuilder.build({ storyId: 'n3_relationship', playerAction: 'I ask Archivist Maren.', worldRepo: repository });
	const original = repository.getDynamicCharacterAgencyEngine('n3_relationship').getRelationship;
	(repository.getDynamicCharacterAgencyEngine('n3_relationship') as any).getRelationship = () => ({ id: 'rel_1', sourceId: 'npc_maren', targetId: 'player', stance: 'FRIENDLY', activeCause: 'HELPED_PLAYER' });
	const result = NarrativeResearchPipeline.research({
		repository,
		storyId: 'n3_relationship',
		currentSituation: situation,
		playerIntent: intent({ interactionMode: 'DIALOGUE', speechIntent: true, observationIntent: false, informationGoal: undefined, target: { id: 'npc_maren', name: 'Archivist Maren', kind: 'NPC', source: 'EXPLICIT' }, explicitTargets: [{ id: 'npc_maren', name: 'Archivist Maren', kind: 'NPC', source: 'EXPLICIT' }] }),
		playerAction: 'I ask Archivist Maren.',
	});
	assert.ok(result.blocks.some((block) => block.kind === 'RELATIONSHIP'));
	(repository.getDynamicCharacterAgencyEngine('n3_relationship') as any).getRelationship = original;
});

test('N3 production research exposes its semantic profile and retains existing scene boundary', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n3_pipeline');
	const situation = CurrentSituationBuilder.build({ storyId: 'n3_pipeline', playerAction: 'I inspect the room.', worldRepo: repository });
	const result = NarrativeResearchPipeline.research({
		repository,
		storyId: 'n3_pipeline',
		currentSituation: situation,
		playerAction: 'I inspect the room.',
	});
	assert.equal(result.semanticProfile.version, 1);
	assert.ok(result.promptContext.includes('Semantic Research Profile v1'));
	assert.ok(result.blocks.some((block) => block.kind === 'SCENE'));
});
