import {
  KnowledgeFact,
  TravelJourney,
  WorldTimestamp,
} from '../domain/types';
import { PlayerLifecycleState } from '../domain/playerLifecycleState';
import { WorldClock } from '../domain/worldClock';
import { GeographyGraph } from '../domain/geographyGraph';
import { HistoricalChronicleEngine } from '../domain/historicalChronicleEngine';
import { InventoryItemEngine } from '../domain/inventoryItem';
import { CapabilityEngine } from '../domain/capabilityEngine';
import { ReusableSkillRegistry } from '../domain/reusableSkillRegistry';
import { TacticalCombatEngine, CombatPerceptionOptions } from '../domain/combatEngine';
import { MemoryOpportunityEngine } from '../domain/memoryOpportunityEngine';
import { SensoryEngine } from '../domain/sensoryEngine';
import { LivingWorldSimulation } from '../domain/livingWorldSimulation';
import { MultiModelOrchestrator } from '../domain/aiOrchestrator';
import { CharacterAlignmentEngine } from '../domain/characterAlignment';
import { CampaignArchiveService, PartitionedArchive } from '../domain/campaignArchive';

/**
 * WorldRepository
 * Single Canonical Authority Interface for Dreamville.
 * Owns player lifecycle, world clock, geography, and memory state.
 */
export interface WorldRepository {
  getPlayerLifecycle(storyId: string): PlayerLifecycleState | null;
  updatePlayerLifecycle(storyId: string, state: PlayerLifecycleState): void;
  getNpcLifecycle(storyId: string, npcId: string): PlayerLifecycleState | null;
  updateNpcLifecycle(storyId: string, state: PlayerLifecycleState): void;
  getAllNpcLifecycles(storyId: string): PlayerLifecycleState[];
  getCurrentLocation(storyId: string): string | null;
  getActiveJourney(storyId: string): TravelJourney | null;
  getWorldClock(storyId: string): WorldClock;
  getGeographyGraph(storyId?: string): GeographyGraph;
  seedStory(storyId: string): void;
  getKnowledgeFacts(storyId: string): KnowledgeFact[];
  addKnowledgeFact(storyId: string, fact: KnowledgeFact): void;
  getHistoricalChronicleEngine(storyId: string): HistoricalChronicleEngine;
  getInventoryEngine(storyId: string): InventoryItemEngine;
  getCapabilityEngine(storyId: string): CapabilityEngine;
  getEffectiveActorCapabilities(
    storyId: string,
    actorId: string
  ): import('../domain/capabilityEngine').EffectiveCapability[];
  getCombatEngine(storyId: string): TacticalCombatEngine;
  getCombatPerceptionOptions(storyId: string, viewerActorId: string): CombatPerceptionOptions;
  isEntityEpistemicallyKnown(storyId: string, viewerActorId: string, targetId: string): boolean;
  getMemoryEngine(storyId: string): MemoryOpportunityEngine;
  getLivingWorldSimulation(storyId: string): LivingWorldSimulation;
  getAiOrchestrator(): MultiModelOrchestrator;
  getCharacterAlignmentEngine(): CharacterAlignmentEngine;
  getSensoryEngine(): SensoryEngine;
  getReusableSkillRegistry(): ReusableSkillRegistry;
  exportCampaignArchive(storyId?: string, title?: string): PartitionedArchive;
  restoreCampaignArchive(
    archive: PartitionedArchive,
    targetStoryId?: string
  ): { success: boolean; errorReason?: string; campaignId?: string };
}

export class InMemoryWorldRepository implements WorldRepository {
  private playerLifecycles: Map<string, PlayerLifecycleState> = new Map();
  private npcLifecycles: Map<string, Map<string, PlayerLifecycleState>> = new Map();
  private worldClocks: Map<string, WorldClock> = new Map();
  private knowledgeBases: Map<string, KnowledgeFact[]> = new Map();
  private chronicleEngines: Map<string, HistoricalChronicleEngine> = new Map();
  private inventoryEngines: Map<string, InventoryItemEngine> = new Map();
  private capabilityEngines: Map<string, CapabilityEngine> = new Map();
  private combatEngines: Map<string, TacticalCombatEngine> = new Map();
  private memoryEngines: Map<string, MemoryOpportunityEngine> = new Map();
  private livingSimulations: Map<string, LivingWorldSimulation> = new Map();
  private aiOrchestrator: MultiModelOrchestrator = new MultiModelOrchestrator();
  private characterAlignmentEngine: CharacterAlignmentEngine = new CharacterAlignmentEngine();
  private sensoryEngine: SensoryEngine = new SensoryEngine();
  private reusableSkillRegistry: ReusableSkillRegistry = new ReusableSkillRegistry();
  private geographies: Map<string, GeographyGraph> = new Map();

