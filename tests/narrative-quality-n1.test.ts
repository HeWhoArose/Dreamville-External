import test from 'node:test';
import assert from 'node:assert/strict';
import { NarrativeQualityContractEngine } from '../server/domain/narrativeQualityContract';
import type { PlayerIntent } from '../server/domain/playerIntentInterpreter';

const intent = (overrides: Partial<PlayerIntent> = {}): PlayerIntent => ({
	action: 'observe',
	interactionMode: 'PASSIVE_OBSERVATION',
	speechIntent: false,
	movementIntent: false,
	observationIntent: true,
	explicitTargets: [],
	impliedTargets: [],
	confidence: 1,
	source: 'DETERMINISTIC',
	originalText: 'I observe the room.',
	...overrides,
});

test('N1 resolves turn-sensitive profiles instead of one universal narration shape', () => {
	assert.equal(NarrativeQualityContractEngine.resolve(intent()).profile, 'MICRO_ACTION');
	assert.equal(NarrativeQualityContractEngine.resolve(intent({ interactionMode: 'DIALOGUE', speechIntent: true, action: 'ask' })).profile, 'DIALOGUE');
	assert.equal(NarrativeQualityContractEngine.resolve(intent({ interactionMode: 'COMBAT', action: 'attack_or_defend' })).profile, 'COMBAT');
	assert.equal(NarrativeQualityContractEngine.resolve(intent({ interactionMode: 'MOVEMENT', movementIntent: true, action: 'move' })).profile, 'MOVEMENT');
});

test('N1 exposes explicit controls and instructions to downstream prompt construction', () => {
	const contract = NarrativeQualityContractEngine.resolve(intent(), { novelty: false, preferredParagraphs: 1, maxParagraphs: 2 });
	const promptContext = NarrativeQualityContractEngine.toPromptContext(contract);
	assert.equal(contract.controls.enabled, true);
	assert.equal(contract.controls.novelty, false);
	assert.match(promptContext, /Narrative Quality Contract v1/);
	assert.match(promptContext, /Turn profile: MICRO_ACTION/);
	assert.doesNotMatch(promptContext, /Avoid repeating recently used/);
	assert.match(promptContext, /Preferred shape: about 1 paragraph/);
});

test('N1 validation enforces only configured hard structural limits', () => {
	const contract = NarrativeQualityContractEngine.resolve(intent(), { maxParagraphs: 2 });
	assert.deepEqual(NarrativeQualityContractEngine.validate('One paragraph.', contract), { valid: true, reasons: [] });
	assert.equal(NarrativeQualityContractEngine.validate('One.\n\nTwo.\n\nThree.', contract).valid, false);
	assert.match(NarrativeQualityContractEngine.validate('One.\n\nTwo.\n\nThree.', contract).reasons[0], /maximum is 2/);
});

test('N1 can be disabled without silently changing caller contracts', () => {
	const contract = NarrativeQualityContractEngine.resolve(intent(), { enabled: false });
	assert.equal(NarrativeQualityContractEngine.toPromptContext(contract), 'Narrative Quality Contract: disabled for this turn.');
	assert.deepEqual(NarrativeQualityContractEngine.validate('', contract), { valid: true, reasons: [] });
});
