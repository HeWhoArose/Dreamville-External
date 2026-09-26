import test from 'node:test';
import assert from 'node:assert/strict';
import { compileProviderNeutralPrompt } from '../src/components/common/imageAssetTypes';
import { getImageAssetSpec, appendImageOutputSpecification } from '../src/data/imageAssetSpecs';
import { calculateImageFitRect } from '../src/utils/imageAssetNormalizer';

test('character portraits have a canonical square target', () => {
  const spec = getImageAssetSpec('character_portrait');
  assert.equal(spec.width, 1024);
  assert.equal(spec.height, 1024);
  assert.equal(spec.aspectRatio, '1:1');
  assert.equal(spec.fitMode, 'contain');
});

test('external prompts include exact dimensions and ratio', () => {
  const prompt = compileProviderNeutralPrompt({
    slotId: 'char_1',
    slotType: 'character_portrait',
    title: 'Vaelen Vance',
    subject: 'Vaelen Vance',
  });
  assert.match(prompt, /1024 × 1024 pixels/);
  assert.match(prompt, /Aspect ratio: 1:1/);
  assert.match(prompt, /character identity poster/i);
  assert.match(prompt, /face, eyes, hairstyle, facial structure/i);
  assert.match(prompt, /not a world poster/i);
  assert.match(prompt, /Fit policy: contain/);
});

test('icon and cover prompts use their slot contracts', () => {
  assert.match(appendImageOutputSpecification('Sword icon', 'equipment'), /1024 × 1024 pixels/);
  assert.match(appendImageOutputSpecification('World cover', 'world_cover'), /1200 × 900 pixels/);
  assert.match(appendImageOutputSpecification('Story cover', 'story_run_cover'), /1280 × 720 pixels/);
});

test('contain mode preserves a tall portrait without cropping', () => {
  const rect = calculateImageFitRect(4000, 6000, 1024, 1024, 'contain');
  assert.equal(Math.round(rect.height), 1024);
  assert.equal(Math.round(rect.width), 683);
  assert.equal(Math.round(rect.x), 171);
  assert.equal(Math.round(rect.y), 0);
});