  constructor() {
    this.geographies.set('default_story', new GeographyGraph());
    this.aiOrchestrator.setWorldRepository(this);
    this.seedDefaultStory('default_story');
  }

  public seedStory(storyId: string): void {
    this.seedDefaultStory(storyId);
  }

  private seedDefaultStory(storyId: string): void {
    if (!this.geographies.has(storyId)) {
      this.geographies.set(storyId, new GeographyGraph());
    }
    if (!this.worldClocks.has(storyId)) {
      this.worldClocks.set(storyId, new WorldClock());
    }
    const clock = this.worldClocks.get(storyId)!;

    if (!this.chronicleEngines.has(storyId)) {
      const chronicleEngine = new HistoricalChronicleEngine();
      this.chronicleEngines.set(storyId, chronicleEngine);

      // Seed canonical initial historical evidence into HistoricalChronicleEngine
      chronicleEngine.recordEvidence({
        id: 'ev_init_orrery_halt',
        category: 'WORLD_ANOMALY',
        timestamp: clock.getTimestamp(),
        primarySubjectId: 'loc_whispering_orrery',
        secondarySubjectId: 'char_maren',
        locationId: 'loc_whispering_orrery',
        summary: 'The Whispering Orrery astral rings ground to a halt.',
        details: 'Concentric bronze armatures ceased motion three bells past dusk due to subterranean resonant vibration.',
        sourceEventId: 'evt_astral_rings_halt',
        provenance: 'direct_astronomical_observation',
        visibility: 'PUBLIC',
        metadata: { subjectName: 'The Whispering Orrery' },
      });

      chronicleEngine.recordEvidence({
        id: 'ev_init_maren_inspection',
        category: 'LIFECYCLE_TRANSITION',
        timestamp: clock.getTimestamp(),
        primarySubjectId: 'char_maren',
        locationId: 'loc_whispering_orrery',
        summary: 'Maren the Archivist recorded micro-fractures in the third prism ring.',
        details: 'Technician logged anomalous bedrock harmonic frequency pulse.',
        sourceEventId: 'evt_maren_prism_log',
        provenance: 'archival_log',
        visibility: 'PUBLIC',
        metadata: { subjectName: 'Maren the Archivist' },
      });
    }

    // Embodied player actor
    if (!this.playerLifecycles.has(storyId)) {
      const initialPlayer = new PlayerLifecycleState({
        actorId: `player_actor_${storyId}`,
        name: 'Scribe Vael',
        locationId: 'loc_whispering_orrery',
        lastUpdatedTime: clock.getTimestamp().totalElapsedSeconds,
        currentActivity: 'idle',
        activeJourney: null,
        injuries: [],
      });
      this.playerLifecycles.set(storyId, initialPlayer);
    }

    if (!this.knowledgeBases.has(storyId)) {
      const initialFacts: KnowledgeFact[] = [
        {
          id: 'fact_orrery_halt',
          subjectEntityId: 'loc_whispering_orrery',
          predicate: 'motion_status',
          objectValue: 'halted_three_bells_past_dusk',
          sourceType: 'witnessed',
          acquiredAtTimestamp: clock.getTimestamp(),
          confidence: 1.0,
          secretLevel: 'public',
          scope: 'exact',
          provenanceSummary: 'Direct astronomical observation at Whispering Orrery',
        },
        {
          id: 'fact_prism_fracture',
          subjectEntityId: 'loc_whispering_orrery',
          predicate: 'damage_cause',
          objectValue: 'acoustic_pulse_from_bedrock',
          sourceType: 'told',
          acquiredAtTimestamp: clock.getTimestamp(),
          confidence: 0.95,
          secretLevel: 'public',
          scope: 'exact',
          provenanceSummary: 'Report from Maren the Archivist',
        },
      ];
      this.knowledgeBases.set(storyId, initialFacts);
    }

    // Seed canonical initial living world simulation (CH10)
    if (!this.livingSimulations.has(storyId)) {
      const livingSim = new LivingWorldSimulation();
      livingSim.registerEntityPhysiology({
        entityId: `player_actor_${storyId}`,
        hunger: 15,
        thirst: 15,
        fatigue: 5,
        pain: 0,
        stress: 10,
        morale: 80,
        hungerRatePerHour: 4,
        thirstRatePerHour: 6,
        fatigueRatePerHour: 3,
        lastFedTimestamp: clock.getTimestamp(),
        lastRestedTimestamp: clock.getTimestamp(),
        personalityModulation: 'stoic',
      });

      livingSim.registerEntityPhysiology({
        entityId: 'char_maren',
        hunger: 10,
        thirst: 10,
        fatigue: 5,
        pain: 0,
        stress: 5,
        morale: 90,
        hungerRatePerHour: 3,
        thirstRatePerHour: 5,
        fatigueRatePerHour: 2,
        lastFedTimestamp: clock.getTimestamp(),
        lastRestedTimestamp: clock.getTimestamp(),
        personalityModulation: 'expressive',
      });

      livingSim.registerNpcSchedule({
        npcId: 'char_maren',
        name: 'Maren the Archivist',
        currentLocationId: 'loc_whispering_orrery',
        currentActivity: 'working',
        entries: [
          { id: 'sch_maren_breakfast', startHour: 6, endHour: 8, activity: 'eating', targetLocationId: 'loc_whispering_orrery' },
          { id: 'sch_maren_work', startHour: 8, endHour: 18, activity: 'working', targetLocationId: 'loc_whispering_orrery' },
          { id: 'sch_maren_dinner', startHour: 18, endHour: 20, activity: 'eating', targetLocationId: 'loc_whispering_orrery' },
          { id: 'sch_maren_relax', startHour: 20, endHour: 22, activity: 'relaxing', targetLocationId: 'loc_whispering_orrery' },
          { id: 'sch_maren_sleep', startHour: 22, endHour: 6, activity: 'sleeping', targetLocationId: 'loc_whispering_orrery' },
        ],
        fallbackActivity: 'idle',
        fallbackLocationId: 'loc_whispering_orrery',
      });

      livingSim.registerNpcSchedule({
        npcId: 'npc_lantern_guard',
        name: 'Vault Watchman Orlo',
        currentLocationId: 'loc_lantern_vault',
        currentActivity: 'patrolling',
        entries: [
          { id: 'sch_guard_patrol', startHour: 6, endHour: 18, activity: 'patrolling', targetLocationId: 'loc_lantern_vault' },
          { id: 'sch_guard_evening', startHour: 18, endHour: 22, activity: 'relaxing', targetLocationId: 'loc_whispering_orrery' },
          { id: 'sch_guard_sleep', startHour: 22, endHour: 6, activity: 'sleeping', targetLocationId: 'loc_lantern_vault' },
        ],
        fallbackActivity: 'patrolling',
        fallbackLocationId: 'loc_lantern_vault',
      });

      this.livingSimulations.set(storyId, livingSim);
    }
  }

