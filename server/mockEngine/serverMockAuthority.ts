import {
  EngineState,
  ExternalViewState,
  ExternalCharacter,
  ActionRequest,
  ActionResult,
  ActionLog,
  Location,
  PlayerKnowledge,
  OpeningScene,
  StructuredNarrativeEvent,
} from './serverTypes';
import {
  INITIAL_ENGINE_STATE,
  INITIAL_DIALOGUE_NODES,
  SERVER_BOUNDARY_TEST_SECRET,
} from './serverInitialState';
import { worldRepository } from '../repositories/worldRepository';
import { worldSimulationService } from '../simulation/worldSimulationService';
import { PlayerLifecycleState } from '../domain/playerLifecycleState';
import { storyCheckConsequenceEngine } from '../domain/storyCheckConsequenceEngine';
import { storyCheckChallengeResolver } from '../domain/storyCheckChallengeResolver';

/**
 * ServerMockAuthority
 *
 * Runs exclusively inside the server-side Node.js environment.
 * Owns the simulated canonical EngineState (including hidden secrets).
 *
 * Epistemic Separation Guarantee:
 * - Maintains canonical state in-memory (EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE).
 * - All outbound data passes through filterForExternalClient().
 * - hiddenCanonicalContext and serverBoundarySecret are NEVER returned to the client.
 */
export class ServerMockAuthority {
  // Labelled clearly per user specification: in-memory state for development experiment
  private EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE: EngineState;
  private activeStoryId: string = 'default_story';
  private dynamicStoryStates: Map<string, any> = new Map();

  constructor() {
    this.EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE = JSON.parse(
      JSON.stringify(INITIAL_ENGINE_STATE)
    );
  }

  public getDynamicStoryState(storyId: string): EngineState {
    if (storyId === 'default_story') {
      return this.EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE;
    }
    let dState = this.dynamicStoryStates.get(storyId);
    if (!dState) {
      const run = worldRepository.getStoryRun(storyId);
      const player = worldRepository.getPlayerLifecycle(storyId);
      const protagonistName = player?.name || run?.characterName || 'Protagonist';
      const protagonistRole = run?.characterRole || 'Protagonist';
      const protagonistPortraitEmoji = run?.characterPortraitEmoji || '🧙‍♂️';

      const initialCharacters: Record<string, any> = {};
      const protagonistActorId = player?.actorId || `player_actor_${storyId}`;
      initialCharacters[protagonistActorId] = {
        id: protagonistActorId,
        name: protagonistName,
        title: protagonistRole,
        role: 'PROTAGONIST',
        locationId: player?.locationId || `loc_${storyId}_start`,
        presence: 'PRESENT',
        disposition: 'FRIENDLY',
        playerVisibleKnowledge: [],
        portraitEmoji: protagonistPortraitEmoji,
      };

      const npcs = worldRepository.getAllNpcLifecycles(storyId);
      for (const npc of npcs) {
        initialCharacters[npc.actorId] = {
          id: npc.actorId,
          name: npc.name,
          title: npc.currentActivity || 'Resident',
          role: 'NPC',
          locationId: npc.locationId,
          presence: npc.locationId === player?.locationId ? 'PRESENT' : 'ABSENT',
          disposition: 'NEUTRAL',
          playerVisibleKnowledge: [],
          portraitEmoji: '👤',
        };
      }

      const facts = worldRepository.getKnowledgeFacts(storyId);
      const mappedKnowledge: PlayerKnowledge[] = facts.map((f) => ({
        id: f.id,
        title: f.predicate || 'Knowledge Fact',
        summary: `${f.predicate}: ${f.objectValue}`,
        acquiredAtCycle: f.acquiredAtTimestamp?.day || 1,
        source: f.sourceType || 'REPUTATION',
        category: 'Lore',
      }));

      dState = {
        worldTime: { cycle: 1, period: 'Dawn', era: 'Age of Resonances' },
        activeLocationId: player?.locationId || `loc_${storyId}_start`,
        protagonist: {
          name: protagonistName,
          title: protagonistRole,
          attributes: {},
          resources: {},
          conditionEffects: [],
        },
        characters: initialCharacters,
        activeDialogue: null,
        dialogueHistory: [],
        inventory: [],
        equipment: {},
        knowledgeBase: mappedKnowledge,
        actionHistory: run?.openingScene ? [
          {
            id: `act_open_${storyId}`,
            timestamp: run.openingScene.worldTime.formattedTime || 'Dawn',
            cycle: run.openingScene.worldTime.cycle || 1,
            actionType: 'NOTE_RECORD',
            description: run.openingScene.narrativeText,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback: `Opening scene established in ${run.openingScene.startingLocationName}.`,
          }
        ] : [
          {
            id: `act_init_${storyId}`,
            timestamp: 'Dawn',
            cycle: 1,
            actionType: 'NOTE_RECORD',
            description: `Awakened in starting location.`,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback: run?.initialScene || `Entered the world of ${run?.worldId || 'Adventure'}.`,
          }
        ],
        engineContractVersion: '1.0.0',
        serverBoundarySecret: 'boundary_verified_secure_token',
      };
      this.dynamicStoryStates.set(storyId, dState);
    }
    return dState;
  }

  public setActiveStoryId(storyId: string): void {
    if (!storyId) return;
    worldRepository.seedStory(storyId);
    this.activeStoryId = storyId;
  }

  public getActiveStoryId(): string {
    return this.activeStoryId;
  }

