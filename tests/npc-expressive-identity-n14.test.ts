import test from 'node:test';
import assert from 'node:assert/strict';

import { NpcExpressiveIdentityEngine } from '../server/domain/npcExpressiveIdentity';
import { NarrativeDirector } from '../server/domain/narrativeDirector';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import { NarrativeResearchPipeline } from '../server/domain/narrativeResearchPipeline';
import { PlayerIntentInterpreter } from '../server/domain/playerIntentInterpreter';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

function makeProfile(overrides: any = {}) {
	return {
		characterId: 'npc-1',
		name: 'Maren',
		personality: {
			greed: 10,
			jealousy: 10,
			loyalty: 80,
			ambition: 70,
			empathy: 80,
			courage: 60,
			fearfulness: 20,
			vengefulness: 25,
			factionLoyalty: 70,
		},
		traits: ['Pragmatic', 'Vigilant', 'Warm'],
		values: ['Duty'],
		motivations: [],
		fears: [],
		desires: [],
		dialogueStyle: 'Measured and concise, formal, dry wit.',
		goals: [],
		controlState: 'FREE',
		controlEvidenceIds: [],
		surfaceDisposition: 'Measured and observant.',
		...overrides,
	} as any;
}

test('N14 projects expressive identity from existing authoritative character data without mutating it', () => {
	const before = JSON.stringify(makeProfile());
	const identity = NpcExpressiveIdentityEngine.project({
		characterId: 'npc-1',
		name: 'Maren',
		profile: makeProfile(),
		actorRole: 'WATCH CAPTAIN',
	});
	assert.equal(JSON.stringify(makeProfile()), before);
	assert.equal(identity.cadence, 'MEASURED');
	assert.equal(identity.sentenceLength, 'SHORT');
	assert.equal(identity.vocabularyFormality, 'FORMAL');
	assert.equal(identity.humorStyle, 'DRY');
	assert.ok(identity.physicalMannerismCues.some((cue) => /monitor/i.test(cue)));
	assert.deepEqual(identity.verbalTics, []);
	assert.equal(identity.expiresAfterNarration, true);
});

test('N14 keeps two characters expressively distinct from different existing signals', () => {
	const quiet: any = makeProfile({
		characterId: 'npc-quiet',
		name: 'Quiet',
		traits: ['Stoic', 'Reserved'],
		values: ['Order'],
		dialogueStyle: 'Terse, quiet, formal.',
		personality: { ...makeProfile().personality, fearfulness: 75, empathy: 35, courage: 45 },
	});
	const playful: any = makeProfile({
		characterId: 'npc-playful',
		name: 'Playful',
		traits: ['Warm', 'Playful'],
		values: ['Freedom'],
		dialogueStyle: 'Casual, conversational, playful and witty.',
		personality: { ...makeProfile().personality, fearfulness: 15, empathy: 75, courage: 75 },
	});
	const a = NpcExpressiveIdentityEngine.project({ characterId: 'npc-quiet', name: 'Quiet', profile: quiet });
	const b = NpcExpressiveIdentityEngine.project({ characterId: 'npc-playful', name: 'Playful', profile: playful });
	assert.notEqual(a.cadence, b.cadence);
	assert.notEqual(a.sentenceLength, b.sentenceLength);
	assert.notEqual(a.vocabularyFormality, b.vocabularyFormality);
	assert.notEqual(a.humorStyle, b.humorStyle);
	assert.notDeepEqual(a.responseProfile, b.responseProfile);
});

test('N14 fallback is conservative when expressive authoring is absent', () => {
	const identity = NpcExpressiveIdentityEngine.project({
		characterId: 'npc-sparse',
		name: 'Sparse',
		profile: makeProfile({
			dialogueStyle: undefined,
			traits: [],
			values: [],
		}),
	});
	assert.equal(identity.cadence, 'MEASURED');
	assert.equal(identity.sentenceLength, 'MIXED');
	assert.equal(identity.vocabularyFormality, 'PLAIN');
	assert.equal(identity.humorStyle, 'NONE');
	assert.deepEqual(identity.favoritePhrases, []);
	assert.deepEqual(identity.verbalTics, []);
	assert.match(identity.fallbackReason || '', /do not invent/i);
	assert.equal(identity.identityConfidence, 0.45);
});

test('N14 reaches the real NPC cognition prompt through the existing NarrativeDirector path', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'n14_prompt_integration';
	repository.seedStory(storyId);
	const action = 'I ask the Lantern Guard what happened at the gate.';
	const initial = CurrentSituationBuilder.build({ storyId, playerAction: action, worldRepo: repository });
	const intent = PlayerIntentInterpreter.deterministic(action, initial);
	const situation = CurrentSituationBuilder.build({ storyId, playerAction: action, currentAction: intent, worldRepo: repository });
	const research = NarrativeResearchPipeline.research({ repository, storyId, currentSituation: situation, playerIntent: intent, playerAction: action });
	const plan = NarrativeDirector.create({ repository, storyId, situation, intent, research });
	assert.ok(plan.npcCognition?.length);
	const cognition = plan.npcCognition?.[0];
	assert.ok(cognition?.expressiveIdentity);
	const prompt = NarrativeDirector.toPromptContext(plan);
	assert.match(prompt, /expressiveIdentity/);
	assert.match(prompt, /identityConfidence/);
	assert.match(prompt, /responseProfile/);
});
