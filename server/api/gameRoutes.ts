import { Router, Request, Response } from 'express';
import { serverMockAuthority } from '../mockEngine/serverMockAuthority';
import { ActionRequest } from '../mockEngine/serverTypes';

export const gameRouter = Router();
import { sensoryRouter } from './sensoryRoutes';
gameRouter.use('/sensory', sensoryRouter);

/**
 * GET /api/game/state
 * Returns the sanitized ExternalViewState.
 * Explicitly guaranteed to contain no hiddenCanonicalContext or server test secrets.
 */
gameRouter.get('/state', (req: Request, res: Response) => {
  try {
    const viewState = serverMockAuthority.getSanitizedViewState();
    res.json(viewState);
  } catch (error) {
    console.error('Error projecting external view state:', error);
    res.status(500).json({
      error: 'Failed to retrieve authoritative game state.',
    });
  }
});

/**
 * POST /api/game/action
 * Validates and processes an ActionRequest using server-side mock authority.
 * Returns an ActionResult containing the updated ExternalViewState.
 */
gameRouter.post('/action', (req: Request, res: Response) => {
  try {
    const actionRequest = req.body as ActionRequest;

    if (!actionRequest || typeof actionRequest !== 'object' || !actionRequest.type) {
      res.status(400).json({
        error: 'Invalid request payload: ActionRequest must contain a valid type field.',
      });
      return;
    }

    const actionResult = serverMockAuthority.processAction(actionRequest);
    res.json(actionResult);
  } catch (error) {
    console.error('Error processing authoritative action request:', error);
    res.status(500).json({
      error: 'Internal server error while resolving action request.',
    });
  }
});

/**
 * GET /api/game/epistemic-status
 * Provides non-sensitive diagnostic metrics for the Epistemic Inspector modal.
 * Proves the boundary status without leaking any secrets to the client.
 */
gameRouter.get('/epistemic-status', (req: Request, res: Response) => {
  try {
    const diagnostics = serverMockAuthority.getBoundaryAuditDiagnostics();
    res.json(diagnostics);
  } catch (error) {
    console.error('Error generating boundary diagnostics:', error);
    res.status(500).json({
      error: 'Failed to generate epistemic diagnostics.',
    });
  }
});

/**
 * GET /api/game/living-bible
 * Returns the operational in-app Living Bible requirement ledger (DreamBook §406, §408).
 */
gameRouter.get('/living-bible', async (req: Request, res: Response) => {
  try {
    const { livingBibleRegistry } = await import('../domain/livingBible');
    res.json(livingBibleRegistry.getAllRequirements());
  } catch (error) {
    res.status(500).json({ error: 'Failed to load Living Bible.' });
  }
});

/**
 * GET /api/game/workstation
 * Returns the active development workstation status and iteration audit ledger (DreamBook §408).
 */
gameRouter.get('/workstation', async (req: Request, res: Response) => {
  try {
    const { livingBibleRegistry } = await import('../domain/livingBible');
    res.json(livingBibleRegistry.getWorkstationState());
  } catch (error) {
    res.status(500).json({ error: 'Failed to load Workstation state.' });
  }
});

/**
 * GET /api/game/player-lifecycle
 * Returns the canonical PlayerLifecycleState (DreamBook v10.8 Decision 1).
 */
gameRouter.get('/player-lifecycle', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle('default_story');
    res.json(player ? player.toJSON() : null);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve player lifecycle.' });
  }
});

/**
 * GET /api/game/chronicle
 * Returns player-safe projected chronicle entries (DreamBook §430–§432, CH4 Phase 3 & 4).
 */
gameRouter.get('/chronicle', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const engine = worldRepository.getHistoricalChronicleEngine('default_story');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const playerId = player ? player.actorId : 'player_actor_default_story';
    const entries = engine.projectPlayerChronicle(playerId);
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve chronicle entries.' });
  }
});

/**
 * GET /api/game/dossiers
 * Returns all player-safe projected NPC dossiers (DreamBook §430–§432, CH4 Phase 2 & 4).
 */
gameRouter.get('/dossiers', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const engine = worldRepository.getHistoricalChronicleEngine('default_story');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const playerId = player ? player.actorId : 'player_actor_default_story';
    const rawDossiers = engine.getAllDossiers();
    const projected = rawDossiers.map((d) => engine.projectPlayerDossier(d.subjectId, playerId)).filter(Boolean);
    res.json(projected);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve dossiers.' });
  }
});

/**
 * GET /api/game/dossiers/:subjectId
 * Returns a single player-safe projected NPC dossier.
 */