  public getPlayerLifecycle(storyId: string): PlayerLifecycleState | null {
    let state = this.playerLifecycles.get(storyId);
    if (!state) {
      this.seedDefaultStory(storyId);
      state = this.playerLifecycles.get(storyId);
    }
    return state ?? null;
  }

  public updatePlayerLifecycle(storyId: string, state: PlayerLifecycleState): void {
    this.playerLifecycles.set(storyId, state);
  }

  public getNpcLifecycle(storyId: string, npcId: string): PlayerLifecycleState | null {
    const npcs = this.npcLifecycles.get(storyId);
    if (!npcs) return null;
    const state = npcs.get(npcId);
    return state ? state : null;
  }

  public updateNpcLifecycle(storyId: string, state: PlayerLifecycleState): void {
    let npcs = this.npcLifecycles.get(storyId);
    if (!npcs) {
      npcs = new Map<string, PlayerLifecycleState>();
      this.npcLifecycles.set(storyId, npcs);
    }
    npcs.set(state.actorId, state);
  }

  public getAllNpcLifecycles(storyId: string): PlayerLifecycleState[] {
    const npcs = this.npcLifecycles.get(storyId);
    if (!npcs) return [];
    return Array.from(npcs.values());
  }

  /**
   * Compatibility method: Reads canonical locationId directly from PlayerLifecycleState.
   * There is NO separate player location map.
   */
  public getCurrentLocation(storyId: string): string | null {
    const player = this.getPlayerLifecycle(storyId);
    return player ? player.locationId : null;
  }

