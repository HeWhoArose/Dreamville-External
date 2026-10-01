import test from 'node:test';
import assert from 'node:assert/strict';

import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { EntitySceneRelevanceEngine } from '../server/domain/entitySceneRelevance';
import { EpistemicBoundaryEnforcer } from '../server/domain/epistemicBoundary';
import { buildNarrationPrompt } from '../server/domain/narrativePromptBuilder';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { MediaAdapterService } from '../server/services/mediaAdapterService';

test('Phase 22: default seeded story exposes a canonical scene, rumor thread, and visible entity graph', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	repository.seedStory('default_story');
	const player = repository.getPlayerLifecycle('default_story')!;
	const situation = CurrentSituationBuilder.build({ storyId: 'default_story', playerAction: 'I move closer to hear the rumors.', viewerActorId: player.actorId, worldRepo: repository });
	assert.equal(situation.location.id, 'loc_whispering_orrery');
	assert.ok(situation.nearbyEntities.some((entity) => entity.id === 'char_maren'));
	assert.ok(situation.openThreads.some((thread) => /starlight fissure/i.test(thread.title)));
	assert.ok(situation.playerKnowledge.knownFacts.some((fact) => /starlight fissures/i.test(fact.objectValue)));
});

test('Phase 22: explicit entity references outrank incidental recent mentions in scene relevance', () => {
	const situation: any = { player: { actorId: 'player', locationId: 'loc' }, nearbyEntities: [
		{ id: 'guard', name: 'Guard', kind: 'NPC', locationId: 'loc', presence: 'present', isAlive: true, distanceBand: 'SAME_LOCATION', importance: 1, explicitlyReferenced: false, visibleToPlayer: true },
		{ id: 'merchant', name: 'Merchant', kind: 'NPC', locationId: 'loc', presence: 'present', isAlive: true, distanceBand: 'SAME_LOCATION', importance: 0.5, explicitlyReferenced: true, visibleToPlayer: true },
	], activeDialogue: { speakerId: 'guard', speakerName: 'Guard', text: 'State your business.' }, openThreads: [],
		recentTurns: [{ playerAction: 'I ask the guard about the merchant.', narration: '', unresolvedConsequence: '' }] };
	const result = EntitySceneRelevanceEngine.rank(situation, { action: 'ask', interactionMode: 'DIALOGUE', speechIntent: true, movementIntent: false, observationIntent: false, explicitTargets: [], impliedTargets: [], confidence: 1, source: 'DETERMINISTIC', originalText: 'I ask the guard about the merchant.' } as any);
	assert.equal(result[0]?.entityId, 'merchant');
});

test('Phase 22: partial prompt situations fail safe instead of throwing on optional arrays', () => {
	const prompt = buildNarrationPrompt({
		situation: { worldId: 'world', worldTime: 'time', location: { id: 'loc', name: 'Room', regionId: 'region', description: 'A room.' }, player: { actorId: 'player', name: 'Hero', locationId: 'loc' }, nearbyEntities: [], activeDialogue: null, recentTurns: [], currentAction: undefined, plot: { currentArc: 'OPENING', summary: '' }, activeConditions: [], availableInteractions: [], playerKnowledge: { viewerActorId: 'player', knownFacts: [] }, worldFacts: [] } as any,
		intent: { action: 'observe', interactionMode: 'PASSIVE_OBSERVATION', speechIntent: false, movementIntent: false, observationIntent: true, explicitTargets: [], impliedTargets: [], confidence: 1, source: 'DETERMINISTIC', originalText: 'I observe.' } as any,
		research: { blocks: [], promptContext: '', totalTokens: 0 } as any,
		plan: { objective: 'Observe.', immediateSteps: [], informationToReveal: [], entitiesToReact: [], continuityRequirements: [], forbiddenAssumptions: [], stateEffectsExpected: [] } as any,
	});
	assert.match(prompt.prompt, /CURRENT SITUATION/);
});

test('Phase 22: media generation remains presentation-only and fails without canonical mutation', async () => {
	const media = new MediaAdapterService();
	media.setFailureMode('PROVIDER_UNAVAILABLE');
	const result = await media.generateImage({ storyId: 'phase22_media', prompt: 'A current scene.' });
	assert.equal(result.success, false);
	assert.equal(result.isFallback, true);
	assert.match(result.errorReason || '', /PROVIDER_UNAVAILABLE/);
});