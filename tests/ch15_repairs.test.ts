import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { StoryAdaptationPipeline } from '../server/domain/storyAdaptation';
import { worldRepository } from '../server/repositories/worldRepository';
import { AdaptationProfile } from '../src/types';

describe('CH15 Surgical Repairs Verification Suite', () => {
  const sampleRawText = `
Chapter 1: Arrival at Lantern Vault

A wax-sealed invitation arrived at dawn requiring immediate attention. The Grand Arcane Academy stood silently under starlight.

***

Chapter 2: The Interruption

An unusual structural anomaly halted operations at midnight. The Archmage pondered the broken seal.
  `.trim();

  beforeEach(() => {
    // Clear repository state before each test
  });

  describe('DEF-CH15-01: Backward Compatibility Methods', () => {
    it('restores ingestAndSegment with expected return contract', () => {
      const result = StoryAdaptationPipeline.ingestAndSegment(
        'test_story_01',
        'Test Story Title',
        sampleRawText
      );

      assert.ok('document' in result);
      assert.ok('segments' in result);
      assert.strictEqual(result.document.title, 'Test Story Title');
      assert.ok(result.segments.length > 0);
      assert.strictEqual(result.segments[0].chapterTitle, 'Chapter 1: Arrival at Lantern Vault');
    });

    it('restores extractAndNormalize with expected story bible return contract', () => {
      const { segments } = StoryAdaptationPipeline.ingestAndSegment(
        'test_story_02',
        'Test Title',
        sampleRawText
      );

      const defaultProfile: AdaptationProfile = {
        id: 'prof_strict',
        storyId: 'test_story_02',
        mode: 'Faithful Adaptation',
        canonStrictness: 'Strict',
        divergencePoint: 'Beginning',
        plotGravity: 'Strong',
        playerRole: 'Original Protagonist',
        characterFidelity: 'Strict',
        worldExpansion: 'Minimal',
      };

      const bible = StoryAdaptationPipeline.extractAndNormalize(
        'test_story_02',
        segments,
        defaultProfile
      );

      assert.ok('canonFacts' in bible);
      assert.ok('canonEntities' in bible);
      assert.ok('canonEvents' in bible);
      assert.ok('scenes' in bible);
      assert.strictEqual(bible.storyId, 'test_story_02');
    });
  });

  describe('DEF-CH15-02: Adapted Story Library & State Isolation', () => {
    it('maintains clean state isolation between story instances in worldRepository', () => {
      worldRepository.seedStory('story_alpha');
      worldRepository.seedStory('story_beta');

      worldRepository.addKnowledgeFact('story_alpha', {
        id: 'fact_alpha_only',
        subjectEntityId: 'ent_a',
        predicate: 'is_located_in',
        objectValue: 'Alpha Quadrant',
        sourceType: 'document',
        acquiredAtTimestamp: { totalElapsedSeconds: 100, cycle: 1, period: 'Day' },
        confidence: 1.0,
        secretLevel: 'public',
        scope: 'general',
        provenanceSummary: 'Alpha Fact',
      });

      const alphaFacts = worldRepository.getKnowledgeFacts('story_alpha');
      const betaFacts = worldRepository.getKnowledgeFacts('story_beta');

      assert.strictEqual(alphaFacts.some((f) => f.id === 'fact_alpha_only'), true);
      assert.strictEqual(betaFacts.some((f) => f.id === 'fact_alpha_only'), false);
    });

    it('lists all adapted stories including default original story', () => {
      worldRepository.saveAdaptedStoryBible('story_gamma', {
        storyId: 'story_gamma',
        title: 'Gamma Story',
        profile: { mode: 'Guided Divergence' },
      } as any);
      const list = worldRepository.getAllAdaptationStories();
      assert.strictEqual(list.some((s) => s.storyId === 'default_story'), true);
      assert.strictEqual(list.some((s) => s.storyId === 'story_gamma'), true);
    });
  });

  describe('DEF-CH15-03: Real Stage 8 Player Instantiation', () => {
    it('instantiates player lifecycle derived from story bible and profile', () => {
      const profile: AdaptationProfile = {
        id: 'prof_03',
        storyId: 'story_p8',
        mode: 'Faithful Adaptation',
        canonStrictness: 'Strict',
        divergencePoint: 'Beginning',
        plotGravity: 'Strong',
        playerRole: 'Original Protagonist',
        characterFidelity: 'Strict',
        worldExpansion: 'Minimal',
      };

      const run = StoryAdaptationPipeline.runPipeline(
        'story_p8',
        'Vault Tale',
        sampleRawText,
        profile
      );

      assert.notStrictEqual(run.playerInstantiation, undefined);
      assert.strictEqual(run.playerInstantiation.actorId, 'player_actor_story_p8');
      assert.notStrictEqual(run.playerInstantiation.startingLocationId, undefined);
      assert.ok(run.playerInstantiation.initialKnowledge.length > 0);
    });
  });

  describe('DEF-CH15-04: Server-Driven Pipeline Status', () => {
    it('persists and returns 9-stage pipeline state with completed stage progress', () => {
      const profile: AdaptationProfile = {
        id: 'prof_status',
        storyId: 'story_status_test',
        mode: 'Guided Divergence',
        canonStrictness: 'Balanced',
        divergencePoint: 'Beginning',
        plotGravity: 'Medium',
        playerRole: 'New Companion',
        characterFidelity: 'Naturalized',
        worldExpansion: 'Moderate',
      };

      const result = StoryAdaptationPipeline.runPipeline(
        'story_status_test',
        'Status Check Story',
        sampleRawText,
        profile
      );

      worldRepository.savePipelineState('story_status_test', result.pipelineState);

      const savedState = worldRepository.getPipelineState('story_status_test');
      assert.notStrictEqual(savedState, undefined);
      assert.strictEqual(savedState?.status, 'COMPLETED');
      assert.strictEqual(savedState?.currentStage, 9);
      assert.strictEqual(Object.keys(savedState?.stageProgress || {}).length, 9);
    });
  });

  describe('DEF-CH15-05: Distinct Adaptation Mode Adjudication', () => {
    const profileBase: AdaptationProfile = {
      id: 'p_base',
      storyId: 's_base',
      mode: 'Faithful Adaptation',
      canonStrictness: 'Strict',
      divergencePoint: 'Beginning',
      plotGravity: 'Strong',
      playerRole: 'Original Protagonist',
      characterFidelity: 'Strict',
      worldExpansion: 'Minimal',
    };

    it('Faithful Adaptation rejects actions that contradict source facts', () => {
      const res = StoryAdaptationPipeline.evaluatePlayerActionAgainstCanon(
        'smash the wax seal before solstice',
        { ...profileBase, mode: 'Faithful Adaptation' },
        []
      );

      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.divergenceType, 'FACT_CONTRADICTION');
    });

    it('Guided Divergence permits departure and flags divergence type', () => {
      const res = StoryAdaptationPipeline.evaluatePlayerActionAgainstCanon(
        'smash the wax seal before solstice',
        { ...profileBase, mode: 'Guided Divergence' },
        []
      );

      assert.strictEqual(res.allowed, true);
      assert.strictEqual(res.createsDivergence, true);
      assert.strictEqual(res.divergenceType, 'CANON_DEPARTURE');
    });

    it('Alternate Timeline protects pre-divergence chronology and permits post-divergence branch', () => {
      const res = StoryAdaptationPipeline.evaluatePlayerActionAgainstCanon(
        'smash the wax seal before solstice',
        { ...profileBase, mode: 'Alternate Timeline', divergencePoint: 'Beginning' },
        []
      );

      assert.strictEqual(res.allowed, true);
      assert.strictEqual(res.createsDivergence, true);
      assert.strictEqual(res.divergenceType, 'ALTERNATE_TIMELINE_BRANCH');
    });

    it('Remix mode permits creative expansion while enforcing physical world rules', () => {
      const res = StoryAdaptationPipeline.evaluatePlayerActionAgainstCanon(
        'invent a magical portal',
        { ...profileBase, mode: 'Remix' },
        []
      );

      assert.strictEqual(res.allowed, true);
      assert.strictEqual(res.createsDivergence, true);
      assert.strictEqual(res.divergenceType, 'REMIX_INVENTION');
    });
  });

  describe('DEF-CH15-06: Scene Reconstruction & Fallback Logic', () => {
    it('splits scenes using actual source chapter headers and scene breaks', () => {
      const { segments } = StoryAdaptationPipeline.ingestAndSegment(
        's_recon',
        'Recon Title',
        sampleRawText
      );

      const scenes = StoryAdaptationPipeline.reconstructScenes(segments);

      assert.ok(scenes.length >= 2);
      assert.strictEqual(scenes[0].chapterTitle, 'Chapter 1: Arrival at Lantern Vault');
      assert.strictEqual(scenes[1].chapterTitle, 'Chapter 2: The Interruption');
    });

    it('sets missing location or time to UNKNOWN rather than inventing strings', () => {
      const rawTextNoLoc = 'A simple text fragment with no location cues or time markers.';
      const { segments } = StoryAdaptationPipeline.ingestAndSegment('s_unk', 'Unk', rawTextNoLoc);
      const scenes = StoryAdaptationPipeline.reconstructScenes(segments);

      assert.strictEqual(scenes[0].location, 'UNKNOWN');
      assert.strictEqual(scenes[0].time, 'UNKNOWN');
    });
  });
});
