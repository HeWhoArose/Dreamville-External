import test from 'node:test';
import assert from 'node:assert/strict';

import {
	DynamicCharacterAgencyEngine,
	type CharacterAgencyProfile,
	type RelationshipStance,
} from '../server/domain/dynamicCharacterAgency';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { getCharacterSpeakerTheme } from '../src/components/voiceResolver';

function characterProfile(overrides: Partial<CharacterAgencyProfile> = {}): CharacterAgencyProfile {
	return {
		characterId: 'npc_mira',
		worldId: 'world_alpha',
		name: 'Mira',
		personality: {
			greed: 20,
			jealousy: 10,
			loyalty: 85,
			ambition: 30,
			empathy: 80,
			courage: 70,
			fearfulness: 20,
			vengefulness: 15,
			factionLoyalty: 45,
		},
		motivations: ['protect her companions'],
		goals: [
			{
				goalId: 'goal_protect',
				title: 'Protect the caravan',
				description: 'Keep the caravan alive.',
				priority: 90,
				active: true,
			},
		],
		currentGoalId: 'goal_protect',
		canonicalGoal: 'Protect the caravan.',
		controlState: 'FREE',
		controlEvidenceIds: [],
		role: 'companion',
		surfaceDisposition: 'Warm but cautious.',
		...overrides,
	};
}

function seedStoryRelationship(engine: DynamicCharacterAgencyEngine): void {
	engine.registerCharacter('story_alpha', characterProfile());
	engine.registerCharacter('story_alpha', {
		...characterProfile({
			characterId: 'player',
			name: 'Player',
			worldId: 'world_alpha',
			role: 'protagonist',
			motivations: ['survive'],
			goals: [],
			currentGoalId: undefined,
			canonicalGoal: 'Survive.',
			surfaceDisposition: 'Player',
		}),
	});

	engine.setRelationship('story_alpha', {
		id: 'rel_mira_player',
		worldId: 'world_alpha',
		sourceId: 'npc_mira',
		targetId: 'player',
		trust: 85,
		affection: 90,
		respect: 80,
		fear: 5,
		hostility: 0,
		activeCause: 'INITIAL_BOND',
		history: [],
		lastChangedAtSeconds: 0,
		stance: 'STRONG_FRIEND',
	});
}

test('Phase 16 — friendship can become enmity through a canonical greed betrayal', () => {
	const engine = new DynamicCharacterAgencyEngine();
	seedStoryRelationship(engine);

	const updated = engine.applyRelationshipDelta({
		storyId: 'story_alpha',
		sourceId: 'npc_mira',
		targetId: 'player',
		eventId: 'evt_greed_betrayal_1',
		timestampSeconds: 120,
		cause: 'GREED',
		description: 'Mira chose the valuable relic over her friendship with the player.',
		evidenceIds: ['ev_mira_relic_choice'],
		delta: {
			trust: -50,
			affection: -15,
			respect: -25,
			hostility: 80,
		},
		explicitStance: 'ENEMY',
	});

	assert.equal(updated.stance, 'ENEMY');
	assert.equal(updated.activeCause, 'GREED');
	assert.equal(updated.history.at(-1)?.fromStance, 'STRONG_FRIEND');
	assert.equal(updated.history.at(-1)?.toStance, 'ENEMY');
	assert.deepEqual(updated.history.at(-1)?.evidenceIds, ['ev_mira_relic_choice']);
});

test('Phase 16 — jealousy, faction conflict, circumstance, and player action remain distinct canonical causes', () => {
	const engine = new DynamicCharacterAgencyEngine();
	seedStoryRelationship(engine);

	const causes: Array<[RelationshipStance, import('../server/domain/dynamicCharacterAgency').RelationshipCause]> = [
		['RIVAL', 'JEALOUSY'],
		['ENEMY', 'FACTION_CONFLICT'],
		['STRAINED', 'CIRCUMSTANCE'],
		['ENEMY', 'PLAYER_ACTION'],
	];

	for (const [stance, cause] of causes) {
		const updated = engine.applyRelationshipDelta({
			storyId: 'story_alpha',
			sourceId: 'npc_mira',
			targetId: 'player',
			eventId: 'evt_' + cause.toLowerCase(),
			timestampSeconds: engine.getRelationshipHistory('story_alpha', 'npc_mira', 'player').length + 1,
			cause,
			description: 'Canonical cause test: ' + cause,
			delta: {},
			explicitStance: stance,
		});
		assert.equal(updated.activeCause, cause);
		assert.equal(updated.stance, stance);
	}

	const history = engine.getRelationshipHistory('story_alpha', 'npc_mira', 'player');
	assert.equal(history.length, causes.length);
	assert.deepEqual(history.map((entry) => entry.cause), causes.map((entry) => entry[1]));
});

