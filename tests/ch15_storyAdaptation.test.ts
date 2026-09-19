import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  StoryAdaptationPipeline,
  AdaptationProfile,
} from '../server/domain/storyAdaptation';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';

describe('Challenge 15 — Story Adaptation Pipeline & Canon Divergence Domain Tests', () => {
  let repo: InMemoryWorldRepository;

  const sampleRawText = `
Chapter 1: The Brass Cylinder
Scribe Vael stood in the Whispering Orrery. The dark bronze astrolabe hummed gently as he unsealed the brass cylinder.
High Magus Elakor had explicitly forbidden opening the cylinder before the solstice.
Inside lay a golden parchment inscribed with the Sigil of Aethelgard. Vael picked up his quill to transcribe the glyphs.
  `;

  const defaultProfile: AdaptationProfile = {
    id: 'prof_test_1',
    storyId: 'story_test_1',
    mode: 'Faithful Adaptation',
    canonStrictness: 'Strict',
    divergencePoint: 'Beginning',
    plotGravity: 'Strong',
    playerRole: 'Original Protagonist',
    characterFidelity: 'Strict',
    worldExpansion: 'Moderate',
  };

  beforeEach(() => {
    repo = new InMemoryWorldRepository();
  });

  it('Pipeline Stage 1-9: Executes complete 9-stage adaptation pipeline and creates AdaptedStoryBible', () => {
    const result = StoryAdaptationPipeline.runPipeline(
      'story_test_1',
      'The Brass Cylinder',
      sampleRawText,
      defaultProfile
    );

    assert.strictEqual(result.pipelineState.currentStage, 9);
    assert.strictEqual(result.pipelineState.status, 'COMPLETED');
    assert.strictEqual(result.pipelineState.completedStages.length, 9);

    assert.strictEqual(result.bible.storyId, 'story_test_1');
    assert.strictEqual(result.bible.title, 'The Brass Cylinder');
    assert.ok(result.bible.segments.length > 0);
    assert.ok(result.bible.canonEntities.length > 0);
    assert.ok(result.bible.canonFacts.length > 0);
    assert.ok(result.bible.entryPoints.length > 0);

    assert.ok(result.session.sessionId.includes('session_story_test_1'));
    assert.strictEqual(result.session.status, 'ACTIVE');
  });

  it('Evaluates player action against canon in Strict mode: Rejects direct contradiction', () => {
    const result = StoryAdaptationPipeline.runPipeline(
      'story_test_1',
      'The Brass Cylinder',
      sampleRawText,
      defaultProfile
    );

    // Strict mode evaluation
    const strictProfile: AdaptationProfile = { ...defaultProfile, canonStrictness: 'Strict' };

    const invalidAction = 'I smash the Whispering Orrery into pieces and burn High Magus Elakor';
    const evalResult = StoryAdaptationPipeline.evaluatePlayerActionAgainstCanon(
      invalidAction,
      strictProfile,
      result.bible.canonFacts
    );

    assert.strictEqual(evalResult.allowed, false);
    assert.ok(evalResult.reason.includes('Strict Canon Mode forbids actions that contradict established source canon'));
  });

  it('Evaluates player action in Guided Divergence mode: Creates divergence flag', () => {
    const result = StoryAdaptationPipeline.runPipeline(
      'story_test_1',
      'The Brass Cylinder',
      sampleRawText,
      defaultProfile
    );

    const divergenceProfile: AdaptationProfile = {
      ...defaultProfile,
      mode: 'Guided Divergence',
      canonStrictness: 'Balanced',
    };

    const divergentAction = 'I open the brass cylinder before the solstice defying High Magus Elakor';
    const evalResult = StoryAdaptationPipeline.evaluatePlayerActionAgainstCanon(
      divergentAction,
      divergenceProfile,
      result.bible.canonFacts
    );

    assert.strictEqual(evalResult.allowed, true);
    assert.strictEqual(evalResult.createsDivergence, true);
    assert.ok(evalResult.reason.includes('Guided Divergence initiated'));
  });

  it('Persists and restores adaptation state in WorldRepository and CampaignArchive', () => {
    const storyId = 'story_archive_test';
    const result = StoryAdaptationPipeline.runPipeline(
      storyId,
      'The Brass Cylinder',
      sampleRawText,
      defaultProfile
    );

    repo.seedStory(storyId);
    repo.saveAdaptedStoryBible(storyId, result.bible);
    repo.saveAdaptationProfile(storyId, defaultProfile);
    repo.savePipelineState(storyId, result.pipelineState);
    repo.saveAdaptationSession(storyId, result.session);

    // Verify stored
    assert.strictEqual(repo.getAdaptedStoryBible(storyId)?.title, 'The Brass Cylinder');
    assert.strictEqual(repo.getAdaptationSession(storyId)?.status, 'ACTIVE');

    // Export campaign archive
    const archive = repo.exportCampaignArchive(storyId, 'The Brass Cylinder Campaign');
    assert.ok(archive.partitions['canonical/adaptation.json']);

    // Create fresh repository and restore
    const freshRepo = new InMemoryWorldRepository();
    const restoreResult = freshRepo.restoreCampaignArchive(archive, 'restored_story');

    if (!restoreResult.success) {
      console.error('Restore failed:', restoreResult.errorReason);
    }
    assert.strictEqual(restoreResult.success, true);
    assert.strictEqual(freshRepo.getAdaptedStoryBible('restored_story')?.title, 'The Brass Cylinder');
    assert.strictEqual(freshRepo.getAdaptationSession('restored_story')?.status, 'ACTIVE');
  });

  it('Branch Duplication: Clones adaptation session and story bible to new branch', () => {
    const storyId = 'story_branch_src';
    const result = StoryAdaptationPipeline.runPipeline(
      storyId,
      'The Brass Cylinder',
      sampleRawText,
      defaultProfile
    );

    repo.seedStory(storyId);
    repo.saveAdaptedStoryBible(storyId, result.bible);
    repo.saveAdaptationProfile(storyId, defaultProfile);
    repo.saveAdaptationSession(storyId, result.session);

    const branchRes = repo.duplicateAdaptationBranch(storyId, 'timeline_b', {
      branchTitle: 'Alternate Timeline B',
    });

    assert.strictEqual(branchRes.success, true);
    assert.strictEqual(branchRes.newStoryId, 'story_branch_src_branch_timeline_b');

    const clonedBible = repo.getAdaptedStoryBible('story_branch_src_branch_timeline_b');
    assert.ok(clonedBible);
    assert.ok(clonedBible?.title.includes('Alternate Timeline B'));
  });
});
