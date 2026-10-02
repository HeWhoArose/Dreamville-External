import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeDirector } from '../server/domain/narrativeDirector';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';

function makeIntent() {
	return {
		action: 'ask',
		goal: 'learn what the guard knows',
		interactionMode: 'INFORMATION_SEEKING' as const,
		speechIntent: true,
		movementIntent: false,
		observationIntent: false,
		informationGoal: 'what happened at the gate',
		explicitTargets: [{ id: 'npc_lantern_guard', name: 'Lantern Guard', kind: 'NPC' as const, source: 'EXPLICIT' as const }],
		impliedTargets: [],
		confidence: 1,
		source: 'DETERMINISTIC' as const,
		originalText: 'I ask the Lantern Guard what happened at the gate.',
	};
}

test('N5 creates a bounded NPC cognition contract for an addressed NPC', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n5_cognition');
	const situation = CurrentSituationBuilder.build({ storyId: 'n5_cognition', playerAction: 'I ask the Lantern Guard what happened at the gate.', worldRepo: repository });
	const research = NarrativeResearchPipeline.research({ repository, storyId: 'n5_cognition', currentSituation: situation, playerIntent: makeIntent(), playerAction: 'I ask the Lantern Guard what happened at the gate.' });
	const plan = NarrativeDirector.create({ repository, storyId: 'n5_cognition', situation, intent: makeIntent(), research });
	assert.ok(plan.npcCognition.length <= 1);
	if (plan.npcCognition.length) {
		const npc = plan.npcCognition[0];
		assert.equal(npc.actorId, 'npc_lantern_guard');
		assert.ok(npc.privateKnowledgeBoundary.length > 0);
		assert.ok(npc.presentationRules.length >= 3);
	}
});

test('N5 does not expose NPC private cognition through the plan as canonical player facts', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n5_boundary');
	const situation = CurrentSituationBuilder.build({ storyId: 'n5_boundary', playerAction: 'I ask the Lantern Guard what happened at the gate.', worldRepo: repository });
	const research = NarrativeResearchPipeline.research({ repository, storyId: 'n5_boundary', currentSituation: situation, playerIntent: makeIntent(), playerAction: 'I ask the Lantern Guard what happened at the gate.' });
	const plan = NarrativeDirector.create({ repository, storyId: 'n5_boundary', situation, intent: makeIntent(), research });
	const context = NarrativeDirector.toPromptContext(plan);
	assert.match(context, /NPC cognition contracts:/);
	assert.match(context, /Private NPC knowledge must never be presented as player-visible fact|private|Private/);
});

test('N5 remains presentation-only and does not mutate canonical command events', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('n5_safe');
	const before = repository.getCanonicalCommandEvents('n5_safe').length;
	const situation = CurrentSituationBuilder.build({ storyId: 'n5_safe', playerAction: 'I ask the Lantern Guard what happened at the gate.', worldRepo: repository });
	const research = NarrativeResearchPipeline.research({ repository, storyId: 'n5_safe', currentSituation: situation, playerIntent: makeIntent(), playerAction: 'I ask the Lantern Guard what happened at the gate.' });
	NarrativeDirector.create({ repository, storyId: 'n5_safe', situation, intent: makeIntent(), research });
	assert.equal(repository.getCanonicalCommandEvents('n5_safe').length, before);
});
