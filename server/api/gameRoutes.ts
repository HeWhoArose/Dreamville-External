import { Router, Request, Response } from 'express';
import { serverMockAuthority } from '../mockEngine/serverMockAuthority';
import { ActionRequest } from '../mockEngine/serverTypes';
import { worldRepository } from '../repositories/worldRepository';
import { NpcTacticalDecisionPolicy } from '../domain/tacticalDecisionPolicy';
import { PlayerLifecycleState } from '../domain/playerLifecycleState';
import { OpeningSceneService } from '../services/openingSceneService';
import { WorkingContextEngine } from '../domain/workingContextEngine';
import { worldVisualIdentityService } from '../services/worldVisualIdentityService';
import { rulesProfileEngine } from '../domain/rulesProfileEngine';
import { CustomRuleEngine } from '../domain/customRuleEngine';
import { resolveCanonicalConfirmedCharacter } from '../services/confirmedCharacterAuthority';
import { entityCardService } from '../services/entityCardService';
import { characterGenesisService } from '../services/characterGenesisService';
import { storyActionAdvisor } from '../services/storyActionAdvisor';
import { canonicalCommandEngine } from '../domain/canonicalCommandEngine';
import { deterministicId, formatCanonicalTimestamp } from '../domain/deterministicRng';
import type { CombatEffectDefinition } from '../../src/types';
import { combatEffectEngine } from '../domain/combatEffectEngine';
import { combatTargetingEngine } from '../domain/combatTargetingEngine';
import { worldEffectEngine } from '../domain/worldEffectEngine';
import { combatSimulationEngine } from '../domain/combatSimulationEngine';
import { combatReplayEngine } from '../domain/combatReplayEngine';
import { combatAnimationService } from '../services/combatAnimationService';
import { combatAssetService } from '../services/combatAssetService';
import { bossPhaseEngine } from '../domain/bossPhaseEngine';
import { combatEnvironmentEngine } from '../domain/combatEnvironmentEngine';
import { mediaAdapterService } from '../services/mediaAdapterService';
import { buildComicScenePrompt, ComicSceneContext } from '../services/comicSceneGenerator';

export const gameRouter = Router();
import { sensoryRouter } from './sensoryRoutes';
import { adaptationRouter } from './adaptationRoutes';
gameRouter.use('/sensory', sensoryRouter);
gameRouter.use('/adaptation', adaptationRouter);


function requireDndTacticalCombat(res: Response, storyId: string): boolean {
	const run = worldRepository.getStoryRun(storyId);
	if (!run && storyId !== 'default_story') {
		res.status(404).json({
			success: false,
			code: 'STORY_RUN_NOT_FOUND',
			errorReason: `StoryRun with ID "${storyId}" was not found.`,
		});
		return false;
	}

	const profile = worldRepository.getRulesProfile(storyId)
		|| rulesProfileEngine.createDefault('FULL_DND');
	if (rulesProfileEngine.allowsDndTacticalCombat(profile)) {
		return true;
	}
	res.status(409).json({
		success: false,
		code: 'DND_TACTICAL_COMBAT_NOT_ALLOWED',
		errorReason: 'The active rules profile does not permit the legacy D&D tactical combat engine.',
		mode: profile.mode,
		requiresCustomRule: true,
	});
	return false;
}

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
function resolveProgressionActor(req: Request, res: Response, storyId: string): string | null {
  const player = worldRepository.getPlayerLifecycle(storyId);
  const playerActorId = player?.actorId || `player_actor_${storyId}`;
  const requested = typeof req.body?.actorId === 'string' && req.body.actorId.trim()
    ? req.body.actorId.trim()
    : undefined;
  if (requested && requested !== playerActorId) {
    res.status(403).json({
      success: false,
      errorReason: 'PLAYER progression commands may only mutate the active player actor.',
      actorId: playerActorId,
    });
    return null;
  }
  return playerActorId;
}


