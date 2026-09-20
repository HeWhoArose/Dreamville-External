import test from 'node:test';
import assert from 'node:assert/strict';
import { StoryCheckEngine } from '../server/domain/storyCheckEngine';
import { StoryCheckConsequenceEngine } from '../server/domain/storyCheckConsequenceEngine';
import { StoryCheckChallengeResolver } from '../server/domain/storyCheckChallengeResolver';
import { ConditionEngine } from '../server/domain/conditionEngine';

const coreStats = {
  level: 1,
  strength: 10,
  dexterity: 12,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
  ac: 10,
  speed: 30,
  hitDice: '1d10',
  hpCurrent: 20,
  hpMax: 20,
};

test('authored challenge overrides inferred save DC and marks the canonical source', () => {
  const engine = new StoryCheckEngine();
  const result = engine.resolve(
    'story_authored_challenge',
    'I walk forward.',
    { coreStats, skills: [], sceneText: 'A trap waits beneath the floorboards.' },
    {
      id: 'trap_spikes',
      label: 'Hidden spike trap',
      sourceType: 'HAZARD',
      sourceId: 'hazard_spikes_01',
      keywords: ['walk forward', 'trap'],
      testType: 'SAVING_THROW',
      savingThrowAbility: 'Dexterity',
      difficultyClass: 18,
      reason: 'Avoid the hidden spikes.',
      triggerReason: 'The authored spike trap requires a reflexive response.',
      provenance: 'world:crypt_01',
    }
  );

  assert.ok(result);
  assert.equal(result!.testType, 'SAVING_THROW');
  assert.equal(result!.difficultyClass, 18);
  assert.equal(result!.challengeId, 'trap_spikes');
  assert.equal(result!.worldTriggered, true);
});

test('failed authored saving throw applies only its declared consequence', () => {
  const checks = new StoryCheckEngine();
  const consequences = new StoryCheckConsequenceEngine();
  const conditions = new ConditionEngine();
  conditions.seedActor('actor_trap', { healthCurrent: 20, healthMax: 20 });

  const challenge = {
    id: 'poison_trap',
    label: 'Poison dart trap',
    sourceType: 'HAZARD' as const,
    sourceId: 'trap_01',
    keywords: ['open the door'],
    testType: 'SAVING_THROW' as const,
    savingThrowAbility: 'Dexterity' as const,
    difficultyClass: 30,
    reason: 'Avoid the dart.',
    triggerReason: 'Opening the trapped door exposes the character to a dart.',
    onFailure: {
      damageFormula: '1d4',
      damageType: 'poison',
      conditions: [{ definitionIdOrName: 'Poisoned', durationSeconds: 60 }],
      summary: 'The dart strikes and toxic venom enters the wound.',
    },
  };

  const check = checks.resolve('story_consequence_failure', 'I open the door.', { coreStats, skills: [] }, challenge);
  assert.ok(check);
  assert.equal(check!.success, false);

  const result = consequences.apply('story_consequence_failure', 'actor_trap', check!, challenge, conditions, 100);
  const state = conditions.getActorState('actor_trap');

  assert.equal(result.applied, true);
  assert.equal(result.branch, 'FAILURE');
  assert.ok(result.damage);
  assert.ok(result.damage!.finalAmount >= 0);
  assert.ok(result.appliedConditions.includes('Poisoned'));
  assert.ok((state?.healthCurrent ?? 20) <= 20);
});

test('successful authored save can use its declared success consequence without invented failure effects', () => {
  const checks = new StoryCheckEngine();
  const consequences = new StoryCheckConsequenceEngine();
  const conditions = new ConditionEngine();
  conditions.seedActor('actor_success', { healthCurrent: 20, healthMax: 20 });

  const challenge = {
    id: 'collapse_escape',
    label: 'Collapsing ceiling',
    sourceType: 'HAZARD' as const,
    sourceId: 'collapse_01',
    keywords: ['move'],
    testType: 'SAVING_THROW' as const,
    savingThrowAbility: 'Dexterity' as const,
    difficultyClass: 1,
    reason: 'Get clear of the collapse.',
    triggerReason: 'The ceiling is falling.',
    onFailure: { damageFormula: '1d6', damageType: 'bludgeoning', summary: 'Falling stone strikes the character.' },
    onSuccess: { damageFormula: '1d6', damageType: 'bludgeoning', damageMultiplier: 0.5, summary: 'The character gets clear, but a fragment still clips them.' },
  };

  const check = checks.resolve('story_consequence_success', 'I move away.', { coreStats, skills: [] }, challenge);
  assert.ok(check);
  assert.equal(check!.success, true);
  const result = consequences.apply('story_consequence_success', 'actor_success', check!, challenge, conditions, 100);

  assert.equal(result.applied, true);
  assert.equal(result.branch, 'SUCCESS');
  assert.match(result.summary, /clips them/);
  assert.ok(result.damageRoll);
  assert.ok(result.damage);
});

test('challenge resolver selects authored capability and returns null when no authored challenge matches', () => {
  const resolver = new StoryCheckChallengeResolver();
  const matched = resolver.resolve({
    actionText: 'I bite the guard.',
    sceneText: 'The guard is close.',
    capabilities: [{
      id: 'cap_venom',
      name: 'Venomous Bite',
      category: 'Biological',
      activationMode: 'immediate',
      powerTier: 'Minor',
      baseEnergyCost: 0,
      baseStrainCost: 0,
      minVesselCapacityRequired: 0,
      description: 'A venomous bite.',
      provenance: 'starter_trait',
      storyCheckChallenges: [{
        id: 'venom_bite_save',
        label: 'Venomous bite',
        sourceType: 'CAPABILITY',
        sourceId: 'cap_venom',
        keywords: ['bite'],
        savingThrowAbility: 'Constitution',
        difficultyClass: 13,
        onFailure: { conditions: [{ definitionIdOrName: 'Poisoned' }] },
      }],
    }],
  });
  assert.ok(matched);
  assert.equal(matched!.id, 'venom_bite_save');

  const none = resolver.resolve({ actionText: 'I sit quietly.', sceneText: 'A calm room.' });
  assert.equal(none, null);
});