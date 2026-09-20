import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorldSynthesisService } from '../server/services/worldSynthesisService';

describe('World Creation Slice 1F - Fixture-Free Fallback & Premise Faithfulness', () => {
  it('synthesizes a glass-themed premise without high fantasy demo contamination', async () => {
    const service = new WorldSynthesisService();
    const world = await service.synthesizeWorldFromPremise({
      naturalLanguagePremise: 'A world made of glass.',
      title: '',
      genreTags: ['Cyberpunk'],
      toneTags: ['Sleek'],
      mediumTags: ['Novel']
    });

    assert.ok(world);
    assert.ok(world.title && world.title.length > 0);
    
    const serialized = JSON.stringify(world);
    assert.ok(!serialized.includes('Whispering Orrery'));
    assert.ok(!serialized.includes('Scribes of the Astral Prism'));
    assert.ok(!serialized.includes('Maren'));
    assert.ok(!serialized.includes('Age of Divine Resonance'));
  });

  it('synthesizes a plant-themed premise faithfully', async () => {
    const service = new WorldSynthesisService();
    const world = await service.synthesizeWorldFromPremise({
      naturalLanguagePremise: 'A world overrun by giant sentient plants.',
      title: '',
      genreTags: ['Steampunk'],
      toneTags: ['Wild'],
      mediumTags: ['Game']
    });

    assert.ok(world);
    assert.ok(world.title && world.title.length > 0);
    
    const serialized = JSON.stringify(world);
    assert.ok(!serialized.includes('Whispering Orrery'));
    assert.ok(!serialized.includes('Scribes of the Astral Prism'));
  });
});