function getPlayerStoryRunProjection(storyId: string): Record<string, unknown> | null {
  const run = worldRepository.getStoryRun(storyId);
  if (!run) return null;

  const { runtimeState: _runtimeState, canonicalEvents: _canonicalEvents, ...publicRun } = run;
  const actorId = worldRepository.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`;

  return {
    ...publicRun,
    knowledge: worldRepository.getAuthorizedKnowledgeFacts(storyId, actorId),
    phase8Projection: worldRepository.getPhase8Projection(storyId, actorId),
  };
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
 * GET /api/game/action/tips
 * Returns player-facing, non-canonical suggestions for the current story scene.
 * Suggestions never mutate game state.
 */
gameRouter.get('/action/tips', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const sceneState = serverMockAuthority.getSanitizedViewState(storyId);
    const tips = await storyActionAdvisor.getTipsForAction(storyId, '', {
      worldTime: sceneState.worldTime
        ? `${sceneState.worldTime.period}, Day ${sceneState.worldTime.cycle}, ${sceneState.worldTime.era}`
        : undefined,
      locationName: sceneState.activeLocation?.name,
      locationRegion: sceneState.activeLocation?.region,
      locationDescription: sceneState.activeLocation?.description,
      openingNarrative: sceneState.openingScene?.narrativeText,
      startingSituation: sceneState.openingScene?.startingSituation,
      activeDialogue: sceneState.activeDialogue
        ? `${sceneState.activeDialogue.speakerName || sceneState.activeDialogue.speakerId || 'Speaker'}: ${sceneState.activeDialogue.text || ''}`
        : undefined,
      recentActions: Array.isArray(sceneState.actionHistory)
        ? sceneState.actionHistory.slice(0, 4).map((action: any) =>
            action.narrativeResponse || action.description || ''
          ).filter(Boolean)
        : [],
    });
    return res.json({
      success: true,
      storyId,
      tips,
    });
  } catch (error: any) {
    console.error('[Story Action Advisor] Scene tip generation failed:', error);
    return res.status(500).json({
      success: false,
      errorReason: error?.message || 'Failed to generate scene tips.',
    });
  }
});

/**
 * POST /api/game/action/advice
 * Preflight advice for a freeform story action.
 * Never mutates canonical state.
 */
gameRouter.post('/action/advice', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const actionText = typeof req.body?.actionText === 'string' ? req.body.actionText.trim() : '';
    if (!actionText) {
      return res.status(400).json({
        success: false,
        errorReason: 'actionText is required.',
      });
    }

    const sceneState = serverMockAuthority.getSanitizedViewState(storyId);
    const advice = await storyActionAdvisor.advise(storyId, actionText, {
      worldTime: sceneState.worldTime
        ? `${sceneState.worldTime.period}, Day ${sceneState.worldTime.cycle}, ${sceneState.worldTime.era}`
        : undefined,
      locationName: sceneState.activeLocation?.name,
      locationRegion: sceneState.activeLocation?.region,
      locationDescription: sceneState.activeLocation?.description,
      openingNarrative: sceneState.openingScene?.narrativeText,
      startingSituation: sceneState.openingScene?.startingSituation,
      activeDialogue: sceneState.activeDialogue
        ? `${sceneState.activeDialogue.speakerName || sceneState.activeDialogue.speakerId || 'Speaker'}: ${sceneState.activeDialogue.text || ''}`
        : undefined,
      recentActions: Array.isArray(sceneState.actionHistory)
        ? sceneState.actionHistory.slice(0, 4).map((action: any) =>
            action.narrativeResponse || action.description || ''
          ).filter(Boolean)
        : [],
    });
    return res.json({
      success: true,
      storyId,
      advice,
    });
  } catch (error: any) {
    console.error('[Story Action Advisor] Advice generation failed:', error);
    return res.status(500).json({
      success: false,
      errorReason: error?.message || 'Failed to evaluate story action advice.',
    });
  }
});

/**
 * POST /api/game/action/accept-advice
 * Canonically commits a previously proposed capability or a directly compatible
 * capability, then executes the original story action through the normal action path.
 */
gameRouter.post('/action/accept-advice', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const actionText = typeof req.body?.actionText === 'string' ? req.body.actionText.trim() : '';
    if (!actionText) {
      return res.status(400).json({
        success: false,
        errorReason: 'actionText is required.',
      });
    }

    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player?.actorId || 'player_actor_' + storyId;
    const proposalId = typeof req.body?.proposalId === 'string' ? req.body.proposalId : undefined;
    const pendingProposal = proposalId ? await storyActionAdvisor.validatePendingProposal(storyId, proposalId) : null;

    if (!pendingProposal || pendingProposal.requestedAction !== actionText) {
      return res.status(409).json({
        success: false,
        code: 'ACTION_ADVICE_STALE',
        errorReason: 'The capability suggestion is no longer available. Please submit the action again.',
      });
    }

    const currentCapabilities = worldRepository
      .getCapabilityEngine(storyId)
      .getEffectiveActorCapabilities(actorId);

    if (
      pendingProposal.requestedCapabilityId &&
      currentCapabilities.some((capability) => capability.id === pendingProposal.requestedCapabilityId && capability.isLearned)
    ) {
      return res.status(409).json({
        success: false,
        code: 'ACTION_ADVICE_STALE',
        errorReason: 'The requested capability was learned or changed before the suggestion was accepted.',
      });
    }

    if (
      pendingProposal.alternative?.id &&
      currentCapabilities.some((capability) => capability.id === pendingProposal.alternative.id && capability.isLearned)
    ) {
      return res.status(409).json({
        success: false,
        code: 'ACTION_ADVICE_STALE',
        errorReason: 'The suggested alternative has already been learned.',
      });
    }

    const recognizedCapabilityId = pendingProposal.requestedCapabilityId;
    const approvedAlternative = pendingProposal.alternative;
    const shouldCreateAlternative = Boolean(approvedAlternative);

    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId(
        'cmd_action_advice',
        storyId,
        actorId,
        actionText,
        proposalId || recognizedCapabilityId || 'auto'
      );

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'INTERACT',
        payload: {
          action: actionText,
          proposalId,
          recognizedCapabilityId,
          approvedAlternativeId: approvedAlternative?.id,
        },
        source: 'PLAYER',
        transactionMode: 'ROLLBACK',
      },
      async (_command) => {
        const capabilityEngine = worldRepository.getCapabilityEngine(storyId);
        let intendedCapabilityId = recognizedCapabilityId;

        if (shouldCreateAlternative) {
          const alternative = approvedAlternative;
          if (!alternative?.id || !alternative?.name) {
            return {
              success: false,
              data: null,
              errorReason: 'Approved capability proposal is malformed.',
              summary: 'Rejected malformed capability proposal.',
            };
          }

          capabilityEngine.registerCapability({
            ...alternative,
            id: alternative.id,
            provenance: alternative.provenance || 'ACTION_ADVISOR_APPROVED',
          });

          capabilityEngine.acquireSkill(actorId, alternative.id, {
            libraryProvenance: {
              libraryStatus: 'APPROVED',
              sourceStoryIds: [storyId],
            },
          });
          worldRepository.addAcquiredCapabilityToCharacter(storyId, alternative);
          worldRepository.persistCapabilityState(storyId);

          intendedCapabilityId = alternative.id;
        } else if (intendedCapabilityId) {
          capabilityEngine.acquireSkill(actorId, intendedCapabilityId, {
            libraryProvenance: {
              libraryStatus: 'APPROVED',
              sourceStoryIds: [storyId],
            },
          });
          const learnedCapability = capabilityEngine.getCapability(intendedCapabilityId);
          if (learnedCapability) {
            worldRepository.addAcquiredCapabilityToCharacter(storyId, learnedCapability);
          }
          worldRepository.persistCapabilityState(storyId);
        }

        const result = await serverMockAuthority.processCustomAction(
          {
            type: 'CUSTOM_ACTION',
            storyId,
            actionText,
            intendedCapabilityId,
          } as any,
          commandId,
          { bypassCapabilityAdvisor: true }
        );

        return {
          success: Boolean(result.success),
          data: result,
          errorReason: result.success ? undefined : result.message,
          summary: result.success
            ? 'Approved story capability action executed.'
            : 'Approved capability action was rejected by canonical authority.',
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }

    storyActionAdvisor.consumePendingProposal(pendingProposal.proposalId);
    return res.json(commandResult.data);
  } catch (error: any) {
    console.error('[Story Action Advisor] Approval failed:', error);
    return res.status(500).json({
      success: false,
      errorReason: error?.message || 'Failed to accept action advice.',
    });
  }
});

/**
 * POST /api/game/action
 * Validates and processes an ActionRequest using server-side mock authority.
 * Returns an ActionResult containing the updated ExternalViewState.
 */
gameRouter.post('/action', async (req: Request, res: Response) => {
  try {
    const actionRequest = req.body as ActionRequest;

    // Capability-advisor bypass is an internal server concern. Ignore any client-supplied
    // bypass flag and let the canonical preflight decide whether a CUSTOM_ACTION is executable.
    if (actionRequest && typeof actionRequest === 'object' && actionRequest.type === 'CUSTOM_ACTION') {
      delete (actionRequest as any).bypassCapabilityAdvisor;
    }

    if (!actionRequest || typeof actionRequest !== 'object' || !actionRequest.type) {
      res.status(400).json({
        error: 'Invalid request payload: ActionRequest must contain a valid type field.',
      });
      return;
    }

    if (!(actionRequest as any).storyId) {
      (actionRequest as any).storyId = resolveStoryId(req, true);
    }

    const storyId = (actionRequest as any).storyId as string;
    let preflightAdvice: any = null;
    if (actionRequest.type === 'CUSTOM_ACTION' && !(actionRequest as any).bypassCapabilityAdvisor) {
      const actionText = String(
        (actionRequest as any).actionText ||
        (actionRequest as any).customText ||
        (actionRequest as any).description ||
        (actionRequest as any).input ||
        ''
      ).trim();

      if (actionText) {
        preflightAdvice = await storyActionAdvisor.advise(storyId, actionText);

        if (
          preflightAdvice.mode === 'SUGGEST_ALTERNATIVE' ||
          preflightAdvice.mode === 'CAPABILITY_SIMULATION'
        ) {
          const blocked = preflightAdvice.mode === 'CAPABILITY_SIMULATION';
          return res.status(409).json({
            success: false,
            code: blocked ? 'CAPABILITY_SIMULATION_BLOCKED' : 'ACTION_ADVICE_CONFIRMATION_REQUIRED',
            errorReason: preflightAdvice.simulation?.explanation ||
              'This action requires an explicit capability decision before execution.',
            advice: preflightAdvice,
          });
        }

        if (preflightAdvice.recognizedCapability?.id) {
          (actionRequest as any).intendedCapabilityId = preflightAdvice.recognizedCapability.id;
        }

        // The request has already been preflighted here. Skip repeating the
        // advisor inside ServerMockAuthority while preserving capability execution.

      }
    }

    const requestedCommandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/action", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);
    const source = 'PLAYER' as const;
    const serverPlayer = worldRepository.getPlayerLifecycle(storyId);
    const actorId = serverPlayer?.actorId || `player_actor_${storyId}`;
    const canonicalActionType =
      actionRequest.type === 'TRAVEL_REQUEST'
        ? 'MOVE'
        : actionRequest.type === 'EQUIP_REQUEST'
          ? 'EQUIP'
          : actionRequest.type === 'UNEQUIP_REQUEST'
            ? 'UNEQUIP'
            : actionRequest.type === 'ADVANCE_TIME'
              ? 'ADVANCE_TIME'
              : 'INTERACT';

    const commandPayload: Record<string, unknown> =
      canonicalActionType === 'MOVE'
        ? {
            targetLocationId: (actionRequest as any).targetLocationId,
            mode: (actionRequest as any).mode,
          }
        : canonicalActionType === 'EQUIP'
          ? {
              itemId: (actionRequest as any).itemId,
              slot: (actionRequest as any).slot,
            }
          : canonicalActionType === 'UNEQUIP'
            ? {
                slot: (actionRequest as any).slot,
              }
            : canonicalActionType === 'ADVANCE_TIME'
              ? {
                  seconds: (actionRequest as any).seconds,
                }
              : {
                  actionRequest,
                };

    const mockStateBefore = serverMockAuthority.exportTransactionalState(storyId);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId: requestedCommandId,
        storyId,
        actorId,
        type: canonicalActionType,
        payload: commandPayload,
        source,
        idempotencyKey: req.body?.idempotencyKey,
        transactionMode: 'ROLLBACK',
      },
      async () => {
        const actionResult =
          actionRequest.type === 'CUSTOM_ACTION'
            ? await serverMockAuthority.processCustomAction(
                actionRequest,
                requestedCommandId,
                { bypassCapabilityAdvisor: true }
              )
            : serverMockAuthority.processAction(actionRequest, requestedCommandId);
        return {
          success: true,
          data: actionResult,
          errorReason: actionResult.success === false ? actionResult.message : undefined,
          summary: `Authoritative ${actionRequest.type} command resolved.`,
        };
      }
    );

    if (!commandResult.success) {
      serverMockAuthority.importTransactionalState(storyId, mockStateBefore);
      return res.status(400).json({
        ...commandResult,
        error: commandResult.errorReason,
      });
    }
    res.json(commandResult.data);
  } catch (error) {
    console.error('Error processing authoritative action request:', error);
    res.status(500).json({
      error: 'Internal server error while resolving action request.',
    });
  }
});

/**
 * GET /api/game/rest/state
 * Returns the authoritative active/last rest state without mutation.
 */
gameRouter.get('/rest/state', (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = (req.query.actorId as string | undefined) || (player ? player.actorId : `player_actor_${storyId}`);
    const restEngine = worldRepository.getRestRecoveryEngine(storyId);
    res.json({
      success: true,
      storyId,
      actorId,
      activeRest: restEngine.getRestState(actorId) || null,
      lastRest: restEngine.getLastRestResult(actorId) || null,
      hitDice: restEngine.getHitDiceState(actorId),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, errorReason: error?.message || 'Failed to retrieve rest state.' });
  }
});

/**
 * POST /api/game/rest
 * Canonical rest/recovery command. All state changes are executed in a staged transaction.
 */
gameRouter.post('/rest', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const storyId = resolveStoryId(req, true);
    const actorId = resolveProgressionActor(req, res, storyId);
    if (!actorId) return;
    const action = req.body?.action as 'BEGIN' | 'ADVANCE' | 'COMPLETE' | 'INTERRUPT' | 'PERFORM';
    const restType = req.body?.restType as 'SHORT_REST' | 'LONG_REST' | undefined;
    const idempotencyKey = typeof req.body?.idempotencyKey === 'string' && req.body.idempotencyKey.trim()
      ? req.body.idempotencyKey.trim()
      : undefined;
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      (idempotencyKey
        ? deterministicId('cmd_rest_idem', storyId, idempotencyKey)
        : deterministicId('cmd_route', storyId, '/rest', req.body || {}));

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'REST',
        payload: {
          action,
          restType,
          seconds: req.body?.seconds,
          hitDiceToSpend: req.body?.hitDiceToSpend,
          interruptionReason: req.body?.interruptionReason,
          interruptAfterSeconds: req.body?.interruptAfterSeconds,
        },
        source: 'PLAYER',
        idempotencyKey,
        transactionMode: 'STAGED',
      },
      async (command, context) => {
        const result = context.repository.getRestRecoveryEngine(storyId).execute({
          storyId,
          actorId,
          action: command.payload.action as any,
          restType: command.payload.restType as any,
          seconds: command.payload.seconds as any,
          hitDiceToSpend: command.payload.hitDiceToSpend as any,
          interruptionReason: command.payload.interruptionReason as any,
          interruptAfterSeconds: command.payload.interruptAfterSeconds as any,
        });
        return {
          success: result.success,
          data: result,
          errorReason: result.errorReason,
          summary: result.success
            ? `Authoritative ${String(action)} ${String(restType || 'rest')} command resolved.`
            : result.errorReason || 'Rest command rejected.',
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }

    res.json({
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, errorReason: error?.message || 'Failed to resolve rest command.' });
  }
});

/**
 * GET /api/game/phase8/projection
 * Player-safe projection for the connected Phase 8.6–8.12 simulation stack.
 */
gameRouter.get('/phase8/projection', (req: Request, res: Response) => {
	try {
		const storyId = resolveStoryId(req, true);
		const actorId = typeof req.query.actorId === 'string' ? req.query.actorId : undefined;
		res.json({
			success: true,
			...(worldRepository.getPhase8Projection(storyId, actorId) as any),
		});
	} catch (error: any) {
		res.status(500).json({
			success: false,
			errorReason: error?.message || 'Failed to project Phase 8 state.',
		});
	}
});

/**
 * GET /api/game/worlds/:worldId/custom-rules
 * Returns authored world laws for the active story's world.
 */
gameRouter.get('/worlds/:worldId/custom-rules', (req: Request, res: Response) => {
	try {
		const storyId = resolveStoryId(req, true);
		const worldId = String(req.params.worldId || '');
		const run = worldRepository.getStoryRun(storyId);
		if (!run || run.worldId !== worldId) {
			return res.status(403).json({
				success: false,
				errorReason: 'The requested world is not the active story world.',
			});
		}
		const engine = new CustomRuleEngine();
		res.json({
			success: true,
			worldId,
			rules: engine.getRules(worldRepository, storyId),
		});
	} catch (error: any) {
		res.status(500).json({ success: false, errorReason: error?.message || 'Failed to load world laws.' });
	}
});

/**
 * POST /api/game/worlds/:worldId/custom-rules/validate
 * Server-side validation only; never persists an invalid rule.
 */
gameRouter.post('/worlds/:worldId/custom-rules/validate', (req: Request, res: Response) => {
	try {
		const storyId = resolveStoryId(req, true);
		const worldId = String(req.params.worldId || '');
		const run = worldRepository.getStoryRun(storyId);
		if (!run || run.worldId !== worldId) {
			return res.status(403).json({ success: false, errorReason: 'The requested world is not the active story world.' });
		}
		const engine = new CustomRuleEngine();
		const validation = engine.validateSingleRule(req.body);
		const existing = engine.getRules(worldRepository, storyId);
		const setValidation = engine.validateRuleSet([...existing.filter((rule: any) => rule.id !== req.body?.id), req.body]);
		res.json({
			success: validation.success && setValidation.success,
			errors: [...validation.errors, ...setValidation.errors.filter((error: string) => !validation.errors.includes(error))],
			warnings: [...validation.warnings, ...setValidation.warnings],
		});
	} catch (error: any) {
		res.status(400).json({ success: false, errorReason: error?.message || 'Rule validation failed.' });
	}
});

/**
 * PUT /api/game/worlds/:worldId/custom-rules/:ruleId
 * Replaces one authored world law atomically after full rule-set validation.
 */
gameRouter.put('/worlds/:worldId/custom-rules/:ruleId', (req: Request, res: Response) => {
	try {
		const storyId = resolveStoryId(req, true);
		const worldId = String(req.params.worldId || '');
		const ruleId = String(req.params.ruleId || '');
		const run = worldRepository.getStoryRun(storyId);
		if (!run || run.worldId !== worldId) {
			return res.status(403).json({ success: false, errorReason: 'The requested world is not the active story world.' });
		}
		if (!req.body || req.body.id !== ruleId) {
			return res.status(400).json({ success: false, errorReason: 'Route ruleId must match rule.id.' });
		}
		const world = worldRepository.getWorldTemplate(worldId);
		if (!world) {
			return res.status(404).json({ success: false, errorReason: 'World template not found.' });
		}
		const engine = new CustomRuleEngine();
		const previousRules = Array.isArray(world.customRules) ? world.customRules : [];
		const nextRules = [...previousRules.filter((rule: any) => rule.id !== ruleId), req.body];
		const validation = engine.validateRuleSet(nextRules);
		if (!validation.success) {
			return res.status(400).json({ success: false, errors: validation.errors, warnings: validation.warnings });
		}
		world.customRules = JSON.parse(JSON.stringify(nextRules));
		world.updatedAt = formatCanonicalTimestamp(worldRepository.getWorldClock(storyId).getTimestamp());
		worldRepository.saveWorldTemplate(world);
		res.json({ success: true, rule: req.body, warnings: validation.warnings });
	} catch (error: any) {
		res.status(400).json({ success: false, errorReason: error?.message || 'Failed to save world law.' });
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
 * Phase 14 Developer Diagnostics
 * Read-only projections over canonical authority. These endpoints never mutate production state.
 */
gameRouter.get('/diagnostics/timeline', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const { DeveloperDiagnosticsService } = await import('../domain/developerDiagnosticsService');
    const storyId = resolveStoryId(req, true);
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    res.json({ success: true, ...DeveloperDiagnosticsService.getTimeline(worldRepository, storyId, limit, offset) });
  } catch (error: any) {
    res.status(500).json({ success: false, errorReason: error?.message || 'Failed to load canonical timeline.' });
  }
});

gameRouter.get('/diagnostics/rules', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const { DeveloperDiagnosticsService } = await import('../domain/developerDiagnosticsService');
    const storyId = resolveStoryId(req, true);
    res.json({ success: true, diagnostics: DeveloperDiagnosticsService.getRuleInspector(worldRepository, storyId) });
  } catch (error: any) {
    res.status(500).json({ success: false, errorReason: error?.message || 'Failed to inspect rules.' });
  }
});

gameRouter.get('/diagnostics/runtime', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const { DeveloperDiagnosticsService } = await import('../domain/developerDiagnosticsService');
    const storyId = resolveStoryId(req, true);
    res.json({ success: true, diagnostics: DeveloperDiagnosticsService.getRuntimeInspector(worldRepository, storyId) });
  } catch (error: any) {
    res.status(500).json({ success: false, errorReason: error?.message || 'Failed to inspect runtime state.' });
  }
});

gameRouter.get('/diagnostics/validation', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const { DeveloperDiagnosticsService } = await import('../domain/developerDiagnosticsService');
    const storyId = resolveStoryId(req, true);
    const [world, character] = [
      DeveloperDiagnosticsService.validateWorld(worldRepository, storyId),
      DeveloperDiagnosticsService.validateCharacter(worldRepository, storyId),
    ];
    res.json({ success: true, world, character });
  } catch (error: any) {
    res.status(500).json({ success: false, errorReason: error?.message || 'Failed to validate canonical state.' });
  }
});

gameRouter.get('/diagnostics/why', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const { DeveloperDiagnosticsService } = await import('../domain/developerDiagnosticsService');
    const storyId = resolveStoryId(req, true);
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : undefined;
    const commandId = typeof req.query.commandId === 'string' ? req.query.commandId : undefined;
    if (!eventId && !commandId) return res.status(400).json({ success: false, errorReason: 'eventId or commandId is required.' });
    const explanation = DeveloperDiagnosticsService.explainEvent(worldRepository, storyId, eventId, commandId);
    if (!explanation) return res.status(404).json({ success: false, errorReason: 'Canonical event not found.' });
    res.json({ success: true, explanation });
  } catch (error: any) {
    res.status(500).json({ success: false, errorReason: error?.message || 'Failed to explain canonical event.' });
  }
});

gameRouter.get('/diagnostics/acceptance', async (_req: Request, res: Response) => {
  try {
    const { PHASE15_ACCEPTANCE_GATES, PHASE15_SCENARIO_MATRIX, getPhase15CoverageSummary } = await import('../domain/phase15AcceptanceMatrix');
    res.json({
      success: true,
      phase: 15,
      status: 'PRE_FINAL_RUNTIME_GATE',
      coverage: getPhase15CoverageSummary(),
      scenarios: PHASE15_SCENARIO_MATRIX,
      gates: PHASE15_ACCEPTANCE_GATES,
      runtimeVerification: 'Deferred until the final full npm test / lint / build gate.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, errorReason: error?.message || 'Failed to load Phase 15 acceptance matrix.' });
  }
});

gameRouter.get('/diagnostics/persistence', async (_req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    res.json({ success: true, persistence: worldRepository.inspectPersistence() });
  } catch (error: any) {
    res.status(500).json({ success: false, errorReason: error?.message || 'Failed to inspect persistence diagnostics.' });
  }
});

/**
 * GET /api/game/persistence/status
 * Phase 13: inspect persistence version/schema state without mutating the save.
 */
gameRouter.get('/persistence/status', (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      persistence: worldRepository.inspectPersistence(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to inspect persistence state.',
    });
  }
});

/**
 * POST /api/game/persistence/migrate
 * Phase 13: transactionally migrate the on-disk save. Source data is backed up first.
 */
gameRouter.post('/persistence/migrate', (_req: Request, res: Response) => {
  try {
    const result = worldRepository.migratePersistence();
    if (!result.valid) {
      return res.status(409).json({ success: false, persistence: result });
    }
    res.json({
      success: true,
      persistence: result,
      restartRequired: Boolean(result.backupPath),
    });
  } catch (error: any) {
    res.status(409).json({
      success: false,
      error: error?.message || 'Persistence migration failed; source data was preserved.',
      persistence: worldRepository.inspectPersistence(),
    });
  }
});

/**
 * POST /api/game/persistence/repair
 * Phase 13: validate and repair persistence with a pre-repair backup.
 */
gameRouter.post('/persistence/repair', (_req: Request, res: Response) => {
  try {
    const result = worldRepository.repairPersistence();
    if (!result.success) {
      return res.status(409).json(result);
    }
    res.json({
      ...result,
      restartRequired: Boolean(result.changed),
    });
  } catch (error: any) {
    res.status(409).json({
      success: false,
      errorReason: error?.message || 'Persistence repair failed; source data was preserved.',
    });
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
 * Canonical Entity Cards.
 */
gameRouter.get('/entities', async (req: Request, res: Response) => {
	try {
		const storyId = resolveStoryId(req, true);
		const cards = worldRepository.getEntityCards(storyId, {
			query: typeof req.query.query === 'string' ? req.query.query : undefined,
			kind: typeof req.query.kind === 'string' ? req.query.kind as any : undefined,
			status: typeof req.query.status === 'string' ? req.query.status as any : undefined,
			includeTemplates: req.query.includeTemplates === 'true',
		});
		const registry = worldRepository.getEntityRegistry(storyId);
		res.json({ success: true, entities: cards.map((card) => registry.projectForViewer(card)) });
	} catch (error: any) {
		res.status(500).json({ success: false, errorReason: error?.message || 'Failed to retrieve entities.' });
	}
});

gameRouter.get('/entities/:entityId', async (req: Request, res: Response) => {
	try {
		const storyId = resolveStoryId(req, true);
		const card = worldRepository.getEntityCard(storyId, String(req.params.entityId));
		if (!card) return res.status(404).json({ success: false, errorReason: 'Entity not found.' });
		res.json({ success: true, entity: worldRepository.getEntityRegistry(storyId).projectForViewer(card) });
	} catch (error: any) {
		res.status(500).json({ success: false, errorReason: error?.message || 'Failed to retrieve entity.' });
	}
});

gameRouter.post('/entities/generate', async (req: Request, res: Response) => {
	try {
		const storyId = resolveStoryId(req, true);
		const concept = String(req.body?.concept || '').trim();
		if (!concept) return res.status(400).json({ success: false, errorReason: 'concept is required.' });
		const proposal = await entityCardService.generate({
			storyId,
			concept,
			name: typeof req.body?.name === 'string' ? req.body.name : undefined,
			kind: typeof req.body?.kind === 'string' ? req.body.kind : undefined,
			worldId: typeof req.body?.worldId === 'string' ? req.body.worldId : undefined,
			allowDeterministicFallback: req.body?.allowDeterministicFallback === true,
		});
		const registry = worldRepository.getEntityRegistry(storyId);
		let entity;
		let template;
		if (req.body?.saveAsTemplate === true) {
			template = registry.createTemplate(proposal.card);
			entity = req.body?.instantiate === true ? registry.instantiateTemplate(template.id, { name: proposal.card.name }) : undefined;
		} else if (req.body?.templateId) {
			entity = registry.instantiateTemplate(String(req.body.templateId), { name: proposal.card.name });
		} else {
			entity = registry.upsert(proposal.card);
		}
		res.json({
			success: true,
			generationSource: proposal.generationSource,
			template: template ? registry.projectForViewer(template) : undefined,
			entity: entity ? registry.projectForViewer(entity) : undefined,
		});
	} catch (error: any) {
		res.status(503).json({ success: false, code: 'AI_UNAVAILABLE', errorReason: error?.message || 'Entity generation unavailable.' });
	}
});

gameRouter.post('/entities/:entityId/clone', async (req: Request, res: Response) => {
	try {
		const storyId = resolveStoryId(req, true);
		const card = worldRepository.cloneEntityCard(storyId, String(req.params.entityId), req.body?.overrides || {});
		res.json({ success: true, entity: worldRepository.getEntityRegistry(storyId).projectForViewer(card) });
	} catch (error: any) {
		res.status(400).json({ success: false, errorReason: error?.message || 'Failed to clone entity.' });
	}
});

gameRouter.post('/entities/:entityId/status', async (req: Request, res: Response) => {
	try {
		const storyId = resolveStoryId(req, true);
		const status = String(req.body?.status || '').toUpperCase();
		if (!['ACTIVE','DORMANT','ARCHIVED','DEAD','DESTROYED'].includes(status)) return res.status(400).json({ success: false, errorReason: 'Invalid entity status.' });
		const card = worldRepository.setEntityLifecycleStatus(storyId, String(req.params.entityId), status);
		res.json({ success: true, entity: worldRepository.getEntityRegistry(storyId).projectForViewer(card) });
	} catch (error: any) {
		res.status(400).json({ success: false, errorReason: error?.message || 'Failed to update entity status.' });
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
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/inventory/equip", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'EQUIP',
        payload: { itemId, slot },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const invEngine = context.repository.getInventoryEngine(storyId);
        const result = invEngine.equipItem(actorId, itemId, slot);
        if (!result.success) {
          return { success: false, errorReason: result.errorReason || 'Equipment request rejected.' };
        }
        const items = invEngine.getActorInventory(actorId);
        const paperDoll = invEngine.getActorPaperDoll(actorId);
        return {
          success: true,
          data: { success: true, result, items, paperDoll },
          summary: `Equipped item ${itemId} in ${slot}.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }
    res.json({
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
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
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/inventory/unequip", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'UNEQUIP',
        payload: { slot },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const invEngine = context.repository.getInventoryEngine(storyId);
        const result = invEngine.unequipItem(actorId, slot);
        if (!result.success) {
          return { success: false, errorReason: result.errorReason || 'Unequip request rejected.' };
        }
        const items = invEngine.getActorInventory(actorId);
        const paperDoll = invEngine.getActorPaperDoll(actorId);
        return {
          success: true,
          data: { success: true, result, items, paperDoll },
          summary: `Unequipped slot ${slot}.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }
    res.json({
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
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
    const storyId = resolveStoryId(req);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player ? player.actorId : `player_actor_${storyId}`;
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/inventory/craft", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'USE_ITEM',
        payload: { recipeId },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const transactionRepo = context.repository;
        const invEngine = transactionRepo.getInventoryEngine(storyId);
        const result = invEngine.craftItem(actorId, recipeId);
        if (!result.success) {
          return { success: false, errorReason: result.errorReason || 'Crafting rejected.' };
        }

        const clock = transactionRepo.getWorldClock(storyId);
        if (result.craftingTimeSeconds) clock.advanceSeconds(result.craftingTimeSeconds);

        const chronicle = transactionRepo.getHistoricalChronicleEngine(storyId);
        const ts = clock.getTimestamp();
        chronicle.recordEvidence({
          id: `ev_craft_${recipeId}_${ts.totalElapsedSeconds}_${chronicle.getChronicleEntries().length}`,
          category: 'SACRED_OR_HISTORIC',
          timestamp: ts,
          primarySubjectId: actorId,
          secondarySubjectId: result.producedItem?.id || recipeId,
          locationId: transactionRepo.getPlayerLifecycle(storyId)?.locationId || 'loc_whispering_orrery',
          summary: `Crafted ${result.producedItem?.name || 'an item'}`,
          details: `Forged ${result.producedItem?.name || 'an artifact'} via recipe ${recipeId}.`,
          sourceEventId: `evt_craft_${recipeId}_${ts.totalElapsedSeconds}`,
          provenance: 'system_simulation',
          visibility: 'PUBLIC',
          metadata: { recipeId, producedDefId: result.producedItem?.defId },
        });

        return {
          success: true,
          data: {
            ...result,
            items: invEngine.getActorInventory(actorId),
            paperDoll: invEngine.getActorPaperDoll(actorId),
          },
          summary: `Crafted ${result.producedItem?.name || recipeId}.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }
    res.json({
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
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
    const storyId = resolveStoryId(req);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player ? player.actorId : `player_actor_${storyId}`;
    // Auth validation: Both source and target must be authorized.
    if (!player?.locationId) {
       return res.status(403).json({ success: false, errorReason: 'Player location unknown.' });
    }

    const isAuthorized = (ownerId: string): boolean => {
      if (ownerId === actorId) return true;
      if (ownerId === player.locationId) return true;

      const npcLife = worldRepository.getNpcLifecycle(storyId, ownerId);
      if (npcLife && npcLife.isDead && npcLife.locationId === player.locationId) return true;

      const combatEngine = worldRepository.getCombatEngine(storyId);
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

    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/inventory/transfer", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'USE_ITEM',
        payload: { itemId, sourceOwnerId, targetOwnerId, targetContainerType, quantity },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const transactionRepo = context.repository;
        const invEngine = transactionRepo.getInventoryEngine(storyId);
        const result = invEngine.transferItem(itemId, sourceOwnerId, targetOwnerId, targetContainerType, quantity);
        if (!result.success) {
          return { success: false, errorReason: result.errorReason || 'Item transfer rejected.' };
        }

        const chronicle = transactionRepo.getHistoricalChronicleEngine(storyId);
        const clock = transactionRepo.getWorldClock(storyId);
        const ts = clock.getTimestamp();
        chronicle.recordEvidence({
          id: `ev_transfer_${itemId}_${ts.totalElapsedSeconds}_${chronicle.getChronicleEntries().length}`,
          category: 'SACRED_OR_HISTORIC',
          timestamp: ts,
          primarySubjectId: actorId,
          secondarySubjectId: result.transferredItem?.id || itemId,
          locationId: transactionRepo.getPlayerLifecycle(storyId)?.locationId || 'loc_whispering_orrery',
          summary: `Transferred ${result.transferredItem?.name || 'an item'}`,
          details: `Moved ${result.transferredItem?.name || 'an item'} from ${sourceOwnerId} to ${targetOwnerId}.`,
          sourceEventId: `evt_transfer_${itemId}_${ts.totalElapsedSeconds}`,
          provenance: 'system_simulation',
          visibility: 'PUBLIC',
          metadata: { itemId, sourceOwnerId, targetOwnerId },
        });

        return {
          success: true,
          data: { ...result, items: invEngine.getActorInventory(actorId) },
          summary: `Transferred item ${itemId}.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }
    res.json({
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
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
    const storyId = resolveStoryId(req);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player ? player.actorId : `player_actor_${storyId}`;
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/inventory/repair", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'USE_ITEM',
        payload: { itemId, repairAmount },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const invEngine = context.repository.getInventoryEngine(storyId);
        const item = invEngine.getItemInstance(itemId);
        if (!item) return { success: false, errorReason: `Item ${itemId} not found.` };
        if (item.ownerEntityId !== actorId) return { success: false, errorReason: 'Cannot repair an item owned by another actor.' };

        const amount = typeof repairAmount === 'number' && repairAmount > 0 ? repairAmount : 50;
        const result = invEngine.repairItem(itemId, amount);
        return {
          success: true,
          data: {
            success: true,
            ...result,
            item: invEngine.getItemInstance(itemId),
            items: invEngine.getActorInventory(actorId),
            paperDoll: invEngine.getActorPaperDoll(actorId),
          },
          summary: `Repaired item ${itemId}.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }
    res.json({
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
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
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/inventory/degrade", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'USE_ITEM',
        payload: { itemId, wearAmount },
        source: 'SYSTEM',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const invEngine = context.repository.getInventoryEngine(storyId);
        const item = invEngine.getItemInstance(itemId);
        if (!item) return { success: false, errorReason: `Item ${itemId} not found.` };
        const amount = typeof wearAmount === 'number' && wearAmount > 0 ? wearAmount : 20;
        const result = invEngine.degradeDurability(itemId, amount);
        return {
          success: true,
          data: {
            success: true,
            ...result,
            item: invEngine.getItemInstance(itemId),
            items: invEngine.getActorInventory(actorId),
            paperDoll: invEngine.getActorPaperDoll(actorId),
          },
          summary: `Degraded durability for item ${itemId}.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }
    res.json({
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to degrade item durability.' });
  }
});

/**
 * GET /api/game/inventory/modifiers
 * Returns deterministic resolved equipment modifiers for the active player.
 */
gameRouter.get('/inventory/modifiers', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const storyId = resolveStoryId(req);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player ? player.actorId : `player_actor_${storyId}`;
    const inventory = worldRepository.getInventoryEngine(storyId);
    const progression = worldRepository.getCharacterProgressionEngine(storyId);
    const resolution = progression.resolveModifiers(
      actorId,
      worldRepository.getRulesProfile(storyId),
      inventory.getEquipmentModifiers(actorId)
    );
    res.json({ actorId, modifiers: resolution.modifiers, sourceTrace: resolution.sourceTrace });
  } catch (error) {
    res.status(500).json({ error: 'Failed to resolve equipment modifiers.' });
  }
});

/**
 * POST /api/game/inventory/consume
 * Consumes an item using only server-authored quantity/charge/destruction rules.
 */
gameRouter.post('/inventory/consume', async (req: Request, res: Response) => {
  try {
    const { itemId, amount } = req.body;
    if (!itemId || typeof itemId !== 'string') {
      return res.status(400).json({ success: false, errorReason: 'Missing itemId in request body.' });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const storyId = resolveStoryId(req);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player ? player.actorId : `player_actor_${storyId}`;
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/inventory/consume", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'USE_ITEM',
        payload: { itemId, amount },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (command, context) => {
        const transactionRepo = context.repository;
        const invEngine = transactionRepo.getInventoryEngine(storyId);
        const before = invEngine.getItemInstance(itemId);
        if (!before || before.ownerEntityId !== actorId) {
          return { success: false, errorReason: 'Item is not owned by the active player.' };
        }

        const result = invEngine.consumeItem(actorId, itemId, typeof amount === 'number' ? amount : 1);
        if (!result.success) {
          return { success: false, errorReason: result.errorReason || 'Item consumption rejected.' };
        }

        return {
          success: true,
          data: {
            ...result,
            itemBefore: before,
            items: invEngine.getActorInventory(actorId),
            paperDoll: invEngine.getActorPaperDoll(actorId),
          },
          summary: `Consumed item ${itemId}.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(commandResult.statusCode || 400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }
    res.json({
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to consume item.' });
  }
});

/**
 * POST /api/game/inventory/destroy
 * Permanently destroys an owned item through the canonical transaction boundary.
 */
gameRouter.post('/inventory/destroy', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.body;
    if (!itemId || typeof itemId !== 'string') {
      return res.status(400).json({ success: false, errorReason: 'Missing itemId in request body.' });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const storyId = resolveStoryId(req);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player ? player.actorId : `player_actor_${storyId}`;
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/inventory/destroy", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'USE_ITEM',
        payload: { itemId, destroy: true },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const transactionRepo = context.repository;
        const invEngine = transactionRepo.getInventoryEngine(storyId);
        const item = invEngine.getItemInstance(itemId);
        if (!item || item.ownerEntityId !== actorId) {
          return { success: false, errorReason: 'Item is not owned by the active player.' };
        }
        const result = invEngine.destroyItem(itemId);
        if (!result.success) return { success: false, errorReason: result.errorReason || 'Item destruction rejected.' };
        return {
          success: true,
          data: {
            ...result,
            items: invEngine.getActorInventory(actorId),
            paperDoll: invEngine.getActorPaperDoll(actorId),
          },
          summary: `Destroyed item ${itemId}.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(commandResult.statusCode || 400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }
    res.json({
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to destroy item.' });
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
		const actorId = player?.actorId || `player_actor_${storyId}`;
		const capEngine = worldRepository.getCapabilityEngine(storyId);
		const invEngine = worldRepository.getInventoryEngine(storyId);
		const powerState = capEngine.getPowerState(actorId);
		const capabilities = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
		const skillInstances = capEngine.getAllSkillInstances(actorId);
		const actorSkillIds = new Set(skillInstances.map((skill) => skill.capabilityId));
		const graph = capEngine
			.getCapabilityGraph()
			.filter((node) =>
				actorSkillIds.has(node.capabilityId) ||
				node.derivedSkills.some((id) => actorSkillIds.has(id))
			);
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
    const activeActorId = player?.actorId || `player_actor_${storyId}`;
    if (reqActorId && reqActorId !== activeActorId) {
      return res.status(403).json({
        approved: false,
        rejectionReason: 'Player capability adjudication may only target the active player actor.',
      });
    }
    const actorId = activeActorId;
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

    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/capabilities/adjudicate", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'CAST',
        payload: {
          intendedCapabilityId,
          requestedScale,
          actionDescription,
          environment,
          actorConditions,
          roleOrBackground,
          modifiers,
        },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const transactionRepo = context.repository;
        const transactionCapEngine = transactionRepo.getCapabilityEngine(storyId);
        const transactionInvEngine = transactionRepo.getInventoryEngine(storyId);
        const transactionPlayer = transactionRepo.getPlayerLifecycle(storyId);
        const effectiveCapsAtCommit = transactionCapEngine.getEffectiveActorCapabilities(actorId, transactionInvEngine);
        if (!effectiveCapsAtCommit.some((c) => c.id === intendedCapabilityId)) {
          return {
            success: false,
            errorReason: `Actor '${actorId}' does not possess capability '${intendedCapabilityId}' at commit time.`,
          };
        }
        const result = transactionCapEngine.adjudicate({
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
          const cap = transactionCapEngine.getCapability(intendedCapabilityId);
          const isWorldScale = requestedScale === 'WorldScale' || cap?.powerTier === 'WorldScale';
          const chronicle = transactionRepo.getHistoricalChronicleEngine(storyId);
          const clock = transactionRepo.getWorldClock(storyId);
          const ts = clock.getTimestamp();
          chronicle.recordEvidence({
            id: `ev_cap_${intendedCapabilityId}_${ts.totalElapsedSeconds}_${chronicle.getChronicleEntries().length}`,
            category: isWorldScale ? 'WORLD_ANOMALY' : 'SACRED_OR_HISTORIC',
            timestamp: ts,
            primarySubjectId: actorId,
            secondarySubjectId: intendedCapabilityId,
            locationId: transactionPlayer?.locationId || 'loc_whispering_orrery',
            summary: `Invoked ${cap?.name || intendedCapabilityId}`,
            details: result.emittedObservation.sensoryDescription || result.narrativeDirective,
            sourceEventId: `evt_cap_${intendedCapabilityId}_${ts.totalElapsedSeconds}`,
            provenance: 'deterministic_adjudication',
            visibility: 'PUBLIC',
            metadata: { intendedCapabilityId, hpDelta: result.hpDelta, strainDelta: result.strainDelta },
          });
        }

        return {
          success: true,
          data: {
            result,
            powerState: capEngine.getPowerState(actorId),
            capabilities: capEngine.getEffectiveActorCapabilities(actorId, transactionInvEngine),
            skillInstances: capEngine.getAllSkillInstances(actorId),
            graph: capEngine.getCapabilityGraph()
              .filter((node) => capEngine.getSkillInstance(actorId, node.capabilityId) || node.derivedSkills.some((id) => Boolean(capEngine.getSkillInstance(actorId, id)))),
          },
          summary: result.approved
            ? `Capability ${intendedCapabilityId} adjudicated and committed.`
            : `Capability ${intendedCapabilityId} rejected without state mutation.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        approved: false,
        rejectionReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }

    res.json({
      ...(commandResult.data as any)?.result,
      powerState: (commandResult.data as any)?.powerState,
      capabilities: (commandResult.data as any)?.capabilities,
      skillInstances: (commandResult.data as any)?.skillInstances,
      graph: (commandResult.data as any)?.graph,
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to adjudicate capability.' });
  }
});

/**
 * POST /api/game/capabilities/acquire
 * Acquires a new skill for an actor with an isolated, mutable SkillInstance.
 */

/**
 * Phase 8 progression state.
 * Read-only projection; all mutations use the canonical PROGRESSION command below.
 */
gameRouter.get('/worlds/runs/:storyId/progression', async (req: Request, res: Response) => {
  try {
    const storyId = String(req.params.storyId || '');
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player?.actorId || `player_actor_${storyId}`;
    const engine = worldRepository.getCharacterProgressionEngine(storyId);
    const rulesProfile = worldRepository.getRulesProfile(storyId);
    res.json({
      success: true,
      storyId,
      actorId,
      state: engine.getState(actorId) || null,
      modules: engine.getAllModules(),
      unlockedFeatures: engine.getUnlockedFeatures(actorId),
      triggeredAbilities: engine.getTriggeredAbilities(actorId),
      modifiers: engine.resolveModifiers(actorId, rulesProfile),
      genesisDivergence: worldRepository.getStoryRun(storyId)?.protagonist
        ? engine.detectGenesisDivergence(actorId, worldRepository.getStoryRun(storyId).protagonist)
        : null,
      rulesProfile,
    });
  } catch (error: any) {
    res.status(404).json({ success: false, errorReason: error?.message || 'Progression state unavailable.' });
  }
});

/**
 * Phase 8 canonical progression command.
 * Operations: module selection/enablement, feat acquisition, level-up,
 * triggered abilities, custom module registration, and legacy capability progression.
 */
gameRouter.post('/worlds/runs/:storyId/progression', async (req: Request, res: Response) => {
  try {
    const storyId = String(req.params.storyId || '');
    const player = worldRepository.getPlayerLifecycle(storyId);
    const serverPlayerActorId = player?.actorId || `player_actor_${storyId}`;
    if (req.body?.actorId && req.body.actorId !== serverPlayerActorId) {
      return res.status(403).json({
        success: false,
        errorReason: `Unauthorized: progression commands are bound to player actor '${serverPlayerActorId}'.`,
      });
    }
    const actorId = serverPlayerActorId;
    const operation = String(req.body?.operation || '');
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_progression', storyId, actorId, operation, req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute<any, any>(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'PROGRESSION',
        payload: {
          operation,
          moduleType: req.body?.moduleType,
          moduleId: req.body?.moduleId,
          abilityId: req.body?.abilityId,
          targetId: req.body?.targetId,
          requestedScale: req.body?.requestedScale,
          initialLevel: req.body?.initialLevel,
          initialXp: req.body?.initialXp,
          evolutionPoints: req.body?.evolutionPoints,
          lineage: req.body?.lineage,
          xpAmount: req.body?.xpAmount,
          reason: req.body?.reason,
          targetLevel: req.body?.targetLevel,
          fromCapabilityId: req.body?.fromCapabilityId,
          toCapabilityId: req.body?.toCapabilityId,
          targetDefinition: req.body?.targetDefinition,
          module: req.body?.module,
        },
        source: 'PLAYER',
        idempotencyKey: req.body?.idempotencyKey,
        transactionMode: 'STAGED',
      },
      async (command, context) => {
        const progression = context.repository.getCharacterProgressionEngine(storyId);
        const profile = context.repository.getRulesProfile(storyId);
        const profileConfig = progression.getEffectiveConfigForRulesProfile(profile);
        const payload = command.payload as any;

        if (operation === 'REGISTER_MODULE') {
          if (!profileConfig.allowCharacterProgression || !profileConfig.allowCustomModules || profile?.mode === 'FULL_DND') {
            return { success: false, errorReason: 'Custom progression modules are not enabled by the active rules profile.' };
          }
          if (!payload.module || typeof payload.module !== 'object') {
            return { success: false, errorReason: 'REGISTER_MODULE requires a module definition.' };
          }
          const module = JSON.parse(JSON.stringify(payload.module));
          module.provenance = module.provenance || (profile?.mode === 'CUSTOM_HOMEBREW_DND' ? 'CUSTOM_HOMEBREW' : 'CHARACTER_GENESIS');
          progression.registerModule(module);
          return { success: true, data: { module: progression.getModule(module.id) }, summary: `Progression module '${module.id}' registered.` };
        }

        if (['SELECT_CLASS', 'SELECT_SUBCLASS', 'SELECT_SPECIES'].includes(operation)) {
          const result = progression.selectModule(actorId, operation === 'SELECT_CLASS' ? 'CLASS' : operation === 'SELECT_SUBCLASS' ? 'SUBCLASS' : 'SPECIES', payload.moduleId, command.commandId, profile);
          return { success: true, data: { state: result, modifiers: progression.resolveModifiers(actorId, profile) }, summary: `Progression ${operation} committed.` };
        }
        if (operation === 'ACQUIRE_FEAT') {
          const result = progression.acquireFeat(actorId, payload.moduleId, command.commandId, profile);
          return { success: true, data: { state: result, modifiers: progression.resolveModifiers(actorId, profile) }, summary: 'Feat acquisition committed.' };
        }
        if (operation === 'LEVEL_UP') {
          const result = progression.levelUp(actorId, command.commandId, profile);
          return { success: true, data: { state: result, modifiers: progression.resolveModifiers(actorId, profile) }, summary: `Actor advanced to level ${result.currentLevel}.` };
        }
        if (operation === 'ENABLE_MODULE' || operation === 'DISABLE_MODULE') {
          const result = progression.setModuleEnabled(actorId, payload.moduleId, operation === 'ENABLE_MODULE', command.commandId, profile);
          return { success: true, data: { state: result, modifiers: progression.resolveModifiers(actorId, profile) }, summary: `Progression module ${operation === 'ENABLE_MODULE' ? 'enabled' : 'disabled'}.` };
        }
        if (operation === 'TRIGGER_ABILITY') {
          const result = progression.consumeTriggeredAbility(actorId, payload.abilityId, command.commandId);
          if (result.ability.capabilityId || result.ability.capabilityDefinition) {
            const { abilityService } = await import('../services/abilityService');
            const applied = abilityService.resolveAbilityApplication(
              storyId,
              result.ability.capabilityId || result.ability.id,
              String(payload.targetId || actorId),
              req.body,
              context.repository
            );
            if (!applied.success) return { success: false, errorReason: applied.errorReason || 'Triggered ability effect rejected.' };
            return { success: true, data: { ...result, activeEffect: applied.activeEffect }, summary: `Triggered progression ability '${result.ability.name}'.` };
          }
          return { success: true, data: result, summary: `Triggered progression ability '${result.ability.name}'.` };
        }

        const capEngine = context.repository.getCapabilityEngine(storyId);
        const policy = capEngine.getProgressionPolicy();
        if (operation === 'ACQUIRE_CAPABILITY') {
          const instance = capEngine.acquireSkill(actorId, payload.moduleId, {
            initialLevel: payload.initialLevel,
            initialXp: payload.initialXp,
            evolutionPoints: payload.evolutionPoints,
            lineage: payload.lineage,
            worldRules: policy,
          });
          return { success: true, data: { instance }, summary: 'Capability acquisition committed.' };
        }
        if (operation === 'AWARD_XP') {
          if (typeof payload.xpAmount !== 'number' || !Number.isFinite(payload.xpAmount) || payload.xpAmount < 0) return { success: false, errorReason: 'xpAmount must be a non-negative finite number.' };
          const result = capEngine.awardSkillXp(actorId, payload.moduleId, payload.xpAmount, policy, payload.reason || 'Canonical progression award');
          return { success: true, data: result, summary: 'Capability XP award committed.' };
        }
        if (operation === 'EVOLVE_CAPABILITY') {
          if (payload.targetDefinition && !capEngine.getCapability(payload.toCapabilityId)) capEngine.registerCapability(payload.targetDefinition);
          const instance = capEngine.evolveSkill(actorId, payload.fromCapabilityId, payload.toCapabilityId, policy, payload.reason || 'Canonical capability evolution');
          return { success: true, data: { instance }, summary: 'Capability evolution committed.' };
        }
        if (operation === 'DOWNGRADE_CAPABILITY') {
          const instance = capEngine.downgradeSkill(actorId, payload.moduleId, payload.targetLevel, payload.reason || 'Canonical capability downgrade', policy);
          return { success: true, data: { instance }, summary: 'Capability downgrade committed.' };
        }
        if (operation === 'RELEARN_CAPABILITY') {
          const instance = capEngine.relearnSkill(actorId, payload.moduleId, payload.reason || 'Canonical capability relearn', policy);
          return { success: true, data: { instance }, summary: 'Capability relearn committed.' };
        }

        return { success: false, errorReason: `Unsupported progression operation '${operation}'.` };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }
    return res.json({
      success: true,
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, errorReason: error?.message || 'Progression command failed.' });
  }
});

// Legacy capability mutation routes retain their historical response shapes while delegating
// all mutations through the canonical Phase 8 PROGRESSION command.
gameRouter.post('/capabilities/acquire', async (req: Request, res: Response) => {
  req.body = { ...(req.body || {}), operation: 'ACQUIRE_CAPABILITY', moduleId: req.body?.capabilityId };
  const storyId = String(req.body?.storyId || resolveStoryId(req, true) || '');
  req.url = `/worlds/runs/${storyId}/progression`;
  req.params.storyId = storyId;
  const actorId = resolveProgressionActor(req, res, storyId);
  if (!actorId) return;
  try {
    const capEngine = worldRepository.getCapabilityEngine(storyId);
    const commandId = (req.headers['x-command-id'] as string | undefined) || (req.body?.commandId as string | undefined) || deterministicId('cmd_cap_acquire', storyId, actorId, req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);
    const commandResult = await canonicalCommandEngine.execute(worldRepository, {
      commandId, storyId, actorId, type: 'PROGRESSION',
      payload: {
        operation: 'ACQUIRE_CAPABILITY',
        moduleId: req.body?.capabilityId,
        initialLevel: req.body?.initialLevel,
        initialXp: req.body?.initialXp,
        evolutionPoints: req.body?.evolutionPoints,
        lineage: req.body?.lineage,
      },
      source: 'PLAYER', transactionMode: 'STAGED',
    }, async (command, context) => {
      const e = context.repository.getCapabilityEngine(storyId);
      const instance = e.acquireSkill(actorId, command.payload.moduleId as string, { initialLevel: command.payload.initialLevel as number, initialXp: command.payload.initialXp as number, evolutionPoints: command.payload.evolutionPoints as number, lineage: command.payload.lineage as string[], worldRules: e.getProgressionPolicy() });
      return { success: true, data: { instance }, summary: 'Capability acquisition committed.' };
    });
    if (!commandResult.success) return res.status(400).json({ success: false, errorReason: commandResult.errorReason, rolledBack: commandResult.rolledBack, commandId: commandResult.commandId });
    return res.json({ success: true, ...(commandResult.data as any), commandId: commandResult.commandId, canonicalEvent: commandResult.event });
  } catch (error: any) {
    return res.status(400).json({ success: false, errorReason: error?.message || 'Failed to acquire skill.' });
  }
});

gameRouter.post('/capabilities/award-xp', async (req: Request, res: Response) => {
  const storyId = resolveStoryId(req, true);
  const actorId = resolveProgressionActor(req, res, storyId);
  if (!actorId) return;
  try {
    const commandId = (req.headers['x-command-id'] as string | undefined) || (req.body?.commandId as string | undefined) || deterministicId('cmd_cap_xp', storyId, actorId, req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);
    const result = await canonicalCommandEngine.execute(worldRepository, {
      commandId, storyId, actorId, type: 'PROGRESSION',
      payload: { operation: 'AWARD_XP', moduleId: req.body?.capabilityId, xpAmount: req.body?.xpAmount, reason: req.body?.reason },
      source: 'PLAYER', transactionMode: 'STAGED',
    }, async (command, context) => {
      const e = context.repository.getCapabilityEngine(storyId);
      const policy = e.getProgressionPolicy();
      const value = command.payload.xpAmount as number;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return { success: false, errorReason: 'xpAmount must be a non-negative finite number.' };
      const valueResult = e.awardSkillXp(actorId, command.payload.moduleId as string, value, policy, command.payload.reason as string || 'Canonical progression award');
      return { success: true, data: valueResult, summary: 'Capability XP award committed.' };
    });
    if (!result.success) return res.status(400).json({ success: false, errorReason: result.errorReason, rolledBack: result.rolledBack, commandId: result.commandId });
    return res.json({ success: true, ...(result.data as any), commandId: result.commandId, canonicalEvent: result.event });
  } catch (error: any) {
    return res.status(400).json({ success: false, errorReason: error?.message || 'Failed to award skill XP.' });
  }
});

gameRouter.post('/capabilities/evolve', async (req: Request, res: Response) => {
  const storyId = resolveStoryId(req, true);
  const actorId = resolveProgressionActor(req, res, storyId);
  if (!actorId) return;
  try {
    const commandId = (req.headers['x-command-id'] as string | undefined) || (req.body?.commandId as string | undefined) || deterministicId('cmd_cap_evolve', storyId, actorId, req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);
    const result = await canonicalCommandEngine.execute(worldRepository, {
      commandId, storyId, actorId, type: 'PROGRESSION',
      payload: { operation: 'EVOLVE_CAPABILITY', moduleId: req.body?.fromCapabilityId, fromCapabilityId: req.body?.fromCapabilityId, toCapabilityId: req.body?.toCapabilityId, targetDefinition: req.body?.targetDefinition, reason: req.body?.reason },
      source: 'PLAYER', transactionMode: 'STAGED',
    }, async (command, context) => {
      const e = context.repository.getCapabilityEngine(storyId);
      if (command.payload.targetDefinition && !e.getCapability(command.payload.toCapabilityId as string)) e.registerCapability(command.payload.targetDefinition as any);
      const instance = e.evolveSkill(actorId, command.payload.fromCapabilityId as string, command.payload.toCapabilityId as string, e.getProgressionPolicy(), command.payload.reason as string || 'Canonical capability evolution');
      return { success: true, data: { instance }, summary: 'Capability evolution committed.' };
    });
    if (!result.success) return res.status(400).json({ success: false, errorReason: result.errorReason, rolledBack: result.rolledBack, commandId: result.commandId });
    return res.json({ success: true, ...(result.data as any), commandId: result.commandId, canonicalEvent: result.event });
  } catch (error: any) {
    return res.status(400).json({ success: false, errorReason: error?.message || 'Failed to evolve skill.' });
  }
});

gameRouter.post('/capabilities/downgrade', async (req: Request, res: Response) => {
  const storyId = resolveStoryId(req, true);
  const actorId = resolveProgressionActor(req, res, storyId);
  if (!actorId) return;
  try {
    const commandId = (req.headers['x-command-id'] as string | undefined) || (req.body?.commandId as string | undefined) || deterministicId('cmd_cap_down', storyId, actorId, req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);
    const result = await canonicalCommandEngine.execute(worldRepository, {
      commandId, storyId, actorId, type: 'PROGRESSION',
      payload: { operation: 'DOWNGRADE_CAPABILITY', moduleId: req.body?.capabilityId, targetLevel: req.body?.targetLevel, reason: req.body?.reason },
      source: 'PLAYER', transactionMode: 'STAGED',
    }, async (command, context) => {
      const e = context.repository.getCapabilityEngine(storyId);
      const targetLevel = Number(command.payload.targetLevel);
      if (!Number.isFinite(targetLevel)) return { success: false, errorReason: 'targetLevel must be numeric.' };
      const instance = e.downgradeSkill(actorId, command.payload.moduleId as string, targetLevel, command.payload.reason as string || 'Canonical capability downgrade', e.getProgressionPolicy());
      return { success: true, data: { instance }, summary: 'Capability downgrade committed.' };
    });
    if (!result.success) return res.status(400).json({ success: false, errorReason: result.errorReason, rolledBack: result.rolledBack, commandId: result.commandId });
    return res.json({ success: true, ...(result.data as any), commandId: result.commandId, canonicalEvent: result.event });
  } catch (error: any) {
    return res.status(400).json({ success: false, errorReason: error?.message || 'Failed to downgrade skill.' });
  }
});

gameRouter.post('/capabilities/relearn', async (req: Request, res: Response) => {
  const storyId = resolveStoryId(req, true);
  const actorId = resolveProgressionActor(req, res, storyId);
  if (!actorId) return;
  try {
    const commandId = (req.headers['x-command-id'] as string | undefined) || (req.body?.commandId as string | undefined) || deterministicId('cmd_cap_relearn', storyId, actorId, req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);
    const result = await canonicalCommandEngine.execute(worldRepository, {
      commandId, storyId, actorId, type: 'PROGRESSION',
      payload: { operation: 'RELEARN_CAPABILITY', moduleId: req.body?.capabilityId, reason: req.body?.reason },
      source: 'PLAYER', transactionMode: 'STAGED',
    }, async (command, context) => {
      const e = context.repository.getCapabilityEngine(storyId);
      const instance = e.relearnSkill(actorId, command.payload.moduleId as string, command.payload.reason as string || 'Canonical capability relearn', e.getProgressionPolicy());
      return { success: true, data: { instance }, summary: 'Capability relearn committed.' };
    });
    if (!result.success) return res.status(400).json({ success: false, errorReason: result.errorReason, rolledBack: result.rolledBack, commandId: result.commandId });
    return res.json({ success: true, ...(result.data as any), commandId: result.commandId, canonicalEvent: result.event });
  } catch (error: any) {
    return res.status(400).json({ success: false, errorReason: error?.message || 'Failed to relearn skill.' });
  }
});

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

    const storyId = reqStoryId || 'default_story';
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = reqActorId || (player ? player.actorId : `player_actor_${storyId}`);
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/capabilities/synthesize", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'INTERACT',
        payload: {
          action: 'SYNTHESIZE_CUSTOM_POWER',
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
        },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const transactionRepo = context.repository;
        const transactionPlayer = transactionRepo.getPlayerLifecycle(storyId);
        const transactionActorId = reqActorId || (transactionPlayer ? transactionPlayer.actorId : `player_actor_${storyId}`);
        const capEngine = transactionRepo.getCapabilityEngine(storyId);

        const synthesisResult = capEngine.synthesizeCustomPower({
          actorId: transactionActorId,
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

        const clock = transactionRepo.getWorldClock(storyId);
        const ts = clock.getTimestamp();
        const evidenceId = deterministicId('ev_synth', storyId, commandId, synthesisResult.primaryCapability.id);
        transactionRepo.getHistoricalChronicleEngine(storyId).recordEvidence({
          id: evidenceId,
          category: 'SACRED_OR_HISTORIC',
          timestamp: ts,
          primarySubjectId: transactionActorId,
          secondarySubjectId: synthesisResult.primaryCapability.id,
          locationId: transactionPlayer?.locationId || 'loc_whispering_orrery',
          summary: `Synthesized Custom Power: ${conceptName}`,
          details: `Forged custom technique '${conceptName}' (${chosenTier} Tier). Derived: ${synthesisResult.derivedSkills.join(', ')}.`,
          sourceEventId: evidenceId,
          provenance: 'custom_power_synthesis',
          visibility: 'PUBLIC',
          metadata: { conceptName, powerTier: chosenTier, derivedSkills: synthesisResult.derivedSkills },
        });

        return {
          success: true,
          data: {
            synthesisResult,
            powerState: capEngine.getPowerState(transactionActorId),
            capabilities: capEngine.getAllCapabilities(),
            graph: capEngine.getCapabilityGraph(),
          },
          summary: `Synthesized Custom Power: ${conceptName}.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }

    const data = commandResult.data as any;
    res.json({
      success: true,
      ...(data?.synthesisResult || {}),
      powerState: data?.powerState,
      capabilities: data?.capabilities,
      graph: data?.graph,
      commandId: commandResult.commandId,
      event: commandResult.event,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, errorReason: error?.message || 'Failed to synthesize custom power.' });
  }
});

/**
 * POST /api/game/capabilities/interpret
 * Freeform Action Interpretation pipeline (CH7 / DreamBook §394–§396).
 * Maps unstructured player/NPC descriptions to existing capabilities, contextual modifications, or novel power proposals.
 */
gameRouter.post('/capabilities/interpret', async (req: Request, res: Response) => {
  try {
    const {
      actionText,
      tags,
      intendedCapabilityId,
      requestedModifiers,
      requestedScale,
      environment,
      actorConditions,
      actorId: reqActorId,
      storyId: reqStoryId,
    } = req.body;

    if (actionText === undefined || typeof actionText !== 'string') {
      return res.status(400).json({
        success: false,
        errorReason: 'actionText string is required for action interpretation.',
      });
    }

    const storyId = reqStoryId || 'default_story';
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = reqActorId || (player ? player.actorId : `player_actor_${storyId}`);
    const capEngine = worldRepository.getCapabilityEngine(storyId);

    // This endpoint is a dry-run interpreter. The client-provided executeIfValid flag is
    // intentionally ignored: novel capabilities can never be created or executed here.
    // Owned capabilities are executed through the canonical story-action path instead.
    const interpretationResult = capEngine.interpretFreeformAction({
      actorId,
      actionText: actionText.trim(),
      tags: Array.isArray(tags) ? tags : undefined,
      intendedCapabilityId,
      requestedModifiers,
      requestedScale,
      environment,
      actorConditions,
      executeIfValid: false,
    });

    const inventory = worldRepository.getInventoryEngine(storyId);
    const effectiveCapabilities = capEngine.getEffectiveActorCapabilities(actorId, inventory);
    const skillInstances = capEngine.getActorSkillInstances(actorId);

    return res.json({
      success: interpretationResult.validationSuccess,
      ...interpretationResult,
      powerState: capEngine.getPowerState(actorId),
      capabilities: effectiveCapabilities,
      skillInstances,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to interpret freeform action.' });
  }
});
// ==========================================
// CH8: Tactical Combat & D&D Ruleset Adapter
// ==========================================

function getCombatStateHelper(
  combatEngine: import('../domain/combatEngine').TacticalCombatEngine,
  storyId = 'default_story',
  viewerActorId?: string,
  repository = worldRepository
) {
  const actorId = viewerActorId || 'player_actor_default_story';
  const perceptionOptions = repository.getCombatPerceptionOptions(storyId, actorId);
  return {
    storyId,
    ...combatEngine.projectCombatForActor(actorId, perceptionOptions),
    combatEffectEvents: combatEngine.getCombatEffectEvents(),
  };
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
  fallbackLocationId?: string,
  repository = worldRepository
): void {
  if (!participant.isDead) return;
  const player = repository.getPlayerLifecycle(storyId);
  const playerActorId = player?.actorId || 'player_actor_default_story';
  if (participant.id === playerActorId) return;

  const clock = repository.getWorldClock(storyId);
  const ts = clock.getTimestamp();
  const existing = repository.getNpcLifecycle(storyId, participant.id);

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
    repository.updateNpcLifecycle(storyId, updated);
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
    repository.updateNpcLifecycle(storyId, created);
  }
}

/**
 * POST /api/game/combat/encounter/start
 * Initializes or resets a tactical combat encounter with canonical inventory & lifecycle binding (CH8/DEF-CH8-01).
 */
gameRouter.post('/combat/encounter/start', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    if (!requireDndTacticalCombat(res, storyId)) return;
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player ? player.actorId : `player_actor_${storyId}`;
    const combatEngine = worldRepository.getCombatEngine(storyId);

    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/combat/encounter/start", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'CORE_ACTION',
        payload: { action: 'START_ENCOUNTER', enemyId: req.body?.enemyId, enemyName: req.body?.enemyName },
        source: 'SYSTEM',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
    const transactionRepo = context.repository;
    const player = transactionRepo.getPlayerLifecycle(storyId);
    const inv = transactionRepo.getInventoryEngine(storyId);
    const capEngine = transactionRepo.getCapabilityEngine(storyId);
    const conditionEngine = transactionRepo.getConditionEngine(storyId);
    const combatEngine = transactionRepo.getCombatEngine(storyId);
    const run = transactionRepo.getStoryRun(storyId);
    const doll = inv.getActorPaperDoll(actorId);
    const powerState = capEngine.getPowerState(actorId);
    const conditionState = conditionEngine.getActorState(actorId);
    const coreStats = run?.protagonist?.coreStats;
    const progressionEngine = transactionRepo.getCharacterProgressionEngine(storyId);
    const progressionModifiers = progressionEngine.getState(actorId) ? progressionEngine.resolveModifiers(actorId).modifiers : [];
    const progressionValue = (target: string) => progressionModifiers.find((modifier) => modifier.target === target)?.value || 0;
    const characterLevel = Math.max(1, Math.min(20, Number(coreStats?.level ?? 1)));
    const proficiencyBonus = Math.ceil(characterLevel / 4) + 1;
    const abilityModifier = (score: number) => Math.floor((score - 10) / 2);
    const strMod = abilityModifier(Number(coreStats?.strength ?? 10) + progressionValue('coreStats.strength'));
    const dexMod = abilityModifier(Number(coreStats?.dexterity ?? 10) + progressionValue('coreStats.dexterity'));

    let computedAC = 10 + dexMod;
    if (doll.body) {
      const def = inv.getItemDefinition(doll.body.defId);
      const armorBonus = (doll.body.defId === 'def_steel_cuirass' || def?.properties?.armorBonus) ? (Number(def?.properties?.armorBonus) || 4) : 2;
      computedAC += armorBonus;
    computedAC += progressionValue('coreStats.armorClass');
    }
    if (doll.offHand) {
      const def = inv.getItemDefinition(doll.offHand.defId);
      const shieldBonus = Number(def?.properties?.armorBonus) || 2;
      computedAC += shieldBonus;
    }

    let weaponFormula = '1d4+0';
    let weaponAttackBonus = strMod + proficiencyBonus;
    if (doll.mainHand) {
      const def = inv.getItemDefinition(doll.mainHand.defId);
      const props = def?.properties || {};
      const tags = Array.isArray(def?.tags) ? def!.tags.map((t: string) => t.toLowerCase()) : [];
      const explicitAttackAbility = typeof props.attackAbility === 'string' ? props.attackAbility.toLowerCase() : '';
      const isRanged = explicitAttackAbility === 'dexterity' || explicitAttackAbility === 'dex' || tags.some((tag: string) => tag.includes('ranged'));
      const isFinesse = tags.includes('finesse') || Boolean(props.finesse);
      const attackAbilityMod = (isRanged || isFinesse) ? Math.max(strMod, dexMod) : strMod;
      weaponAttackBonus = attackAbilityMod + proficiencyBonus;

      if (doll.mainHand.defId === 'def_iron_sword' || doll.mainHand.name.includes('Sword')) {
        weaponFormula = '1d8+3';
      } else {
        weaponFormula = (props.damageFormula as string) || '1d6+0';
      }
    }

    const feetDef = doll.feet ? inv.getItemDefinition(doll.feet.defId) : undefined;
    const speedBonus = feetDef ? (Number(feetDef.properties?.speedBonus) || 1) : 0;
    const speedCells = 5 + speedBonus;

    // Preserve corpses before clearing (CH5-004 / CH5-COMBAT-01)
    const deadParticipants = combatEngine.getParticipants().filter(p => p.isDead && p.id !== actorId);
    for (const dp of deadParticipants) {
      syncNpcCombatDeath(storyId, dp, undefined, player?.locationId, transactionRepo);
    }
    // Reset combat state and seed encounter
    combatEngine.clear();

    const playerParticipant: import('../domain/combatEngine').BattlefieldParticipant = {
      id: actorId,
      name: player?.name || 'Vael the Seeker',
      x: 1,
      y: 1,
      initiative: 18,
      initiativeModifier: dexMod,
      saveModifiers: {
        STR: strMod,
        DEX: dexMod,
        CON: abilityModifier(Number(coreStats?.constitution ?? 10)),
        INT: abilityModifier(Number(coreStats?.intelligence ?? 10)),
        WIS: abilityModifier(Number(coreStats?.wisdom ?? 10)),
        CHA: abilityModifier(Number(coreStats?.charisma ?? 10)),
      },
      team: 'player_allies',
      hpCurrent: Math.max(0, conditionState?.healthCurrent ?? powerState?.healthCurrent ?? Number(coreStats?.hpCurrent ?? 100)),
      hpMax: (conditionState?.healthMax ?? powerState?.healthMax ?? Number(coreStats?.hpMax ?? 100)),
      armorClass: computedAC,
      speedCells,
      attackBonus: weaponAttackBonus,
      damageFormula: weaponFormula,
      damageType: doll.mainHand ? 'slashing' : 'bludgeoning',
      damageProfile: conditionState?.damageProfile,
      conditionProfile: conditionState?.conditionProfile,
      usesDeathSaves: true,
      deathSaveState: {
        successes: 0,
        failures: 0,
        stable: false,
      },
      conditions: [
        ...(conditionState?.instances.map((instance) => instance.name) || []),
        ...(player?.isDead || conditionState?.dead ? ['Dead'] : []),
      ],
      isDead: player?.isDead || conditionState?.dead || false,
    };

    combatEngine.addParticipant(playerParticipant);

    // Dynamic enemy seeding: Ensure canonical dead NPC identities are NEVER resurrected as alive (CH5 Issue B)
    let enemyId = (typeof req.body?.enemyId === 'string' && req.body.enemyId.trim())
      ? req.body.enemyId.trim()
      : 'enemy_void_construct';
    const enemyName = (typeof req.body?.enemyName === 'string' && req.body.enemyName.trim())
      ? req.body.enemyName.trim()
      : 'Astral Void Sentry';

    const existingCandidate = transactionRepo.getNpcLifecycle(storyId, enemyId);
    const entityCard = transactionRepo.getEntityCard(storyId, enemyId);
    const entityStats = entityCard?.coreStats;
    const shouldSkipIfDead = Boolean(req.body?.skipIfDead);

    const enemyHp = Math.max(1, Number(entityStats?.hpMax ?? 28));
    const enemyAc = Math.max(1, Number(entityStats?.armorClass ?? 13));
    const enemySpeed = Math.max(0, Math.round(Number(entityStats?.speed ?? 20) / 5));
    const enemyAttackBonus = Number(entityCard?.metadata?.attackBonus ?? 4);
    const enemyDamageFormula = typeof entityCard?.metadata?.damageFormula === 'string'
      ? entityCard.metadata.damageFormula
      : '1d6+2';

    if (!entityCard) {
      transactionRepo.saveEntityCard(storyId, {
        id: enemyId,
        name: enemyName,
        kind: 'CREATURE',
        classification: { role: 'Combat Creature', threat: 'Unrated', tags: ['combat_spawn'] },
        coreStats: {
          level: 1,
          hpCurrent: enemyHp,
          hpMax: enemyHp,
          armorClass: enemyAc,
          speed: Number(entityStats?.speed ?? 20),
          abilityScores: {},
        },
        worldState: {
          locationId: player?.locationId,
          currentActivity: 'combat',
          isAlive: true,
          presence: 'present',
        },
        personality: { traits: [], values: [], motivations: ['Survival'], fears: [], desires: [] },
        behavior: { defaultBehavior: 'Combat survival', priorities: ['Survive'], routines: [] },
        social: { factionIds: [], reputation: {}, relationships: {} },
        traits: [],
        capabilities: [],
        feats: [],
        equipment: [],
        memoryRefs: [],
        metadata: { attackBonus: enemyAttackBonus, damageFormula: enemyDamageFormula },
        provenance: { source: 'COMBAT_ENCOUNTER', createdBy: 'SYSTEM' },
      });
    }

    if (existingCandidate?.isDead) {
      if (!shouldSkipIfDead) {
        // Generate a dynamic spawn identity so the deceased persistent identity is never resurrected as alive
        let counter = 2;
        while (transactionRepo.getNpcLifecycle(storyId, `${enemyId}_${counter}`)?.isDead) {
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
          hpCurrent: enemyHp,
          hpMax: enemyHp,
          armorClass: enemyAc,
          speedCells: enemySpeed,
          attackBonus: enemyAttackBonus,
          damageFormula: enemyDamageFormula,
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
        hpCurrent: enemyHp,
        hpMax: enemyHp,
        armorClass: enemyAc,
        speedCells: enemySpeed,
        attackBonus: enemyAttackBonus,
        damageFormula: enemyDamageFormula,
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

        const state = getCombatStateHelper(combatEngine, storyId, actorId, transactionRepo);
        return {
          success: true,
          data: { combatState: state },
          summary: 'Tactical combat encounter initialized.',
        };
      }
    );

    const state = getCombatStateHelper(combatEngine, storyId, actorId);
    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        combatState: state,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }

    res.json({
      success: true,
      message: 'Encounter initialized with canonical equipment & lifecycle stats.',
      combatState: state,
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
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
    const storyId = resolveStoryId(req, true);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const serverPlayerActorId = player?.actorId || `player_actor_${storyId}`;

    // Public combat actor identity is server-bound to the existing player actor.
    if (req.query.actorId && req.query.actorId !== serverPlayerActorId) {
      return res.status(403).json({
        error: `Cannot query combat state for actor '${req.query.actorId}'. Caller is bound to server player '${serverPlayerActorId}'.`,
      });
    }

    const combatEngine = worldRepository.getCombatEngine(storyId);
    const profile = requireDndTacticalCombat(res, storyId);
    if (!profile) return;
    const state = getCombatStateHelper(combatEngine, storyId, serverPlayerActorId);
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
    const storyId = resolveStoryId(req, true);
    if (!requireDndTacticalCombat(res, storyId)) return;
    const { actorId: reqActorId, targetX, targetY } = req.body;
    if (typeof targetX !== 'number' || typeof targetY !== 'number') {
      return res.status(400).json({ success: false, errorReason: 'targetX and targetY numbers required.' });
    }

    const player = worldRepository.getPlayerLifecycle(storyId);
    const serverPlayerActorId = player?.actorId || `player_actor_${storyId}`;

    // Reject impersonation of other actors on public HTTP route
    if (reqActorId && reqActorId !== serverPlayerActorId) {
      return res.status(403).json({
        success: false,
        errorReason: `Unauthorized: cannot move actor '${reqActorId}'. Caller is bound to server player '${serverPlayerActorId}'.`,
      });
    }

    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/combat/move", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId: serverPlayerActorId,
        type: 'MOVE',
        payload: { targetX, targetY },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const transactionRepo = context.repository;
        const combatEngine = transactionRepo.getCombatEngine(storyId);
        const moveResult = combatEngine.moveActor(serverPlayerActorId, targetX, targetY);
        if (!moveResult.success) {
          return {
            success: false,
            errorReason: moveResult.errorReason || 'Movement rejected.',
          };
        }
        return {
          success: true,
          data: { moveResult },
          summary: `Player movement committed to (${targetX}, ${targetY}).`,
        };
      }
    );

    const combatEngine = worldRepository.getCombatEngine(storyId);
    const state = getCombatStateHelper(combatEngine, storyId, serverPlayerActorId);

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        combatState: state,
        rolledBack: commandResult.rolledBack,
      });
    }

    res.json({
      success: true,
      combatState: state,
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute combat movement.' });
  }
});

/**
 * POST /api/game/combat/action
 * Executes a canonical core combat Action (Dash, Dodge, or Disengage).
 * The turn-resource ledger is authoritative; no client-side action is trusted.
 */
gameRouter.post('/combat/action', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    if (!requireDndTacticalCombat(res, storyId)) return;
    const { actorId: reqActorId, action } = req.body;
    const player = worldRepository.getPlayerLifecycle(storyId);
    const serverPlayerActorId = player?.actorId || `player_actor_${storyId}`;

    if (reqActorId && reqActorId !== serverPlayerActorId) {
      return res.status(403).json({
        success: false,
        errorReason: `Unauthorized: cannot execute combat action as actor '${reqActorId}'.`,
      });
    }

    if (!['DASH', 'DODGE', 'DISENGAGE'].includes(action)) {
      return res.status(400).json({
        success: false,
        errorReason: 'action must be one of DASH, DODGE, or DISENGAGE.',
      });
    }

    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/combat/action", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId: serverPlayerActorId,
        type: 'CORE_ACTION',
        payload: { action },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const combatEngine = context.repository.getCombatEngine(storyId);
        const result = combatEngine.executeCoreAction(serverPlayerActorId, action);
        if (!result.success) {
          return {
            success: false,
            errorReason: result.errorReason || 'Core action rejected.',
          };
        }
        return {
          success: true,
          data: { result },
          summary: `Core combat action ${action} committed.`,
        };
      }
    );

    const combatEngine = worldRepository.getCombatEngine(storyId);
    const state = getCombatStateHelper(combatEngine, storyId, serverPlayerActorId);

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        combatState: state,
        rolledBack: commandResult.rolledBack,
      });
    }

    res.json({
      success: true,
      action: (commandResult.data as any)?.result?.action,
      combatState: state,
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute combat action.' });
  }
});


/**
 * POST /api/game/combat/ready
 * Canonically consumes the Action and arms a reaction-based Ready Action.
 */
gameRouter.post('/combat/ready', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    if (!requireDndTacticalCombat(res, storyId)) return;
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player?.actorId || `player_actor_${storyId}`;
    if (req.body?.actorId && req.body.actorId !== actorId) {
      return res.status(403).json({ success: false, errorReason: 'Unauthorized actor.' });
    }

    const triggerType = req.body?.triggerType;
    if (!['ACTOR_MOVED', 'ACTOR_ATTACKED', 'TARGET_ENTERED_REACH'].includes(triggerType)) {
      return res.status(400).json({ success: false, errorReason: 'triggerType is required and must be a supported Ready trigger.' });
    }

    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, '/combat/ready', req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'CORE_ACTION',
        payload: { action: 'READY', triggerType, triggerActorId: req.body?.triggerActorId, targetId: req.body?.targetId },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const combat = context.repository.getCombatEngine(storyId);
        const result = combat.armReadyAction(
          actorId,
          typeof req.body?.actionDescription === 'string' ? req.body.actionDescription : 'Prepared attack',
          typeof req.body?.triggerDescription === 'string' ? req.body.triggerDescription : 'Configured trigger.',
          {
            triggerType,
            triggerActorId: typeof req.body?.triggerActorId === 'string' ? req.body.triggerActorId : undefined,
            targetId: typeof req.body?.targetId === 'string' ? req.body.targetId : undefined,
          }
        );
        if (!result.success) return { success: false, errorReason: result.errorReason };
        return { success: true, data: { readyAction: combat.getActionEconomy().getReadyAction(actorId) }, summary: 'Ready Action armed.' };
      }
    );

    const state = getCombatStateHelper(worldRepository.getCombatEngine(storyId), storyId, actorId);
    if (!commandResult.success) {
      return res.status(400).json({ success: false, errorReason: commandResult.errorReason, combatState: state, rolledBack: commandResult.rolledBack });
    }
    return res.json({ success: true, combatState: state, readyAction: (commandResult.data as any)?.readyAction, commandId, canonicalEvent: commandResult.event });
  } catch {
    return res.status(500).json({ error: 'Failed to arm Ready Action.' });
  }
});

/**
 * POST /api/game/combat/grapple/escape
 * Canonically spends an Action to attempt escaping a Grapple.
 */
gameRouter.post('/combat/grapple/escape', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    if (!requireDndTacticalCombat(res, storyId)) return;
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player?.actorId || `player_actor_${storyId}`;
    if (req.body?.actorId && req.body.actorId !== actorId) {
      return res.status(403).json({ success: false, errorReason: 'Unauthorized actor.' });
    }

    const ability = req.body?.ability === 'DEX' ? 'DEX' : 'STR';
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, '/combat/grapple/escape', req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'CORE_ACTION',
        payload: { action: 'ESCAPE_GRAPPLE', ability },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const combat = context.repository.getCombatEngine(storyId);
        const result = combat.escapeGrapple(actorId, ability);
        if (!result.success) return { success: false, errorReason: result.errorReason };
        return { success: true, data: { result }, summary: 'Grapple escape resolved.' };
      }
    );

    const state = getCombatStateHelper(worldRepository.getCombatEngine(storyId), storyId, actorId);
    if (!commandResult.success) {
      return res.status(400).json({ success: false, errorReason: commandResult.errorReason, combatState: state, rolledBack: commandResult.rolledBack });
    }
    return res.json({ success: true, result: (commandResult.data as any)?.result, combatState: state, commandId, canonicalEvent: commandResult.event });
  } catch {
    return res.status(500).json({ error: 'Failed to resolve Grapple escape.' });
  }
});

/**
 * POST /api/game/combat/control
 * Canonically resolves Grapple or Shove.
 */
gameRouter.post('/combat/control', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    if (!requireDndTacticalCombat(res, storyId)) return;
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player?.actorId || `player_actor_${storyId}`;
    if (req.body?.actorId && req.body.actorId !== actorId) {
      return res.status(403).json({ success: false, errorReason: 'Unauthorized actor.' });
    }

    const action = req.body?.action;
    const targetId = req.body?.targetId;
    if (!['GRAPPLE', 'SHOVE'].includes(action) || typeof targetId !== 'string') {
      return res.status(400).json({ success: false, errorReason: 'action must be GRAPPLE or SHOVE and targetId is required.' });
    }

    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, '/combat/control', req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'CORE_ACTION',
        payload: { action, targetId, prone: req.body?.prone === true },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const combat = context.repository.getCombatEngine(storyId);
        const result = action === 'GRAPPLE'
          ? combat.executeGrapple(actorId, targetId)
          : combat.executeShove(actorId, targetId, req.body?.prone === true);
        if (!result.success) return { success: false, errorReason: result.errorReason };
        return { success: true, data: { result }, summary: `Combat control action ${action} resolved.` };
      }
    );

    const state = getCombatStateHelper(worldRepository.getCombatEngine(storyId), storyId, actorId);
    if (!commandResult.success) {
      return res.status(400).json({ success: false, errorReason: commandResult.errorReason, combatState: state, rolledBack: commandResult.rolledBack });
    }
    return res.json({ success: true, result: (commandResult.data as any)?.result, combatState: state, commandId, canonicalEvent: commandResult.event });
  } catch {
    return res.status(500).json({ error: 'Failed to resolve combat control action.' });
  }
});

/**
 * POST /api/game/combat/attack
 * Executes D&D SRD 5.2.1 attack resolution with canonical inventory & lifecycle synchronization (DEF-CH8-02, DEF-CH8-03, DEF-CH8-04).
 * Identity is bound to server-authoritative player actor.
 */
gameRouter.post('/combat/attack', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    if (!requireDndTacticalCombat(res, storyId)) return;
    const { attackerId: reqAttackerId, targetId } = req.body;
    if (!targetId) {
      return res.status(400).json({ success: false, errorReason: 'targetId string is required.' });
    }

    const player = worldRepository.getPlayerLifecycle(storyId);
    const serverPlayerActorId = player ? player.actorId : `player_actor_${storyId}`;

    // Reject impersonation of other attackers on public HTTP route
    if (reqAttackerId && reqAttackerId !== serverPlayerActorId) {
      return res.status(403).json({
        success: false,
        errorReason: `Unauthorized: cannot attack as actor '${reqAttackerId}'. Caller is bound to server player '${serverPlayerActorId}'.`,
      });
    }

    const attackerId = serverPlayerActorId;
    const actorId = serverPlayerActorId;
    const combatEngine = worldRepository.getCombatEngine(storyId);
    const inv = worldRepository.getInventoryEngine(storyId);
    const capEngine = worldRepository.getCapabilityEngine(storyId);
    const chronicle = worldRepository.getHistoricalChronicleEngine(storyId);
    const clock = worldRepository.getWorldClock(storyId);

    const attacker = combatEngine.getParticipant(attackerId);
    const target = combatEngine.getParticipant(targetId);

    if (!attacker || !target) {
      return res.status(404).json({ success: false, errorReason: 'Attacker or target participant not found.' });
    }

    // CH2-08 Epistemic Target-ID Security Authorization using durable repository authority
    const perceptionOptions = worldRepository.getCombatPerceptionOptions(storyId, attackerId);
    if (!combatEngine.isParticipantKnownToActor(attackerId, target, perceptionOptions)) {
      return res.status(403).json({
        success: false,
        errorReason: `Target '${targetId}' is not legitimately perceived or known by actor '${attackerId}'.`,
      });
    }

    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/combat/attack", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId: attackerId,
        type: 'ATTACK',
        payload: { targetId },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const transactionRepo = context.repository;
        const combatEngine = transactionRepo.getCombatEngine(storyId);
        const inv = transactionRepo.getInventoryEngine(storyId);
        const capEngine = transactionRepo.getCapabilityEngine(storyId);
        const chronicle = transactionRepo.getHistoricalChronicleEngine(storyId);
        const clock = transactionRepo.getWorldClock(storyId);
        const player = transactionRepo.getPlayerLifecycle(storyId);
        const attacker = combatEngine.getParticipant(attackerId);
        const target = combatEngine.getParticipant(targetId);
        if (!attacker || !target) {
          return {
            success: false,
            errorReason: 'Attacker or target participant is no longer available.',
          };
        }
        const perceptionOptions = transactionRepo.getCombatPerceptionOptions(storyId, attackerId);
        if (!combatEngine.isParticipantKnownToActor(attackerId, target, perceptionOptions)) {
          return {
            success: false,
            errorReason: `Target '${targetId}' is not legitimately perceived or known by actor '${attackerId}'.`,
          };
        }
        const attackResult = combatEngine.executeAttack(attackerId, targetId);
        if (!attackResult.success) {
          return {
            success: false,
            errorReason: attackResult.errorReason || 'Attack action could not be resolved.',
          };
        }

        if (attacker.team === 'player_allies') {
          const doll = inv.getActorPaperDoll(actorId);
          if (doll.mainHand) {
            inv.degradeDurability(doll.mainHand.id, 1);
          }
        }

        const updatedTarget = combatEngine.getParticipant(targetId) || target;

        if (updatedTarget.id === actorId && attackResult.damage > 0) {
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
                cause: `Struck down in tactical combat by ${attacker.name}`,
                revivalPossible: true,
              },
            });
            transactionRepo.updatePlayerLifecycle(storyId, deadPlayer);

            const ts = clock.getTimestamp();
            chronicle.recordEvidence({
              id: `ev_death_${actorId}_${attackerId}_${ts.totalElapsedSeconds}_${chronicle.getChronicleEntries().length}`,
              category: 'LIFECYCLE_TRANSITION',
              timestamp: ts,
              primarySubjectId: actorId,
              secondarySubjectId: attackerId,
              locationId: player.locationId,
              summary: 'Player Character Slain in Combat',
              details: `${player.name} succumbed to mortal trauma from ${attacker.name}'s strike.`,
              sourceEventId: `evt_combat_death_${actorId}_${ts.totalElapsedSeconds}`,
              provenance: 'tactical_battlefield_mortality',
              visibility: 'PUBLIC',
            });
          } else if (attackResult.damage >= 15 && player) {
            const injury: import('../domain/types').InjuryRecord = {
              id: `inj_combat_${clock.getTimestamp().totalElapsedSeconds}_${player.injuries.length}`,
              type: 'Combat Trauma',
              severity: attackResult.damage >= 25 ? 'Critical' : 'Moderate',
              location: 'Torso',
              description: `Combat wound from ${attacker.name} (${attackResult.damage} damage)`,
              acquiredAtTimestamp: clock.getTimestamp(),
              healed: false,
            };
            transactionRepo.updatePlayerLifecycle(
              storyId,
              player.copyWith({ injuries: [...player.injuries, injury] })
            );
          }
        } else if (updatedTarget.id !== actorId && updatedTarget.isDead) {
          syncNpcCombatDeath(storyId, updatedTarget, attacker.name, player?.locationId, transactionRepo);
        }

        const state = getCombatStateHelper(combatEngine, storyId, attackerId, transactionRepo);
        if (state.victory) {
          const ts = clock.getTimestamp();
          chronicle.recordEvidence({
            id: `ev_victory_${actorId}_${ts.totalElapsedSeconds}_${chronicle.getChronicleEntries().length}`,
            category: 'SACRED_OR_HISTORIC',
            timestamp: ts,
            primarySubjectId: actorId,
            locationId: player?.locationId || 'loc_whispering_orrery',
            summary: 'Tactical Battlefield Victory',
            details: `${player?.name || 'Vael'} emerged victorious, neutralizing all hostile entities in combat.`,
            sourceEventId: `evt_combat_victory_${actorId}_${ts.totalElapsedSeconds}`,
            provenance: 'tactical_battlefield_outcome',
            visibility: 'PUBLIC',
          });
        }

        return {
          success: true,
          data: { attackResult },
          summary: attackResult.hits
            ? `Attack committed against ${target.name} for ${attackResult.damage} damage.`
            : `Attack committed against ${target.name} and missed.`,
        };
      }
    );

    const state = getCombatStateHelper(combatEngine, storyId, attackerId);
    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        combatState: state,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }

    res.json({
      ...(commandResult.data as any)?.attackResult,
      combatState: state,
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute combat attack.' });
  }
});

/**
 * POST /api/game/combat/effect/validate
 */
gameRouter.post('/combat/effect/validate', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const definition = req.body?.definition as CombatEffectDefinition;
    const validation = combatEffectEngine.validateDefinition(definition, worldRepository.getRulesProfile(storyId)?.mode || 'FULL_DND');
    return res.status(validation.success ? 200 : 400).json(validation);
  } catch (error: any) {
    return res.status(400).json({ success: false, errorReason: error?.message || 'Failed to validate combat effect.' });
  }
});

