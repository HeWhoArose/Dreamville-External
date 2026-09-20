import test from 'node:test';
import assert from 'node:assert/strict';
import { StoryCheckEngine } from '../server/domain/storyCheckEngine';

test('investigation action produces a canonical d20 skill check', () => {
  const engine = new StoryCheckEngine();
  const result = engine.resolve(
    'story_check_test',
    'I investigate the strange markings on the wall.',
    {
      coreStats: {
        level: 1,
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 16,
        wisdom: 12,
        charisma: 10,
        ac: 10,
        speed: 30,
        hitDice: '1d10',
        hpCurrent: 10,
        hpMax: 10,
      },
      skills: [
        {
          id: 'investigation',
          name: 'Investigation',
          governingAbility: 'Intelligence',
          proficiency: 'PROFICIENT',
          description: 'Investigate clues.',
          provenance: 'PLAYER_CONFIRMED',
        },
      ],
    }
  );

  assert.ok(result);
  assert.equal(result!.skill, 'Investigation');
  assert.equal(result!.ability, 'Intelligence');
  assert.equal(result!.abilityModifier, 3);
  assert.equal(result!.proficiencyBonus, 2);
  assert.equal(result!.totalModifier, 5);
  assert.match(result!.roll.formula, /^1d20[+-]5$/);
  assert.equal(result!.total, result!.roll.total);
  assert.equal(result!.success, result!.criticalSuccess || (!result!.criticalFailure && result!.total >= result!.difficultyClass));
});

test('routine actions do not trigger a skill check', () => {
  const engine = new StoryCheckEngine();
  const result = engine.resolve(
    'story_check_test',
    'I inhale and breathe in the fresh air.',
    {
      coreStats: {
        level: 1,
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
        ac: 10,
        speed: 30,
        hitDice: '1d10',
        hpCurrent: 10,
        hpMax: 10,
      },
      skills: [],
    }
  );

  assert.equal(result, null);
});