  /**
   * Compatibility method: Reads activeJourney directly from PlayerLifecycleState.
   */
  public getActiveJourney(storyId: string): TravelJourney | null {
    const player = this.getPlayerLifecycle(storyId);
    return player ? player.activeJourney : null;
  }

  public getWorldClock(storyId: string): WorldClock {
    let clock = this.worldClocks.get(storyId);
    if (!clock) {
      clock = new WorldClock();
      this.worldClocks.set(storyId, clock);
    }
    return clock;
  }

  public getGeographyGraph(storyId = 'default_story'): GeographyGraph {
    let geo = this.geographies.get(storyId);
    if (!geo) {
      geo = new GeographyGraph();
      this.geographies.set(storyId, geo);
    }
    return geo;
  }

  public getKnowledgeFacts(storyId: string): KnowledgeFact[] {
    const facts = this.knowledgeBases.get(storyId);
    return facts ? [...facts] : [];
  }

  public addKnowledgeFact(storyId: string, fact: KnowledgeFact): void {
    const existing = this.getKnowledgeFacts(storyId);
    if (!existing.some((f) => f.id === fact.id)) {
      this.knowledgeBases.set(storyId, [fact, ...existing]);
    }
  }

  public getHistoricalChronicleEngine(storyId: string): HistoricalChronicleEngine {
    let engine = this.chronicleEngines.get(storyId);
    if (!engine) {
      engine = new HistoricalChronicleEngine();
      this.chronicleEngines.set(storyId, engine);
    }
    return engine;
  }

  public getInventoryEngine(storyId: string): InventoryItemEngine {
    let engine = this.inventoryEngines.get(storyId);
    if (!engine) {
      engine = new InventoryItemEngine();
      const player = this.getPlayerLifecycle(storyId);
      const actorId = player ? player.actorId : `player_actor_${storyId}`;
      engine.seedStarterInventoryForActor(actorId);
      this.inventoryEngines.set(storyId, engine);
    }
    return engine;
  }

  public getCapabilityEngine(storyId: string): CapabilityEngine {
    let engine = this.capabilityEngines.get(storyId);
    if (!engine) {
      engine = new CapabilityEngine();
      const player = this.getPlayerLifecycle(storyId);
      const actorId = player ? player.actorId : `player_actor_${storyId}`;
      engine.seedStarterPowerStateForActor(actorId);
      this.capabilityEngines.set(storyId, engine);
    }
    return engine;
  }

  public getProgressionPolicy(storyId: string): import('../domain/capabilityEngine').WorldProgressionPolicy {
    const capEngine = this.getCapabilityEngine(storyId);
    return capEngine.getProgressionPolicy();
  }

  public setProgressionPolicy(
    storyId: string,
    policy: Partial<import('../domain/capabilityEngine').WorldProgressionPolicy>
  ): void {
    const capEngine = this.getCapabilityEngine(storyId);
    capEngine.setProgressionPolicy(policy);
  }

  public getEffectiveActorCapabilities(
    storyId: string,
    actorId: string
  ): import('../domain/capabilityEngine').EffectiveCapability[] {
    const capEngine = this.getCapabilityEngine(storyId);
    const invEngine = this.getInventoryEngine(storyId);
    return capEngine.getEffectiveActorCapabilities(actorId, invEngine);
  }

  public getCombatEngine(storyId: string): TacticalCombatEngine {
    let engine = this.combatEngines.get(storyId);
    if (!engine) {
      engine = new TacticalCombatEngine();
      this.combatEngines.set(storyId, engine);
    }
    return engine;
  }