/**
 * POST /api/game/combat/effect
 * Canonical entry point for structured combat/world effects.
 *
 * The client may request an effect, but the server always resolves the
 * capability definition owned by the actor. Submitted client mechanics
 * are preview data, never live authority.
 */
gameRouter.post('/combat/effect', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const requestedDefinition = req.body?.definition as CombatEffectDefinition | undefined;
    const requestedTargetIds = Array.isArray(req.body?.targetIds)
      ? req.body.targetIds.map(String)
      : [];
    const requestedActorId = req.body?.actorId as string | undefined;
    const player = worldRepository.getPlayerLifecycle(storyId);
    const serverActorId = player?.actorId || 'player_actor_' + storyId;

    if (requestedActorId && requestedActorId !== serverActorId) {
      return res.status(403).json({ success: false, errorReason: 'Unauthorized combat-effect actor.' });
    }

    const actorId = serverActorId;
    const combat = worldRepository.getCombatEngine(storyId);
    const actor = combat.getParticipant(actorId);
    if (!actor) {
      return res.status(404).json({ success: false, errorReason: 'Authoritative actor is not present in combat.' });
    }

    if (!requestedDefinition || typeof requestedDefinition !== 'object') {
      return res.status(400).json({ success: false, errorReason: 'A structured combat effect definition is required.' });
    }

    const capId =
      typeof req.body?.capabilityId === 'string' && req.body.capabilityId.trim()
        ? req.body.capabilityId.trim()
        : requestedDefinition.id;

    const inventory = worldRepository.getInventoryEngine(storyId);
    const capEngine = worldRepository.getCapabilityEngine(storyId);
    const effectiveCapabilities = capEngine.getEffectiveActorCapabilities(actorId, inventory);
    const ownedCapability = effectiveCapabilities.find((cap: any) =>
      cap.id === capId || cap.name === requestedDefinition.name
    );

    if (!ownedCapability) {
      return res.status(403).json({
        success: false,
        errorReason: 'Actor does not possess the requested capability/effect.',
      });
    }

    const canonicalDefinition = capEngine.getAuthoritativeCombatEffect(
      actorId,
      ownedCapability.id,
      inventory
    );

    if (!canonicalDefinition) {
      return res.status(409).json({
        success: false,
        errorReason: 'Owned capability does not expose an authoritative combat effect.',
      });
    }

    const definitionValidation = combatEffectEngine.validateDefinition(
      canonicalDefinition,
      worldRepository.getRulesProfile(storyId)?.mode || 'FULL_DND'
    );

    if (!definitionValidation.success || !definitionValidation.normalized) {
      return res.status(409).json({
        success: false,
        errorReason: definitionValidation.errorReason || 'Owned capability effect is not valid.',
      });
    }

    const normalized = definitionValidation.normalized;
    const targetResolution =
      normalized.resolutionMode === 'WORLD_EFFECT' && requestedTargetIds.length === 0
        ? { success: true, targetIds: [] as string[] }
        : combatTargetingEngine.resolve(combat, actorId, requestedTargetIds, normalized);

    if (!targetResolution.success) {
      return res.status(400).json({ success: false, errorReason: targetResolution.errorReason });
    }

    const resolvedTargetIds = targetResolution.targetIds;
    for (const targetId of resolvedTargetIds) {
      const target = combat.getParticipant(targetId);
      if (
        target &&
        !combat.isParticipantKnownToActor(
          actorId,
          target,
          worldRepository.getCombatPerceptionOptions(storyId, actorId)
        )
      ) {
        return res.status(403).json({
          success: false,
          errorReason: 'Target is not legitimately perceived by the actor.',
        });
      }
    }

    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId(
        'cmd_route',
        storyId,
        '/combat/effect',
        capId,
        resolvedTargetIds,
        worldRepository.getCanonicalCommandEvents(storyId).length + 1
      );

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'COMBAT_EFFECT',
        payload: {
          effectId: normalized.id,
          capabilityId: capId,
          resolutionMode: normalized.resolutionMode,
          targetIds: resolvedTargetIds,
          definition: normalized,
        },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const transactionCapEngine = context.repository.getCapabilityEngine(storyId);
        const transactionInventory = context.repository.getInventoryEngine(storyId);
        const transactionCombat = context.repository.getCombatEngine(storyId);
        const transactionCapabilities =
          transactionCapEngine.getEffectiveActorCapabilities(actorId, transactionInventory);
        const transactionCapability = transactionCapabilities.find((cap: any) => cap.id === capId);

        if (!transactionCapability) {
          return { success: false, errorReason: 'Capability is no longer possessed at commit time.' };
        }

        const transactionDefinition =
          transactionCapEngine.getAuthoritativeCombatEffect(
            actorId,
            transactionCapability.id,
            transactionInventory
          );

        if (!transactionDefinition) {
          return {
            success: false,
            errorReason: 'Capability effect is unavailable at commit time.',
          };
        }

        const transactionValidation = combatEffectEngine.validateDefinition(
          transactionDefinition,
          context.repository.getRulesProfile(storyId)?.mode || 'FULL_DND'
        );

        if (!transactionValidation.success || !transactionValidation.normalized) {
          return {
            success: false,
            errorReason: transactionValidation.errorReason || 'Capability effect failed commit-time validation.',
          };
        }

        const finalTargetResolution =
          transactionValidation.normalized.resolutionMode === 'WORLD_EFFECT' &&
          resolvedTargetIds.length === 0
            ? { success: true, targetIds: [] as string[] }
            : combatTargetingEngine.resolve(
                transactionCombat,
                actorId,
                resolvedTargetIds,
                transactionValidation.normalized
              );

        if (!finalTargetResolution.success) {
          return {
            success: false,
            errorReason: finalTargetResolution.errorReason || 'Target resolution failed at commit time.',
          };
        }

        const effectDefinition = transactionValidation.normalized;
        const replayBeforeState = transactionCombat.exportState();

        // CapabilityEngine remains the authority for capability ownership,
        // execution eligibility, energy/strain costs, and contextual power gates.
        // CombatEffectEngine remains the authority for the mechanical combat/world
        // resolution itself. Both operate inside the same staged command.
        const requestedScaleForAdjudication =
          ['CITY', 'REGION', 'CONTINENT', 'PLANET', 'COSMIC'].includes(effectDefinition.scale)
            ? 'WorldScale'
            : effectDefinition.scale === 'ENCOUNTER' || effectDefinition.scale === 'STRUCTURE' || effectDefinition.scale === 'DISTRICT'
              ? 'Moderate'
              : 'Local';
        const adjudication = transactionCapEngine.adjudicate({
          actorId,
          intendedCapabilityId: transactionCapability.id,
          requestedScale: requestedScaleForAdjudication,
          actionDescription: `Canonical combat effect: ${effectDefinition.name}`,
          actorConditions: transactionCombat.getParticipant(actorId)?.conditions,
        });
        if (!adjudication.approved) {
          return {
            success: false,
            errorReason: adjudication.rejectionReason || 'Capability execution gate rejected the effect.',
          };
        }

        const effectResult =
          effectDefinition.resolutionMode === 'WORLD_EFFECT' ||
          effectDefinition.resolutionMode === 'OUTCOME'
            ? worldEffectEngine.apply({
                repository: context.repository,
                storyId,
                actorId,
                definition: effectDefinition,
                targetIds: finalTargetResolution.targetIds,
                authorityVerified: true,
              })
            : combatEffectEngine.resolve(
                transactionCombat,
                actorId,
                finalTargetResolution.targetIds,
                effectDefinition
              );

        if (!effectResult.success) {
          return {
            success: false,
            errorReason: effectResult.errorReason || 'Combat effect was rejected.',
          };
        }

        if (effectDefinition.resolutionMode === 'WORLD_EFFECT' || effectDefinition.resolutionMode === 'OUTCOME') {
          const worldEventId = (effectResult as any).worldEventId || (effectResult as any).canonicalEventIds?.[0];
          transactionCombat.recordCombatReplay({
            actionId: 'world_effect_' + effectDefinition.id + '_' + transactionCombat.getCombatActionSequence(),
            turnNumber: transactionCombat.getCurrentRound(),
            actorId,
            targetIds: [...finalTargetResolution.targetIds],
            definition: JSON.parse(JSON.stringify(effectDefinition)),
            seedBefore: Number(replayBeforeState.seed || 0),
            rollCounterBefore: Number(replayBeforeState.rollCounter || 0),
            beforeState: JSON.parse(JSON.stringify(replayBeforeState)),
            canonicalEventIds: worldEventId ? [String(worldEventId)] : [],
            resultSignature: {
              success: true,
              totalDamage: 0,
              defeatedTargetIds: [...((effectResult as any).affectedEntityIds || [])],
              instanceCount: 'instances' in effectResult ? (effectResult.instances?.length || 0) : 0,
            },
            consumeAction: effectDefinition.actionCost !== 'FREE',
            replayMode: 'WORLD_PREVIEW',
            createdAtSequence: transactionCombat.getCombatActionSequence(),
          });
        }

        const effectInstances = 'instances' in effectResult ? (effectResult.instances || []) : [];
        for (const result of effectInstances) {
          if (result.targetDied && result.targetId !== actorId) {
            const target = transactionCombat.getParticipant(result.targetId);
            if (target) {
              syncNpcCombatDeath(
                storyId,
                target,
                actor.name,
                player?.locationId,
                context.repository
              );
            }
          }
        }

        return {
          success: true,
          data: {
            effectResult,
            adjudication,
            combatState: getCombatStateHelper(
              transactionCombat,
              storyId,
              actorId,
              context.repository
            ),
          },
          summary: effectDefinition.name + ' resolved for ' + actorId + '.',
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }

    const data = commandResult.data as any;
    return res.json({
      success: true,
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
      effectResult: data?.effectResult,
      combatState: data?.combatState,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      errorReason: error?.message || 'Failed to resolve combat effect.',
    });
  }
});

