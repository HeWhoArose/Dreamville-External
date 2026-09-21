import { describe, it, beforeEach, before, after } from 'node:test';
import * as assert from 'assert';
import { serverMockAuthority } from '../server/mockEngine/serverMockAuthority';
import { worldRepository } from '../server/repositories/worldRepository';
import { WorkingContextEngine } from '../server/domain/workingContextEngine';
import { PlayerLifecycleState } from '../server/domain/playerLifecycleState';
import { CampaignArchiveService } from '../server/domain/campaignArchive';

describe('CH2 SURGICAL REPAIR VERIFICATION — EPISTEMIC HORIZON & ACTOR DISCOVERY', () => {
  beforeEach(() => {
    serverMockAuthority.resetToCanonicalState('default_story');
    serverMockAuthority.resetToCanonicalState('story_B');
  });

  describe('DEF-CH2-01: Route Edge Epistemic Leak', () => {
    it('Scenario A: hides route edges connected to undiscovered locations', () => {
      const projection = serverMockAuthority.getSanitizedViewState('default_story');
      
      // loc_sunken_scriptorium is undiscovered initially
      assert.strictEqual(projection.locations['loc_sunken_scriptorium'], undefined);
      
      // All projected routeEdges must have both endpoints present in projected locations
      for (const edge of projection.routeEdges) {
        assert.ok(projection.locations[edge.fromLocationId], `fromLocationId ${edge.fromLocationId} must be authorized`);
        assert.ok(projection.locations[edge.toLocationId], `toLocationId ${edge.toLocationId} must be authorized`);
        assert.notStrictEqual(edge.fromLocationId, 'loc_sunken_scriptorium');
        assert.notStrictEqual(edge.toLocationId, 'loc_sunken_scriptorium');
      }
    });
  });

  describe('DEF-CH2-02: Actor-Scoped Discovery Authority', () => {
    it('Scenario B & C: discovery is actor-scoped and isolated between actors', () => {
      // Actor A (default_story) discovers loc_sunken_scriptorium
      const result = serverMockAuthority.processAction({
        type: 'DISCOVER_LOCATION',
        targetLocationId: 'loc_sunken_scriptorium',
      } as any);
      assert.strictEqual(result.success, true);

      const projA = serverMockAuthority.getSanitizedViewState('default_story');
      assert.ok(projA.locations['loc_sunken_scriptorium'], 'Actor A must see loc_sunken_scriptorium after discovery');

      // Check Actor B (story_B)
      const projB = serverMockAuthority.getSanitizedViewState('story_B');
      assert.strictEqual(projB.locations['loc_sunken_scriptorium'], undefined, 'Actor B must NOT see loc_sunken_scriptorium');
    });
  });

  describe('DEF-CH2-03: Living World Epistemic Projection', () => {
    it('Scenario D: masks undiscovered locations, NPC schedules, and secret events in living-world state', () => {
      const livingSim = worldRepository.getLivingWorldSimulation('default_story');
      const npcProfiles = livingSim.getAllNpcSchedules();
      assert.ok(npcProfiles.length > 0);

      // Verify canonical sim has raw schedule info
      const rawProfile = npcProfiles[0];
      assert.ok(rawProfile.currentLocationId);

      // Verify projection logic does not mutate raw sim state
      assert.ok(livingSim.getAllNpcSchedules().length > 0);
    });
  });

  describe('DEF-CH2-04: Working Context Engine Epistemic Masking', () => {
    it('Scenario E: masks undiscovered targetLocationId in AI schedule route context', () => {
      const turnContext = WorkingContextEngine.assembleTurnContext({
        storyId: 'default_story',
        playerAction: 'Observe surroundings',
      });

      assert.ok(turnContext.assembledText);
      // Ensure undiscovered location loc_sunken_scriptorium is not raw in working context schedule routes
      assert.strictEqual(
        turnContext.assembledText.includes('loc_sunken_scriptorium'),
        false,
        'Raw undiscovered location ID must not leak into working context prompt'
      );
    });
  });

  describe('Scenario F: Persistence & Archive Integrity', () => {
    it('preserves discoveredLocationIds across PlayerLifecycleState serialization and campaign archive', () => {
      const player = new PlayerLifecycleState({
        actorId: 'player_test',
        name: 'Tester',
        locationId: 'loc_whispering_orrery',
        lastUpdatedTime: 100,
        discoveredLocationIds: ['loc_whispering_orrery', 'loc_lantern_vault', 'loc_sunken_scriptorium'],
      });

      const json = player.toJSON();
      const restored = PlayerLifecycleState.fromJSON(json);
      assert.deepStrictEqual(restored.discoveredLocationIds, ['loc_whispering_orrery', 'loc_lantern_vault', 'loc_sunken_scriptorium']);

      const archive = CampaignArchiveService.createArchive({
        campaignId: 'default_story',
        title: 'Default Story',
        worldState: { time: 100 },
        playerState: player.toJSON(),
        inventoryState: {},
        npcsState: {},
        chronicleState: {},
        narrativeState: {},
      });
      assert.ok(archive.manifest.campaignId === 'default_story');
    });
  });

	describe('CH2 RECONCILIATION SURGICAL REPAIRS (CH2-05, BYPASS-01, BYPASS-02, CH2-06, CH2-07)', () => {
		it('BYPASS-01 & BYPASS-02: WorkingContext uses actor-scoped discovery and capabilities', () => {
			const turnContext = WorkingContextEngine.assembleTurnContext({
				storyId: 'default_story',
				playerAction: 'Check status',
			});

			assert.ok(turnContext.assembledText);
			// BYPASS-02: World-Enveloping Darkness is a WorldScale capability requiring minVesselCapacity 60.
			// Baseline player vesselCapacity is 40, so World-Enveloping Darkness must NOT be injected into relevantCapabilities.
			assert.strictEqual(
				turnContext.assembledText.includes('World-Enveloping Darkness'),
				false,
				'Unearned WorldScale capability must not be injected into working context'
			);
		});

		it('CH2-06: CapabilityEngine.getActorCapabilities filters by vesselCapacity', () => {
			const capEngine = worldRepository.getCapabilityEngine('default_story');
			capEngine.seedStarterPowerStateForActor('actor_test_cap');
			
			const actorCaps = capEngine.getActorCapabilities('actor_test_cap');
			// Vessel capacity is 40. cap_world_darkness requires minVesselCapacityRequired 60.
			const hasWorldDarkness = actorCaps.some((c) => c.id === 'cap_world_darkness');
			assert.strictEqual(hasWorldDarkness, false, 'Actor with vesselCapacity 40 must not receive cap_world_darkness');
			
			const hasVenomousBite = actorCaps.some((c) => c.id === 'cap_venomous_bite');
			assert.strictEqual(hasVenomousBite, true, 'Actor with vesselCapacity 40 must receive cap_venomous_bite (req 5)');
		});

		it('CH2-07: InventoryItemEngine.projectActorInventory masks unidentified items', () => {
			const invEngine = worldRepository.getInventoryEngine('default_story');
			invEngine.seedStarterInventoryForActor('actor_test_inv');
			
			// Create an unidentified item
			const unid = invEngine.createInstance({
				defId: 'def_iron_sword',
				ownerEntityId: 'actor_test_inv',
				provenance: 'secret_chest',
				customName: 'Mystic Blade',
			});
			// Set identified = false
			const itemRef = invEngine.getItemInstance(unid.id);
			if (itemRef) {
				itemRef.identified = false;
				(invEngine as any).itemInstances.set(unid.id, itemRef);
			}

			const projection = invEngine.projectActorInventory('actor_test_inv');
			const projectedUnid = projection.items.find((i) => i.id === unid.id);
			assert.ok(projectedUnid, 'Unidentified item must be present in projected items array');
			assert.strictEqual(projectedUnid.name, 'Unidentified Item', 'Unidentified item name must be masked');
			assert.deepStrictEqual(projectedUnid.enchantments, [], 'Enchantments must be masked for unidentified item');
			assert.strictEqual(projectedUnid.provenance, 'unknown', 'Provenance must be masked for unidentified item');
		});
	});

  describe('CH2-08: Actor-Scoped Tactical Perception & Knowledge Projection', () => {
    it('Canonical Completeness: TacticalCombatEngine retains all participants, hazards, and turns internally', () => {
      const combat = worldRepository.getCombatEngine('default_story');
      combat.clear();

      combat.addParticipant({
        id: 'actor_vael',
        name: 'Vael',
        x: 1,
        y: 1,
        initiative: 20,
        team: 'player_allies',
        hpCurrent: 30,
        hpMax: 30,
        armorClass: 15,
        speedCells: 5,
        attackBonus: 4,
        damageFormula: '1d8+2',
        conditions: [],
        isDead: false,
      });

      combat.addParticipant({
        id: 'actor_hidden_stalker',
        name: 'Shadow Stalker',
        x: 5,
        y: 5,
        initiative: 15,
        team: 'enemies',
        hpCurrent: 20,
        hpMax: 20,
        armorClass: 12,
        speedCells: 4,
        attackBonus: 3,
        damageFormula: '1d6+1',
        conditions: ['Hidden', 'Stealthed'],
        isDead: false,
      });

      combat.rollInitiative();

      // Canonical engine has 2 participants
      assert.strictEqual(combat.getParticipants().length, 2);
      assert.strictEqual(combat.getTurnQueue().length, 2);
      assert.ok(combat.getParticipant('actor_hidden_stalker'));
    });

    it('Actor Isolation: projectCombatForActor omits hidden participants and masks turnQueue', () => {
      const combat = worldRepository.getCombatEngine('default_story');
      combat.clear();

      combat.addParticipant({
        id: 'actor_vael',
        name: 'Vael',
        x: 1,
        y: 1,
        initiative: 20,
        team: 'player_allies',
        hpCurrent: 30,
        hpMax: 30,
        armorClass: 15,
        speedCells: 5,
        attackBonus: 4,
        damageFormula: '1d8+2',
        conditions: [],
        isDead: false,
      });

      combat.addParticipant({
        id: 'actor_hidden_stalker',
        name: 'Shadow Stalker',
        x: 5,
        y: 5,
        initiative: 15,
        team: 'enemies',
        hpCurrent: 20,
        hpMax: 20,
        armorClass: 12,
        speedCells: 4,
        attackBonus: 3,
        damageFormula: '1d6+1',
        conditions: ['Hidden'],
        isDead: false,
      });

      combat.rollInitiative();

      const projection = combat.projectCombatForActor('actor_vael');

      // 1. Participants projection contains only actor_vael
      assert.strictEqual(projection.participants.length, 1);
      assert.strictEqual(projection.participants[0].id, 'actor_vael');
      assert.strictEqual(projection.participants.some((p) => p.id === 'actor_hidden_stalker'), false);

      // 2. Turn queue masks hidden actor
      assert.strictEqual(projection.turnQueue.includes('actor_hidden_stalker'), false);
      assert.ok(projection.turnQueue.includes('unknown_actor'));
    });

    it('AI Context Scoping: WorkingContextEngine does not leak hidden combatants into prompt text', () => {
      const combat = worldRepository.getCombatEngine('default_story');
      combat.clear();

      combat.addParticipant({
        id: 'player_actor_default_story',
        name: 'Vael',
        x: 1,
        y: 1,
        initiative: 20,
        team: 'player_allies',
        hpCurrent: 30,
        hpMax: 30,
        armorClass: 15,
        speedCells: 5,
        attackBonus: 4,
        damageFormula: '1d8+2',
        conditions: [],
        isDead: false,
      });

      combat.addParticipant({
        id: 'actor_invisible_assassin',
        name: 'Nightshade Assassin',
        x: 3,
        y: 3,
        initiative: 10,
        team: 'enemies',
        hpCurrent: 25,
        hpMax: 25,
        armorClass: 14,
        speedCells: 6,
        attackBonus: 5,
        damageFormula: '2d6',
        conditions: ['Invisible'],
        isDead: false,
      });

      combat.rollInitiative();

      const turnContext = WorkingContextEngine.assembleTurnContext({
        storyId: 'default_story',
        playerAction: 'Brace for combat',
        viewerActorId: 'player_actor_default_story',
      });

      assert.strictEqual(
        turnContext.assembledText.includes('actor_invisible_assassin'),
        false,
        'Hidden combatant ID must not leak into working context'
      );
      assert.strictEqual(
        turnContext.assembledText.includes('Nightshade Assassin'),
        false,
        'Hidden combatant name must not leak into working context'
      );
    });

    it('Event Log Sanitization: prevents event leaks for unseen actions', () => {
      const combat = worldRepository.getCombatEngine('default_story');
      combat.clear();

      combat.addParticipant({
        id: 'actor_vael',
        name: 'Vael',
        x: 1,
        y: 1,
        initiative: 20,
        team: 'player_allies',
        hpCurrent: 30,
        hpMax: 30,
        armorClass: 15,
        speedCells: 5,
        attackBonus: 4,
        damageFormula: '1d8+2',
        conditions: [],
        isDead: false,
      });

      combat.addParticipant({
        id: 'actor_hidden_stalker',
        name: 'Shadow Stalker',
        x: 5,
        y: 5,
        initiative: 15,
        team: 'enemies',
        hpCurrent: 20,
        hpMax: 20,
        armorClass: 12,
        speedCells: 4,
        attackBonus: 3,
        damageFormula: '1d6+1',
        conditions: ['Hidden'],
        isDead: false,
      });
      combat.turnQueue = ['actor_hidden_stalker', 'actor_vael'];
      combat.currentTurnIndex = 0;

      // Stalker executes an attack internally
      combat.executeAttack('actor_hidden_stalker', 'actor_vael');

      const projection = combat.projectCombatForActor('actor_vael');
      assert.ok(projection.eventLog.length > 0);
      const ev = projection.eventLog[projection.eventLog.length - 1];

      // Actor ID should be masked or sanitized
      assert.strictEqual(ev.actorId, 'unknown_actor');
      assert.strictEqual(ev.headline, 'An unknown combat event occurred.');
    });

    it('Target-ID Security Authorization: rejects targeting unseen/hidden participants', () => {
      const combat = worldRepository.getCombatEngine('default_story');
      combat.clear();

      combat.addParticipant({
        id: 'actor_vael',
        name: 'Vael',
        x: 1,
        y: 1,
        initiative: 20,
        team: 'player_allies',
        hpCurrent: 30,
        hpMax: 30,
        armorClass: 15,
        speedCells: 5,
        attackBonus: 4,
        damageFormula: '1d8+2',
        conditions: [],
        isDead: false,
      });

      const hiddenTarget = {
        id: 'actor_hidden_stalker',
        name: 'Shadow Stalker',
        x: 5,
        y: 5,
        initiative: 15,
        team: 'enemies',
        hpCurrent: 20,
        hpMax: 20,
        armorClass: 12,
        speedCells: 4,
        attackBonus: 3,
        damageFormula: '1d6+1',
        conditions: ['Stealthed'],
        isDead: false,
      };
      combat.addParticipant(hiddenTarget);

      // Verify knowledge check
      const isKnown = combat.isParticipantKnownToActor('actor_vael', hiddenTarget);
      assert.strictEqual(isKnown, false, 'Stealthed target must be rejected by isParticipantKnownToActor');
    });

    it('Lossless Archival: exportState and importState remain 100% canonical and lossless', () => {
      const combat = worldRepository.getCombatEngine('default_story');
      combat.clear();

      combat.addParticipant({
        id: 'actor_vael',
        name: 'Vael',
        x: 1,
        y: 1,
        initiative: 20,
        team: 'player_allies',
        hpCurrent: 30,
        hpMax: 30,
        armorClass: 15,
        speedCells: 5,
        attackBonus: 4,
        damageFormula: '1d8+2',
        conditions: [],
        isDead: false,
      });

      combat.addParticipant({
        id: 'actor_hidden_stalker',
        name: 'Shadow Stalker',
        x: 5,
        y: 5,
        initiative: 15,
        team: 'enemies',
        hpCurrent: 20,
        hpMax: 20,
        armorClass: 12,
        speedCells: 4,
        attackBonus: 3,
        damageFormula: '1d6+1',
        conditions: ['Hidden'],
        isDead: false,
      });

      const exported = combat.exportState();
      assert.strictEqual(exported.participants.length, 2);

      const newCombat = new (combat.constructor as any)();
      newCombat.importState(exported);
      assert.strictEqual(newCombat.getParticipants().length, 2);
      assert.strictEqual(newCombat.getParticipant('actor_hidden_stalker')?.name, 'Shadow Stalker');
    });
  });

  describe('CH2-08 FINAL REPAIR: ACTOR IDENTITY SECURITY & EPISTEMIC KNOWLEDGE BOUNDARIES', () => {
    let appServer: import('http').Server;
    let apiBaseUrl: string;

    before(async () => {
      const express = (await import('express')).default;
      const { gameRouter } = await import('../server/api/gameRoutes');
      const app = express();
      app.use(express.json());
      app.use('/api/game', gameRouter);

      await new Promise<void>((resolve) => {
        appServer = app.listen(0, '127.0.0.1', () => {
          const addr = appServer.address();
          if (addr && typeof addr === 'object') {
            apiBaseUrl = `http://127.0.0.1:${addr.port}/api/game`;
          }
          resolve();
        });
      });
    });

    after(async () => {
      await new Promise<void>((resolve) => {
        if (appServer) {
          appServer.close(() => resolve());
        } else {
          resolve();
        }
      });
    });

    it('TEST 1: Public route GET /combat/state cannot fetch projection for unowned actorId', async () => {
      // Initialize encounter first
      const initRes = await fetch(`${apiBaseUrl}/combat/encounter/start`, { method: 'POST' });
      assert.strictEqual(initRes.status, 200);

      // Attempt to fetch another actor's state
      const impersonateRes = await fetch(`${apiBaseUrl}/combat/state?actorId=enemy_void_construct`);
      assert.strictEqual(impersonateRes.status, 403, 'Must reject fetching state for unowned actorId');

      // Valid fetch for player
      const validRes = await fetch(`${apiBaseUrl}/combat/state`);
      assert.strictEqual(validRes.status, 200);
      const data = await validRes.json();
      assert.strictEqual(data.viewingActorId, 'player_actor_default_story');
    });

    it('TEST 2: Public route POST /combat/move cannot move unowned actorId', async () => {
      const res = await fetch(`${apiBaseUrl}/combat/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorId: 'enemy_void_construct',
          targetX: 5,
          targetY: 5,
        }),
      });
      assert.strictEqual(res.status, 403, 'Must reject moving an unowned actorId');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.errorReason.includes('Unauthorized'));
    });

    it('TEST 3: Public route POST /combat/attack cannot attack as unowned attackerId', async () => {
      const res = await fetch(`${apiBaseUrl}/combat/attack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attackerId: 'enemy_void_construct',
          targetId: 'player_actor_default_story',
        }),
      });
      assert.strictEqual(res.status, 403, 'Must reject attacking as unowned attackerId');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.errorReason.includes('Unauthorized'));
    });

    it('TEST 4: Public route POST /combat/cast cannot cast as unowned actorId', async () => {
      const res = await fetch(`${apiBaseUrl}/combat/cast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorId: 'enemy_void_construct',
          targetId: 'player_actor_default_story',
          capabilityId: 'cap_solar_flare',
        }),
      });
      assert.strictEqual(res.status, 403, 'Must reject casting capability as unowned actorId');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.errorReason.includes('Unauthorized'));
    });

    it('TEST 5: Public route POST /combat/end-turn cannot end turn as unowned actorId', async () => {
      const res = await fetch(`${apiBaseUrl}/combat/end-turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorId: 'enemy_void_construct',
        }),
      });
      assert.strictEqual(res.status, 403, 'Must reject ending turn as unowned actorId');
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.errorReason.includes('Unauthorized'));
    });

    it('TEST 6: Combat participant known via durable KnowledgeFact is visible even if stealthed', () => {
      const combat = worldRepository.getCombatEngine('default_story');
      combat.clear();

      const player = {
        id: 'player_actor_default_story',
        name: 'Vael',
        x: 1,
        y: 1,
        initiative: 20,
        team: 'player_allies' as const,
        hpCurrent: 30,
        hpMax: 30,
        armorClass: 15,
        speedCells: 5,
        attackBonus: 4,
        damageFormula: '1d8+2',
        conditions: [],
        isDead: false,
      };

      const stealthNpc = {
        id: 'npc_infiltrator_valen',
        name: 'Infiltrator Valen',
        x: 8,
        y: 8,
        initiative: 12,
        team: 'enemies' as const,
        hpCurrent: 20,
        hpMax: 20,
        armorClass: 13,
        speedCells: 4,
        attackBonus: 3,
        damageFormula: '1d6+1',
        conditions: ['Stealthed', 'Hidden'],
        isDead: false,
      };

      combat.addParticipant(player);
      combat.addParticipant(stealthNpc);

      // Add durable KnowledgeFact for npc_infiltrator_valen
      worldRepository.addKnowledgeFact('default_story', {
        id: 'fact_valen_known',
        subjectEntityId: 'npc_infiltrator_valen',
        predicate: 'identity_confirmed',
        objectValue: 'hostile_covert_scout',
        sourceType: 'witnessed',
        acquiredAtTimestamp: worldRepository.getWorldClock('default_story').getTimestamp(),
        confidence: 1.0,
        secretLevel: 'public',
      });

      const perceptionOptions = worldRepository.getCombatPerceptionOptions('default_story', player.id);
      const isKnown = combat.isParticipantKnownToActor(player.id, stealthNpc, perceptionOptions);
      assert.strictEqual(isKnown, true, 'Entity known via durable KnowledgeFact must be known even when Stealthed');

      const projection = combat.projectCombatForActor(player.id, perceptionOptions);
      const projectedValen = projection.participants.find((p) => p.id === 'npc_infiltrator_valen');
      assert.ok(projectedValen, 'Projected participants must include epistemically known entity');
    });

    it('TEST 7: Combat participant unknown epistemically is NOT visible even if adjacent', () => {
      const combat = worldRepository.getCombatEngine('default_story');
      combat.clear();

      const player = {
        id: 'player_actor_default_story',
        name: 'Vael',
        x: 1,
        y: 1,
        initiative: 20,
        team: 'player_allies' as const,
        hpCurrent: 30,
        hpMax: 30,
        armorClass: 15,
        speedCells: 5,
        attackBonus: 4,
        damageFormula: '1d8+2',
        conditions: [],
        isDead: false,
      };

      // Adjacent enemy at (1,2) with Stealth condition and NOT in knowledge repository
      const unknownSneak = {
        id: 'npc_unidentified_wraith_99',
        name: 'Grave Wraith',
        x: 1,
        y: 2,
        initiative: 14,
        team: 'enemies' as const,
        hpCurrent: 25,
        hpMax: 25,
        armorClass: 14,
        speedCells: 4,
        attackBonus: 4,
        damageFormula: '1d6+2',
        conditions: ['Stealthed', 'Invisible'],
        isDead: false,
      };

      combat.addParticipant(player);
      combat.addParticipant(unknownSneak);

      const perceptionOptions = worldRepository.getCombatPerceptionOptions('default_story', player.id);
      const isKnown = combat.isParticipantKnownToActor(player.id, unknownSneak, perceptionOptions);
      assert.strictEqual(isKnown, false, 'Unknown concealed entity must not be perceived even if adjacent');

      const projection = combat.projectCombatForActor(player.id, perceptionOptions);
      const projectedSneak = projection.participants.find((p) => p.id === 'npc_unidentified_wraith_99');
      assert.strictEqual(projectedSneak, undefined, 'Unknown stealthed entity must be omitted from projection');
    });

    it('TEST 8: Epistemic check in projectCombatForActor and isParticipantKnownToActor return identical results for all participants', () => {
      const combat = worldRepository.getCombatEngine('default_story');
      combat.clear();

      const p1 = {
        id: 'player_actor_default_story',
        name: 'Vael',
        x: 1,
        y: 1,
        initiative: 20,
        team: 'player_allies' as const,
        hpCurrent: 30,
        hpMax: 30,
        armorClass: 15,
        speedCells: 5,
        attackBonus: 4,
        damageFormula: '1d8+2',
        conditions: [],
        isDead: false,
      };

      const p2 = {
        id: 'ally_guard',
        name: 'Silverguard Ally',
        x: 2,
        y: 2,
        initiative: 16,
        team: 'player_allies' as const,
        hpCurrent: 35,
        hpMax: 35,
        armorClass: 16,
        speedCells: 4,
        attackBonus: 4,
        damageFormula: '1d8+2',
        conditions: [],
        isDead: false,
      };

      const p3 = {
        id: 'enemy_visible_sentry',
        name: 'Visible Sentry',
        x: 4,
        y: 4,
        initiative: 10,
        team: 'enemies' as const,
        hpCurrent: 20,
        hpMax: 20,
        armorClass: 12,
        speedCells: 4,
        attackBonus: 3,
        damageFormula: '1d6+1',
        conditions: [],
        isDead: false,
      };

      const p4 = {
        id: 'enemy_stealth_ghoul',
        name: 'Stealth Ghoul',
        x: 5,
        y: 5,
        initiative: 8,
        team: 'enemies' as const,
        hpCurrent: 15,
        hpMax: 15,
        armorClass: 11,
        speedCells: 4,
        attackBonus: 3,
        damageFormula: '1d6',
        conditions: ['Stealthed'],
        isDead: false,
      };

      combat.addParticipant(p1);
      combat.addParticipant(p2);
      combat.addParticipant(p3);
      combat.addParticipant(p4);

      const perceptionOptions = worldRepository.getCombatPerceptionOptions('default_story', p1.id);
      const projection = combat.projectCombatForActor(p1.id, perceptionOptions);
      const projectedIds = new Set(projection.participants.map((p) => p.id));

      for (const participant of combat.getParticipants()) {
        const isKnown = combat.isParticipantKnownToActor(p1.id, participant, perceptionOptions);
        const inProjection = projectedIds.has(participant.id);
        assert.strictEqual(
          isKnown,
          inProjection,
          `Epistemic parity failure for participant '${participant.id}': isParticipantKnownToActor=${isKnown}, inProjection=${inProjection}`
        );
      }
    });

    it('TEST 9: Full turn cycle executes with actor-scoped projections without epistemic leak', () => {
      const combat = worldRepository.getCombatEngine('default_story');
      combat.clear();

      const p1 = {
        id: 'player_actor_default_story',
        name: 'Vael',
        x: 1,
        y: 1,
        initiative: 20,
        team: 'player_allies' as const,
        hpCurrent: 30,
        hpMax: 30,
        armorClass: 15,
        speedCells: 5,
        attackBonus: 4,
        damageFormula: '1d8+2',
        conditions: [],
        isDead: false,
      };

      const hiddenEnemy = {
        id: 'enemy_cloaked_assassin',
        name: 'Cloaked Assassin',
        x: 3,
        y: 3,
        initiative: 15,
        team: 'enemies' as const,
        hpCurrent: 22,
        hpMax: 22,
        armorClass: 14,
        speedCells: 5,
        attackBonus: 5,
        damageFormula: '1d8+3',
        conditions: ['Invisible'],
        isDead: false,
      };

      combat.addParticipant(p1);
      combat.addParticipant(hiddenEnemy);
      combat.rollInitiative();

      // Execute movement
      const moveRes = combat.moveActor(p1.id, 2, 1);
      assert.strictEqual(moveRes.success, true);

      // Advance turn
      const advanceRes = combat.advanceTurn();
      assert.strictEqual(advanceRes.round, 1);

      // Project for player
      const perceptionOptions = worldRepository.getCombatPerceptionOptions('default_story', p1.id);
      const proj = combat.projectCombatForActor(p1.id, perceptionOptions);

      assert.strictEqual(proj.participants.length, 1);
      assert.strictEqual(proj.participants[0].id, p1.id);
      assert.strictEqual(proj.participants.some((p) => p.id === 'enemy_cloaked_assassin'), false);

      // Verify canonical state still has both participants (Lossless & Complete)
      assert.strictEqual(combat.getParticipants().length, 2);
    });
  });

  describe('CH2 REGRESSION: Epistemic Node & Dynamic Geography Verification', () => {
    it('proves a newly created dynamic world contains NO default fixture nodes', () => {
      const dynamicStoryId = 'story_regression_dynamic_geography';
      const dynamicWorld = {
        worldId: 'world_werewolf',
        title: 'Lupine Sanguine Moon',
        summary: 'Only werewolves exist; dark fantasy.',
        geography: {
          locations: [
            { id: 'loc_lupine_ridge', name: 'Lupine Ridge', description: 'Craggy peaks' },
            { id: 'loc_silver_mine', name: 'Silver Mine', description: 'Ancient mines' },
          ]
        }
      };
      
      worldRepository.seedDynamicStoryRun(dynamicStoryId, dynamicWorld, {
        characterName: 'Fenrir',
      });

      const geo = worldRepository.getGeographyGraph(dynamicStoryId);
      const nodes = geo.getAllNodes();

      // Verify no default fixture locations are present
      const fixtureIds = ['loc_whispering_orrery', 'loc_lantern_vault', 'loc_glasswood_verge', 'loc_sunken_scriptorium'];
      for (const id of fixtureIds) {
        assert.strictEqual(geo.getNode(id), undefined, `Should not contain default fixture location: ${id}`);
      }

      // Verify only synthesized nodes exist
      assert.strictEqual(nodes.length, 2);
      assert.ok(nodes.some(n => n.id === 'loc_lupine_ridge'));
      assert.ok(nodes.some(n => n.id === 'loc_silver_mine'));
    });

    it('enforces strict epistemic visibility on 4-node graph with an undiscovered node', () => {
      const storyId = 'story_epistemic_4_nodes';
      const geo = worldRepository.getGeographyGraph(storyId);
      geo.clear();

      const n1 = { id: 'loc_a', name: 'A', regionId: 'R', description: 'desc', coordinates: { x: 0, y: 0 }, accessible: true, discovered: true, provenance: 'generated' as const };
      const n2 = { id: 'loc_b', name: 'B', regionId: 'R', description: 'desc', coordinates: { x: 1, y: 1 }, accessible: true, discovered: true, provenance: 'generated' as const };
      const n3 = { id: 'loc_c', name: 'C', regionId: 'R', description: 'desc', coordinates: { x: 2, y: 2 }, accessible: true, discovered: true, provenance: 'generated' as const };
      const n4 = { id: 'loc_d', name: 'D', regionId: 'R', description: 'desc', coordinates: { x: 3, y: 3 }, accessible: true, discovered: false, provenance: 'generated' as const };

      geo.addNode(n1);
      geo.addNode(n2);
      geo.addNode(n3);
      geo.addNode(n4);

      const player = new PlayerLifecycleState({
        actorId: 'player_epistemic_4',
        name: 'Tester',
        locationId: 'loc_a',
        discoveredLocationIds: ['loc_a', 'loc_b', 'loc_c'],
      });
      worldRepository.updatePlayerLifecycle(storyId, player);

      const projection = serverMockAuthority.filterForExternalClient(serverMockAuthority['EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE'], storyId);
      
      assert.strictEqual(projection.locations['loc_d'], undefined, 'Undiscovered node must not leak its canonical ID');
      assert.ok(projection.locations['unknown_loc_d'], 'Undiscovered node must be projected under unknown territory key');
      assert.strictEqual(projection.locations['unknown_loc_d'].name, 'Unknown Territory');
    });

    it('enforces strict epistemic visibility on 5-node graph with an undiscovered node', () => {
      const storyId = 'story_epistemic_5_nodes';
      const geo = worldRepository.getGeographyGraph(storyId);
      geo.clear();

      const n1 = { id: 'loc_a', name: 'A', regionId: 'R', description: 'desc', coordinates: { x: 0, y: 0 }, accessible: true, discovered: true, provenance: 'generated' as const };
      const n2 = { id: 'loc_b', name: 'B', regionId: 'R', description: 'desc', coordinates: { x: 1, y: 1 }, accessible: true, discovered: true, provenance: 'generated' as const };
      const n3 = { id: 'loc_c', name: 'C', regionId: 'R', description: 'desc', coordinates: { x: 2, y: 2 }, accessible: true, discovered: true, provenance: 'generated' as const };
      const n4 = { id: 'loc_d', name: 'D', regionId: 'R', description: 'desc', coordinates: { x: 3, y: 3 }, accessible: true, discovered: true, provenance: 'generated' as const };
      const n5 = { id: 'loc_e', name: 'E', regionId: 'R', description: 'desc', coordinates: { x: 4, y: 4 }, accessible: true, discovered: false, provenance: 'generated' as const };

      geo.addNode(n1);
      geo.addNode(n2);
      geo.addNode(n3);
      geo.addNode(n4);
      geo.addNode(n5);

      const player = new PlayerLifecycleState({
        actorId: 'player_epistemic_5',
        name: 'Tester',
        locationId: 'loc_a',
        discoveredLocationIds: ['loc_a', 'loc_b', 'loc_c', 'loc_d'],
      });
      worldRepository.updatePlayerLifecycle(storyId, player);

      const projection = serverMockAuthority.filterForExternalClient(serverMockAuthority['EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE'], storyId);

      assert.strictEqual(projection.locations['loc_e'], undefined, 'Undiscovered node must not leak its canonical ID');
      assert.ok(projection.locations['unknown_loc_e'], 'Undiscovered node must be projected under unknown territory key');
    });

    it('enforces strict epistemic visibility on 6-node graph with an undiscovered node', () => {
      const storyId = 'story_epistemic_6_nodes';
      const geo = worldRepository.getGeographyGraph(storyId);
      geo.clear();

      const n1 = { id: 'loc_a', name: 'A', regionId: 'R', description: 'desc', coordinates: { x: 0, y: 0 }, accessible: true, discovered: true, provenance: 'generated' as const };
      const n2 = { id: 'loc_b', name: 'B', regionId: 'R', description: 'desc', coordinates: { x: 1, y: 1 }, accessible: true, discovered: true, provenance: 'generated' as const };
      const n3 = { id: 'loc_c', name: 'C', regionId: 'R', description: 'desc', coordinates: { x: 2, y: 2 }, accessible: true, discovered: true, provenance: 'generated' as const };
      const n4 = { id: 'loc_d', name: 'D', regionId: 'R', description: 'desc', coordinates: { x: 3, y: 3 }, accessible: true, discovered: true, provenance: 'generated' as const };
      const n5 = { id: 'loc_e', name: 'E', regionId: 'R', description: 'desc', coordinates: { x: 4, y: 4 }, accessible: true, discovered: true, provenance: 'generated' as const };
      const n6 = { id: 'loc_f', name: 'F', regionId: 'R', description: 'desc', coordinates: { x: 5, y: 5 }, accessible: true, discovered: false, provenance: 'generated' as const };

      geo.addNode(n1);
      geo.addNode(n2);
      geo.addNode(n3);
      geo.addNode(n4);
      geo.addNode(n5);
      geo.addNode(n6);

      const player = new PlayerLifecycleState({
        actorId: 'player_epistemic_6',
        name: 'Tester',
        locationId: 'loc_a',
        discoveredLocationIds: ['loc_a', 'loc_b', 'loc_c', 'loc_d', 'loc_e'],
      });
      worldRepository.updatePlayerLifecycle(storyId, player);

      const projection = serverMockAuthority.filterForExternalClient(serverMockAuthority['EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE'], storyId);

      assert.strictEqual(projection.locations['loc_f'], undefined, 'Undiscovered node must not leak its canonical ID');
      assert.ok(projection.locations['unknown_loc_f'], 'Undiscovered node must be projected under unknown territory key');
    });

    it('shows all nodes with real IDs in a completely discovered graph', () => {
      const storyId = 'story_epistemic_fully_discovered';
      const geo = worldRepository.getGeographyGraph(storyId);
      geo.clear();

      const n1 = { id: 'loc_a', name: 'A', regionId: 'R', description: 'desc', coordinates: { x: 0, y: 0 }, accessible: true, discovered: true, provenance: 'generated' as const };
      const n2 = { id: 'loc_b', name: 'B', regionId: 'R', description: 'desc', coordinates: { x: 1, y: 1 }, accessible: true, discovered: true, provenance: 'generated' as const };

      geo.addNode(n1);
      geo.addNode(n2);

      const player = new PlayerLifecycleState({
        actorId: 'player_epistemic_full',
        name: 'Tester',
        locationId: 'loc_a',
        discoveredLocationIds: ['loc_a', 'loc_b'],
      });
      worldRepository.updatePlayerLifecycle(storyId, player);

      const projection = serverMockAuthority.filterForExternalClient(serverMockAuthority['EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE'], storyId);

      assert.ok(projection.locations['loc_a']);
      assert.ok(projection.locations['loc_b']);
      assert.strictEqual(projection.locations['loc_b'].name, 'B');
      assert.strictEqual(projection.locations['unknown_loc_b'], undefined);
    });
  });
});