  public isEntityEpistemicallyKnown(
    storyId: string,
    viewerActorId: string,
    targetId: string
  ): boolean {
    // 1. Viewing actor always knows themselves
    if (viewerActorId === targetId) return true;

    const player = this.getPlayerLifecycle(storyId);
    const combat = this.getCombatEngine(storyId);
    const viewerPart = combat.getParticipant(viewerActorId);
    const targetPart = combat.getParticipant(targetId);

    // 2. Allies on the same team share tactical awareness
    if (viewerPart && targetPart && viewerPart.team === targetPart.team) {
      return true;
    }

    // 3. Durable Knowledge Facts (KnowledgeBase)
    const facts = this.getKnowledgeFacts(storyId);
    const hasFact = facts.some(
      (f) =>
        (f.subjectEntityId === targetId || f.objectValue === targetId) &&
        (f.secretLevel === 'public' || f.secretLevel === 'faction' || f.subjectEntityId === viewerActorId)
    );
    if (hasFact) return true;

    // 4. Chronicle Historical Evidence (Observed records)
    const chronicle = this.getHistoricalChronicleEngine(storyId);
    const evidence = chronicle.getEpistemicEvidence(viewerActorId);
    const hasEvidence = evidence.some(
      (e) => e.primarySubjectId === targetId || e.secondarySubjectId === targetId
    );
    if (hasEvidence) return true;

    // 5. Living World Co-located NPCs / Discovered Locations
    const livingSim = this.getLivingWorldSimulation(storyId);
    const npc = livingSim.getNpcSchedule(targetId);
    if (npc) {
      const playerLoc = player?.locationId;
      const discovered = player?.discoveredLocationIds || [];
      if (npc.currentLocationId === playerLoc || discovered.includes(npc.currentLocationId)) {
        return true;
      }
    }

    // 6. Active encounter participants in combat (visible if not concealed/stealthed)
    if (viewerPart && targetPart) {
      const hiddenConditions = ['Hidden', 'Stealthed', 'Invisible', 'Concealed', 'Unperceived'];
      const isConcealed = targetPart.conditions && targetPart.conditions.some((c) => hiddenConditions.includes(c));
      if (!isConcealed) {
        return true;
      }
    }

    return false;
  }

  public getCombatPerceptionOptions(
    storyId: string,
    viewerActorId: string
  ): CombatPerceptionOptions {
    return {
      epistemicKnowledgeChecker: (viewerId: string, targetId: string) =>
        this.isEntityEpistemicallyKnown(storyId, viewerId, targetId),
    };
  }

  public getMemoryEngine(storyId: string): MemoryOpportunityEngine {
    let engine = this.memoryEngines.get(storyId);
    if (!engine) {
      engine = new MemoryOpportunityEngine();
      const player = this.getPlayerLifecycle(storyId);
      const actorId = player ? player.actorId : `player_actor_${storyId}`;
      const clock = this.getWorldClock(storyId);
      const timestamp = clock.getTimestamp();

      // Seed starter canonical memories (CH9)
      engine.storeMemory({
        id: `mem_origin_${storyId}`,
        storyId,
        memoryClass: 'PERSISTENT_IDENTITY',
        subjectEntityId: actorId,
        relatedEntityIds: [],
        content: 'Vael is the sealed avatar of the End of All Things, bound to mortal form.',
        importance: 95,
        confidence: 1.0,
        status: 'active',
        visibility: 'PRIVATE',
        isPersistentCritical: true,
        isLocked: true,
        lockedReason: 'Core Avatar Origin Fact',
        lockedBy: 'canon_authority',
        lockedAtTimestamp: timestamp,
        provenance: 'prologue_genesis',
        validFromTurn: 1,
        lastRecalledTurn: 1,
        createdAtTimestamp: timestamp,
        lastRecalledTimestamp: timestamp,
        triggerConditionTags: ['origin', 'avatar', 'seal', 'primordial'],
      });

      engine.storeMemory({
        id: `mem_venom_${storyId}`,
        storyId,
        memoryClass: 'CAPABILITY',
        subjectEntityId: actorId,
        relatedEntityIds: [],
        content: 'Vael has venomous hollow fangs that secrete contact neurotoxin upon biting.',
        importance: 85,
        confidence: 1.0,
        status: 'active',
        visibility: 'PRIVATE',
        isPersistentCritical: true,
        isLocked: false,
        provenance: 'character_creation',
        validFromTurn: 1,
        lastRecalledTurn: 1,
        createdAtTimestamp: timestamp,
        lastRecalledTimestamp: timestamp,
        triggerConditionTags: ['bite', 'food_transfer', 'apple', 'saliva', 'teeth', 'food'],
        structuredTriggers: [
          {
            keywords: ['bite', 'apple', 'food', 'bread', 'fruit'],
            latentCapabilityId: 'cap_venomous_bite',
            detectedOpportunityTemplate: "Latent capability 'Venomous Hollow Fangs' contacted consumed food item during transfer.",
            suggestedStateMutation: {
              kind: 'poison_exposure',
              targetRole: 'target',
              effect: 'saliva_contact_neurotoxin',
            },
          },
        ],
      });

      this.memoryEngines.set(storyId, engine);
    }
    return engine;
  }