/**
 * POST /api/game/combat/simulate
 */
gameRouter.post('/combat/simulate', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const requestedDefinition = req.body?.definition as CombatEffectDefinition;
    const actorId = String(req.body?.actorId || worldRepository.getPlayerLifecycle(storyId)?.actorId || ('player_actor_' + storyId));
    const capabilityId = typeof req.body?.capabilityId === 'string' ? req.body.capabilityId.trim() : '';
    const targetIds = Array.isArray(req.body?.targetIds) ? req.body.targetIds.map(String) : [];
    const engine = worldRepository.getCombatEngine(storyId);

    let definition = requestedDefinition;
    let definitionAuthority: 'CANONICAL_CAPABILITY' | 'DRAFT_SIMULATION' = 'DRAFT_SIMULATION';
    if (capabilityId) {
      const inventory = worldRepository.getInventoryEngine(storyId);
      const capabilityEngine = worldRepository.getCapabilityEngine(storyId);
      const possessed = capabilityEngine.getEffectiveActorCapabilities(actorId, inventory).find((capability: any) => capability.id === capabilityId);
      if (!possessed) {
        return res.status(403).json({ success: false, errorReason: 'Simulation capability is not currently possessed by the actor.' });
      }
      const canonicalDefinition = capabilityEngine.getAuthoritativeCombatEffect(actorId, capabilityId, inventory);
      if (!canonicalDefinition) {
        return res.status(400).json({ success: false, errorReason: 'The selected capability has no canonical combat effect.' });
      }
      definition = canonicalDefinition;
      definitionAuthority = 'CANONICAL_CAPABILITY';
    }
    const seed = req.body?.seed === undefined ? undefined : Number(req.body.seed);
    const seeds = Array.isArray(req.body?.seeds) ? req.body.seeds.map((value: any) => Number(value)).filter(Number.isFinite) : [];
    if (Array.isArray(req.body?.definitions) && req.body.definitions.length) {
      return res.json({
        definitionAuthority,
        results: combatSimulationEngine.scenarioMatrix({
          engine,
          actorId,
          targetIds,
          definitions: req.body.definitions as CombatEffectDefinition[],
          seeds,
        }),
      });
    }
    if (seeds.length) return res.json({ definitionAuthority, result: combatSimulationEngine.batchSimulate({ engine, actorId, targetIds, definition, seeds }) });
    return res.json({ definitionAuthority, result: combatSimulationEngine.simulate({ engine, actorId, targetIds, definition, seed }) });
  } catch (error: any) {
    return res.status(400).json({ success: false, errorReason: error?.message || 'Failed to simulate combat effect.' });
  }
});

