import { Router, Request, Response } from 'express';
import { serverMockAuthority } from '../mockEngine/serverMockAuthority';
import { ActionRequest } from '../mockEngine/serverTypes';
import { worldRepository } from '../repositories/worldRepository';
import { NpcTacticalDecisionPolicy } from '../domain/tacticalDecisionPolicy';
import { PlayerLifecycleState } from '../domain/playerLifecycleState';
import { OpeningSceneService } from '../services/openingSceneService';
import { WorkingContextEngine } from '../domain/workingContextEngine';

export const gameRouter = Router();
import { sensoryRouter } from './sensoryRoutes';
import { adaptationRouter } from './adaptationRoutes';
gameRouter.use('/sensory', sensoryRouter);
gameRouter.use('/adaptation', adaptationRouter);

function resolveStoryId(req: Request, allowDefault = true): string {
  const headerId = req.headers['x-story-id'];
  if (typeof headerId === 'string' && headerId) {
    return headerId;
  }
  const queryId = req.query.storyId;
  if (typeof queryId === 'string' && queryId) {
    return queryId;
  }
  const bodyId = req.body?.storyId;
  if (typeof bodyId === 'string' && bodyId) {
    return bodyId;
  }
  if (allowDefault) {
    return 'default_story';
  }
  throw new Error('Active story context (X-Story-ID header or storyId) is required for gameplay operations.');
}

/**
 * GET /api/game/state
 * Returns the sanitized ExternalViewState.
 * Explicitly guaranteed to contain no hiddenCanonicalContext or server test secrets.
 */