test('Phase 16 — false information and framing create a belief that can later be corrected', () => {
	const engine = new DynamicCharacterAgencyEngine();
	seedStoryRelationship(engine);

	engine.recordBelief({
		storyId: 'story_alpha',
		characterId: 'npc_mira',
		beliefId: 'belief_player_killed_king',
		proposition: 'player_killed_king',
		believedValue: 'true',
		confidence: 0.92,
		sourceEventIds: ['ev_forged_witness'],
		timestampSeconds: 200,
	});

	engine.applyRelationshipDelta({
		storyId: 'story_alpha',
		sourceId: 'npc_mira',
		targetId: 'player',
		eventId: 'evt_false_accusation',
		timestampSeconds: 200,
		cause: 'FRAMING',
		description: 'Mira turned against the player after accepting forged evidence.',
		evidenceIds: ['ev_forged_witness'],
		delta: {
			trust: -45,
			hostility: 70,
		},
		explicitStance: 'ENEMY',
	});

	const corrected = engine.correctBelief({
		storyId: 'story_alpha',
		characterId: 'npc_mira',
		beliefId: 'belief_player_killed_king',
		eventId: 'evt_truth_revealed',
		timestampSeconds: 500,
		correctedValue: 'false',
		confidence: 0.99,
		evidenceIds: ['ev_real_killer_confession', 'ev_scene_reconstruction'],
		status: 'CORRECTED',
	});

	assert.ok(corrected);
	assert.equal(corrected.status, 'CORRECTED');
	assert.equal(corrected.believedValue, 'false');
	assert.equal(corrected.confidence, 0.99);
	assert.equal(corrected.history.at(-1)?.eventId, 'evt_truth_revealed');
});

test('Phase 16 — friendship can return after exoneration, but not before canonical conditions are met', () => {
	const engine = new DynamicCharacterAgencyEngine();
	seedStoryRelationship(engine);

	engine.setRelationship('story_alpha', {
		id: 'rel_enemy',
		worldId: 'world_alpha',
		sourceId: 'npc_mira',
		targetId: 'player',
		trust: 35,
		affection: 70,
		respect: 60,
		fear: 10,
		hostility: 80,
		activeCause: 'FRAMING',
		history: [],
		lastChangedAtSeconds: 100,
		stance: 'ENEMY',
	});

	assert.equal(engine.canRestoreFriendship('story_alpha', 'npc_mira', 'player'), false);

	engine.applyRelationshipDelta({
		storyId: 'story_alpha',
		sourceId: 'npc_mira',
		targetId: 'player',
		eventId: 'evt_exoneration',
		timestampSeconds: 600,
		cause: 'EVIDENCE_REVEAL',
		description: 'Authoritative evidence proves the player was framed.',
		evidenceIds: ['ev_real_killer', 'ev_forged_witness_exposed'],
		delta: {
			trust: 30,
			hostility: -55,
			respect: 5,
		},
		explicitStance: 'RELUCTANT_ALLY',
	});

	assert.equal(engine.canRestoreFriendship('story_alpha', 'npc_mira', 'player'), true);

	const restored = engine.restoreFriendship({
		storyId: 'story_alpha',
		sourceId: 'npc_mira',
		targetId: 'player',
		eventId: 'evt_reconciliation',
		timestampSeconds: 700,
		evidenceIds: ['ev_real_killer', 'ev_forgiveness'],
		description: 'Mira reconciles with the player after the framing is disproven.',
		trustDelta: 5,
		affectionDelta: 3,
		respectDelta: 3,
	});

	assert.equal(restored.success, true);
	assert.equal(restored.relationship?.stance, 'FRIEND');
	assert.equal(restored.relationship?.activeCause, 'RECONCILIATION');
});