/**
 * GET /api/game/combat/replays
 * Returns bounded canonical combat replay records for the active story.
 */
gameRouter.get('/combat/replays', (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    if (!requireDndTacticalCombat(res, storyId)) return;
    const combat = worldRepository.getCombatEngine(storyId);
    return res.json({
      success: true,
      storyId,
      replays: combat.getCombatReplayRecords(),
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, errorReason: error?.message || 'Failed to fetch combat replays.' });
  }
});

/**
 * POST /api/game/combat/replay
 * Replays one canonical combat-effect record without mutating live combat.
 */
gameRouter.post('/combat/replay', (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    if (!requireDndTacticalCombat(res, storyId)) return;
    const replayId = String(req.body?.replayId || '').trim();
    if (!replayId) return res.status(400).json({ success: false, errorReason: 'replayId is required.' });
    const record = worldRepository.getCombatEngine(storyId).getCombatReplayRecords().find((item) => item.id === replayId);
    if (!record) return res.status(404).json({ success: false, errorReason: 'Combat replay record not found.' });
    return res.json(combatReplayEngine.replay(record));
  } catch (error: any) {
    return res.status(400).json({ success: false, errorReason: error?.message || 'Failed to replay combat action.' });
  }
});

/**
 * POST /api/game/combat/animation-plan
 */
gameRouter.post('/combat/animation-plan', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const definition = req.body?.definition as CombatEffectDefinition;
    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    return res.json(await combatAnimationService.generatePlan({ repository: worldRepository, storyId, definition, events }));
  } catch (error: any) {
    const definition = req.body?.definition as CombatEffectDefinition;
    return res.status(200).json({ plan: combatAnimationService.deterministicPlan(definition), source: 'SYSTEM', fallbackReason: error?.message || 'Animation planning fallback.' });
  }
});

/**
 * POST /api/game/combat/asset/ensure
 */
gameRouter.post('/combat/asset/ensure', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const effectId = String(req.body?.effectId || 'combat_effect');
    const prompt = String(req.body?.prompt || ('Dreamville combat visual effect for ' + effectId + '.'));
    const result = await combatAssetService.ensure({ repository: worldRepository, storyId, effectId, prompt, assetId: req.body?.assetId });
    return res.json({ success: true, asset: result });
  } catch (error: any) {
    return res.status(200).json({ success: false, fallback: true, errorReason: error?.message || 'Combat visual asset unavailable.' });
  }
});

/**
 * POST /api/game/combat/environment/hazard
 * Canonical environment entry point. Public callers may not invent arbitrary hazards.
 * Player-created hazards must originate from an owned canonical world-effect capability.
 */
gameRouter.post('/combat/environment/hazard', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player?.actorId || 'player_actor_' + storyId;
    const hazard = req.body?.hazard;
    const capabilityId = typeof req.body?.capabilityId === 'string' ? req.body.capabilityId.trim() : '';

    if (!hazard || typeof hazard.id !== 'string' || !capabilityId) {
      return res.status(400).json({
        success: false,
        errorReason: 'capabilityId and a valid hazard definition are required.',
      });
    }

    const capabilityEngine = worldRepository.getCapabilityEngine(storyId);
    const inventory = worldRepository.getInventoryEngine(storyId);
    const effect = capabilityEngine.getAuthoritativeCombatEffect(actorId, capabilityId, inventory);

    if (!effect || effect.resolutionMode !== 'WORLD_EFFECT') {
      return res.status(403).json({
        success: false,
        errorReason: 'Hazards may only be created by an authoritative WORLD_EFFECT capability.',
      });
    }

    const allowedHazard = effect.outcomePayload?.hazard;
    const allowedHazards = Array.isArray(effect.outcomePayload?.hazards)
      ? effect.outcomePayload.hazards
      : [];

    const matchesAllowedHazard = (candidate: unknown): boolean => {
      if (!candidate || typeof candidate !== 'object') return false;
      const candidateId = String((candidate as any).id || '');
      const singleId = allowedHazard && typeof allowedHazard === 'object'
        ? String((allowedHazard as any).id || '')
        : '';
      const listIds = allowedHazards
        .filter((item) => item && typeof item === 'object')
        .map((item) => String((item as any).id || ''));
      return candidateId.length > 0 && (candidateId === singleId || listIds.includes(candidateId));
    };

    if (!matchesAllowedHazard(hazard)) {
      return res.status(403).json({
        success: false,
        errorReason: 'Requested hazard is not present in the capability\'s canonical world-effect payload.',
      });
    }

    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      deterministicId('cmd_hazard', storyId, capabilityId, hazard.id);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'COMBAT_EFFECT',
        payload: {
          effectId: effect.id,
          resolutionMode: effect.resolutionMode,
          targetIds: [],
          capabilityId,
          hazard: effect.outcomePayload?.hazard || hazard,
        },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const result = combatEnvironmentEngine.createHazard({
          repository: context.repository,
          storyId,
          actorId,
          hazard,
        });
        return {
          success: result.success,
          errorReason: result.errorReason,
          data: result,
          summary: result.success ? 'Canonical combat hazard created.' : result.errorReason || 'Hazard creation failed.',
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }

    return res.json({
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      errorReason: error?.message || 'Failed to create combat hazard.',
    });
  }
});

/**
 * POST /api/game/combat/boss/evaluate-phase
 * Re-evaluates a boss using phases authored on its canonical EntityCard.
 * Client-supplied phase definitions are never authoritative.
 */
gameRouter.post('/combat/boss/evaluate-phase', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const bossId = String(req.body?.bossId || '');
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player?.actorId || 'player_actor_' + storyId;

    if (!bossId) {
      return res.status(400).json({ success: false, errorReason: 'bossId is required.' });
    }

    const authoredPhases = bossPhaseEngine.getAuthoredPhases(worldRepository, storyId, bossId);
    if (!authoredPhases.length) {
      return res.status(404).json({
        success: false,
        errorReason: 'No canonical boss phases are registered on the boss EntityCard.',
      });
    }

    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_boss_phase', storyId, bossId, authoredPhases);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'BOSS_PHASE',
        payload: { bossId, phases: authoredPhases },
        source: 'SYSTEM',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const result = bossPhaseEngine.evaluateAndPersist({
          repository: context.repository,
          storyId,
          bossId,
          phases: undefined,
        });
        return {
          success: result.success,
          errorReason: result.errorReason,
          data: result,
          summary: result.success
            ? 'Canonical boss phase evaluation resolved for ' + bossId + '.'
            : result.errorReason || 'Boss phase evaluation failed.',
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }

    return res.json({
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      errorReason: error?.message || 'Failed to evaluate boss phase.',
    });
  }
});

/**
 * POST /api/game/combat/cast
 * Adjudicates capability invocations in tactical combat via CapabilityEngine (CH6/CH7/DEF-CH8-04).
 * Identity is bound to server-authoritative player actor.
 */