  public getLivingWorldSimulation(storyId: string): LivingWorldSimulation {
    let sim = this.livingSimulations.get(storyId);
    if (!sim) {
      sim = new LivingWorldSimulation();
      this.livingSimulations.set(storyId, sim);
    }
    return sim;
  }

  public getAiOrchestrator(): MultiModelOrchestrator {
    return this.aiOrchestrator;
  }

  public getSensoryEngine(): SensoryEngine {
    return this.sensoryEngine;
  }

  public getCharacterAlignmentEngine(): CharacterAlignmentEngine {
    return this.characterAlignmentEngine;
  }

  public getReusableSkillRegistry(): ReusableSkillRegistry {
    return this.reusableSkillRegistry;
  }

  /**
   * Challenge 13: Export Lossless Campaign Archive (.dreamarchive)
   */
  public exportCampaignArchive(storyId = 'default_story', title = 'Dreamville Campaign'): PartitionedArchive {
    const player = this.getPlayerLifecycle(storyId);
    if (!player || !player.actorId) {
      throw new Error(`Cannot export campaign archive for story '${storyId}': No active player lifecycle found.`);
    }

    const clock = this.getWorldClock(storyId);
    const geography = this.getGeographyGraph(storyId);
    const knowledgeFacts = this.getKnowledgeFacts(storyId);
    const chronicleEngine = this.getHistoricalChronicleEngine(storyId);
    const inventoryEngine = this.getInventoryEngine(storyId);
    const capabilityEngine = this.getCapabilityEngine(storyId);
    const combatEngine = this.getCombatEngine(storyId);
    const memoryEngine = this.getMemoryEngine(storyId);
    const livingSim = this.getLivingWorldSimulation(storyId);
    const alignmentEngine = this.getCharacterAlignmentEngine();
    const orchestrator = this.getAiOrchestrator();

    const worldState = {
      clock: clock.exportState(),
      geography: geography.exportState(),
      knowledgeFacts,
    };

    const playerState = player.toJSON();
    const inventoryState = inventoryEngine.exportState();
    const npcs = this.npcLifecycles.get(storyId);
    let npcLifecyclesState: any[] = [];
    if (npcs) {
      npcLifecyclesState = Array.from(npcs.values()).map(npc => npc.toJSON());
    }
    const npcsState = {
      ...alignmentEngine.exportState(),
      lifecycles: npcLifecyclesState
    };
    const chronicleState = chronicleEngine.exportState();
    const narrativeState = orchestrator.exportNarrativeHistory(storyId);
    const capabilitiesState = capabilityEngine.exportState();
    const combatState = combatEngine.exportState();
    const memoriesState = memoryEngine.exportState();
    const livingWorldState = livingSim.exportState();

    return CampaignArchiveService.createArchive({
      campaignId: `campaign_${storyId}`,
      title,
      worldState,
      playerState,
      inventoryState,
      npcsState,
      chronicleState,
      narrativeState,
      capabilitiesState,
      combatState,
      memoriesState,
      livingWorldState,
    });
  }