gameRouter.get('/dossiers/:subjectId', async (req: Request, res: Response) => {
  try {
    const subjectId = Array.isArray(req.params.subjectId) ? req.params.subjectId[0] : req.params.subjectId;
    if (!subjectId) {
      return res.status(400).json({ error: 'Missing subjectId param.' });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const engine = worldRepository.getHistoricalChronicleEngine('default_story');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const playerId = player ? player.actorId : 'player_actor_default_story';
    const projected = engine.projectPlayerDossier(subjectId, playerId);
    if (!projected) {
      return res.status(404).json({ error: `Dossier for ${subjectId} not found.` });
    }
    res.json(projected);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve dossier.' });
  }
});

/**
 * GET /api/game/inventory
 * Returns inventory and paper-doll equipment for active player (CH5).
 */
gameRouter.get('/inventory', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const actorId = player ? player.actorId : 'player_actor_default_story';
    const invEngine = worldRepository.getInventoryEngine('default_story');
    const items = invEngine.getActorInventory(actorId);
    const paperDoll = invEngine.getActorPaperDoll(actorId);
    const definitions = invEngine.getAllDefinitions();
    res.json({ actorId, items, paperDoll, definitions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve inventory.' });
  }
});

/**
 * POST /api/game/inventory/equip
 * Equips an item to a slot with server authority checks (CH5).
 */
gameRouter.post('/inventory/equip', async (req: Request, res: Response) => {
  try {
    const { itemId, slot } = req.body;
    if (!itemId || !slot) {
      return res.status(400).json({ success: false, errorReason: 'Missing itemId or slot in request body.' });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const actorId = player ? player.actorId : 'player_actor_default_story';
    const invEngine = worldRepository.getInventoryEngine('default_story');
    const result = invEngine.equipItem(actorId, itemId, slot);
    if (!result.success) {
      return res.status(400).json(result);
    }
    const items = invEngine.getActorInventory(actorId);
    const paperDoll = invEngine.getActorPaperDoll(actorId);
    res.json({ ...result, items, paperDoll });
  } catch (error) {
    res.status(500).json({ error: 'Failed to equip item.' });
  }
});

/**
 * POST /api/game/inventory/unequip
 * Unequips a paper-doll slot with server authority checks (CH5).
 */
gameRouter.post('/inventory/unequip', async (req: Request, res: Response) => {
  try {
    const { slot } = req.body;
    if (!slot) {
      return res.status(400).json({ success: false, errorReason: 'Missing slot in request body.' });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const actorId = player ? player.actorId : 'player_actor_default_story';
    const invEngine = worldRepository.getInventoryEngine('default_story');
    const result = invEngine.unequipItem(actorId, slot);
    if (!result.success) {
      return res.status(400).json(result);
    }
    const items = invEngine.getActorInventory(actorId);
    const paperDoll = invEngine.getActorPaperDoll(actorId);
    res.json({ ...result, items, paperDoll });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unequip slot.' });
  }
});

/**
 * GET /api/game/inventory/recipes
 * Returns available crafting recipes (CH5).
 */
gameRouter.get('/inventory/recipes', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const invEngine = worldRepository.getInventoryEngine('default_story');
    const recipes = invEngine.getRecipes();
    res.json({ recipes });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve recipes.' });
  }
});

/**
 * POST /api/game/inventory/craft
 * Atomically consumes materials and creates crafted item instance (CH5).
 */
gameRouter.post('/inventory/craft', async (req: Request, res: Response) => {
  try {
    const { recipeId } = req.body;
    if (!recipeId) {
      return res.status(400).json({ success: false, errorReason: 'Missing recipeId in request body.' });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const actorId = player ? player.actorId : 'player_actor_default_story';
    const invEngine = worldRepository.getInventoryEngine('default_story');
    const result = invEngine.craftItem(actorId, recipeId);
    if (!result.success) {
      return res.status(400).json(result);
    }

    // CH4 Integration: record crafted item historical evidence if milestone
    const chronicle = worldRepository.getHistoricalChronicleEngine('default_story');
    const clock = worldRepository.getWorldClock('default_story');
    chronicle.recordEvidence({
      id: `ev_craft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      category: 'SACRED_OR_HISTORIC',
      timestamp: clock.getTimestamp(),
      primarySubjectId: actorId,
      secondarySubjectId: result.producedItem?.id || recipeId,
      locationId: player?.locationId || 'loc_whispering_orrery',
      summary: `Crafted ${result.producedItem?.name || 'an item'}`,
      details: `Forged ${result.producedItem?.name || 'an artifact'} via recipe ${recipeId}.`,
      sourceEventId: `evt_craft_${recipeId}`,
      provenance: 'system_simulation',
      visibility: 'PUBLIC',
      metadata: { recipeId, producedDefId: result.producedItem?.defId },
    });

    const items = invEngine.getActorInventory(actorId);
    const paperDoll = invEngine.getActorPaperDoll(actorId);
    res.json({ ...result, items, paperDoll });
  } catch (error) {
    res.status(500).json({ error: 'Failed to craft item.' });
  }
});

/**
 * POST /api/game/inventory/repair
 * Restores durability and clears broken status for an item (CH5).
 */
gameRouter.post('/inventory/repair', async (req: Request, res: Response) => {
  try {
    const { itemId, repairAmount } = req.body;
    if (!itemId) {
      return res.status(400).json({ success: false, errorReason: 'Missing itemId in request body.' });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const actorId = player ? player.actorId : 'player_actor_default_story';
    const invEngine = worldRepository.getInventoryEngine('default_story');

    const item = invEngine.getItemInstance(itemId);
    if (!item) {
      return res.status(400).json({ success: false, errorReason: `Item ${itemId} not found.` });
    }
    if (item.ownerEntityId !== actorId) {
      return res.status(403).json({ success: false, errorReason: 'Cannot repair an item owned by another actor.' });
    }

    const amount = typeof repairAmount === 'number' && repairAmount > 0 ? repairAmount : 50;
    const result = invEngine.repairItem(itemId, amount);

    const updatedItem = invEngine.getItemInstance(itemId);
    const items = invEngine.getActorInventory(actorId);
    const paperDoll = invEngine.getActorPaperDoll(actorId);
    res.json({ success: true, ...result, item: updatedItem, items, paperDoll });
  } catch (error) {
    res.status(500).json({ error: 'Failed to repair item.' });
  }
});

/**
 * POST /api/game/inventory/degrade
 * Authoritative wear/durability degradation endpoint for simulations/hazards (CH5).
 */
gameRouter.post('/inventory/degrade', async (req: Request, res: Response) => {
  try {
    const { itemId, wearAmount } = req.body;
    if (!itemId) {
      return res.status(400).json({ success: false, errorReason: 'Missing itemId in request body.' });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const actorId = player ? player.actorId : 'player_actor_default_story';
    const invEngine = worldRepository.getInventoryEngine('default_story');

    const item = invEngine.getItemInstance(itemId);
    if (!item) {
      return res.status(400).json({ success: false, errorReason: `Item ${itemId} not found.` });
    }

    const amount = typeof wearAmount === 'number' && wearAmount > 0 ? wearAmount : 20;
    const result = invEngine.degradeDurability(itemId, amount);

    const updatedItem = invEngine.getItemInstance(itemId);
    const items = invEngine.getActorInventory(actorId);
    const paperDoll = invEngine.getActorPaperDoll(actorId);
    res.json({ success: true, ...result, item: updatedItem, items, paperDoll });
  } catch (error) {
    res.status(500).json({ error: 'Failed to degrade item durability.' });
  }
});

/**
 * GET /api/game/capabilities
 * Returns power state, capabilities list, and DAG graph for active player (CH6 & CH7).
 */
gameRouter.get('/capabilities', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const actorId = player ? player.actorId : 'player_actor_default_story';
    const capEngine = worldRepository.getCapabilityEngine('default_story');
    const powerState = capEngine.getPowerState(actorId);
    const capabilities = capEngine.getAllCapabilities();
    const graph = capEngine.getCapabilityGraph();
    res.json({ actorId, powerState, capabilities, graph });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve capabilities.' });
  }
});

/**
 * POST /api/game/capabilities/adjudicate
 * Deterministically adjudicates capability execution and applies mechanical consequences (CH6).
 */
gameRouter.post('/capabilities/adjudicate', async (req: Request, res: Response) => {
  try {
    const { intendedCapabilityId, requestedScale, actionDescription, actorId: reqActorId } = req.body;
    if (!intendedCapabilityId || typeof intendedCapabilityId !== 'string') {
      return res.status(400).json({
        approved: false,
        rejectionReason: 'Missing or invalid intendedCapabilityId in request body.',
      });
    }

    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const actorId = reqActorId || (player ? player.actorId : 'player_actor_default_story');
    const capEngine = worldRepository.getCapabilityEngine('default_story');

    const result = capEngine.adjudicate({
      actorId,
      intendedCapabilityId,
      requestedScale: requestedScale || 'Moderate',
      actionDescription: actionDescription || `Manifest ${intendedCapabilityId}`,
    });

    if (result.approved) {
      // CH4 Integration: record chronicle evidence if significant/world-scale
      const cap = capEngine.getCapability(intendedCapabilityId);
      const isWorldScale = requestedScale === 'WorldScale' || cap?.powerTier === 'WorldScale';
      const chronicle = worldRepository.getHistoricalChronicleEngine('default_story');
      const clock = worldRepository.getWorldClock('default_story');
      chronicle.recordEvidence({
        id: `ev_cap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        category: isWorldScale ? 'WORLD_ANOMALY' : 'SACRED_OR_HISTORIC',
        timestamp: clock.getTimestamp(),
        primarySubjectId: actorId,
        secondarySubjectId: intendedCapabilityId,
        locationId: player?.locationId || 'loc_whispering_orrery',
        summary: `Invoked ${cap?.name || intendedCapabilityId}`,
        details: result.emittedObservation.sensoryDescription || result.narrativeDirective,
        sourceEventId: `evt_cap_${intendedCapabilityId}`,
        provenance: 'deterministic_adjudication',
        visibility: 'PUBLIC',
        metadata: { intendedCapabilityId, hpDelta: result.hpDelta, strainDelta: result.strainDelta },
      });
    }

    const powerState = capEngine.getPowerState(actorId);
    const capabilities = capEngine.getAllCapabilities();
    const graph = capEngine.getCapabilityGraph();

    res.json({
      ...result,
      powerState,
      capabilities,
      graph,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to adjudicate capability.' });
  }
});

/**
 * POST /api/game/capabilities/synthesize
 * Custom Power Synthesis pipeline converting natural language concepts to structured capabilities (CH7/CH6).
 */
gameRouter.post('/capabilities/synthesize', async (req: Request, res: Response) => {
  try {
    const { conceptName, description, tags, powerTier, actorId: reqActorId } = req.body;
    if (!conceptName || typeof conceptName !== 'string' || !description || typeof description !== 'string') {
      return res.status(400).json({
        success: false,
        errorReason: 'conceptName and description strings are required for power synthesis.',
      });
    }

    const validTiers = ['Minor', 'Moderate', 'Major', 'WorldScale'];
    const chosenTier = validTiers.includes(powerTier) ? powerTier : 'Moderate';

    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const actorId = reqActorId || (player ? player.actorId : 'player_actor_default_story');
    const capEngine = worldRepository.getCapabilityEngine('default_story');

    const synthesisResult = capEngine.synthesizeCustomPower({
      actorId,
      conceptName: conceptName.trim(),
      description: description.trim(),
      tags: Array.isArray(tags) ? tags : [],
      powerTier: chosenTier,
    });

    // CH4 Integration: record custom synthesis evidence
    const chronicle = worldRepository.getHistoricalChronicleEngine('default_story');
    const clock = worldRepository.getWorldClock('default_story');
    chronicle.recordEvidence({
      id: `ev_synth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      category: 'SACRED_OR_HISTORIC',
      timestamp: clock.getTimestamp(),
      primarySubjectId: actorId,
      secondarySubjectId: synthesisResult.primaryCapability.id,
      locationId: player?.locationId || 'loc_whispering_orrery',
      summary: `Synthesized Custom Power: ${conceptName}`,
      details: `Forged custom technique '${conceptName}' (${chosenTier} Tier). Derived: ${synthesisResult.derivedSkills.join(', ')}.`,
      sourceEventId: `evt_synth_${synthesisResult.primaryCapability.id}`,
      provenance: 'custom_power_synthesis',
      visibility: 'PUBLIC',
      metadata: { conceptName, powerTier: chosenTier, derivedSkills: synthesisResult.derivedSkills },
    });

    const powerState = capEngine.getPowerState(actorId);
    const capabilities = capEngine.getAllCapabilities();
    const graph = capEngine.getCapabilityGraph();

    res.json({
      success: true,
      ...synthesisResult,
      powerState,
      capabilities,
      graph,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to synthesize custom power.' });
  }
});

/**
 * GET /api/game/archive/export
 * Exports lossless .dreamarchive container with SHA-256 partition hashes (CH13).
 */
gameRouter.get('/archive/export', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const { CampaignArchiveService } = await import('../domain/campaignArchive');

    const clock = worldRepository.getWorldClock('default_story');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const chronicle = worldRepository.getHistoricalChronicleEngine('default_story');
    const inv = worldRepository.getInventoryEngine('default_story');
    const capEngine = worldRepository.getCapabilityEngine('default_story');
    const combatEngine = worldRepository.getCombatEngine('default_story');
    const memoryEngine = worldRepository.getMemoryEngine('default_story');
    const livingSim = worldRepository.getLivingWorldSimulation('default_story');
    const sensoryEngine = worldRepository.getSensoryEngine();

    const archive = CampaignArchiveService.createArchive({
      campaignId: 'campaign_default_story',
      title: 'Chronicles of Dreamville',
      worldState: { clock: clock.getTimestamp() },
      playerState: player ? player.toJSON() : {},
      inventoryState: inv.getActorInventory(player?.actorId || 'player'),
      npcsState: [],
      chronicleState: chronicle.getChronicleEntries(),
      narrativeState: [],
      capabilitiesState: capEngine.exportState(),
      combatState: combatEngine.exportState(),
      memoriesState: memoryEngine.exportState(),
      livingWorldState: livingSim.exportState(),
      sensoryState: {
        settings: sensoryEngine.getSettings('default_story'),
        voiceProfiles: sensoryEngine.getAllVoiceProfiles('default_story')
      },
    });

    res.json(archive);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate campaign archive.' });
  }
});

// ==========================================
// CH8: Tactical Combat & D&D Ruleset Adapter
// ==========================================

function getCombatStateHelper(combatEngine: import('../domain/combatEngine').TacticalCombatEngine, storyId = 'default_story') {
  const participants = combatEngine.getParticipants();
  const currentActor = combatEngine.getCurrentActor();
  const hazards = combatEngine.getHazards();
  const turnQueue = combatEngine.getTurnQueue();
  const currentRound = combatEngine.getCurrentRound();
  const currentTurnIndex = combatEngine.getCurrentTurnIndex();
  const eventLog = combatEngine.getBattleEvents();

  const aliveEnemies = participants.filter((p) => p.team === 'enemies' && !p.isDead);
  const aliveAllies = participants.filter((p) => p.team === 'player_allies' && !p.isDead);
  const totalEnemies = participants.filter((p) => p.team === 'enemies');

  const victory = totalEnemies.length > 0 && aliveEnemies.length === 0;
  const defeat = aliveAllies.length === 0 && participants.some((p) => p.team === 'player_allies');
  const isEncounterActive = !victory && !defeat && participants.length > 0;
  const isPlayerTurn = currentActor?.team === 'player_allies' && !currentActor.isDead;

  return {
    participants,
    currentActor,
    hazards,
    turnQueue,
    currentRound,
    currentTurnIndex,
    eventLog,
    isEncounterActive,
    victory,
    defeat,
    isPlayerTurn,
  };
}

/**
 * POST /api/game/combat/encounter/start
 * Initializes or resets a tactical combat encounter with canonical inventory & lifecycle binding (CH8/DEF-CH8-01).
 */
gameRouter.post('/combat/encounter/start', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const actorId = player ? player.actorId : 'player_actor_default_story';
    const inv = worldRepository.getInventoryEngine('default_story');
    const capEngine = worldRepository.getCapabilityEngine('default_story');
    const combatEngine = worldRepository.getCombatEngine('default_story');

    const doll = inv.getActorPaperDoll(actorId);
    const powerState = capEngine.getPowerState(actorId);

    // Derive AC from equipped armor and shield (CH5 Integration - DEF-CH8-03)
    let computedAC = 10;
    if (doll.body) {
      const def = inv.getItemDefinition(doll.body.defId);
      const armorBonus = (doll.body.defId === 'def_steel_cuirass' || def?.properties?.armorBonus) ? (Number(def?.properties?.armorBonus) || 4) : 2;
      computedAC += armorBonus;
    }
    if (doll.offHand) {
      const def = inv.getItemDefinition(doll.offHand.defId);
      const shieldBonus = Number(def?.properties?.armorBonus) || 2;
      computedAC += shieldBonus;
    }

    // Derive weapon damage from equipped main-hand (DEF-CH8-03)
    let weaponFormula = '1d4+2';
    if (doll.mainHand) {
      const def = inv.getItemDefinition(doll.mainHand.defId);
      if (doll.mainHand.defId === 'def_iron_sword' || doll.mainHand.name.includes('Sword')) {
        weaponFormula = '1d8+3';
      } else {
        weaponFormula = (def?.properties?.damageFormula as string) || '1d6+2';
      }
    }

    // Derive speed from feet item
    const feetDef = doll.feet ? inv.getItemDefinition(doll.feet.defId) : undefined;
    const speedBonus = feetDef ? (Number(feetDef.properties?.speedBonus) || 1) : 0;
    const speedCells = 5 + speedBonus;

    // Reset combat state and seed encounter
    combatEngine.clear();

    const playerParticipant: import('../domain/combatEngine').BattlefieldParticipant = {
      id: actorId,
      name: player?.name || 'Vael the Seeker',
      x: 1,
      y: 1,
      initiative: 18,
      team: 'player_allies',
      hpCurrent: Math.max(1, powerState?.healthCurrent ?? 100),
      hpMax: powerState?.healthMax ?? 100,
      armorClass: computedAC,
      speedCells,
      attackBonus: 5,
      damageFormula: weaponFormula,
      conditions: player?.isDead ? ['Dead'] : [],
      isDead: player?.isDead ?? false,
    };

    const enemyParticipant: import('../domain/combatEngine').BattlefieldParticipant = {
      id: 'enemy_void_construct',
      name: 'Astral Void Sentry',
      x: 4,
      y: 3,
      initiative: 11,
      team: 'enemies',
      hpCurrent: 28,
      hpMax: 28,
      armorClass: 13,
      speedCells: 4,
      attackBonus: 4,
      damageFormula: '1d6+2',
      conditions: [],
      isDead: false,
    };

    combatEngine.addParticipant(playerParticipant);
    combatEngine.addParticipant(enemyParticipant);

    combatEngine.addHazard({
      id: 'hazard_fire_1',
      type: 'fire_zone',
      x: 3,
      y: 2,
      radiusCells: 1,
      durationTurns: 5,
      damagePerTurn: 4,
    });

    combatEngine.rollInitiative();

    const state = getCombatStateHelper(combatEngine);
    res.json({
      success: true,
      message: 'Encounter initialized with canonical equipment & lifecycle stats.',
      combatState: state,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start combat encounter.' });
  }
});

/**
 * GET /api/game/combat/state
 * Returns the current server-authoritative combat state (DEF-CH8-01).
 */
gameRouter.get('/combat/state', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const combatEngine = worldRepository.getCombatEngine('default_story');
    const state = getCombatStateHelper(combatEngine);
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch combat state.' });
  }
});

/**
 * POST /api/game/combat/move
 * Executes deterministic grid movement within speed allowance (CH8 Movement Rules).
 */
gameRouter.post('/combat/move', async (req: Request, res: Response) => {
  try {
    const { actorId, targetX, targetY } = req.body;
    if (typeof targetX !== 'number' || typeof targetY !== 'number') {
      return res.status(400).json({ success: false, errorReason: 'targetX and targetY numbers required.' });
    }

    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const combatEngine = worldRepository.getCombatEngine('default_story');
    const targetActorId = actorId || combatEngine.getCurrentActor()?.id || player?.actorId || 'player_actor_default_story';

    const moveResult = combatEngine.moveActor(targetActorId, targetX, targetY);
    const state = getCombatStateHelper(combatEngine);

    if (!moveResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: moveResult.errorReason,
        combatState: state,
      });
    }

    res.json({
      success: true,
      combatState: state,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute combat movement.' });
  }
});

/**
 * POST /api/game/combat/attack
 * Executes D&D SRD 5.2.1 attack resolution with canonical inventory & lifecycle synchronization (DEF-CH8-02, DEF-CH8-03, DEF-CH8-04).
 */
gameRouter.post('/combat/attack', async (req: Request, res: Response) => {
  try {
    const { attackerId: reqAttackerId, targetId } = req.body;
    if (!targetId) {
      return res.status(400).json({ success: false, errorReason: 'targetId string is required.' });
    }

    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const actorId = player ? player.actorId : 'player_actor_default_story';
    const combatEngine = worldRepository.getCombatEngine('default_story');
    const inv = worldRepository.getInventoryEngine('default_story');
    const capEngine = worldRepository.getCapabilityEngine('default_story');
    const chronicle = worldRepository.getHistoricalChronicleEngine('default_story');
    const clock = worldRepository.getWorldClock('default_story');

    const attackerId = reqAttackerId || combatEngine.getCurrentActor()?.id || actorId;
    const attacker = combatEngine.getParticipant(attackerId);
    const target = combatEngine.getParticipant(targetId);

    if (!attacker || !target) {
      return res.status(404).json({ success: false, errorReason: 'Attacker or target participant not found.' });
    }

    // CH5 Integration: If player attacks with equipped weapon, degrade its durability (DEF-CH8-03)
    if (attacker.team === 'player_allies') {
      const doll = inv.getActorPaperDoll(actorId);
      if (doll.mainHand) {
        inv.degradeDurability(doll.mainHand.id, 1);
      }
    }

    // Execute attack with D&D adapter
    const attackResult = combatEngine.executeAttack(attackerId, targetId);

    // DEF-CH8-02: Canonical PlayerLifecycleState & PowerState Synchronization
    if (target.id === actorId && attackResult.damage > 0) {
      // Sync PowerState healthCurrent
      const currentPower = capEngine.getPowerState(actorId);
      if (currentPower) {
        capEngine.setPowerState(actorId, {
          ...currentPower,
          healthCurrent: target.hpCurrent,
        });
      }

      // Sync PlayerLifecycleState mortality if player died
      if (target.isDead && player && !player.isDead) {
        const deadPlayer = player.copyWith({
          deathRecord: {
            isDead: true,
            diedAtTimestamp: clock.getTimestamp(),
            cause: `Struck down in tactical combat by ${attacker.name}`,
            revivalPossible: true,
          },
        });
        worldRepository.updatePlayerLifecycle('default_story', deadPlayer);

        // CH4 Integration: Record character death in chronicle
        chronicle.recordEvidence({
          id: `ev_death_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          category: 'LIFECYCLE_TRANSITION',
          timestamp: clock.getTimestamp(),
          primarySubjectId: actorId,
          secondarySubjectId: attackerId,
          locationId: player.locationId,
          summary: `Player Character Slain in Combat`,
          details: `${player.name} succumbed to mortal trauma from ${attacker.name}'s strike.`,
          sourceEventId: `evt_combat_death_${Date.now()}`,
          provenance: 'tactical_battlefield_mortality',
          visibility: 'PUBLIC',
        });
      } else if (attackResult.damage >= 15 && player) {
        // Record severe combat injury in canonical lifecycle state
        const injury: import('../domain/types').InjuryRecord = {
          id: `inj_combat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          type: 'Combat Trauma',
          severity: attackResult.damage >= 25 ? 'Critical' : 'Moderate',
          location: 'Torso',
          description: `Combat wound from ${attacker.name} (${attackResult.damage} damage)`,
          acquiredAtTimestamp: clock.getTimestamp(),
          healed: false,
        };
        const injuredPlayer = player.copyWith({
          injuries: [...player.injuries, injury],
        });
        worldRepository.updatePlayerLifecycle('default_story', injuredPlayer);
      }
    }

    // Check for encounter victory / defeat and emit HistoricalEvidence (DEF-CH8-04)
    const state = getCombatStateHelper(combatEngine);
    if (state.victory) {
      chronicle.recordEvidence({
        id: `ev_victory_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        category: 'SACRED_OR_HISTORIC',
        timestamp: clock.getTimestamp(),
        primarySubjectId: actorId,
        locationId: player?.locationId || 'loc_whispering_orrery',
        summary: `Tactical Battlefield Victory`,
        details: `${player?.name || 'Vael'} emerged victorious, neutralizing all hostile entities in combat.`,
        sourceEventId: `evt_combat_victory_${Date.now()}`,
        provenance: 'tactical_battlefield_outcome',
        visibility: 'PUBLIC',
      });
    }

    res.json({
      success: true,
      ...attackResult,
      combatState: state,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute combat attack.' });
  }
});

/**
 * POST /api/game/combat/cast
 * Adjudicates capability invocations in tactical combat via CapabilityEngine (CH6/CH7/DEF-CH8-04).
 */
gameRouter.post('/combat/cast', async (req: Request, res: Response) => {
  try {
    const { actorId: reqActorId, targetId, capabilityId, requestedScale } = req.body;
    if (!targetId || !capabilityId) {
      return res.status(400).json({ success: false, errorReason: 'targetId and capabilityId are required.' });
    }

    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const actorId = reqActorId || player?.actorId || 'player_actor_default_story';
    const capEngine = worldRepository.getCapabilityEngine('default_story');
    const combatEngine = worldRepository.getCombatEngine('default_story');
    const chronicle = worldRepository.getHistoricalChronicleEngine('default_story');
    const clock = worldRepository.getWorldClock('default_story');

    const capDef = capEngine.getCapability(capabilityId);
    if (!capDef) {
      return res.status(404).json({ success: false, errorReason: `Capability '${capabilityId}' not found.` });
    }

    // 1. Adjudicate via CapabilityEngine (deducts canonical energy & strain)
    const adjProposal = {
      actorId,
      intendedCapabilityId: capabilityId,
      requestedScale: requestedScale || 'Local',
      actionDescription: `Combat invocation of ${capDef.name}`,
    };
    const adjudication = capEngine.adjudicate(adjProposal);

    if (!adjudication.approved) {
      return res.status(400).json({
        success: false,
        adjudication,
        errorReason: `Capability rejected: ${adjudication.rejectionReason}`,
      });
    }

    // 2. Execute capability damage & effect in combat engine
    const castResult = combatEngine.executeCapabilityCast({
      actorId,
      targetId,
      capabilityName: capDef.name,
      powerTier: capDef.powerTier,
      category: capDef.category,
    });

    // 3. Sync target lifecycle & power state if target was player
    const target = combatEngine.getParticipant(targetId);
    if (target && target.id === actorId) {
      const currentPower = capEngine.getPowerState(actorId);
      if (currentPower) {
        capEngine.setPowerState(actorId, {
          ...currentPower,
          healthCurrent: target.hpCurrent,
        });
      }
      if (target.isDead && player && !player.isDead) {
        const deadPlayer = player.copyWith({
          deathRecord: {
            isDead: true,
            diedAtTimestamp: clock.getTimestamp(),
            cause: `Overwhelmed by magical power invocation`,
            revivalPossible: true,
          },
        });
        worldRepository.updatePlayerLifecycle('default_story', deadPlayer);
      }
    }

    // Check victory condition
    const state = getCombatStateHelper(combatEngine);
    if (state.victory) {
      chronicle.recordEvidence({
        id: `ev_victory_cast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        category: 'SACRED_OR_HISTORIC',
        timestamp: clock.getTimestamp(),
        primarySubjectId: actorId,
        secondarySubjectId: capabilityId,
        locationId: player?.locationId || 'loc_whispering_orrery',
        summary: `Triumphant Power Invocation in Combat`,
        details: `${player?.name || 'Vael'} used ${capDef.name} (${capDef.powerTier} Tier) to secure battlefield victory.`,
        sourceEventId: `evt_cast_victory_${Date.now()}`,
        provenance: 'tactical_power_invocation',
        visibility: 'PUBLIC',
      });
    }

    const updatedPowerState = capEngine.getPowerState(actorId);

    res.json({
      success: true,
      adjudication,
      castResult,
      powerState: updatedPowerState,
      combatState: state,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cast capability in combat.' });
  }
});

/**
 * POST /api/game/combat/end-turn
 * Advances the turn queue and applies dynamic hazard zone ticks (CH8 Hazards).
 */
gameRouter.post('/combat/end-turn', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const combatEngine = worldRepository.getCombatEngine('default_story');

    const advanceResult = combatEngine.advanceTurn();
    const state = getCombatStateHelper(combatEngine);

    res.json({
      success: true,
      advanceResult,
      combatState: state,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to advance combat turn.' });
  }
});

// ==========================================
// CH9: Memory Opportunity Engine & Epistemic Retrieval (DEF-CH9-06)
// ==========================================

/**
 * GET /api/game/memories
 * Retrieves memories epistemically visible to the requesting actor.
 */
gameRouter.get('/memories', async (req: Request, res: Response) => {
  try {
    const storyId = (req.query.storyId as string) || 'default_story';
    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = (req.query.actorId as string) || player?.actorId || `player_actor_${storyId}`;
    const clock = worldRepository.getWorldClock(storyId);
    const memEngine = worldRepository.getMemoryEngine(storyId);

    const memories = memEngine.retrieveMemories({
      storyId,
      viewerActorId: actorId,
      currentTurn: 1,
      currentTimestamp: clock.getTimestamp(),
      maxResults: 100,
      includeDormant: true,
      includeArchived: false,
    });

    res.json({
      success: true,
      count: memories.length,
      memories,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch memories.' });
  }
});

/**
 * POST /api/game/memories/query
 * Queries contextually scored memories with epistemic visibility filtering.
 */
gameRouter.post('/memories/query', async (req: Request, res: Response) => {
  try {
    const { storyId = 'default_story', actorId, queryKeywords = [], currentTurn, maxResults, includeDormant, includeArchived } = req.body;
    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle(storyId);
    const viewerActorId = actorId || player?.actorId || `player_actor_${storyId}`;
    const clock = worldRepository.getWorldClock(storyId);
    const memEngine = worldRepository.getMemoryEngine(storyId);

    const memories = memEngine.retrieveMemories({
      storyId,
      viewerActorId,
      queryKeywords,
      currentTurn: typeof currentTurn === 'number' ? currentTurn : 1,
      currentTimestamp: clock.getTimestamp(),
      maxResults: typeof maxResults === 'number' ? maxResults : 10,
      includeDormant: !!includeDormant,
      includeArchived: !!includeArchived,
    });

    res.json({
      success: true,
      count: memories.length,
      memories,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to query memories.' });
  }
});

/**
 * POST /api/game/memories/opportunities
 * Scans action text for latent capability opportunities without hardcoding.
 */
gameRouter.post('/memories/opportunities', async (req: Request, res: Response) => {
  try {
    const { storyId = 'default_story', actorId, actionText, targetEntityId, currentTurn } = req.body;
    if (!actionText || typeof actionText !== 'string') {
      return res.status(400).json({ success: false, errorReason: 'actionText string is required.' });
    }

    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle(storyId);
    const resolvedActorId = actorId || player?.actorId || `player_actor_${storyId}`;
    const clock = worldRepository.getWorldClock(storyId);
    const memEngine = worldRepository.getMemoryEngine(storyId);

    const opportunities = memEngine.scanOpportunities({
      actorId: resolvedActorId,
      actionText,
      targetEntityId,
      currentTurn: typeof currentTurn === 'number' ? currentTurn : 1,
      currentTimestamp: clock.getTimestamp(),
    });

    res.json({
      success: true,
      count: opportunities.length,
      opportunities,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to scan opportunities.' });
  }
});

/**
 * POST /api/game/memories/store
 * Authoritatively stores a validated atomic memory record.
 */
gameRouter.post('/memories/store', async (req: Request, res: Response) => {
  try {
    const { storyId = 'default_story', memory } = req.body;
    if (!memory || !memory.content || !memory.memoryClass) {
      return res.status(400).json({ success: false, errorReason: 'Valid memory object with content and memoryClass is required.' });
    }

    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle(storyId);
    const clock = worldRepository.getWorldClock(storyId);
    const memEngine = worldRepository.getMemoryEngine(storyId);
    const timestamp = clock.getTimestamp();

    const memRecord: import('../domain/memoryOpportunityEngine').DurableMemory = {
      id: memory.id || `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      storyId,
      memoryClass: memory.memoryClass,
      subjectEntityId: memory.subjectEntityId || player?.actorId || `player_actor_${storyId}`,
      relatedEntityIds: Array.isArray(memory.relatedEntityIds) ? memory.relatedEntityIds : [],
      content: memory.content,
      importance: typeof memory.importance === 'number' ? memory.importance : 50,
      confidence: typeof memory.confidence === 'number' ? memory.confidence : 1.0,
      status: memory.status || 'active',
      visibility: memory.visibility || 'PRIVATE',
      accessibleToEntityIds: Array.isArray(memory.accessibleToEntityIds) ? memory.accessibleToEntityIds : [],
      isPersistentCritical: !!memory.isPersistentCritical,
      isLocked: !!memory.isLocked,
      lockedReason: memory.lockedReason,
      lockedBy: memory.lockedBy,
      lockedAtTimestamp: memory.isLocked ? timestamp : undefined,
      provenance: memory.provenance || 'player_observation',
      sourceEventId: memory.sourceEventId,
      validFromTurn: memory.validFromTurn || 1,
      lastRecalledTurn: memory.lastRecalledTurn || 1,
      createdAtTimestamp: timestamp,
      lastRecalledTimestamp: timestamp,
      triggerConditionTags: Array.isArray(memory.triggerConditionTags) ? memory.triggerConditionTags : [],
      structuredTriggers: memory.structuredTriggers,
    };

    memEngine.storeMemory(memRecord);

    res.json({
      success: true,
      memory: memRecord,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to store memory.' });
  }
});

/**
 * POST /api/game/memories/lock
 * Explicitly locks a memory to protect it from decay, archiving, or deletion.
 */
gameRouter.post('/memories/lock', async (req: Request, res: Response) => {
  try {
    const { storyId = 'default_story', memoryId, reason, lockedBy } = req.body;
    if (!memoryId) {
      return res.status(400).json({ success: false, errorReason: 'memoryId is required.' });
    }

    const { worldRepository } = await import('../repositories/worldRepository');
    const clock = worldRepository.getWorldClock(storyId);
    const memEngine = worldRepository.getMemoryEngine(storyId);

    const lockResult = memEngine.lockMemory(memoryId, reason, lockedBy, clock.getTimestamp());
    if (!lockResult.success) {
      return res.status(404).json(lockResult);
    }

    res.json(lockResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to lock memory.' });
  }
});

/**
 * POST /api/game/memories/unlock
 * Unlocks a previously locked memory.
 */
gameRouter.post('/memories/unlock', async (req: Request, res: Response) => {
  try {
    const { storyId = 'default_story', memoryId } = req.body;
    if (!memoryId) {
      return res.status(400).json({ success: false, errorReason: 'memoryId is required.' });
    }

    const { worldRepository } = await import('../repositories/worldRepository');
    const memEngine = worldRepository.getMemoryEngine(storyId);

    const unlockResult = memEngine.unlockMemory(memoryId);
    if (!unlockResult.success) {
      return res.status(404).json(unlockResult);
    }

    res.json(unlockResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to unlock memory.' });
  }
});

/**
 * POST /api/game/memories/decay
 * Authoritatively advances simulation time / turns to decay active unreinforced memories.
 */
gameRouter.post('/memories/decay', async (req: Request, res: Response) => {
  try {
    const { storyId = 'default_story', currentTurn, elapsedSeconds, turnDelta } = req.body;
    const { worldRepository } = await import('../repositories/worldRepository');
    const clock = worldRepository.getWorldClock(storyId);
    const memEngine = worldRepository.getMemoryEngine(storyId);

    const decaySummary = memEngine.decayMemories({
      storyId,
      currentTurn,
      currentTimestamp: clock.getTimestamp(),
      elapsedSeconds,
      turnDelta,
    });

    res.json({
      success: true,
      decaySummary,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to advance memory decay.' });
  }
});

// ==========================================
// CH10: Living World & Autonomous Simulation
// ==========================================

/**
 * GET /api/game/living-world/state
 * Returns canonical living world state including physiologies, NPC schedules, scheduled events, and fidelity tiers.
 */
gameRouter.get('/living-world/state', async (req: Request, res: Response) => {
  try {
    const storyId = (req.query.storyId as string) || 'default_story';
    const { worldRepository } = await import('../repositories/worldRepository');
    const clock = worldRepository.getWorldClock(storyId);
    const livingSim = worldRepository.getLivingWorldSimulation(storyId);
    const sensoryEngine = worldRepository.getSensoryEngine();
    const player = worldRepository.getPlayerLifecycle(storyId);
    const geography = worldRepository.getGeographyGraph();
    const playerLoc = player?.locationId || 'loc_whispering_orrery';

    const physiologies = livingSim.getAllPhysiologies();
    const npcProfiles = livingSim.getAllNpcSchedules();
    const scheduledEvents = livingSim.getScheduledEvents();

    const simulationTiers: Record<string, string> = {};
    for (const phys of physiologies) {
      const prof = npcProfiles.find((p) => p.npcId === phys.entityId);
      const loc = prof ? prof.currentLocationId : playerLoc;
      simulationTiers[phys.entityId] = livingSim.evaluateSimulationTier(loc, playerLoc, geography);
    }
    for (const prof of npcProfiles) {
      if (!simulationTiers[prof.npcId]) {
        simulationTiers[prof.npcId] = livingSim.evaluateSimulationTier(prof.currentLocationId, playerLoc, geography);
      }
    }

    res.json({
      success: true,
      storyId,
      timestamp: clock.getTimestamp(),
      playerLocationId: playerLoc,
      physiologies,
      npcProfiles,
      scheduledEvents,
      simulationTiers,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve living world state.' });
  }
});

/**
 * POST /api/game/living-world/advance
 * Advances world simulation time canonically and executes living world catch-up (DEF-CH10-03).
 */
gameRouter.post('/living-world/advance', async (req: Request, res: Response) => {
  try {
    const { storyId = 'default_story', secondsToAdvance, hoursToAdvance } = req.body;
    const { worldSimulationService } = await import('../simulation/worldSimulationService');

    let seconds = Number(secondsToAdvance);
    if (isNaN(seconds) || seconds <= 0) {
      if (hoursToAdvance && !isNaN(Number(hoursToAdvance))) {
        seconds = Number(hoursToAdvance) * 3600;
      } else {
        seconds = 3600; // default 1 hour
      }
    }

    const result = worldSimulationService.advanceTime(storyId, seconds);

    res.json({
      success: true,
      storyId,
      secondsAdvanced: seconds,
      newTimestamp: result.newTimestamp,
      completedArrivals: result.completedArrivals,
      livingWorldSummary: result.livingWorldSummary,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to advance living world simulation.' });
  }
});

/**
 * POST /api/game/living-world/schedule-event
 * Registers a new canonical scheduled world event or deadline.
 */
gameRouter.post('/living-world/schedule-event', async (req: Request, res: Response) => {
  try {
    const { storyId = 'default_story', event } = req.body;
    if (!event || !event.id || !event.kind || !event.name || !event.triggerTimestamp) {
      res.status(400).json({ error: 'Invalid event payload: id, kind, name, and triggerTimestamp required.' });
      return;
    }

    const { worldRepository } = await import('../repositories/worldRepository');
    const livingSim = worldRepository.getLivingWorldSimulation(storyId);
    const sensoryEngine = worldRepository.getSensoryEngine();

    const canonicalEvent = {
      id: String(event.id),
      kind: event.kind,
      name: String(event.name),
      locationId: String(event.locationId || 'loc_whispering_orrery'),
      triggerTimestamp: event.triggerTimestamp,
      deadlineTimestamp: event.deadlineTimestamp,
      isResolved: Boolean(event.isResolved),
      status: event.status || 'pending',
      consequenceSummary: event.consequenceSummary,
    };

    livingSim.scheduleEvent(canonicalEvent);

    res.json({
      success: true,
      event: canonicalEvent,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to schedule living world event.' });
  }
});

/**
 * POST /api/game/living-world/cues
 * Evaluates personality-modulated hunger narrative cues (DreamBook §306).
 */
gameRouter.post('/living-world/cues', async (req: Request, res: Response) => {
  try {
    const { storyId = 'default_story', entityId } = req.body;
    if (!entityId) {
      res.status(400).json({ error: 'entityId is required.' });
      return;
    }

    const { worldRepository } = await import('../repositories/worldRepository');
    const livingSim = worldRepository.getLivingWorldSimulation(storyId);
    const sensoryEngine = worldRepository.getSensoryEngine();
    const cue = livingSim.evaluateHungerNarrativeCue(entityId);

    res.json({
      success: true,
      entityId,
      cue,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to evaluate living world cues.' });
  }
});

// ============================================================================
// CHALLENGE 11: WORKING CONTEXT & TOKEN BUDGETING API SURFACE
// ============================================================================

/**
 * GET /api/game/context
 * Assembles the current working context packet and budgeted prompt string (DEF-CH11-03).
 */
gameRouter.get('/context', async (req: Request, res: Response) => {
  try {
    const storyId = (req.query.storyId as string) || 'default_story';
    const budget = req.query.budget ? parseInt(req.query.budget as string, 10) : 400;
    const playerAction = (req.query.action as string) || 'Observe surroundings';

    const { WorkingContextEngine } = await import('../domain/workingContextEngine');
    const result = WorkingContextEngine.assembleTurnContext({
      storyId,
      playerAction,
      hardTokenBudget: budget,
    });

    res.json({
      success: true,
      packet: result.packet,
      assembledText: result.assembledText,
      totalTokens: result.totalTokens,
      hardTokenBudget: result.hardTokenBudget,
      includedChunks: result.includedChunks,
      evictedChunkLabels: result.evictedChunkLabels,
      evictionReasons: result.evictionReasons,
      epistemicallySanitized: result.epistemicallySanitized,
    });
  } catch (error) {
    console.error('Failed to assemble working context:', error);
    res.status(500).json({ error: 'Failed to assemble working context.', details: String(error) });
  }
});

/**
 * POST /api/game/context/assemble
 * Parametric working context assembly with custom action, budget, and optional custom candidate chunks.
 */
gameRouter.post('/context/assemble', async (req: Request, res: Response) => {
  try {
    const {
      storyId = 'default_story',
      playerAction = 'Observe surroundings',
      hardTokenBudget = 400,
      customChunks,
      npcTargetId,
    } = req.body;

    const { WorkingContextEngine } = await import('../domain/workingContextEngine');
    const result = WorkingContextEngine.assembleTurnContext({
      storyId,
      playerAction,
      hardTokenBudget: Number(hardTokenBudget),
      customChunks,
      npcTargetId,
    });

    res.json({
      success: true,
      packet: result.packet,
      chunks: result.chunks,
      assembledText: result.assembledText,
      totalTokens: result.totalTokens,
      hardTokenBudget: result.hardTokenBudget,
      includedChunks: result.includedChunks,
      evictedChunkLabels: result.evictedChunkLabels,
      evictionReasons: result.evictionReasons,
      epistemicallySanitized: result.epistemicallySanitized,
    });
  } catch (error) {
    console.error('Failed to assemble budgeted context:', error);
    res.status(500).json({ error: 'Failed to assemble budgeted context.', details: String(error) });
  }
});

/**
 * GET /api/game/context/inspect
 * Epistemically safe inspection view of working context candidates and token budgeting breakdown.
 */
gameRouter.get('/context/inspect', async (req: Request, res: Response) => {
  try {
    const storyId = (req.query.storyId as string) || 'default_story';
    const budget = req.query.budget ? parseInt(req.query.budget as string, 10) : 400;

    const { WorkingContextEngine } = await import('../domain/workingContextEngine');
    const result = WorkingContextEngine.assembleTurnContext({
      storyId,
      hardTokenBudget: budget,
    });

    // Group candidates by priority band
    const bandBreakdown: Record<string, { totalCandidateCount: number; includedCount: number; evictedCount: number }> = {
      B1_CRITICAL: { totalCandidateCount: 0, includedCount: 0, evictedCount: 0 },
      B2_IMMEDIATE: { totalCandidateCount: 0, includedCount: 0, evictedCount: 0 },
      B3_CAUSAL_OPPORTUNITY: { totalCandidateCount: 0, includedCount: 0, evictedCount: 0 },
      B4_EPISODIC: { totalCandidateCount: 0, includedCount: 0, evictedCount: 0 },
      B5_SEMANTIC_LORE: { totalCandidateCount: 0, includedCount: 0, evictedCount: 0 },
    };

    for (const chunk of result.chunks) {
      if (bandBreakdown[chunk.band]) {
        bandBreakdown[chunk.band].totalCandidateCount++;
        const isIncluded = result.includedChunks.some((inc) => inc.id === chunk.id || inc.label === chunk.label);
        if (isIncluded) {
          bandBreakdown[chunk.band].includedCount++;
        } else {
          bandBreakdown[chunk.band].evictedCount++;
        }
      }
    }

    res.json({
      success: true,
      storyId,
      hardTokenBudget: result.hardTokenBudget,
      totalTokensUsed: result.totalTokens,
      headroomTokens: Math.max(0, result.hardTokenBudget - result.totalTokens),
      candidateChunkCount: result.chunks.length,
      includedChunkCount: result.includedChunks.length,
      evictedChunkCount: result.evictedChunkLabels.length,
      bandBreakdown,
      includedChunks: result.includedChunks.map((c) => ({
        id: c.id,
        band: c.band,
        label: c.label,
        estimatedTokens: c.estimatedTokens,
        sourceAuthority: c.sourceAuthority,
        isProtected: c.isProtected,
      })),
      evictedChunkLabels: result.evictedChunkLabels,
      evictionReasons: result.evictionReasons,
      epistemicallySanitized: true,
    });
  } catch (error) {
    console.error('Failed to inspect working context:', error);
    res.status(500).json({ error: 'Failed to inspect working context.', details: String(error) });
  }
});

/**
 * POST /api/game/context/npc-dialogue
 * Builds an epistemically sanitized prompt context for NPC dialogue (DEF-CH11-06).
 */
gameRouter.post('/context/npc-dialogue', async (req: Request, res: Response) => {
  try {
    const {
      npcName,
      knownFacts = [],
      currentObservations = [],
      playerSpokenText = '',
      systemDirectives = [],
    } = req.body;

    if (!npcName) {
      res.status(400).json({ error: 'npcName is required.' });
      return;
    }

    const { WorkingContextEngine } = await import('../domain/workingContextEngine');
    const sanitizedPrompt = WorkingContextEngine.buildSanitizedNpcContext({
      npcName,
      knownFacts,
      currentObservations,
      playerSpokenText,
      systemDirectives,
    });

    res.json({
      success: true,
      npcName,
      sanitizedPrompt,
      estimatedTokens: WorkingContextEngine.estimateTokens(sanitizedPrompt),
      epistemicallySanitized: true,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to build sanitized NPC dialogue context.' });
  }
});

/**
 * ============================================================================
 * CHALLENGE 12: MULTI-MODEL AI ORCHESTRATOR HTTP API (DEF-CH12-08)
 * Canonical routes per DreamBook v10.8.35 §450, §451, V6.0, V7.2
 * ============================================================================
 */

/**
 * GET /api/game/orchestrator/models
 * Returns all registered models, canonical pools/roles, capabilities, health, and latency.
 */
gameRouter.get('/orchestrator/models', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();
    const models = orchestrator.getAllModels();

    res.json({
      success: true,
      count: models.length,
      models,
    });
  } catch (error) {
    console.error('Failed to list orchestrator models:', error);
    res.status(500).json({ error: 'Failed to list orchestrator models.' });
  }
});

/**
 * POST /api/game/orchestrator/select
 * Deterministically routes a task to the best eligible model respecting context window,
 * priority tier, and health status (DEF-CH12-03, DEF-CH12-04).
 */
gameRouter.post('/orchestrator/select', async (req: Request, res: Response) => {
  try {
    const { task = 'narrative.generate', contextTokens = 200, userPriorityTier = 'Standard' } = req.body;

    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();
    const selection = orchestrator.selectBestModel(task, {
      contextTokens: Number(contextTokens),
      userPriorityTier,
    });

    res.json({
      success: true,
      task,
      selectedModel: selection.selectedModel,
      selectionReason: selection.selectionReason,
      selectionScore: selection.selectionScore,
      fallbacks: selection.fallbacks,
    });
  } catch (error) {
    console.error('Failed to select model:', error);
    res.status(500).json({ error: 'Failed to select model.', details: String(error) });
  }
});

/**
 * POST /api/game/orchestrator/turn
 * Executes an authoritative, multi-step turn orchestration loop:
 * CH11 Working Context Assembly -> Model Selection -> Provider Execution Loop ->
 * Turn Package Validation -> Domain Adjudication Bridge -> Continuation Checkpoint -> Telemetry.
 */
gameRouter.post('/orchestrator/turn', async (req: Request, res: Response) => {
  try {
    const {
      storyId = 'default_story',
      playerAction = 'Assess position and inspect surroundings',
      task = 'narrative.generate',
      hardTokenBudget = 400,
      timeoutMs = 3000,
      maxRetries = 2,
      forceModelId,
    } = req.body;

    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();

    const turnResult = await orchestrator.executeTurn({
      storyId,
      playerAction,
      task,
      hardTokenBudget: Number(hardTokenBudget),
      timeoutMs: Number(timeoutMs),
      maxRetries: Number(maxRetries),
      forceModelId,
    });

    const sensoryEngine = worldRepository.getSensoryEngine();
    let sensoryEvents: any[] = [];
    if (turnResult.turnPackage?.audioCues) {
      const combatEngine = worldRepository.getCombatEngine(storyId as string);
      const player = worldRepository.getPlayerLifecycle(storyId as string);
      
      const entities = [];
      let listenerPosition = { x: 0, y: 0 };
      
      if (combatEngine.getParticipants().length > 0) {
        const parts = combatEngine.getParticipants();
        for (const p of parts) {
          entities.push({ name: p.name, x: p.x, y: p.y });
          if (player && p.id === player.playerId) {
            listenerPosition = { x: p.x, y: p.y };
          }
        }
      } else if (player && player.locationId) {
         const geo = worldRepository.getGeographyGraph();
         const loc = geo.getNode(player.locationId);
         if (loc) {
           listenerPosition = { x: loc.coordinates.x, y: loc.coordinates.y };
         }
      }

      sensoryEvents = sensoryEngine.resolveAudioCuesToEvents(
        turnResult.turnPackage.audioCues,
        { listenerPosition, entities }
      );
    }
    (turnResult as any).sensoryEvents = sensoryEvents;
    res.json(turnResult);
  } catch (error) {
    console.error('Failed to execute orchestrated turn:', error);
    res.status(500).json({ error: 'Failed to execute orchestrated turn.', details: String(error) });
  }
});

/**
 * GET /api/game/orchestrator/checkpoints
 * Returns all saved cross-model continuation checkpoints (DEF-CH12-06).
 */
gameRouter.get('/orchestrator/checkpoints', async (req: Request, res: Response) => {
  try {
    const storyId = req.query.storyId as string | undefined;
    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();

    const checkpoints = orchestrator.getAllCheckpoints(storyId);
    res.json({
      success: true,
      count: checkpoints.length,
      checkpoints,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve checkpoints.' });
  }
});

/**
 * GET /api/game/orchestrator/checkpoint/:id
 * Retrieves a specific continuation checkpoint for cross-model handoff.
 */
gameRouter.get('/orchestrator/checkpoint/:id', async (req: Request, res: Response) => {
  try {
    const checkpointId = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();

    const checkpoint = orchestrator.getContinuationCheckpoint(checkpointId);
    if (!checkpoint) {
      res.status(404).json({ error: `Checkpoint '${checkpointId}' not found.` });
      return;
    }

    res.json({
      success: true,
      checkpoint,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve checkpoint.' });
  }
});

/**
 * POST /api/game/orchestrator/checkpoint
 * Explicitly saves or updates a cross-model continuation checkpoint.
 */
gameRouter.post('/orchestrator/checkpoint', async (req: Request, res: Response) => {
  try {
    const checkpoint = req.body;
    if (!checkpoint || !checkpoint.checkpointId || !checkpoint.storyId) {
      res.status(400).json({ error: 'Invalid checkpoint payload: checkpointId and storyId required.' });
      return;
    }

    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();
    orchestrator.createContinuationCheckpoint(checkpoint);

    res.json({
      success: true,
      checkpointId: checkpoint.checkpointId,
      message: 'Checkpoint created successfully.',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create checkpoint.' });
  }
});

/**
 * GET /api/game/orchestrator/telemetry
 * Returns last turn telemetry and operational statistics (DEF-CH12-07).
 */
gameRouter.get('/orchestrator/telemetry', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();

    const lastTurnTelemetry = orchestrator.getLastTurnTelemetry();
    const stats = orchestrator.getOrchestrationStats();

    res.json({
      success: true,
      lastTurnTelemetry,
      stats,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve telemetry.' });
  }
});

/**
 * POST /api/game/orchestrator/health
 * Updates health status of a model in the registry (e.g., to test circuit breakers or degradation).
 */
gameRouter.post('/orchestrator/health', async (req: Request, res: Response) => {
  try {
    const { providerId, modelId, health, resetCircuitBreaker } = req.body;
    if (!providerId || !modelId || !health) {
      res.status(400).json({ error: 'providerId, modelId, and health are required.' });
      return;
    }

    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();
    orchestrator.updateModelHealth(providerId, modelId, health);

    if (resetCircuitBreaker) {
      orchestrator.resetCircuitBreaker(providerId, modelId);
    }

    res.json({
      success: true,
      providerId,
      modelId,
      updatedHealth: health,
      circuitBreakerTripped: orchestrator.isCircuitBreakerTripped(providerId, modelId),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update model health.' });
  }
});

/**
 * POST /api/game/orchestrator/discover
 * Dynamically discovers models from providers (e.g. Google Gemini) and updates the registry.
 */
gameRouter.post('/orchestrator/discover', async (req: Request, res: Response) => {
  try {
    const { forceRefresh = false } = req.body;
    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();
    const summary = await orchestrator.discoverAndRegisterModels(forceRefresh);

    res.json({
      success: true,
      summary,
      totalModels: orchestrator.getAllModels().length,
    });
  } catch (error) {
    console.error('Failed to execute model discovery:', error);
    res.status(500).json({ error: 'Failed to execute model discovery.', details: String(error) });
  }
});

/**
 * GET /api/game/orchestrator/overrides
 * Retrieves all manual model overrides.
 */
gameRouter.get('/orchestrator/overrides', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();
    res.json({
      success: true,
      overrides: orchestrator.getAllManualOverrides(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve manual overrides.' });
  }
});

/**
 * POST /api/game/orchestrator/overrides
 * Sets or updates a manual override for a model.
 */
gameRouter.post('/orchestrator/overrides', async (req: Request, res: Response) => {
  try {
    const { modelId, override } = req.body;
    if (!modelId || !override) {
      res.status(400).json({ error: 'modelId and override are required.' });
      return;
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();
    orchestrator.setManualOverride(modelId, override);

    res.json({
      success: true,
      modelId,
      override,
      allOverrides: orchestrator.getAllManualOverrides(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to set manual override.' });
  }
});

/**
 * POST /api/game/orchestrator/pin
 * Pins a model to a specific task.
 */
gameRouter.post('/orchestrator/pin', async (req: Request, res: Response) => {
  try {
    const { task, modelKey } = req.body;
    if (!task) {
      res.status(400).json({ error: 'task is required.' });
      return;
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();
    orchestrator.pinModelForTask(task, modelKey);

    res.json({
      success: true,
      task,
      pinnedModel: modelKey || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to pin model for task.' });
  }
});

/**
 * Challenge 13: Lossless Campaign Archive Endpoints (DEF-CH13-05)
 */

/**
 * GET /api/game/archive/export
 * Exports the active canonical campaign into a verifiable .dreamarchive bundle.
 */
gameRouter.get('/archive/export', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const storyId = (req.query.storyId as string) || 'default_story';
    const title = (req.query.title as string) || 'Dreamville Lossless Campaign';
    const archive = worldRepository.exportCampaignArchive(storyId, title);
    res.json(archive);
  } catch (error) {
    console.error('Failed to export campaign archive:', error);
    res.status(500).json({ error: 'Failed to export campaign archive.' });
  }
});

/**
 * POST /api/game/archive/validate
 * Performs dry-run cryptographic and schema validation on a provided archive without mutating live state.
 */
gameRouter.post('/archive/validate', async (req: Request, res: Response) => {
  try {
    const { archive } = req.body;
    if (!archive) {
      res.status(400).json({ valid: false, errorReason: 'Missing archive object in request body.' });
      return;
    }
    const { CampaignArchiveService } = await import('../domain/campaignArchive');
    const result = CampaignArchiveService.validateArchive(archive);
    res.json(result);
  } catch (error: any) {
    console.error('Validation route error:', error);
    res.status(500).json({ valid: false, errorReason: error?.message || 'Server error during archive validation.' });
  }
});

/**
 * POST /api/game/archive/import
 * Validates, stages, and atomically restores a campaign archive into canonical repository state.
 */
gameRouter.post('/archive/import', async (req: Request, res: Response) => {
  try {
    const { archive, storyId = 'default_story' } = req.body;
    if (!archive) {
      res.status(400).json({ success: false, errorReason: 'Missing archive payload.' });
      return;
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const result = worldRepository.restoreCampaignArchive(archive, storyId);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (error: any) {
    console.error('Archive import error:', error);
    res.status(500).json({ success: false, errorReason: error?.message || 'Server error during archive restore.' });
  }
});

/**
 * POST /api/game/archive/restore
 * Alias for POST /api/game/archive/import
 */
gameRouter.post('/archive/restore', async (req: Request, res: Response) => {
  try {
    const { archive, storyId = 'default_story' } = req.body;
    if (!archive) {
      res.status(400).json({ success: false, errorReason: 'Missing archive payload.' });
      return;
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const result = worldRepository.restoreCampaignArchive(archive, storyId);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (error: any) {
    console.error('Archive restore error:', error);
    res.status(500).json({ success: false, errorReason: error?.message || 'Server error during archive restore.' });
  }
});

/**
 * GET /api/game/archive/assets
 * Returns the Visual Asset Registry definitions and fallback metadata (DEF-CH13-06).
 */
gameRouter.get('/archive/assets', async (req: Request, res: Response) => {
  try {
    const { DEFAULT_CANONICAL_ASSETS } = await import('../domain/campaignArchive');
    res.json({
      success: true,
      assets: DEFAULT_CANONICAL_ASSETS,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve visual asset registry.' });
  }
});