test('Phase 16 — coercion, manipulation, and possession constrain agency without erasing the underlying relationship', () => {
	const engine = new DynamicCharacterAgencyEngine();
	seedStoryRelationship(engine);

	engine.setAgencyControl({
		storyId: 'story_alpha',
		characterId: 'npc_mira',
		eventId: 'evt_hostage_coercion',
		timestampSeconds: 300,
		controlState: 'COERCED',
		controlSourceId: 'faction_hostage_taker',
		evidenceIds: ['ev_hostage_proof'],
	});

	engine.applyRelationshipDelta({
		storyId: 'story_alpha',
		sourceId: 'npc_mira',
		targetId: 'player',
		eventId: 'evt_forced_attack',
		timestampSeconds: 301,
		cause: 'COERCION',
		description: 'Mira attacked while coerced by a threat against her family.',
		evidenceIds: ['ev_hostage_proof'],
		delta: {
			hostility: 40,
		},
		explicitStance: 'ENEMY',
	});

	const coercedGuidance = engine.getNarrativeGuidance('story_alpha', 'npc_mira', 'player');
	assert.equal(coercedGuidance.controlState, 'COERCED');
	assert.ok(coercedGuidance.hiddenRelationshipSignals.some((signal) => signal.includes('externally constrained')));
	assert.equal(engine.deriveNextIntent('story_alpha', 'npc_mira', 'player'), 'OPPOSE_UNDER_INFLUENCE');

	engine.releaseAgencyControl({
		storyId: 'story_alpha',
		characterId: 'npc_mira',
		eventId: 'evt_hostage_release',
		timestampSeconds: 500,
		evidenceIds: ['ev_hostages_safe'],
	});

	assert.equal(engine.getCharacter('story_alpha', 'npc_mira')?.controlState, 'FREE');

	engine.setAgencyControl({
		storyId: 'story_alpha',
		characterId: 'npc_mira',
		eventId: 'evt_possession',
		timestampSeconds: 600,
		controlState: 'POSSESSED',
		controlSourceId: 'curse_shadow',
		evidenceIds: ['ev_possession'],
	});

	assert.equal(engine.deriveNextIntent('story_alpha', 'npc_mira', 'player'), 'OPPOSE_UNDER_INFLUENCE');

	engine.releaseAgencyControl({
		storyId: 'story_alpha',
		characterId: 'npc_mira',
		eventId: 'evt_possession_broken',
		timestampSeconds: 700,
		evidenceIds: ['ev_cleansing'],
	});

	assert.equal(engine.getCharacter('story_alpha', 'npc_mira')?.controlState, 'FREE');
});

test('Phase 16 — canonical NPC intent follows relationship, personality, and active control state', () => {
	const engine = new DynamicCharacterAgencyEngine();
	seedStoryRelationship(engine);

	assert.equal(engine.deriveNextIntent('story_alpha', 'npc_mira', 'player'), 'PROTECT');

	engine.applyRelationshipDelta({
		storyId: 'story_alpha',
		sourceId: 'npc_mira',
		targetId: 'player',
		eventId: 'evt_vengeance',
		timestampSeconds: 100,
		cause: 'VENGEANCE',
		description: 'A grave betrayal creates a persistent desire for vengeance.',
		delta: {
			trust: -60,
			affection: -60,
			respect: -40,
			hostility: 95,
		},
		explicitStance: 'ENEMY',
	});

	assert.equal(engine.deriveNextIntent('story_alpha', 'npc_mira', 'player'), 'CONFRONT');

	const profile = engine.getCharacter('story_alpha', 'npc_mira');
	assert.ok(profile);
	const revengeProfile = {
		...profile!,
		personality: {
			...profile!.personality,
			vengefulness: 90,
		},
	};
	engine.registerCharacter('story_alpha', revengeProfile);
	assert.equal(engine.deriveNextIntent('story_alpha', 'npc_mira', 'player'), 'RETALIATE');
});

