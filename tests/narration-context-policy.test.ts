import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveNarrationContextNeeds } from '../server/domain/narrationContextPolicy';

test('ordinary narration does not request health, inventory, or lore context', () => {
	const needs = deriveNarrationContextNeeds({
		actionText: 'I walk toward the archway.',
		committedOutcome: 'The stone passage remains open.',
	});

	assert.equal(needs.includeHealth, false);
	assert.equal(needs.includeInventory, false);
	assert.equal(needs.includeCapabilities, false);
	assert.equal(needs.includeLore, false);
	assert.equal(needs.includeCombat, false);
	assert.equal(needs.maxRecentTurns, 1);
});

test('hazard narration requests health context', () => {
	const needs = deriveNarrationContextNeeds({
		actionText: 'I jump from the ledge.',
		committedOutcome: 'The fall causes blunt impact damage.',
	});

	assert.equal(needs.includeHealth, true);
});

test('item interaction does not require full inventory unless explicitly queried', () => {
	const needs = deriveNarrationContextNeeds({
		actionText: 'I take the ancient scroll and hide.',
	});

	assert.equal(needs.includeInventory, false);
	assert.equal(needs.includeLore, true);
	assert.equal(needs.includeHealth, false);
});

test('NPC dialogue requests relationship context', () => {
	const needs = deriveNarrationContextNeeds({
		actionText: 'I ask the archivist what happened here.',
		npcTargetId: 'npc_archivist',
	});

	assert.equal(needs.includeRelationships, true);
	assert.equal(needs.maxRecentTurns, 2);
});

test('combat requests combat and health context', () => {
	const needs = deriveNarrationContextNeeds({
		actionText: 'I strike the enemy with my staff.',
		isInCombat: true,
	});

	assert.equal(needs.includeCombat, true);
	assert.equal(needs.includeHealth, false);
});
