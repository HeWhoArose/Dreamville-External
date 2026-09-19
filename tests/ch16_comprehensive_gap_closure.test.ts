import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { worldSynthesisService } from '../server/services/worldSynthesisService';
import { researchEvidencePipeline } from '../server/domain/researchEvidence';
import { mediaAdapterService } from '../server/services/mediaAdapterService';
import { WorldSynthesisInput, ResearchEvidenceItem } from '../src/types';

describe('CH16: Comprehensive Architectural Gap Closure & Verification', () => {
  let repository: InMemoryWorldRepository;

  beforeEach(() => {
    repository = new InMemoryWorldRepository();
  });

  // =========================================================================
  // Part 2: Deterministic Search & Discovery Filtering
  // =========================================================================
  describe('Part 2: World Template Search & Discovery Filtering', () => {
    beforeEach(() => {
      repository.saveWorldTemplate({
        worldId: 'world_solar_archive',
        worldManifestVersion: 1,
        title: 'Solar Archive of Elysium',
        summary: 'A floating solar cathedral of ancient texts.',
        description: 'Floating solar libraries governed by sun-priests.',
        genreTags: ['High Fantasy', 'Solarpunk'],
        toneTags: ['Heroic', 'Luminous'],
        mediumTags: ['Text World'],
        defaultEra: 'First Radiance',
        canonMode: 'CANONICAL',
        rulesetId: 'FULL_DND',
        storyMode: 'PROTAGONIST',
        dndRulesMode: 'FULL_DND',
        setting: 'Elysium Solar Citadel',
        sourcePolicy: 'ORIGINAL_CANON',
        supportedPlaystyles: ['Tactical', 'Exploration'],
      });

      repository.saveWorldTemplate({
        worldId: 'world_shadow_depths',
        worldManifestVersion: 2,
        title: 'Abyssal Chasm of Naught',
        summary: 'A trench beneath the frozen oceans.',
        description: 'Dark sunken ruins where light has never touched.',
        genreTags: ['Cosmic Horror', 'Dark Fantasy'],
        toneTags: ['Grimdark', 'Mysterious'],
        mediumTags: ['Game World'],
        defaultEra: 'Age of Oblivion',
        canonMode: 'CANONICAL',
        rulesetId: 'HYBRID_DND',
        storyMode: 'SIDE_CHARACTER',
        dndRulesMode: 'HYBRID_DND',
        setting: 'Undersea Trenches',
        sourcePolicy: 'COMMUNITY_EXTENDED',
        supportedPlaystyles: ['Survival', 'Investigation'],
      });
    });

    it('filters worlds by natural language query across titles, summaries, and descriptions', () => {
      const results1 = repository.searchWorldTemplates({ query: 'Solar' });
      assert.equal(results1.length, 1);
      assert.equal(results1[0].worldId, 'world_solar_archive');

      const results2 = repository.searchWorldTemplates({ query: 'frozen oceans' });
      assert.equal(results2.length, 1);
      assert.equal(results2[0].worldId, 'world_shadow_depths');
    });

    it('filters worlds by multiple criteria: genre, tone, era, and ruleset', () => {
      const resultsGenre = repository.searchWorldTemplates({ genre: 'Cosmic Horror' });
      assert.equal(resultsGenre.length, 1);
      assert.equal(resultsGenre[0].worldId, 'world_shadow_depths');

      const resultsTone = repository.searchWorldTemplates({ tone: 'Heroic' });
      assert.equal(resultsTone.length, 1);
      assert.equal(resultsTone[0].worldId, 'world_solar_archive');

      const resultsEra = repository.searchWorldTemplates({ era: 'First Radiance' });
      assert.equal(resultsEra.length, 1);
      assert.equal(resultsEra[0].worldId, 'world_solar_archive');

      const resultsRules = repository.searchWorldTemplates({ rules: 'HYBRID_DND' });
      assert.equal(resultsRules.length, 1);
      assert.equal(resultsRules[0].worldId, 'world_shadow_depths');
    });

    it('1. filters worlds by setting-only filter', () => {
      const results = repository.searchWorldTemplates({ setting: 'Elysium Solar Citadel' });
      assert.equal(results.length, 1);
      assert.equal(results[0].worldId, 'world_solar_archive');

      const resultsUndersea = repository.searchWorldTemplates({ setting: 'Undersea' });
      assert.equal(resultsUndersea.length, 1);
      assert.equal(resultsUndersea[0].worldId, 'world_shadow_depths');
    });

    it('2. filters worlds by source-only filter', () => {
      const results = repository.searchWorldTemplates({ source: 'COMMUNITY_EXTENDED' });
      assert.equal(results.length, 1);
      assert.equal(results[0].worldId, 'world_shadow_depths');

      const resultsOriginal = repository.searchWorldTemplates({ source: 'ORIGINAL_CANON' });
      assert.equal(resultsOriginal.length, 1);
      assert.equal(resultsOriginal[0].worldId, 'world_solar_archive');
    });

    it('3. filters worlds by playstyle-only filter', () => {
      const results = repository.searchWorldTemplates({ playstyle: 'Survival' });
      assert.equal(results.length, 1);
      assert.equal(results[0].worldId, 'world_shadow_depths');

      const resultsTactical = repository.searchWorldTemplates({ playstyle: 'Tactical' });
      assert.equal(resultsTactical.length, 1);
      assert.equal(resultsTactical[0].worldId, 'world_solar_archive');
    });

    it('4. filters worlds by setting + genre combination', () => {
      const results = repository.searchWorldTemplates({
        setting: 'Elysium',
        genre: 'Solarpunk',
      });
      assert.equal(results.length, 1);
      assert.equal(results[0].worldId, 'world_solar_archive');

      const mismatch = repository.searchWorldTemplates({
        setting: 'Elysium',
        genre: 'Cosmic Horror',
      });
      assert.equal(mismatch.length, 0);
    });

    it('5. filters worlds by source + tone combination', () => {
      const results = repository.searchWorldTemplates({
        source: 'COMMUNITY_EXTENDED',
        tone: 'Grimdark',
      });
      assert.equal(results.length, 1);
      assert.equal(results[0].worldId, 'world_shadow_depths');

      const mismatch = repository.searchWorldTemplates({
        source: 'ORIGINAL_CANON',
        tone: 'Grimdark',
      });
      assert.equal(mismatch.length, 0);
    });

    it('6. filters worlds by playstyle + rules combination', () => {
      const results = repository.searchWorldTemplates({
        playstyle: 'Tactical',
        rules: 'FULL_DND',
      });
      assert.equal(results.length, 1);
      assert.equal(results[0].worldId, 'world_solar_archive');

      const resultsHybrid = repository.searchWorldTemplates({
        playstyle: 'Investigation',
        rules: 'HYBRID_DND',
      });
      assert.equal(resultsHybrid.length, 1);
      assert.equal(resultsHybrid[0].worldId, 'world_shadow_depths');
    });

    it('7. filters worlds by a multi-dimensional combination involving at least 4 filters', () => {
      const results = repository.searchWorldTemplates({
        setting: 'Undersea Trenches',
        source: 'COMMUNITY_EXTENDED',
        playstyle: 'Survival',
        rules: 'HYBRID_DND',
        genre: 'Cosmic Horror',
        tone: 'Grimdark',
      });
      assert.equal(results.length, 1);
      assert.equal(results[0].worldId, 'world_shadow_depths');
    });

    it('8. returns empty array when criteria match nothing (no-match behavior)', () => {
      const results = repository.searchWorldTemplates({ genre: 'Cyberpunk 2099' });
      assert.equal(results.length, 0);

      const multiMismatch = repository.searchWorldTemplates({
        setting: 'Elysium Solar Citadel',
        playstyle: 'Survival',
      });
      assert.equal(multiMismatch.length, 0);
    });

    it('9. empty criteria returns normal listing of all worlds', () => {
      const allEmpty = repository.searchWorldTemplates({});
      assert.equal(allEmpty.length, 2);

      const allNoArg = repository.searchWorldTemplates();
      assert.equal(allNoArg.length, 2);
    });

    it('10. search is strictly read-only and does not mutate worldRepository.worldTemplates', () => {
      const countBefore = repository.getAllWorldTemplates().length;
      const snapshotBefore = JSON.stringify(repository.getAllWorldTemplates());

      // Execute diverse searches
      repository.searchWorldTemplates({ query: 'Solar' });
      repository.searchWorldTemplates({ setting: 'Undersea' });
      repository.searchWorldTemplates({ genre: 'NonExistent' });

      const countAfter = repository.getAllWorldTemplates().length;
      const snapshotAfter = JSON.stringify(repository.getAllWorldTemplates());

      assert.equal(countBefore, countAfter);
      assert.equal(snapshotBefore, snapshotAfter);
    });
  });

  // =========================================================================
  // Part 3 & 4: World Synthesis Pipeline & Research Evidence Firewall
  // =========================================================================
  describe('Part 3 & 4: World Synthesis Schema & Research Evidence Firewall', () => {
    it('synthesizes world preserving advanced schema fields (geography, timeline, magicRules, economy)', async () => {
      const input: WorldSynthesisInput = {
        naturalLanguagePremise: 'An empire situated on floating icebergs powered by geothermal runes.',
        title: 'Frostfire Archipelago',
        genreTags: ['High Fantasy', 'Steampunk'],
        toneTags: ['Mysterious'],
        defaultEra: 'Age of Thaw',
        geography: {
          regions: [{ name: 'Glacier Crest', climate: 'Arctic', terrainType: 'Ice Sheets' }],
          majorLocations: [{ id: 'loc_geothermal_forge', name: 'The Core Caldera' }],
        },
        timeline: {
          eras: [{ name: 'The Great Freeze', duration: '500 years' }],
          keyHistoricalEvents: [{ year: 'Year 120', description: 'Discovery of geothermal runes.' }],
        },
        magicRules: {
          systemName: 'Thermal Flux Weaving',
          laws: ['Every heat spell extracts cold from ambient air.'],
          costsAndLimits: ['Overheating causes crystallization of the blood.'],
        },
        economy: {
          currency: 'Glacier Scrip',
          scarcity: ['Liquid Water', 'Combustible Wood'],
        },
      };

      const synthesized = await worldSynthesisService.synthesizeWorldFromPremise(input);
      assert.ok(synthesized.worldId, 'World ID must be generated');
      assert.equal(synthesized.title, 'Frostfire Archipelago');
      assert.deepEqual(synthesized.geography?.regions[0].name, 'Glacier Crest');
      assert.deepEqual(synthesized.timeline?.eras[0].name, 'The Great Freeze');
      assert.equal(synthesized.magicRules?.systemName, 'Thermal Flux Weaving');
      assert.equal(synthesized.economy?.currency, 'Glacier Scrip');
      assert.ok(synthesized.canonicalCapabilities.length > 0, 'Capabilities must be extracted');
    });

    it('enforces research evidence firewall: unpromoted evidence is never in canonical facts, promoted evidence is qualified', () => {
      const storyId = 'story_research_test';
      repository.seedStory(storyId);

      const unverifiedEvidence: ResearchEvidenceItem = {
        evidenceId: 'ev_rumor_sunken_bell',
        claimText: 'The bell at the lake bottom will awaken the Leviathan.',
        sourceUri: 'archive://old_seafarer_log',
        sourceTitle: 'Old Seafarer Log',
        qualification: 'QUALIFIED',
        validationStatus: 'UNVALIDATED',
        timestamp: new Date().toISOString(),
        extractedClaims: ['The bell at the lake bottom will awaken the Leviathan.'],
        provenance: {
          license: 'Academic Reference',
          lawfulNotice: 'Exempt scholarly quotation',
        },
      };

      // 1. Register evidence in pipeline
      researchEvidencePipeline.registerEvidence(unverifiedEvidence);

      // Verify canonical facts in world repository DO NOT contain unadjudicated claim
      const factsBefore = repository.getKnowledgeFacts(storyId);
      const hasUnverified = factsBefore.some((f) => (f.id || '').includes('ev_rumor_sunken_bell'));
      assert.equal(hasUnverified, false, 'Unadjudicated evidence MUST NOT leak into canonical facts');

      // 2. Reject another evidence item
      const falseEvidence: ResearchEvidenceItem = {
        evidenceId: 'ev_false_dragon_claim',
        claimText: 'The dragon is vulnerable to fire.',
        sourceUri: 'archive://apocryphal_folklore',
        sourceTitle: 'Apocryphal Folklore',
        qualification: 'UNQUALIFIED',
        validationStatus: 'UNVALIDATED',
        timestamp: new Date().toISOString(),
        extractedClaims: ['The dragon is vulnerable to fire.'],
        provenance: {
          license: 'Public Lore',
        },
      };
      researchEvidencePipeline.registerEvidence(falseEvidence);
      const rejectResult = researchEvidencePipeline.adjudicateAndPromote(
        'ev_false_dragon_claim',
        'REJECT',
        storyId,
        repository
      );
      assert.equal(rejectResult.success, true);

      // Verify rejected evidence did not enter world facts
      const factsAfterReject = repository.getKnowledgeFacts(storyId);
      assert.equal(factsAfterReject.some((f) => (f.id || '').includes('ev_false_dragon_claim')), false);

      // 3. Adjudicate and promote valid evidence
      const promoteResult = researchEvidencePipeline.adjudicateAndPromote(
        'ev_rumor_sunken_bell',
        'VALIDATE_AND_PROMOTE',
        storyId,
        repository
      );
      assert.equal(promoteResult.success, true);
      assert.ok(promoteResult.factId, 'Fact ID must be returned on promotion');

      // Verify canonical facts now contain the promoted fact
      const factsAfterPromote = repository.getKnowledgeFacts(storyId);
      const promotedFact = factsAfterPromote.find((f) => f.id === promoteResult.factId);
      assert.ok(promotedFact, 'Promoted fact must be present in canonical facts');
      assert.equal(promotedFact?.objectValue, 'The bell at the lake bottom will awaken the Leviathan.');
      assert.equal(promotedFact?.confidence, 1.0);
    });
  });

  // =========================================================================
  // Part 5: Chronology / Future-Knowledge Firewall
  // =========================================================================
  describe('Part 5: Chronology & Future-Knowledge Firewall', () => {
    it('strictly isolates future knowledge from the current chronological clock timestamp', () => {
      const storyId = 'story_chronology_firewall';
      repository.seedStory(storyId);

      // Clock initial totalElapsedSeconds
      const initialClock = repository.getWorldClock(storyId).getTimestamp();
      const baseSeconds = initialClock.totalElapsedSeconds;

      // Add a past/current fact (timestamp = baseSeconds)
      repository.saveWorldFact(storyId, {
        factId: 'fact_present_01',
        statement: 'Orrery Gate is locked.',
        category: 'world_lore',
        subjectEntityId: 'loc_whispering_orrery',
        predicate: 'is_status',
        objectValue: 'LOCKED',
        provenanceClass: 'CANONICAL',
        provenanceSummary: 'Direct observation at gate',
        confidence: 1.0,
        acquiredAtTimestamp: { ...initialClock, totalElapsedSeconds: baseSeconds },
      });

      // Add a future event fact (timestamp = baseSeconds + 3600s / 1 hour in the future)
      repository.saveWorldFact(storyId, {
        factId: 'fact_future_prophecy_01',
        statement: 'Lunar alignment cataclysm will occur at pinnacle.',
        category: 'world_lore',
        subjectEntityId: 'loc_whispering_orrery',
        predicate: 'will_occur_at',
        objectValue: 'Orrery Pinnacle',
        provenanceClass: 'CANONICAL',
        provenanceSummary: 'Temporal foresight prophecy',
        confidence: 1.0,
        acquiredAtTimestamp: { ...initialClock, totalElapsedSeconds: baseSeconds + 3600 },
      });

      // At T = baseSeconds, query chronologically available facts
      const availableFactsAtT0 = repository.getChronologicallyAvailableFacts(storyId);
      assert.equal(availableFactsAtT0.some((f) => f.factId === 'fact_present_01'), true);
      assert.equal(
        availableFactsAtT0.some((f) => f.factId === 'fact_future_prophecy_01'),
        false,
        'Future fact at T=3600 must NOT be available at T=0'
      );

      // Advance clock by 3600s (1 hour)
      repository.getWorldClock(storyId).advanceSeconds(3600);

      // At T = baseSeconds + 3600, query chronologically available facts
      const availableFactsAtT3600 = repository.getChronologicallyAvailableFacts(storyId);
      assert.equal(
        availableFactsAtT3600.some((f) => f.factId === 'fact_future_prophecy_01'),
        true,
        'Future fact must become chronologically available once world clock reaches T=baseSeconds+3600'
      );
    });
  });

  // =========================================================================
  // Part 6: Deterministic Media Provider Failure Injection
  // =========================================================================
  describe('Part 6: Media Provider Failure Injection & Presentation Resilience', () => {
    it('handles normal generation and deterministic failure injection modes gracefully', async () => {
      // 1. Normal mode
      mediaAdapterService.setFailureMode('NONE');
      const normalRes = await mediaAdapterService.generateImage({
        storyId: 'story_media_test',
        prompt: 'An ancient brass telescope pointing towards a fractured moon.',
        aspectRatio: '16:9',
      });
      assert.equal(normalRes.success, true);
      assert.ok(normalRes.mediaAsset?.url);
      assert.equal(normalRes.failureModeInjected, 'NONE');

      // 2. TIMEOUT failure mode
      mediaAdapterService.setFailureMode('TIMEOUT');
      const timeoutRes = await mediaAdapterService.generateImage({
        storyId: 'story_media_test',
        prompt: 'Stormy sea',
      });
      assert.equal(timeoutRes.success, false);
      assert.equal(timeoutRes.failureModeInjected, 'TIMEOUT');
      assert.match(timeoutRes.errorReason || '', /timed out/i);

      // 3. RATE_LIMIT failure mode
      mediaAdapterService.setFailureMode('RATE_LIMIT');
      const rateLimitRes = await mediaAdapterService.generateImage({
        storyId: 'story_media_test',
        prompt: 'A crystalline cavern',
      });
      assert.equal(rateLimitRes.success, false);
      assert.equal(rateLimitRes.failureModeInjected, 'RATE_LIMIT');
      assert.match(rateLimitRes.errorReason || '', /quota exceeded/i);

      // 4. CORRUPT_PAYLOAD failure mode
      mediaAdapterService.setFailureMode('CORRUPT_PAYLOAD');
      const corruptRes = await mediaAdapterService.generateImage({
        storyId: 'story_media_test',
        prompt: 'Enchanted forest',
      });
      assert.equal(corruptRes.success, false);
      assert.equal(corruptRes.failureModeInjected, 'CORRUPT_PAYLOAD');
      assert.match(corruptRes.errorReason || '', /corrupted/i);

      // 5. FALLBACK_GENERATION mode
      mediaAdapterService.setFailureMode('FALLBACK_GENERATION');
      const fallbackRes = await mediaAdapterService.generateImage({
        storyId: 'story_media_test',
        prompt: 'Golden desert dunes',
      });
      assert.equal(fallbackRes.success, true);
      assert.equal(fallbackRes.isFallback, true);
      assert.ok(fallbackRes.mediaAsset?.url);

      // Reset
      mediaAdapterService.setFailureMode('NONE');
    });
  });

  // =========================================================================
  // Part 8: World Version Pinning & Story Run Isolation
  // =========================================================================
  describe('Part 8: Version Pinning & Cross-Run Isolation', () => {
    it('guarantees that mutating a story run never corrupts the base world template or other runs', () => {
      const worldId = 'world_evergreen_sanctuary';
      const baseWorld = {
        worldId,
        worldManifestVersion: 1,
        title: 'Evergreen Sanctuary',
        summary: 'A lush primeval forest shielded by druidic wards.',
        description: 'Primeval forest untouched by industrialized blight.',
        genreTags: ['High Fantasy'],
        toneTags: ['Whimsical'],
        mediumTags: ['Game World'],
        defaultEra: 'First Blossoming',
        canonMode: 'CANONICAL',
        rulesetId: 'FULL_DND',
        storyMode: 'PROTAGONIST',
        dndRulesMode: 'FULL_DND',
        canonicalCapabilities: ['cap_druid_wildshape'],
      };
      repository.saveWorldTemplate(baseWorld);

      // Start Run A
      const runA = {
        storyId: 'run_alpha_01',
        worldId,
        pinnedWorldVersion: 1,
        storyMode: 'PROTAGONIST',
        dndRulesMode: 'FULL_DND',
        characterName: 'Hero A',
        currentLocationId: 'loc_grove_alpha',
        currentHp: 25,
        canonicalCapabilities: ['cap_druid_wildshape'],
        createdAt: new Date().toISOString(),
      };
      repository.seedStory('run_alpha_01');
      repository.saveStoryRun(runA);

      // Start Run B (independent run on same world)
      const runB = {
        storyId: 'run_beta_02',
        worldId,
        pinnedWorldVersion: 1,
        storyMode: 'SIDE_CHARACTER',
        dndRulesMode: 'NARRATIVE_DICE_CLASH',
        characterName: 'Hero B',
        currentLocationId: 'loc_camp_beta',
        currentHp: 40,
        canonicalCapabilities: ['cap_druid_wildshape'],
        createdAt: new Date().toISOString(),
      };
      repository.seedStory('run_beta_02');
      repository.saveStoryRun(runB);

      // Mutate Run A (advance clock, change player lifecycle, change run state)
      repository.getWorldClock('run_alpha_01').advanceSeconds(14400); // +4 hours
      const playerA = repository.getPlayerLifecycle('run_alpha_01')!;
      repository.updatePlayerLifecycle('run_alpha_01', playerA.copyWith({
        name: 'Wounded Hero A',
      }));
      repository.saveStoryRun({
        ...runA,
        currentHp: 5,
        currentLocationId: 'loc_deep_dungeon',
      });

      // Update base world template to version 2 (simulating template evolution)
      repository.saveWorldTemplate({
        ...baseWorld,
        worldManifestVersion: 2,
        title: 'Evergreen Sanctuary (Cataclysm Reborn)',
      });

      // Assert Run B is completely untouched and isolated
      const fetchedRunB = repository.getStoryRun('run_beta_02');
      assert.equal(fetchedRunB.characterName, 'Hero B');
      assert.equal(fetchedRunB.currentHp, 40);
      assert.equal(fetchedRunB.pinnedWorldVersion, 1, 'Run B must stay pinned to world version 1');
      assert.equal(fetchedRunB.currentLocationId, 'loc_camp_beta');

      // Assert Run A retained its pinned version and isolated mutations
      const fetchedRunA = repository.getStoryRun('run_alpha_01');
      assert.equal(fetchedRunA.characterName, 'Hero A');
      assert.equal(fetchedRunA.currentHp, 5);
      assert.equal(fetchedRunA.pinnedWorldVersion, 1, 'Run A must stay pinned to world version 1');
      assert.equal(fetchedRunA.currentLocationId, 'loc_deep_dungeon');

      const livePlayerA = repository.getPlayerLifecycle('run_alpha_01')!;
      const livePlayerB = repository.getPlayerLifecycle('run_beta_02')!;
      assert.equal(livePlayerA.name, 'Wounded Hero A');
      assert.equal(livePlayerB.name, 'Scribe Vael'); // Default seeded name untouched
    });
  });
});