test('Phase 16 — malformed or missing persisted agency state falls back safely and deterministically', () => {
	const engine = new DynamicCharacterAgencyEngine();

	engine.importState(undefined);
	assert.equal(engine.getCharacter('story_alpha', 'npc_mira'), null);
	assert.equal(engine.getPlayerFacingGuidance('story_alpha', 'npc_mira', 'player').stance, 'NEUTRAL');

	engine.importState({
		schemaVersion: 1,
		characters: {
			'story_alpha::npc_mira': {
				characterId: 'npc_mira',
				worldId: 'world_alpha',
				name: 'Mira',
				personality: {
					greed: 500,
					fearfulness: -40,
				},
				motivations: ['survive'],
				goals: [],
				controlState: 'not-a-real-control-state',
				role: 'companion',
				surfaceDisposition: 'Cautious.',
			},
		},
		relationships: {
			'story_alpha::npc_mira::player': {
				id: 'rel_1',
				worldId: 'world_alpha',
				sourceId: 'npc_mira',
				targetId: 'player',
				trust: 500,
				affection: -10,
				respect: 50,
				fear: 500,
				hostility: 10,
				activeCause: 'OTHER',
				lastChangedAtSeconds: 0,
				history: [],
			},
		},
		beliefs: {},
	});

	assert.equal(engine.getCharacter('story_alpha', 'npc_mira')?.personality.greed, 100);
	assert.equal(engine.getCharacter('story_alpha', 'npc_mira')?.controlState, 'FREE');
	assert.equal(engine.getRelationship('story_alpha', 'npc_mira', 'player')?.trust, 100);
	assert.equal(engine.getRelationship('story_alpha', 'npc_mira', 'player')?.affection, 0);
	assert.equal(engine.getRelationship('story_alpha', 'npc_mira', 'player')?.fear, 100);
});

test('Phase 16 — repository persists and rehydrates dynamic agency through the existing story runtime state', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase16_persistence_story';

	repository.saveStoryRun({
		storyId,
		id: storyId,
		worldId: 'world_alpha',
		characterName: 'Hero',
		storyMode: 'PROTAGONIST',
		dndRulesMode: 'FULL_DND',
		runtimeState: {},
	});

	const engine = repository.getDynamicCharacterAgencyEngine(storyId);
	engine.registerCharacter('story_alpha', characterProfile());

	// Use the same canonical story key as the stored run for persistence verification.
	engine.registerCharacter(storyId, {
		...characterProfile(),
		characterId: 'npc_persisted',
		name: 'Persisted NPC',
		worldId: 'world_alpha',
	});
	engine.setRelationship(storyId, {
		id: 'rel_persisted',
		worldId: 'world_alpha',
		sourceId: 'npc_persisted',
		targetId: 'player',
		trust: 70,
		affection: 75,
		respect: 65,
		fear: 0,
		hostility: 10,
		activeCause: 'INITIAL_BOND',
		history: [],
		lastChangedAtSeconds: 0,
		stance: 'FRIEND',
	});

	const storedRun = repository.getStoryRun(storyId);
	assert.ok(storedRun?.runtimeState?.characterAgency);
	assert.equal(storedRun.runtimeState.characterAgency.schemaVersion, 1);

	const rehydrated = new InMemoryWorldRepository({ disablePersistence: true });
	rehydrated.saveStoryRun(storedRun);
	const freshEngine = rehydrated.getDynamicCharacterAgencyEngine(storyId);
	assert.equal(freshEngine.getCharacter(storyId, 'npc_persisted')?.name, 'Persisted NPC');
	assert.equal(freshEngine.getRelationship(storyId, 'npc_persisted', 'player')?.stance, 'FRIEND');
});

test('Phase 16 — relationship authority is story-scoped and does not leak between stories', () => {
	const engine = new DynamicCharacterAgencyEngine();
	engine.registerCharacter('story_a', characterProfile({ worldId: 'world_a' }));
	engine.registerCharacter('story_b', characterProfile({ worldId: 'world_b' }));

	engine.setRelationship('story_a', {
		id: 'rel_a',
		worldId: 'world_a',
		sourceId: 'npc_mira',
		targetId: 'player',
		trust: 90,
		affection: 90,
		respect: 90,
		fear: 0,
		hostility: 0,
		activeCause: 'INITIAL_BOND',
		history: [],
		lastChangedAtSeconds: 0,
		stance: 'STRONG_FRIEND',
	});

	assert.equal(engine.getRelationship('story_b', 'npc_mira', 'player'), null);
});