  /**
   * Epistemic Projection Filter
   * Projects server-side canonical EngineState into a client-safe ExternalViewState.
   * Strips all hidden secrets, canonical character secrets, and server test secrets.
   */
  public filterForExternalClient(state: EngineState, storyId: string = 'default_story'): ExternalViewState {
    const sanitizedCharacters: Record<string, ExternalCharacter> = {};
    for (const [id, char] of Object.entries(state.characters)) {
      sanitizedCharacters[id] = {
        id: char.id,
        name: char.name,
        title: char.title,
        role: char.role,
        locationId: char.locationId,
        presence: char.presence,
        disposition: char.disposition,
        playerVisibleKnowledge: [...char.playerVisibleKnowledge],
        portraitEmoji: char.portraitEmoji,
        portraitUrl: (char as any).portraitUrl,
      };
    }

    const targetStoryId = storyId || this.activeStoryId;
    const player = worldRepository.getPlayerLifecycle(targetStoryId);
    const run = worldRepository.getStoryRun(targetStoryId);
    const conditionEngine = worldRepository.getConditionEngine(targetStoryId);
    const playerConditionState = player
      ? conditionEngine.getActorState(player.actorId)
      : undefined;
    const canonicalLocationId = player ? player.locationId : (run ? run.currentLocationId : state.activeLocationId);
    const isTraveling = player ? player.isTraveling : false;
    const activeJourney = player ? player.activeJourney : null;
    const clock = worldRepository.getWorldClock(targetStoryId);
    const canonicalClockState = clock.getState();

    state.activeLocationId = canonicalLocationId;
    const phaseMapping: Record<string, 'Dawn' | 'Morning' | 'Zenith' | 'Dusk' | 'Starlight'> = {
      Predawn: 'Dawn',
      Dawn: 'Dawn',
      Morning: 'Morning',
      Afternoon: 'Zenith',
      Dusk: 'Dusk',
      Night: 'Starlight',
    };
    state.worldTime = {
      cycle: canonicalClockState.timestamp.day,
      period: phaseMapping[canonicalClockState.currentDayPhase] || 'Zenith',
      era: 'Age of Resonances',
    };

    const actorDiscoveredSet = new Set(
      player?.discoveredLocationIds || (targetStoryId === 'default_story' ? ['loc_whispering_orrery', 'loc_lantern_vault', 'loc_glasswood_verge'] : [canonicalLocationId])
    );

    const graphNodes = worldRepository.getGeographyGraph(targetStoryId).getAllNodes();
    const projectedLocations: Record<string, Location> = {};
    for (const node of graphNodes) {
      const isCurrentLocation = node.id === canonicalLocationId;
      const isKnownInKnowledgeBase = state.knowledgeBase.some((k) => {
        if (!node.name) return false;
        const normalizedName = node.name.toLowerCase();
        if (normalizedName.length <= 2) {
          const words = k.summary.toLowerCase().split(/[^a-z0-9]+/);
          return k.id.includes(node.id) || words.includes(normalizedName);
        }
        return k.id.includes(node.id) || k.summary.toLowerCase().includes(normalizedName);
      });
      const isPartOfActiveJourney =
        activeJourney !== null &&
        (activeJourney.originLocationId === node.id || activeJourney.destinationLocationId === node.id);
      const isActorDiscovered = actorDiscoveredSet.has(node.id);

      if (isActorDiscovered || isCurrentLocation || isKnownInKnowledgeBase || isPartOfActiveJourney) {
        projectedLocations[node.id] = {
          id: node.id,
          name: node.name,
          region: node.regionId,
          description: node.description,
          coordinates: node.coordinates,
          accessible: node.accessible,
          ambientSensory: node.ambientSensory,
          discovered: true,
        };
      } else if (targetStoryId !== 'default_story') {
        // Preserve a useful small-map presentation using non-revealing 'unknown territory'
        projectedLocations[`unknown_${node.id}`] = {
          id: `unknown_${node.id}`,
          name: 'Unknown Territory',
          region: 'Wilderness',
          description: 'A distant, unmapped region shrouded in fog. Perhaps some exploration will reveal its secrets.',
          coordinates: node.coordinates,
          accessible: false,
          ambientSensory: 'A quiet, unrevealed stillness.',
          discovered: true,
        };
      }
    }

    const activeLocation =
      projectedLocations[canonicalLocationId] ||
      Object.values(projectedLocations)[0];

    // Canonical Inventory & Equipment Projection from InventoryItemEngine (CH5)
    const invEngine = worldRepository.getInventoryEngine(targetStoryId);
    const actorId = player ? player.actorId : `player_actor_${targetStoryId}`;
    const canonicalItems = invEngine.getActorInventory(actorId);
    const canonicalPaperDoll = invEngine.getActorPaperDoll(actorId);
    const iconMap: Record<string, string> = {
      def_iron_sword: '⚔️',
      def_steel_cuirass: '🛡️',
      def_brass_astrolabe: '🧭',
      def_luminary_veil: '🧣',
      def_leather_boots: '👢',
      def_iron_shield: '🛡️',
      def_iron_ingot: '🧱',
      def_healing_salve: '🧪',
      def_scribed_vellum: '📜',
      def_glasswood_spore_flask: '🧪',
    };
    const projectedInventory = canonicalItems.map((item) => {
      const def = invEngine.getItemDefinition(item.defId);
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        description: def?.description || `${item.name} (${item.provenance})`,
        quantity: item.quantity,
        weight: def?.weightKg ?? 1.0,
        rarity: item.rarity,
        equippableSlot: item.equippedSlot || (def?.allowedSlots?.[0] ? def.allowedSlots[0].charAt(0).toUpperCase() + def.allowedSlots[0].slice(1) : undefined),
        icon: iconMap[item.defId] || '📦',
        durability: item.durability,
        maxDurability: item.maxDurability,
        isBroken: item.isBroken,
      };
    });
    const projectedEquipment: Record<string, any> = {
      Head: canonicalPaperDoll.head ? { ...canonicalPaperDoll.head, icon: iconMap[canonicalPaperDoll.head.defId] || '🧣' } : null,
      Cloak: canonicalPaperDoll.cloak ? { ...canonicalPaperDoll.cloak, icon: iconMap[canonicalPaperDoll.cloak.defId] || '🧣' } : null,
      Hands: canonicalPaperDoll.hands ? { ...canonicalPaperDoll.hands, icon: iconMap[canonicalPaperDoll.hands.defId] || '🧭' } : null,
      Relic: canonicalPaperDoll.relic ? { ...canonicalPaperDoll.relic, icon: iconMap[canonicalPaperDoll.relic.defId] || '🧪' } : null,
      Footwear: canonicalPaperDoll.feet ? { ...canonicalPaperDoll.feet, icon: iconMap[canonicalPaperDoll.feet.defId] || '👢' } : null,
      Body: canonicalPaperDoll.body ? { ...canonicalPaperDoll.body, icon: iconMap[canonicalPaperDoll.body.defId] || '🛡️' } : null,
      MainHand: canonicalPaperDoll.mainHand ? { ...canonicalPaperDoll.mainHand, icon: iconMap[canonicalPaperDoll.mainHand.defId] || '⚔️' } : null,
      OffHand: canonicalPaperDoll.offHand ? { ...canonicalPaperDoll.offHand, icon: iconMap[canonicalPaperDoll.offHand.defId] || '🛡️' } : null,
    };

