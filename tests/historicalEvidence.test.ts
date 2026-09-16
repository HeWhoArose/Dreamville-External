import { describe, it } from 'node:test';
import assert from 'node:assert';
import { HistoricalEvidence } from '../server/domain/historicalEvidence';
import { SignificanceEvaluator } from '../server/domain/significanceEvaluator';
import { HistoricalChronicleEngine } from '../server/domain/historicalChronicleEngine';
import { WorldTimestamp } from '../server/domain/types';

const defaultTimestamp: WorldTimestamp = {
  year: 42,
  month: 10,
  day: 14,
  hour: 17,
  minute: 42,
  second: 0,
  totalElapsedSeconds: 1330882920,
};

describe('SignificanceEvaluator Deterministic Evaluation (CH4.SIGNIFICANCE)', () => {
  it('evaluates death lifecycle transition as globally HISTORIC', () => {
    const evidence: HistoricalEvidence = {
      id: 'ev_01',
      category: 'LIFECYCLE_TRANSITION',
      timestamp: defaultTimestamp,
      primarySubjectId: 'char_elian',
      locationId: 'loc_lantern_vault',
      summary: 'Master Elian was slain in the cistern collapse.',
      details: 'Deep siphon burst flooded the lower gears.',
      sourceEventId: 'evt_vault_collapse',
      provenance: 'witnessed_event',
      visibility: 'PUBLIC',
    };

    const evaluation = SignificanceEvaluator.evaluate(evidence);
    assert.strictEqual(evaluation.significance, 'HISTORIC');
    assert.strictEqual(evaluation.promotedToDossier, true);
    assert.strictEqual(evaluation.promotedToChronicle, true);
    assert.ok(evaluation.evaluationReason.includes('death'));
  });

  it('evaluates world anomalies (astrolabe halt, bedrock rupture) as HISTORIC', () => {
    const evidence: HistoricalEvidence = {
      id: 'ev_02',
      category: 'WORLD_ANOMALY',
      timestamp: defaultTimestamp,
      primarySubjectId: 'loc_whispering_orrery',
      locationId: 'loc_whispering_orrery',
      summary: 'Acoustic pulse upward from bedrock halted celestial rings.',
      details: 'Micro-fractures along third prism ring recorded.',
      sourceEventId: 'evt_orrery_halt',
      provenance: 'direct_observation',
      visibility: 'PUBLIC',
    };

    const evaluation = SignificanceEvaluator.evaluate(evidence);
    assert.strictEqual(evaluation.significance, 'HISTORIC');
    assert.strictEqual(evaluation.promotedToChronicle, true);
  });

  it('evaluates minor transit as TRIVIAL and suppresses promotion', () => {
    const evidence: HistoricalEvidence = {
      id: 'ev_03',
      category: 'TERRITORIAL_TRANSIT',
      timestamp: defaultTimestamp,
      primarySubjectId: 'char_maren',
      locationId: 'loc_whispering_orrery',
      summary: 'Walked from observation desk to lower catwalk.',
      details: 'Routine inspection step.',
      sourceEventId: 'evt_maren_walk',
      provenance: 'direct_observation',
      visibility: 'PUBLIC',
    };

    const evaluation = SignificanceEvaluator.evaluate(evidence);
    assert.strictEqual(evaluation.significance, 'TRIVIAL');
    assert.strictEqual(evaluation.promotedToDossier, false);
    assert.strictEqual(evaluation.promotedToChronicle, false);
  });
});

