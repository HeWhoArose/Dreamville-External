import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import http, { Server } from 'http';
import {
  CapabilityEngine,
  CapabilityDefinition,
  SkillInstance,
  DEFAULT_PROGRESSION_POLICY,
  WorldProgressionPolicy,
} from '../server/domain/capabilityEngine';
import {
  TacticalCombatEngine,
  BattlefieldParticipant,
} from '../server/domain/combatEngine';
import {
  ReusableSkillRegistry,
  ReusableSkill,
  TargetWorldContext,
} from '../server/domain/reusableSkillRegistry';
import { gameRouter } from '../server/api/gameRoutes';
import { worldRepository } from '../server/repositories/worldRepository';

describe('CH6 Comprehensive Verification: Dynamic Powers & Progression', () => {
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
  // Phase A: SkillDefinition vs. SkillInstance Architecture
  // =========================================================================
  describe('Phase A: SkillDefinition vs. SkillInstance Architectural Separation', () => {
    it('guarantees CapabilityDefinition remains immutable when SkillInstance evolves and levels up', () => {
      const engine = new CapabilityEngine();
      const capDef = engine.getCapability('cap_fireball');
      assert.ok(capDef, 'Base capability cap_fireball must exist');
      const originalEnergyCost = capDef.baseEnergyCost;
      const originalName = capDef.name;

      // Acquire for Actor 1
      const inst1 = engine.acquireSkill('actor_1', 'cap_fireball');
      assert.strictEqual(inst1.currentLevel, 1);
      assert.strictEqual(inst1.currentXp, 0);

      // Level up Actor 1 multiple times
      engine.awardSkillXp('actor_1', 'cap_fireball', 350);
      const updatedInst1 = engine.getSkillInstance('actor_1', 'cap_fireball')!;
      assert.ok(updatedInst1.currentLevel > 1, 'Actor 1 skill should have leveled up');

      // Verify CapabilityDefinition was NOT mutated
      const capDefAfter = engine.getCapability('cap_fireball')!;
      assert.strictEqual(capDefAfter.baseEnergyCost, originalEnergyCost, 'Base energy cost must remain unchanged');
      assert.strictEqual(capDefAfter.name, originalName, 'Base name must remain unchanged');

      // Verify another actor can acquire from the same clean definition
      const inst2 = engine.acquireSkill('actor_2', 'cap_fireball');
      assert.strictEqual(inst2.currentLevel, 1, 'Actor 2 must start at base level 1');
      assert.strictEqual(inst2.currentXp, 0, 'Actor 2 must start at 0 XP');
    });
  });

  // =========================================================================
  // Phase B: Progression State, XP Awards, Evolution, Downgrades & Lineage
  // =========================================================================
  describe('Phase B: Progression State, Audit History & Evolution Lineage', () => {
    it('awards XP, handles multi-level progressions, and records detailed audit history', () => {
      const engine = new CapabilityEngine();
      const actorId = 'actor_progression_test';
      engine.acquireSkill(actorId, 'cap_fireball');

      // Award XP (level 1 requires 100 XP, level 2 requires 200 XP)
      const res1 = engine.awardSkillXp(actorId, 'cap_fireball', 150);
      assert.strictEqual(res1.leveledUp, true);
      assert.strictEqual(res1.instance.currentLevel, 2);
      assert.strictEqual(res1.instance.currentXp, 50);
      assert.strictEqual(res1.instance.evolutionPoints, 1);

      // Audit history verification
      const history = res1.instance.progressionHistory;
      assert.ok(history.length >= 2, 'History must contain ACQUIRED and LEVEL_UP entries');
      assert.strictEqual(history[0].changeType, 'ACQUIRED');
      assert.strictEqual(history[history.length - 1].changeType, 'LEVEL_UP');
      assert.strictEqual(history[history.length - 1].newLevel, 2);
    });

    it('evolves skill along DAG branch, updating lineage and preserving history', () => {
      const engine = new CapabilityEngine();
      const actorId = 'actor_evolution_test';
      engine.acquireSkill(actorId, 'cap_fireball');

      // Register advanced evolution capability
      const evolvedCap: CapabilityDefinition = {
        id: 'cap_pyroclastic_burst',
        name: 'Pyroclastic Burst',
        category: 'Magic',
        activationMode: 'immediate',
        powerTier: 'Major',
        baseEnergyCost: 15,
        baseStrainCost: 5,
        minVesselCapacityRequired: 20,
        description: 'Evolved volcanic eruption of pressurized fire and ash.',
        provenance: 'evolution:cap_fireball',
      };
      engine.registerCapability(evolvedCap);

      const evolvedInstance = engine.evolveSkill(actorId, 'cap_fireball', 'cap_pyroclastic_burst');
      assert.strictEqual(evolvedInstance.capabilityId, 'cap_pyroclastic_burst');
      assert.deepStrictEqual(evolvedInstance.evolutionLineage, ['cap_fireball', 'cap_pyroclastic_burst']);
      
      const lastHistory = evolvedInstance.progressionHistory[evolvedInstance.progressionHistory.length - 1];
      assert.strictEqual(lastHistory.changeType, 'EVOLVED');
      assert.ok(lastHistory.details.includes('cap_fireball'));

      // Old capability instance should be unlinked from active actor map
      assert.strictEqual(engine.getSkillInstance(actorId, 'cap_fireball'), undefined);
      assert.ok(engine.getSkillInstance(actorId, 'cap_pyroclastic_burst'));
    });

    it('supports deterministic downgrade and relearning with audit logging', () => {
      const engine = new CapabilityEngine();
      const actorId = 'actor_downgrade_test';
      engine.acquireSkill(actorId, 'cap_fireball');
      engine.awardSkillXp(actorId, 'cap_fireball', 300); // reaches level 3

      const instBefore = engine.getSkillInstance(actorId, 'cap_fireball')!;
      assert.strictEqual(instBefore.currentLevel, 3);

      // Downgrade to level 2
      const downgraded = engine.downgradeSkill(actorId, 'cap_fireball', 2, 'Curse of Enfeeblement');
      assert.strictEqual(downgraded.currentLevel, 2);
      const downEntry = downgraded.progressionHistory[downgraded.progressionHistory.length - 1];
      assert.strictEqual(downEntry.changeType, 'DOWNGRADED');
      assert.ok(downEntry.details.includes('Curse of Enfeeblement'));

      // Relearn
      const relearned = engine.relearnSkill(actorId, 'cap_fireball', 'Sanctified Blessing of Memory');
      const relEntry = relearned.progressionHistory[relearned.progressionHistory.length - 1];
      assert.strictEqual(relEntry.changeType, 'RELEARNED');
      assert.ok(relEntry.details.includes('Sanctified Blessing'));
    });
  });

  // =========================================================================
  // Phase C: Tactical Combat Activation Lifecycle & Interruption
  // =========================================================================
  describe('Phase C: Tactical Combat Activation Modes, Countdown & Interruption', () => {
    it('manages charged capability lifecycle and interruption upon damage', () => {
      const combat = new TacticalCombatEngine();
      const p1: BattlefieldParticipant = {
        id: 'sorcerer_1',
        name: 'Pyromancer',
        team: 'player_allies',
        x: 2,
        y: 2,
        hpMax: 30,
        hpCurrent: 30,
        armorClass: 12,
        speedCells: 5,
        attackBonus: 4,
        damageFormula: '1d6',
        initiative: 10,
        conditions: [],
        isDead: false,
      };
      const p2: BattlefieldParticipant = {
        id: 'enemy_1',
        name: 'Goblin Archer',
        team: 'enemies',
        x: 5,
        y: 5,
        hpMax: 20,
        hpCurrent: 20,
        armorClass: 10,
        speedCells: 5,
        attackBonus: 3,
        damageFormula: '1d6',
        initiative: 8,
        conditions: [],
        isDead: false,
      };
      combat.addParticipant(p1);
      combat.addParticipant(p2);
      combat.turnQueue = ['enemy_1', 'sorcerer_1'];
      combat.currentTurnIndex = 0;

      // Sorcerer starts charging a 2-turn charged spell
      combat.startActivation({
        activationId: 'act_charge_1',
        actorId: 'sorcerer_1',
        capabilityId: 'cap_sunburst_charge',
        activationMode: 'charged',
        totalTurnsRequired: 2,
        remainingTurns: 2,
        isInterruptible: true,
        channelSustainedTurns: 0,
        startedAtRound: 1,
      });

      assert.ok(combat.getPendingActivation('sorcerer_1'));
      assert.strictEqual(combat.getPendingActivation('sorcerer_1')!.remainingTurns, 2);

      // Enemy damages sorcerer -> triggers interruption
      const castDmg = combat.executeCapabilityCast({
        actorId: 'enemy_1',
        targetId: 'sorcerer_1',
        baseDamage: 8,
        powerTier: 'Minor',
      });
      assert.ok(castDmg.targetHpRemaining < 30);
      assert.strictEqual(castDmg.interruptedPendingActivation, true);

      // Activation should now be removed from pendingActivations
      assert.strictEqual(combat.getPendingActivation('sorcerer_1'), undefined);
    });

    it('protects non-interruptible activations from cancellation on damage', () => {
      const combat = new TacticalCombatEngine();
      const p1: BattlefieldParticipant = {
        id: 'titan_1',
        name: 'Unstoppable Titan',
        team: 'player_allies',
        x: 2,
        y: 2,
        hpMax: 50,
        hpCurrent: 50,
        armorClass: 14,
        speedCells: 5,
        attackBonus: 5,
        damageFormula: '1d8',
        initiative: 12,
        conditions: [],
        isDead: false,
      };
      const p2: BattlefieldParticipant = {
        id: 'enemy_2',
        name: 'Bandit',
        team: 'enemies',
        x: 3,
        y: 2,
        hpMax: 20,
        hpCurrent: 20,
        armorClass: 10,
        speedCells: 5,
        attackBonus: 3,
        damageFormula: '1d6',
        initiative: 9,
        conditions: [],
        isDead: false,
      };
      combat.addParticipant(p1);
      combat.addParticipant(p2);
      combat.turnQueue = ['enemy_2', 'titan_1'];
      combat.currentTurnIndex = 0;

      combat.startActivation({
        activationId: 'act_iron_form',
        actorId: 'titan_1',
        capabilityId: 'cap_iron_colossus',
        activationMode: 'charged',
        totalTurnsRequired: 1,
        remainingTurns: 1,
        isInterruptible: false, // Protected
        channelSustainedTurns: 0,
        startedAtRound: 1,
      });

      // Enemy attacks titan
      const castDmg = combat.executeCapabilityCast({
        actorId: 'enemy_2',
        targetId: 'titan_1',
        baseDamage: 5,
        powerTier: 'Minor',
      });
      assert.strictEqual(castDmg.interruptedPendingActivation, false);
      assert.ok(combat.getPendingActivation('titan_1'), 'Activation must remain pending because isInterruptible is false');
    });
  });

  // =========================================================================
  // Phase D: Mastery & Execution Gate Adjudication
  // =========================================================================
  describe('Phase D: Mastery Levels & Environmental Execution Gates', () => {
    it('evaluates execution gates deterministically based on mastery and environmental distortion', () => {
      const engine = new CapabilityEngine();
      const actorId = 'gate_tester';
      engine.acquireSkill(actorId, 'cap_venomous_bite');

      // Novice mastery requires execution check under standard conditions
      const gate1 = engine.evaluateExecutionGate({
        actorId,
        capabilityId: 'cap_venomous_bite',
      });
      assert.strictEqual(gate1.status, 'EXECUTION_CHECK_REQUIRED');
      assert.strictEqual(gate1.eligible, true);
      assert.strictEqual(gate1.requiresCheck, true);

      // Master level (>= 3) grants AUTOMATIC_SUCCESS under normal conditions
      engine.awardSkillXp(actorId, 'cap_venomous_bite', 400); // level 3
      const gateMaster = engine.evaluateExecutionGate({
        actorId,
        capabilityId: 'cap_venomous_bite',
      });
      assert.strictEqual(gateMaster.status, 'AUTOMATIC_SUCCESS');
      assert.strictEqual(gateMaster.eligible, true);
      assert.strictEqual(gateMaster.requiresCheck, false);

      // In heavily distorted environment: even a master requires a check
      const gate2 = engine.evaluateExecutionGate({
        actorId,
        capabilityId: 'cap_venomous_bite',
        environment: {
          distortionLevel: 0.6,
          conditions: ['distorted_magic'],
        },
      });
      assert.strictEqual(gate2.status, 'EXECUTION_CHECK_REQUIRED');
      assert.ok(gate2.checkDifficulty! >= 12);
      assert.ok(gate2.environmentalModifiers.length > 0);

      // In completely suppressed environment: ELIGIBILITY_BLOCKED
      const gate3 = engine.evaluateExecutionGate({
        actorId,
        capabilityId: 'cap_venomous_bite',
        environment: {
          isSuppressed: true,
          conditions: ['magical_suppression'],
        },
      });
      assert.ok(gate3.environmentalModifiers.includes('magical_suppression'));
    });
  });

  // =========================================================================
  // Phase E: Action-Time Contextual Modifiers
  // =========================================================================
  describe('Phase E: Contextual Modifiers (OVERCHARGE, CONCENTRATE, EXPAND_SCOPE)', () => {
    it('applies modifiers to energy cost and strain during capability adjudication', () => {
      const engine = new CapabilityEngine();
      const actorId = 'modifier_tester';
      engine.acquireSkill(actorId, 'cap_venomous_bite');

      const normalAdj = engine.adjudicate({
        actorId,
        intendedCapabilityId: 'cap_venomous_bite',
        requestedScale: 'Local',
        actionDescription: 'Invoke normal venomous bite',
      });
      assert.strictEqual(normalAdj.approved, true);
      const baseEnergyDelta = normalAdj.energyDelta;
      const baseStrainDelta = normalAdj.strainDelta;

      // Adjudicate with OVERCHARGE modifier (+5 energy, +3 strain)
      const overchargedAdj = engine.adjudicate({
        actorId,
        intendedCapabilityId: 'cap_venomous_bite',
        requestedScale: 'Local',
        actionDescription: 'Invoke overcharged venomous bite',
        modifiers: [
          {
            id: 'mod_overcharge',
            name: 'Overcharge',
            modifierType: 'OVERCHARGE',
            energyCostDelta: 5,
            strainCostDelta: 3,
            description: 'Draws extra power for heightened strike',
          },
        ],
      });

      assert.strictEqual(overchargedAdj.approved, true);
      assert.strictEqual(overchargedAdj.energyDelta, baseEnergyDelta - 5);
      assert.strictEqual(overchargedAdj.strainDelta, baseStrainDelta + 3);
    });
  });

  // =========================================================================
  // Phase F & G: ReusableSkillRegistry & Cross-Story Portability
  // =========================================================================
  describe('Phase F & G: Reusable Skill Registry, Provenance & Adaptation', () => {
    it('exports reusable skills with clean schema, checks target compatibility, and instantiates cleanly', () => {
      const registry = new ReusableSkillRegistry();
      const sourceCap: CapabilityDefinition = {
        id: 'cap_lightning_spear',
        name: 'Lightning Spear',
        category: 'Magic',
        activationMode: 'immediate',
        powerTier: 'Moderate',
        baseEnergyCost: 10,
        baseStrainCost: 4,
        minVesselCapacityRequired: 15,
        description: 'Hurls a javelin of concentrated atmospheric electricity.',
        provenance: 'source_story_arcadia',
      };

      const reusableSkill: ReusableSkill = {
        id: 'lib_skill_lightning_spear',
        definitionId: sourceCap.id,
        definition: sourceCap,
        progressionSnapshot: {
          level: 2,
          xp: 120,
          xpToNext: 200,
          evolutionPoints: 1,
        },
        evolutionLineage: ['cap_lightning_spear'],
        compatibility: {
          requiredWorldModes: ['high_magic'],
          permittedCategories: ['Magic'],
        },
        provenance: {
          sourceStoryIds: ['story_arcadia'],
          registeredAtSeconds: 100,
          approvedBy: 'ARCHITECT',
          version: '1.0.0',
        },
      };

      // 1. Register approved skill in library
      registry.registerApprovedSkill(reusableSkill);
      assert.ok(registry.getSkill('lib_skill_lightning_spear'));

      // 2. Test target compatibility
      // Incompatible world mode:
      const targetIncompat: TargetWorldContext = {
        storyId: 'story_scifi_void',
        worldMode: 'hard_scifi',
        allowProgressionTransfer: true,
      };
      const checkFail = registry.evaluateCompatibility(reusableSkill, targetIncompat);
      assert.strictEqual(checkFail.compatible, false);
      assert.ok(checkFail.violations.length > 0);

      // Compatible world mode:
      const targetCompat: TargetWorldContext = {
        storyId: 'story_valeria',
        worldMode: 'high_magic',
        allowProgressionTransfer: true,
        maxAllowedTier: 'Major',
      };
      const checkPass = registry.evaluateCompatibility(reusableSkill, targetCompat);
      assert.strictEqual(checkPass.compatible, true);

      // 3. Instantiate into target capability engine
      const targetEngine = new CapabilityEngine();
      const targetActor = 'target_player_valeria';
      const instantiated = registry.instantiateInTargetStory(
        reusableSkill,
        'story_valeria',
        targetActor,
        targetEngine,
        targetCompat
      );

      assert.strictEqual(instantiated.actorId, targetActor);
      assert.strictEqual(instantiated.currentLevel, 2);
      assert.strictEqual(instantiated.libraryStatus, 'REUSED');

      // Verify target capability engine now has the definition and actor instance
      assert.ok(targetEngine.getCapability('cap_lightning_spear'));
      assert.ok(targetEngine.getSkillInstance(targetActor, 'cap_lightning_spear'));
    });
  });

  // =========================================================================
  // Phase H: Live HTTP API Endpoints & State Persistence
  // =========================================================================
  describe('Phase H: Live HTTP API Verification for CH6 Endpoints', () => {
    it('POST /api/game/capabilities/acquire, /award-xp, /downgrade, /relearn', async () => {
      // 1. Acquire
      const acqRes = await fetch(`${baseUrl}/capabilities/acquire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capabilityId: 'cap_fireball',
        }),
      });
      assert.strictEqual(acqRes.status, 200);
      const acqData = (await acqRes.json()) as any;
      assert.strictEqual(acqData.success, true);
      assert.strictEqual(acqData.instance.capabilityId, 'cap_fireball');

      // 2. Award XP
      const xpRes = await fetch(`${baseUrl}/capabilities/award-xp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capabilityId: 'cap_fireball',
          xpAmount: 250,
        }),
      });
      assert.strictEqual(xpRes.status, 200);
      const xpData = (await xpRes.json()) as any;
      assert.strictEqual(xpData.success, true);
      assert.ok(xpData.instance.currentLevel >= 2);

      // 3. Downgrade
      const downRes = await fetch(`${baseUrl}/capabilities/downgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capabilityId: 'cap_fireball',
          targetLevel: 1,
          reason: 'Arcane Backlash',
        }),
      });
      assert.strictEqual(downRes.status, 200);
      const downData = (await downRes.json()) as any;
      assert.strictEqual(downData.success, true);
      assert.strictEqual(downData.instance.currentLevel, 1);

      // 4. Relearn
      const relRes = await fetch(`${baseUrl}/capabilities/relearn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capabilityId: 'cap_fireball',
          reason: 'Meditative Recalibration',
        }),
      });
      assert.strictEqual(relRes.status, 200);
      const relData = (await relRes.json()) as any;
      assert.strictEqual(relData.success, true);
      assert.ok(relData.instance.progressionHistory.some((h: any) => h.changeType === 'RELEARNED'));
    });

    it('POST /api/game/capabilities/evaluate-gate', async () => {
      const gateRes = await fetch(`${baseUrl}/capabilities/evaluate-gate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capabilityId: 'cap_fireball',
          environment: {
            distortionLevel: 0.1,
          },
        }),
      });
      assert.strictEqual(gateRes.status, 200);
      const gateData = (await gateRes.json()) as any;
      assert.strictEqual(gateData.eligible, true);
      assert.ok(gateData.status);
    });

    it('GET /api/game/capabilities/library and POST /evaluate-compatibility', async () => {
      // 1. Query library
      const listRes = await fetch(`${baseUrl}/capabilities/library`);
      assert.strictEqual(listRes.status, 200);
      const listData = (await listRes.json()) as any;
      assert.ok(Array.isArray(listData.skills));
      assert.ok(listData.skills.length > 0);

      // 2. Evaluate compatibility
      const compatRes = await fetch(`${baseUrl}/capabilities/library/evaluate-compatibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reusableSkillId: 'lib_skill_fireball',
          targetWorld: {
            storyId: 'default_story',
            worldMode: 'standard',
            allowProgressionTransfer: true,
          },
        }),
      });
      assert.strictEqual(compatRes.status, 200);
      const compatData = (await compatRes.json()) as any;
      assert.strictEqual(compatData.compatible, true);
    });

    it('handles multi-turn combat activations and interrupts over HTTP', async () => {
      // Register a 2-turn charged spell in world repository
      const capEngine = worldRepository.getCapabilityEngine('default_story');
      capEngine.registerCapability({
        id: 'cap_arcane_bombardment',
        name: 'Arcane Bombardment',
        category: 'Magic',
        activationMode: 'charged',
        chargeTurnsRequired: 2,
        powerTier: 'Major',
        baseEnergyCost: 15,
        baseStrainCost: 5,
        minVesselCapacityRequired: 10,
        description: 'Charges high-yield arcane devastation.',
        provenance: 'test',
      });
      capEngine.acquireSkill('player_actor_default_story', 'cap_arcane_bombardment');

      // Start encounter
      const startRes = await fetch(`${baseUrl}/combat/encounter/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      assert.strictEqual(startRes.status, 200);

      // Get enemy target
      const stateRes = await fetch(`${baseUrl}/combat/state`);
      const stateData = (await stateRes.json()) as any;
      const enemy = stateData.participants.find((p: any) => p.team === 'enemies');
      assert.ok(enemy, 'Enemy participant should exist');

      // 1. Cast charged spell -> enters pending activation
      const castRes = await fetch(`${baseUrl}/combat/cast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capabilityId: 'cap_arcane_bombardment',
          targetId: enemy.id,
        }),
      });
      assert.strictEqual(castRes.status, 200);
      const castData = (await castRes.json()) as any;
      assert.strictEqual(castData.success, true);
      assert.ok(castData.pendingActivation);
      assert.strictEqual(castData.pendingActivation.remainingTurns, 2);

      // 2. Interrupt activation via HTTP
      const interruptRes = await fetch(`${baseUrl}/combat/interrupt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetActorId: 'player_actor_default_story',
          reason: 'Stunned by psychic shockwave',
        }),
      });
      assert.strictEqual(interruptRes.status, 200);
      const interruptData = (await interruptRes.json()) as any;
      assert.strictEqual(interruptData.interrupted, true);
    });
  });

  // =========================================================================
  // Phase I: AUDIT-CH6-008 Targeted Regression & Matching Hierarchy Tests
  // =========================================================================
  describe('Phase I: AUDIT-CH6-008 Exact-ID Miss Isolation & Deterministic Matching Hierarchy', () => {
    it('Regression Test 1: exact-ID miss returns [] and autoAcquireOrReuse registers actual source capability (no Fireball substitution)', () => {
      const registry = new ReusableSkillRegistry();
      const sourceEngine = new CapabilityEngine();
      const targetEngine = new CapabilityEngine();

      // 1. Library contains only Fireball
      const fireballSkill = registry.getSkill('lib_skill_fireball');
      assert.ok(fireballSkill, 'Fireball should exist in default reusable library');

      // 2. Source engine has cap_frost_nova
      const frostNovaDef: CapabilityDefinition = {
        id: 'cap_frost_nova',
        name: 'Frost Nova',
        category: 'Magic',
        activationMode: 'immediate',
        powerTier: 'Moderate',
        baseEnergyCost: 12,
        baseStrainCost: 4,
        minVesselCapacityRequired: 10,
        description: 'Emits an omnidirectional ring of sub-zero ice crystals.',
        provenance: 'story_cryo_source',
      };
      sourceEngine.registerCapability(frostNovaDef);
      sourceEngine.acquireSkill('actor_source_frost', 'cap_frost_nova');

      // 3. Ensure cap_frost_nova is NOT in the library yet
      assert.strictEqual(registry.getSkillByDefinitionId('cap_frost_nova'), undefined);

      // 4. Exact lookup for missing ID must return []
      const candidates = registry.findCandidateSkills({ definitionId: 'cap_frost_nova' });
      assert.deepStrictEqual(candidates, [], 'findCandidateSkills with missing definitionId MUST return empty array');

      // 5. autoAcquireOrReuse with cap_frost_nova
      const targetWorld: TargetWorldContext = {
        storyId: 'story_target_ice',
        worldMode: 'high_magic',
        allowProgressionTransfer: true,
      };

      const targetInstance = registry.autoAcquireOrReuse(
        'story_cryo_source',
        'actor_source_frost',
        'cap_frost_nova',
        'story_target_ice',
        'actor_target_frost',
        sourceEngine,
        targetEngine,
        targetWorld
      );

      // Verify no Fireball substitution occurred
      assert.strictEqual(targetInstance.capabilityId, 'cap_frost_nova');
      assert.notStrictEqual(targetInstance.capabilityId, 'cap_fireball');

      // Verify target engine canonically committed the instance
      const committed = targetEngine.getSkillInstance('actor_target_frost', 'cap_frost_nova');
      assert.ok(committed, 'Target engine must have committed the new instance');
      assert.strictEqual(committed.capabilityId, 'cap_frost_nova');
      assert.strictEqual(targetEngine.getSkillInstance('actor_target_frost', 'cap_fireball'), undefined);
    });

    it('Regression Test 2: exact hit retrieves existing entry from library without substituting other skills', () => {
      const registry = new ReusableSkillRegistry();
      const sourceEngine = new CapabilityEngine();
      const targetEngine = new CapabilityEngine();

      const frostNovaDef: CapabilityDefinition = {
        id: 'cap_frost_nova',
        name: 'Frost Nova',
        category: 'Magic',
        activationMode: 'immediate',
        powerTier: 'Moderate',
        baseEnergyCost: 12,
        baseStrainCost: 4,
        minVesselCapacityRequired: 10,
        description: 'Sub-zero freezing wave.',
        provenance: 'story_cryo',
      };
      sourceEngine.registerCapability(frostNovaDef);

      // Register into library beforehand
      registry.registerApprovedSkill({
        id: 'lib_skill_frost_nova',
        definitionId: 'cap_frost_nova',
        definition: frostNovaDef,
        progressionSnapshot: { level: 3, xp: 150, xpToNext: 300, evolutionPoints: 2 },
        evolutionLineage: ['cap_frost_nova'],
        compatibility: { minVesselCapacity: 10 },
        provenance: { sourceStoryIds: ['story_cryo'], registeredAtSeconds: 0, approvedBy: 'CANONICAL_AUTHORITY', version: '1.0.0' },
      });

      const candidates = registry.findCandidateSkills({ definitionId: 'cap_frost_nova' });
      assert.strictEqual(candidates.length, 1);
      assert.strictEqual(candidates[0].definitionId, 'cap_frost_nova');

      const targetWorld: TargetWorldContext = {
        storyId: 'story_target_hit',
        worldMode: 'high_magic',
        allowProgressionTransfer: true,
      };

      const result = registry.autoAcquireOrReuse(
        'story_cryo',
        'actor_src',
        'cap_frost_nova',
        'story_target_hit',
        'actor_dst',
        sourceEngine,
        targetEngine,
        targetWorld
      );

      assert.strictEqual(result.capabilityId, 'cap_frost_nova');
      assert.strictEqual(result.currentLevel, 3);
      assert.strictEqual(result.libraryEntryId, 'lib_skill_frost_nova');
    });

    it('Regression Test 3: findCandidateSkills({}) returns all library entries deterministically sorted by ID', () => {
      const registry = new ReusableSkillRegistry();

      // Add two more skills to test sorting across multiple entries
      registry.registerApprovedSkill({
        id: 'lib_skill_arcane_shield',
        definitionId: 'cap_arcane_shield',
        definition: {
          id: 'cap_arcane_shield',
          name: 'Arcane Shield',
          category: 'Magic',
          activationMode: 'immediate',
          powerTier: 'Minor',
          baseEnergyCost: 5,
          baseStrainCost: 2,
          minVesselCapacityRequired: 5,
          description: 'A barrier of force.',
          provenance: 'test',
        },
        progressionSnapshot: { level: 1, xp: 0, xpToNext: 100, evolutionPoints: 0 },
        evolutionLineage: ['cap_arcane_shield'],
        compatibility: {},
        provenance: { sourceStoryIds: ['test'], registeredAtSeconds: 0, approvedBy: 'ARCHITECT', version: '1.0.0' },
      });

      registry.registerApprovedSkill({
        id: 'lib_skill_chain_lightning',
        definitionId: 'cap_chain_lightning',
        definition: {
          id: 'cap_chain_lightning',
          name: 'Chain Lightning',
          category: 'Magic',
          activationMode: 'immediate',
          powerTier: 'Major',
          baseEnergyCost: 20,
          baseStrainCost: 6,
          minVesselCapacityRequired: 20,
          description: 'Arcing lightning bolts.',
          provenance: 'test',
        },
        progressionSnapshot: { level: 1, xp: 0, xpToNext: 100, evolutionPoints: 0 },
        evolutionLineage: ['cap_chain_lightning'],
        compatibility: {},
        provenance: { sourceStoryIds: ['test'], registeredAtSeconds: 0, approvedBy: 'ARCHITECT', version: '1.0.0' },
      });

      const allSkills = registry.findCandidateSkills({});
      assert.strictEqual(allSkills.length, 3);

      for (let i = 0; i < allSkills.length - 1; i++) {
        assert.ok(
          allSkills[i].id.localeCompare(allSkills[i + 1].id) <= 0,
          `Skills must be deterministically sorted by ID ascending (${allSkills[i].id} <= ${allSkills[i + 1].id})`
        );
      }
    });

    it('Regression Test 4: missing exact ID returns [] even when semantic matches and compatible skills exist', () => {
      const registry = new ReusableSkillRegistry();

      // Seed library with Fireball, Ice Bolt, Lightning Arc
      const iceBoltDef: CapabilityDefinition = {
        id: 'cap_ice_bolt',
        name: 'Ice Bolt',
        category: 'Magic',
        activationMode: 'immediate',
        powerTier: 'Minor',
        baseEnergyCost: 5,
        baseStrainCost: 2,
        minVesselCapacityRequired: 5,
        description: 'A sharp freezing missile of condensed ice.',
        provenance: 'library',
      };
      registry.registerApprovedSkill({
        id: 'lib_skill_ice_bolt',
        definitionId: 'cap_ice_bolt',
        definition: iceBoltDef,
        progressionSnapshot: { level: 1, xp: 0, xpToNext: 100, evolutionPoints: 0 },
        evolutionLineage: ['cap_ice_bolt'],
        compatibility: {},
        provenance: { sourceStoryIds: ['test'], registeredAtSeconds: 0, approvedBy: 'ARCHITECT', version: '1.0.0' },
      });

      // Explicit lookup for missing cap_frost_nova
      const exactMiss = registry.findCandidateSkills({ definitionId: 'cap_frost_nova' });
      assert.deepStrictEqual(exactMiss, [], 'Must return empty array on exact definitionId miss despite ice/magic skills existing');
    });

    it('Matching Hierarchy Verification: exact ID > lineage > semantic discovery, with mechanical rules authoritative', () => {
      const registry = new ReusableSkillRegistry();

      // Exact ID lookup returns strictly that ID
      const exact = registry.findCandidateSkills({ definitionId: 'cap_fireball' });
      assert.strictEqual(exact.length, 1);
      assert.strictEqual(exact[0].definitionId, 'cap_fireball');

      // Lineage lookup matches lineage
      const lineage = registry.findCandidateSkills({ lineageId: 'cap_fireball' });
      assert.ok(lineage.some((s) => s.definitionId === 'cap_fireball'));

      // Semantic discovery finds relevant candidates
      const semantic = registry.findCandidateSkills({ semanticQuery: 'flame fire' });
      assert.ok(semantic.length > 0);
      assert.ok(semantic[0].definition.name.toLowerCase().includes('fire') || semantic[0].definition.description.toLowerCase().includes('fire'));

      // Mechanical incompatibility cannot be overridden by semantic score
      const incompatibleTarget: TargetWorldContext = {
        storyId: 'story_hard_scifi',
        worldMode: 'hard_scifi',
        allowProgressionTransfer: false,
        permittedCategories: ['Tech', 'Psionic'], // Excludes 'Magic'
      };
      const check = registry.evaluateCompatibility(semantic[0], incompatibleTarget);
      assert.strictEqual(check.compatible, false);
      assert.ok(check.violations.length > 0);
    });
  });
});