    return {
      worldTime: { ...state.worldTime },
      activeLocationId: canonicalLocationId,
      activeLocation,
      protagonist: {
        ...state.protagonist,
        name: player ? player.name : (run ? run.characterName : state.protagonist.name),
        title: run?.characterRole || state.protagonist.title,
        portraitUrl: run?.characterPortraitUrl,
        portraitEmoji: run?.characterPortraitEmoji || sanitizedCharacters[actorId]?.portraitEmoji || '🧙‍♂️',
        conditionState: playerConditionState
          ? conditionEngine.exportActorState(actorId)
          : undefined,
        status: player?.isDead
          ? 'Deceased'
          : player?.isPossessed
          ? 'Possessed'
          : player?.transformationRecord?.active
          ? `Transformed (${player.transformationRecord.formName})`
          : player?.isTraveling
          ? 'In Transit'
          : 'Active',
      },
      locations: projectedLocations,
      routeEdges: worldRepository
        .getGeographyGraph(targetStoryId)
        .getAllEdges()
        .filter((edge) => Boolean(projectedLocations[edge.fromLocationId] && projectedLocations[edge.toLocationId])),
      characters: sanitizedCharacters,
      activeDialogue: state.activeDialogue ? { ...state.activeDialogue } : null,
      dialogueHistory: state.dialogueHistory.map((d) => ({ ...d })),
      inventory: projectedInventory,
      equipment: projectedEquipment,
      knowledgeBase: state.knowledgeBase.map((k) => ({ ...k })),
      actionHistory: state.actionHistory.map((a) => ({ ...a })),
      engineContractVersion: state.engineContractVersion,
      activeJourney: activeJourney ? JSON.parse(JSON.stringify(activeJourney)) : null,
      isTraveling,
      playerLifecycle: player ? player.toJSON() : null,
      openingScene: run?.openingScene || null,
    };
  }

  /**
   * Records the opening scene into the dynamic story state's action history and dialogue history.
   */
  public recordOpeningScene(storyId: string, opening: OpeningScene): void {
    if (storyId === 'default_story') return;
    const dState = this.getDynamicStoryState(storyId);
    const existingIndex = dState.actionHistory.findIndex((a) => a.id === `act_open_${storyId}`);
    const actionRecord: ActionLog = {
      id: `act_open_${storyId}`,
      timestamp: opening.worldTime.formattedTime || 'Dawn',
      cycle: opening.worldTime.cycle || 1,
      actionType: 'NOTE_RECORD',
      description: opening.narrativeText,
      epistemicValidation: 'MOCK_ENGINE_COMMITTED',
      authoritativeFeedback: `Opening scene established in ${opening.startingLocationName}.`,
    };

    if (existingIndex >= 0) {
      dState.actionHistory[existingIndex] = actionRecord;
    } else {
      dState.actionHistory = [actionRecord, ...dState.actionHistory.filter((a) => a.id !== `act_init_${storyId}`)];
    }

    // Reflect any dialogue from the opening scene into dialogue history
    const dialogueEvents = opening.structuredEvents.filter((e: StructuredNarrativeEvent) => e.type === 'dialogue');
    for (const d of dialogueEvents) {
      if (!dState.dialogueHistory.some((dh) => dh.text === d.text)) {
        dState.dialogueHistory.push({
          speaker: d.speaker || 'Narrator',
          text: d.text,
          cycle: opening.worldTime.cycle || 1,
        });
      }
    }
  }

  /**
   * Returns sanitized view state for GET /api/game/state
   */
  public getSanitizedViewState(storyId?: string): ExternalViewState {
    const targetStoryId = storyId || this.activeStoryId;
    const state = this.getDynamicStoryState(targetStoryId);
    return this.filterForExternalClient(state, targetStoryId);
  }

  /**
   * Returns canonical server-side locations (unfiltered world truth).
   */
  public getCanonicalLocations(): Record<string, Location> {
    const graphNodes = worldRepository.getGeographyGraph().getAllNodes();
    const locs: Record<string, Location> = {};
    for (const node of graphNodes) {
      locs[node.id] = {
        id: node.id,
        name: node.name,
        region: node.regionId,
        description: node.description,
        coordinates: node.coordinates,
        accessible: node.accessible,
        ambientSensory: node.ambientSensory,
        discovered: node.discovered,
      };
    }
    return locs;
  }

  /**
   * Asynchronous wrapper for freeform actions.
   *
   * The canonical action is first resolved synchronously through the existing authority.
   * A separate presentation-only narrator then describes the committed result. The narrator
   * cannot mutate state because MultiModelOrchestrator.generateNarrativeOnly strips state changes.
   */
  public async processCustomAction(request: ActionRequest): Promise<ActionResult> {
    const baseResult = this.processAction(request);
    if (!baseResult || request.type !== 'CUSTOM_ACTION') {
      return baseResult;
    }

    const targetStoryId = (request as any).storyId || this.activeStoryId;
    const freeformText =
      (request as any).actionText ||
      (request as any).customText ||
      (request as any).description ||
      (request as any).input ||
      'Performed freeform action.';

    const conditionEngine = worldRepository.getConditionEngine(targetStoryId);
    const player = worldRepository.getPlayerLifecycle(targetStoryId);
    const run = worldRepository.getStoryRun(targetStoryId);
    const actorId = player?.actorId || `player_actor_${targetStoryId}`;

    // Narrative checks and authored challenge consequences are canonical mechanics. The AI may
    // describe the committed result, but it never supplies the die, modifier, DC, damage, or condition.
    const sceneText = [
      run?.startingSituation?.summary,
      run?.startingSituation?.hook,
      worldRepository.getGeographyGraph(targetStoryId)
        .getAllNodes()
        .find((node) => node.id === player?.locationId || node.id === run?.currentLocationId)?.description,
    ].filter(Boolean).join(' ');

    const capabilityEngine = worldRepository.getCapabilityEngine(targetStoryId);
    const authoredChallenge = storyCheckChallengeResolver.resolve({
      actionText: String(freeformText),
      sceneText,
      run,
      worldTemplate: run?.worldId ? worldRepository.getWorldTemplate(run.worldId) : undefined,
      activeEffects: worldRepository.getActiveEffects(targetStoryId),
      capabilities: capabilityEngine.getEffectiveActorCapabilities(actorId),
    });

    const storyCheckEngine = worldRepository.getStoryCheckEngine(targetStoryId);
    const storyCheck = storyCheckEngine.resolve(
      targetStoryId,
      String(freeformText),
      {
        coreStats: run?.characterCoreStats || run?.protagonist?.coreStats,
        skills: run?.characterSkills || run?.protagonist?.skills,
        conditionState: conditionEngine.exportActorState(actorId),
        sceneText,
      },
      authoredChallenge || undefined
    );

    let committedOutcome = baseResult.message;
    if (storyCheck) {
      const testLabel = storyCheck.testType === 'SAVING_THROW'
        ? storyCheck.ability + ' saving throw'
        : storyCheck.skill + ' check';
      committedOutcome = storyCheck.success
        ? testLabel + ': ' + storyCheck.total + ' vs DC ' + storyCheck.difficultyClass + ' — success.'
        : testLabel + ': ' + storyCheck.total + ' vs DC ' + storyCheck.difficultyClass + ' — failure.';

      if (authoredChallenge) {
        const consequence = storyCheckConsequenceEngine.apply(
          targetStoryId,
          actorId,
          storyCheck,
          authoredChallenge,
          conditionEngine,
          worldRepository.getWorldClock(targetStoryId).getAbsoluteTime()
        );
        storyCheck.consequence = consequence;
        committedOutcome += ' ' + consequence.summary;
      }
    }
    // Resolve condition-driven action triggers before narration so the narrator sees the committed result.
    conditionEngine.processAction(actorId, String(freeformText), worldRepository.getWorldClock(targetStoryId).getAbsoluteTime());
    conditionEngine.tickActor(actorId, 'TURN', worldRepository.getWorldClock(targetStoryId).getAbsoluteTime());

    const conditionStateAfterAction = conditionEngine.getActorState(actorId);
    const currentPowerState = capabilityEngine.getPowerState(actorId);
    if (conditionStateAfterAction && currentPowerState) {
      capabilityEngine.setPowerState(actorId, {
        ...currentPowerState,
        healthCurrent: conditionStateAfterAction.healthCurrent,
        healthMax: conditionStateAfterAction.healthMax,
      });
    }
    if (conditionStateAfterAction?.dead && player && !player.isDead) {
      worldRepository.updatePlayerLifecycle(targetStoryId, player.copyWith({
        deathRecord: {
          isDead: true,
          diedAtTimestamp: worldRepository.getWorldClock(targetStoryId).getTimestamp(),
          cause: 'A condition reduced the character to a terminal state.',
          revivalPossible: true,
        },
      }));
    }

    let narrativeResponse = '';
    try {
      const narrator = worldRepository.getAiOrchestrator();
      const generated = await narrator.generateNarrativeOnly({
        storyId: targetStoryId,
        playerAction: String(freeformText),
        committedOutcome,
        hardTokenBudget: 500,
        timeoutMs: 5000,
        maxRetries: 1,
      });

      if (
        generated.success &&
        generated.turnPackage?.narrative?.length &&
        generated.providerId !== 'provider_deterministic_emergency'
      ) {
        narrativeResponse = generated.turnPackage.narrative.join('\n\n').trim();
      }
    } catch (error) {
      console.warn('[ServerMockAuthority] Narrative presentation fallback:', error);
    }

    if (!narrativeResponse) {
      narrativeResponse = this.synthesizeFreeformActionFallback(
        targetStoryId,
        String(freeformText),
        committedOutcome
      );
    }

    const state = this.getDynamicStoryState(targetStoryId);
    const actionLog = state.actionHistory.find((entry) => entry.id === baseResult.actionId);
    if (actionLog) {
      actionLog.narrativeResponse = narrativeResponse;
      if (storyCheck) {
        actionLog.checkResult = storyCheck;
      }
    }

    return {
      ...baseResult,
      message: narrativeResponse,
      narrativeResponse,
      checkResult: storyCheck || undefined,
      viewState: this.filterForExternalClient(state, targetStoryId),
    };
  }

  private synthesizeFreeformActionFallback(
    storyId: string,
    actionText: string,
    committedOutcome?: string
  ): string {
    const player = worldRepository.getPlayerLifecycle(storyId);
    const run = worldRepository.getStoryRun(storyId);
    const actorName = player?.name || run?.characterName || 'You';
    const location = worldRepository.getGeographyGraph(storyId)
      .getAllNodes()
      .find((node) => node.id === player?.locationId || node.id === run?.currentLocationId);
    const atmosphere = location?.ambientSensory || location?.description || 'The surroundings remain still.';

    const normalized = actionText.toLowerCase();

    if (/\\b(inhale|breathe|breath|take a breath)\\b/.test(normalized)) {
      return `${actorName} draws a slow breath. The air is cool and clean against the lungs; for a moment, nothing asks anything of you but to be still. ${atmosphere}`;
    }

    if (/\\b(look|observe|inspect|search|scan|survey|examine|notice)\\b/.test(normalized)) {
      return `${actorName} takes a careful look around. ${atmosphere}`;
    }

    if (/\\b(listen|hear|listen for)\\b/.test(normalized)) {
      return `${actorName} pauses and listens. ${atmosphere}`;
    }

    if (/\\b(walk|move|step|approach|head|go)\\b/.test(normalized)) {
      return `${actorName} follows through on the movement, changing position without disturbing the wider scene. ${atmosphere}`;
    }

    if (/\\b(touch|feel|pick up|grasp|hold)\\b/.test(normalized)) {
      return `${actorName} follows the impulse and reaches out. ${atmosphere}`;
    }

    if (committedOutcome) {
      return `${actorName} acts. ${committedOutcome} ${atmosphere}`;
    }

    return `${actorName} follows through. ${atmosphere}`;
  }

  /**
   * Server-authoritative resolution of player ActionRequests.
   */
  public processAction(request: ActionRequest): ActionResult {
    const targetStoryId = (request as any).storyId || this.activeStoryId;
    const state = this.getDynamicStoryState(targetStoryId);
    const now = new Date().toTimeString().split(' ')[0];
    const actionId = `act_srv_${Date.now()}`;
    let success = true;
    let message = '';
    let authoritativeFeedback = '';
    let logEntry: ActionLog | null = null;

    if (!request || !request.type) {
      return {
        success: false,
        actionId,
        requestType: 'INSPECT_SURROUNDINGS',
        status: 'MOCK_ENGINE_REJECTED',
        message: 'Malformed request: missing action type.',
        authoritativeFeedback: 'Server authority rejected request without action type.',
        viewState: this.filterForExternalClient(state, targetStoryId),
      };
    }

    switch (request.type) {
      case 'DIALOGUE_CHOICE': {
        const targetNode = INITIAL_DIALOGUE_NODES[request.targetNodeId];
        if (targetNode) {
          state.activeDialogue = targetNode;
          state.dialogueHistory = [
            {
              speaker: targetNode.speakerName,
              text: targetNode.text,
              cycle: state.worldTime.cycle,
            },
            ...state.dialogueHistory,
          ];

          // Grant knowledge if node has reward and not already known
          if (targetNode.rewardKnowledge) {
            const alreadyKnown = state.knowledgeBase.some(
              (k) => k.id === targetNode.rewardKnowledge!.id
            );
            if (!alreadyKnown) {
              state.knowledgeBase = [
                {
                  ...targetNode.rewardKnowledge,
                  acquiredAtCycle: state.worldTime.cycle,
                },
                ...state.knowledgeBase,
              ];
            }
          }

          message = `Dialogue intent committed: [${request.intent}]`;
          authoritativeFeedback = `Server authority validated intent [${request.intent}]. Transitioned to node: ${request.targetNodeId}.`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'DIALOGUE_CHOICE',
            description: `Player selected: "${request.label}"`,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        } else {
          success = false;
          message = `Target dialogue node ${request.targetNodeId} not recognized by server engine.`;
          authoritativeFeedback = `Rejection: Dialogue node identifier invalid on server.`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'DIALOGUE_CHOICE',
            description: `Attempted dialogue selection: "${request.label}"`,
            epistemicValidation: 'REJECTED_BY_ENGINE',
            authoritativeFeedback,
          };
        }
        break;
      }

      case 'TRAVEL_REQUEST': {
        const mode = (request as any).mode || 'Foot';
        const travelResult = worldSimulationService.startPlayerTravel(
          targetStoryId,
          request.targetLocationId,
          mode
        );

        if (travelResult.success) {
          const targetLoc = worldRepository.getGeographyGraph(targetStoryId).getAllNodes().find(n => n.id === request.targetLocationId);
          const destName = targetLoc ? targetLoc.name : request.targetLocationId;
          message = travelResult.message;
          authoritativeFeedback = `WorldSimulationService validated route and initiated travel to ${destName}. Invariant 6: Location remains origin while journey is in progress.`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'MOVEMENT',
            description: `Initiated travel to ${destName} (Distance: ${travelResult.journey?.totalDistanceKm.toFixed(1)} km).`,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        } else {
          success = false;
          message = travelResult.message;
          authoritativeFeedback = `Server rejected movement request: ${travelResult.message}`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'MOVEMENT',
            description: `Attempted travel to ${request.targetLocationId}: ${travelResult.message}`,
            epistemicValidation: 'REJECTED_BY_ENGINE',
            authoritativeFeedback,
          };
        }
        break;
      }

      case 'CANCEL_TRAVEL': {
        const cancelled = worldSimulationService.cancelPlayerTravel(targetStoryId);
        if (cancelled) {
          message = 'Travel cancelled. Player anchored at origin location.';
          authoritativeFeedback = 'WorldSimulationService cancelled active journey. Destination was not committed.';
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'MOVEMENT',
            description: 'Cancelled active travel journey.',
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        } else {
          success = false;
          message = 'No active journey in progress to cancel.';
          authoritativeFeedback = 'Server noted no active journey.';
        }
        break;
      }

      case 'DISCOVER_LOCATION': {
        const targetId = request.targetLocationId;
        const actionStoryId = (request as any).storyId || targetStoryId;
        const graphNodes = worldRepository.getGeographyGraph().getAllNodes();
        const targetNode = graphNodes.find(n => n.id === targetId);
        if (targetNode) {
          const player = worldRepository.getPlayerLifecycle(actionStoryId);
          if (player) {
            const currentList = player.discoveredLocationIds || [];
            if (!currentList.includes(targetId)) {
              const updatedPlayer = player.copyWith({
                discoveredLocationIds: [...currentList, targetId],
              });
              worldRepository.updatePlayerLifecycle(actionStoryId, updatedPlayer);
            }
          }
          const targetLoc = targetNode;
          message = `Location charted: ${targetLoc.name}.`;
          authoritativeFeedback = `Server epistemic authority charted new location in player knowledge.`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'INSPECTION',
            description: `Charted new location: ${targetLoc.name}.`,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        } else {
          success = false;
          message = `Cannot discover unknown location.`;
          authoritativeFeedback = `Server rejected exploration: target location does not exist in canonical world.`;
        }
        break;
      }

      case 'EQUIP_REQUEST': {
        const player = worldRepository.getPlayerLifecycle(targetStoryId);
        const actorId = player ? player.actorId : `player_actor_${targetStoryId}`;
        const invEngine = worldRepository.getInventoryEngine(targetStoryId);

        const slotMapping: Record<string, string> = {
          head: 'head',
          cloak: 'cloak',
          hands: 'hands',
          relic: 'relic',
          footwear: 'feet',
          feet: 'feet',
          body: 'body',
          waist: 'waist',
          legs: 'legs',
          mainhand: 'mainHand',
          offhand: 'offHand',
          ring1: 'ring1',
          ring2: 'ring2',
          neck: 'neck',
        };
        const canonicalSlot = slotMapping[request.slot.toLowerCase()] || request.slot;

        const result = invEngine.equipItem(actorId, request.itemId, canonicalSlot as any);
        if (result.success) {
          message = `Equipped ${result.equippedItem?.name} into ${request.slot} slot.`;
          authoritativeFeedback = `Server verified item ${request.itemId} ownership and slot compatibility (${canonicalSlot}) via InventoryItemEngine.`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'EQUIP_REQUEST',
            description: `Equipped ${result.equippedItem?.name} to ${canonicalSlot} slot.`,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        } else {
          success = false;
          message = result.errorReason || `Cannot equip item: inventory mismatch or slot incompatible.`;
          authoritativeFeedback = `Server rejected equip request via InventoryItemEngine: ${result.errorReason}`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'EQUIP_REQUEST',
            description: `Attempted to equip item ${request.itemId} to ${request.slot}.`,
            epistemicValidation: 'REJECTED_BY_ENGINE',
            authoritativeFeedback,
          };
        }
        break;
      }

      case 'UNEQUIP_REQUEST': {
        const player = worldRepository.getPlayerLifecycle(targetStoryId);
        const actorId = player ? player.actorId : `player_actor_${targetStoryId}`;
        const invEngine = worldRepository.getInventoryEngine(targetStoryId);

        const slotMapping: Record<string, string> = {
          head: 'head',
          cloak: 'cloak',
          hands: 'hands',
          relic: 'relic',
          footwear: 'feet',
          feet: 'feet',
          body: 'body',
          waist: 'waist',
          legs: 'legs',
          mainhand: 'mainHand',
          offhand: 'offHand',
          ring1: 'ring1',
          ring2: 'ring2',
          neck: 'neck',
        };
        const canonicalSlot = slotMapping[request.slot.toLowerCase()] || request.slot;

        const result = invEngine.unequipItem(actorId, canonicalSlot as any);
        if (result.success) {
          message = `Unequipped ${result.unequippedItem?.name || 'item'} from ${request.slot} slot.`;
          authoritativeFeedback = `Server unbound item from slot ${canonicalSlot} via InventoryItemEngine.`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'EQUIP_REQUEST',
            description: `Unequipped item from ${canonicalSlot} slot.`,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        } else {
          success = false;
          message = result.errorReason || `Slot ${request.slot} was already empty.`;
          authoritativeFeedback = `Server noted unequip rejection via InventoryItemEngine: ${result.errorReason}`;
        }
        break;
      }

      case 'INSPECT_ITEM': {
        const player = worldRepository.getPlayerLifecycle(targetStoryId);
        const actorId = player ? player.actorId : `player_actor_${targetStoryId}`;
        const invEngine = worldRepository.getInventoryEngine(targetStoryId);
        const item = invEngine.getItemInstance(request.itemId) || invEngine.getActorInventory(actorId).find((i) => i.id === request.itemId);
        const def = item ? invEngine.getItemDefinition(item.defId) : undefined;
        if (item) {
          message = `Inspected ${item.name}.`;
          authoritativeFeedback = `Server authorized presentation of sensory lore: "${def?.description || item.name}"`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'INSPECTION',
            description: `Inspected artifact: ${item.name}.`,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
          };
        } else {
          success = false;
          message = `Artifact not found in inventory.`;
          authoritativeFeedback = `Server inspection failed: item not found in canonical inventory.`;
        }
        break;
      }

      case 'INSPECT_SURROUNDINGS': {
        const activeLoc =
          worldRepository.getGeographyGraph().getAllNodes().find(n => n.id === state.activeLocationId) || worldRepository.getGeographyGraph().getAllNodes()[0];
        message = `Inspected surroundings at ${activeLoc.name}.`;
        authoritativeFeedback = `Server emitted ambient sensory narrative: "${activeLoc.ambientSensory}"`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: state.worldTime.cycle,
          actionType: 'INSPECTION',
          description: `Scanned surrounding environment at ${activeLoc.name}.`,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      case 'ADVANCE_CYCLE':
      case 'ADVANCE_TIME': {
        const secondsToAdvance =
          request.type === 'ADVANCE_TIME' && typeof (request as any).seconds === 'number'
            ? (request as any).seconds
            : 14400; // 4 hours per cycle step

        const advanceResult = worldSimulationService.advanceTime(targetStoryId, secondsToAdvance);
        const clock = worldRepository.getWorldClock(targetStoryId);
        const ts = clock.getTimestamp();
        const phase = clock.getState().currentDayPhase;

        message = `World clock advanced to Day ${ts.day} (${phase}, ${ts.hour.toString().padStart(2, '0')}:${ts.minute.toString().padStart(2, '0')}).`;
        if (advanceResult.completedArrivals.length > 0) {
          const completedDest = advanceResult.completedArrivals[0];
          const destLoc = worldRepository.getGeographyGraph().getAllNodes().find(n => n.id === completedDest);
          const destName = destLoc ? destLoc.name : completedDest;
          message += ` Arrived at destination: ${destName}.`;

          // Contextual dialogue hook for destination
          if (completedDest === 'loc_whispering_orrery') {
            state.activeDialogue = INITIAL_DIALOGUE_NODES.maren_intro;
          } else if (completedDest === 'loc_lantern_vault') {
            state.activeDialogue = INITIAL_DIALOGUE_NODES.elian_intro;
          } else {
            state.activeDialogue = null;
          }
        }

        authoritativeFeedback = `WorldSimulationService advanced canonical clock by ${secondsToAdvance}s. Completed arrivals: ${advanceResult.completedArrivals.join(', ') || 'None'}.`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: ts.day,
          actionType: 'NOTE_RECORD',
          description: `Advanced canonical WorldClock by ${secondsToAdvance}s. Completed arrivals: ${advanceResult.completedArrivals.join(', ') || 'None'}.`,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      case 'ENGAGE_DIALOGUE': {
        if (request.characterId === 'char_elian') {
          state.activeDialogue = INITIAL_DIALOGUE_NODES.elian_intro;
          message = 'Engaged Master Elian in conversation.';
          authoritativeFeedback = 'Server dialogue manager attached Elian dialogue tree.';
        } else if (request.characterId === 'char_maren') {
          state.activeDialogue = INITIAL_DIALOGUE_NODES.maren_intro;
          message = 'Engaged Maren the Archivist in conversation.';
          authoritativeFeedback = 'Server dialogue manager attached Maren dialogue tree.';
        } else {
          success = false;
          message = 'Character not available for dialogue.';
          authoritativeFeedback = 'Server dialogue manager: character unavailable.';
        }
        break;
      }

      case 'APPLY_INJURY': {
        const res = worldSimulationService.applyPlayerInjury(targetStoryId, {
          type: (request as any).injuryType || 'Wound',
          severity: (request as any).severity || 'Moderate',
          location: (request as any).location || 'Torso',
          description: (request as any).description || 'Injury sustained in world.',
        });
        success = res.success;
        message = res.message;
        authoritativeFeedback = `WorldSimulationService committed canonical injury: ${res.message}`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: state.worldTime.cycle,
          actionType: 'NOTE_RECORD',
          description: `Player suffered injury: ${(request as any).severity} ${(request as any).injuryType} (${(request as any).location}).`,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      case 'HEAL_INJURY': {
        const res = worldSimulationService.healPlayerInjury(targetStoryId, (request as any).injuryId);
        success = res.success;
        message = res.message;
        authoritativeFeedback = `WorldSimulationService updated canonical injuries: ${res.message}`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: state.worldTime.cycle,
          actionType: 'NOTE_RECORD',
          description: `Healed player injury ${(request as any).injuryId}.`,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      case 'APPLY_TRANSFORMATION': {
        const res = worldSimulationService.applyPlayerTransformation(targetStoryId, {
          formName: (request as any).formName,
          vesselType: (request as any).vesselType || 'Aetherial',
        });
        success = res.success;
        message = res.message;
        authoritativeFeedback = `WorldSimulationService committed canonical transformation: ${(request as any).formName}.`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: state.worldTime.cycle,
          actionType: 'NOTE_RECORD',
          description: `Player transformed into ${(request as any).formName}.`,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      case 'REVERT_TRANSFORMATION': {
        const res = worldSimulationService.revertPlayerTransformation(targetStoryId);
        success = res.success;
        message = res.message;
        authoritativeFeedback = `WorldSimulationService reverted canonical transformation.`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: state.worldTime.cycle,
          actionType: 'NOTE_RECORD',
          description: `Player reverted to natural form.`,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      case 'RECORD_DEATH': {
        const res = worldSimulationService.recordPlayerDeath(
          targetStoryId,
          (request as any).cause || 'Unknown tragedy',
          (request as any).revivalPossible ?? true
        );
        success = res.success;
        message = res.message;
        authoritativeFeedback = `WorldSimulationService recorded canonical player death: ${(request as any).cause}.`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: state.worldTime.cycle,
          actionType: 'NOTE_RECORD',
          description: `Player deceased: ${(request as any).cause}.`,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      case 'REVIVE_PLAYER': {
        const res = worldSimulationService.revivePlayer(targetStoryId);
        success = res.success;
        message = res.message;
        authoritativeFeedback = `WorldSimulationService restored player life.`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: state.worldTime.cycle,
          actionType: 'NOTE_RECORD',
          description: `Player revived.`,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      case 'CUSTOM_ACTION': {
        const freeformText = (request as any).actionText || (request as any).customText || (request as any).description || (request as any).input || 'Performed freeform action.';
        const capEngine = worldRepository.getCapabilityEngine(targetStoryId);
        const player = worldRepository.getPlayerLifecycle(targetStoryId);
        const actorId = player ? player.actorId : `player_actor_${targetStoryId}`;

        const interp = capEngine.interpretFreeformAction({
          actorId,
          actionText: freeformText,
          executeIfValid: true,
        });

        if (interp.validationSuccess) {
          success = true;
          message = interp.narrativeInterpretation || `Executed custom action: ${freeformText}`;
          const matchedId = interp.mappedCapability?.id || interp.proposedCapability?.id || 'Novel Capability';
          authoritativeFeedback = `Server authority processed freeform action through CapabilityEngine (${matchedId}).`;
        } else {
          success = true;
          message = `Attempted action: ${freeformText}. The outcome unfolds in the narrative.`;
          authoritativeFeedback = `Server authority recorded narrative action.`;
        }

        const chronicle = worldRepository.getHistoricalChronicleEngine(targetStoryId);
        const clock = worldRepository.getWorldClock(targetStoryId);
        const ts = clock.getTimestamp();
        chronicle.recordEvidence({
          id: `ev_custom_${ts.totalElapsedSeconds}_${chronicle.getChronicleEntries().length}`,
          category: 'SACRED_OR_HISTORIC',
          timestamp: ts,
          primarySubjectId: actorId,
          locationId: player?.locationId || 'loc_starting_area',
          summary: freeformText.length > 50 ? freeformText.substring(0, 50) + '...' : freeformText,
          details: message,
          sourceEventId: `evt_custom_${ts.totalElapsedSeconds}`,
          provenance: 'custom_player_action',
          visibility: 'PUBLIC',
        });

        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: clock.getTimestamp().day,
          actionType: 'NOTE_RECORD',
          description: freeformText,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
        };
        break;
      }

      default: {
        success = false;
        message = 'Unrecognized action type.';
        authoritativeFeedback = 'Server authority rejected unrecognized action schema.';
        break;
      }
    }

    if (logEntry) {
      state.actionHistory = [logEntry, ...state.actionHistory];
    }

    const updatedViewState = this.filterForExternalClient(state, targetStoryId);

    return {
      success,
      actionId,
      requestType: request.type,
      status: success ? 'MOCK_ENGINE_COMMITTED' : 'MOCK_ENGINE_REJECTED',
      message,
      authoritativeFeedback,
      viewState: updatedViewState,
    };
  }

  /**
   * Diagnostic summary for the Epistemic Inspector modal.
   * Returns ONLY non-sensitive audit metrics. NEVER leaks the secret text itself!
   */
  public getBoundaryAuditDiagnostics(): {
    serverHoldsCanonicalSecrets: boolean;
    countSecretsHeld: number;
    testSecretPresentOnServer: boolean;
    externalProjectionClean: boolean;
    boundaryStatus: 'PASS' | 'FAIL';
    architectureMode: string;
  } {
    let secretCount = 0;
    for (const char of Object.values(this.EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE.characters)) {
      if (char.hiddenCanonicalContext) {
        secretCount++;
      }
    }

    const testSecretPresent =
      this.EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE.serverBoundarySecret ===
      SERVER_BOUNDARY_TEST_SECRET;

    // Verify sanitized projection is free of secrets
    const projection = this.getSanitizedViewState();
    const projectionString = JSON.stringify(projection);

    const leaksTestSecret = projectionString.includes(SERVER_BOUNDARY_TEST_SECRET);
    const leaksCanonicalSecret = projectionString.includes('SERVER CANONICAL SECRET');

    const clean = !leaksTestSecret && !leaksCanonicalSecret;

    return {
      serverHoldsCanonicalSecrets: secretCount > 0,
      countSecretsHeld: secretCount,
      testSecretPresentOnServer: testSecretPresent,
      externalProjectionClean: clean,
      boundaryStatus: clean && secretCount > 0 && testSecretPresent ? 'PASS' : 'FAIL',
      architectureMode: 'Node.js Express Mock Authority Runtime',
    };
  }

  /**
   * Resets story authority state to pristine initial state for testing or restart.
   */
  public resetToCanonicalState(storyId: string = 'default_story'): void {
    this.EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE = JSON.parse(
      JSON.stringify(INITIAL_ENGINE_STATE)
    );
    const clock = worldRepository.getWorldClock(storyId);
    const initialPlayer = new PlayerLifecycleState({
      actorId: `player_actor_${storyId}`,
      name: 'Scribe Vael',
      locationId: 'loc_whispering_orrery',
      lastUpdatedTime: clock.getTimestamp().totalElapsedSeconds,
      currentActivity: 'idle',
      activeJourney: null,
      injuries: [],
    });
    worldRepository.updatePlayerLifecycle(storyId, initialPlayer);
    worldRepository.getGeographyGraph().setDiscovered('loc_sunken_scriptorium', false);
  }

  /**
   * Internal verification method (never exposed over public API).
   */
  public internalVerifySecretPresence(): boolean {
    return (
      this.EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE.serverBoundarySecret ===
      SERVER_BOUNDARY_TEST_SECRET
    );
  }
}

// Export singleton instance for server process
export const serverMockAuthority = new ServerMockAuthority();