  /**
   * Challenge 13: Staged Atomic Restore Pipeline (DEF-CH13-01)
   * Validates archive, stages subsystem instances in isolation, validates cross-references,
   * and atomically swaps them into live repository maps ONLY on 100% validation success.
   */
  public restoreCampaignArchive(
    archive: PartitionedArchive,
    targetStoryId = 'default_story'
  ): { success: boolean; errorReason?: string; campaignId?: string } {
    // 1. Validate & extract payload via CampaignArchiveService
    const validationResult = CampaignArchiveService.validateAndRestoreArchive(archive);
    if (!validationResult.valid || !validationResult.restoredCampaign) {
      return {
        success: false,
        errorReason: validationResult.errorReason || 'Archive validation failed.',
      };
    }

    const restored = validationResult.restoredCampaign;

    // 2. Stage isolated engine instances (ZERO side-effects on live state during staging)
    try {
      const stagedClock = new WorldClock();
      if (restored.world && restored.world.clock) {
        stagedClock.importState(restored.world.clock);
      }

      const stagedGeography = new GeographyGraph();
      if (restored.world && restored.world.geography) {
        stagedGeography.importState(restored.world.geography);
      }

      const stagedKnowledgeFacts: KnowledgeFact[] = Array.isArray(restored.world?.knowledgeFacts)
        ? [...restored.world.knowledgeFacts]
        : [];

      let stagedPlayer: PlayerLifecycleState;
      if (restored.player && restored.player.actorId) {
        stagedPlayer = PlayerLifecycleState.fromJSON(restored.player);
      } else {
        stagedPlayer = new PlayerLifecycleState({
          actorId: `player_actor_${targetStoryId}`,
          name: 'Scribe Vael',
          locationId: 'loc_whispering_orrery',
          lastUpdatedTime: stagedClock.getTimestamp().totalElapsedSeconds,
          currentActivity: 'idle',
          activeJourney: null,
          injuries: [],
        });
      }

      const stagedNarrative = Array.isArray(restored.narrative) ? [...restored.narrative] : [];

      const stagedChronicle = new HistoricalChronicleEngine();
      if (restored.chronicle) {
        stagedChronicle.importState(restored.chronicle);
      }

      const stagedInventory = new InventoryItemEngine();
      if (restored.inventory) {
        stagedInventory.importState(restored.inventory);
      }

      const stagedCapability = new CapabilityEngine();
      if (restored.capabilities) {
        stagedCapability.importState(restored.capabilities);
      }

      const stagedCombat = new TacticalCombatEngine();
      if (restored.combat) {
        stagedCombat.importState(restored.combat);
      }

      const stagedMemory = new MemoryOpportunityEngine();
      if (restored.memories) {
        stagedMemory.importState(restored.memories);
      }

      const stagedSensory = new SensoryEngine();
      if (restored.sensoryConfig) {
        if ((restored.sensoryConfig as any).settings) {
          stagedSensory.updateSettings(targetStoryId, (restored.sensoryConfig as any).settings);
        }
        if ((restored.sensoryConfig as any).voiceProfiles) {
          stagedSensory.restoreVoiceProfiles(targetStoryId, (restored.sensoryConfig as any).voiceProfiles);
        }
      }
      const stagedLivingWorld = new LivingWorldSimulation();
      if (restored.livingWorld) {
        stagedLivingWorld.importState(restored.livingWorld);
      }

      const stagedAlignment = new CharacterAlignmentEngine();
      let stagedNpcLifecycles = new Map<string, PlayerLifecycleState>();
      if (restored.npcs) {
        stagedAlignment.importState(restored.npcs);
        if (Array.isArray(restored.npcs.lifecycles)) {
          for (const raw of restored.npcs.lifecycles) {
            const life = PlayerLifecycleState.fromJSON(raw);
            stagedNpcLifecycles.set(life.actorId, life);
          }
        }
      }

      // 3. Staged Semantic & Integrity Verification
      if (stagedPlayer.locationId && stagedGeography.getAllNodes().length > 0) {
        const node = stagedGeography.getNode(stagedPlayer.locationId);
        if (!node) {
          return {
            success: false,
            errorReason: `Atomic restore rejected: Player location '${stagedPlayer.locationId}' does not exist in restored Geography Graph.`,
          };
        }
      }

      // 4. Atomic Commit (Atomic reference swap)
      this.worldClocks.set(targetStoryId, stagedClock);
      this.geographies.set(targetStoryId, stagedGeography);
      this.knowledgeBases.set(targetStoryId, stagedKnowledgeFacts);
      this.playerLifecycles.set(targetStoryId, stagedPlayer);
      this.chronicleEngines.set(targetStoryId, stagedChronicle);
      this.aiOrchestrator.restoreNarrativeHistory(targetStoryId, stagedNarrative);
      this.inventoryEngines.set(targetStoryId, stagedInventory);
      this.sensoryEngine = stagedSensory;
      this.capabilityEngines.set(targetStoryId, stagedCapability);
      this.combatEngines.set(targetStoryId, stagedCombat);
      this.memoryEngines.set(targetStoryId, stagedMemory);
      this.livingSimulations.set(targetStoryId, stagedLivingWorld);
      this.characterAlignmentEngine = stagedAlignment;
      this.npcLifecycles.set(targetStoryId, stagedNpcLifecycles);

      return {
        success: true,
        campaignId: restored.campaignId,
      };
    } catch (err: any) {
      return {
        success: false,
        errorReason: `Atomic restore failed during staging: ${err?.message || 'Unknown staging error'}`,
      };
    }
  }
}

export const worldRepository = new InMemoryWorldRepository();