gameRouter.post('/combat/cast', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    if (!requireDndTacticalCombat(res, storyId)) return;
    const { actorId: reqActorId, targetId, capabilityId, requestedScale } = req.body;
    if (!targetId || !capabilityId) {
      return res.status(400).json({ success: false, errorReason: 'targetId and capabilityId are required.' });
    }

    const player = worldRepository.getPlayerLifecycle(storyId);
    const serverPlayerActorId = player?.actorId || `player_actor_${storyId}`;

    // Reject impersonation of other casters on public HTTP route
    if (reqActorId && reqActorId !== serverPlayerActorId) {
      return res.status(403).json({
        success: false,
        errorReason: `Unauthorized: cannot cast capability as actor '${reqActorId}'. Caller is bound to server player '${serverPlayerActorId}'.`,
      });
    }

    const actorId = serverPlayerActorId;
    const capEngine = worldRepository.getCapabilityEngine(storyId);
    const combatEngine = worldRepository.getCombatEngine(storyId);
    const chronicle = worldRepository.getHistoricalChronicleEngine(storyId);
    const clock = worldRepository.getWorldClock(storyId);

    const capDef = capEngine.getCapability(capabilityId);
    if (!capDef) {
      return res.status(404).json({ success: false, errorReason: `Capability '${capabilityId}' not found.` });
    }

    if (capDef.effectDefinition) {
      return res.status(409).json({
        success: false,
        code: 'STRUCTURED_EFFECT_REQUIRED',
        errorReason: 'This capability is backed by a canonical CombatEffectDefinition and must use POST /api/game/combat/effect.',
      });
    }

    // CH3.2 Server-authoritative capability grant check
    const inv = worldRepository.getInventoryEngine(storyId);
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

    const capabilityResource =
      capDef.actionType === 'bonus_action'
        ? 'BONUS_ACTION'
        : capDef.actionType === 'reaction'
          ? 'REACTION'
          : 'ACTION';
    const capabilityConsumesResource = capDef.actionType !== 'free';

    if (capabilityConsumesResource && !combatEngine.getActionEconomy().canConsume(actorId, capabilityResource)) {
      return res.status(400).json({
        success: false,
        errorReason: capabilityResource === 'BONUS_ACTION'
          ? 'Bonus Action already used this turn.'
          : capabilityResource === 'REACTION'
            ? 'Reaction already used.'
            : 'Action already used this turn.',
        combatState: getCombatStateHelper(combatEngine, storyId, actorId),
      });
    }

    const perceptionOptions = worldRepository.getCombatPerceptionOptions(storyId, actorId);
    if (!combatEngine.isParticipantKnownToActor(actorId, target, perceptionOptions)) {
      return res.status(403).json({
        success: false,
        errorReason: `Target '${targetId}' is not legitimately perceived or known by actor '${actorId}'.`,
      });
    }

    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/combat/cast", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute<{ targetId: any; capabilityId: any; requestedScale: any }, any>(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'CAST',
        payload: { targetId, capabilityId, requestedScale },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const transactionRepo = context.repository;
        const combatEngine = transactionRepo.getCombatEngine(storyId);
        const capEngine = transactionRepo.getCapabilityEngine(storyId);
        const chronicle = transactionRepo.getHistoricalChronicleEngine(storyId);
        const clock = transactionRepo.getWorldClock(storyId);
        const player = transactionRepo.getPlayerLifecycle(storyId);
        const transactionCapDef = capEngine.getCapability(capabilityId);
        const transactionAttacker = combatEngine.getParticipant(actorId);
        const transactionTarget = combatEngine.getParticipant(targetId);
        if (!transactionCapDef || !transactionAttacker || !transactionTarget) {
          return {
            success: false,
            errorReason: 'Capability, caster, or target is no longer available.',
          };
        }
        const effectiveCaps = capEngine.getEffectiveActorCapabilities(
          actorId,
          transactionRepo.getInventoryEngine(storyId)
        );
        if (!effectiveCaps.some((cap) => cap.id === capabilityId)) {
          return {
            success: false,
            errorReason: `Actor '${actorId}' no longer possesses capability '${capabilityId}'.`,
          };
        }
        const transactionPerception = transactionRepo.getCombatPerceptionOptions(storyId, actorId);
        if (!combatEngine.isParticipantKnownToActor(actorId, transactionTarget, transactionPerception)) {
          return {
            success: false,
            errorReason: `Target '${targetId}' is not legitimately perceived or known by actor '${actorId}'.`,
          };
        }
        const transactionCapabilityResource =
          transactionCapDef.actionType === 'bonus_action'
            ? 'BONUS_ACTION'
            : transactionCapDef.actionType === 'reaction'
              ? 'REACTION'
              : 'ACTION';
        const transactionCapabilityConsumesResource = transactionCapDef.actionType !== 'free';
        if (
          transactionCapabilityConsumesResource &&
          !combatEngine.getActionEconomy().canConsume(actorId, transactionCapabilityResource)
        ) {
          return {
            success: false,
            errorReason: transactionCapabilityResource === 'BONUS_ACTION'
              ? 'Bonus Action already used this turn.'
              : transactionCapabilityResource === 'REACTION'
                ? 'Reaction already used.'
                : 'Action already used this turn.',
          };
        }

        const transactionCapDefForExecution = transactionCapDef;
        const transactionAttackerName = transactionAttacker.name;
        let activationResourceConsumed = false;
        const existingActivation = combatEngine.getPendingActivation(actorId);

        if (transactionCapDefForExecution.activationMode === 'charged') {
          if (!existingActivation || existingActivation.capabilityId !== capabilityId) {
            const turns = transactionCapDefForExecution.chargeTurnsRequired || 1;
            const act = {
              activationId: deterministicId('act', storyId, commandId, actorId, capabilityId, 'charged', combatEngine.getCurrentRound()),
              actorId,
              capabilityId,
              activationMode: 'charged' as const,
              totalTurnsRequired: turns,
              remainingTurns: turns,
              targetId,
              isInterruptible: transactionCapDefForExecution.isInterruptible !== false,
              channelSustainedTurns: 0,
              startedAtRound: combatEngine.getCurrentRound(),
            };
            const actionUse = transactionCapabilityConsumesResource
              ? combatEngine.getActionEconomy().consume(actorId, transactionCapabilityResource)
              : { success: true as const };
            if (!actionUse.success) {
              return {
                success: false,
                errorReason: actionUse.errorReason || 'Action unavailable.',
              };
            }
            activationResourceConsumed = transactionCapabilityConsumesResource;
            combatEngine.startActivation(act);
            return {
              success: true,
              data: {
                pendingActivation: act,
                adjudication: null,
                castResult: null,
              },
              summary: `${transactionAttackerName} began charging ${transactionCapDefForExecution.name} (${turns} turn(s) remaining).`,
            };
          }
          if (existingActivation.remainingTurns > 0) {
            return {
              success: false,
              errorReason: `${transactionCapDefForExecution.name} is still charging (${existingActivation.remainingTurns} turn(s) remaining).`,
            };
          }
          combatEngine.removePendingActivation(actorId);
        } else if (transactionCapDefForExecution.activationMode === 'channelled') {
          if (!existingActivation || existingActivation.capabilityId !== capabilityId) {
            const actionUse = transactionCapabilityConsumesResource
              ? combatEngine.getActionEconomy().consume(actorId, transactionCapabilityResource)
              : { success: true as const };
            if (!actionUse.success) {
              return {
                success: false,
                errorReason: actionUse.errorReason || 'Action unavailable.',
              };
            }
            activationResourceConsumed = transactionCapabilityConsumesResource;
            combatEngine.startActivation({
              activationId: deterministicId('act', storyId, commandId, actorId, capabilityId, 'channelled', combatEngine.getCurrentRound()),
              actorId,
              capabilityId,
              activationMode: 'channelled',
              totalTurnsRequired: 0,
              remainingTurns: 0,
              targetId,
              isInterruptible: transactionCapDefForExecution.isInterruptible !== false,
              channelSustainedTurns: 1,
              startedAtRound: combatEngine.getCurrentRound(),
            });
          }
        }

        const adjProposal = {
          actorId,
          intendedCapabilityId: capabilityId,
          requestedScale: requestedScale || 'Local',
          actionDescription: `Combat invocation of ${transactionCapDefForExecution.name}`,
        };
        const adjudication = capEngine.adjudicate(adjProposal);

        if (!adjudication.approved) {
          return {
            success: false,
            errorReason: `Capability rejected: ${adjudication.rejectionReason}`,
          };
        }

        const castResult = combatEngine.executeCapabilityCast({
          actorId,
          targetId,
          capabilityName: transactionCapDefForExecution.name,
          powerTier: transactionCapDefForExecution.powerTier,
          category: transactionCapDefForExecution.category,
          actionType: transactionCapDefForExecution.actionType || 'action',
          consumeResource: !activationResourceConsumed,
        });

        if (!castResult.success) {
          return {
            success: false,
            errorReason: castResult.headline || 'Capability action could not be resolved.',
          };
        }

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
            transactionRepo.updatePlayerLifecycle(
              storyId,
              player.copyWith({
                deathRecord: {
                  isDead: true,
                  diedAtTimestamp: clock.getTimestamp(),
                  cause: 'Overwhelmed by magical power invocation',
                  revivalPossible: true,
                },
              })
            );
          }
        } else if (updatedTarget && updatedTarget.id !== actorId && updatedTarget.isDead) {
          syncNpcCombatDeath(storyId, updatedTarget, `${transactionAttackerName}'s ${transactionCapDefForExecution.name}`, player?.locationId, transactionRepo);
        }

        const state = getCombatStateHelper(combatEngine, storyId, actorId, transactionRepo);
        if (state.victory) {
          const ts = clock.getTimestamp();
          chronicle.recordEvidence({
            id: `ev_victory_cast_${actorId}_${capabilityId}_${ts.totalElapsedSeconds}_${chronicle.getChronicleEntries().length}`,
            category: 'SACRED_OR_HISTORIC',
            timestamp: ts,
            primarySubjectId: actorId,
            secondarySubjectId: capabilityId,
            locationId: player?.locationId || 'loc_whispering_orrery',
            summary: 'Triumphant Power Invocation in Combat',
            details: `${player?.name || 'Vael'} used ${transactionCapDefForExecution.name} (${transactionCapDefForExecution.powerTier} Tier) to secure battlefield victory.`,
            sourceEventId: `evt_cast_victory_${actorId}_${ts.totalElapsedSeconds}`,
            provenance: 'tactical_power_invocation',
            visibility: 'PUBLIC',
          });
        }

        return {
          success: true,
          data: {
            adjudication,
            castResult,
            powerState: capEngine.getPowerState(actorId),
          },
          summary: `${transactionCapDefForExecution.name} cast committed against ${target.name}.`,
        };
      }
    );

    const state = getCombatStateHelper(combatEngine, storyId, actorId);
    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        combatState: state,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }

    res.json({
      success: true,
      ...(commandResult.data as any),
      combatState: state,
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
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
    const storyId = resolveStoryId(req, true);
    if (!requireDndTacticalCombat(res, storyId)) return;
    const { targetActorId, reason } = req.body;
    if (!targetActorId) {
      return res.status(400).json({ success: false, errorReason: 'targetActorId is required.' });
    }
    const combatEngine = worldRepository.getCombatEngine(storyId);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player?.actorId || `player_actor_${storyId}`;
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/combat/interrupt", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'CORE_ACTION',
        payload: { action: 'INTERRUPT', targetActorId, reason: reason || 'Interrupted' },
        source: 'SYSTEM',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const combatEngine = context.repository.getCombatEngine(storyId);
        const result = combatEngine.interruptActivation(targetActorId, reason || 'Interrupted');
        return {
          success: true,
          data: result,
          summary: `Combat activation interrupted for ${targetActorId}.`,
        };
      }
    );

    const state = getCombatStateHelper(combatEngine, storyId, targetActorId);
    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        combatState: state,
        rolledBack: commandResult.rolledBack,
      });
    }

    res.json({
      ...(commandResult.data as any),
      combatState: state,
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
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
    const storyId = resolveStoryId(req, true);
    if (!requireDndTacticalCombat(res, storyId)) return;
    const player = worldRepository.getPlayerLifecycle(storyId);
    const serverPlayerActorId = player?.actorId || `player_actor_${storyId}`;

    if (req.body?.actorId && req.body.actorId !== serverPlayerActorId) {
      return res.status(403).json({
        success: false,
        errorReason: `Unauthorized: cannot end turn as actor '${req.body.actorId}'. Caller is bound to server player '${serverPlayerActorId}'.`,
      });
    }

    const combatEngine = worldRepository.getCombatEngine(storyId);
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/combat/end-turn", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId: serverPlayerActorId,
        type: 'CORE_ACTION',
        payload: { action: 'END_TURN' },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const transactionRepo = context.repository;
        const combatEngine = transactionRepo.getCombatEngine(storyId);
        const transactionPlayer = transactionRepo.getPlayerLifecycle(storyId);
        const advanceResult = combatEngine.advanceTurn();

        const deadParticipants = combatEngine.getParticipants().filter(
          p => p.isDead && p.id !== serverPlayerActorId
        );
        for (const dp of deadParticipants) {
          syncNpcCombatDeath(storyId, dp, 'environmental hazard', transactionPlayer?.locationId, transactionRepo);
        }

        if (transactionPlayer && !transactionPlayer.isDead) {
          const playerPart = combatEngine.getParticipant(serverPlayerActorId);
          if (playerPart?.isDead) {
            const deadPlayer = transactionPlayer.copyWith({
              deathRecord: {
                isDead: true,
                diedAtTimestamp: transactionRepo.getWorldClock(storyId).getTimestamp(),
                cause: (playerPart.deathSaveState?.failures ?? 0) >= 3
                  ? 'Failed three death saves in tactical combat.'
                  : 'Defeated in tactical combat by environmental hazard.',
                revivalPossible: true,
              },
            });
            transactionRepo.updatePlayerLifecycle(storyId, deadPlayer);
          }
        }

        return {
          success: true,
          data: { advanceResult },
          summary: `Combat turn advanced for ${serverPlayerActorId}.`,
        };
      }
    );

    const state = getCombatStateHelper(combatEngine, storyId, serverPlayerActorId);
    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        combatState: state,
        rolledBack: commandResult.rolledBack,
      });
    }

    res.json({
      success: true,
      ...(commandResult.data as any),
      combatState: state,
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
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
    const storyId = resolveStoryId(req, true);
    if (!requireDndTacticalCombat(res, storyId)) return;
    const player = worldRepository.getPlayerLifecycle(storyId);
    const serverPlayerActorId = player?.actorId || `player_actor_${storyId}`;
    const combatEngine = worldRepository.getCombatEngine(storyId);
    const capEngine = worldRepository.getCapabilityEngine(storyId);

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

    const proposalPreview = { actorId: currentActor.id };

    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/combat/npc-turn", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId: currentActor.id,
        type: 'ATTACK',
        payload: { npcTurn: true, actorId: currentActor.id },
        source: 'AI',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const transactionRepo = context.repository;
        const transactionPlayer = transactionRepo.getPlayerLifecycle(storyId);
        const transactionCombatEngine = transactionRepo.getCombatEngine(storyId);
        const transactionCapEngine = transactionRepo.getCapabilityEngine(storyId);
        const transactionCurrentActor = transactionCombatEngine.getCurrentActor();
        if (!transactionCurrentActor || transactionCurrentActor.id !== currentActor.id) {
          return {
            success: false,
            errorReason: 'NPC turn became stale before canonical resolution.',
          };
        }
        const transactionPerceptionOptions = transactionRepo.getCombatPerceptionOptions(
          storyId,
          transactionCurrentActor.id
        );
        const proposal = NpcTacticalDecisionPolicy.decide({
          actorId: transactionCurrentActor.id,
          combatEngine: transactionCombatEngine,
          capabilityEngine: transactionCapEngine,
          perceptionOptions: transactionPerceptionOptions,
        });
        const executionResult = NpcTacticalDecisionPolicy.executeDecidedAction(
          proposal,
          transactionCombatEngine,
          transactionCapEngine,
          transactionRepo.getRulesProfile(storyId) || rulesProfileEngine.createDefault('FULL_DND')
        );

        const deadParticipants = transactionCombatEngine.getParticipants().filter(
          p => p.isDead && p.id !== serverPlayerActorId
        );
        for (const dp of deadParticipants) {
          syncNpcCombatDeath(storyId, dp, currentActor.name, transactionPlayer?.locationId, transactionRepo);
        }

        const advanceResult = transactionCombatEngine.advanceTurn();

        const postAdvanceDead = transactionCombatEngine.getParticipants().filter(
          p => p.isDead && p.id !== serverPlayerActorId
        );
        for (const dp of postAdvanceDead) {
          syncNpcCombatDeath(storyId, dp, 'environmental hazard', transactionPlayer?.locationId, transactionRepo);
        }

        if (transactionPlayer && !transactionPlayer.isDead) {
          const playerPart = transactionCombatEngine.getParticipant(serverPlayerActorId);
          if (playerPart?.isDead) {
            const deadPlayer = transactionPlayer.copyWith({
              deathRecord: {
                isDead: true,
                diedAtTimestamp: transactionRepo.getWorldClock(storyId).getTimestamp(),
                cause: (playerPart.deathSaveState?.failures ?? 0) >= 3
                  ? 'Failed three death saves in tactical combat.'
                  : 'Defeated in tactical combat by environmental hazard.',
                revivalPossible: true,
              },
            });
            transactionRepo.updatePlayerLifecycle(storyId, deadPlayer);
          }
        }

        return {
          success: true,
          data: { executionResult, advanceResult, proposal },
          summary: `NPC turn for ${currentActor.name} resolved and committed.`,
        };
      }
    );

    const state = getCombatStateHelper(combatEngine, storyId, serverPlayerActorId);
    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        combatState: state,
        rolledBack: commandResult.rolledBack,
      });
    }

    res.json({
      success: true,
      npcActorId: currentActor.id,
      proposal: (commandResult.data as any)?.proposal || proposalPreview,
      ...(commandResult.data as any),
      combatState: state,
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
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

    const registry = worldRepository.getEntityRegistry(storyId);
    const subject = registry.get(memRecord.subjectEntityId);
    if (subject && !subject.memoryRefs.includes(memRecord.id)) {
      registry.upsert({
        ...subject,
        memoryRefs: [...subject.memoryRefs, memRecord.id],
      });
    }
    for (const relatedId of memRecord.relatedEntityIds) {
      const related = registry.get(relatedId);
      if (related && !related.memoryRefs.includes(memRecord.id)) {
        registry.upsert({
          ...related,
          memoryRefs: [...related.memoryRefs, memRecord.id],
        });
      }
    }

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
    const { storyId = 'default_story', secondsToAdvance, hoursToAdvance, commandId: bodyCommandId } = req.body;

    let seconds = Number(secondsToAdvance);
    if (isNaN(seconds) || seconds <= 0) {
      if (hoursToAdvance && !isNaN(Number(hoursToAdvance))) {
        seconds = Number(hoursToAdvance) * 3600;
      } else {
        seconds = 3600; // default 1 hour
      }
    }

    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player?.actorId || `player_actor_${storyId}`;
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.headers['idempotency-key'] as string | undefined) ||
      bodyCommandId ||
      deterministicId('cmd_route', storyId, "/living-world/advance", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId: String(storyId),
        actorId,
        type: 'ADVANCE_TIME',
        payload: { seconds },
        source: 'SYSTEM',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const { WorldSimulationService } = await import('../simulation/worldSimulationService');
        const transactionSimulation = new WorldSimulationService(context.repository);
        const result = transactionSimulation.advanceTime(storyId, seconds);
        return {
          success: true,
          data: {
            storyId,
            secondsAdvanced: seconds,
            ...result,
          },
          summary: `Advanced living world time by ${seconds} seconds.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        storyId,
        commandId: commandResult.commandId,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
      });
    }

    res.json({
      success: true,
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      event: commandResult.event,
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
    const { storyId = 'default_story', event, commandId: bodyCommandId } = req.body;
    if (!event || !event.id || !event.kind || !event.name || !event.triggerTimestamp) {
      res.status(400).json({ error: 'Invalid event payload: id, kind, name, and triggerTimestamp required.' });
      return;
    }

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
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.headers['idempotency-key'] as string | undefined) ||
      bodyCommandId ||
      deterministicId('cmd_route', storyId, "/living-world/schedule-event", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId: String(storyId),
        type: 'INTERACT',
        payload: { action: 'SCHEDULE_LIVING_WORLD_EVENT', event: canonicalEvent },
        source: 'SYSTEM',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        context.repository.getLivingWorldSimulation(storyId).scheduleEvent(canonicalEvent);
        return {
          success: true,
          data: { storyId, event: canonicalEvent },
          summary: `Scheduled living world event ${canonicalEvent.id} through the canonical command path.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        commandId: commandResult.commandId,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
      });
    }

    res.json({
      success: true,
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalCommandEvent: commandResult.event,
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
      storyId = 'default_story',
      npcId,
      npcName,
      knownFacts,
      currentObservations,
      playerSpokenText = '',
      systemDirectives,
    } = req.body;

    const { WorkingContextEngine } = await import('../domain/workingContextEngine');

    let sanitizedPrompt = '';
    const resolvedName = npcName || npcId || 'NPC';

    if (Array.isArray(knownFacts) || Array.isArray(currentObservations) || !npcId) {
      sanitizedPrompt = WorkingContextEngine.buildSanitizedNpcContext({
        npcName: resolvedName,
        knownFacts: Array.isArray(knownFacts) ? knownFacts : [],
        currentObservations: Array.isArray(currentObservations) ? currentObservations : [],
        playerSpokenText: String(playerSpokenText || ''),
        systemDirectives: Array.isArray(systemDirectives) ? systemDirectives : undefined,
      });
    } else {
      sanitizedPrompt = WorkingContextEngine.buildAuthorizedNpcContext({
        storyId: String(storyId),
        npcId: String(npcId),
        npcName: typeof npcName === 'string' ? npcName : undefined,
        playerSpokenText: String(playerSpokenText || ''),
        worldRepo: worldRepository,
      });
    }

    res.json({
      success: true,
      npcId: npcId ? String(npcId) : undefined,
      npcName: resolvedName,
      sanitizedPrompt,
      estimatedTokens: WorkingContextEngine.estimateTokens(sanitizedPrompt),
      epistemicallySanitized: true,
    });
  } catch (error: any) {
    res.status(400).json({
      error: error?.message || 'Failed to build authorized NPC dialogue context.',
      code: 'NPC_CONTEXT_AUTHORIZATION_FAILED',
    });
  }
});

/**
 * ============================================================================
 * CHALLENGE 12: MULTI-MODEL AI ORCHESTRATOR HTTP API (DEF-CH12-08)
 * Canonical routes per DreamBook v10.8.35 §450, §451, V6.0, V7.2
 * ============================================================================
 */

/**
 * GET /api/game/orchestrator/providers/:providerId
 * Returns provider configuration state without exposing API credentials.
 */
