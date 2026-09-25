import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { WorldSimulationService } from '../server/simulation/worldSimulationService';
import { DomainAdjudicationBridge } from '../server/domain/aiOrchestrator';
import { CampaignArchiveService } from '../server/domain/campaignArchive';
import { HistoricalEvidence } from '../server/domain/types';

describe('CH4 SURGICAL REPAIR (Evidence Identity & AI Boundary)', () => {
  const recordChronicleEvidence = (repository: InMemoryWorldRepository, storyId: string, chronicle: any, evidence: HistoricalEvidence) => {
    repository.beginCanonicalCommandTransaction(storyId, `test_chronicle_${evidence.id}`);
    try {
      const result = chronicle.recordEvidence(evidence);
      repository.commitCanonicalCommandTransaction(storyId, evidence.sourceEventId || evidence.id);
      return result;
    } catch (error) {
      repository.rollbackCanonicalCommandTransaction(storyId);
      throw error;
    }
  };

  it('TEST 1 & 2: DETERMINISTIC EVIDENCE IDENTITY & REPLAY DEDUPLICATION', () => {
    const repo = new InMemoryWorldRepository();
    const chronicle = repo.getHistoricalChronicleEngine('ch4_test_story');
    const clock = repo.getWorldClock('ch4_test_story');
    
    // Process a canonical source event directly via chronicle engine (simulating authoritative system)
    const timestamp = clock.getTimestamp();
    const evidenceInput: HistoricalEvidence = {
      id: `ev_test_deterministic_id_123`,
      category: 'SACRED_OR_HISTORIC',
      timestamp,
      primarySubjectId: 'char_a',
      locationId: 'loc_a',
      summary: 'A significant event',
      details: 'Details of the event',
      sourceEventId: 'canonical_source_event_123',
      provenance: 'system_simulation',
      visibility: 'PUBLIC'
    };

    const res1 = recordChronicleEvidence(repo, 'ch4_test_story', chronicle, evidenceInput);
    assert.strictEqual(res1.promotedToChronicle, true);
    
    const entries1 = chronicle.getChronicleEntries();
    assert.strictEqual(entries1.length, 1);
    const id1 = entries1[0].evidenceId;

    // Process the exact same source event twice
    const res2 = recordChronicleEvidence(repo, 'ch4_test_story', chronicle, evidenceInput);
    assert.strictEqual(res2.promotedToChronicle, false, 'Should be deduplicated');
    
    const entries2 = chronicle.getChronicleEntries();
    assert.strictEqual(entries2.length, 1, 'Chronicle length must remain exactly 1 after replay');
    
    assert.strictEqual(id1, evidenceInput.id);
  });

  it('TEST 3: DIFFERENT EVENTS REMAIN DISTINCT', () => {
    const repo = new InMemoryWorldRepository();
    const chronicle = repo.getHistoricalChronicleEngine('ch4_test_story');
    const clock = repo.getWorldClock('ch4_test_story');
    const timestamp = clock.getTimestamp();

    const ev1: HistoricalEvidence = {
      id: `ev_test_1`,
      category: 'SACRED_OR_HISTORIC',
      timestamp,
      primarySubjectId: 'char_a',
      locationId: 'loc_a',
      summary: 'A significant event',
      details: 'Details of the event',
      sourceEventId: 'canonical_source_event_1',
      provenance: 'system_simulation',
      visibility: 'PUBLIC'
    };

    const ev2: HistoricalEvidence = {
      id: `ev_test_2`,
      category: 'SACRED_OR_HISTORIC',
      timestamp,
      primarySubjectId: 'char_a',
      locationId: 'loc_a',
      summary: 'Another significant event',
      details: 'Different details',
      sourceEventId: 'canonical_source_event_2',
      provenance: 'system_simulation',
      visibility: 'PUBLIC'
    };

    recordChronicleEvidence(repo, 'ch4_test_story', chronicle, ev1);
    recordChronicleEvidence(repo, 'ch4_test_story', chronicle, ev2);

    const entries = chronicle.getChronicleEntries();
    assert.strictEqual(entries.length, 2, 'Different events must be distinctly recorded');
    assert.notStrictEqual(entries[0].evidenceId, entries[1].evidenceId);
  });

  it('TEST 4: ARCHIVE / RESTORE', () => {
    const repo = new InMemoryWorldRepository();
    const storyId = 'archive_test_story';
    const chronicle = repo.getHistoricalChronicleEngine(storyId);
    const clock = repo.getWorldClock(storyId);
    
    const timestamp = clock.getTimestamp();
    const evidenceInput: HistoricalEvidence = {
      id: `ev_archive_test_id`,
      category: 'SACRED_OR_HISTORIC',
      timestamp,
      primarySubjectId: 'char_a',
      locationId: 'loc_a',
      summary: 'Archived event',
      details: 'Details of the archived event',
      sourceEventId: 'canonical_archive_event',
      provenance: 'system_simulation',
      visibility: 'PUBLIC'
    };

    recordChronicleEvidence(repo, 'ch4_test_story', chronicle, evidenceInput);

    const archive = repo.exportCampaignArchive(storyId, 'Test Archive');
    
    // Restore to a new story
    const restoreRes = repo.restoreCampaignArchive(archive, 'restored_story');
    assert.strictEqual(restoreRes.success, true);
    
    const restoredChronicle = repo.getHistoricalChronicleEngine('restored_story');
    assert.strictEqual(restoredChronicle.getChronicleEntries().length, 1);

    // Reprocess the same event on restored state
    const res = recordChronicleEvidence(repo, 'restored_story', restoredChronicle, evidenceInput);
    assert.strictEqual(res.promotedToChronicle, false, 'Should be deduplicated even after restore');
    
    assert.strictEqual(restoredChronicle.getChronicleEntries().length, 1, 'No duplicate entries');
  });

  it('TEST 5: AI CHRONICLE REJECTION', () => {
    const repo = new InMemoryWorldRepository();
    const storyId = 'ai_rejection_story';
    
    const turnPackage = {
      narrative: ['A momentous event occurred.'],
      dialogue: [],
      events: [],
      stateChanges: [
        {
          kind: 'CHRONICLE',
          targetId: 'ev_fake_1',
          value: 'The AI decided this happened.',
        }
      ],
      memoryCandidates: [],
      audioCues: []
    };

    const res = DomainAdjudicationBridge.adjudicate(turnPackage, repo, storyId);
    assert.strictEqual(res.allApproved, false, 'Should reject CHRONICLE state change');
    
    const chronicleRejection = res.outcomes.find(o => String(o.change.kind).toUpperCase() === 'CHRONICLE');
    assert.ok(chronicleRejection);
    assert.strictEqual(chronicleRejection.approved, false);
    assert.ok(chronicleRejection.reason?.includes('authoritative canonical events'));

    // Verify no evidence was created
    const chronicle = repo.getHistoricalChronicleEngine(storyId);
    assert.strictEqual(chronicle.getChronicleEntries().length, 0);
  });

  it('TEST 6: AI CANNOT INVENT PROVENANCE', () => {
    // Provenance is tightly coupled to CHRONICLE state changes which are now rejected.
    // If AI tries to pass provenance metadata, the entire CHRONICLE change is rejected.
    const repo = new InMemoryWorldRepository();
    const storyId = 'ai_provenance_story';

    const turnPackage = {
      narrative: ['A momentous event occurred.'],
      dialogue: [],
      events: [],
      stateChanges: [
        {
          kind: 'CHRONICLE',
          targetId: 'ev_fake_1',
          value: 'AI Event',
          metadata: { provenance: 'direct_astronomical_observation' }
        }
      ],
      memoryCandidates: [],
      audioCues: []
    };

    const res = DomainAdjudicationBridge.adjudicate(turnPackage as any, repo, storyId);
    const chronicleRejection = res.outcomes.find(o => String(o.change.kind).toUpperCase() === 'CHRONICLE');
    assert.strictEqual(chronicleRejection?.approved, false);
    
    const chronicle = repo.getHistoricalChronicleEngine(storyId);
    assert.strictEqual(chronicle.getChronicleEntries().length, 0);
  });

  it('TEST 7: AI CANNOT INVENT CAUSALITY', () => {
    const repo = new InMemoryWorldRepository();
    const storyId = 'ai_causality_story';

    const turnPackage = {
      narrative: ['Event B caused Event A according to my reasoning.'],
      dialogue: [],
      events: [],
      stateChanges: [
        {
          kind: 'CHRONICLE',
          targetId: 'ev_cause_link',
          value: 'Event B caused Event A'
        }
      ],
      memoryCandidates: [],
      audioCues: []
    };

    const res = DomainAdjudicationBridge.adjudicate(turnPackage as any, repo, storyId);
    const chronicleRejection = res.outcomes.find(o => String(o.change.kind).toUpperCase() === 'CHRONICLE');
    assert.strictEqual(chronicleRejection?.approved, false);
    
    const chronicle = repo.getHistoricalChronicleEngine(storyId);
    assert.strictEqual(chronicle.getChronicleEntries().length, 0);
  });

  it('TEST 8: VALID CANONICAL EVENT STILL PROMOTES', () => {
    const repo = new InMemoryWorldRepository();
    const storyId = 'ai_valid_event_story';
    const clock = repo.getWorldClock(storyId);
    const sim = new WorldSimulationService(repo);

    repo.updatePlayerLifecycle(storyId, {
      actorId: 'player_actor_valid',
      locationId: 'loc_start',
      name: 'Tester',
      injuries: [],
      isDead: false,
      copyWith: function (updates: any) {
        return { ...this, ...updates };
      }
    } as any);

    const chronicle = repo.getHistoricalChronicleEngine(storyId);
    const initialCount = chronicle.getDossier('player_actor_valid')?.milestones.length || 0;

    sim.applyPlayerInjury(storyId, {
      type: 'Permanent Psychic',
      severity: 'Severe',
      location: 'Mind',
      description: 'Psychic tear',
    });

    const dossier = chronicle.getDossier('player_actor_valid');
    assert.ok(dossier);
    assert.strictEqual(dossier.milestones.length, initialCount + 1, 'Valid canonical event must successfully create evidence and promote to dossier');
    
    // Check significance
    const evalEvidence = dossier.milestones[dossier.milestones.length - 1];
    assert.ok(evalEvidence.significance === 'NOTABLE' || evalEvidence.significance === 'SIGNIFICANT');
  });

});

  it('TEST 9: DIFFERENT EVENTS WITH SAME LOGICAL TIMESTAMP RECEIVE DISTINCT DETERMINISTIC IDS', () => {
    const repo = new InMemoryWorldRepository();
    const storyId = 'ai_concurrent_events';
    const clock = repo.getWorldClock(storyId);
    const sim = new WorldSimulationService(repo);

    repo.updatePlayerLifecycle(storyId, {
      actorId: 'player_actor_valid',
      locationId: 'loc_start',
      name: 'Tester',
      injuries: [],
      isDead: false,
      copyWith: function (updates: any) {
        return { ...this, ...updates };
      }
    } as any);

    const chronicle = repo.getHistoricalChronicleEngine(storyId);
    const initialCount = chronicle.getChronicleEntries().length;

    // Apply injury 1
    sim.applyPlayerInjury(storyId, {
      type: 'Permanent Psychic',
      severity: 'Critical',
      location: 'Mind',
      description: 'Permanent Psychic scratch',
    });

    // Apply injury 2 in the same logical second
    sim.applyPlayerInjury(storyId, {
      type: 'Permanent Physical',
      severity: 'Critical',
      location: 'Arm',
      description: 'Paper cut',
    });

    const entries = chronicle.getChronicleEntries();
    assert.strictEqual(entries.length, initialCount + 2, 'Both events must be successfully recorded and not incorrectly deduplicated');
    
    const ev1 = entries[entries.length - 2];
    const ev2 = entries[entries.length - 1];

    assert.notStrictEqual(ev1.id, ev2.id, 'Distinct events in the same timestamp must have distinct IDs');
    assert.strictEqual(ev1.timestamp.totalElapsedSeconds, ev2.timestamp.totalElapsedSeconds, 'Timestamps must be identical');
  });
