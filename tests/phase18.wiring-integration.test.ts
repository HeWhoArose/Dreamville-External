import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { narrativeContinuityEngine } from '../server/domain/narrativeContinuityEngine';
import { researchEvidencePipeline } from '../server/domain/researchEvidence';
import { worldMomentumEngine } from '../server/domain/worldMomentumEngine';
import { NpcAutonomyEngine } from '../server/domain/npcAutonomyEngine';

function seed(storyId = 'phase18_wiring') {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory(storyId);
	return { repository, storyId, actorId: repository.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}` };
}

test('Phase 18 wiring: narrative research persists and exposes plot, plan, momentum and provenance', () => {
	const { repository, storyId, actorId } = seed();
	const runBefore = repository.getStoryRun(storyId);
	const momentum = worldMomentumEngine.advance({
		repository,
		storyId,
		currentSeconds: 120,
		triggeredEvents: [{ id: 'evt_1', name: 'Caravan Arrived' }],
		missedEvents: [],
	});
	assert.equal(momentum.state.pressure, 4);

	researchEvidencePipeline.registerEvidence({
		storyId,
		evidenceId: 'evidence_phase18',
		sourceUri: 'https://example.invalid/source',
		sourceTitle: 'Phase 18 Source',
		claimText: 'A caravan arrived from the western road.',
		qualification: 'QUALIFIED',
		provenance: {
			retrievedAt: new Date(0).toISOString(),
			isGeneratedProposal: false,
		},
		validationStatus: 'PENDING',
	});

	const packet = narrativeContinuityEngine.research(repository, storyId, 'caravan western road', actorId);
	assert.equal(packet.worldMomentum?.pressure, 4);
	assert.ok(packet.researchEvidence?.some((item: any) => item.evidenceId === 'evidence_phase18'));
	assert.ok(packet.causalProvenance);
	assert.equal(repository.getStoryRun(storyId)?.runtimeState?.narrativeResearch?.query, 'caravan western road');
	assert.notEqual(repository.getStoryRun(storyId)?.runtimeState?.narrativeResearch, runBefore?.runtimeState?.narrativeResearch);
});

test('Phase 18 wiring: validated research creates a causal provenance edge into canonical state', () => {
	const { repository, storyId } = seed('phase18_provenance');
	researchEvidencePipeline.registerEvidence({
		storyId,
		evidenceId: 'evidence_promote',
		sourceUri: 'https://example.invalid/source-2',
		sourceTitle: 'Promotion Source',
		claimText: 'The northern gate was opened.',
		qualification: 'QUALIFIED',
		provenance: {
			retrievedAt: new Date(0).toISOString(),
			isGeneratedProposal: false,
		},
		validationStatus: 'PENDING',
		canonicalPromotionTarget: {
			category: 'world_lore',
			subjectEntityId: 'gate_north',
			predicate: 'opened',
			objectValue: 'true',
		},
	});

	const result = researchEvidencePipeline.adjudicateAndPromote(
		'evidence_promote',
		'VALIDATE_AND_PROMOTE',
		storyId,
		repository,
	);
	assert.equal(result.success, true);
	const graph = researchEvidencePipeline.getCausalGraphForStory(storyId);
	assert.ok(Object.values(graph.edges).some((edge) => edge.eventId === 'evidence_promote' && edge.relation === 'DISCOVERED'));
	assert.ok(repository.getKnowledgeFacts(storyId).some((fact) => fact.id === result.factId));
});

test('Phase 18 wiring: NPC autonomy engine remains callable as a decision layer', () => {
	const engine = new NpcAutonomyEngine();
	const state = engine.createState('npc_1', 10);
	state.goals = [{
		id: 'goal_survive',
		description: 'Survive the encounter',
		priority: 90,
		visibility: 'PRIVATE',
		active: true,
	}];
	const decision = engine.decide(state, {
		actorId: 'npc_1',
		availableActions: [{
			id: 'retreat',
			description: 'Retreat to safety',
			baseUtility: 20,
			risk: 5,
		}, {
			id: 'attack',
			description: 'Attack the nearest threat',
			baseUtility: 10,
			risk: 70,
		}],
		knownFactIds: [],
		nowSeconds: 10,
	});
	assert.equal(decision?.actionId, 'retreat');
	assert.equal(state.plan[0]?.action, 'Retreat to safety');
});