gameRouter.get('/orchestrator/providers/:providerId', async (req: Request, res: Response) => {
  try {
    const providerId = String(req.params.providerId);
    const { isProviderConfigured } = await import('../services/providerCredentialService');
    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();
    const adapter = orchestrator.getAdapter(providerId);
    const status = adapter?.getProviderStatus?.() || {
      configured: isProviderConfigured(providerId),
      message: isProviderConfigured(providerId) ? 'Provider configured.' : 'Provider not configured.',
    };

    res.json({
      success: true,
      providerId,
      configured: Boolean(status.configured),
      message: status.message,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to retrieve provider status.' });
  }
});

/**
 * POST /api/game/orchestrator/providers/:providerId/key
 * Stores a provider credential server-side and refreshes that provider's model adapter.
 * The key is never returned to the client.
 */
gameRouter.post('/orchestrator/providers/:providerId/key', async (req: Request, res: Response) => {
  try {
    const providerId = String(req.params.providerId);
    const apiKey = String(req.body?.apiKey || '').trim();
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required.' });
    }

    const { setProviderApiKey } = await import('../services/providerCredentialService');
    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();

    setProviderApiKey(providerId, apiKey);
    orchestrator.syncProviderModelAccessStatus(providerId, true);

    const adapter = orchestrator.getAdapter(providerId);
    const configured = adapter?.validateCredentials ? await adapter.validateCredentials() : true;
    if (!configured) {
      return res.status(400).json({
        error: `The ${providerId} API key was saved but could not be validated.`,
        configured: false,
      });
    }

    if (typeof adapter?.discoverModels === 'function') {
      await orchestrator.refreshDiscovery({ force: true });
    }

    orchestrator.syncProviderModelAccessStatus(providerId, true);

    res.json({
      success: true,
      providerId,
      configured: true,
      message: `${providerId} API key saved and provider validated.`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to save provider API key.' });
  }
});

/**
 * POST /api/game/orchestrator/custom-model
 * Registers a custom model into the orchestrator registry.
 */
gameRouter.post('/orchestrator/custom-model', async (req: Request, res: Response) => {
  try {
    const { providerId = 'openrouter', modelId, displayName, pool, contextWindow, roleEligibility, capabilities } = req.body;
    if (!modelId || !String(modelId).trim()) {
      return res.status(400).json({ success: false, error: 'Model ID is required.' });
    }
    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();
    const record = orchestrator.registerCustomModel({
      providerId: String(providerId).trim(),
      modelId: String(modelId).trim(),
      displayName: displayName ? String(displayName).trim() : undefined,
      pool,
      contextWindow: Number(contextWindow) || undefined,
      roleEligibility,
      capabilities,
    });
    res.json({
      success: true,
      model: record,
      totalModels: orchestrator.getAllModels().length,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to register custom model.' });
  }
});

/**
 * GET /api/game/orchestrator/models
 * Returns all registered models, canonical pools/roles, capabilities, health, and latency.
 */
gameRouter.get('/orchestrator/models', async (req: Request, res: Response) => {
  try {
    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();
    const models = orchestrator.getAllModels();
    const runtimeByKey = new Map(
      orchestrator.getModelRuntimeStatus().map((runtime) => [
        runtime.providerId + '::' + runtime.modelId,
        runtime,
      ])
    );

    res.json({
      success: true,
      count: models.length,
      models: models.map((model) => ({
        ...model,
        runtime: runtimeByKey.get(model.providerId + '::' + model.modelId) || null,
      })),
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
    if (storyId && !worldRepository.getStoryRun(storyId)) {
      worldRepository.seedStory(storyId);
    }
    const orchestrator = worldRepository.getAiOrchestrator();

    const commandId = idempotencyKey || deterministicId('cmd_route', storyId, "/orchestrator/turn", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);
    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId: String(storyId),
        type: 'INTERACT',
        payload: {
          playerAction,
          task,
          hardTokenBudget: Number(hardTokenBudget),
          timeoutMs: Number(timeoutMs),
          maxRetries: Number(maxRetries),
          forceModelId,
          idempotencyKey,
        },
        source: 'AI',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const transactionalOrchestrator = context.repository.getAiOrchestrator();
        const turnResult = await transactionalOrchestrator.executeTurn({
          storyId,
          playerAction,
          task,
          hardTokenBudget: Number(hardTokenBudget),
          timeoutMs: Number(timeoutMs),
          maxRetries: Number(maxRetries),
          forceModelId,
          idempotencyKey,
          repository: context.repository,
        });
        return {
          success: turnResult.success,
          data: turnResult,
          errorReason: turnResult.error,
          summary: `AI turn ${task} resolved through the canonical command path.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
        event: commandResult.event,
      });
    }

    const turnResult = commandResult.data as any;
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
    const phase12 = orchestrator.getPhase12OperationsSnapshot();

    res.json({
      success: true,
      lastTurnTelemetry,
      stats,
      phase12,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve telemetry.' });
  }
});

/**
 * GET /api/game/orchestrator/operations
 * Returns safe Phase 12 provider/model/category telemetry. Credentials and raw provider responses are never returned.
 */
gameRouter.get('/orchestrator/operations', async (_req: Request, res: Response) => {
  try {
    const orchestrator = worldRepository.getAiOrchestrator();
    res.json({
      success: true,
      operations: orchestrator.getPhase12OperationsSnapshot(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to retrieve AI operations telemetry.',
    });
  }
});

/**
 * POST /api/game/orchestrator/category
 * Sets or clears a manual model override for one AI task category only.
 */
gameRouter.post('/orchestrator/category', async (req: Request, res: Response) => {
  try {
    const category = String(req.body?.category || '') as import('../domain/aiOrchestrator').AiTaskCategory;
    const modelKey = req.body?.modelKey ? String(req.body.modelKey) : null;
    const allowedCategories = ['narration', 'world_generation', 'character_genesis', 'research', 'rules', 'speech', 'image'];

    if (!allowedCategories.includes(category)) {
      return res.status(400).json({ success: false, error: 'Invalid AI model category.' });
    }

    const orchestrator = worldRepository.getAiOrchestrator();
    orchestrator.setCategoryModelOverride(category, modelKey);
    res.json({
      success: true,
      category,
      modelKey: orchestrator.getCategoryModelOverride(category) || null,
      categories: orchestrator.getCategoryRuntimeStates(),
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error?.message || 'Failed to update AI category model.',
    });
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
 * POST /api/game/orchestrator/auto-configure-fallbacks
 * Pings all available models across providers, benchmarks response health/latency,
 * and automatically assigns optimal fallback chains (up to 4 models) for all categories.
 */
gameRouter.post('/orchestrator/auto-configure-fallbacks', async (req: Request, res: Response) => {
  try {
    const { maxFallbacksPerCategory } = req.body || {};
    const { worldRepository } = await import('../repositories/worldRepository');
    const orchestrator = worldRepository.getAiOrchestrator();
    const result = await orchestrator.autoConfigureFallbacks({
      maxFallbacksPerCategory: typeof maxFallbacksPerCategory === 'number' ? maxFallbacksPerCategory : undefined,
    });
    res.json(result);
  } catch (error: any) {
    console.error('Failed to auto-configure fallbacks:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to auto-configure fallbacks.' });
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
      narrativeProfile,
      dndRulesMode,
      rulesProfile,
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
      generationSeed,
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
      generationSeed,
      defaultEra,
      canonMode,
      rulesetId,
      storyMode,
      narrativeProfile,
      dndRulesMode,
      rulesProfile,
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

gameRouter.get('/story-runs', async (_req: Request, res: Response) => {
  try {
    const runs = worldRepository.getAllStoryRuns();
    const summaries = runs
      .filter((run: any) => run && run.storyId)
      .map((run: any) => {
        const world = run.worldId ? worldRepository.getWorldTemplate(run.worldId) : null;
        let turnCount = Array.isArray(run.actionHistory) ? run.actionHistory.length : 0;
        try {
          const authoritativeState = serverMockAuthority.getSanitizedViewState(run.storyId);
          turnCount = Array.isArray(authoritativeState.actionHistory)
            ? authoritativeState.actionHistory.length
            : turnCount;
        } catch {
          // A missing dynamic state should not make the library endpoint fail.
        }
        const currentLocation =
          run.currentLocation?.name ||
          run.currentLocationName ||
          run.currentLocationId ||
          run.startingLocation?.name ||
          'Unknown Location';

        return {
          storyId: run.storyId,
          runId: run.id || run.storyId,
          worldId: run.worldId,
          worldTitle: world?.title || run.worldTitle || 'Unknown World',
          worldName: world?.title || run.worldTitle || 'Unknown World',
          genre: world?.genreTags?.[0] || run.genre || 'Dynamic Adventure',
          genreTags: Array.isArray(world?.genreTags) ? world.genreTags : [],
          toneTags: Array.isArray(world?.toneTags) ? world.toneTags : [],
          storyTitle:
            run.title ||
            run.storyTitle ||
            run.initialSceneTitle ||
            `Chronicle of ${world?.title || 'Unknown World'}`,
          title:
            run.title ||
            run.storyTitle ||
            run.initialSceneTitle ||
            `Chronicle of ${world?.title || 'Unknown World'}`,
          characterName: run.characterName || run.protagonist?.identity?.name || 'Protagonist',
          characterRole: run.characterRole || run.protagonist?.role?.profession || run.protagonist?.role?.archetype,
          storyMode: worldRepository.getNarrativeProfile(run.storyId)?.mode || run.storyMode || world?.storyMode || 'PROTAGONIST',
          narrativeProfile: worldRepository.getNarrativeProfile(run.storyId),
          dndRulesMode: worldRepository.getRulesProfile(run.storyId)?.mode || 'FULL_DND',
          currentLocation,
          turnCount,
          lastPlayed: run.updatedAt || run.createdAt || null,
          createdAt: run.createdAt || null,
          updatedAt: run.updatedAt || run.createdAt || null,
          imageAsset: run.imageAsset || run.storyRunCover || world?.imageAsset,
          imageMetadata: run.imageMetadata || world?.imageMetadata,
          visualIdentity: world
            ? worldVisualIdentityService.buildStoryRunIdentity(run, world)
            : undefined,
          excerpt: run.initialScene || run.openingScene?.narrativeText || '',
          status: run.status || 'ACTIVE',
        };
      })
      .sort((a: any, b: any) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

    res.json(summaries);
  } catch (error) {
    console.error('Error listing story runs:', error);
    res.status(500).json({ error: 'Failed to retrieve Story Run library.' });
  }
});

gameRouter.put('/worlds/:worldId/visual-asset', async (req: Request, res: Response) => {
  try {
    const worldId = String(req.params.worldId);
    const world = worldRepository.getWorldTemplate(worldId);
    if (!world) {
      return res.status(404).json({ error: `World template "${worldId}" not found.` });
    }

    const { imageAsset, imageMetadata } = req.body || {};
    if (imageAsset !== undefined && imageAsset !== null && typeof imageAsset !== 'string') {
      return res.status(400).json({ error: 'imageAsset must be a string or null when provided.' });
    }

    const updatedWorld = {
      ...world,
      ...(imageAsset !== undefined && imageAsset !== null ? { imageAsset } : {}),
      ...(imageMetadata !== undefined ? { imageMetadata } : {}),
      updatedAt: new Date().toISOString(),
    };
    if (imageAsset === null) {
      delete updatedWorld.imageAsset;
      if (imageMetadata === undefined) delete updatedWorld.imageMetadata;
    }

    worldRepository.saveWorldTemplate(updatedWorld);
    res.json(updatedWorld);
  } catch (error: any) {
    console.error('Error saving world visual asset:', error);
    res.status(500).json({ error: error?.message || 'Failed to save world visual asset.' });
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
      storyMode,
      narrativeProfile,
      dndRulesMode,
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

    let targetConfirmedCharacter: any = null;

    if (confirmedCharacter || characterId) {
      const resolution = resolveCanonicalConfirmedCharacter(worldId, confirmedCharacter, characterId);
      if (resolution.error) {
        return res.status(resolution.error.status).json({
          error: resolution.error.message,
          code: resolution.error.code,
        });
      }
      targetConfirmedCharacter = resolution.character;
    }

    let storyId: string;
    let run: any;

    if (targetConfirmedCharacter) {
      // Primary Slice 3 creation from Confirmed Character
      const creationResult = worldRepository.createStoryRunFromConfirmedCharacter({
        worldId,
        confirmedCharacter: targetConfirmedCharacter,
        storyMode,
        narrativeProfile,
        dndRulesMode,
      });
      storyId = creationResult.storyId;
      run = creationResult.run;
    } else {
      // Legacy backwards-compatibility. Use canonical repository order rather than wall-clock entropy
      // so the same starting repository + input produces the same run identity.
      const legacyRunSequence = worldRepository.getAllStoryRuns().length + 1;
      storyId = deterministicId(
        'run_legacy',
        worldId,
        legacyRunSequence,
        characterName || 'Hero Vael',
        characterRole || '',
        characterBackground || ''
      );
      worldRepository.seedDynamicStoryRun(storyId, world, {
        storyMode,
        narrativeProfile,
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
      storyMode: worldRepository.getNarrativeProfile(storyId)?.mode || run?.storyMode || world.storyMode || 'PROTAGONIST',
      narrativeProfile: worldRepository.getNarrativeProfile(storyId),
      dndRulesMode: worldRepository.getRulesProfile(storyId)?.mode || run?.dndRulesMode || dndRulesMode || world.dndRulesMode || 'FULL_DND',
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
    const {
      naturalLanguageConcept,
      existingDraft,
      userEditedFields,
      narrativeRole,
      allowDeterministicFallback,
    } = req.body;
    const worldTemplate = worldRepository.getWorldTemplate(worldId);
    if (!worldTemplate) {
      return res.status(404).json({ error: `World ${worldId} not found.` });
    }

    const draft = await characterGenesisService.extractCharacterDraft(
      {
        naturalLanguageConcept: naturalLanguageConcept || '',
        worldId,
        existingDraft,
        userEditedFields,
        narrativeRole,
        allowDeterministicFallback: allowDeterministicFallback === true,
      },
      worldTemplate
    );

    res.json({ success: true, draft });
  } catch (error: any) {
    if (error?.code === 'AI_UNAVAILABLE' && error?.requiresDeterministicConfirmation) {
      console.info('[Character Genesis] AI extraction unavailable, prompting player for deterministic fallback confirmation:', error?.message);
      return res.status(422).json({
        error: error?.message || 'AI character extraction is currently unavailable.',
        code: 'AI_UNAVAILABLE',
        requiresDeterministicConfirmation: true,
        reason: error?.message || 'AI providers did not return a usable character extraction.',
        attemptsTrail: Array.isArray(error?.attemptsTrail) ? error.attemptsTrail : [],
      });
    }
    console.error('Error extracting character draft:', error);
    res.status(500).json({ error: error?.message || 'Failed to extract character draft.' });
  }
});

/**
 * POST /api/game/worlds/:worldId/characters/custom-capability
 * Synthesizes a structured custom capability proposal with linked techniques.
 */
gameRouter.get('/worlds/:worldId/characters/progression-modules', async (req: Request, res: Response) => {
	try {
		const worldId = String(req.params.worldId || '');
		const world = worldRepository.getWorldTemplate(worldId);
		if (!world) return res.status(404).json({ success: false, errorReason: 'World not found.' });
		const { CharacterProgressionEngine } = await import('../domain/characterProgressionEngine');
		const engine = new CharacterProgressionEngine();
		const worldModules = Array.isArray(world.characterProgressionModules) ? world.characterProgressionModules : [];
		if (worldModules.length > 0) engine.registerModules(worldModules);
		res.json({
			success: true,
			worldId,
			modules: engine.getAllModules().filter((module) => module.enabled),
		});
	} catch (error: any) {
		res.status(500).json({ success: false, errorReason: error?.message || 'Failed to load progression modules.' });
	}
});

/**
 * POST /api/game/worlds/:worldId/characters/progression-infer
 * AI suggests registered class/subclass/species selections from the character context.
 */
gameRouter.post('/worlds/:worldId/characters/progression-infer', async (req: Request, res: Response) => {
  try {
    const worldId = String(req.params.worldId || '');
    const worldTemplate = worldRepository.getWorldTemplate(worldId);
    if (!worldTemplate) return res.status(404).json({ success: false, errorReason: 'World not found.' });

    const result = await characterGenesisService.inferCharacterProgression(
      {
        worldId,
        concept: req.body?.concept,
        background: req.body?.background,
        profession: req.body?.profession,
        archetype: req.body?.archetype,
        species: req.body?.species,
        classId: req.body?.classId,
        narrativeRole: req.body?.narrativeRole,
      },
      worldTemplate
    );
    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error inferring character progression:', error);
    return res.status(500).json({ success: false, errorReason: error?.message || 'Failed to infer progression.' });
  }
});

/**
 * POST /api/game/worlds/:worldId/characters/progression-custom
 * AI generates a normalized player-authored class/subclass/species module.
 */
gameRouter.post('/worlds/:worldId/characters/progression-custom', async (req: Request, res: Response) => {
  try {
    const worldId = String(req.params.worldId || '');
    const worldTemplate = worldRepository.getWorldTemplate(worldId);
    if (!worldTemplate) return res.status(404).json({ success: false, errorReason: 'World not found.' });

    const type = String(req.body?.type || '').toUpperCase();
    if (!['CLASS', 'SUBCLASS', 'SPECIES'].includes(type)) {
      return res.status(400).json({ success: false, errorReason: 'type must be CLASS, SUBCLASS, or SPECIES.' });
    }

    const module = await characterGenesisService.proposeCustomProgressionModule(
      {
        worldId,
        type: type as 'CLASS' | 'SUBCLASS' | 'SPECIES',
        name: req.body?.name,
        concept: req.body?.concept,
        parentClassId: req.body?.parentClassId,
        background: req.body?.background,
        species: req.body?.species,
        profession: req.body?.profession,
        archetype: req.body?.archetype,
      },
      worldTemplate
    );
    return res.json({ success: true, module });
  } catch (error: any) {
    console.error('Error generating custom progression module:', error);
    return res.status(500).json({ success: false, errorReason: error?.message || 'Failed to generate custom progression module.' });
  }
});

/**
 * POST /api/game/worlds/:worldId/characters/condition-suggest
 * AI proposes current condition + defensive profile for player review.
 */
gameRouter.post('/worlds/:worldId/characters/condition-suggest', async (req: Request, res: Response) => {
  try {
    const worldId = String(req.params.worldId || '');
    const worldTemplate = worldRepository.getWorldTemplate(worldId);
    if (!worldTemplate) return res.status(404).json({ success: false, errorReason: 'World not found.' });

    const conditionState = await characterGenesisService.proposeStartingConditionState(
      {
        worldId,
        concept: req.body?.concept,
        background: req.body?.background,
        identity: req.body?.identity,
        startingSituation: req.body?.startingSituation,
        currentStateNote: req.body?.currentStateNote,
      },
      worldTemplate
    );

    return res.json({ success: true, conditionState });
  } catch (error: any) {
    console.error('Error suggesting starting condition:', error);
    return res.status(500).json({ success: false, errorReason: error?.message || 'Failed to suggest starting condition.' });
  }
});

gameRouter.post('/worlds/:worldId/characters/custom-capability', async (req: Request, res: Response) => {
  try {
    const worldId = String(req.params.worldId);
    const { capabilityConcept, characterContext } = req.body;
    const worldTemplate = worldRepository.getWorldTemplate(worldId);
    if (!worldTemplate) {
      return res.status(404).json({ error: `World ${worldId} not found.` });
    }

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
 * POST /api/game/worlds/:worldId/characters/custom-feat
 * Synthesizes a structured custom feat proposal based on feat concept.
 */
gameRouter.post('/worlds/:worldId/characters/custom-feat', async (req: Request, res: Response) => {
  try {
    const worldId = String(req.params.worldId);
    const { featName, featConcept, characterContext } = req.body;
    const worldTemplate = worldRepository.getWorldTemplate(worldId);
    if (!worldTemplate) {
      return res.status(404).json({ error: `World ${worldId} not found.` });
    }

    const feat = await characterGenesisService.proposeCustomFeat(
      {
        worldId,
        featName: featName || '',
        featConcept: featConcept || '',
        characterContext,
      },
      worldTemplate
    );

    res.json({ success: true, feat });
  } catch (error: any) {
    console.error('Error proposing custom feat:', error);
    res.status(500).json({ error: error?.message || 'Failed to propose custom feat.' });
  }
});

/**
 * POST /api/game/worlds/:worldId/characters/custom-attribute
 * Synthesizes a structured custom attribute/stat proposal based on natural language input.
 */
gameRouter.post('/worlds/:worldId/characters/custom-attribute', async (req: Request, res: Response) => {
  try {
    const worldId = String(req.params.worldId);
    const { attributeName, attributeConcept, category, characterContext } = req.body;
    const worldTemplate = worldRepository.getWorldTemplate(worldId);
    if (!worldTemplate) {
      return res.status(404).json({ error: `World ${worldId} not found.` });
    }

    const attribute = await characterGenesisService.proposeCustomAttribute(
      {
        worldId,
        attributeName: attributeName || '',
        attributeConcept: attributeConcept || '',
        category,
        characterContext,
      },
      worldTemplate
    );

    res.json({ success: true, attribute });
  } catch (error: any) {
    console.error('Error proposing custom attribute:', error);
    res.status(500).json({ error: error?.message || 'Failed to propose custom attribute.' });
  }
});

/**
 * POST /api/game/worlds/:worldId/characters/custom-skill
 * Synthesizes a structured custom skill proposal based on skill concept.
 */
gameRouter.post('/worlds/:worldId/characters/custom-skill', async (req: Request, res: Response) => {
  try {
    const worldId = String(req.params.worldId);
    const { skillName, skillConcept, characterContext } = req.body;
    const worldTemplate = worldRepository.getWorldTemplate(worldId);
    if (!worldTemplate) {
      return res.status(404).json({ error: `World ${worldId} not found.` });
    }

    const skill = await characterGenesisService.proposeCustomSkill(
      {
        worldId,
        skillName: skillName || '',
        skillConcept: skillConcept || '',
        characterContext,
      },
      worldTemplate
    );

    res.json({ success: true, skill });
  } catch (error: any) {
    console.error('Error proposing custom skill:', error);
    res.status(500).json({ error: error?.message || 'Failed to propose custom skill.' });
  }
});

/**
 * POST /api/game/worlds/:worldId/characters/custom-equipment
 * Synthesizes a structured starting equipment item proposal based on concept.
 */
gameRouter.post('/worlds/:worldId/characters/custom-equipment', async (req: Request, res: Response) => {
  try {
    const worldId = String(req.params.worldId);
    const { itemName, itemConcept, characterContext } = req.body;
    const worldTemplate = worldRepository.getWorldTemplate(worldId);
    if (!worldTemplate) {
      return res.status(404).json({ error: `World ${worldId} not found.` });
    }

    const item = await characterGenesisService.proposeCustomEquipment(
      {
        worldId,
        itemName: itemName || '',
        itemConcept: itemConcept || '',
        characterContext,
      },
      worldTemplate
    );

    res.json({ success: true, item });
  } catch (error: any) {
    console.error('Error proposing custom equipment:', error);
    res.status(500).json({ error: error?.message || 'Failed to propose custom equipment.' });
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
    const { storyId = 'default_story', prompt, assetId, aspectRatio, tags, slotType } = req.body;
    const { mediaAdapterService } = await import('../services/mediaAdapterService');
    const result = await mediaAdapterService.generateImage({
      storyId,
      prompt,
      assetId,
      aspectRatio,
      tags,
      slotType,
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

gameRouter.put('/worlds/runs/:storyId/visual-asset', async (req: Request, res: Response) => {
  try {
    const storyId = String(req.params.storyId);
    const run = worldRepository.getStoryRun(storyId);
    if (!run) {
      return res.status(404).json({ error: `Story Run "${storyId}" not found.` });
    }

    const { imageAsset, imageMetadata } = req.body || {};
    if (imageAsset !== undefined && imageAsset !== null && typeof imageAsset !== 'string') {
      return res.status(400).json({ error: 'imageAsset must be a string or null when provided.' });
    }

    const updatedRun = {
      ...run,
      ...(imageAsset !== undefined && imageAsset !== null ? { imageAsset } : {}),
      ...(imageMetadata !== undefined ? { imageMetadata } : {}),
      updatedAt: new Date().toISOString(),
    };
    if (imageAsset === null) {
      delete updatedRun.imageAsset;
      if (imageMetadata === undefined) delete updatedRun.imageMetadata;
    }

    worldRepository.saveStoryRun(updatedRun);
    const world = worldRepository.getWorldTemplate(updatedRun.worldId);
    const projectedRun = getPlayerStoryRunProjection(storyId);
    res.json({
      ...(projectedRun || {}),
      visualIdentity: world
        ? worldVisualIdentityService.buildStoryRunIdentity(updatedRun, world)
        : undefined,
    });
  } catch (error: any) {
    console.error('Error saving Story Run visual asset:', error);
    res.status(500).json({ error: error?.message || 'Failed to save Story Run visual asset.' });
  }
});

gameRouter.get('/worlds/runs/:storyId', async (req: Request, res: Response) => {
  try {
    const storyId = req.params.storyId as string;
    const projectedRun = getPlayerStoryRunProjection(storyId);
    if (!projectedRun) {
      return res.status(404).json({ error: 'Story run not found.' });
    }
    res.json(projectedRun);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve story run.' });
  }
});

gameRouter.post('/worlds/runs/:storyId/story-director/step', async (req: Request, res: Response) => {
  try {
    const { storyDirectorService } = await import('../services/storyDirectorService');
    const storyId = req.params.storyId as string;
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player?.actorId || `player_actor_${storyId}`;
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/worlds/runs/:storyId/story-director/step", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'INTERACT',
        payload: { action: 'STORY_DIRECTOR_STEP' },
        source: 'SYSTEM',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const result = storyDirectorService.stepDirector(storyId, context.repository);
        return {
          success: true,
          data: result,
          summary: 'Story Director advanced through the canonical command path.',
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }

    res.json({
      success: true,
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
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
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player?.actorId || `player_actor_${storyId}`;
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/worlds/runs/:storyId/story-director/choice", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'INTERACT',
        payload: { beatId, optionId },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const result = storyDirectorService.recordChoice(
          storyId,
          beatId,
          optionId,
          context.repository
        );
        return {
          success: result.success,
          data: { ...result, recordedChoice: { beatId, optionId } },
          errorReason: result.success ? undefined : (result.consequences?.join('; ') || 'Story choice rejected.'),
          summary: `Story choice ${optionId} recorded for beat ${beatId}.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }

    res.json({
      success: true,
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record story director choice.' });
  }
});

gameRouter.post('/worlds/runs/:storyId/story-director/offscreen', async (req: Request, res: Response) => {
  try {
    const { storyDirectorService } = await import('../services/storyDirectorService');
    const storyId = req.params.storyId as string;
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player?.actorId || `player_actor_${storyId}`;
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/worlds/runs/:storyId/story-director/offscreen", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'INTERACT',
        payload: { action: 'ADVANCE_OFFSCREEN_WORLD_ACTOR' },
        source: 'SYSTEM',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const result = storyDirectorService.advanceOffscreenProtagonist(
          storyId,
          context.repository
        );
        return {
          success: result.success,
          data: result,
          errorReason: result.success ? undefined : result.actionTaken,
          summary: 'Offscreen narrative activity resolved.',
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }

    res.json({
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
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

    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/worlds/runs/:storyId/actions/execute", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player?.actorId || `player_actor_${storyId}`;

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'INTERACT',
        payload: { actionType: actionType || 'INVESTIGATE_AREA', locationId },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const transactionRepo = context.repository;
        const run = transactionRepo.getStoryRun(storyId);
        if (!run) {
          return { success: false, errorReason: 'Story run not found.' };
        }

        if (locationId) {
          run.currentLocationId = locationId;
          transactionRepo.saveStoryRun(run);
        }

        const canonicalTimestamp = transactionRepo.getWorldClock(storyId).getTimestamp();
        const canonicalActionType = actionType || 'INVESTIGATE_AREA';
        const gameplayEventId = deterministicId(
          'evt_gameplay',
          storyId,
          canonicalActionType,
          locationId || run.currentLocationId || 'loc_unknown',
          commandId
        );
        const gameplayEvent = {
          eventId: gameplayEventId,
          storyId,
          eventType: canonicalActionType,
          actorId: run.characterName || 'Player',
          locationId: run.currentLocationId || 'loc_unknown',
          details: `Server resolved action ${canonicalActionType} at ${run.currentLocationId}`,
          evidenceItems: [deterministicId('ev_gameplay', gameplayEventId)],
          timestamp: formatCanonicalTimestamp(canonicalTimestamp),
        };

        const narrativeResult = emergentNarrativeEngine.processCanonicalEvent(gameplayEvent, transactionRepo);
        const storyThreads = transactionRepo.getStoryThreads(storyId);

        return {
          success: true,
          data: { gameplayEvent, narrativeResult, storyThreads, storyRun: run },
          summary: `Interaction ${actionType || 'INVESTIGATE_AREA'} committed.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }

    res.json({
      success: true,
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
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
    const storyId = req.params.storyId as string;
    const { abilityService } = await import('../services/abilityService');
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player?.actorId || `player_actor_${storyId}`;
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/worlds/runs/:storyId/actions/apply-ability", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'APPLY_ABILITY',
        payload: { abilityId, targetId },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const result = abilityService.resolveAbilityApplication(
          storyId,
          abilityId,
          targetId,
          req.body,
          context.repository
        );
        if (!result.success) {
          return {
            success: false,
            errorReason: result.errorReason || 'Ability application rejected.',
            statusCode: result.statusCode,
          };
        }
        return {
          success: true,
          data: result,
          summary: `Ability ${abilityId} applied to ${targetId}.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(commandResult.statusCode || 400).json({
        error: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }

    res.json({
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to apply ability.' });
  }
});

gameRouter.post('/worlds/runs/:storyId/dice-clash/resolve', async (req: Request, res: Response) => {
  try {
    const { playerPool, enemyPool, exchangeIndex, attackerStats, defenderStats } = req.body;
    const storyId = req.params.storyId as string;
    const player = worldRepository.getPlayerLifecycle(storyId);
    const actorId = player?.actorId || `player_actor_${storyId}`;
    const commandId =
      (req.headers['x-command-id'] as string | undefined) ||
      (req.body?.commandId as string | undefined) ||
      deterministicId('cmd_route', storyId, "/worlds/runs/:storyId/dice-clash/resolve", req.body || {}, worldRepository.getCanonicalCommandEvents(storyId).length + 1);

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'CORE_ACTION',
        payload: { action: 'DICE_CLASH', playerPool, enemyPool, exchangeIndex, attackerStats, defenderStats },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const result = context.repository.resolveDiceClashExchange(storyId, playerPool, enemyPool, {
          exchangeIndex,
          attackerStats,
          defenderStats,
        });
        return {
          success: result.success !== false,
          data: result,
          errorReason: result.success === false ? 'Dice clash rejected.' : undefined,
          summary: 'Legacy dice-clash exchange resolved through the canonical command path.',
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        error: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }

    res.json({
      ...(commandResult.data as any),
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to resolve dice clash.' });
  }
});

gameRouter.post('/worlds/runs/:storyId/spells/evaluate', async (req: Request, res: Response) => {
  try {
    const { spellProposal } = req.body;
    const { worldRepository } = await import('../repositories/worldRepository');
    const storyId = req.params.storyId as string;
    if (!worldRepository.getStoryRun(storyId)) {
      return res.status(404).json({
        success: false,
        code: 'STORY_RUN_NOT_FOUND',
        errorReason: `StoryRun with ID "${storyId}" was not found.`,
      });
    }
    const result = worldRepository.evaluateCustomSpellProposal(storyId, spellProposal || req.body);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to evaluate spell proposal.' });
  }
});

// ============================================================
// PHASE 6: AUTHORITATIVE SPELL RUNTIME API ROUTES
// ============================================================

/**
 * GET /api/game/spells/catalog
 * Returns the authoritative spell catalog, with optional filtering.
 */
function resolveSpellCommandId(req: Request, storyId: string, route: string): string {
  return (
    (req.headers['x-command-id'] as string | undefined) ||
    (req.body?.commandId as string | undefined) ||
    deterministicId(
      'cmd_route',
      storyId,
      route,
      req.body || {},
      worldRepository.getCanonicalCommandEvents(storyId).length + 1
    )
  );
}

function buildCanonicalSelfParticipant(
  repository: import('../repositories/worldRepository').InMemoryWorldRepository,
  storyId: string,
  actorId: string,
  runtime: import('../domain/spellRuntime').SpellRuntime
): import('../domain/combatEngine').BattlefieldParticipant {
  const conditionState = repository.getConditionEngine(storyId).getActorState(actorId);
  const player = repository.getPlayerLifecycle(storyId);
  const npc = player?.actorId === actorId ? null : repository.getNpcLifecycle(storyId, actorId);
  const state = runtime.getOrCreateActorState(actorId);
  const progression = repository.getCharacterProgressionEngine(storyId);
  const rulesProfile = repository.getRulesProfile(storyId);
  const progressionModifiers = progression.getState(actorId) ? progression.resolveModifiers(actorId, rulesProfile).modifiers : [];
  const progressionValue = (target: string) => progressionModifiers.find((modifier) => modifier.target === target)?.value || 0;
  const hpCurrent = Math.max(0, Number(conditionState?.healthCurrent ?? 30));
  const hpMax = Math.max(1, Number(conditionState?.healthMax ?? (hpCurrent || 30)));
  const dead = Boolean(conditionState?.dead || hpCurrent <= 0);

  return {
    id: actorId,
    name: player?.actorId === actorId ? player.name : (npc?.name || actorId),
    team: player?.actorId === actorId ? 'player_allies' : 'neutral',
    x: 0,
    y: 0,
    initiative: 0,
    armorClass: 10,
    hpCurrent,
    hpMax: hpMax + progressionValue('coreStats.hpMax'),
    speedCells: Math.max(0, 6 + Math.trunc(progressionValue('coreStats.speed') / 5)),
    attackBonus: state.spellAttackBonus + progressionValue('spell.attackBonus'),
    damageFormula: '1d4',
    conditions: conditionState?.instances.map((instance) => instance.name) || (dead ? ['Dead'] : []),
    isDead: dead,
    saveModifiers: {},
    savingThrowModifiers: {},
    spellAttackBonus: state.spellAttackBonus + progressionValue('spell.attackBonus'),
    spellSaveDc: state.spellSaveDc + progressionValue('spell.saveDC'),
    spellSlots: state.spellSlots,
    knownSpells: state.knownSpells,
    preparedSpells: state.preparedSpells,
    activeConcentration: state.activeConcentration,
  };
}

function recordCanonicalSpellEvidence(
  repository: import('../repositories/worldRepository').InMemoryWorldRepository,
  storyId: string,
  commandId: string,
  actorId: string,
  result: import('../domain/spellRuntime').CastSpellExecutionResult,
  targetId?: string
): void {
  const player = repository.getPlayerLifecycle(storyId);
  const clock = repository.getWorldClock(storyId);
  const timestamp = clock.getTimestamp();
  repository.getHistoricalChronicleEngine(storyId).recordEvidence({
    id: deterministicId('ev_spell_cast', storyId, commandId),
    sourceEventId: commandId,
    category: 'SACRED_OR_HISTORIC',
    timestamp,
    primarySubjectId: actorId,
    secondarySubjectId: targetId,
    locationId: player?.locationId || 'loc_unknown',
    summary: result.headline,
    details: result.headline,
    provenance: 'canonical_spell_runtime',
    visibility: 'PUBLIC',
    metadata: {
      spellId: result.spellId,
      spellName: result.spellName,
      slotLevelUsed: result.slotLevelUsed,
      targetDied: result.targetDied,
      damageInflicted: result.damageInflicted,
      healingApplied: result.healingApplied,
      targetHpRemaining: result.targetHpRemaining,
      targetImmune: result.targetImmune,
      targetResisted: result.targetResisted,
      targetVulnerable: result.targetVulnerable,
      concentrationEstablished: result.concentrationEstablished,
      conditionsApplied: result.conditionsApplied,
      conditionsRemoved: result.conditionsRemoved,
    },
  });
}

/**
 * GET /api/game/spells/catalog
 * Returns the authoritative spell catalog for the active story.
 */
gameRouter.get('/spells/catalog', (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const runtime = worldRepository.getCombatEngine(storyId).getSpellRuntime();
    const levelStr = req.query.level as string | undefined;
    const school = req.query.school as string | undefined;
    const ritual = req.query.ritual as string | undefined;
    const concentration = req.query.concentration as string | undefined;
    const search = req.query.search as string | undefined;

    let spells = runtime.getAllSpells();
    if (levelStr !== undefined && levelStr !== '') {
      const level = parseInt(levelStr, 10);
      if (!isNaN(level)) spells = spells.filter((s) => s.level === level);
    }
    if (school) spells = spells.filter((s) => s.school.toLowerCase() === school.toLowerCase());
    if (ritual !== undefined) spells = spells.filter((s) => Boolean(s.isRitual) === (ritual === 'true' || ritual === '1'));
    if (concentration !== undefined) spells = spells.filter((s) => Boolean(s.requiresConcentration) === (concentration === 'true' || concentration === '1'));
    if (search) {
      const q = search.toLowerCase();
      spells = spells.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
    }

    res.json({ success: true, count: spells.length, spells });
  } catch (error: any) {
    res.status(500).json({ success: false, errorReason: error?.message || 'Failed to list spells.' });
  }
});

/**
 * GET /api/game/spells/catalog/:spellId
 */
gameRouter.get('/spells/catalog/:spellId', (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const runtime = worldRepository.getCombatEngine(storyId).getSpellRuntime();
    const spellId = req.params.spellId as string;
    const spell = runtime.getSpell(spellId);
    if (!spell) return res.status(404).json({ success: false, errorReason: `Spell "${spellId}" not found in catalog.` });
    res.json({ success: true, spell });
  } catch (error: any) {
    res.status(500).json({ success: false, errorReason: error?.message || 'Failed to get spell.' });
  }
});

/**
 * GET /api/game/spells/actor/:actorId
 * Read-only spellcasting state for an actor.
 */
gameRouter.get('/spells/actor/:actorId', (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const runtime = worldRepository.getCombatEngine(storyId).getSpellRuntime();
    const actorId = req.params.actorId as string;
    const state = runtime.getActorState(actorId);
    if (!state) {
      return res.status(404).json({
        success: false,
        code: 'SPELL_STATE_NOT_FOUND',
        errorReason: `No spellcasting state exists for actor "${actorId}".`,
      });
    }
    res.json({ success: true, actorId, state });
  } catch (error: any) {
    res.status(500).json({ success: false, errorReason: error?.message || 'Failed to get actor spell state.' });
  }
});

/**
 * POST /api/game/spells/slots/initialize
 */
gameRouter.post('/spells/slots/initialize', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const { actorId, slots } = req.body;
    if (!actorId || !slots || typeof slots !== 'object') {
      return res.status(400).json({ success: false, errorReason: 'actorId and slots mapping required.' });
    }

    const commandId = resolveSpellCommandId(req, storyId, '/spells/slots/initialize');
    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'CAST',
        payload: { spellId: '__spell_slots__', action: 'INITIALIZE_SLOTS', slots },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const runtime = context.repository.getCombatEngine(storyId).getSpellRuntime();
        runtime.initializeSlots(actorId, slots);
        const state = runtime.getOrCreateActorState(actorId);
        return {
          success: true,
          data: { success: true, actorId, spellSlots: state.spellSlots },
          summary: `Initialized spell slots for ${actorId}.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }
    res.json({ ...(commandResult.data as any), commandId: commandResult.commandId, canonicalEvent: commandResult.event });
  } catch (error: any) {
    res.status(400).json({ success: false, errorReason: error?.message || 'Failed to initialize spell slots.' });
  }
});

/**
 * POST /api/game/spells/prepare
 */
gameRouter.post('/spells/prepare', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const { actorId, spellId, prepare } = req.body;
    if (!actorId || !spellId) {
      return res.status(400).json({ success: false, errorReason: 'actorId and spellId are required.' });
    }

    const commandId = resolveSpellCommandId(req, storyId, '/spells/prepare');
    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'CAST',
        payload: { spellId, action: prepare === false ? 'UNPREPARE' : 'PREPARE' },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const runtime = context.repository.getCombatEngine(storyId).getSpellRuntime();
        const result = prepare === false
          ? runtime.unprepareSpell(actorId, spellId)
          : runtime.prepareSpell(actorId, spellId);
        if (!result.success) return { success: false, errorReason: result.errorReason };
        const state = runtime.getOrCreateActorState(actorId);
        return {
          success: true,
          data: {
            success: true,
            actorId,
            spellId,
            prepared: prepare !== false,
            preparedSpells: state.preparedSpells,
          },
          summary: `${prepare === false ? 'Unprepared' : 'Prepared'} ${spellId} for ${actorId}.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({ success: false, errorReason: commandResult.errorReason, rolledBack: commandResult.rolledBack, commandId: commandResult.commandId });
    }
    res.json({ ...(commandResult.data as any), commandId: commandResult.commandId, canonicalEvent: commandResult.event });
  } catch (error: any) {
    res.status(400).json({ success: false, errorReason: error?.message || 'Failed to update prepared spell.' });
  }
});

/**
 * POST /api/game/spells/learn
 */
gameRouter.post('/spells/learn', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const { actorId, spellId } = req.body;
    if (!actorId || !spellId) {
      return res.status(400).json({ success: false, errorReason: 'actorId and spellId are required.' });
    }

    const commandId = resolveSpellCommandId(req, storyId, '/spells/learn');
    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'CAST',
        payload: { spellId, action: 'LEARN' },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const runtime = context.repository.getCombatEngine(storyId).getSpellRuntime();
        const result = runtime.learnSpell(actorId, spellId);
        if (!result.success) return { success: false, errorReason: result.errorReason };
        return {
          success: true,
          data: { success: true, actorId, knownSpells: result.knownSpells },
          summary: `Learned spell ${spellId} for ${actorId}.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({ success: false, errorReason: commandResult.errorReason, rolledBack: commandResult.rolledBack, commandId: commandResult.commandId });
    }
    res.json({ ...(commandResult.data as any), commandId: commandResult.commandId, canonicalEvent: commandResult.event });
  } catch (error: any) {
    res.status(400).json({ success: false, errorReason: error?.message || 'Failed to learn spell.' });
  }
});

/**
 * POST /api/game/spells/slots/reset
 * Slot recovery remains available as a canonical state transition; rest-policy ownership is
 * intentionally left to the Phase 7 recovery system.
 */
gameRouter.post('/spells/slots/reset', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const { actorId, restType } = req.body;
    if (!actorId) return res.status(400).json({ success: false, errorReason: 'actorId is required.' });
    const type: 'SHORT' | 'LONG' = restType === 'SHORT' ? 'SHORT' : 'LONG';
    const commandId = resolveSpellCommandId(req, storyId, '/spells/slots/reset');

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'CAST',
        payload: { spellId: '__spell_slots__', action: 'RESET_SLOTS', restType: type },
        source: 'SYSTEM',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const runtime = context.repository.getCombatEngine(storyId).getSpellRuntime();
        const state = runtime.resetSlots(actorId, type);
        return {
          success: true,
          data: { success: true, actorId, restType: type, spellSlots: state.spellSlots },
          summary: `Reset spell slots for ${actorId} using ${type} recovery.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({ success: false, errorReason: commandResult.errorReason, rolledBack: commandResult.rolledBack, commandId: commandResult.commandId });
    }
    res.json({ ...(commandResult.data as any), commandId: commandResult.commandId, canonicalEvent: commandResult.event });
  } catch (error: any) {
    res.status(400).json({ success: false, errorReason: error?.message || 'Failed to reset spell slots.' });
  }
});

/**
 * POST /api/game/spells/concentration/break
 */
gameRouter.post('/spells/concentration/break', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const { actorId, reason } = req.body;
    if (!actorId) return res.status(400).json({ success: false, errorReason: 'actorId is required.' });
    const commandId = resolveSpellCommandId(req, storyId, '/spells/concentration/break');

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'CAST',
        payload: { spellId: '__concentration__', action: 'BREAK_CONCENTRATION' },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const runtime = context.repository.getCombatEngine(storyId).getSpellRuntime();
        const result = runtime.breakConcentration(actorId, reason || 'Manual cancellation');
        return {
          success: true,
          data: { success: true, ...result },
          summary: result.broken
            ? `Concentration on ${result.previousSpell?.spellName || 'active spell'} broken for ${actorId}.`
            : `No active concentration existed for ${actorId}.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({ success: false, errorReason: commandResult.errorReason, rolledBack: commandResult.rolledBack, commandId: commandResult.commandId });
    }
    res.json({ ...(commandResult.data as any), commandId: commandResult.commandId, canonicalEvent: commandResult.event });
  } catch (error: any) {
    res.status(400).json({ success: false, errorReason: error?.message || 'Failed to break concentration.' });
  }
});

/**
 * POST /api/game/spells/evaluate
 * Read-only evaluation of a proposed custom spell.
 */
gameRouter.post('/spells/evaluate', (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const runtime = worldRepository.getCombatEngine(storyId).getSpellRuntime();
    const profile = worldRepository.getRulesProfile(storyId) || rulesProfileEngine.createDefault('FULL_DND');
    const proposal = req.body?.proposal || req.body;
    if (!proposal || typeof proposal !== 'object') {
      return res.status(400).json({ success: false, errorReason: 'Spell proposal object is required.' });
    }
    res.json(runtime.evaluateCustomSpellProposal(proposal, proposal.casterLevel, profile));
  } catch (error: any) {
    res.status(400).json({ success: false, errorReason: error?.message || 'Failed to evaluate spell proposal.' });
  }
});

/**
 * POST /api/game/spells/register-custom
 * Evaluates and registers a custom spell through the canonical transaction path.
 */
gameRouter.post('/spells/register-custom', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const proposal = req.body?.proposal || req.body;
    if (!proposal || typeof proposal !== 'object') {
      return res.status(400).json({ success: false, errorReason: 'Spell proposal object is required.' });
    }

    const actorId =
      (req.body?.actorId as string | undefined) ||
      worldRepository.getPlayerLifecycle(storyId)?.actorId ||
      `player_actor_${storyId}`;
    const commandId = resolveSpellCommandId(req, storyId, '/spells/register-custom');

    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'CAST',
        payload: {
          spellId: String(proposal.spellName || proposal.name || 'custom_spell'),
          action: 'REGISTER_CUSTOM_SPELL',
        },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const profile = context.repository.getRulesProfile(storyId) || rulesProfileEngine.createDefault('FULL_DND');
        const runtime = context.repository.getCombatEngine(storyId).getSpellRuntime();
        const evalResult = runtime.evaluateCustomSpellProposal(proposal, proposal.casterLevel, profile);
        if (!evalResult.approved || !evalResult.sanitizedSpell) {
          return {
            success: false,
            errorReason: evalResult.adjudicationNotes || 'Custom spell proposal was rejected by rules evaluator.',
            data: {
              success: false,
              approved: false,
              spell: undefined as import('../domain/spellRuntime').SpellDefinition | undefined,
              evaluation: evalResult,
            },
          };
        }
        runtime.registerSpell(evalResult.sanitizedSpell);
        return {
          success: true,
          data: {
            success: true,
            approved: true,
            spell: evalResult.sanitizedSpell,
            evaluation: evalResult,
          },
          summary: `Registered custom spell ${evalResult.sanitizedSpell.id}.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        evaluation: (commandResult.data as any)?.evaluation,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }
    res.json({ ...(commandResult.data as any), commandId: commandResult.commandId, canonicalEvent: commandResult.event });
  } catch (error: any) {
    res.status(400).json({ success: false, errorReason: error?.message || 'Failed to register custom spell.' });
  }
});

/**
 * POST /api/game/spells/cast
 * Canonical, transactional spell cast endpoint.
 */
gameRouter.post('/spells/cast', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const { actorId, spellId, targetId, targetPosition, slotLevel, isRitual, advantage, disadvantage } = req.body;
    if (!actorId || !spellId) {
      return res.status(400).json({ success: false, errorReason: 'actorId and spellId are required.' });
    }

    const commandId = resolveSpellCommandId(req, storyId, '/spells/cast');
    const commandResult = await canonicalCommandEngine.execute(
      worldRepository,
      {
        commandId,
        storyId,
        actorId,
        type: 'CAST',
        payload: {
          spellId,
          targetId,
          targetPosition,
          slotLevel,
          isRitual,
          advantage,
          disadvantage,
        },
        source: 'PLAYER',
        transactionMode: 'STAGED',
      },
      async (_command, context) => {
        const transactionCombat = context.repository.getCombatEngine(storyId);
        const transactionRuntime = transactionCombat.getSpellRuntime();
        const profile = context.repository.getRulesProfile(storyId) || rulesProfileEngine.createDefault('FULL_DND');
        const activeActor = transactionCombat.getParticipant(actorId);

        let castData: import('../domain/spellRuntime').CastSpellExecutionResult;
        let inCombat = false;

        if (activeActor) {
          const combatResult = transactionCombat.executeSpellCast({
            actorId,
            spellId,
            targetId,
            targetPosition,
            slotLevel,
            isRitual,
            advantage,
            disadvantage,
          });
          if (!combatResult.success || !combatResult.result) {
            return { success: false, errorReason: combatResult.errorReason || combatResult.result?.errorReason || 'Spell cast was rejected.' };
          }
          castData = combatResult.result;
          inCombat = true;
        } else {
          // Outside tactical combat the runtime only supports self/targetless spells. External
          // targets require an authoritative battlefield participant and cannot be fabricated.
          if (targetId && targetId !== actorId) {
            return {
              success: false,
              errorReason: `Target "${targetId}" is unavailable because actor "${actorId}" is not in an active authoritative combat encounter.`,
            };
          }

          const caster = buildCanonicalSelfParticipant(context.repository, storyId, actorId, transactionRuntime);
          const target = targetId === actorId ? caster : undefined;
          castData = transactionRuntime.castSpellAuthoritative({
            request: {
              casterId: actorId,
              spellId,
              targetId,
              targetPosition,
              slotLevel,
              isRitual,
              advantage,
              disadvantage,
              rulesProfile: profile,
              diceEngine: transactionCombat.getDiceEngine(),
              requireAuthoritativeTarget: true,
              spellDamageBonusOverride: context.repository.getCharacterProgressionEngine(storyId).resolveModifiers(actorId, profile).modifiers.find((modifier) => modifier.target === 'spell.damage')?.value || 0,
              damageResolver: (damageTarget, amount, damageType, criticalHit = false) =>
                transactionCombat.resolveAuthoritativeSpellDamage(damageTarget, amount, damageType, criticalHit),
              healingResolver: (healingTarget, amount) =>
                transactionCombat.resolveAuthoritativeSpellHealing(healingTarget, amount),
            },
            casterParticipant: caster,
            targetParticipant: target,
            allParticipants: transactionCombat.getParticipants(),
          });
          if (!castData.success) {
            return { success: false, errorReason: castData.errorReason || 'Spell cast was rejected.' };
          }
        }

        recordCanonicalSpellEvidence(context.repository, storyId, commandId, actorId, castData, targetId);

        return {
          success: true,
          data: {
            success: true,
            inCombat,
            result: castData,
            headline: castData.headline,
          },
          summary: `Cast ${castData.spellName} for ${actorId}.`,
        };
      }
    );

    if (!commandResult.success) {
      return res.status(400).json({
        success: false,
        errorReason: commandResult.errorReason,
        result: undefined,
        rolledBack: commandResult.rolledBack,
        commandId: commandResult.commandId,
      });
    }

    const data = commandResult.data as any;
    res.json({
      inCombat: Boolean(data?.inCombat),
      ...data?.result,
      result: data?.result,
      headline: data?.headline,
      commandId: commandResult.commandId,
      canonicalEvent: commandResult.event,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, errorReason: error?.message || 'Failed to execute spell cast.' });
  }
});

function buildCurrentComicSceneContext(storyId: string): { context: ComicSceneContext; sourceActionId?: string } {
  const state = serverMockAuthority.getSanitizedViewState(storyId);
  const currentCharacters = Object.values(state.characters || {})
    .filter((character: any) => character.locationId === state.activeLocationId && character.role !== 'PROTAGONIST')
    .map((character: any) => ({
      name: character.name,
      role: character.role,
      title: character.title,
      portraitEmoji: character.portraitEmoji,
    }));

  const latestAction = Array.isArray(state.actionHistory) ? state.actionHistory[0] : undefined;
  const context: ComicSceneContext = {
    worldTitle: worldRepository.getStoryRun(storyId)?.worldId
      ? worldRepository.getWorldTemplate(worldRepository.getStoryRun(storyId)!.worldId)?.title || worldRepository.getStoryRun(storyId)?.worldId
      : undefined,
    location: {
      name: state.activeLocation?.name || 'Current location',
      region: state.activeLocation?.region,
      description: state.activeLocation?.description,
      ambientSensory: state.activeLocation?.ambientSensory,
    },
    protagonist: {
      name: state.protagonist?.name || 'Protagonist',
      role: state.protagonist?.title,
      portraitEmoji: state.protagonist?.portraitEmoji,
      portraitUrl: state.protagonist?.portraitUrl,
    },
    visibleCharacters: currentCharacters,
    latestAction: latestAction
      ? {
          actionType: latestAction.actionType,
          description: latestAction.description,
          narrativeResponse: latestAction.narrativeResponse,
          authoritativeFeedback: latestAction.authoritativeFeedback,
          checkResult: latestAction.checkResult
            ? {
                success: latestAction.checkResult.success,
                total: latestAction.checkResult.total,
                difficultyClass: latestAction.checkResult.difficultyClass,
                consequence: latestAction.checkResult.consequence
                  ? { summary: latestAction.checkResult.consequence.summary }
                  : undefined,
              }
            : undefined,
        }
      : undefined,
    // Deliberately use active dialogue only; never include dialogueHistory in this context.
    activeDialogue: state.activeDialogue
      ? {
          speakerName: state.activeDialogue.speakerName,
          text: state.activeDialogue.text,
        }
      : null,
  };
  return { context, sourceActionId: latestAction?.id };
}

gameRouter.post('/scene/generate-prompt', (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const { context, sourceActionId } = buildCurrentComicSceneContext(storyId);
    const result = buildComicScenePrompt(context);
    return res.json({
      success: true,
      storyId,
      ...result,
      sourceActionId,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      errorReason: error?.message || 'Failed to generate current-scene comic prompt.',
    });
  }
});

gameRouter.post('/scene/generate-image', async (req: Request, res: Response) => {
  try {
    const storyId = resolveStoryId(req, true);
    const { context, sourceActionId } = buildCurrentComicSceneContext(storyId);
    const promptResult = buildComicScenePrompt(context);
    const media = await mediaAdapterService.generateImage({
      storyId,
      prompt: promptResult.prompt,
      slotType: 'scene',
      aspectRatio: '16:9',
      tags: ['story-scene', 'comic-page', 'latest-turn'],
      characterName: context.protagonist.name,
    });
    return res.json({
      success: media.success,
      storyId,
      sourceActionId,
      prompt: promptResult.prompt,
      panelCount: promptResult.panelCount,
      freshnessRule: promptResult.freshnessRule,
      imageUrl: media.imageUrl,
      mediaAsset: media.mediaAsset,
      isFallback: media.isFallback,
      promptFallback: media.promptFallback,
      errorReason: media.errorReason,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      errorReason: error?.message || 'Failed to generate current-scene comic image.',
    });
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
    const geography = worldRepository.getGeographyGraph(storyId);

    const actorId = playerLifecycle?.actorId || `player_actor_${storyId}`;
    const facts = worldRepository.getAuthorizedKnowledgeFacts(storyId, actorId);
    const evidence = chronicle.getEpistemicEvidence(actorId);
    const equippedItems = invEngine.getEquippedItems(actorId);
    const inventoryItems = invEngine.getInventoryItems(actorId);
    const paperDoll = invEngine.getActorPaperDoll(actorId);

    const actorCaps = capEngine.getEffectiveActorCapabilities(actorId, invEngine);
    const actorSkills = capEngine.getActorSkillInstances ? capEngine.getActorSkillInstances(actorId) : [];
    const actorSkillIds = new Set(actorSkills.map((skill) => skill.capabilityId));
    const actorGraph = (capEngine.getCapabilityGraph ? capEngine.getCapabilityGraph() : [])
      .filter((node) => actorSkillIds.has(node.capabilityId) || node.derivedSkills.some((id) => actorSkillIds.has(id)));

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
      storyMode: worldRepository.getNarrativeProfile(storyId)?.mode || run?.storyMode || 'PROTAGONIST',
      narrativeProfile: worldRepository.getNarrativeProfile(storyId),
      dndRulesMode: worldRepository.getRulesProfile(storyId)?.mode || 'FULL_DND',
      rulesProfile: worldRepository.getRulesProfile(storyId),
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
        // Player-safe projection: only actor-owned/effective capabilities cross the boundary.
        // The global capability registry and full DAG remain AI/developer-only.
        coreCapabilities: actorCaps,
        generatedTechniques: actorSkills,
        graph: actorGraph,
      },
      quests: {
        active: activeQuests,
        completed: completedQuests,
        failed: failedQuests,
      },
      relationships: playerLifecycle?.relationships || [],
      memory: {
        facts,
        evidence,
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





