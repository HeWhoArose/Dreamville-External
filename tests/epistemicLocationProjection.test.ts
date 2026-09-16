import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer, Server } from 'node:http';
import express from 'express';
import { serverMockAuthority } from '../server/mockEngine/serverMockAuthority';
import { worldRepository } from '../server/repositories/worldRepository';
import { ExternalViewState, ActionResult } from '../src/types';

describe('CHALLENGE 2 — Epistemic Boundary & Player Knowledge Horizon (CH2.MAP_MASK)', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    serverMockAuthority.resetToCanonicalState('default_story');

    const app = express();
    app.use(express.json());

    app.get('/api/game/state', (_req, res) => {
      res.json(serverMockAuthority.getSanitizedViewState());
    });

    app.post('/api/game/action', (req, res) => {
      const result = serverMockAuthority.processAction(req.body);
      res.json(result);
    });

    await new Promise<void>((resolve) => {
      server = createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr !== null) {
          baseUrl = `http://127.0.0.1:${addr.port}/api/game`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('1. Server canonical state retains undiscovered locations, but client projection excludes them', async () => {
    // 1. Check server canonical state
    const canonicalLocations = serverMockAuthority.getCanonicalLocations();
    assert.ok(
      canonicalLocations['loc_sunken_scriptorium'],
      'Server canonical world MUST contain loc_sunken_scriptorium'
    );
    assert.strictEqual(
      canonicalLocations['loc_sunken_scriptorium'].discovered,
      false,
      'loc_sunken_scriptorium must be undiscovered in server canonical state'
    );

    // 2. Fetch live client state via GET /api/game/state
    const res = await fetch(`${baseUrl}/state`);
    assert.strictEqual(res.status, 200);
    const clientState = (await res.json()) as ExternalViewState;

    // 3. Client projection must NOT contain loc_sunken_scriptorium
    assert.strictEqual(
      clientState.locations['loc_sunken_scriptorium'],
      undefined,
      'Client projection MUST NOT expose undiscovered location loc_sunken_scriptorium'
    );

    // 4. EVERY location in client projection must have discovered: true
    const clientLocationList = Object.values(clientState.locations);
    assert.ok(clientLocationList.length > 0, 'Client should receive discovered locations');
    for (const loc of clientLocationList) {
      assert.strictEqual(
        loc.discovered,
        true,
        `Projected location ${loc.id} (${loc.name}) must have discovered: true`
      );
      assert.notStrictEqual(
        loc.discovered,
        false,
        `No location with discovered: false may be exposed to client`
      );
    }

    // 5. Total count check: Server has more locations than client projection
    const serverCount = Object.keys(canonicalLocations).length;
    const clientCount = Object.keys(clientState.locations).length;
    assert.ok(
      clientCount < serverCount,
      `Client count (${clientCount}) must be strictly less than canonical server count (${serverCount})`
    );
  });

  it('2. Travel to undiscovered location is rejected by server epistemic authority', async () => {
    const travelRes = await fetch(`${baseUrl}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'TRAVEL_REQUEST',
        targetLocationId: 'loc_sunken_scriptorium',
      }),
    });
    assert.strictEqual(travelRes.status, 200);
    const result = (await travelRes.json()) as ActionResult;

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'MOCK_ENGINE_REJECTED');
    assert.ok(
      result.message.includes('uncharted') ||
      result.message.includes('undiscovered') ||
      result.message.includes('inaccessible')
    );
  });

  it('3. Legitimate discovery event expands client projection horizon deterministically', async () => {
    // Player charts / discovers loc_sunken_scriptorium through canonical action
    const discoverRes = await fetch(`${baseUrl}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'DISCOVER_LOCATION',
        targetLocationId: 'loc_sunken_scriptorium',
      }),
    });
    assert.strictEqual(discoverRes.status, 200);
    const discoverResult = (await discoverRes.json()) as ActionResult;

    assert.strictEqual(discoverResult.success, true);
    assert.strictEqual(discoverResult.status, 'MOCK_ENGINE_COMMITTED');

    // Fetch live state again: loc_sunken_scriptorium is now legitimately present
    const stateRes = await fetch(`${baseUrl}/state`);
    const updatedState = (await stateRes.json()) as ExternalViewState;

    assert.ok(
      updatedState.locations['loc_sunken_scriptorium'] !== undefined,
      'Newly discovered location must now be present in client projection'
    );
    assert.strictEqual(
      updatedState.locations['loc_sunken_scriptorium'].discovered,
      true,
      'Newly discovered location must be flagged discovered: true'
    );
  });
});