test('Phase 16 — speaker colors remain stable within a world and are world-specific', () => {
	const worldA1 = getCharacterSpeakerTheme('Mira', 'world-a');
	const worldA2 = getCharacterSpeakerTheme('Mira', 'world-a');
	const worldB = getCharacterSpeakerTheme('Mira', 'world-b');

	assert.equal(worldA1.accentHex, worldA2.accentHex);
	assert.notEqual(worldA1.accentHex, worldB.accentHex);
});

test('Phase 16 — speaker colors fall back deterministically when no world is supplied', () => {
	const a = getCharacterSpeakerTheme('Mira');
	const b = getCharacterSpeakerTheme('Mira');
	assert.deepEqual(a, b);
});

test('Phase 16 — narrative guidance keeps hidden causes out of player-facing guidance', () => {
	const engine = new DynamicCharacterAgencyEngine();
	seedStoryRelationship(engine);

	engine.applyRelationshipDelta({
		storyId: 'story_alpha',
		sourceId: 'npc_mira',
		targetId: 'player',
		eventId: 'evt_manipulation',
		timestampSeconds: 50,
		cause: 'MANIPULATION',
		description: 'A manipulator convinced Mira that the player betrayed her.',
		delta: {
			trust: -35,
			hostility: 60,
		},
		explicitStance: 'ENEMY',
	});

	const playerGuidance = engine.getPlayerFacingGuidance('story_alpha', 'npc_mira', 'player');
	assert.equal(playerGuidance.stance, 'ENEMY');
	assert.equal('MANIPULATION' in playerGuidance, false);
	assert.match(playerGuidance.surfaceDisposition, /Warm|cautious/i);

	const narrativeGuidance = engine.getNarrativeGuidance('story_alpha', 'npc_mira', 'player');
	assert.equal(narrativeGuidance.activeCause, 'MANIPULATION');
	assert.ok(narrativeGuidance.hiddenRelationshipSignals.some((signal) => signal.includes('significant')));
});

test('Phase 16 — working context includes canonical NPC relationship and agency guidance for narrative generation', () => {
	const repository = new InMemoryWorldRepository({ disablePersistence: true });
	const storyId = 'phase16_context_story';
	repository.saveStoryRun({
		storyId,
		id: storyId,
		worldId: 'world_alpha',
		characterName: 'Hero',
		storyMode: 'PROTAGONIST',
		dndRulesMode: 'FULL_DND',
		runtimeState: {},
	});

	const agency = repository.getDynamicCharacterAgencyEngine(storyId);
	agency.registerCharacter(storyId, {
		...characterProfile(),
		characterId: 'npc_mira',
		worldId: 'world_alpha',
	});
	agency.setRelationship(storyId, {
		id: 'rel_context',
		worldId: 'world_alpha',
		sourceId: 'npc_mira',
		targetId: 'player',
		trust: 75,
		affection: 70,
		respect: 65,
		fear: 0,
		hostility: 10,
		activeCause: 'INITIAL_BOND',
		history: [],
		lastChangedAtSeconds: 0,
		stance: 'FRIEND',
	});

	const { WorkingContextEngine } = require('../server/domain/workingContextEngine') as typeof import('../server/domain/workingContextEngine');
	const context = WorkingContextEngine.assembleTurnContext({
		storyId,
		viewerActorId: 'player',
		npcTargetId: 'npc_mira',
		worldRepo: repository,
		hardTokenBudget: 1200,
		playerAction: 'Talk to Mira',
	});

	const chunk = context.chunks.find((candidate) => candidate.id === 'b2_dynamic_npc_agency');
	assert.ok(chunk);
	assert.match(chunk!.content, /Relationship stance: FRIEND/);
	assert.match(chunk!.content, /Surface disposition: Warm but cautious\./);
	assert.match(chunk!.content, /hidden relationship causes are canonical context/i);
});

test('Phase 16 — export/import is lossless for canonical agency state', () => {
	const engine = new DynamicCharacterAgencyEngine();
	seedStoryRelationship(engine);
	engine.recordBelief({
		storyId: 'story_alpha',
		characterId: 'npc_mira',
		beliefId: 'belief_test',
		proposition: 'player_is_safe',
		believedValue: 'true',
		confidence: 0.8,
		sourceEventIds: ['ev_belief'],
		timestampSeconds: 44,
	});

	const exported = engine.exportState();
	const restored = new DynamicCharacterAgencyEngine();
	restored.importState(exported);

	assert.deepEqual(restored.exportState(), exported);
});
