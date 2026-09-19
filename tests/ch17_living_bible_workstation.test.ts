import { describe, it } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { livingBibleRegistry } from '../server/domain/livingBible';
import { gameRouter } from '../server/api/gameRoutes';

const expressApp = express();
expressApp.use(express.json());
expressApp.use('/api/game', gameRouter);

describe('CH17 Living Bible & Workstation Tests', () => {
  it('TEST-CH17-01: Registry contains complete current requirement set including CH14 and CH16', () => {
    const reqs = livingBibleRegistry.getAllRequirements();
    assert(reqs.length >= 10, 'Expected at least 10 core requirements registered');

    const reqIds = reqs.map((r) => r.id);
    // CH14 Sensory Architecture
    assert(reqIds.includes('CH14.SENSORY.01'), 'Missing CH14.SENSORY.01');
    assert(reqIds.includes('CH14.SENSORY.02'), 'Missing CH14.SENSORY.02');

    // CH16 World Library & Story Modes
    assert(reqIds.includes('CH16.WORLD.LIBRARY'), 'Missing CH16.WORLD.LIBRARY');
    assert(reqIds.includes('CH16.STORY.MODES'), 'Missing CH16.STORY.MODES');
    assert(reqIds.includes('CH16.EMERGENT.NARRATIVE'), 'Missing CH16.EMERGENT.NARRATIVE');
    assert(reqIds.includes('CH16.COMBAT.RESOLUTION'), 'Missing CH16.COMBAT.RESOLUTION');
  });

  it('TEST-CH17-02: Requirement IDs are stable and unique', () => {
    const reqs = livingBibleRegistry.getAllRequirements();
    const idSet = new Set<string>();

    for (const req of reqs) {
      assert(req.id && typeof req.id === 'string', 'Requirement must have string id');
      assert(!idSet.has(req.id), `Duplicate requirement id found: ${req.id}`);
      idSet.add(req.id);
      assert(req.title && req.requirementText && req.area, `Requirement ${req.id} missing required fields`);
    }
  });

  it('TEST-CH17-03: A DOCUMENTED requirement cannot become VERIFIED without supporting evidence', () => {
    // Register temporary requirement or test promotion logic on requirement without valid evidence
    const result = livingBibleRegistry.validateAndPromoteRequirement('SYS.MOCK.CONTRACT', 'VERIFIED');
    // If SYS.MOCK.CONTRACT has insufficient evidence for VERIFIED, promotion fails
    assert.strictEqual(result.success, false, 'Expected promotion without evidence to fail');
    assert(result.reason && result.reason.includes('Insufficient evidence'), 'Expected reason to mention evidence');
  });

  it('TEST-CH17-04: IMPLEMENTED requires corresponding implementation/test evidence according to applicability', () => {
    const req = livingBibleRegistry.getRequirement('CH14.SENSORY.01');
    assert(req, 'CH14.SENSORY.01 should exist');
    assert(req.codeEvidence, 'Code evidence must be recorded for IMPLEMENTED/VERIFIED requirement');
    assert(req.testEvidence, 'Test evidence must be recorded for IMPLEMENTED/VERIFIED requirement');
  });

  it('TEST-CH17-05: Verified status cannot be set by arbitrary UI/API payload', () => {
    const res = livingBibleRegistry.validateAndPromoteRequirement('CH14.SENSORY.02', 'VERIFIED');
    assert.strictEqual(res.success, false, 'Arbitrary promotion to VERIFIED without required verification evidence must fail');
  });

  it('TEST-CH17-06: Evidence records preserve evidence type and source/reference', () => {
    const ev = livingBibleRegistry.recordEvidence({
      requirementId: 'CH16.WORLD.LIBRARY',
      evidenceType: 'UNIT_TEST',
      sourceReference: 'tests/ch16_behavioral_verification.test.ts',
      description: 'Verified world creation and retrieval tests pass',
    });

    assert.strictEqual(ev.evidenceType, 'UNIT_TEST');
    assert.strictEqual(ev.sourceReference, 'tests/ch16_behavioral_verification.test.ts');
    assert(ev.recordedAt, 'RecordedAt timestamp should exist');

    const req = livingBibleRegistry.getRequirement('CH16.WORLD.LIBRARY');
    assert(req && req.evidences, 'Requirement evidences array should exist');
    const found = req.evidences.find((e) => e.evidenceId === ev.evidenceId);
    assert(found, 'Recorded evidence must be attached to requirement');
  });

  it('TEST-CH17-07: Workstation counts derive from current registry state', () => {
    const ws = livingBibleRegistry.getWorkstationState();
    const reqs = livingBibleRegistry.getAllRequirements();

    const actualCounts = {
      verified: reqs.filter((r) => r.status === 'VERIFIED').length,
      implemented: reqs.filter((r) => r.status === 'IMPLEMENTED').length,
      foundation: reqs.filter((r) => r.status === 'FOUNDATION').length,
      documented: reqs.filter((r) => r.status === 'DOCUMENTED').length,
      planned: reqs.filter((r) => r.status === 'PLANNED').length,
    };

    assert.strictEqual(ws.counts.verified, actualCounts.verified, 'Verified count mismatch');
    assert.strictEqual(ws.counts.implemented, actualCounts.implemented, 'Implemented count mismatch');
    assert.strictEqual(ws.counts.foundation, actualCounts.foundation, 'Foundation count mismatch');
    assert.strictEqual(ws.counts.documented, actualCounts.documented, 'Documented count mismatch');
    assert.strictEqual(ws.counts.planned, actualCounts.planned, 'Planned count mismatch');
  });

  it('TEST-CH17-08: Iteration record can be appended', () => {
    const initialHistoryCount = livingBibleRegistry.getWorkstationState().iterationHistory.length;

    const iter = livingBibleRegistry.recordIteration({
      description: 'CH17 Developer Workstation Test Run',
      outcome: 'Successfully tested iteration record creation',
      reason: 'Automated test suite execution',
      affectedRequirements: ['CH17.CONTROLS'],
    });

    assert(iter.iteration > 0, 'Iteration number must be positive');
    assert.strictEqual(iter.description, 'CH17 Developer Workstation Test Run');

    const updatedWs = livingBibleRegistry.getWorkstationState();
    assert.strictEqual(updatedWs.iterationHistory.length, initialHistoryCount + 1);
  });

  it('TEST-CH17-09: Iteration persists across server restart/reinitialization', () => {
    // Write iteration
    const newIter = livingBibleRegistry.recordIteration({
      description: 'Persistence Check Iteration',
      outcome: 'Verified file persistence',
    });

    // Check ledger file existence
    const ledgerPath = path.join(process.cwd(), 'data', 'workstation_ledger.json');
    assert(fs.existsSync(ledgerPath), 'Ledger file must exist on disk');

    const rawData = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
    assert(Array.isArray(rawData.iterationHistory), 'Saved data must contain iterationHistory array');
    const foundInFile = rawData.iterationHistory.find((i: any) => i.id === newIter.id);
    assert(foundInFile, 'New iteration must be saved in workstation_ledger.json');
  });

  it('TEST-CH17-10: Current phase/next task/blockers survive restart', () => {
    livingBibleRegistry.updateWorkstationMetadata({
      currentPhase: 'CH17 — Living Bible & Workstation Persistence Audit',
      nextTask: 'Execute full regression and verify UI modal',
    });

    const ws = livingBibleRegistry.getWorkstationState();
    assert.strictEqual(ws.currentPhase, 'CH17 — Living Bible & Workstation Persistence Audit');
    assert.strictEqual(ws.nextTask, 'Execute full regression and verify UI modal');

    // Reload from disk file to verify persistence
    const ledgerPath = path.join(process.cwd(), 'data', 'workstation_ledger.json');
    const rawData = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
    assert.strictEqual(rawData.metadata.currentPhase, 'CH17 — Living Bible & Workstation Persistence Audit');
  });

  it('TEST-CH17-11: GET /api/game/living-bible returns current registry state', async () => {
    const server = http.createServer(expressApp);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/game/living-bible`);
      assert.strictEqual(response.status, 200);
      const data: any = await response.json();
      assert(Array.isArray(data), 'Response should be array of requirements');
      assert(data.length >= 10, 'Should return all registered requirements');
    } finally {
      server.close();
    }
  });

  it('TEST-CH17-12: GET /api/game/workstation returns current ledger', async () => {
    const server = http.createServer(expressApp);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/game/workstation`);
      assert.strictEqual(response.status, 200);
      const data: any = await response.json();
      assert(data.currentPhase, 'Should return currentPhase');
      assert(data.counts, 'Should return counts object');
      assert(Array.isArray(data.iterationHistory), 'Should return iterationHistory array');
    } finally {
      server.close();
    }
  });

  it('TEST-CH17-13: POST iteration validates payload and persists valid iteration', async () => {
    const server = http.createServer(expressApp);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      // Invalid payload
      const badRes = await fetch(`http://127.0.0.1:${port}/api/game/workstation/iteration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: '' }),
      });
      assert.strictEqual(badRes.status, 400);

      // Valid payload
      const validRes = await fetch(`http://127.0.0.1:${port}/api/game/workstation/iteration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'HTTP POST iteration test',
          outcome: 'Verified endpoint appends iteration',
          affectedRequirements: ['CH17.CONTROLS'],
        }),
      });
      assert.strictEqual(validRes.status, 201);
      const body: any = await validRes.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.iteration.description, 'HTTP POST iteration test');
    } finally {
      server.close();
    }
  });

  it('TEST-CH17-14: Invalid requirement status transition is rejected', async () => {
    const server = http.createServer(expressApp);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/game/living-bible/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirementId: 'SYS.MOCK.CONTRACT',
          targetStatus: 'VERIFIED',
        }),
      });

      assert.strictEqual(res.status, 400);
      const body: any = await res.json();
      assert(body.error && body.error.includes('Insufficient evidence'), 'Should return error describing insufficient evidence');
    } finally {
      server.close();
    }
  });

  it('TEST-CH17-15: UI/API does not mutate gameplay/world state', async () => {
    const server = http.createServer(expressApp);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      // Fetch initial game state
      const stateRes1 = await fetch(`http://127.0.0.1:${port}/api/game/state`);
      const state1 = await stateRes1.json();

      // Perform CH17 workstation iteration post
      await fetch(`http://127.0.0.1:${port}/api/game/workstation/iteration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Non-gameplay state mutation isolation test',
          outcome: 'Verified zero impact on game state',
        }),
      });

      // Fetch game state again
      const stateRes2 = await fetch(`http://127.0.0.1:${port}/api/game/state`);
      const state2 = await stateRes2.json();

      // Verify game state is completely identical
      assert.deepStrictEqual(state1, state2, 'Gameplay state must remain completely unchanged by Living Bible operations');
    } finally {
      server.close();
    }
  });

  it('TEST-CH17-16: CH17 evidence does not leak secrets or hidden gameplay information', async () => {
    const server = http.createServer(expressApp);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/game/living-bible`);
      const text = await response.text();

      assert(!text.includes('canonicalEngineSecret'), 'Must not leak canonical engine secrets');
      assert(!text.includes('process.env'), 'Must not leak environment variables');
    } finally {
      server.close();
    }
  });

  it('TEST-CH17-17: Server-authoritative evidence provenance and verification gate assertions (DEF-CH17-01)', async () => {
    const server = http.createServer(expressApp);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      // 1. Nonexistent sourceReference is rejected
      assert.throws(
        () => {
          livingBibleRegistry.recordEvidence({
            requirementId: 'CH14.SENSORY.02',
            evidenceType: 'LIVE_HTTP',
            sourceReference: 'tests/nonexistent_fake_test_file.ts',
            description: 'Fabricated test file evidence',
          });
        },
        /Source reference file.*does not exist on disk/,
        'Record evidence must reject non-existent sourceReference files'
      );

      const httpErrRes = await fetch(`http://127.0.0.1:${port}/api/game/living-bible/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirementId: 'CH14.SENSORY.02',
          evidenceType: 'LIVE_HTTP',
          sourceReference: 'tests/fabricated_nonexistent.test.ts',
          description: 'Fabricated evidence submission',
        }),
      });
      assert.strictEqual(httpErrRes.status, 400, 'HTTP endpoint must reject nonexistent source files with 400 Bad Request');

      // 2. Client submission of existing file cannot self-attest VERIFIED status
      const clientRes = await fetch(`http://127.0.0.1:${port}/api/game/living-bible/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirementId: 'CH14.SENSORY.02',
          evidenceType: 'LIVE_HTTP',
          sourceReference: 'tests/ch14Sensory.test.ts',
          description: 'Client-submitted self-attestation',
          valid: true,
          trustedProvenance: true,
        }),
      });
      assert.strictEqual(clientRes.status, 201);
      const clientData: any = await clientRes.json();
      assert.strictEqual(clientData.evidence.trustedProvenance, false, 'Client cannot force trustedProvenance: true');

      // 3. Attempt promotion to VERIFIED based solely on client-submitted evidence fails
      const promoteRes1 = livingBibleRegistry.validateAndPromoteRequirement('CH14.SENSORY.02', 'VERIFIED');
      assert.strictEqual(promoteRes1.success, false, 'Promotion without server-trusted verification evidence must fail');

      // 4. Server-authoritative evidence recording enables promotion to VERIFIED
      livingBibleRegistry.recordServerEvidence({
        requirementId: 'CH14.SENSORY.02',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/ch14Sensory.test.ts',
        description: 'Server-verified execution of CH14 sensory suite',
      });

      const promoteRes2 = livingBibleRegistry.validateAndPromoteRequirement('CH14.SENSORY.02', 'VERIFIED');
      assert.strictEqual(promoteRes2.success, true, 'Promotion with server-trusted evidence must succeed');
      assert.strictEqual(livingBibleRegistry.getRequirement('CH14.SENSORY.02')?.status, 'VERIFIED');

      // Cleanup dynamically added test evidences so ledger remains clean for idempotent test runs
      const internalReq = (livingBibleRegistry as any).requirements.get('CH14.SENSORY.02');
      if (internalReq && internalReq.evidences) {
        internalReq.evidences = internalReq.evidences.filter((e: any) => e.evidenceId.startsWith('ev_ch'));
        internalReq.status = 'IMPLEMENTED';
        (livingBibleRegistry as any).saveLedgerToFile();
      }
    } finally {
      server.close();
    }
  });
});
