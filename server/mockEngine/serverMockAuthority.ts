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
import { storyCheckAuthority } from '../domain/storyCheckAuthority';
import { rulesProfileEngine } from '../domain/rulesProfileEngine';
import { deterministicId, formatCanonicalTimestamp } from '../domain/deterministicRng';
import { HistoricalChronicleEngine } from '../domain/historicalChronicleEngine';
import { storyActionAdvisor } from '../services/storyActionAdvisor';
import { combatEncounterService } from '../domain/combatEncounterService';
import { CapabilitySimulationEngine } from '../domain/capabilitySimulationEngine';
import { narrativeContinuityEngine } from '../domain/narrativeContinuityEngine';
import { narrativeStateBroker, type ItemUseResolution } from '../domain/narrativeStateBroker';
import { environmentalHazardEngine } from '../domain/environmentalHazardEngine';
import { CurrentSituationBuilder } from '../domain/currentSituation';
import { PlayerIntentInterpreter } from '../domain/playerIntentInterpreter';
import { ResolutionGate } from '../domain/resolutionGate';
import { outcomeTierFromCheck, type ActionResolution } from '../domain/actionResolution';
import { type ContextTransparency } from '../../src/types';
import { NarrativeRichnessEvaluator, type NarrativeRichnessEvaluation } from '../domain/narrativeRichnessEvaluation';
import { NarrativePacingEngine } from '../domain/narrativePacingEngine';
import type { EphemeralNarrativePlan } from '../domain/narrativeDirector';
import type { PlayerIntent } from '../domain/playerIntentInterpreter';

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
function parseLiveNarrativeReview(rawText: string): { narrativeText: string; structuredEvents: any[] } | null {
  const cleaned = String(rawText || '').trim();
  if (!cleaned) return null;
  let parsed: any;
  try { parsed = JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try { parsed = JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.narrativeText !== 'string') return null;
  const narrativeText = parsed.narrativeText.trim();
  if (!narrativeText) return null;
  return { narrativeText, structuredEvents: Array.isArray(parsed.structuredEvents) ? parsed.structuredEvents : [] };
}

function liveNarrativeLexicalOverlap(left: string, right: string): number {
  const stop = new Set(['the','and','that','this','with','from','into','then','than','they','their','there','were','was','have','has','had','will','would','could','should','your','you','for','are','but','not','his','her','him','she','its','our','out','over','under','after','before','about','what','when','where','which','while','just','only','very','some','i','a','an','to','of','on','in']);
  const tokens = (value: string) => Array.from(new Set(String(value || '').toLowerCase().split(/[^a-z0-9'-]+/).map(v => v.replace(/^['-]+|['-]+$/g, '')).filter(v => v.length >= 4 && !stop.has(v))));
  const a = new Set(tokens(left));
  const b = tokens(right);
  if (!a.size || !b.length) return 0;
  return b.filter(token => a.has(token)).length / Math.min(a.size, b.length, 12);
}
export class ServerMockAuthority {
  private recordChronicleEvidence(
    storyId: string,
    chronicleEngine: HistoricalChronicleEngine,
    evidence: Parameters<HistoricalChronicleEngine['recordEvidence']>[0],
  ): void {
    if (worldRepository.isCanonicalCommandTransactionActive()) {
      chronicleEngine.recordEvidence(evidence);
      return;
    }

    const commandId = `mock_action_chronicle_${storyId}_${evidence.id}`;
    chronicleEngine.beginCanonicalTransaction(commandId);
    try {
      chronicleEngine.recordEvidence(evidence);
      chronicleEngine.commitCanonicalTransaction(evidence.sourceEventId || evidence.id);
    } catch (error) {
      chronicleEngine.rollbackCanonicalTransaction();
      throw error;
    }
  }

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
      // The legacy default Story state predates explicit world IDs on character
      // records. Stamp the active story world once so the external projection can
      // enforce strict world membership without falling back to a global roster.
      const activeWorldId = worldRepository.getStoryRun('default_story')?.worldId;
      if (activeWorldId) {
        for (const character of Object.values(this.EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE.characters || {})) {
          if (!(character as any).worldId) {
            (character as any).worldId = activeWorldId;
          }
        }
      }
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
      const activeWorldId = run?.worldId;
      const protagonistActorId = player?.actorId || `player_actor_${storyId}`;
      initialCharacters[protagonistActorId] = {
        id: protagonistActorId,
        name: protagonistName,
        title: protagonistRole,
        role: 'PROTAGONIST',
        worldId: activeWorldId,
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
          worldId: activeWorldId,
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

  public setWorkingContextPin(storyId: string, sourceId: string, pinned: boolean): { success: boolean; pinnedSourceIds: string[] } {
    const normalizedSourceId = String(sourceId || '').trim().slice(0, 240);
    if (!normalizedSourceId) return { success: false, pinnedSourceIds: [] };
    const run = worldRepository.getStoryRun(storyId);
    if (!run) return { success: false, pinnedSourceIds: [] };
    const existing = Array.isArray(run.runtimeState?.workingContextPins)
      ? run.runtimeState.workingContextPins.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];
    const next = new Set<string>(existing);
    if (pinned) next.add(normalizedSourceId);
    else next.delete(normalizedSourceId);
    run.runtimeState = {
      ...(run.runtimeState || {}),
      workingContextPins: [...next].slice(-40),
    };
    worldRepository.saveStoryRun(run);
    return { success: true, pinnedSourceIds: [...next] };
  }

  public getContextTransparency(storyId: string): ContextTransparency {
    const run = worldRepository.getStoryRun(storyId);
    const history = Array.isArray(run?.runtimeState?.narrativeContextHistory)
      ? run.runtimeState.narrativeContextHistory
      : [];
    const audit = history.at(-1)?.contextAudit || {};
    const mapChunk = (chunk: any) => ({
      id: chunk.id,
      label: String(chunk.label || 'Unnamed context block'),
      band: String(chunk.band || 'UNKNOWN'),
      source: chunk.source,
      relevanceScore: chunk.relevanceScore,
      protected: Boolean(chunk.protected),
    });
    return {
      hardTokenBudget: Number(audit.hardTokenBudget || 0),
      totalTokens: Number(audit.totalTokens || 0),
      included: Array.isArray(audit.includedChunks) ? audit.includedChunks.map(mapChunk) : [],
      idle: Array.isArray(audit.idleChunks) ? audit.idleChunks.map(mapChunk) : [],
      archived: Array.isArray(audit.archivedChunks) ? audit.archivedChunks.map(mapChunk) : [],
      evicted: Array.isArray(audit.evictedChunkLabels) ? audit.evictedChunkLabels.map(String).slice(0, 80) : [],
      pinnedSourceIds: Array.isArray(run?.runtimeState?.workingContextPins)
        ? run!.runtimeState!.workingContextPins.filter((id: unknown): id is string => typeof id === 'string')
        : [],
    };
  }

  public removeStoryState(storyId: string): void {
    if (!storyId || storyId === 'default_story') {
      if (storyId === 'default_story') {
        this.EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE = JSON.parse(JSON.stringify(INITIAL_ENGINE_STATE));
      }
      return;
    }
    this.dynamicStoryStates.delete(storyId);
    if (this.activeStoryId === storyId) this.activeStoryId = 'default_story';
  }

  public exportTransactionalState(storyId: string): EngineState {
    return JSON.parse(JSON.stringify(this.getDynamicStoryState(storyId)));
  }

  public importTransactionalState(storyId: string, state: EngineState): void {
    const cloned = JSON.parse(JSON.stringify(state)) as EngineState;
    if (storyId === 'default_story') {
      this.EXPERIMENTAL_SINGLE_INSTANCE_MOCK_STATE = cloned;
      return;
    }
    this.dynamicStoryStates.set(storyId, cloned);
  }

  /**
   * Epistemic Projection Filter
   * Projects server-side canonical EngineState into a client-safe ExternalViewState.
   * Strips all hidden secrets, canonical character secrets, and server test secrets.
   */
  public filterForExternalClient(state: EngineState, storyId: string = 'default_story'): ExternalViewState {
    const targetStoryId = storyId || this.activeStoryId;
    const run = worldRepository.getStoryRun(targetStoryId);
    const activeWorldId = run?.worldId;
    const sanitizedCharacters: Record<string, ExternalCharacter> = {};
    for (const [id, char] of Object.entries(state.characters)) {
      const characterWorldId = (char as any).worldId;
      if (!activeWorldId || characterWorldId !== activeWorldId) {
        continue;
      }
      sanitizedCharacters[id] = {
        id: char.id,
        name: char.name,
        title: char.title,
        role: char.role,
        worldId: characterWorldId,
        locationId: char.locationId,
        presence: char.presence,
        disposition: char.disposition,
        playerVisibleKnowledge: [...char.playerVisibleKnowledge],
        portraitEmoji: char.portraitEmoji,
        portraitUrl: (char as any).portraitUrl,
      };
    }

    const player = worldRepository.getPlayerLifecycle(targetStoryId);
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
        useCases: def?.useCases || [],
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

    const combatEngine = worldRepository.getCombatEngine(targetStoryId);
    const combatProjection = combatEngine.projectCombatForActor(
      actorId,
      worldRepository.getCombatPerceptionOptions(targetStoryId, actorId),
    );
    return {
      storyId: targetStoryId,
      worldId: run?.worldId,
      narrativeProfile: worldRepository.getNarrativeProfile(targetStoryId) || undefined,
      rulesProfile: worldRepository.getRulesProfile(targetStoryId) || undefined,
      worldTime: { ...state.worldTime },
      activeLocationId: canonicalLocationId,
      activeLocation,
      protagonist: {
        ...state.protagonist,
        skills: run?.characterSkills || run?.protagonist?.skills || [],
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
      combatState: combatProjection,
      contextTransparency: this.getContextTransparency(targetStoryId),
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
    // N18/N8 continuation-turn gate. Opening scenes already use this review loop;
    // live turns must not silently accept environment-only or consequence-free prose.
    if (narrativeResponse && narrativeTurnPackage && narrativeGeneration?.source !== 'DETERMINISTIC_FALLBACK') {
      const previousNarrations = this.getDynamicStoryState(targetStoryId).actionHistory
        .filter((entry) => Boolean(entry.narrativeResponse))
        .slice(-6)
        .map((entry) => String(entry.narrativeResponse || ''));
      const firstReview = this.evaluateLiveNarrativeQuality({ narrativeText: narrativeResponse, playerAction: String(freeformText), actionResolution, situation: resolutionSituation, intent: resolutionIntent, previousNarrations });
      if (!firstReview.accepted) {
        try {
          const rewritePrompt = [
            'CANONICAL LIVE-TURN CONTEXT — preserve exactly; never invent beyond it:',
            'PLAYER ACTION: ' + String(freeformText),
            'CANONICAL ACTION RESOLUTION: ' + JSON.stringify(actionResolution),
            'COMMITTED OUTCOME: ' + committedOutcome,
            'CURRENT SITUATION: ' + JSON.stringify(resolutionSituation),
            '',
            'QUALITY REVIEW: richness=' + firstReview.richness.decision + ' score=' + firstReview.richness.overallScore.toFixed(2),
            ...firstReview.richness.issues.slice(0, 8).map(issue => '- [' + issue.severity + '] ' + issue.message + (issue.evidence ? ' Evidence: ' + issue.evidence : '')),
            firstReview.pacingReason ? 'Pacing issue: ' + firstReview.pacingReason : '',
            firstReview.actionFidelity.reason ? 'Action-fidelity issue: ' + firstReview.actionFidelity.reason : '',
            '',
            'ORIGINAL NARRATION:', narrativeResponse,
            '',
            'REWRITE REQUIREMENTS:',
            'Answer the player action first. Show what the action physically or socially does to the situation.',
            'If another entity is affected, show a concrete visible reaction, response, or changed attention.',
            'If an object is affected, show the object-level consequence rather than only a sound effect.',
            'Do not merely restate the room or list scenery.',
            'Do not invent a consequence not supported by the canonical action resolution or current situation.',
            'Do not choose the player’s next consequential action.',
            'Return JSON only with narrativeText and structuredEvents.',
          ].filter(Boolean).join('\n');
          const rewriteSystem = 'You are Dreamville’s live-turn narrative quality editor. Rewrite only the presentation of the already-committed turn. Canonical mechanics, world state, epistemic boundaries, and player agency are immutable. The result must contain a clear action -> consequence/reaction beat.';
          const reviewResponse = await worldRepository.getAiOrchestrator().executeTaskGeneration('narrative.review', rewritePrompt, rewriteSystem, {
            timeoutMs: 7000, maxTokens: 900, contextTokens: Math.min(12000, Math.ceil(rewritePrompt.length / 4)),
            validateResponse: (text) => parseLiveNarrativeReview(text) ? { valid: true } : { valid: false, errorReason: 'Live narrative review must return usable JSON prose.' },
          });
          if (reviewResponse.source !== 'DETERMINISTIC_FALLBACK') {
            const parsed = parseLiveNarrativeReview(reviewResponse.text);
            if (parsed) {
              const postReview = this.evaluateLiveNarrativeQuality({ narrativeText: parsed.narrativeText, playerAction: String(freeformText), actionResolution, situation: resolutionSituation, intent: resolutionIntent, previousNarrations });
              if (postReview.accepted) {
                narrativeResponse = parsed.narrativeText;
                narrativeTurnPackage = { ...narrativeTurnPackage, narrative: [narrativeResponse], events: [...(narrativeTurnPackage.events || []), 'LIVE_NARRATION_REWRITE_ACCEPTED'] };
              } else {
                narrativeTurnPackage = { ...narrativeTurnPackage, events: [...(narrativeTurnPackage.events || []), 'LIVE_NARRATION_REVIEW_REJECTED'] };
              }
            }
          }
        } catch (reviewError: any) {
          console.warn('[NarrationQualityGate] Live narration rewrite failed; retaining original provider result.', { storyId: targetStoryId, actionId: baseResult?.actionId, error: reviewError?.message || String(reviewError) });
        }
      }
    }
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
  /**
   * Presentation-only live-turn quality gate. Reuses N18/N8 and adds a hard
   * action -> consequence/reaction invariant for non-observation player actions.
   */
  public evaluateLiveNarrativeQuality(params: {
    narrativeText: string;
    playerAction: string;
    actionResolution: ActionResolution;
    situation: import('../domain/currentSituation').CurrentSituation;
    intent: PlayerIntent;
    previousNarrations?: string[];
  }): {
    accepted: boolean;
    richness: NarrativeRichnessEvaluation;
    pacingValid: boolean;
    pacingReason?: string;
    actionFidelity: { valid: boolean; reason?: string };
  } {
    const sceneComposition: any = {
      version: 1,
      turnId: params.situation.turnId,
      sceneObjective: params.actionResolution.actualEffect || 'Show the immediate result of the player action.',
      beatType: 'MICRO_ACTION',
      narrativeFocus: [
        'Answer the player action directly.',
        params.playerAction,
        params.actionResolution.actualEffect,
        ...(params.actionResolution.physicalConsequences || []),
        ...(params.actionResolution.playerVisibleConsequences || []),
      ].filter(Boolean).slice(0, 8),
      emotionalBeat: 'The situation responds to the player action.',
      emotionalMovement: params.actionResolution.outcomeTier === 'NO_CHECK' ? 'HOLD' : 'RISING',
      physicalBeat: params.actionResolution.actualEffect || 'A visible consequence follows the action.',
      sensoryAnchor: params.situation.location.ambientSensory,
      dialogueAct: params.intent.speechIntent ? 'RESPOND' : 'NONE',
      subtext: [], reveal: [], withhold: [],
      reactionPriority: (params.actionResolution.targetEntityIds || [])
        .map(id => params.situation.nearbyEntities.find(entity => entity.id === id)?.name)
        .filter((name): name is string => Boolean(name)),
      tensionDirection: params.actionResolution.outcomeTier === 'FAILURE' || params.actionResolution.outcomeTier === 'FAILURE_WITH_COST' ? 'RISING' : 'STEADY',
      pacingShape: 'MICRO_BEAT',
      closingBeat: 'Land the immediate consequence or reaction without deciding the player’s next action.',
      compositionConfidence: 0.95,
      expiresAfterNarration: true,
    };
    const plan: EphemeralNarrativePlan = {
      turnId: params.situation.turnId,
      objective: params.actionResolution.actualEffect || 'Resolve the player action in presentation.',
      immediateSteps: ['Acknowledge the player action.', 'Show its immediate physical or social consequence.', 'Leave the next choice to the player.'],
      informationToReveal: [],
      entitiesToReact: [...(params.actionResolution.targetEntityIds || [])],
      continuityRequirements: [],
      forbiddenAssumptions: ['Do not invent hidden facts, new canon, or an uncommitted outcome.', 'Do not choose the player’s next consequential action.'],
      stateEffectsExpected: [],
      sceneComposition,
      createdAt: params.situation.worldTime,
      expiresAfterNarration: true,
    };
    const turnPackage: import('../domain/aiOrchestrator').StructuredTurnPackage = {
      narrative: [String(params.narrativeText || '').trim()], dialogue: [], events: [], stateChanges: [], memoryCandidates: [], audioCues: [],
    };
    const richness = NarrativeRichnessEvaluator.evaluate({ intent: params.intent, situation: params.situation, plan, turnPackage, previousNarrations: params.previousNarrations || [] });
    const pacingContract = NarrativePacingEngine.resolve({ situation: params.situation, intent: params.intent });
    const pacing = NarrativePacingEngine.validateNarration(params.narrativeText, pacingContract);
    const observationLike = params.intent.action === 'observe' || params.intent.interactionMode === 'PASSIVE_OBSERVATION';
    const actionAnchor = liveNarrativeLexicalOverlap(params.narrativeText, params.playerAction) >= 0.08 ||
      (params.actionResolution.targetEntityIds || []).some(id => {
        const entity = params.situation.nearbyEntities.find(item => item.id === id);
        return Boolean(entity?.name && params.narrativeText.toLowerCase().includes(entity.name.toLowerCase()));
      });
    const consequenceText = [params.actionResolution.actualEffect, ...(params.actionResolution.physicalConsequences || []), ...(params.actionResolution.playerVisibleConsequences || [])].join(' ');
    const consequenceOverlap = liveNarrativeLexicalOverlap(params.narrativeText, consequenceText) >= 0.08;
    const consequenceSignal = /\b(?:react|reacts|reacted|turns|turned|looks|looked|glances|glanced|flinches|flinched|recoils|recoiled|freezes|froze|stiffens|stiffened|shifts|shifted|steps back|stepped back|approaches|approached|retreats|retreated|draws|drew|raises|raised|lowers|lowered|notices|noticed|catches|caught|lodges|lodged|embeds|embedded|strikes|struck|hits|hit|pierces|pierced|splits|split|breaks|broke|opens|opened|closes|closed|falls|fell|stops|stopped|moves|moved|changes|changed|attention|alarm|silence|settles|settled)\b/i.test(params.narrativeText);
    const actionFidelityValid = observationLike || (actionAnchor && (consequenceSignal || consequenceOverlap));
    const actionFidelityReason = actionFidelityValid ? undefined : 'Narration acknowledges too little of the player action or fails to show a concrete consequence/reaction beat.';
    return { accepted: richness.decision === 'PASS' && pacing.valid && actionFidelityValid, richness, pacingValid: pacing.valid, pacingReason: pacing.reason, actionFidelity: { valid: actionFidelityValid, reason: actionFidelityReason } };
  }
  public async processCustomAction(
    request: ActionRequest,
    canonicalCommandId?: string,
    options?: { bypassCapabilityAdvisor?: boolean },
  ): Promise<ActionResult> {
    // Bypass is an internal server option only. A client cannot inject it through the HTTP payload.
    const bypassCapabilityAdvisor = Boolean(options?.bypassCapabilityAdvisor);
    const preventCapabilityExecution = Boolean((request as any).preventCapabilityExecution);
    const targetStoryId = (request as any).storyId || this.activeStoryId;
    const playerForAdvice = worldRepository.getPlayerLifecycle(targetStoryId);
    const actorId = playerForAdvice?.actorId || `player_actor_${targetStoryId}`;
    let actionAdvice: import('../services/storyActionAdvisor').ActionAdvice | undefined;
    const freeformText =
      (request as any).actionText ||
      (request as any).customText ||
      (request as any).description ||
      (request as any).input ||
      'Performed freeform action.';

    // Detect an actionable hostile encounter before capability-advisor gating.
    // A canonical spell such as Fireball can live in SpellRuntime rather than
    // CapabilityEngine, and must still reach the combat transition pipeline.
    const encounterCandidate = request.type === 'CUSTOM_ACTION'
      ? combatEncounterService.findHostileCandidate(
          targetStoryId,
          actorId,
          String(freeformText),
          worldRepository,
        )
      : undefined;

    if (request.type === 'CUSTOM_ACTION' && !bypassCapabilityAdvisor && !encounterCandidate) {
      actionAdvice = await storyActionAdvisor.advise(targetStoryId, String(freeformText));
      const advice = actionAdvice;

      if (advice.mode === 'SUGGEST_ALTERNATIVE' || advice.mode === 'CAPABILITY_SIMULATION') {
        return {
          success: false,
          actionId: deterministicId('advice_pending', targetStoryId, String((request as any).actionText || '')),
          requestType: request.type,
          status: 'MOCK_ENGINE_REJECTED',
          message: advice.simulation?.explanation || 'Action requires a capability decision before execution.',
          authoritativeFeedback: advice.proposal?.reasonRequestedCapabilityUnavailable || advice.simulation?.explanation || 'Capability decision required.',
          actionAdvice: advice,
          viewState: this.getSanitizedViewState(targetStoryId),
        };
      }

      if (advice.mode === 'NORMAL_ACTION') {
        // Ordinary narrative actions never inherit capability execution state.
        delete (request as any).intendedCapabilityId;
        (request as any).preventCapabilityExecution = true;
      } else if (advice.recognizedCapability?.id) {
        (request as any).intendedCapabilityId = advice.recognizedCapability.id;
      }
    }

    let baseResult: ActionResult | null = null;
    if (request.type !== 'CUSTOM_ACTION') {
      return this.processAction(request, canonicalCommandId);
    }

    // Encounter detection must happen before the generic story-action resolver.
    // Otherwise a hostile opening action could be executed once as a story action
    // and a second time as a combat action.
    if (encounterCandidate) {
      const pending = combatEncounterService.buildPendingCombatTransition(encounterCandidate);
      pending.targetId = encounterCandidate.targetId;
      pending.targetName = encounterCandidate.targetName;
      pending.actionText = String(freeformText);
      pending.precombatActionPending = !encounterCandidate.targetAwareOfPlayer;
      pending.narrativeLeadIn = encounterCandidate.targetAwareOfPlayer
        ? encounterCandidate.targetName + ' has perceived you. The encounter escalates into tactical combat.'
        : encounterCandidate.targetName + ' has not perceived you. Your opening action can resolve before initiative.';
      const transitionActionId = deterministicId(
        'story_combat_transition',
        targetStoryId,
        actorId,
        String(freeformText),
        canonicalCommandId || 'story-action',
      );
      return {
        success: true,
        actionId: transitionActionId,
        requestType: request.type,
        status: 'MOCK_ENGINE_COMMITTED',
        message: encounterCandidate.targetAwareOfPlayer
          ? 'Hostile encounter detected; tactical combat transition prepared.'
          : 'Hostile encounter detected; a pre-combat opening is available.',
        authoritativeFeedback: encounterCandidate.reason,
        narrativeResponse: pending.precombatActionPending
          ? 'A hostile presence is here, but it has not perceived you. Your opening action can resolve before initiative.'
          : 'A hostile presence has perceived you. Tactical combat is now ready to begin.',
        combatTransition: pending,
        viewState: this.getSanitizedViewState(targetStoryId),
      };
    }

    baseResult = this.processAction(request, canonicalCommandId);
    if (!baseResult) {
      return baseResult;
    }

    const conditionEngine = worldRepository.getConditionEngine(targetStoryId);
    const player = worldRepository.getPlayerLifecycle(targetStoryId);
    const run = worldRepository.getStoryRun(targetStoryId);
    const currentLocationId = player?.locationId || run?.currentLocationId;
    const location = currentLocationId
      ? worldRepository.getGeographyGraph(targetStoryId).getNode(currentLocationId)
      : undefined;
    const rulesProfile = worldRepository.getRulesProfile(targetStoryId)
      || rulesProfileEngine.createDefault('FULL_DND');

    const itemUseResolution: ItemUseResolution = narrativeStateBroker.inspectItemUse(
      worldRepository,
      targetStoryId,
      actorId,
      String(freeformText),
    );
    const itemUseBlocked = itemUseResolution.requested && !itemUseResolution.found;
    const resolutionSituation = CurrentSituationBuilder.build({
      storyId: targetStoryId,
      playerAction: String(freeformText),
      viewerActorId: actorId,
      worldRepo: worldRepository,
    });
    const resolutionIntent = PlayerIntentInterpreter.deterministic(String(freeformText), resolutionSituation);
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

    const resolutionGate = ResolutionGate.evaluate({
      actionText: String(freeformText),
      currentSituation: resolutionSituation,
      playerIntent: resolutionIntent,
      authoredChallenge: authoredChallenge || undefined,
      capabilityDetected: Boolean(
        this.explicitCapabilityIntentForNarration(String(freeformText)) ||
        actionAdvice?.recognizedCapability?.id ||
        actionAdvice?.mode === 'EXECUTE_EXISTING'
      ),
      itemBlocked: itemUseBlocked,
    });
    const storyCheck = itemUseBlocked || !resolutionGate.shouldRoll
      ? null
      : storyCheckAuthority.resolve(worldRepository, {
          storyId: targetStoryId,
          actorId,
          actionText: String(freeformText),
          sceneText,
          challenge: authoredChallenge || undefined,
          rulesProfile,
          resolutionHint: actionAdvice?.aiPipeline?.resolutionHint
            ? { check: actionAdvice.aiPipeline.resolutionHint.check }
            : undefined,
        });

    let committedOutcome = itemUseBlocked
      ? 'The requested item is not available in the actor inventory. Do not narrate the item as if it was used.'
      : '';
    if (storyCheck) {
      const testLabel = storyCheck.testType === 'SAVING_THROW'
        ? storyCheck.ability + ' saving throw'
        : storyCheck.skill + ' check';
      const guidance = storyCheck.narrativeGuidance;
      committedOutcome = [
        testLabel + ' ' + (storyCheck.success ? 'succeeded' : 'failed') + ' (' + storyCheck.total + ' vs DC ' + storyCheck.difficultyClass + ').',
        guidance && guidance.checkJustification ? 'Why the check was required: ' + guidance.checkJustification : '',
        guidance ? (storyCheck.success ? (guidance.successGuidance ? 'Resolution guidance: ' + guidance.successGuidance : '') : (guidance.failureGuidance ? 'Failure guidance: ' + guidance.failureGuidance : '')) : '',
      ].filter(Boolean).join(' ');

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
    if (!storyCheck && !itemUseBlocked) {
      if (this.explicitCapabilityIntentForNarration(String(freeformText))) {
        committedOutcome = 'A special capability-related action was resolved by the canonical capability/rules layer. Narrate only the visible result and never expose capability or engine terminology.';
      } else {
        committedOutcome = 'This is an ordinary narrative/world action. No special capability was invoked. Narrate the physical and sensory result naturally and continue the scene.';
      }
    }

    const canonicalEventForResolution = canonicalCommandId
      ? worldRepository
          .getRecentCanonicalCommandEvents(targetStoryId, 24)
          .reverse()
          .find((event) => event.commandId === canonicalCommandId)
      : undefined;

    let actionResolution: ActionResolution = {
      resolutionId: deterministicId('action_resolution', targetStoryId, baseResult.actionId, String(freeformText)),
      storyId: targetStoryId,
      turnId: baseResult.actionId,
      playerAction: String(freeformText),
      playerIntent: {
        action: resolutionIntent.action,
        interactionMode: resolutionIntent.interactionMode,
        movementIntent: resolutionIntent.movementIntent,
        observationIntent: resolutionIntent.observationIntent,
        speechIntent: resolutionIntent.speechIntent,
        informationGoal: resolutionIntent.informationGoal,
        targetIds: resolutionIntent.explicitTargets.map((target) => target.id).filter((id): id is string => Boolean(id)),
      },
      attemptedEffect: String(freeformText),
      targetEntityIds: resolutionIntent.explicitTargets.map((target) => target.id).filter((id): id is string => Boolean(id)),
      resolutionMethod:
        authoredChallenge ? 'AUTHORED_CHALLENGE' :
        resolutionGate.mode === 'CAPABILITY' ? 'CAPABILITY' :
        itemUseResolution.requested ? 'ITEM_USE' :
        storyCheck ? 'CHECK' :
        resolutionGate.mode === 'DETERMINISTIC' ? 'DETERMINISTIC' :
        'NO_CHECK',
      check: storyCheck || undefined,
      outcomeTier: storyCheck ? outcomeTierFromCheck(storyCheck) : (itemUseBlocked ? 'BLOCKED' : 'NO_CHECK'),
      actualEffect: storyCheck
        ? (storyCheck.success
          ? (storyCheck.narrativeGuidance?.successGuidance || 'The attempted action resolves successfully.')
          : (storyCheck.narrativeGuidance?.failureGuidance || 'The attempted action does not resolve cleanly.'))
        : itemUseBlocked
          ? 'The requested item was unavailable.'
          : (resolutionGate.mode === 'CAPABILITY'
            ? 'The action is resolved by the established capability/rules layer.'
            : 'The action proceeds as an ordinary deterministic world/narrative action.'),
      canonicalStateChanges: (canonicalEventForResolution?.mutationPaths || []).map((path: string) => ({
        kind: 'CANONICAL_MUTATION',
        targetId: actorId,
        value: path,
        metadata: { source: 'canonical_command_event' },
      })),
      physicalConsequences: storyCheck?.consequence?.summary ? [storyCheck.consequence.summary] : [],
      playerVisibleConsequences: [
        ...(storyCheck?.narrativeGuidance
          ? [storyCheck.success ? storyCheck.narrativeGuidance.successGuidance : storyCheck.narrativeGuidance.failureGuidance]
          : []),
        ...(storyCheck?.consequence?.summary ? [storyCheck.consequence.summary] : []),
      ].filter(Boolean),
      evidenceIds: [
        canonicalEventForResolution?.eventId,
        storyCheck?.checkId,
        storyCheck?.challengeId,
        ...(storyCheck?.consequence?.challengeId ? [storyCheck.consequence.challengeId] : []),
      ].filter((value): value is string => Boolean(value)),
      uncertainty: resolutionGate.uncertaintyBasis,
      provenance: {
        source: 'CANONICAL_ENGINE',
        canonicalCommandId,
        canonicalEventId: canonicalEventForResolution?.eventId,
      },
    };

    let itemUseResult: ReturnType<typeof narrativeStateBroker.commitItemUse> | undefined;
    if (itemUseResolution.requested && itemUseResolution.found && (!storyCheck || storyCheck.success)) {
      itemUseResult = narrativeStateBroker.commitItemUse(
        worldRepository,
        targetStoryId,
        actorId,
        itemUseResolution,
      );
      if (itemUseResult.success) {
        const itemName = itemUseResolution.item?.name || 'item';
        if (itemUseResult.healing) {
          committedOutcome += ` ${itemName} was consumed and restored ${itemUseResult.healing.finalAmount} health. Narrate only the visible use and recovery; do not expose engine terminology.`;
        } else if (itemUseResult.consumed?.success) {
          committedOutcome += ` ${itemName} was used successfully; the canonical inventory transaction consumed the item's configured quantity/charge. Narrate the visible effect only.`;
        } else {
          committedOutcome += ` ${itemName} was used, but it is not consumable under its canonical definition.`;
        }
      } else {
        committedOutcome += ` The requested item use failed: ${itemUseResult.errorReason || 'item use could not be committed'}.`;
      }
    } else if (itemUseResolution.requested && itemUseResolution.found && storyCheck && !storyCheck.success) {
      committedOutcome += ` The attempted use of ${itemUseResolution.item?.name || 'the item'} did not resolve successfully; do not consume the item.`;
      actionResolution.actualEffect += ' The item-use attempt did not resolve successfully.';
    }

    if (itemUseResult?.success) {
      actionResolution.resolutionMethod = 'ITEM_USE';
      if (!storyCheck) actionResolution.outcomeTier = 'CLEAN_SUCCESS';
      const itemName = itemUseResolution.item?.name || 'item';
      if (itemUseResult.healing) {
        actionResolution.actualEffect += ` ${itemName} was consumed and restored ${itemUseResult.healing.finalAmount} health.`;
        actionResolution.playerVisibleConsequences.push(
          `${itemName} was consumed and restored ${itemUseResult.healing.finalAmount} health.`,
        );
        actionResolution.canonicalStateChanges.push({
          kind: 'INVENTORY',
          targetId: actorId,
          value: { itemId: itemUseResolution.item?.id, consumed: true },
          metadata: { source: 'canonical_item_use' },
        });
        actionResolution.canonicalStateChanges.push({
          kind: 'HEALTH',
          targetId: actorId,
          value: { restored: itemUseResult.healing.finalAmount },
          metadata: { source: 'canonical_item_use' },
        });
      } else if (itemUseResult.consumed?.success) {
        actionResolution.actualEffect += ` ${itemName} was used successfully and its configured quantity/charge was consumed.`;
        actionResolution.playerVisibleConsequences.push(
          `${itemName} was used successfully.`,
        );
        actionResolution.canonicalStateChanges.push({
          kind: 'INVENTORY',
          targetId: actorId,
          value: { itemId: itemUseResolution.item?.id, consumed: true },
          metadata: { source: 'canonical_item_use' },
        });
      }
    } else if (itemUseResult && !itemUseResult.success) {
      actionResolution.outcomeTier = storyCheck?.success === false ? 'FAILURE_WITH_COST' : 'BLOCKED';
      actionResolution.actualEffect += ` Item use failed: ${itemUseResult.errorReason || 'item use could not be committed'}.`;
      actionResolution.uncertainty.push('Canonical item-use transaction did not commit.');
    }

    const conditionStateBeforeAction = conditionEngine.getActorState(actorId);

    const spatialMovementIntent = Boolean(resolutionIntent.movementIntent) &&
      !player?.isTraveling &&
      currentLocationId === player?.locationId &&
      /\b(?:closer|toward|towards|approach|near|beside|next to|forward)\b/i.test(String(freeformText));
    if (spatialMovementIntent && (!storyCheck || storyCheck.success)) {
      const focusTarget = resolutionIntent.explicitTargets.find((target) =>
        resolutionSituation.nearbyEntities.some((entity) => entity.id === target.id)
      );
      const normalizedAction = String(freeformText).toLowerCase();
      const proximityBand =
        /\b(?:contact|touch|touching|grab|hold)\b/.test(normalizedAction) ? 'CONTACT' :
        /\b(?:adjacent|beside|next to|right next to)\b/.test(normalizedAction) ? 'ADJACENT' :
        'NEAR';
      const updatedPlayer = worldRepository.getPlayerLifecycle(targetStoryId);
      if (updatedPlayer) {
        worldRepository.updatePlayerLifecycle(targetStoryId, updatedPlayer.copyWith({
          localSpatialState: {
            ...updatedPlayer.localSpatialState,
            areaId: updatedPlayer.localSpatialState?.areaId || updatedPlayer.locationId,
            focusEntityId: focusTarget?.id,
            focusLabel: focusTarget?.name || undefined,
            proximityBand,
            updatedTurnId: baseResult.actionId,
          },
        }));
        actionResolution.physicalConsequences.push(
          'The character is now canonically positioned ' + proximityBand.toLowerCase().replace('_', ' ') +
          ' within the current location' + (focusTarget ? ' relative to ' + focusTarget.name : '') + '.'
        );
        actionResolution.actualEffect += ' The bounded local spatial state reflects the resolved movement.';
        actionResolution.canonicalStateChanges.push({
          kind: 'SPATIAL',
          targetId: actorId,
          value: {
            localSpatialState: {
              proximityBand,
              focusEntityId: focusTarget?.id,
              focusLabel: focusTarget?.name,
            },
          },
          metadata: { scope: 'INTRA_LOCATION_SPATIAL', source: 'canonical_movement_resolution' },
        });
      }
    }

    const resolutionHint = actionAdvice?.aiPipeline?.resolutionHint;
    if (
      resolutionHint?.hazard?.type === 'FALL' &&
      Number.isFinite(resolutionHint.hazard.distanceFeet) &&
      Number(resolutionHint.hazard.distanceFeet) >= 10 &&
      rulesProfile.mode !== 'CUSTOM_HOMEBREW_DND'
    ) {
      const fallResolution = environmentalHazardEngine.resolveFall({
        repository: worldRepository,
        storyId: targetStoryId,
        actorId,
        distanceFeet: Number(resolutionHint.hazard.distanceFeet),
      });
      if (fallResolution.applied && fallResolution.damage) {
        committedOutcome += ` A canonical ${fallResolution.damageFormula} fall-damage resolution was applied, resulting in ${fallResolution.damage.finalAmount} damage and ${fallResolution.damage.healthCurrent} health remaining.`;
        actionResolution.outcomeTier =
          storyCheck?.success === false ? 'FAILURE_WITH_COST' :
          storyCheck ? 'SUCCESS_WITH_COST' : 'SUCCESS_WITH_COST';
        actionResolution.actualEffect += ` A canonical fall consequence applied ${fallResolution.damage.finalAmount} damage.`;
        actionResolution.physicalConsequences.push(
          `Fall consequence: ${fallResolution.damage.finalAmount} damage; ${fallResolution.damage.healthCurrent} health remaining.`,
        );
        actionResolution.playerVisibleConsequences.push(
          `The fall causes ${fallResolution.damage.finalAmount} damage.`,
        );
        actionResolution.canonicalStateChanges.push({
          kind: 'DAMAGE',
          targetId: actorId,
          value: {
            amount: fallResolution.damage.finalAmount,
            healthCurrent: fallResolution.damage.healthCurrent,
          },
          metadata: { source: 'environmental_hazard_engine' },
        });
      }
    }

    // Resolve condition-driven action triggers before narration so the narrator sees the committed result.
    conditionEngine.processAction(actorId, String(freeformText), worldRepository.getWorldClock(targetStoryId).getAbsoluteTime());
    conditionEngine.tickActor(actorId, 'TURN', worldRepository.getWorldClock(targetStoryId).getAbsoluteTime());

    const conditionStateAfterAction = conditionEngine.getActorState(actorId);
    if (conditionStateBeforeAction && conditionStateAfterAction) {
      const healthChanged = conditionStateBeforeAction.healthCurrent !== conditionStateAfterAction.healthCurrent;
      const deathChanged = Boolean(conditionStateBeforeAction.dead) !== Boolean(conditionStateAfterAction.dead);
      if (healthChanged || deathChanged) {
        actionResolution.outcomeTier =
          actionResolution.outcomeTier === 'FAILURE'
            ? 'FAILURE_WITH_COST'
            : actionResolution.outcomeTier === 'CLEAN_SUCCESS'
              ? 'SUCCESS_WITH_COST'
              : actionResolution.outcomeTier;
        actionResolution.actualEffect += healthChanged
          ? ` Condition processing changed health to ${conditionStateAfterAction.healthCurrent}.`
          : ' Condition processing changed the actor state.';
        actionResolution.canonicalStateChanges.push({
          kind: 'CONDITION',
          targetId: actorId,
          value: {
            healthCurrent: conditionStateAfterAction.healthCurrent,
            dead: Boolean(conditionStateAfterAction.dead),
          },
          metadata: { source: 'condition_engine' },
        });
      }
    }
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
    let narrativeTurnPackage: import('../domain/aiOrchestrator').StructuredTurnPackage | undefined;
    let narrativeError: import('../../src/types').ActionLog['narrativeError'];
    let narrativeGeneration: import('../../src/types').ActionLog['narrativeGeneration'];
    let narrativeResearchPacket: any;
    let narrativeContextAudit: any;
    let narrativeVisualCues: string[] | undefined;
    try {
      const narrator = worldRepository.getAiOrchestrator();
      const generated = await narrator.generateNarrativeOnly({
        storyId: targetStoryId,
        playerAction: String(freeformText),
        actionResolution,
        committedOutcome,
        hardTokenBudget: 700,
        timeoutMs: 7000,
        maxRetries: 1,
        recentTurns: this.getDynamicStoryState(targetStoryId).actionHistory
          .filter((entry) => entry.id !== baseResult?.actionId && Boolean(entry.narrativeResponse || entry.description))
          .slice(-2)
          .reverse()
          .map((entry) => ({
            playerAction: entry.description,
            narration: entry.narrativeResponse || entry.authoritativeFeedback || '',
            worldTime: entry.timestamp,
          })),
        npcTargetId: this.getDynamicStoryState(targetStoryId).activeDialogue?.speakerId || undefined,
        sceneContext: [
          run?.openingScene?.narrativeText,
          run?.startingSituation?.summary,
          run?.startingSituation?.hook,
          location?.name,
          location?.description,
          location?.ambientSensory,
        ].filter(Boolean).join(' '),
        continuationDirective: (options as any)?.narrationDirective
          ? 'Connected AI pipeline directive. Treat this as presentation guidance only; canonical mechanics and committed outcome remain authoritative: ' + (options as any).narrationDirective
          : undefined,
      } as any);

      narrativeResearchPacket = generated.researchPacket;
      narrativeContextAudit = generated.contextAudit;
      narrativeGeneration = {
        source: generated.source,
        providerId: generated.providerId,
        modelId: generated.modelId,
        regenerated: false,
      };
      if (generated.success && generated.turnPackage?.narrative?.length) {
        narrativeTurnPackage = generated.turnPackage;
        narrativeResponse = generated.turnPackage.narrative.join('\n\n').trim();
        narrativeVisualCues = (generated.turnPackage.visualCues || [])
          .map((cue: any) => typeof cue === 'string' ? cue : cue?.prompt)
          .filter((cue: any): cue is string => typeof cue === 'string' && cue.trim().length > 0)
          .slice(0, 4);

        if (generated.source === 'DETERMINISTIC_FALLBACK') {
          // The local emergency engine is a successful presentation fallback, not an AI error.
          // Keep the player-facing turn alive and expose its provenance without showing an
          // "AI unavailable" error card.
          narrativeGeneration = {
            source: 'DETERMINISTIC_FALLBACK',
            providerId: 'provider_local_story_fallback',
            modelId: 'local-story-fallback',
            regenerated: false,
          };
        }
      } else {
        // Last-resort local prose fallback. This is deliberately based on the committed
        // action and canonical scene rather than a fixed generic error message, so a total
        // provider outage still produces a useful, action-specific narration.
        narrativeResponse = this.synthesizeFreeformActionFallback(
          targetStoryId,
          String(freeformText),
          committedOutcome,
        );
        narrativeTurnPackage = {
          narrative: [narrativeResponse],
          dialogue: [],
          events: ['LOCAL_NARRATION_FALLBACK'],
          stateChanges: [],
          memoryCandidates: [],
          audioCues: [],
        };
        narrativeGeneration = {
          source: 'DETERMINISTIC_FALLBACK',
          providerId: 'provider_local_story_fallback',
          modelId: 'local-story-fallback',
          regenerated: false,
        };
        narrativeVisualCues = undefined;
        // Keep provider failure details in server logs/diagnostics rather than turning
        // an otherwise playable local fallback into a blocking narration error.
        narrativeError = undefined;
        console.warn('[NarrationFallback] AI narration unavailable; local story fallback used.', {
          storyId: targetStoryId,
          actionId: baseResult?.actionId,
          provider: generated.providerId,
          model: generated.modelId,
          error: generated.error,
          fallbackReason: generated.fallbackReason,
          attemptsTrail: generated.attemptsTrail,
        });
      }
    } catch (error: any) {
      narrativeResponse = this.synthesizeFreeformActionFallback(
        targetStoryId,
        String(freeformText),
        committedOutcome,
      );
      narrativeTurnPackage = {
        narrative: [narrativeResponse],
        dialogue: [],
        events: ['LOCAL_NARRATION_FALLBACK'],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      };
      narrativeGeneration = {
        source: 'DETERMINISTIC_FALLBACK',
        providerId: 'provider_local_story_fallback',
        modelId: 'local-story-fallback',
        regenerated: false,
      };
      narrativeError = undefined;
      console.warn('[NarrationFallback] Narration generation threw; local story fallback used.', {
        storyId: targetStoryId,
        actionId: baseResult?.actionId,
        error: error?.message || String(error),
      });
    }

    const state = this.getDynamicStoryState(targetStoryId);
    const actionLog = state.actionHistory.find((entry) => entry.id === baseResult.actionId);
    const actionTips = await storyActionAdvisor.getTipsForAction(
      targetStoryId,
      String(freeformText)
    );

    if (actionLog) {
      actionLog.narrativeResponse = narrativeResponse || undefined;
      actionLog.narrativeError = narrativeError;
      actionLog.narrativeGeneration = narrativeGeneration;
      actionLog.visualCues = narrativeVisualCues;
      if (storyCheck) {
        actionLog.checkResult = storyCheck;
      }
      actionLog.actionResolution = actionResolution;
      if (actionTips.length > 0) {
        actionLog.actionAdvice = {
          mode: 'NORMAL_ACTION',
          actionText: String(freeformText),
          actorId,
          tips: actionTips,
          canExecuteNow: true,
        };
      }
    }

    // Feed the committed turn back into the continuity loop so future research,
    // plot, plan, memory retrieval, and narration see what actually happened.
    narrativeContinuityEngine.recordTurn(worldRepository, {
      storyId: targetStoryId,
      turnId: baseResult.actionId,
      playerAction: String(freeformText),
      turnPackage: narrativeTurnPackage || {
        narrative: narrativeResponse ? [narrativeResponse] : [],
        dialogue: [],
        events: [
          storyCheck
            ? (storyCheck.success ? 'STORY_CHECK_SUCCEEDED' : 'STORY_CHECK_FAILED')
            : 'STORY_ACTION_RESOLVED',
        ],
        stateChanges: [],
        memoryCandidates: storyCheck?.consequence?.summary
          ? [storyCheck.consequence.summary]
          : [],
        audioCues: [],
      },
    });

    const persistedRun = worldRepository.getStoryRun(targetStoryId);
    if (persistedRun) {
      const existingHistory = Array.isArray(persistedRun.runtimeState?.narrativeContextHistory)
        ? persistedRun.runtimeState.narrativeContextHistory
        : [];
      persistedRun.runtimeState = {
        ...(persistedRun.runtimeState || {}),
        narrativeContextHistory: [
          ...existingHistory,
          {
            actionId: baseResult.actionId,
            playerAction: String(freeformText),
            committedOutcome,
            research: narrativeResearchPacket || null,
            contextAudit: narrativeContextAudit || null,
            narration: {
              response: narrativeResponse || null,
              error: narrativeError || null,
              generation: narrativeGeneration || null,
            },
            capturedAt: formatCanonicalTimestamp(worldRepository.getWorldClock(targetStoryId).getTimestamp()),
          },
        ].slice(-24),
      };
      worldRepository.saveStoryRun(persistedRun);
    }

    return {
      ...baseResult,
      message: narrativeResponse || baseResult.message || 'Action resolved; narration is currently unavailable.',
      narrativeResponse: narrativeResponse || undefined,
      narrativeError,
      narrativeGeneration,
      checkResult: storyCheck || undefined,
      actionAdvice: actionTips.length > 0
        ? {
            mode: 'NORMAL_ACTION',
            actionText: String(freeformText),
            actorId,
            tips: actionTips,
            canExecuteNow: true,
          }
        : undefined,
      viewState: this.filterForExternalClient(state, targetStoryId),
    };
  }

  private formatNarrativeAtmosphere(raw: string): string {
    return String(raw || '')
      .split(/\n+/)
      .map((part) => part
        .replace(/^\s*(?:Visual|Sounds?|Scent|Tactile|Right now|Your turn)\s*:\s*/i, '')
        .trim())
      .filter(Boolean)
      .join(' ');
  }

  private explicitCapabilityIntentForNarration(text: string): boolean {
    return new CapabilitySimulationEngine().isCapabilityLikeRequest(text);
  }

  public synthesizeFreeformActionFallback(
    storyId: string,
    actionText: string,
    committedOutcome?: string
  ): string {
    const player = worldRepository.getPlayerLifecycle(storyId);
    const run = worldRepository.getStoryRun(storyId);
    const actorName = player?.name || run?.characterName || 'The protagonist';
    const location = worldRepository.getGeographyGraph(storyId)
      .getAllNodes()
      .find((node) => node.id === player?.locationId || node.id === run?.currentLocationId);
    const atmosphere = this.formatNarrativeAtmosphere(
      location?.ambientSensory || location?.description || 'The surroundings remain still.',
    );
    const normalized = actionText.toLowerCase();
    const continuity = narrativeContinuityEngine.getState(worldRepository, storyId);
    const recentBeat = continuity.plot.beats.at(-1)?.text || continuity.plot.summary;
    const openThread = continuity.plot.openThreads.at(-1) || continuity.plan.priorityThreads.at(-1) || '';

    const cleanThread = openThread
      .replace(/^Respond coherently to:\s*/i, '')
      .replace(/^Follow consequence of\s*/i, '')
      .trim();

    const sceneAnchor = recentBeat && recentBeat.length > 30
      ? recentBeat
      : atmosphere;

    if (/\b(inhale|breathe|breath|take a breath)\b/.test(normalized)) {
      return `${actorName} draws a slow breath and lets the moment settle around them. ${sceneAnchor}

The pause gives the scene room to speak for itself. ${atmosphere}`;
    }

    if (/\b(look|observe|inspect|search|scan|survey|examine|notice)\b/.test(normalized)) {
      return `${actorName} studies the scene rather than rushing past it. ${sceneAnchor}

Details separate themselves from the larger shape of the place: textures, distance, movement, and the small changes that would be easy to miss at a glance. ${atmosphere}${cleanThread ? `\n\nThe attention leaves ${cleanThread.toLowerCase().startsWith('the ') ? cleanThread : 'that thread'} unresolved, but more of the situation is now visible.` : ''}`;
    }

    if (/\b(listen|hear|listen for)\b/.test(normalized)) {
      return `${actorName} falls still and listens. ${sceneAnchor}

What reaches them is not yet a clear answer, only the character of the surrounding silence and whatever movement the place permits through it. ${atmosphere}`;
    }

    if (/\b(ask|asked|inquire|inquired|question|questioned|consult|consulted|gossip|rumor|rumours|rumors)\b/.test(normalized)) {
      const topicMatch = actionText.match(/\b(?:ask|inquire|question|consult)(?:.*?)(?:about|regarding)\s+(.+?)(?:[.!?]|$)/i);
      const topic = topicMatch?.[1]?.trim() || 'the matter you came to investigate';
      const openingNarrative = String(run?.openingScene?.narrativeText || '').trim();
      const sources = [openingNarrative, recentBeat, cleanThread]
        .map((value) => String(value || '').trim())
        .filter(Boolean);

      const topicTokens = topic
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 4 && !['about', 'what', 'people', 'heard'].includes(token));

      const groundedSnippet = sources
        .flatMap((source) => source.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean))
        .map((sentence) => ({
          sentence,
          score: topicTokens.reduce((score, token) => score + (sentence.toLowerCase().includes(token) ? 1 : 0), 0),
        }))
        .sort((a, b) => b.score - a.score || b.sentence.length - a.sentence.length)[0]?.sentence;

      if (groundedSnippet) {
        return actorName + ' works into the crowd and asks what people have heard about ' + topic + '. The replies circle around an existing account rather than a verified fact: ' + groundedSnippet + ' The rumor remains unconfirmed, but the exchange gives ' + actorName + ' something concrete to investigate instead of leaving the question unanswered.';
      }

      return actorName + ' works into the crowd and asks what people have heard about ' + topic + '. No one offers a reliable account; the response is limited to fragments of rumor and uncertainty. The question produces no confirmed fact yet, but it makes clear that a more direct source is needed.';
    }
    if (/\b(walk|move|step|approach|head|go|travel)\b/.test(normalized)) {
      const targetMatch = actionText.match(/\b(?:toward|towards|to|into|through|around)\s+(.+?)(?:[.!?]|$)/i);
      const destination = targetMatch?.[1]?.trim();
      return destination
        ? `${actorName} moves toward ${destination}, and the old vantage point gives way to a new one. ${atmosphere}

The scene changes by degrees as the distance closes; what was once peripheral becomes immediate. ${cleanThread ? `The unresolved thread of ${cleanThread.toLowerCase()} remains ahead.` : 'Nothing announces itself yet, leaving the next few steps deliberately uncertain.'}`
        : `${actorName} moves forward, changing position within the scene. ${atmosphere}

The new vantage point exposes details that were hidden by distance, while the situation around them remains active and unresolved.`;
    }

    if (/\b(open|close|unlock|enter|leave|follow|touch|pick up|take|grasp|hold)\b/.test(normalized)) {
      return `${actorName} follows through on the decision. The movement is small, but it changes the immediate shape of the scene. ${atmosphere}

For a moment nothing answers except the physical world itself; then the consequences of the choice begin to settle into place.`;
    }

    if (/\b(ask|say|speak|talk|tell|answer|reply)\b/.test(normalized)) {
      return `${actorName} speaks, breaking the stillness of the moment. ${atmosphere}

The words hang in the scene long enough to demand an answer, a reaction, or at least a change in how the surrounding silence is perceived.`;
    }

    if (committedOutcome && !/attempted action|outcome unfolds|canonical|capability|server authority|proposed novel/i.test(committedOutcome)) {
      return `${sceneAnchor} ${actorName} remains alert to what follows.

The immediate moment settles without closing the wider situation. ${cleanThread ? `The unresolved thread of ${cleanThread.toLowerCase()} remains in play.` : ''}`;
    }

    return `${actorName} follows through on the decision. ${sceneAnchor}

The moment does not end so much as shift, leaving the scene open to whatever the current situation already supports next.`;
  }


  /**
   * Server-authoritative resolution of player ActionRequests.
   */
  public processAction(request: ActionRequest, canonicalCommandId?: string): ActionResult {
    const targetStoryId = (request as any).storyId || this.activeStoryId;
    const state = this.getDynamicStoryState(targetStoryId);
    const clock = worldRepository.getWorldClock(targetStoryId);
    const clockTimestamp = clock.getTimestamp();
    const now = formatCanonicalTimestamp(clockTimestamp);
    const actionId = deterministicId(
      'act_srv',
      targetStoryId,
      canonicalCommandId || 'legacy-action',
      request?.type || 'UNKNOWN',
      (request as any)?.targetLocationId || '',
      (request as any)?.itemId || '',
      (request as any)?.slot || '',
      state.actionHistory.length,
      clockTimestamp.totalElapsedSeconds
    );
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
          const presentationFeedback = `You choose "${request.label}".`;
          logEntry = {
            id: actionId,
            timestamp: now,
            cycle: state.worldTime.cycle,
            actionType: 'DIALOGUE_CHOICE',
            description: `Player selected: "${request.label}"`,
            epistemicValidation: 'MOCK_ENGINE_COMMITTED',
            authoritativeFeedback,
            presentationFeedback,
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
        const presentationFeedback = activeLoc.ambientSensory || activeLoc.description || activeLoc.name;
        authoritativeFeedback = `Server emitted ambient sensory narrative: "${presentationFeedback}"`;
        logEntry = {
          id: actionId,
          timestamp: now,
          cycle: state.worldTime.cycle,
          actionType: 'INSPECTION',
          description: `Scanned surrounding environment at ${activeLoc.name}.`,
          epistemicValidation: 'MOCK_ENGINE_COMMITTED',
          authoritativeFeedback,
          presentationFeedback,
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

        const intendedCapabilityId = (request as any).intendedCapabilityId;
        const capabilitySimulation = new CapabilitySimulationEngine();
        const explicitCapabilityIntent =
          Boolean(intendedCapabilityId) ||
          capabilitySimulation.isCapabilityLikeRequest(freeformText);

        const interp = explicitCapabilityIntent
          ? capEngine.interpretFreeformAction({
              actorId,
              actionText: freeformText,
              intendedCapabilityId,
              executeIfValid: Boolean(intendedCapabilityId) && !(request as any).preventCapabilityExecution,
            })
          : {
              interpretationType: 'UNSUPPORTED' as const,
              actorId,
              actionText: freeformText,
              mappedCapability: undefined,
              proposedCapability: undefined,
              validationSuccess: false,
              narrativeInterpretation: 'Ordinary narrative action; no capability interpretation required.',
            };

        if (
          interp.interpretationType === 'NOVEL_CAPABILITY_PROPOSAL' &&
          !intendedCapabilityId &&
          !(request as any).preventCapabilityExecution
        ) {
          // A novel proposal is an internal advisory state, not a player action outcome.
          // Ordinary canonical action resolution must never expose capability-preview
          // mechanics or grant/execute an unapproved capability.
          success = true;
          message = 'The action is being resolved through the story rules.';
          authoritativeFeedback = 'Server authority recorded the freeform action as narrative intent; no new capability was acquired or executed.';
        } else if (interp.validationSuccess) {
          success = true;
          message =
            interp.interpretationType === 'EXISTING_CAPABILITY' || interp.interpretationType === 'CONTEXTUAL_MODIFICATION'
              ? 'The action is resolved through the character\'s established capabilities.'
              : 'The action is being resolved through the story rules.';
          const matchedId = interp.mappedCapability?.id || 'Existing Capability';
          authoritativeFeedback = `Server authority processed an owned capability action through CapabilityEngine (${matchedId}).`;
        } else {
          success = true;
          message = 'Ordinary story action recorded for narrative resolution.';
          authoritativeFeedback = 'Canonical authority recorded the player action; no capability was invoked.';
        }

        const chronicle = worldRepository.getHistoricalChronicleEngine(targetStoryId);
        const clock = worldRepository.getWorldClock(targetStoryId);
        const ts = clock.getTimestamp();
        this.recordChronicleEvidence(targetStoryId, chronicle, {
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
          actionType: 'CUSTOM_ACTION',
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
      if (logEntry.actionType !== 'NOTE_RECORD') {
        const completedTurns = state.actionHistory.reduce(
          (count, entry) => count + (entry.actionType === 'NOTE_RECORD' ? 0 : 1),
          0,
        );
        (logEntry as ActionLog & { turnNumber?: number }).turnNumber = completedTurns + 1;
      }
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
