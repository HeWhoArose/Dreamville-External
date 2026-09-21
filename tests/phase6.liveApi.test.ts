import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { Server } from 'http';
import { gameRouter } from '../server/api/gameRoutes';

describe('Phase 6 Live HTTP API Test Suite', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/game', gameRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}/api/game`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /spells/catalog returns catalog list and supports query filters', async () => {
    const res = await fetch(`${baseUrl}/spells/catalog`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.count > 0);
    assert.ok(Array.isArray(data.spells));

    // Filter by level
    const levelRes = await fetch(`${baseUrl}/spells/catalog?level=1`);
    assert.equal(levelRes.status, 200);
    const levelData = await levelRes.json();
    assert.ok(levelData.spells.every((s: any) => s.level === 1));

    // Filter by school
    const schoolRes = await fetch(`${baseUrl}/spells/catalog?school=evocation`);
    assert.equal(schoolRes.status, 200);
    const schoolData = await schoolRes.json();
    assert.ok(schoolData.spells.every((s: any) => s.school.toLowerCase() === 'evocation'));
  });

  it('GET /spells/catalog/:spellId returns specific spell or 404', async () => {
    const res = await fetch(`${baseUrl}/spells/catalog/fireball`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.spell.id, 'fireball');
    assert.equal(data.spell.level, 3);

    const missingRes = await fetch(`${baseUrl}/spells/catalog/nonexistent_spell_xyz`);
    assert.equal(missingRes.status, 404);
  });

  it('POST /spells/slots/initialize and GET /spells/actor/:actorId manages slot state', async () => {
    const actorId = 'api_mage_1';
    const initRes = await fetch(`${baseUrl}/spells/slots/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actorId,
        slots: {
          1: { current: 3, max: 3 },
          2: { current: 2, max: 2 },
        },
      }),
    });
    assert.equal(initRes.status, 200);
    const initData = await initRes.json();
    assert.equal(initData.success, true);
    assert.equal(initData.spellSlots[1].max, 3);

    const getRes = await fetch(`${baseUrl}/spells/actor/${actorId}`);
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.success, true);
    assert.equal(getData.state.spellSlots[2].max, 2);
  });

  it('POST /spells/learn and POST /spells/prepare tracks known and prepared spells', async () => {
    const actorId = 'api_mage_2';
    // Learn spell
    const learnRes = await fetch(`${baseUrl}/spells/learn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId, spellId: 'shield' }),
    });
    assert.equal(learnRes.status, 200);
    const learnData = await learnRes.json();
    assert.equal(learnData.success, true);
    assert.ok(learnData.knownSpells.includes('shield'));

    // Prepare spell
    const prepRes = await fetch(`${baseUrl}/spells/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId, spellId: 'shield', prepare: true }),
    });
    assert.equal(prepRes.status, 200);
    const prepData = await prepRes.json();
    assert.equal(prepData.success, true);
    assert.equal(prepData.prepared, true);
    assert.ok(prepData.preparedSpells.includes('shield'));

    // Unprepare spell
    const unprepRes = await fetch(`${baseUrl}/spells/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId, spellId: 'shield', prepare: false }),
    });
    assert.equal(unprepRes.status, 200);
    const unprepData = await unprepRes.json();
    assert.equal(unprepData.success, true);
    assert.equal(unprepData.prepared, false);
    assert.ok(!unprepData.preparedSpells.includes('shield'));
  });

  it('POST /spells/slots/reset resets spell slots on rest', async () => {
    const actorId = 'api_rest_mage';
    await fetch(`${baseUrl}/spells/slots/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actorId,
        slots: { 1: { current: 0, max: 4 } },
      }),
    });

    const resetRes = await fetch(`${baseUrl}/spells/slots/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId, restType: 'LONG' }),
    });
    assert.equal(resetRes.status, 200);
    const resetData = await resetRes.json();
    assert.equal(resetData.success, true);
    assert.equal(resetData.spellSlots[1].current, 4);
  });

  it('POST /spells/evaluate and POST /spells/register-custom adjudicates novel spells', async () => {
    const validProposal = {
      spellName: 'Glacial Spike',
      spellLevel: 1,
      school: 'evocation',
      damageFormula: '2d8',
      damageType: 'cold',
      range: 60,
      casterLevel: 3,
    };

    const evalRes = await fetch(`${baseUrl}/spells/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal: validProposal }),
    });
    assert.equal(evalRes.status, 200);
    const evalData = await evalRes.json();
    assert.equal(evalData.approved, true);

    const regRes = await fetch(`${baseUrl}/spells/register-custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal: validProposal }),
    });
    assert.equal(regRes.status, 200);
    const regData = await regRes.json();
    assert.equal(regData.success, true);
    assert.equal(regData.spell.name, 'Glacial Spike');

    // Verify it is now in the catalog
    const catRes = await fetch(`${baseUrl}/spells/catalog/${regData.spell.id}`);
    assert.equal(catRes.status, 200);
  });

  it('POST /spells/cast executes authoritative cast', async () => {
    const actorId = 'api_caster_active';
    await fetch(`${baseUrl}/spells/slots/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actorId,
        slots: { 1: { current: 2, max: 2 } },
      }),
    });
    await fetch(`${baseUrl}/spells/learn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId, spellId: 'magic_missile' }),
    });
    await fetch(`${baseUrl}/spells/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId, spellId: 'magic_missile', prepare: true }),
    });

    const castRes = await fetch(`${baseUrl}/spells/cast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actorId,
        spellId: 'magic_missile',
        targetId: actorId,
        slotLevel: 1,
      }),
    });
    assert.equal(castRes.status, 200);
    const castData = await castRes.json();
    assert.equal(castData.success, true);
    assert.ok((castData.damageInflicted || 0) > 0);
  });

  it('POST /spells/concentration/break breaks active concentration', async () => {
    const actorId = 'api_conc_actor';
    const breakRes = await fetch(`${baseUrl}/spells/concentration/break`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId, reason: 'Voluntary cancel' }),
    });
    assert.equal(breakRes.status, 200);
    const breakData = await breakRes.json();
    assert.equal(breakData.success, true);
  });
});