gameRouter.get('/state', (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const viewState = serverMockAuthority.getSanitizedViewState(storyId);
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

    if (!(actionRequest as any).storyId) {
      (actionRequest as any).storyId = resolveStoryId(req, true);
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
 * POST /api/game/living-bible/evidence
 * Records evidence for a requirement.
 */
gameRouter.post('/living-bible/evidence', async (req: Request, res: Response) => {
  try {
    const { livingBibleRegistry } = await import('../domain/livingBible');
    const { requirementId, evidenceType, sourceReference, description } = req.body;

    if (!requirementId || !evidenceType || !sourceReference || !description) {
      res.status(400).json({ error: 'Missing required evidence parameters (requirementId, evidenceType, sourceReference, description).' });
      return;
    }

    const evidence = livingBibleRegistry.recordEvidence({
      requirementId,
      evidenceType,
      sourceReference,
      description,
    });

    res.status(201).json({ success: true, evidence });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to record evidence.' });
  }
});

/**
 * POST /api/game/living-bible/promote
 * Validates and promotes a requirement status based on evidence.
 */
gameRouter.post('/living-bible/promote', async (req: Request, res: Response) => {
  try {
    const { livingBibleRegistry } = await import('../domain/livingBible');
    const { requirementId, targetStatus } = req.body;

    if (!requirementId || !targetStatus) {
      res.status(400).json({ error: 'Missing requirementId or targetStatus.' });
      return;
    }

    const result = livingBibleRegistry.validateAndPromoteRequirement(requirementId, targetStatus);
    if (!result.success) {
      res.status(400).json({ error: result.reason });
      return;
    }

    const updated = livingBibleRegistry.getRequirement(requirementId);
    res.json({ success: true, requirement: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to promote requirement status.' });
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
 * POST /api/game/workstation/iteration
 * Records a new developer iteration entry into the Workstation ledger.
 */
gameRouter.post('/workstation/iteration', async (req: Request, res: Response) => {
  try {
    const { livingBibleRegistry } = await import('../domain/livingBible');
    const { description, outcome, reason, affectedRequirements } = req.body;

    if (!description || typeof description !== 'string' || !description.trim() ||
        !outcome || typeof outcome !== 'string' || !outcome.trim()) {
      res.status(400).json({ error: 'Invalid iteration payload. Description and outcome are required non-empty strings.' });
      return;
    }

    const record = livingBibleRegistry.recordIteration({
      description: description.trim(),
      outcome: outcome.trim(),
      reason: reason ? String(reason).trim() : undefined,
      affectedRequirements: Array.isArray(affectedRequirements) ? affectedRequirements.map(String) : [],
    });

    res.status(201).json({
      success: true,
      iteration: record,
      workstationState: livingBibleRegistry.getWorkstationState(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record iteration.' });
  }
});

/**
 * GET /api/game/player-lifecycle
 * Returns the canonical PlayerLifecycleState (DreamBook v10.8 Decision 1).
 */
gameRouter.get('/player-lifecycle', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const storyId = resolveStoryId(req);
    const player = worldRepository.getPlayerLifecycle(storyId);
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
    const storyId = resolveStoryId(req);
    const engine = worldRepository.getHistoricalChronicleEngine(storyId);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const playerId = player ? player.actorId : `player_actor_${storyId}`;
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
    const storyId = resolveStoryId(req);
    const engine = worldRepository.getHistoricalChronicleEngine(storyId);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const playerId = player ? player.actorId : `player_actor_${storyId}`;
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
    const storyId = resolveStoryId(req);
    const engine = worldRepository.getHistoricalChronicleEngine(storyId);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const playerId = player ? player.actorId : `player_actor_${storyId}`;
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
		const storyId = resolveStoryId(req);
		const player = worldRepository.getPlayerLifecycle(storyId);
		const actorId = player ? player.actorId : `player_actor_${storyId}`;
		const invEngine = worldRepository.getInventoryEngine(storyId);
		const projection = invEngine.projectActorInventory(actorId);
		res.json({ actorId, items: projection.items, paperDoll: projection.paperDoll, definitions: projection.definitions });
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
    const storyId = resolveStoryId(req);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player ? player.actorId : `player_actor_${storyId}`;
    const invEngine = worldRepository.getInventoryEngine(storyId);
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
    const storyId = resolveStoryId(req);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player ? player.actorId : `player_actor_${storyId}`;
    const invEngine = worldRepository.getInventoryEngine(storyId);
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
    const storyId = resolveStoryId(req);
    const invEngine = worldRepository.getInventoryEngine(storyId);
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

    const clock = worldRepository.getWorldClock('default_story');
    if (result.craftingTimeSeconds) {
      clock.advanceSeconds(result.craftingTimeSeconds);
    }

    // CH4 Integration: record crafted item historical evidence if milestone
    const chronicle = worldRepository.getHistoricalChronicleEngine('default_story');
    const ts = clock.getTimestamp();
    chronicle.recordEvidence({
      id: `ev_craft_${recipeId}_${ts.totalElapsedSeconds}_${chronicle.getChronicleEntries().length}`,
      category: 'SACRED_OR_HISTORIC',
      timestamp: ts,
      primarySubjectId: actorId,
      secondarySubjectId: result.producedItem?.id || recipeId,
      locationId: player?.locationId || 'loc_whispering_orrery',
      summary: `Crafted ${result.producedItem?.name || 'an item'}`,
      details: `Forged ${result.producedItem?.name || 'an artifact'} via recipe ${recipeId}.`,
      sourceEventId: `evt_craft_${recipeId}_${ts.totalElapsedSeconds}`,
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
 * POST /api/game/inventory/transfer
 * Atomically transfers an item between valid owners/containers (CH5).
 */
gameRouter.post('/inventory/transfer', async (req: Request, res: Response) => {
  try {
    const { itemId, sourceOwnerId, targetOwnerId, targetContainerType, quantity } = req.body;
    if (!itemId || !sourceOwnerId || !targetOwnerId || !targetContainerType) {
      return res.status(400).json({ success: false, errorReason: 'Missing required parameters.' });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const actorId = player ? player.actorId : 'player_actor_default_story';
    // Auth validation: Both source and target must be authorized.
    if (!player?.locationId) {
       return res.status(403).json({ success: false, errorReason: 'Player location unknown.' });
    }

    const isAuthorized = (ownerId: string): boolean => {
      if (ownerId === actorId) return true;
      if (ownerId === player.locationId) return true;

      const npcLife = worldRepository.getNpcLifecycle('default_story', ownerId);
      if (npcLife && npcLife.isDead && npcLife.locationId === player.locationId) return true;

      const combatEngine = worldRepository.getCombatEngine('default_story');
      const parts = combatEngine.getParticipants();
      const deadParticipant = parts.find(p => p.id === ownerId && p.isDead);
      if (deadParticipant) return true;

      return false;
    };

    if (!isAuthorized(sourceOwnerId)) {
      return res.status(403).json({ success: false, errorReason: 'Not authorized or too far to transfer from this source.' });
    }

    if (!isAuthorized(targetOwnerId)) {
      return res.status(403).json({ success: false, errorReason: 'Not authorized or too far to transfer to this target.' });
    }

    const invEngine = worldRepository.getInventoryEngine('default_story');
    const result = invEngine.transferItem(itemId, sourceOwnerId, targetOwnerId, targetContainerType, quantity);

    if (!result.success) {
      return res.status(400).json(result);
    }
    
    // Record historical evidence if significant
    const chronicle = worldRepository.getHistoricalChronicleEngine('default_story');
    const clock = worldRepository.getWorldClock('default_story');
    const ts = clock.getTimestamp();
    chronicle.recordEvidence({
      id: `ev_transfer_${itemId}_${ts.totalElapsedSeconds}_${chronicle.getChronicleEntries().length}`,
      category: 'SACRED_OR_HISTORIC',
      timestamp: ts,
      primarySubjectId: actorId,
      secondarySubjectId: result.transferredItem?.id || itemId,
      locationId: player?.locationId || 'loc_whispering_orrery',
      summary: `Transferred ${result.transferredItem?.name || 'an item'}`,
      details: `Moved ${result.transferredItem?.name || 'an item'} from ${sourceOwnerId} to ${targetOwnerId}.`,
      sourceEventId: `evt_transfer_${itemId}_${ts.totalElapsedSeconds}`,
      provenance: 'system_simulation',
      visibility: 'PUBLIC',
      metadata: { itemId, sourceOwnerId, targetOwnerId }
    });

    const items = invEngine.getActorInventory(actorId);
    res.json({ ...result, items });
  } catch (error) {
    res.status(500).json({ error: 'Failed to transfer item.' });
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
    const storyId = resolveStoryId(req);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player ? player.actorId : `player_actor_${storyId}`;
    const invEngine = worldRepository.getInventoryEngine(storyId);

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
 * Returns power state, effective capabilities list (including active equipment grants), and DAG graph for active player (CH6, CH7, CH3.2).
 */
gameRouter.get('/capabilities', async (req: Request, res: Response) => {
	try {
		const { worldRepository } = await import('../repositories/worldRepository');
		const storyId = resolveStoryId(req);
		const player = worldRepository.getPlayerLifecycle(storyId);
		const actorId = (req.query.actorId as string) || (player ? player.actorId : `player_actor_${storyId}`);
		const capEngine = worldRepository.getCapabilityEngine(storyId);
		const invEngine = worldRepository.getInventoryEngine(storyId);
		const powerState = capEngine.getPowerState(actorId);
		const capabilities = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
		const skillInstances = capEngine.getAllSkillInstances(actorId);
		const graph = capEngine.getCapabilityGraph();
		res.json({ actorId, powerState, capabilities, skillInstances, graph });
	} catch (error) {
    res.status(500).json({ error: 'Failed to retrieve capabilities.' });
  }
});

/**
 * POST /api/game/capabilities/adjudicate
 * Deterministically adjudicates capability execution and applies mechanical consequences (CH6 & CH3.2).
 * Supports execution gates, environmental modifiers, and action-time contextual modifiers.
 */
gameRouter.post('/capabilities/adjudicate', async (req: Request, res: Response) => {
  try {
    const {
      intendedCapabilityId,
      requestedScale,
      actionDescription,
      actorId: reqActorId,
      environment,
      actorConditions,
      roleOrBackground,
      modifiers,
    } = req.body;
    if (!intendedCapabilityId || typeof intendedCapabilityId !== 'string') {
      return res.status(400).json({
        approved: false,
        rejectionReason: 'Missing or invalid intendedCapabilityId in request body.',
      });
    }

    const { worldRepository } = await import('../repositories/worldRepository');
    const storyId = resolveStoryId(req);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = reqActorId || (player ? player.actorId : `player_actor_${storyId}`);
    const capEngine = worldRepository.getCapabilityEngine(storyId);
    const invEngine = worldRepository.getInventoryEngine(storyId);

    // CH3.2 Server-authoritative capability grant check
    const effectiveCaps = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
    if (!effectiveCaps.some((c) => c.id === intendedCapabilityId)) {
      return res.status(403).json({
        approved: false,
        rejectionReason: `Actor '${actorId}' does not possess or have active equipment granting capability '${intendedCapabilityId}'.`,
      });
    }

    const result = capEngine.adjudicate({
      actorId,
      intendedCapabilityId,
      requestedScale: requestedScale || 'Moderate',
      actionDescription: actionDescription || `Manifest ${intendedCapabilityId}`,
      environment,
      actorConditions,
      roleOrBackground,
      modifiers,
    });

    if (result.approved) {
      // CH4 Integration: record chronicle evidence if significant/world-scale
      const cap = capEngine.getCapability(intendedCapabilityId);
      const isWorldScale = requestedScale === 'WorldScale' || cap?.powerTier === 'WorldScale';
      const chronicle = worldRepository.getHistoricalChronicleEngine(storyId);
      const clock = worldRepository.getWorldClock(storyId);
      const ts = clock.getTimestamp();
      chronicle.recordEvidence({
        id: `ev_cap_${intendedCapabilityId}_${ts.totalElapsedSeconds}_${chronicle.getChronicleEntries().length}`,
        category: isWorldScale ? 'WORLD_ANOMALY' : 'SACRED_OR_HISTORIC',
        timestamp: ts,
        primarySubjectId: actorId,
        secondarySubjectId: intendedCapabilityId,
        locationId: player?.locationId || 'loc_whispering_orrery',
        summary: `Invoked ${cap?.name || intendedCapabilityId}`,
        details: result.emittedObservation.sensoryDescription || result.narrativeDirective,
        sourceEventId: `evt_cap_${intendedCapabilityId}_${ts.totalElapsedSeconds}`,
        provenance: 'deterministic_adjudication',
        visibility: 'PUBLIC',
        metadata: { intendedCapabilityId, hpDelta: result.hpDelta, strainDelta: result.strainDelta },
      });
    }

    const powerState = capEngine.getPowerState(actorId);
    const capabilities = capEngine.getAllCapabilities();
    const skillInstances = capEngine.getAllSkillInstances(actorId);
    const graph = capEngine.getCapabilityGraph();

    res.json({
      ...result,
      powerState,
      capabilities,
      skillInstances,
      graph,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to adjudicate capability.' });
  }
});

/**
 * POST /api/game/capabilities/acquire
 * Acquires a new skill for an actor with an isolated, mutable SkillInstance.
 */
gameRouter.post('/capabilities/acquire', async (req: Request, res: Response) => {
  try {
    const { capabilityId, actorId: reqActorId, initialLevel, initialXp, evolutionPoints, lineage, storyId = 'default_story' } = req.body;
    if (!capabilityId) {
      return res.status(400).json({ success: false, errorReason: 'capabilityId is required.' });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = reqActorId || (player ? player.actorId : `player_actor_${storyId}`);
    const capEngine = worldRepository.getCapabilityEngine(storyId);

    const instance = capEngine.acquireSkill(actorId, capabilityId, {
      initialLevel,
      initialXp,
      evolutionPoints,
      lineage,
      worldRules: capEngine.getProgressionPolicy(),
    });
    res.json({ success: true, instance });
  } catch (error: any) {
    res.status(400).json({ success: false, errorReason: error?.message || 'Failed to acquire skill.' });
  }
});

/**
 * POST /api/game/capabilities/award-xp
 * Deterministically awards XP to an actor's skill instance and processes level-ups.
 */
gameRouter.post('/capabilities/award-xp', async (req: Request, res: Response) => {
  try {
    const { capabilityId, xpAmount, reason, actorId: reqActorId, storyId = 'default_story' } = req.body;
    if (!capabilityId || typeof xpAmount !== 'number') {
      return res.status(400).json({ success: false, errorReason: 'capabilityId and numeric xpAmount are required.' });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = reqActorId || (player ? player.actorId : `player_actor_${storyId}`);
    const capEngine = worldRepository.getCapabilityEngine(storyId);
    const policy = capEngine.getProgressionPolicy();

    const result = capEngine.awardSkillXp(actorId, capabilityId, xpAmount, policy, reason || 'Manual progression award');
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, errorReason: error?.message || 'Failed to award skill XP.' });
  }
});

/**
 * POST /api/game/capabilities/evolve
 * Evolves a skill into an advanced capability node, consuming evolution points and logging lineage.
 */
gameRouter.post('/capabilities/evolve', async (req: Request, res: Response) => {
  try {
    const { fromCapabilityId, toCapabilityId, targetDefinition, actorId: reqActorId, reason, storyId = 'default_story' } = req.body;
    if (!fromCapabilityId || !toCapabilityId) {
      return res.status(400).json({ success: false, errorReason: 'fromCapabilityId and toCapabilityId are required.' });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = reqActorId || (player ? player.actorId : `player_actor_${storyId}`);
    const capEngine = worldRepository.getCapabilityEngine(storyId);

    if (targetDefinition && !capEngine.getCapability(toCapabilityId)) {
      capEngine.registerCapability(targetDefinition);
    }

    const newInstance = capEngine.evolveSkill(actorId, fromCapabilityId, toCapabilityId, capEngine.getProgressionPolicy(), reason || 'Skill evolution');
    res.json({ success: true, instance: newInstance });
  } catch (error: any) {
    res.status(400).json({ success: false, errorReason: error?.message || 'Failed to evolve skill.' });
  }
});

/**
 * POST /api/game/capabilities/downgrade
 * Downgrades a skill instance deterministically with an audit record (V10.8.12).
 */
gameRouter.post('/capabilities/downgrade', async (req: Request, res: Response) => {
  try {
    const { capabilityId, targetLevel, reason, actorId: reqActorId, storyId = 'default_story' } = req.body;
    if (!capabilityId || typeof targetLevel !== 'number') {
      return res.status(400).json({ success: false, errorReason: 'capabilityId and numeric targetLevel are required.' });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = reqActorId || (player ? player.actorId : `player_actor_${storyId}`);
    const capEngine = worldRepository.getCapabilityEngine(storyId);

    const updated = capEngine.downgradeSkill(actorId, capabilityId, targetLevel, reason || 'Manual downgrade', capEngine.getProgressionPolicy());
    res.json({ success: true, instance: updated });
  } catch (error: any) {
    res.status(400).json({ success: false, errorReason: error?.message || 'Failed to downgrade skill.' });
  }
});

/**
 * POST /api/game/capabilities/relearn
 * Relearns a previously held or downgraded skill instance deterministically.
 */
gameRouter.post('/capabilities/relearn', async (req: Request, res: Response) => {
  try {
    const { capabilityId, reason, actorId: reqActorId, storyId = 'default_story' } = req.body;
    if (!capabilityId) {
      return res.status(400).json({ success: false, errorReason: 'capabilityId is required.' });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = reqActorId || (player ? player.actorId : `player_actor_${storyId}`);
    const capEngine = worldRepository.getCapabilityEngine(storyId);

    const relearned = capEngine.relearnSkill(actorId, capabilityId, reason || 'Relearned skill', capEngine.getProgressionPolicy());
    res.json({ success: true, instance: relearned });
  } catch (error: any) {
    res.status(400).json({ success: false, errorReason: error?.message || 'Failed to relearn skill.' });
  }
});

/**
 * POST /api/game/capabilities/evaluate-gate
 * Evaluates capability execution gate requirements without mutating state.
 */
gameRouter.post('/capabilities/evaluate-gate', async (req: Request, res: Response) => {
  try {
    const { capabilityId, actorId: reqActorId, environment, actorConditions, roleOrBackground, masteryOverride } = req.body;
    if (!capabilityId) {
      return res.status(400).json({ error: 'capabilityId is required.' });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const player = worldRepository.getPlayerLifecycle('default_story');
    const actorId = reqActorId || (player ? player.actorId : 'player_actor_default_story');
    const capEngine = worldRepository.getCapabilityEngine('default_story');

    const gate = capEngine.evaluateExecutionGate({
      actorId,
      capabilityId,
      environment,
      actorConditions,
      roleOrBackground,
      masteryOverride,
    });
    res.json(gate);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to evaluate execution gate.' });
  }
});

/**
 * Reusable Skill Library Endpoints (Phase F / Phase G)
 */
gameRouter.get('/capabilities/library', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const registry = worldRepository.getReusableSkillRegistry();
    const skills = registry.getAllSkills();
    res.json({ skills });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to retrieve skill library.' });
  }
});

gameRouter.post('/capabilities/library/evaluate-compatibility', async (req: Request, res: Response) => {
  try {
    const { reusableSkillId, targetWorld } = req.body;
    if (!reusableSkillId || !targetWorld) {
      return res.status(400).json({ error: 'reusableSkillId and targetWorld are required.' });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const registry = worldRepository.getReusableSkillRegistry();
    const skill = registry.getSkill(reusableSkillId);
    if (!skill) {
      return res.status(404).json({ error: `ReusableSkill '${reusableSkillId}' not found.` });
    }
    const result = registry.evaluateCompatibility(skill, targetWorld);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to evaluate compatibility.' });
  }
});

gameRouter.post('/capabilities/library/reuse', async (req: Request, res: Response) => {
  try {
    const { reusableSkillId, targetStoryId = 'default_story', targetActorId: reqActorId, targetWorld } = req.body;
    if (!reusableSkillId || !targetWorld) {
      return res.status(400).json({ error: 'reusableSkillId and targetWorld are required.' });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const registry = worldRepository.getReusableSkillRegistry();
    const skill = registry.getSkill(reusableSkillId);
    if (!skill) {
      return res.status(404).json({ error: `ReusableSkill '${reusableSkillId}' not found.` });
    }
    const player = worldRepository.getPlayerLifecycle(targetStoryId);
    const targetActorId = reqActorId || (player ? player.actorId : `player_actor_${targetStoryId}`);
    const targetCapEngine = worldRepository.getCapabilityEngine(targetStoryId);

    const instance = registry.instantiateInTargetStory(
      skill,
      targetStoryId,
      targetActorId,
      targetCapEngine,
      targetWorld
    );
    res.json({ success: true, instance });
  } catch (error: any) {
    res.status(400).json({ success: false, errorReason: error?.message || 'Failed to reuse skill.' });
  }
});

gameRouter.post('/capabilities/library/auto-reuse', async (req: Request, res: Response) => {
  try {
    const {
      sourceStoryId = 'default_story',
      sourceActorId,
      capabilityId,
      targetStoryId,
      targetActorId,
      targetWorld,
    } = req.body;
    if (!capabilityId || !targetStoryId || !targetActorId || !targetWorld) {
      return res.status(400).json({
        error: 'capabilityId, targetStoryId, targetActorId, and targetWorld are required.',
      });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const registry = worldRepository.getReusableSkillRegistry();
    const sourceCapEngine = worldRepository.getCapabilityEngine(sourceStoryId);
    const targetCapEngine = worldRepository.getCapabilityEngine(targetStoryId);
    const player = worldRepository.getPlayerLifecycle(sourceStoryId);
    const srcActor = sourceActorId || (player ? player.actorId : `player_actor_${sourceStoryId}`);

    const instance = registry.autoAcquireOrReuse(
      sourceStoryId,
      srcActor,
      capabilityId,
      targetStoryId,
      targetActorId,
      sourceCapEngine,
      targetCapEngine,
      targetWorld
    );
    res.json({ success: true, instance });
  } catch (error: any) {
    res.status(400).json({ success: false, errorReason: error?.message || 'Failed to auto-reuse skill.' });
  }
});

/**
 * POST /api/game/capabilities/synthesize
 * Custom Power Synthesis pipeline converting natural language concepts to structured capabilities (CH7/CH6).
 */
gameRouter.post('/capabilities/synthesize', async (req: Request, res: Response) => {
  try {
    const { conceptName, description, tags, powerTier, actorId: reqActorId, storyId: reqStoryId } = req.body;
    if (!conceptName || typeof conceptName !== 'string' || !description || typeof description !== 'string') {
      return res.status(400).json({
        success: false,
        errorReason: 'conceptName and description strings are required for power synthesis.',
      });
    }

    const validTiers = ['Minor', 'Moderate', 'Major', 'WorldScale'];
    if (powerTier !== undefined && !validTiers.includes(powerTier)) {
      return res.status(400).json({
        success: false,
        errorReason: `Invalid powerTier '${powerTier}'. Allowed values are: ${validTiers.join(', ')}.`,
      });
    }
    const chosenTier = powerTier || 'Moderate';

    const { targetType, rangeScope, actionType, cooldownTurns, durationTurns, restrictions, counters } = req.body;

    const { worldRepository } = await import('../repositories/worldRepository');
    const storyId = reqStoryId || 'default_story';
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = reqActorId || (player ? player.actorId : `player_actor_${storyId}`);
    const capEngine = worldRepository.getCapabilityEngine(storyId);

    const synthesisResult = capEngine.synthesizeCustomPower({
      actorId,
      conceptName: conceptName.trim(),
      description: description.trim(),
      tags: Array.isArray(tags) ? tags : [],
      powerTier: chosenTier,
      targetType,
      rangeScope,
      actionType,
      cooldownTurns,
      durationTurns,
      restrictions,
      counters,
    });

    // CH4 Integration: record custom synthesis evidence
    const chronicle = worldRepository.getHistoricalChronicleEngine(storyId);
    const clock = worldRepository.getWorldClock(storyId);
    const ts = clock.getTimestamp();
    chronicle.recordEvidence({
      id: `ev_synth_${synthesisResult.primaryCapability.id}_${ts.totalElapsedSeconds}_${chronicle.getChronicleEntries().length}`,
      category: 'SACRED_OR_HISTORIC',
      timestamp: ts,
      primarySubjectId: actorId,
      secondarySubjectId: synthesisResult.primaryCapability.id,
      locationId: player?.locationId || 'loc_whispering_orrery',
      summary: `Synthesized Custom Power: ${conceptName}`,
      details: `Forged custom technique '${conceptName}' (${chosenTier} Tier). Derived: ${synthesisResult.derivedSkills.join(', ')}.`,
      sourceEventId: `evt_synth_${synthesisResult.primaryCapability.id}_${ts.totalElapsedSeconds}`,
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
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to synthesize custom power.' });
  }
});

/**
 * POST /api/game/capabilities/interpret
 * Freeform Action Interpretation pipeline (CH7 / DreamBook §394–§396).
 * Maps unstructured player/NPC descriptions to existing capabilities, contextual modifications, or novel power proposals.
 */
gameRouter.post('/capabilities/interpret', async (req: Request, res: Response) => {
  try {
    const { actionText, tags, intendedCapabilityId, requestedModifiers, requestedScale, environment, actorConditions, executeIfValid, actorId: reqActorId, storyId: reqStoryId } = req.body;
    if (actionText === undefined || typeof actionText !== 'string') {
      return res.status(400).json({
        success: false,
        errorReason: 'actionText string is required for action interpretation.',
      });
    }

    const { worldRepository } = await import('../repositories/worldRepository');
    const storyId = reqStoryId || 'default_story';
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = reqActorId || (player ? player.actorId : `player_actor_${storyId}`);
    const capEngine = worldRepository.getCapabilityEngine(storyId);

    const interpretationResult = capEngine.interpretFreeformAction({
      actorId,
      actionText: actionText.trim(),
      tags: Array.isArray(tags) ? tags : undefined,
      intendedCapabilityId,
      requestedModifiers,
      requestedScale,
      environment,
      actorConditions,
      executeIfValid: Boolean(executeIfValid),
    });

    const powerState = capEngine.getPowerState(actorId);
    const capabilities = capEngine.getAllCapabilities();

    res.json({
      success: interpretationResult.validationSuccess,
      ...interpretationResult,
      powerState,
      capabilities,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to interpret freeform action.' });
  }
});

// ==========================================
// CH8: Tactical Combat & D&D Ruleset Adapter
// ==========================================

function getCombatStateHelper(
  combatEngine: import('../domain/combatEngine').TacticalCombatEngine,
  storyId = 'default_story',
  viewerActorId?: string
) {
  const actorId = viewerActorId || 'player_actor_default_story';
  const perceptionOptions = worldRepository.getCombatPerceptionOptions(storyId, actorId);
  return combatEngine.projectCombatForActor(actorId, perceptionOptions);
}

/**
 * Authoritatively synchronizes combat participant death into canonical WorldRepository NPC lifecycle state.
 * Implements CH5-COMBAT-01 (updating existing alive NPC lifecycles) and CH5-COMBAT-02 (immediate attack-time synchronization).
 * Idempotent: repeated synchronization preserves existing death record and timestamp.
 */
function syncNpcCombatDeath(
  storyId: string,
  participant: import('../domain/combatEngine').BattlefieldParticipant,
  killerName?: string,
  fallbackLocationId?: string
): void {
  if (!participant.isDead) return;
  const player = worldRepository.getPlayerLifecycle(storyId);
  const playerActorId = player?.actorId || 'player_actor_default_story';
  if (participant.id === playerActorId) return;

  const clock = worldRepository.getWorldClock(storyId);
  const ts = clock.getTimestamp();
  const existing = worldRepository.getNpcLifecycle(storyId, participant.id);

  if (existing) {
    if (existing.isDead) {
      // Idempotent: already marked dead, retain original death timestamp and cause
      return;
    }
    const updated = existing.copyWith({
      currentActivity: 'dead',
      lastUpdatedTime: ts.totalElapsedSeconds,
      deathRecord: {
        isDead: true,
        diedAtTimestamp: ts,
        cause: killerName ? `Slain in tactical combat by ${killerName}` : 'Killed in tactical combat.',
        revivalPossible: false,
      },
    });
    worldRepository.updateNpcLifecycle(storyId, updated);
  } else {
    const created = new PlayerLifecycleState({
      actorId: participant.id,
      name: participant.name,
      locationId: fallbackLocationId || player?.locationId || 'loc_unknown',
      lastUpdatedTime: ts.totalElapsedSeconds,
      currentActivity: 'dead',
      activeJourney: null,
      deathRecord: {
        isDead: true,
        diedAtTimestamp: ts,
        cause: killerName ? `Slain in tactical combat by ${killerName}` : 'Killed in tactical combat.',
        revivalPossible: false,
      },
    });
    worldRepository.updateNpcLifecycle(storyId, created);
  }
}

/**
 * POST /api/game/combat/encounter/start
 * Initializes or resets a tactical combat encounter with canonical inventory & lifecycle binding (CH8/DEF-CH8-01).
 */
gameRouter.post('/combat/encounter/start', async (req: Request, res: Response) => {
  try {
    const storyId = req.body?.storyId || 'default_story';
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player ? player.actorId : `player_actor_${storyId}`;
    const inv = worldRepository.getInventoryEngine(storyId);
    const capEngine = worldRepository.getCapabilityEngine(storyId);
    const combatEngine = worldRepository.getCombatEngine(storyId);

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

    // Preserve corpses before clearing (CH5-004 / CH5-COMBAT-01)
    const deadParticipants = combatEngine.getParticipants().filter(p => p.isDead && p.id !== actorId);
    for (const dp of deadParticipants) {
      syncNpcCombatDeath(storyId, dp, undefined, player?.locationId);
    }
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

    combatEngine.addParticipant(playerParticipant);

    // Dynamic enemy seeding: Ensure canonical dead NPC identities are NEVER resurrected as alive (CH5 Issue B)
    let enemyId = (typeof req.body?.enemyId === 'string' && req.body.enemyId.trim())
      ? req.body.enemyId.trim()
      : 'enemy_void_construct';
    const enemyName = (typeof req.body?.enemyName === 'string' && req.body.enemyName.trim())
      ? req.body.enemyName.trim()
      : 'Astral Void Sentry';

    const existingCandidate = worldRepository.getNpcLifecycle(storyId, enemyId);
    const shouldSkipIfDead = Boolean(req.body?.skipIfDead);

    if (existingCandidate?.isDead) {
      if (!shouldSkipIfDead) {
        // Generate a dynamic spawn identity so the deceased persistent identity is never resurrected as alive
        let counter = 2;
        while (worldRepository.getNpcLifecycle(storyId, `${enemyId}_${counter}`)?.isDead) {
          counter++;
        }
        enemyId = `${enemyId}_${counter}`;

        const dynamicEnemyParticipant: import('../domain/combatEngine').BattlefieldParticipant = {
          id: enemyId,
          name: enemyName,
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
        combatEngine.addParticipant(dynamicEnemyParticipant);
      }
    } else {
      const enemyParticipant: import('../domain/combatEngine').BattlefieldParticipant = {
        id: enemyId,
        name: enemyName,
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
      combatEngine.addParticipant(enemyParticipant);
    }

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

    const state = getCombatStateHelper(combatEngine, storyId, actorId);
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
 * Returns the actor-scoped projected combat state (CH2-08 / DEF-CH8-01).
 * Identity is bound to server-authoritative player actor.
 */
gameRouter.get('/combat/state', async (req: Request, res: Response) => {
  try {
    const player = worldRepository.getPlayerLifecycle('default_story');
    const serverPlayerActorId = player?.actorId || 'player_actor_default_story';

    // Public combat actor identity is server-bound to the existing player actor
    if (req.query.actorId && req.query.actorId !== serverPlayerActorId) {
      return res.status(403).json({
        error: `Cannot query combat state for actor '${req.query.actorId}'. Caller is bound to server player '${serverPlayerActorId}'.`,
      });
    }

    const combatEngine = worldRepository.getCombatEngine('default_story');
    const state = getCombatStateHelper(combatEngine, 'default_story', serverPlayerActorId);
    res.json({
      ...state,
      viewingActorId: serverPlayerActorId,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch combat state.' });
  }
});

/**
 * POST /api/game/combat/move
 * Executes deterministic grid movement within speed allowance (CH8 Movement Rules).
 * Identity is bound to server-authoritative player actor.
 */
gameRouter.post('/combat/move', async (req: Request, res: Response) => {
  try {
    const { actorId: reqActorId, targetX, targetY } = req.body;
    if (typeof targetX !== 'number' || typeof targetY !== 'number') {
      return res.status(400).json({ success: false, errorReason: 'targetX and targetY numbers required.' });
    }

    const player = worldRepository.getPlayerLifecycle('default_story');
    const serverPlayerActorId = player?.actorId || 'player_actor_default_story';

    // Reject impersonation of other actors on public HTTP route
    if (reqActorId && reqActorId !== serverPlayerActorId) {
      return res.status(403).json({
        success: false,
        errorReason: `Unauthorized: cannot move actor '${reqActorId}'. Caller is bound to server player '${serverPlayerActorId}'.`,
      });
    }

    const combatEngine = worldRepository.getCombatEngine('default_story');
    const moveResult = combatEngine.moveActor(serverPlayerActorId, targetX, targetY);
    const state = getCombatStateHelper(combatEngine, 'default_story', serverPlayerActorId);

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
 * Identity is bound to server-authoritative player actor.
 */
gameRouter.post('/combat/attack', async (req: Request, res: Response) => {
  try {
    const { attackerId: reqAttackerId, targetId } = req.body;
    if (!targetId) {
      return res.status(400).json({ success: false, errorReason: 'targetId string is required.' });
    }

    const player = worldRepository.getPlayerLifecycle('default_story');
    const serverPlayerActorId = player ? player.actorId : 'player_actor_default_story';

    // Reject impersonation of other attackers on public HTTP route
    if (reqAttackerId && reqAttackerId !== serverPlayerActorId) {
      return res.status(403).json({
        success: false,
        errorReason: `Unauthorized: cannot attack as actor '${reqAttackerId}'. Caller is bound to server player '${serverPlayerActorId}'.`,
      });
    }

    const attackerId = serverPlayerActorId;
    const actorId = serverPlayerActorId;
    const combatEngine = worldRepository.getCombatEngine('default_story');
    const inv = worldRepository.getInventoryEngine('default_story');
    const capEngine = worldRepository.getCapabilityEngine('default_story');
    const chronicle = worldRepository.getHistoricalChronicleEngine('default_story');
    const clock = worldRepository.getWorldClock('default_story');

    const attacker = combatEngine.getParticipant(attackerId);
    const target = combatEngine.getParticipant(targetId);

    if (!attacker || !target) {
      return res.status(404).json({ success: false, errorReason: 'Attacker or target participant not found.' });
    }

    // CH2-08 Epistemic Target-ID Security Authorization using durable repository authority
    const perceptionOptions = worldRepository.getCombatPerceptionOptions('default_story', attackerId);
    if (!combatEngine.isParticipantKnownToActor(attackerId, target, perceptionOptions)) {
      return res.status(403).json({
        success: false,
        errorReason: `Target '${targetId}' is not legitimately perceived or known by actor '${attackerId}'.`,
      });
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
    const updatedTarget = combatEngine.getParticipant(targetId) || target;

    // DEF-CH8-02: Canonical PlayerLifecycleState & PowerState Synchronization
    if (updatedTarget.id === actorId && attackResult.damage > 0) {
      // Sync PowerState healthCurrent
      const currentPower = capEngine.getPowerState(actorId);
      if (currentPower) {
        capEngine.setPowerState(actorId, {
          ...currentPower,
          healthCurrent: updatedTarget.hpCurrent,
        });
      }

      // Sync PlayerLifecycleState mortality if player died
      if (updatedTarget.isDead && player && !player.isDead) {
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
        const ts = clock.getTimestamp();
        chronicle.recordEvidence({
          id: `ev_death_${actorId}_${attackerId}_${ts.totalElapsedSeconds}_${chronicle.getChronicleEntries().length}`,
          category: 'LIFECYCLE_TRANSITION',
          timestamp: ts,
          primarySubjectId: actorId,
          secondarySubjectId: attackerId,
          locationId: player.locationId,
          summary: `Player Character Slain in Combat`,
          details: `${player.name} succumbed to mortal trauma from ${attacker.name}'s strike.`,
          sourceEventId: `evt_combat_death_${actorId}_${ts.totalElapsedSeconds}`,
          provenance: 'tactical_battlefield_mortality',
          visibility: 'PUBLIC',
        });
      } else if (attackResult.damage >= 15 && player) {
        // Record severe combat injury in canonical lifecycle state
        const injury: import('../domain/types').InjuryRecord = {
          id: `inj_combat_${clock.getTimestamp().totalElapsedSeconds}_${player.injuries.length}`,
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
    } else if (updatedTarget.id !== actorId && updatedTarget.isDead) {
      // CH5-COMBAT-01 & CH5-COMBAT-02: Immediate NPC Death Synchronization
      syncNpcCombatDeath('default_story', updatedTarget, attacker.name, player?.locationId);
    }

    // Check for encounter victory / defeat and emit HistoricalEvidence (DEF-CH8-04)
    const state = getCombatStateHelper(combatEngine, 'default_story', attackerId);
    if (state.victory) {
      const ts = clock.getTimestamp();
      chronicle.recordEvidence({
        id: `ev_victory_${actorId}_${ts.totalElapsedSeconds}_${chronicle.getChronicleEntries().length}`,
        category: 'SACRED_OR_HISTORIC',
        timestamp: ts,
        primarySubjectId: actorId,
        locationId: player?.locationId || 'loc_whispering_orrery',
        summary: `Tactical Battlefield Victory`,
        details: `${player?.name || 'Vael'} emerged victorious, neutralizing all hostile entities in combat.`,
        sourceEventId: `evt_combat_victory_${actorId}_${ts.totalElapsedSeconds}`,
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
 * Identity is bound to server-authoritative player actor.
 */
gameRouter.post('/combat/cast', async (req: Request, res: Response) => {
  try {
    const { actorId: reqActorId, targetId, capabilityId, requestedScale } = req.body;
    if (!targetId || !capabilityId) {
      return res.status(400).json({ success: false, errorReason: 'targetId and capabilityId are required.' });
    }

    const player = worldRepository.getPlayerLifecycle('default_story');
    const serverPlayerActorId = player?.actorId || 'player_actor_default_story';

    // Reject impersonation of other casters on public HTTP route
    if (reqActorId && reqActorId !== serverPlayerActorId) {
      return res.status(403).json({
        success: false,
        errorReason: `Unauthorized: cannot cast capability as actor '${reqActorId}'. Caller is bound to server player '${serverPlayerActorId}'.`,
      });
    }

    const actorId = serverPlayerActorId;
    const capEngine = worldRepository.getCapabilityEngine('default_story');
    const combatEngine = worldRepository.getCombatEngine('default_story');
    const chronicle = worldRepository.getHistoricalChronicleEngine('default_story');
    const clock = worldRepository.getWorldClock('default_story');

    const capDef = capEngine.getCapability(capabilityId);
    if (!capDef) {
      return res.status(404).json({ success: false, errorReason: `Capability '${capabilityId}' not found.` });
    }

    // CH3.2 Server-authoritative capability grant check
    const inv = worldRepository.getInventoryEngine('default_story');
    const effectiveCaps = capEngine.getEffectiveActorCapabilities(actorId, inv);
    if (!effectiveCaps.some((c) => c.id === capabilityId)) {
      return res.status(403).json({
        success: false,
        errorReason: `Actor '${actorId}' does not possess or have active equipment granting capability '${capabilityId}'.`,
      });
    }

    const attacker = combatEngine.getParticipant(actorId);
    const target = combatEngine.getParticipant(targetId);

    if (!attacker || !target) {
      return res.status(404).json({ success: false, errorReason: 'Attacker or target participant not found.' });
    }

    // CH2-08 Epistemic Target-ID Security Authorization using durable repository authority
    const perceptionOptions = worldRepository.getCombatPerceptionOptions('default_story', actorId);
    if (!combatEngine.isParticipantKnownToActor(actorId, target, perceptionOptions)) {
      return res.status(403).json({
        success: false,
        errorReason: `Target '${targetId}' is not legitimately perceived or known by actor '${actorId}'.`,
      });
    }

    // Multi-turn activation checking (charged/channelled)
    const existingActivation = combatEngine.getPendingActivation(actorId);
    if (capDef.activationMode === 'charged') {
      if (!existingActivation || existingActivation.capabilityId !== capabilityId) {
        // Start charging
        const turns = capDef.chargeTurnsRequired || 1;
        const act = {
          activationId: `act_${actorId}_${capabilityId}_${Date.now()}`,
          actorId,
          capabilityId,
          activationMode: 'charged' as const,
          totalTurnsRequired: turns,
          remainingTurns: turns,
          targetId,
          isInterruptible: capDef.isInterruptible !== false,
          channelSustainedTurns: 0,
          startedAtRound: combatEngine.getCurrentRound(),
        };
        combatEngine.startActivation(act);
        const state = getCombatStateHelper(combatEngine, 'default_story', actorId);
        return res.json({
          success: true,
          pendingActivation: act,
          headline: `${attacker.name} began charging ${capDef.name} (${turns} turn(s) remaining).`,
          combatState: state,
        });
      } else if (existingActivation.remainingTurns > 0) {
        return res.status(400).json({
          success: false,
          errorReason: `${capDef.name} is still charging (${existingActivation.remainingTurns} turn(s) remaining).`,
        });
      } else {
        // Charging complete, release pending activation
        combatEngine.removePendingActivation(actorId);
      }
    } else if (capDef.activationMode === 'channelled') {
      if (!existingActivation || existingActivation.capabilityId !== capabilityId) {
        combatEngine.startActivation({
          activationId: `act_${actorId}_${capabilityId}_${Date.now()}`,
          actorId,
          capabilityId,
          activationMode: 'channelled',
          totalTurnsRequired: 0,
          remainingTurns: 0,
          targetId,
          isInterruptible: capDef.isInterruptible !== false,
          channelSustainedTurns: 1,
          startedAtRound: combatEngine.getCurrentRound(),
        });
      }
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
    const updatedTarget = combatEngine.getParticipant(targetId);
    if (updatedTarget && updatedTarget.id === actorId) {
      const currentPower = capEngine.getPowerState(actorId);
      if (currentPower) {
        capEngine.setPowerState(actorId, {
          ...currentPower,
          healthCurrent: updatedTarget.hpCurrent,
        });
      }
      if (updatedTarget.isDead && player && !player.isDead) {
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
    } else if (updatedTarget && updatedTarget.id !== actorId && updatedTarget.isDead) {
      // Immediate NPC death synchronization for capability cast
      syncNpcCombatDeath('default_story', updatedTarget, `${attacker.name}'s ${capDef.name}`, player?.locationId);
    }

    // Check victory condition
    const state = getCombatStateHelper(combatEngine, 'default_story', actorId);
    if (state.victory) {
      const ts = clock.getTimestamp();
      chronicle.recordEvidence({
        id: `ev_victory_cast_${actorId}_${capabilityId}_${ts.totalElapsedSeconds}_${chronicle.getChronicleEntries().length}`,
        category: 'SACRED_OR_HISTORIC',
        timestamp: ts,
        primarySubjectId: actorId,
        secondarySubjectId: capabilityId,
        locationId: player?.locationId || 'loc_whispering_orrery',
        summary: `Triumphant Power Invocation in Combat`,
        details: `${player?.name || 'Vael'} used ${capDef.name} (${capDef.powerTier} Tier) to secure battlefield victory.`,
        sourceEventId: `evt_cast_victory_${actorId}_${ts.totalElapsedSeconds}`,
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
 * POST /api/game/combat/interrupt
 * Manually or mechanically interrupts a combatant's pending activation (channeling or charging).
 */
gameRouter.post('/combat/interrupt', async (req: Request, res: Response) => {
  try {
    const { targetActorId, reason } = req.body;
    if (!targetActorId) {
      return res.status(400).json({ success: false, errorReason: 'targetActorId is required.' });
    }
    const combatEngine = worldRepository.getCombatEngine('default_story');
    const result = combatEngine.interruptActivation(targetActorId, reason || 'Interrupted');
    const state = getCombatStateHelper(combatEngine, 'default_story', targetActorId);
    res.json({
      ...result,
      combatState: state,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to interrupt combat activation.' });
  }
});

/**
 * POST /api/game/combat/end-turn
 * Advances the turn queue and applies dynamic hazard zone ticks (CH8 Hazards).
 * Identity is bound to server-authoritative player actor.
 */
gameRouter.post('/combat/end-turn', async (req: Request, res: Response) => {
  try {
    const player = worldRepository.getPlayerLifecycle('default_story');
    const serverPlayerActorId = player?.actorId || 'player_actor_default_story';

    if (req.body?.actorId && req.body.actorId !== serverPlayerActorId) {
      return res.status(403).json({
        success: false,
        errorReason: `Unauthorized: cannot end turn as actor '${req.body.actorId}'. Caller is bound to server player '${serverPlayerActorId}'.`,
      });
    }

    const combatEngine = worldRepository.getCombatEngine('default_story');
    const advanceResult = combatEngine.advanceTurn();

    // Synchronize newly deceased NPC participants from hazard ticks during advanceTurn() (CH5 Issue A)
    const deadParticipants = combatEngine.getParticipants().filter(p => p.isDead && p.id !== serverPlayerActorId);
    for (const dp of deadParticipants) {
      syncNpcCombatDeath('default_story', dp, 'environmental hazard', player?.locationId);
    }

    // If player took lethal hazard damage, update player lifecycle mortality
    if (player && !player.isDead) {
      const playerPart = combatEngine.getParticipant(serverPlayerActorId);
      if (playerPart?.isDead) {
        const deadPlayer = player.copyWith({
          deathRecord: {
            isDead: true,
            diedAtTimestamp: worldRepository.getWorldClock('default_story').getTimestamp(),
            cause: 'Defeated in tactical combat by environmental hazard.',
            revivalPossible: true,
          },
        });
        worldRepository.updatePlayerLifecycle('default_story', deadPlayer);
      }
    }

    const state = getCombatStateHelper(combatEngine, 'default_story', serverPlayerActorId);

    res.json({
      success: true,
      advanceResult,
      combatState: state,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to advance combat turn.' });
  }
});

/**
 * POST /api/game/combat/npc-turn
 * Server-authoritative Autonomous NPC Tactical Turn Execution (CH3).
 * Evaluates canonical state using NpcTacticalDecisionPolicy and resolves action through TacticalCombatEngine.
 * Caller cannot forge or impersonate the player actor.
 */
gameRouter.post('/combat/npc-turn', async (req: Request, res: Response) => {
  try {
    const player = worldRepository.getPlayerLifecycle('default_story');
    const serverPlayerActorId = player?.actorId || 'player_actor_default_story';
    const combatEngine = worldRepository.getCombatEngine('default_story');
    const capEngine = worldRepository.getCapabilityEngine('default_story');

    const currentActor = combatEngine.getCurrentActor();
    if (!currentActor) {
      return res.status(400).json({ success: false, errorReason: 'No active combatants in turn queue.' });
    }

    // Verify current turn belongs to an NPC, NOT the player
    if (currentActor.id === serverPlayerActorId) {
      return res.status(403).json({
        success: false,
        errorReason: `Current turn belongs to player '${serverPlayerActorId}'. Use standard player action routes.`,
      });
    }

    // If client supplied actorId, ensure it matches current turn NPC
    if (req.body?.actorId && req.body.actorId !== currentActor.id) {
      return res.status(403).json({
        success: false,
        errorReason: `Actor mismatch: Requested '${req.body.actorId}' but active turn belongs to '${currentActor.id}'.`,
      });
    }

    const perceptionOptions = worldRepository.getCombatPerceptionOptions('default_story', currentActor.id);
    const proposal = NpcTacticalDecisionPolicy.decide({
      actorId: currentActor.id,
      combatEngine,
      capabilityEngine: capEngine,
      perceptionOptions,
    });

    const executionResult = NpcTacticalDecisionPolicy.executeDecidedAction(
      proposal,
      combatEngine,
      capEngine
    );

    // Sync any dead NPC participants resulting from NPC turn
    const deadParticipants = combatEngine.getParticipants().filter(p => p.isDead && p.id !== serverPlayerActorId);
    for (const dp of deadParticipants) {
      syncNpcCombatDeath('default_story', dp, currentActor.name, player?.locationId);
    }

    // If turn didn't advance or ended, advance turn queue
    const advanceResult = combatEngine.advanceTurn();

    // Synchronize newly deceased NPC participants from hazard ticks during advanceTurn() (CH5 Issue A)
    const postAdvanceDead = combatEngine.getParticipants().filter(p => p.isDead && p.id !== serverPlayerActorId);
    for (const dp of postAdvanceDead) {
      syncNpcCombatDeath('default_story', dp, 'environmental hazard', player?.locationId);
    }

    // If player took lethal hazard damage, update player lifecycle mortality
    if (player && !player.isDead) {
      const playerPart = combatEngine.getParticipant(serverPlayerActorId);
      if (playerPart?.isDead) {
        const deadPlayer = player.copyWith({
          deathRecord: {
            isDead: true,
            diedAtTimestamp: worldRepository.getWorldClock('default_story').getTimestamp(),
            cause: 'Defeated in tactical combat by environmental hazard.',
            revivalPossible: true,
          },
        });
        worldRepository.updatePlayerLifecycle('default_story', deadPlayer);
      }
    }

    const state = getCombatStateHelper(combatEngine, 'default_story', serverPlayerActorId);

    res.json({
      success: true,
      npcActorId: currentActor.id,
      proposal,
      executionResult,
      advanceResult,
      combatState: state,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute NPC tactical turn.' });
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
    const storyId = resolveStoryId(req);
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
    const storyId = resolveStoryId(req);
    const { actorId, queryKeywords = [], currentTurn, maxResults, includeDormant, includeArchived } = req.body;
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
    const storyId = resolveStoryId(req);
    const { actorId, actionText, targetEntityId, currentTurn } = req.body;
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
    const clock = worldRepository.getWorldClock('default_story');
    const memEngine = worldRepository.getMemoryEngine(storyId);
    const timestamp = clock.getTimestamp();

    const memRecord: import('../domain/memoryOpportunityEngine').DurableMemory = {
      id: memory.id || `mem_${timestamp.totalElapsedSeconds}_${memEngine.getAllMemories().length}`,
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
    const clock = worldRepository.getWorldClock('default_story');
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
    const clock = worldRepository.getWorldClock('default_story');
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

    const actorDiscoveredSet = new Set(
      player?.discoveredLocationIds || ['loc_whispering_orrery', 'loc_lantern_vault', 'loc_glasswood_verge']
    );
    actorDiscoveredSet.add(playerLoc);

    // Epistemic projection for NPC profiles (Schedules & Current Locations)
    const projectedNpcProfiles = npcProfiles.map((prof) => {
      const isLocDiscovered = actorDiscoveredSet.has(prof.currentLocationId);
      const isLocSame = prof.currentLocationId === playerLoc;
      const canPerceiveNpcLocation = isLocDiscovered || isLocSame;

      const projectedEntries = (prof.entries || []).map((entry) => {
        const isTargetDiscovered = actorDiscoveredSet.has(entry.targetLocationId);
        return {
          ...entry,
          targetLocationId: isTargetDiscovered ? entry.targetLocationId : 'loc_uncharted',
          activity: isTargetDiscovered ? entry.activity : ('idle' as const),
        };
      });

      return {
        ...prof,
        currentLocationId: canPerceiveNpcLocation ? prof.currentLocationId : 'loc_uncharted',
        currentActivity: canPerceiveNpcLocation ? prof.currentActivity : 'Unknown',
        entries: projectedEntries,
        fallbackLocationId: actorDiscoveredSet.has(prof.fallbackLocationId) ? prof.fallbackLocationId : 'loc_uncharted',
      };
    });

    // Epistemic projection for Physiologies
    const projectedPhysiologies = physiologies.filter((phys) => {
      if (phys.entityId === player?.actorId) return true;
      const prof = npcProfiles.find((p) => p.npcId === phys.entityId);
      const loc = prof ? prof.currentLocationId : playerLoc;
      return actorDiscoveredSet.has(loc);
    });

    // Epistemic projection for Scheduled Events
    const projectedScheduledEvents = scheduledEvents.filter((ev) => {
      if (ev.isResolved) return true;
      if (!ev.locationId || ev.locationId === 'global' || ev.kind === 'ASTRONOMICAL_SUNRISE') return true;
      return actorDiscoveredSet.has(ev.locationId);
    });

    const simulationTiers: Record<string, string> = {};
    for (const phys of projectedPhysiologies) {
      const prof = projectedNpcProfiles.find((p) => p.npcId === phys.entityId);
      const loc = prof ? prof.currentLocationId : playerLoc;
      simulationTiers[phys.entityId] = livingSim.evaluateSimulationTier(loc, playerLoc, geography);
    }
    for (const prof of projectedNpcProfiles) {
      if (!simulationTiers[prof.npcId]) {
        simulationTiers[prof.npcId] = livingSim.evaluateSimulationTier(prof.currentLocationId, playerLoc, geography);
      }
    }

    res.json({
      success: true,
      storyId,
      timestamp: clock.getTimestamp(),
      playerLocationId: playerLoc,
      physiologies: projectedPhysiologies,
      npcProfiles: projectedNpcProfiles,
      scheduledEvents: projectedScheduledEvents,
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
      idempotencyKey: bodyKey,
    } = req.body;

    const rawKey = bodyKey || req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    const idempotencyKey = rawKey ? String(rawKey).trim() : undefined;

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
      idempotencyKey,
    });

    if (turnResult.telemetry?.idempotencyReplayed) {
      res.setHeader('X-Idempotent-Replay', 'true');
    }

    const sensoryEngine = worldRepository.getSensoryEngine();
    let sensoryEvents: any[] = [];
    if (turnResult.turnPackage?.audioCues) {
      const combatEngine = worldRepository.getCombatEngine(storyId as string);
      const player = worldRepository.getPlayerLifecycle(storyId as string);
      
      const entities = [];
      let listenerPosition = { x: 0, y: 0 };
      
      const geo = worldRepository.getGeographyGraph();
      const livingWorld = worldRepository.getLivingWorldSimulation(storyId as string);
      
      if (combatEngine.getParticipants().length > 0) {
        const parts = combatEngine.getParticipants();
        for (const p of parts) {
          entities.push({ name: p.name, x: p.x, y: p.y });
          if (player && p.id === player.actorId) {
            listenerPosition = { x: p.x, y: p.y };
          }
        }
      } else if (player && player.locationId) {
         const loc = geo.getNode(player.locationId);
         if (loc) {
           listenerPosition = { x: loc.coordinates.x, y: loc.coordinates.y };
           // DEF-CH14-04: Provide canonical geography sources
           entities.push({ name: loc.name, x: loc.coordinates.x, y: loc.coordinates.y });
           entities.push({ name: player.name || 'player', x: loc.coordinates.x, y: loc.coordinates.y });
           // Adjacent geography
           const edges = geo.getOutgoingEdges(player.locationId);
           const adjacent = edges.map(e => geo.getNode(e.toLocationId)).filter(Boolean) as any[];
           for (const adjLoc of adjacent) {
             entities.push({ name: adjLoc.name, x: adjLoc.coordinates.x, y: adjLoc.coordinates.y });
           }
           // LivingWorld simulation visible entities
           if (livingWorld) {
             const allNpcs = livingWorld.getAllNpcSchedules();
             for (const npc of allNpcs) {
               if (npc.currentLocationId) {
                  const npcLoc = geo.getNode(npc.currentLocationId);
                  if (npcLoc && (npc.currentLocationId === player.locationId || adjacent.find((a: any) => a.id === npc.currentLocationId))) {
                    entities.push({ name: npc.npcId, x: npcLoc.coordinates.x, y: npcLoc.coordinates.y });
                  }
               }
             }
           }
         }
      }

      sensoryEvents = sensoryEngine.resolveAudioCuesToEvents(
        turnResult.turnPackage.audioCues,
        { listenerPosition, entities }
      );
    }
    // DEF-CH14-04: Client presentation receives perceivable events only
    (turnResult as any).sensoryEvents = sensoryEvents.filter((e: any) => !e.suppressed);
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
      discoveredCount: summary.totalDiscovered ?? orchestrator.getAllModels().length,
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
 * GET /api/game/orchestrator/pins
 * Returns all current task pins.
 */
gameRouter.get('/orchestrator/pins', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();
    res.json({
      success: true,
      pins: orchestrator.getAllTaskPins(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve task pins.' });
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
      pins: orchestrator.getAllTaskPins(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to pin model for task.' });
  }
});

/**
 * POST /api/game/orchestrator/test-model
 * Performs a real-time connectivity & readiness test for a specified model.
 */
gameRouter.post('/orchestrator/test-model', async (req: Request, res: Response) => {
  try {
    const { providerId, modelId } = req.body;
    if (!providerId || !modelId) {
      res.status(400).json({ error: 'providerId and modelId are required.' });
      return;
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();
    const result = await orchestrator.testModel(providerId, modelId);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute model test.', details: String(error) });
  }
});

/**
 * GET /api/game/orchestrator/fallbacks
 * Returns all current task fallback chains.
 */
gameRouter.get('/orchestrator/fallbacks', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();
    res.json({
      success: true,
      fallbackChains: orchestrator.getAllFallbackChains(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve fallback chains.' });
  }
});

/**
 * POST /api/game/orchestrator/fallback
 * Updates the fallback chain for a task.
 */
gameRouter.post('/orchestrator/fallback', async (req: Request, res: Response) => {
  try {
    const { task, chain } = req.body;
    if (!task || !Array.isArray(chain)) {
      res.status(400).json({ error: 'task and chain array are required.' });
      return;
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();
    orchestrator.setFallbackChain(task, chain);
    res.json({
      success: true,
      task,
      chain,
      fallbackChains: orchestrator.getAllFallbackChains(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update fallback chain.' });
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

// ==========================================
// CH16: Reusable World Library & Campaign Discovery
// ==========================================

gameRouter.get('/worlds', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const { query, genre, tone, medium, era, setting, source, playstyle, rules } = req.query as Record<string, string>;
    const worlds = worldRepository.searchWorldTemplates({
      query,
      genre,
      tone,
      medium,
      era,
      setting,
      source,
      playstyle,
      rules,
    });
    res.json(worlds);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve worlds list.' });
  }
});

gameRouter.post('/worlds', async (req: Request, res: Response) => {
  try {
    const {
      naturalLanguagePremise,
      title,
      genreTags,
      toneTags,
      mediumTags,
      defaultEra,
      canonMode,
      rulesetId,
      storyMode,
      dndRulesMode,
      setting,
      sourcePolicy,
      imageAsset,
      imageMetadata,
      geography,
      timeline,
      characters,
      factions,
      magicRules,
      economy,
      forbiddenContradictions,
      startingStarts,
      terminology,
      knowledgeBoundaries,
      artConfig,
      audioConfig,
      narrativeConfig,
      events,
    } = req.body;

    if (!naturalLanguagePremise || typeof naturalLanguagePremise !== 'string') {
      return res.status(400).json({ error: 'naturalLanguagePremise string is required.' });
    }
    const { worldSynthesisService } = await import('../services/worldSynthesisService');
    const world = await worldSynthesisService.synthesizeWorldFromPremise({
      naturalLanguagePremise,
      title,
      genreTags,
      toneTags,
      mediumTags,
      defaultEra,
      canonMode,
      rulesetId,
      storyMode,
      dndRulesMode,
      setting,
      sourcePolicy,
      imageAsset,
      imageMetadata,
      geography,
      timeline,
      characters,
      factions,
      magicRules,
      economy,
      forbiddenContradictions,
      startingStarts,
      terminology,
      knowledgeBoundaries,
      artConfig,
      audioConfig,
      narrativeConfig,
      events,
    });
    res.status(201).json(world);
  } catch (error) {
    res.status(500).json({ error: 'Failed to synthesize world from premise.' });
  }
});

gameRouter.get('/worlds/:worldId', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const worldId = req.params.worldId as string;
    const world = worldRepository.getWorldTemplate(worldId);
    if (!world) {
      return res.status(404).json({ error: 'World template not found.' });
    }
    res.json(world);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve world template.' });
  }
});

gameRouter.post('/worlds/:worldId/start-run', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const { serverMockAuthority } = await import('../mockEngine/serverMockAuthority');
    const worldId = req.params.worldId as string;
    const world = worldRepository.getWorldTemplate(worldId);
    if (!world) {
      return res.status(404).json({ error: `World template "${worldId}" not found.` });
    }
    const {
      confirmedCharacter,
      characterId,
      storyMode = 'PROTAGONIST',
      dndRulesMode = 'FULL_DND',
      characterName,
      characterRole,
      characterBackground,
      characterAppearance,
      characterPersonality,
      characterMotivations,
      characterEquipment,
      characterPortraitEmoji,
      characterPortraitUrl,
      capabilities,
      initialConditions,
    } = req.body;

    let targetConfirmedCharacter = confirmedCharacter;

    if (!targetConfirmedCharacter && characterId) {
      targetConfirmedCharacter = worldRepository.getConfirmedCharacter(worldId, characterId);
      if (!targetConfirmedCharacter) {
        return res.status(404).json({ error: `Confirmed character "${characterId}" not found in world "${worldId}".` });
      }
    }

    let storyId: string;
    let run: any;

    if (targetConfirmedCharacter) {
      // Primary Slice 3 creation from Confirmed Character
      const creationResult = worldRepository.createStoryRunFromConfirmedCharacter({
        worldId,
        confirmedCharacter: targetConfirmedCharacter,
        storyMode,
        dndRulesMode,
      });
      storyId = creationResult.storyId;
      run = creationResult.run;
    } else {
      // Legacy backwards-compatibility
      storyId = `run_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      worldRepository.seedDynamicStoryRun(storyId, world, {
        storyMode,
        dndRulesMode,
        characterName: characterName || 'Hero Vael',
        characterRole,
        characterBackground,
        characterAppearance,
        characterPersonality,
        characterMotivations,
        characterEquipment,
        characterPortraitEmoji,
        characterPortraitUrl,
        capabilities,
        initialConditions,
      });
      run = worldRepository.getStoryRun(storyId);
    }

    serverMockAuthority.setActiveStoryId(storyId);

    // Auto-generate or retrieve canonical opening scene for the new StoryRun (Slice 4)
    let openingScene = null;
    try {
      openingScene = await OpeningSceneService.generateOpeningScene({ storyId });
    } catch (genErr) {
      console.warn(`[POST /story-runs] Initial opening scene auto-generation deferred:`, genErr);
    }

    const viewState = serverMockAuthority.getSanitizedViewState(storyId);

    res.status(201).json({
      success: true,
      storyId,
      storyMode: run?.storyMode || storyMode,
      dndRulesMode: run?.dndRulesMode || dndRulesMode,
      run,
      viewState,
      openingScene: openingScene || run?.openingScene || null,
    });
  } catch (error: any) {
    console.error('Error starting world run:', error);
    res.status(400).json({ error: error?.message || 'Failed to start world run.' });
  }
});

/**
 * GET /api/game/story-runs/:storyId/opening
 * Retrieves existing opening scene for a story run.
 */
gameRouter.get('/story-runs/:storyId/opening', async (req: Request, res: Response) => {
  try {
    const storyId = String(req.params.storyId);
    const run = worldRepository.getStoryRun(storyId);
    if (!run) {
      return res.status(404).json({ error: `StoryRun with ID "${storyId}" not found.` });
    }

    const openingScene = OpeningSceneService.getOpeningScene(storyId);
    if (!openingScene) {
      return res.status(404).json({ error: `Opening scene has not yet been generated for storyId "${storyId}".` });
    }

    return res.json({ success: true, storyId, openingScene });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to retrieve opening scene.' });
  }
});

/**
 * POST /api/game/story-runs/:storyId/opening
 * Idempotently generates or retrieves the opening scene for a story run.
 */
gameRouter.post('/story-runs/:storyId/opening', async (req: Request, res: Response) => {
  try {
    const storyId = String(req.params.storyId);
    const { forceRegenerate, timeoutMs, simulateFailure } = req.body || {};

    const run = worldRepository.getStoryRun(storyId);
    if (!run) {
      return res.status(404).json({ error: `StoryRun with ID "${storyId}" not found.` });
    }

    const openingScene = await OpeningSceneService.generateOpeningScene({
      storyId,
      forceRegenerate: Boolean(forceRegenerate),
      timeoutMs: typeof timeoutMs === 'number' ? timeoutMs : undefined,
      simulateFailure: Boolean(simulateFailure),
    });

    const viewState = serverMockAuthority.getSanitizedViewState(storyId);

    return res.json({
      success: true,
      storyId,
      openingScene,
      viewState,
    });
  } catch (error: any) {
    console.error(`Error generating opening scene for ${req.params.storyId}:`, error);
    return res.status(500).json({
      error: error?.message || 'Failed to generate opening scene.',
      storyId: req.params.storyId,
      recoverable: true,
    });
  }
});

/**
 * GET /api/game/story-runs/:storyId/opening/context
 * Retrieves assembled opening working context for inspection and verification.
 */
gameRouter.get('/story-runs/:storyId/opening/context', (req: Request, res: Response) => {
  try {
    const storyId = String(req.params.storyId);
    const run = worldRepository.getStoryRun(storyId);
    if (!run) {
      return res.status(404).json({ error: `StoryRun with ID "${storyId}" not found.` });
    }

    const context = WorkingContextEngine.assembleOpeningContext({ storyId });
    return res.json({ success: true, storyId, context });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to assemble opening context.' });
  }
});

// ==========================================
// Character Genesis & Creation (Slice 2)
// ==========================================

/**
 * POST /api/game/worlds/:worldId/characters/extract
 * Extracts a complete CharacterGenesisDraft from a natural-language description.
 * Preserves user edits if userEditedFields are provided.
 */
gameRouter.post('/worlds/:worldId/characters/extract', async (req: Request, res: Response) => {
  try {
    const worldId = String(req.params.worldId);
    const { naturalLanguageConcept, existingDraft, userEditedFields } = req.body;
    const worldTemplate = worldRepository.getWorldTemplate(worldId);
    if (!worldTemplate) {
      return res.status(404).json({ error: `World ${worldId} not found.` });
    }

    const { characterGenesisService } = await import('../services/characterGenesisService');
    const draft = await characterGenesisService.extractCharacterDraft(
      {
        naturalLanguageConcept: naturalLanguageConcept || '',
        worldId,
        existingDraft,
        userEditedFields,
      },
      worldTemplate
    );

    res.json({ success: true, draft });
  } catch (error: any) {
    console.error('Error extracting character draft:', error);
    res.status(500).json({ error: error?.message || 'Failed to extract character draft.' });
  }
});

/**
 * POST /api/game/worlds/:worldId/characters/custom-capability
 * Synthesizes a structured custom capability proposal with linked techniques.
 */
gameRouter.post('/worlds/:worldId/characters/custom-capability', async (req: Request, res: Response) => {
  try {
    const worldId = String(req.params.worldId);
    const { capabilityConcept, characterContext } = req.body;
    const worldTemplate = worldRepository.getWorldTemplate(worldId);
    if (!worldTemplate) {
      return res.status(404).json({ error: `World ${worldId} not found.` });
    }

    const { characterGenesisService } = await import('../services/characterGenesisService');
    const capability = await characterGenesisService.proposeCustomCapability(
      {
        worldId,
        capabilityConcept: capabilityConcept || '',
        characterContext,
      },
      worldTemplate
    );

    res.json({ success: true, capability });
  } catch (error: any) {
    console.error('Error proposing custom capability:', error);
    res.status(500).json({ error: error?.message || 'Failed to propose custom capability.' });
  }
});

/**
 * GET /api/game/worlds/:worldId/characters/drafts
 * Retrieves all saved drafts for a specific world.
 */
gameRouter.get('/worlds/:worldId/characters/drafts', (req: Request, res: Response) => {
  try {
    const worldId = String(req.params.worldId);
    const drafts = worldRepository.getCharacterDrafts(worldId);
    res.json({ success: true, drafts });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to retrieve drafts.' });
  }
});

/**
 * POST /api/game/worlds/:worldId/characters/drafts
 * Saves or updates a draft for a specific world.
 */
gameRouter.post('/worlds/:worldId/characters/drafts', (req: Request, res: Response) => {
  try {
    const worldId = String(req.params.worldId);
    const { draft } = req.body;
    if (!draft) {
      return res.status(400).json({ error: 'Draft object is required.' });
    }
    worldRepository.saveCharacterDraft(worldId, draft);
    res.json({ success: true, draft });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to save draft.' });
  }
});

/**
 * POST /api/game/worlds/:worldId/characters/confirm
 * Validates and explicitly confirms a CharacterGenesisDraft into a ConfirmedCharacter.
 * CRITICAL: Strictest isolation guarantee — does NOT launch or create any StoryRun!
 */
gameRouter.post('/worlds/:worldId/characters/confirm', async (req: Request, res: Response) => {
  try {
    const worldId = String(req.params.worldId);
    const { draft } = req.body;
    const worldTemplate = worldRepository.getWorldTemplate(worldId);
    if (!worldTemplate) {
      return res.status(404).json({ error: `World ${worldId} not found.` });
    }
    if (!draft) {
      return res.status(400).json({ error: 'Draft object is required.' });
    }

    const { characterGenesisService } = await import('../services/characterGenesisService');
    const confirmedCharacter = characterGenesisService.confirmCharacter(draft, worldTemplate);
    worldRepository.saveConfirmedCharacter(worldId, confirmedCharacter);

    res.json({ success: true, character: confirmedCharacter });
  } catch (error: any) {
    console.error('Error confirming character:', error);
    res.status(400).json({ error: error?.message || 'Failed to confirm character.' });
  }
});

/**
 * GET /api/game/worlds/:worldId/characters/confirmed
 * Retrieves all confirmed characters for a specific world.
 */
gameRouter.get('/worlds/:worldId/characters/confirmed', (req: Request, res: Response) => {
  try {
    const worldId = String(req.params.worldId);
    const characters = worldRepository.getConfirmedCharacters(worldId);
    res.json({ success: true, characters });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to retrieve confirmed characters.' });
  }
});

// ==========================================
// Media & Image Generation Adapter (Presentation Only)
// ==========================================

gameRouter.post('/media/generate-image', async (req: Request, res: Response) => {
  try {
    const { storyId = 'default_story', prompt, assetId, aspectRatio, tags } = req.body;
    const { mediaAdapterService } = await import('../services/mediaAdapterService');
    const result = await mediaAdapterService.generateImage({
      storyId,
      prompt,
      assetId,
      aspectRatio,
      tags,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, errorReason: error?.message || 'Media generation error.' });
  }
});

gameRouter.post('/media/fault-injection', async (req: Request, res: Response) => {
  try {
    const { mode } = req.body;
    const { mediaAdapterService } = await import('../services/mediaAdapterService');
    mediaAdapterService.setFailureMode(mode || 'NONE');
    res.json({ success: true, mode: mediaAdapterService.getFailureMode() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to set fault injection mode.' });
  }
});

// ==========================================
// Research Evidence Firewall & Adjudication Pipeline
// ==========================================

gameRouter.post('/research/evidence', async (req: Request, res: Response) => {
  try {
    const { researchEvidencePipeline } = await import('../domain/researchEvidence');
    const item = req.body;
    if (!item.evidenceId || !item.claimText) {
      return res.status(400).json({ error: 'evidenceId and claimText are required.' });
    }
    researchEvidencePipeline.registerEvidence(item);
    res.status(201).json({ success: true, evidence: item });
  } catch (error) {
    res.status(500).json({ error: 'Failed to register research evidence.' });
  }
});

gameRouter.get('/research/evidence', async (req: Request, res: Response) => {
  try {
    const { researchEvidencePipeline } = await import('../domain/researchEvidence');
    res.json(researchEvidencePipeline.getAllEvidence());
  } catch (error) {
    res.status(500).json({ error: 'Failed to list research evidence.' });
  }
});

gameRouter.post('/research/adjudicate', async (req: Request, res: Response) => {
  try {
    const { evidenceId, adjudicationResult, storyId = 'default_story' } = req.body;
    const { researchEvidencePipeline } = await import('../domain/researchEvidence');
    const { worldRepository } = await import('../repositories/worldRepository');
    const result = researchEvidencePipeline.adjudicateAndPromote(
      evidenceId,
      adjudicationResult,
      storyId,
      worldRepository
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, errorReason: error?.message || 'Adjudication failed.' });
  }
});

gameRouter.get('/worlds/runs/:storyId', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const storyId = req.params.storyId as string;
    const run = worldRepository.getStoryRun(storyId);
    if (!run) {
      return res.status(404).json({ error: 'Story run not found.' });
    }
    res.json(run);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve story run.' });
  }
});

gameRouter.post('/worlds/runs/:storyId/story-director/step', async (req: Request, res: Response) => {
  try {
    const { storyDirectorService } = await import('../services/storyDirectorService');
    const storyId = req.params.storyId as string;
    const result = storyDirectorService.stepDirector(storyId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to step story director.' });
  }
});

gameRouter.post('/worlds/runs/:storyId/story-director/choice', async (req: Request, res: Response) => {
  try {
    const { beatId, optionId } = req.body;
    if (!beatId || !optionId) {
      return res.status(400).json({ error: 'beatId and optionId are required.' });
    }
    const { storyDirectorService } = await import('../services/storyDirectorService');
    const storyId = req.params.storyId as string;
    const result = storyDirectorService.recordChoice(storyId, beatId, optionId);
    res.json({
      ...result,
      recordedChoice: { beatId, optionId },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record story director choice.' });
  }
});

gameRouter.post('/worlds/runs/:storyId/story-director/offscreen', async (req: Request, res: Response) => {
  try {
    const { storyDirectorService } = await import('../services/storyDirectorService');
    const storyId = req.params.storyId as string;
    const result = storyDirectorService.advanceOffscreenProtagonist(storyId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to advance offscreen protagonist.' });
  }
});

gameRouter.post('/worlds/runs/:storyId/actions/execute', async (req: Request, res: Response) => {
  try {
    const { actionType, locationId } = req.body;
    const { worldRepository } = await import('../repositories/worldRepository');
    const { emergentNarrativeEngine } = await import('../services/emergentNarrativeEngine');
    const storyId = req.params.storyId as string;

    const run = worldRepository.getStoryRun(storyId);
    if (!run) {
      return res.status(404).json({ error: 'Story run not found.' });
    }

    if (locationId) {
      run.currentLocationId = locationId;
      worldRepository.saveStoryRun(run);
    }

    const gameplayEvent = {
      eventId: `evt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      storyId,
      eventType: actionType || 'INVESTIGATE_AREA',
      actorId: run.characterName || 'Player',
      locationId: run.currentLocationId || 'loc_unknown',
      details: `Server resolved action ${actionType || 'INVESTIGATE_AREA'} at ${run.currentLocationId}`,
      evidenceItems: [`ev_${actionType || 'action'}_${Date.now()}`],
      timestamp: new Date().toISOString(),
    };

    const narrativeResult = emergentNarrativeEngine.processCanonicalEvent(gameplayEvent);
    const storyThreads = worldRepository.getStoryThreads(storyId);

    res.json({
      success: true,
      gameplayEvent,
      narrativeResult,
      storyThreads,
      storyRun: run,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute player action.' });
  }
});

gameRouter.post('/worlds/runs/:storyId/actions/apply-ability', async (req: Request, res: Response) => {
  try {
    const { abilityId, targetId } = req.body;
    if (!abilityId || !targetId) {
      return res.status(400).json({ error: 'abilityId and targetId are required.' });
    }
    const { abilityService } = await import('../services/abilityService');
    const storyId = req.params.storyId as string;
    const result = abilityService.resolveAbilityApplication(storyId, abilityId, targetId, req.body);
    if (!result.success) {
      return res.status(result.statusCode || 400).json({ error: result.errorReason });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to apply ability.' });
  }
});

gameRouter.post('/worlds/runs/:storyId/dice-clash/resolve', async (req: Request, res: Response) => {
  try {
    const { playerPool, enemyPool, exchangeIndex, attackerStats, defenderStats } = req.body;
    const { worldRepository } = await import('../repositories/worldRepository');
    const storyId = req.params.storyId as string;
    const result = worldRepository.resolveDiceClashExchange(storyId, playerPool, enemyPool, {
      exchangeIndex,
      attackerStats,
      defenderStats,
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to resolve dice clash.' });
  }
});

gameRouter.get('/run-canonical-state', (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const run = worldRepository.getStoryRun(storyId);
    const playerLifecycle = worldRepository.getPlayerLifecycle(storyId) as any;
    const invEngine = worldRepository.getInventoryEngine(storyId);
    const capEngine = worldRepository.getCapabilityEngine(storyId);
    const chronicle = worldRepository.getHistoricalChronicleEngine(storyId);
    const facts = worldRepository.getKnowledgeFacts(storyId);
    const geography = worldRepository.getGeographyGraph(storyId);

    const actorId = playerLifecycle?.characterId || playerLifecycle?.actorId || 'protagonist';
    const equippedItems = invEngine.getEquippedItems(actorId);
    const inventoryItems = invEngine.getInventoryItems(actorId);
    const paperDoll = invEngine.getActorPaperDoll(actorId);

    const coreCaps = capEngine.getAllCapabilities ? capEngine.getAllCapabilities() : [];
    const actorSkills = capEngine.getActorSkillInstances ? capEngine.getActorSkillInstances(actorId) : [];

    const activeQuests = (run?.plannedEvents || []).filter((e: any) => {
      const st = run?.eventStates?.[e.id]?.status;
      return st === 'READY' || st === 'ACTIVE' || st === 'PLANNED';
    });
    const completedQuests = (run?.plannedEvents || []).filter((e: any) => {
      const st = run?.eventStates?.[e.id]?.status;
      return st === 'COMPLETED';
    });
    const failedQuests = (run?.plannedEvents || []).filter((e: any) => {
      const st = run?.eventStates?.[e.id]?.status;
      return st === 'FAILED' || st === 'PREVENTED';
    });

    const locations = geography.getAllNodes().map(n => ({
      id: n.id,
      name: n.name,
      region: n.regionId,
      description: n.description,
      discovered: n.discovered,
      accessible: n.accessible,
    }));

    const currentLocationId = playerLifecycle?.locationId || run?.currentLocationId || 'loc_whispering_orrery';
    const currentLocation = locations.find(l => l.id === currentLocationId) || locations[0];

    res.json({
      storyId,
      storyMode: run?.storyMode || 'PROTAGONIST',
      dndRulesMode: run?.dndRulesMode || 'FULL_DND',
      protagonist: {
        name: playerLifecycle?.identity?.name || playerLifecycle?.name || run?.protagonistName || 'Aelion',
        role: playerLifecycle?.role?.profession || run?.protagonistRole || 'Seeker',
        portraitUrl: playerLifecycle?.portraitUrl || '',
        health: playerLifecycle?.health || { current: 100, max: 100 },
        resource: playerLifecycle?.resource || { current: 50, max: 50, name: 'Mana/Energy' },
        strain: playerLifecycle?.strain || 0,
        fatigue: playerLifecycle?.fatigue || 0,
        conditions: playerLifecycle?.conditions || [],
        activeEffects: playerLifecycle?.activeEffects || [],
        injuries: playerLifecycle?.injuries || [],
        forms: playerLifecycle?.forms || [],
        seals: playerLifecycle?.seals || [],
        locationId: currentLocationId,
      },
      equipment: {
        paperDoll,
        equippedItems,
      },
      inventory: {
        items: inventoryItems,
      },
      capabilities: {
        coreCapabilities: coreCaps,
        generatedTechniques: actorSkills,
      },
      quests: {
        active: activeQuests,
        completed: completedQuests,
        failed: failedQuests,
      },
      relationships: playerLifecycle?.relationships || [],
      memory: {
        facts,
        evidence: chronicle.exportState().evidenceStore,
      },
      worldCodex: {
        currentLocation,
        discoveredLocations: locations.filter(l => l.discovered),
        factions: worldRepository.getWorldTemplate(run?.worldId || 'world_solar_archive')?.factions || [],
        lore: worldRepository.getWorldTemplate(run?.worldId || 'world_solar_archive')?.lore || [],
      }
    });
  } catch (error) {
    console.error('Error fetching canonical run state:', error);
    res.status(500).json({ error: 'Failed to fetch canonical run state.' });
  }
});






