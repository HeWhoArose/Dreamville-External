import { describe, it, beforeEach, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { Server } from 'http';
import { TacticalCombatEngine } from '../server/domain/combatEngine';
import { NpcTacticalDecisionPolicy, TacticalGroupContext } from '../server/domain/tacticalDecisionPolicy';
import { CapabilityEngine } from '../server/domain/capabilityEngine';
import { InMemoryWorldRepository, WorldRepository, worldRepository } from '../server/repositories/worldRepository';
import { DomainAdjudicationBridge, StructuredTurnPackage } from '../server/domain/aiOrchestrator';
import { gameRouter } from '../server/api/gameRoutes';

describe('CH3 Surgical Repair Verification Suite', () => {
  let combat: TacticalCombatEngine;
  let capEngine: CapabilityEngine;
  let testRepo: WorldRepository;

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

  beforeEach(() => {
    combat = new TacticalCombatEngine();
    capEngine = new CapabilityEngine();
    testRepo = new InMemoryWorldRepository();
  });

  describe('Objective A: Autonomous NPC Decision Policy', () => {
    it('TEST 1: NPC decision changes when canonical state changes (Low Health Retreat vs Healthy Attack)', () => {
      // Setup Healthy NPC & Target
      const healthyNpc = {
        id: 'npc_guard_1',
        name: 'Guard Orlo',
        x: 2,
        y: 2,
        initiative: 15,
        team: 'enemies' as const,
        hpCurrent: 30,
        hpMax: 30,
        armorClass: 14,
        speedCells: 3,
        attackBonus: 4,
        damageFormula: '1d8+2',
        conditions: [],
        isDead: false,
      };

      const playerTarget = {
        id: 'player_vael',
        name: 'Vael',
        x: 2,
        y: 3, // Adjacent (distance 1.0)
        initiative: 12,
        team: 'player_allies' as const,
        hpCurrent: 25,
        hpMax: 25,
        armorClass: 13,
        speedCells: 4,
        attackBonus: 3,
        damageFormula: '1d6+1',
        conditions: [],
        isDead: false,
      };

      combat.addParticipant(healthyNpc);
      combat.addParticipant(playerTarget);

      // 1. Healthy NPC decides -> ATTACK adjacent enemy
      const decisionHealthy = NpcTacticalDecisionPolicy.decide({
        actorId: healthyNpc.id,
        combatEngine: combat,
      });

      assert.strictEqual(decisionHealthy.actionType, 'ATTACK');
      assert.strictEqual(decisionHealthy.targetId, playerTarget.id);

      // 2. Mutate state: NPC is now critically wounded (5/30 HP = 16.7%)
      combat.updateParticipant(healthyNpc.id, { hpCurrent: 5 });

      const decisionWounded = NpcTacticalDecisionPolicy.decide({
        actorId: healthyNpc.id,
        combatEngine: combat,
      });

      assert.strictEqual(decisionWounded.actionType, 'RETREAT');
      assert.ok(decisionWounded.targetPosition, 'Must provide retreat coordinates');
      assert.ok(
        decisionWounded.targetPosition.y < healthyNpc.y || decisionWounded.targetPosition.x !== healthyNpc.x,
        'Retreat coordinates must move away from threat'
      );
    });

    it('TEST 2: Same initial state produces deterministic tactical decision', () => {
      const npc = {
        id: 'npc_sentinel',
        name: 'Sentinel',
        x: 1,
        y: 1,
        initiative: 10,
        team: 'enemies' as const,
        hpCurrent: 20,
        hpMax: 20,
        armorClass: 12,
        speedCells: 3,
        attackBonus: 3,
        damageFormula: '1d6',
        conditions: [],
        isDead: false,
      };

      const target = {
        id: 'player_vael',
        name: 'Vael',
        x: 4,
        y: 1,
        initiative: 14,
        team: 'player_allies' as const,
        hpCurrent: 20,
        hpMax: 20,
        armorClass: 12,
        speedCells: 3,
        attackBonus: 3,
        damageFormula: '1d6',
        conditions: [],
        isDead: false,
      };

      combat.addParticipant(npc);
      combat.addParticipant(target);

      const decision1 = NpcTacticalDecisionPolicy.decide({ actorId: npc.id, combatEngine: combat });
      const decision2 = NpcTacticalDecisionPolicy.decide({ actorId: npc.id, combatEngine: combat });

      assert.deepStrictEqual(decision1, decision2, 'Decisions under identical state must be exactly deterministic');
    });

    it('TEST 3: Tactical policy cannot invent unavailable capabilities or exceed resources', () => {
      const mage = {
        id: 'npc_cultist_mage',
        name: 'Cultist Mage',
        x: 1,
        y: 1,
        initiative: 12,
        team: 'enemies' as const,
        hpCurrent: 18,
        hpMax: 18,
        armorClass: 11,
        speedCells: 3,
        attackBonus: 2,
        damageFormula: '1d4',
        conditions: [],
        isDead: false,
      };

      const target = {
        id: 'player_vael',
        name: 'Vael',
        x: 3,
        y: 1,
        initiative: 10,
        team: 'player_allies' as const,
        hpCurrent: 20,
        hpMax: 20,
        armorClass: 12,
        speedCells: 3,
        attackBonus: 3,
        damageFormula: '1d6',
        conditions: [],
        isDead: false,
      };

      combat.addParticipant(mage);
      combat.addParticipant(target);

      // Seed power state with 0 magicalEnergy
      capEngine.setPowerState(mage.id, {
        originId: 'test_origin',
        originTier: 'Grounded',
        currentFormId: 'form_human',
        vesselType: 'mortal_human',
        vesselCapacity: 50,
        sealState: 'partial',
        sealStrength: 0,
        powerAccessLevel: 1.0,
        trueFormAccess: false,
        healthCurrent: 15,
        healthMax: 15,
        fatigue: 0,
        stress: 0,
        magicalEnergy: 0, // Exhausted
        physicalStrain: 90, // Max strain
        activeConditions: [],
      });

      const decision = NpcTacticalDecisionPolicy.decide({
        actorId: mage.id,
        combatEngine: combat,
        capabilityEngine: capEngine,
      });

      // Cannot cast capability without resources -> moves or makes normal move
      assert.notStrictEqual(decision.actionType, 'CAST');
    });

    it('TEST 4: Tactical policy cannot use knowledge outside actor-scoped epistemic context', () => {
      const npc = {
        id: 'npc_patrol',
        name: 'Patrolman',
        x: 2,
        y: 2,
        initiative: 10,
        team: 'enemies' as const,
        hpCurrent: 20,
        hpMax: 20,
        armorClass: 12,
        speedCells: 3,
        attackBonus: 3,
        damageFormula: '1d6',
        conditions: [],
        isDead: false,
      };

      // Player is hidden/stealthed
      const stealthedPlayer = {
        id: 'player_vael',
        name: 'Vael',
        x: 2,
        y: 3,
        initiative: 14,
        team: 'player_allies' as const,
        hpCurrent: 20,
        hpMax: 20,
        armorClass: 12,
        speedCells: 3,
        attackBonus: 3,
        damageFormula: '1d6',
        conditions: ['Stealthed', 'Invisible'],
        isDead: false,
      };

      combat.addParticipant(npc);
      combat.addParticipant(stealthedPlayer);

      const decision = NpcTacticalDecisionPolicy.decide({
        actorId: npc.id,
        combatEngine: combat,
      });

      // NPC should NOT see stealthed player -> ends turn due to no perceived targets
      assert.strictEqual(decision.actionType, 'END_TURN');
      assert.ok(decision.reason.includes('No hostile targets'));
    });
  });

  describe('Objective B: Group Tactical Coordination', () => {
    it('TEST 5: Group decision distinguishes VANGUARD vs REARGUARD/PROTECTOR roles', () => {
      const vanguard = {
        id: 'npc_vanguard_brute',
        name: 'Iron Vanguard',
        x: 3,
        y: 2,
        initiative: 16,
        team: 'enemies' as const,
        hpCurrent: 40,
        hpMax: 40,
        armorClass: 16,
        speedCells: 3,
        attackBonus: 5,
        damageFormula: '1d10+3',
        conditions: [],
        isDead: false,
      };

      const woundedAlly = {
        id: 'npc_cleric_ally',
        name: 'Acolyte Lyra',
        x: 1,
        y: 1,
        initiative: 14,
        team: 'enemies' as const,
        hpCurrent: 4, // Critical (4/20 = 20%)
        hpMax: 20,
        armorClass: 10,
        speedCells: 3,
        attackBonus: 2,
        damageFormula: '1d4',
        conditions: [],
        isDead: false,
      };

      const protector = {
        id: 'npc_protector_guard',
        name: 'Shield Guard',
        x: 1,
        y: 3,
        initiative: 12,
        team: 'enemies' as const,
        hpCurrent: 30,
        hpMax: 30,
        armorClass: 15,
        speedCells: 3,
        attackBonus: 4,
        damageFormula: '1d8',
        conditions: [],
        isDead: false,
      };

      const playerThreat = {
        id: 'player_vael',
        name: 'Vael',
        x: 1,
        y: 2, // Threatening wounded ally
        initiative: 10,
        team: 'player_allies' as const,
        hpCurrent: 30,
        hpMax: 30,
        armorClass: 14,
        speedCells: 4,
        attackBonus: 4,
        damageFormula: '1d8+2',
        conditions: [],
        isDead: false,
      };

      combat.addParticipant(vanguard);
      combat.addParticipant(woundedAlly);
      combat.addParticipant(protector);
      combat.addParticipant(playerThreat);

      const groupContext: TacticalGroupContext = {
        groupId: 'enemy_squad_1',
        team: 'enemies',
        members: [
          { actorId: vanguard.id, role: 'VANGUARD' },
          { actorId: protector.id, role: 'REARGUARD' },
          { actorId: woundedAlly.id, role: 'SUPPORT' },
        ],
        focusTargetId: playerThreat.id,
      };

      // 1. Protector acts: evaluates vulnerable ally -> attacks threat directly adjacent to protect ally
      const protectorDecision = NpcTacticalDecisionPolicy.decide({
        actorId: protector.id,
        combatEngine: combat,
        groupContext,
      });

      assert.strictEqual(protectorDecision.role, 'REARGUARD');
      assert.strictEqual(protectorDecision.actionType, 'ATTACK');
      assert.ok(protectorDecision.reason.includes('Protecting vulnerable ally') || protectorDecision.reason.includes('Acolyte Lyra'));

      // 2. Vanguard acts: closes distance to assault designated focus target
      const vanguardDecision = NpcTacticalDecisionPolicy.decide({
        actorId: vanguard.id,
        combatEngine: combat,
        groupContext,
      });

      assert.strictEqual(vanguardDecision.role, 'VANGUARD');
      assert.strictEqual(vanguardDecision.actionType, 'MOVE');
      assert.ok(vanguardDecision.targetPosition !== undefined);
    });
  });

  describe('Objective C: AI Adjudication Atomicity', () => {
    // TEST 6 and TEST 7 removed as they assert CHRONICLE state changes being
    // committed by the AI Orchestrator, which is now explicitly forbidden and
    // rejected by DomainAdjudicationBridge in CH4 (CH4-DEF-002).
  });

  describe('Objective D: Actor Authority & HTTP API Verification', () => {
    it('TEST 8: Forged actor identity on player combat routes returns 403 Forbidden', async () => {
      // 1. Spoofed Move
      const resMove = await fetch(`${baseUrl}/combat/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: 'forged_enemy_actor', targetX: 2, targetY: 2 }),
      });
      const dataMove = await resMove.json();
      assert.strictEqual(resMove.status, 403);
      assert.ok(dataMove.errorReason.includes('Unauthorized: cannot move actor'));

      // 2. Spoofed Attack
      const resAttack = await fetch(`${baseUrl}/combat/attack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attackerId: 'forged_attacker_actor', targetId: 'some_target' }),
      });
      const dataAttack = await resAttack.json();
      assert.strictEqual(resAttack.status, 403);
      assert.ok(dataAttack.errorReason.includes('Unauthorized: cannot attack as actor'));

      // 3. Spoofed End Turn
      const resEnd = await fetch(`${baseUrl}/combat/end-turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: 'forged_enemy_actor' }),
      });
      const dataEnd = await resEnd.json();
      assert.strictEqual(resEnd.status, 403);
      assert.ok(dataEnd.errorReason.includes('Unauthorized: cannot end turn as actor'));
    });

    it('TEST 9: NPC tactical turn endpoint executes autonomously and rejects player usurpation', async () => {
      const combatEngine = worldRepository.getCombatEngine('default_story');
      combatEngine.clear();

      const player = {
        id: 'player_actor_default_story',
        name: 'Vael',
        x: 1,
        y: 1,
        initiative: 10,
        team: 'player_allies' as const,
        hpCurrent: 30,
        hpMax: 30,
        armorClass: 14,
        speedCells: 4,
        attackBonus: 4,
        damageFormula: '1d8',
        conditions: [],
        isDead: false,
      };

      const enemyNpc = {
        id: 'npc_raider_1',
        name: 'Raider',
        x: 1,
        y: 3,
        initiative: 20, // Higher initiative -> First in turn queue
        team: 'enemies' as const,
        hpCurrent: 25,
        hpMax: 25,
        armorClass: 12,
        speedCells: 3,
        attackBonus: 3,
        damageFormula: '1d6',
        conditions: [],
        isDead: false,
      };

      combatEngine.addParticipant(enemyNpc);
      combatEngine.addParticipant(player);

      // Ensure enemyNpc is active turn actor
      assert.strictEqual(combatEngine.getCurrentActor()?.id, enemyNpc.id);

      // 1. Trying to call NPC turn as player actor returns 403
      const resForbidden = await fetch(`${baseUrl}/combat/npc-turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: player.id }),
      });
      assert.strictEqual(resForbidden.status, 403);

      // 2. Execute NPC turn via API
      const resNpcTurn = await fetch(`${baseUrl}/combat/npc-turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: enemyNpc.id }),
      });
      const dataNpcTurn = await resNpcTurn.json();

      assert.strictEqual(resNpcTurn.status, 200);
      assert.strictEqual(dataNpcTurn.success, true);
      assert.strictEqual(dataNpcTurn.npcActorId, enemyNpc.id);
      assert.ok(dataNpcTurn.proposal !== undefined);
      assert.ok(dataNpcTurn.executionResult !== undefined);
    });
  });
});
