import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import http, { Server } from 'http';
import {
  CapabilityEngine,
  CapabilityDefinition,
  SynthesizeCustomPowerParams,
  FreeformActionRequest,
} from '../server/domain/capabilityEngine';
import { gameRouter } from '../server/api/gameRoutes';
import { worldRepository } from '../server/repositories/worldRepository';

describe('CH7 Comprehensive Verification: Concept-to-Mechanics / Custom Capability Synthesis', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/game', gameRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}/api/game`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  // =========================================================================
  // Target #1: Full Structured Synthesis & Mechanics Mapping
  // =========================================================================
  describe('Target #1: Full Structured Capability Synthesis', () => {
    it('synthesizes structured capability with deterministically inferred fields from concept tags', () => {
      const engine = new CapabilityEngine();
      const res = engine.synthesizeCustomPower({
        actorId: 'test_actor_1',
        conceptName: 'Astral Warp Burst',
        description: 'Blasts an expansive dimensional tear across the battlefield.',
        tags: ['movement', 'teleport', 'aoe', 'ranged', 'quick'],
        powerTier: 'Major',
      });

      assert.strictEqual(res.primaryCapability.id, 'cap_synth_1');
      assert.strictEqual(res.primaryCapability.name, 'Astral Warp Burst');
      assert.strictEqual(res.primaryCapability.category, 'Movement');
      assert.strictEqual(res.primaryCapability.activationMode, 'immediate');
      assert.strictEqual(res.primaryCapability.targetType, 'area_of_effect');
      assert.strictEqual(res.primaryCapability.rangeScope, 'ranged');
      assert.strictEqual(res.primaryCapability.actionType, 'bonus_action');
      assert.strictEqual(res.primaryCapability.powerTier, 'Major');
      assert.strictEqual(res.primaryCapability.baseEnergyCost, 20);
      assert.strictEqual(res.primaryCapability.baseStrainCost, 10);
      assert.strictEqual(res.primaryCapability.minVesselCapacityRequired, 30);

      // Verify derived techniques are created and registered as first-class capabilities
      assert.strictEqual(res.derivedSkills.length, 3);
      const techSurge = engine.getCapability('cap_synth_1_tech_surge');
      const techStrike = engine.getCapability('cap_synth_1_tech_strike');
      const techWard = engine.getCapability('cap_synth_1_tech_ward');

      assert.ok(techSurge, 'Core Surge derived technique must exist in registry');
      assert.ok(techStrike, 'Focused Strike derived technique must exist in registry');
      assert.ok(techWard, 'Shielding Ward derived technique must exist in registry');

      assert.strictEqual(techSurge.targetType, 'self');
      assert.strictEqual(techSurge.actionType, 'bonus_action');
      assert.strictEqual(techStrike.targetType, 'single_target');
      assert.strictEqual(techWard.targetType, 'self');
      assert.strictEqual(techWard.actionType, 'reaction');

      // Verify actor acquired all 4 capabilities
      const learned = engine.getActorCapabilities('test_actor_1');
      const ids = learned.map((c) => c.id);
      assert.ok(ids.includes('cap_synth_1'));
      assert.ok(ids.includes('cap_synth_1_tech_surge'));
      assert.ok(ids.includes('cap_synth_1_tech_strike'));
      assert.ok(ids.includes('cap_synth_1_tech_ward'));
    });

    it('honors explicitly specified structured mechanics parameters', () => {
      const engine = new CapabilityEngine();
      const res = engine.synthesizeCustomPower({
        actorId: 'test_actor_2',
        conceptName: 'Abyssal Chains',
        description: 'Binds the soul of a foe in place.',
        tags: ['magic', 'dark'],
        powerTier: 'Moderate',
        targetType: 'single_target',
        rangeScope: 'melee',
        actionType: 'action',
        cooldownTurns: 3,
        durationTurns: 2,
        restrictions: ['Target must have physical form'],
        counters: ['Holy Ward'],
      });

      assert.strictEqual(res.primaryCapability.targetType, 'single_target');
      assert.strictEqual(res.primaryCapability.rangeScope, 'melee');
      assert.strictEqual(res.primaryCapability.actionType, 'action');
      assert.strictEqual(res.primaryCapability.cooldownTurns, 3);
      assert.strictEqual(res.primaryCapability.durationTurns, 2);
      assert.deepStrictEqual(res.primaryCapability.restrictions, ['Target must have physical form']);
      assert.deepStrictEqual(res.primaryCapability.counters, ['Holy Ward']);
    });
  });

  // =========================================================================
  // Target #5: Canonical Identity and Collision Safety
  // =========================================================================
  describe('Target #5: Canonical Identity and Archive Collision Safety', () => {
    it('restores synthesis counter and reconciles against existing synthesized capability IDs on import', () => {
      const engine1 = new CapabilityEngine();
      engine1.synthesizeCustomPower({
        actorId: 'actor_a',
        conceptName: 'Flame Dart',
        description: 'Shoots a flame dart',
        tags: ['combat', 'fire'],
        powerTier: 'Minor',
      });
      engine1.synthesizeCustomPower({
        actorId: 'actor_a',
        conceptName: 'Frost Wall',
        description: 'Summons a frost wall',
        tags: ['magic', 'ice', 'barrier'],
        powerTier: 'Moderate',
      });

      const exported = engine1.exportState();
      assert.strictEqual(exported.synthesisCounter, 2);

      const engine2 = new CapabilityEngine();
      engine2.importState(exported);

      // Synthesizing next capability in engine2 must produce cap_synth_3, NOT cap_synth_1
      const synth3 = engine2.synthesizeCustomPower({
        actorId: 'actor_b',
        conceptName: 'Lightning Arc',
        description: 'Arcs electricity',
        tags: ['magic', 'lightning'],
        powerTier: 'Major',
      });

      assert.strictEqual(synth3.primaryCapability.id, 'cap_synth_3');
      assert.ok(engine2.getCapability('cap_synth_1'), 'cap_synth_1 must still exist');
      assert.ok(engine2.getCapability('cap_synth_2'), 'cap_synth_2 must still exist');
      assert.ok(engine2.getCapability('cap_synth_3'), 'cap_synth_3 must exist without collision');
    });
  });

  // =========================================================================
  // Target #2: Freeform Action Interpretation Pipeline
  // =========================================================================
  describe('Target #2: Freeform Action Interpretation Pipeline', () => {
    it('maps to EXISTING_CAPABILITY when actor uses an exact known capability', () => {
      const engine = new CapabilityEngine();
      engine.acquireSkill('player_hero', 'cap_fireball');
      const res = engine.interpretFreeformAction({
        actorId: 'player_hero',
        actionText: 'Fireball',
      });

      assert.strictEqual(res.interpretationType, 'EXISTING_CAPABILITY');
      assert.strictEqual(res.validationSuccess, true);
      assert.strictEqual(res.mappedCapability?.id, 'cap_fireball');
      assert.ok(res.executionGate);
      assert.notStrictEqual(res.executionGate.status, 'ELIGIBILITY_BLOCKED');
    });

    it('maps to CONTEXTUAL_MODIFICATION when freeform effort modifiers (e.g. overcharge) are described without mutating base capability', () => {
      const engine = new CapabilityEngine();
      engine.acquireSkill('player_hero', 'cap_fireball');
      const originalFireballCost = engine.getCapability('cap_fireball')?.baseEnergyCost;

      const res = engine.interpretFreeformAction({
        actorId: 'player_hero',
        actionText: 'I cast Fireball with maximum overcharge power',
      });

      assert.strictEqual(res.interpretationType, 'CONTEXTUAL_MODIFICATION');
      assert.strictEqual(res.validationSuccess, true);
      assert.strictEqual(res.mappedCapability?.id, 'cap_fireball');
      assert.ok(res.appliedModifiers && res.appliedModifiers.length > 0);
      assert.strictEqual(res.appliedModifiers[0].modifierType, 'OVERCHARGE');

      // Base capability in registry MUST remain unmutated
      assert.strictEqual(engine.getCapability('cap_fireball')?.baseEnergyCost, originalFireballCost);
    });

    it('proposes NOVEL_CAPABILITY_PROPOSAL for unknown concepts without state mutation when executeIfValid is false', () => {
      const engine = new CapabilityEngine();
      const initialCount = engine.getAllCapabilities().length;

      const res = engine.interpretFreeformAction({
        actorId: 'player_hero',
        actionText: 'I weave a blanket of sonic dampening shadows to deafen all enemies in the room',
        tags: ['shadow', 'sound', 'aoe', 'debuff'],
        executeIfValid: false,
      });

      assert.strictEqual(res.interpretationType, 'NOVEL_CAPABILITY_PROPOSAL');
      assert.strictEqual(res.validationSuccess, true);
      assert.ok(res.proposedCapability);
      assert.strictEqual(res.proposedCapability.targetType, 'area_of_effect');

      // Registry count must NOT have increased (no side-effects during preview)
      assert.strictEqual(engine.getAllCapabilities().length, initialCount);
    });

    it('keeps novel capability requests preview-only even when executeIfValid is true', () => {
      const engine = new CapabilityEngine();
      const initialCount = engine.getAllCapabilities().length;

      const res = engine.interpretFreeformAction({
        actorId: 'player_hero',
        actionText: 'I channel a vortex of cryogenic mist to freeze the floor',
        tags: ['ice', 'cold', 'aoe'],
        executeIfValid: true,
      });

      assert.strictEqual(res.interpretationType, 'NOVEL_CAPABILITY_PROPOSAL');
      assert.strictEqual(res.validationSuccess, true);
      assert.ok(res.proposedCapability);
      assert.equal(res.adjudicationConsequence, undefined);
      assert.equal(res.derivedTechniques, undefined);
      assert.strictEqual(engine.getAllCapabilities().length, initialCount);
    });

    it('returns UNSUPPORTED for empty or blank action text', () => {
      const engine = new CapabilityEngine();
      const res = engine.interpretFreeformAction({
        actorId: 'player_hero',
        actionText: '   ',
      });

      assert.strictEqual(res.interpretationType, 'UNSUPPORTED');
      assert.strictEqual(res.validationSuccess, false);
      assert.ok(res.rejectionReason);
    });
  });

  // =========================================================================
  // Target #6 & #12: HTTP API Endpoints Validation & Contract
  // =========================================================================
  describe('Target #6 & #12: Live HTTP Endpoints for Synthesis & Interpretation', () => {
    it('POST /api/game/capabilities/synthesize strictly rejects invalid powerTier with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/capabilities/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conceptName: 'Invalid Tier Power',
          description: 'Testing invalid tier',
          powerTier: 'UltraGodlikeOverlord',
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.errorReason.includes('Invalid powerTier'));
    });

    it('POST /api/game/capabilities/synthesize creates structured power and records CH4 evidence', async () => {
      const res = await fetch(`${baseUrl}/capabilities/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dreamville-internal-ai': 'true',
        },
        body: JSON.stringify({
          conceptName: 'Solar Flare Ward',
          description: 'Erects a blinding barrier of pure solar radiation.',
          tags: ['magic', 'solar', 'light', 'ward', 'barrier'],
          powerTier: 'Moderate',
          targetType: 'self',
          actionType: 'reaction',
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.primaryCapability);
      assert.strictEqual(data.primaryCapability.name, 'Solar Flare Ward');
      assert.strictEqual(data.primaryCapability.targetType, 'self');
      assert.strictEqual(data.primaryCapability.actionType, 'reaction');
      assert.strictEqual(data.derivedSkills.length, 3);
    });

    it('POST /api/game/capabilities/interpret processes freeform action over HTTP', async () => {
      const res = await fetch(`${baseUrl}/capabilities/interpret`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dreamville-internal-ai': 'true',
        },
        body: JSON.stringify({
          actionText: 'Fireball',
          executeIfValid: false,
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.interpretationType, 'EXISTING_CAPABILITY');
      assert.strictEqual(data.mappedCapability?.id, 'cap_fireball');
    });
  });
});