describe('HistoricalChronicleEngine Deduplication & Aggregation (CH4.DEDUP, CH4.DOSSIER, CH4.CHRONICLE)', () => {
  it('aggregates evidence into subject dossiers and orders milestones chronologically', () => {
    const engine = new HistoricalChronicleEngine();

    const t1: WorldTimestamp = { ...defaultTimestamp, totalElapsedSeconds: 1000 };
    const t2: WorldTimestamp = { ...defaultTimestamp, totalElapsedSeconds: 2000 };

    engine.recordEvidence({
      id: 'ev_maren_01',
      category: 'WORLD_ANOMALY',
      timestamp: t2,
      primarySubjectId: 'char_maren',
      locationId: 'loc_whispering_orrery',
      summary: 'Reported resonant fracture on third prism ring.',
      details: 'Maren identified acoustic vibration.',
      sourceEventId: 'evt_01',
      provenance: 'direct_observation',
      visibility: 'PUBLIC',
      metadata: { subjectName: 'Maren the Archivist' },
    });

    engine.recordEvidence({
      id: 'ev_maren_02',
      category: 'RELATIONSHIP_MUTATION',
      timestamp: t1,
      primarySubjectId: 'char_maren',
      secondarySubjectId: 'player_vael',
      locationId: 'loc_whispering_orrery',
      summary: 'Swore shared oath to investigate the bedrock tremors.',
      details: 'Maren entrusted optical vernier.',
      sourceEventId: 'evt_02',
      provenance: 'direct_observation',
      visibility: 'PUBLIC',
      metadata: { subjectName: 'Maren the Archivist' },
    });

    const dossier = engine.getDossier('char_maren');
    assert.ok(dossier);
    assert.strictEqual(dossier.subjectId, 'char_maren');
    assert.strictEqual(dossier.milestones.length, 2);
    // Verified chronological sorting: t1 (1000s) must precede t2 (2000s)
    assert.strictEqual(dossier.milestones[0].evidenceId, 'ev_maren_02');
    assert.strictEqual(dossier.milestones[1].evidenceId, 'ev_maren_01');
  });

  it('strictly enforces deterministic deduplication (CH4.DEDUP)', () => {
    const engine = new HistoricalChronicleEngine();

    const evidence: HistoricalEvidence = {
      id: 'ev_dedup_01',
      category: 'LIFECYCLE_TRANSITION',
      timestamp: defaultTimestamp,
      primarySubjectId: 'char_elian',
      locationId: 'loc_lantern_vault',
      summary: 'Master Elian was slain in the cistern collapse.',
      details: 'Deep siphon burst flooded the lower gears.',
      sourceEventId: 'evt_vault_collapse',
      provenance: 'witnessed_event',
      visibility: 'PUBLIC',
    };

    const firstResult = engine.recordEvidence(evidence);
    assert.strictEqual(firstResult.promotedToChronicle, true);

    // Recording identical evidence ID must be rejected by deduplication
    const secondResult = engine.recordEvidence(evidence);
    assert.strictEqual(secondResult.promotedToChronicle, false);

    const chronicle = engine.getChronicleEntries();
    assert.strictEqual(chronicle.length, 1);
  });

  it('guarantees deterministic rebuildability from source evidence (CH4.REBUILD)', () => {
    const engine = new HistoricalChronicleEngine();

    engine.recordEvidence({
      id: 'ev_reb_01',
      category: 'WORLD_ANOMALY',
      timestamp: defaultTimestamp,
      primarySubjectId: 'char_maren',
      locationId: 'loc_whispering_orrery',
      summary: 'Astral rings stopped.',
      details: 'Bedrock shockwave.',
      sourceEventId: 'evt_reb_1',
      provenance: 'direct_observation',
      visibility: 'PUBLIC',
    });

    const beforeDossier = engine.getDossier('char_maren');
    const beforeChronicle = engine.getChronicleEntries();

    // Rebuild from scratch
    engine.rebuildFromEvidence();

    const afterDossier = engine.getDossier('char_maren');
    const afterChronicle = engine.getChronicleEntries();

    assert.deepStrictEqual(beforeDossier, afterDossier);
    assert.deepStrictEqual(beforeChronicle, afterChronicle);
  });
});

describe('Epistemic Projection Boundary for History (CH4.EPISTEMIC)', () => {
  it('strictly masks SECRET and OBSERVERS_ONLY entries from unauthorized player projections', () => {
    const engine = new HistoricalChronicleEngine();
    const playerId = 'player_vael';
    const unauthorizedPlayerId = 'player_intruder';

    // 1. Public event
    engine.recordEvidence({
      id: 'ev_pub_01',
      category: 'WORLD_ANOMALY',
      timestamp: defaultTimestamp,
      primarySubjectId: 'loc_whispering_orrery',
      locationId: 'loc_whispering_orrery',
      summary: 'Public notice: Orrery stopped.',
      details: 'Town crier alert.',
      sourceEventId: 'evt_pub_1',
      provenance: 'broadcast',
      visibility: 'PUBLIC',
    });

    // 2. Secret event confidential to player_vael ONLY
    engine.recordEvidence({
      id: 'ev_secret_01',
      category: 'FACTION_ALIGNMENT',
      timestamp: defaultTimestamp,
      primarySubjectId: 'char_maren',
      locationId: 'loc_whispering_orrery',
      summary: 'Clandestine Chancery mandate received for betrayal investigation.',
      details: 'Signed wax authorization for confidential inquiry into high treason.',
      sourceEventId: 'evt_sec_1',
      provenance: 'private_document',
      visibility: 'SECRET',
      confidentialToEntityIds: [playerId],
    });

    // 3. Secret event confidential to someone else
    engine.recordEvidence({
      id: 'ev_foreign_secret',
      category: 'FACTION_ALIGNMENT',
      timestamp: defaultTimestamp,
      primarySubjectId: 'char_elian',
      locationId: 'loc_lantern_vault',
      summary: 'Clandestine cipher for treason sewn in tunic.',
      details: 'Private conspiracy notes for betrayal of the high vault.',
      sourceEventId: 'evt_sec_2',
      provenance: 'private_thought',
      visibility: 'SECRET',
      confidentialToEntityIds: ['char_chancery_minister'],
    });

    // Player Vael projection
    const vaelChronicle = engine.projectPlayerChronicle(playerId);
    assert.strictEqual(vaelChronicle.length, 2);
    assert.ok(vaelChronicle.some((e) => e.evidenceId === 'ev_pub_01'));
    assert.ok(vaelChronicle.some((e) => e.evidenceId === 'ev_secret_01'));
    assert.strictEqual(vaelChronicle.some((e) => e.evidenceId === 'ev_foreign_secret'), false);

    // Unauthorized player projection
    const intruderChronicle = engine.projectPlayerChronicle(unauthorizedPlayerId);
    assert.strictEqual(intruderChronicle.length, 1);
    assert.strictEqual(intruderChronicle[0].evidenceId, 'ev_pub_01');
  });
});
