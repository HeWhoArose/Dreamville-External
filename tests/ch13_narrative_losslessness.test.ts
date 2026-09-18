import { describe, it } from 'node:test';
import assert from 'node:assert';
import { worldRepository } from '../server/repositories/worldRepository';
import { CampaignArchiveService } from '../server/domain/campaignArchive';

describe('CH13 DEF-CH13-01 Surgical Repair — Narrative openThreads Losslessness', () => {
  it('TEST 1 — Narrative openThreads round-trip: preserves non-empty openThreads losslessly', () => {
    const storyId = 'story_narrative_test1_' + Date.now();
    const orchestrator = worldRepository.getAiOrchestrator();

    const originalThreads = ['unsolved_seal_mystery', 'missing_librarian'];

    orchestrator.createContinuationCheckpoint({
      checkpointId: 'cp_test_threads_1',
      storyId,
      turnId: 'turn_1',
      role: 'narrator',
      playerAction: 'Investigate the celestial seal in the scriptorium',
      worldTime: 'Cycle 1, 14:00',
      locationId: 'loc_whispering_orrery',
      sceneSummary: 'Investigated the seal',
      recentOutput: 'The seal glows with pale luminescence.',
      summaryText: 'Investigated the seal',
      uncommittedOutput: '',
      openThreads: [...originalThreads],
      recentHistory: ['The seal glows with pale luminescence.'],
      presentationEvents: ['cue_glow'],
      canonicalInvariants: { sealIntact: true },
      styleContract: { tone: 'mysterious' },
      createdAt: 1700000000000,
      adjudicationStatus: 'ADJUDICATED',
    });

    // 1. Export narrative history
    const exportedHistory = orchestrator.exportNarrativeHistory(storyId);
    assert.strictEqual(exportedHistory.length >= 1, true, 'Exported narrative history must contain at least 1 record');
    const exportedRecord = exportedHistory.find((r) => r.checkpointId === 'cp_test_threads_1');
    assert.ok(exportedRecord, 'Exported record must exist');
    assert.deepStrictEqual(exportedRecord.openThreads, originalThreads, 'Exported openThreads must match original');

    // 2. Canonical JSON partition serialization
    const partitionJson = JSON.stringify(exportedHistory, null, 2);
    const parsedPartition = JSON.parse(partitionJson);
    const parsedRecord = parsedPartition.find((r: any) => r.checkpointId === 'cp_test_threads_1');
    assert.deepStrictEqual(parsedRecord.openThreads, originalThreads, 'JSON partition must preserve openThreads');

    // 3. Restore narrative history
    orchestrator.restoreNarrativeHistory(storyId, parsedPartition);
    const restoredCheckpoint = orchestrator.getContinuationCheckpoint('cp_test_threads_1');
    assert.ok(restoredCheckpoint, 'Restored checkpoint must exist');
    assert.deepStrictEqual(
      restoredCheckpoint.openThreads,
      originalThreads,
      'Restored openThreads must strictly equal original'
    );
  });

  it('TEST 2 — Archive export/import/export: semantic identity between A and B', () => {
    const storyId = 'story_narrative_test2_' + Date.now();
    const orchestrator = worldRepository.getAiOrchestrator();

    const testThreads = ['thread_iron_gate', 'thread_runic_cipher'];

    orchestrator.createContinuationCheckpoint({
      checkpointId: 'cp_test_threads_2',
      storyId,
      turnId: 'turn_2',
      role: 'narrator',
      playerAction: 'Translate the inscription',
      worldTime: 'Cycle 1, 15:30',
      locationId: 'loc_whispering_orrery',
      sceneSummary: 'Translation in progress',
      recentOutput: 'Ancient glyphs slowly reveal their meaning...',
      summaryText: 'Translation in progress',
      uncommittedOutput: '',
      openThreads: [...testThreads],
      recentHistory: ['Ancient glyphs slowly reveal their meaning...'],
      presentationEvents: [],
      canonicalInvariants: {},
      styleContract: {},
      createdAt: 1700000000000,
      adjudicationStatus: 'ADJUDICATED',
    });

    // EXPORT A
    const archiveA = worldRepository.exportCampaignArchive(storyId, 'Export Import Export Test');
    const narrativeA = JSON.parse(archiveA.partitions['canonical/narrative.json']);
    const recordA = narrativeA.find((r: any) => r.checkpointId === 'cp_test_threads_2');
    assert.deepStrictEqual(recordA.openThreads, testThreads, 'Export A must contain openThreads');

    // RESTORE
    const restoreResult = worldRepository.restoreCampaignArchive(archiveA, storyId);
    assert.strictEqual(restoreResult.success, true, 'Restore must succeed');

    // EXPORT B
    const archiveB = worldRepository.exportCampaignArchive(storyId, 'Export Import Export Test');
    const narrativeB = JSON.parse(archiveB.partitions['canonical/narrative.json']);
    const recordB = narrativeB.find((r: any) => r.checkpointId === 'cp_test_threads_2');
    assert.deepStrictEqual(recordB.openThreads, testThreads, 'Export B must contain openThreads');

    // Assert narrative partition semantic identity between A and B
    assert.deepStrictEqual(
      narrativeA,
      narrativeB,
      'Narrative partition must be semantically identical between Export A and Export B'
    );
    assert.strictEqual(
      archiveA.manifest.partitionHashes['canonical/narrative.json'],
      archiveB.manifest.partitionHashes['canonical/narrative.json'],
      'Narrative partition hash must match across identical re-export'
    );
  });

  it('TEST 3 — Empty/default behavior: checkpoint with no openThreads exports as [] and does not throw', () => {
    const storyId = 'story_narrative_test3_' + Date.now();
    const orchestrator = worldRepository.getAiOrchestrator();

    orchestrator.createContinuationCheckpoint({
      checkpointId: 'cp_test_threads_3',
      storyId,
      turnId: 'turn_3',
      role: 'narrator',
      playerAction: 'Rest at the camp',
      worldTime: 'Cycle 1, 20:00',
      locationId: 'loc_whispering_orrery',
      sceneSummary: 'Resting',
      recentOutput: 'The fire crackles quietly.',
      summaryText: 'Resting',
      uncommittedOutput: '',
      // openThreads explicitly undefined
      recentHistory: ['The fire crackles quietly.'],
      presentationEvents: [],
      canonicalInvariants: {},
      styleContract: {},
      createdAt: 1700000000000,
      adjudicationStatus: 'ADJUDICATED',
    });

    const exportedHistory = orchestrator.exportNarrativeHistory(storyId);
    const exportedRecord = exportedHistory.find((r) => r.checkpointId === 'cp_test_threads_3');
    assert.ok(exportedRecord, 'Exported record must exist');
    assert.deepStrictEqual(exportedRecord.openThreads, [], 'openThreads must default to []');

    orchestrator.restoreNarrativeHistory(storyId, exportedHistory);
    const restored = orchestrator.getContinuationCheckpoint('cp_test_threads_3');
    assert.ok(restored, 'Restored checkpoint must exist');
    assert.deepStrictEqual(restored.openThreads, [], 'Restored openThreads must be []');
  });

  it('TEST 4 — Backward compatibility: narrative records lacking openThreads property restore safely as []', () => {
    const storyId = 'story_narrative_test4_' + Date.now();
    const orchestrator = worldRepository.getAiOrchestrator();

    // Legacy checkpoint representation with completely missing openThreads property
    const legacyRecords = [
      {
        checkpointId: 'cp_legacy_no_threads',
        storyId,
        turnId: 'turn_legacy',
        role: 'narrator',
        playerAction: 'Step through the arch',
        worldTime: 'Cycle 1, 08:00',
        locationId: 'loc_whispering_orrery',
        sceneSummary: 'Arch transit',
        recentOutput: 'You stepped through the archway.',
        summaryText: 'Arch transit',
        recentHistory: ['You stepped through the archway.'],
        presentationEvents: [],
        canonicalInvariants: {},
        styleContract: {},
        createdAt: 1690000000000,
        adjudicationStatus: 'ADJUDICATED',
        // NOTE: NO openThreads property at all
      },
    ];

    // Verify restore does not throw and defaults to []
    assert.doesNotThrow(() => {
      orchestrator.restoreNarrativeHistory(storyId, legacyRecords);
    }, 'Restore of legacy record lacking openThreads must not throw');

    const restoredLegacy = orchestrator.getContinuationCheckpoint('cp_legacy_no_threads');
    assert.ok(restoredLegacy, 'Restored legacy checkpoint must exist');
    assert.deepStrictEqual(restoredLegacy.openThreads, [], 'Legacy record without openThreads must restore as []');
  });

  it('TEST 5 — Cross-story restore: rebinds storyId, preserves openThreads, prevents cross-story leaks', () => {
    const sourceStoryId = 'story_source_' + Date.now();
    const targetStoryId = 'story_target_' + (Date.now() + 100);
    const orchestrator = worldRepository.getAiOrchestrator();

    const distinctThreads = ['source_secret_passage', 'source_lost_amulet'];

    orchestrator.createContinuationCheckpoint({
      checkpointId: 'cp_cross_story_1',
      storyId: sourceStoryId,
      turnId: 'turn_1',
      role: 'narrator',
      playerAction: 'Examine source story pedestal',
      worldTime: 'Cycle 2, 10:00',
      locationId: 'loc_whispering_orrery',
      sceneSummary: 'Source pedestal examined',
      recentOutput: 'The pedestal in the source campaign glows.',
      summaryText: 'Source pedestal examined',
      uncommittedOutput: '',
      openThreads: [...distinctThreads],
      recentHistory: ['The pedestal in the source campaign glows.'],
      presentationEvents: [],
      canonicalInvariants: { pedestalActive: true },
      styleContract: {},
      createdAt: 1700000000000,
      adjudicationStatus: 'ADJUDICATED',
    });

    // Export from source
    const sourceArchive = worldRepository.exportCampaignArchive(sourceStoryId, 'Source Campaign');

    // Restore into distinct targetStoryId
    const restoreRes = worldRepository.restoreCampaignArchive(sourceArchive, targetStoryId);
    assert.strictEqual(restoreRes.success, true, 'Cross-story restore must succeed');

    // Verify checkpoints under targetStoryId
    const targetCheckpoints = orchestrator.getAllCheckpoints(targetStoryId);
    assert.strictEqual(targetCheckpoints.length >= 1, true, 'Target story must have checkpoints');
    const targetCp = targetCheckpoints.find((cp) => cp.checkpointId === 'cp_cross_story_1');
    assert.ok(targetCp, 'Target checkpoint must exist');

    // Verify storyId rebind
    assert.strictEqual(targetCp.storyId, targetStoryId, 'Target checkpoint storyId must be rebound to targetStoryId');

    // Verify openThreads intact
    assert.deepStrictEqual(targetCp.openThreads, distinctThreads, 'Target checkpoint openThreads must remain intact');

    // Verify source story was NOT mutated or polluted by target operations
    const sourceCp = orchestrator.getContinuationCheckpoint('cp_cross_story_1');
    assert.ok(sourceCp, 'Source checkpoint must still exist');
    // Mutate target by adding new checkpoint
    orchestrator.createContinuationCheckpoint({
      checkpointId: 'cp_target_exclusive',
      storyId: targetStoryId,
      turnId: 'turn_target_exclusive',
      role: 'narrator',
      playerAction: 'Target action',
      worldTime: 'Cycle 3',
      locationId: 'loc_whispering_orrery',
      sceneSummary: 'Target scene',
      recentOutput: 'Target output',
      uncommittedOutput: '',
      openThreads: ['target_only_thread'],
      createdAt: Date.now(),
    });

    const refreshedSourceCheckpoints = orchestrator.getAllCheckpoints(sourceStoryId);
    assert.strictEqual(
      refreshedSourceCheckpoints.some((cp) => cp.checkpointId === 'cp_target_exclusive'),
      false,
      'Target exclusive checkpoint must not leak into source story'
    );
  });
});
