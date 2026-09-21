import {
  KnowledgeFact,
  TravelJourney,
  WorldTimestamp,
} from '../domain/types';
import { PlayerLifecycleState } from '../domain/playerLifecycleState';
import { WorldClock } from '../domain/worldClock';
import { GeographyGraph } from '../domain/geographyGraph';
import { HistoricalChronicleEngine } from '../domain/historicalChronicleEngine';
import { InventoryItemEngine, EquipmentSlot, ItemCategory } from '../domain/inventoryItem';
import { CapabilityEngine, CapabilityDefinition } from '../domain/capabilityEngine';
import { ReusableSkillRegistry } from '../domain/reusableSkillRegistry';
import { TacticalCombatEngine, CombatPerceptionOptions } from '../domain/combatEngine';
import { MemoryOpportunityEngine } from '../domain/memoryOpportunityEngine';
import { SensoryEngine } from '../domain/sensoryEngine';
import { LivingWorldSimulation } from '../domain/livingWorldSimulation';
import { MultiModelOrchestrator } from '../domain/aiOrchestrator';
import { CharacterAlignmentEngine } from '../domain/characterAlignment';
import { ConditionEngine } from '../domain/conditionEngine';
import { StoryCheckEngine } from '../domain/storyCheckEngine';
import { CampaignArchiveService, PartitionedArchive } from '../domain/campaignArchive';
import { dndSpellRulesEvaluator } from '../domain/dndSpellRulesModel';
import type { RulesProfile } from '../../src/types';
import { rulesProfileEngine } from '../domain/rulesProfileEngine';
import { PersistentGameStore } from '../services/persistentGameStore';
import {
  AdaptedStoryBible,
  AdaptationProfile,
  PipelineState,
  AdaptationSession,
  TypedAdaptationEvent,
} from '../domain/storyAdaptation';

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
  getConditionEngine(storyId: string): ConditionEngine;
  getStoryCheckEngine(storyId: string): StoryCheckEngine;
  getCombatPerceptionOptions(storyId: string, viewerActorId: string): CombatPerceptionOptions;
  isEntityEpistemicallyKnown(storyId: string, viewerActorId: string, targetId: string): boolean;
  getMemoryEngine(storyId: string): MemoryOpportunityEngine;
  getLivingWorldSimulation(storyId: string): LivingWorldSimulation;
  getAiOrchestrator(): MultiModelOrchestrator;
  getCharacterAlignmentEngine(): CharacterAlignmentEngine;
  getSensoryEngine(): SensoryEngine;
  getReusableSkillRegistry(): ReusableSkillRegistry;
  getAdaptedStoryBible(storyId: string): AdaptedStoryBible | null;
  saveAdaptedStoryBible(storyId: string, bible: AdaptedStoryBible): void;
  getAdaptationProfile(storyId: string): AdaptationProfile | null;
  saveAdaptationProfile(storyId: string, profile: AdaptationProfile): void;
  getPipelineState(storyId: string): PipelineState | null;
  savePipelineState(storyId: string, state: PipelineState): void;
  getAdaptationSession(storyId: string): AdaptationSession | null;
  saveAdaptationSession(storyId: string, session: AdaptationSession): void;
  getAdaptationEvents(storyId: string): TypedAdaptationEvent[];
  addAdaptationEvent(storyId: string, event: TypedAdaptationEvent): void;
  duplicateAdaptationBranch(
    parentStoryId: string,
    newBranchId: string,
    options?: { branchTitle?: string }
  ): { success: boolean; newStoryId: string; errorReason?: string };
  getAllAdaptationStories(): {
    storyId: string;
    title: string;
    mode: string;
    branchId: string;
    parentStoryId?: string;
    isAdapted: boolean;
  }[];
  exportCampaignArchive(storyId?: string, title?: string): PartitionedArchive;
  restoreCampaignArchive(
    archive: PartitionedArchive,
    targetStoryId?: string
  ): { success: boolean; errorReason?: string; campaignId?: string };
  // Character Creation / Genesis
  getCharacterDrafts(worldId: string): any[];
  saveCharacterDraft(worldId: string, draft: any): void;
  getConfirmedCharacters(worldId: string): any[];
  saveConfirmedCharacter(worldId: string, char: any): void;
  getConfirmedCharacter(worldId: string, characterId: string): any | null;
  createStoryRunFromConfirmedCharacter(params: {
    worldId: string;
    confirmedCharacter: any;
    storyId?: string;
    storyMode?: string;
    dndRulesMode?: string;
  }): { storyId: string; run: any };
  deleteStoryRun(storyId: string): void;
  getStoryRun(storyId: string): any;
  getRulesProfile(storyId: string): RulesProfile | null;
  getAllStoryRuns(): any[];
  saveStoryRun(run: any): void;
  registerStoryRun(run: any): void;
  getWorldTemplate(worldId: string): any;
  saveWorldTemplate(template: any): void;
  getAllWorldTemplates(): any[];
}

function normalizeEquipmentSlot(slot?: string, category?: string): EquipmentSlot {
  if (!slot && category) {
    const catLower = category.toLowerCase();
    if (catLower.includes('weapon') || catLower.includes('sword') || catLower.includes('bow') || catLower.includes('staff')) return 'mainHand';
    if (catLower.includes('shield')) return 'offHand';
    if (catLower.includes('armor') || catLower.includes('chest') || catLower.includes('cuirass')) return 'body';
    if (catLower.includes('helm') || catLower.includes('head')) return 'head';
    if (catLower.includes('boot') || catLower.includes('foot') || catLower.includes('feet')) return 'feet';
    if (catLower.includes('glove') || catLower.includes('hand')) return 'hands';
    if (catLower.includes('cloak') || catLower.includes('robe') || catLower.includes('cape')) return 'cloak';
    if (catLower.includes('ring')) return 'ring1';
    if (catLower.includes('amulet') || catLower.includes('necklace') || catLower.includes('neck')) return 'neck';
    if (catLower.includes('relic')) return 'relic';
  }
  const s = (slot || '').toLowerCase().replace(/[\s_-]/g, '');
  if (s === 'head' || s === 'helmet' || s === 'helm') return 'head';
  if (s === 'cloak' || s === 'cape' || s === 'robe') return 'cloak';
  if (s === 'body' || s === 'chest' || s === 'armor' || s === 'torso' || s === 'cuirass') return 'body';
  if (s === 'hands' || s === 'gloves' || s === 'gauntlets') return 'hands';
  if (s === 'waist' || s === 'belt') return 'waist';
  if (s === 'legs' || s === 'pants' || s === 'greaves') return 'legs';
  if (s === 'feet' || s === 'boots' || s === 'shoes') return 'feet';
  if (s === 'mainhand' || s === 'weapon' || s === 'right' || s === 'primary') return 'mainHand';
  if (s === 'offhand' || s === 'shield' || s === 'left' || s === 'secondary') return 'offHand';
  if (s === 'relic' || s === 'artifact') return 'relic';
  if (s === 'ring1' || s === 'ring') return 'ring1';
  if (s === 'ring2') return 'ring2';
  if (s === 'neck' || s === 'amulet' || s === 'necklace') return 'neck';
  return 'mainHand';
}

function normalizeItemCategory(cat?: string): ItemCategory {
  const c = (cat || '').toLowerCase();
  if (c.includes('weapon') || c.includes('sword') || c.includes('bow') || c.includes('dagger') || c.includes('staff') || c.includes('axe') || c.includes('mace')) return 'Weapon';
  if (c.includes('shield')) return 'Shield';
  if (c.includes('armor') || c.includes('cuirass') || c.includes('robe') || c.includes('helm') || c.includes('boot')) return 'Armor';
  if (c.includes('potion') || c.includes('salve') || c.includes('elixir')) return 'Potion';
  if (c.includes('scroll') || c.includes('tome') || c.includes('book')) return 'Scroll';
  if (c.includes('tool') || c.includes('kit') || c.includes('lockpick')) return 'Tool';
  if (c.includes('food') || c.includes('ration')) return 'Food';
  if (c.includes('ring') || c.includes('amulet') || c.includes('neck') || c.includes('accessory')) return 'Accessory';
  if (c.includes('document') || c.includes('map') || c.includes('letter')) return 'Document';
  if (c.includes('material') || c.includes('ore') || c.includes('ingot') || c.includes('herb')) return 'Material';
  return 'Miscellaneous';
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
  private conditionEngines: Map<string, ConditionEngine> = new Map();
  private storyCheckEngines: Map<string, StoryCheckEngine> = new Map();
  private memoryEngines: Map<string, MemoryOpportunityEngine> = new Map();
  private livingSimulations: Map<string, LivingWorldSimulation> = new Map();
  private aiOrchestrator: MultiModelOrchestrator | null = null;
  private characterAlignmentEngine: CharacterAlignmentEngine = new CharacterAlignmentEngine();
  private sensoryEngine: SensoryEngine = new SensoryEngine();
  private reusableSkillRegistry: ReusableSkillRegistry = new ReusableSkillRegistry();
  private geographies: Map<string, GeographyGraph> = new Map();

  private adaptedStoryBibles: Map<string, AdaptedStoryBible> = new Map();
  private adaptationProfiles: Map<string, AdaptationProfile> = new Map();
  private pipelineStates: Map<string, PipelineState> = new Map();
  private adaptationSessions: Map<string, AdaptationSession> = new Map();
  private adaptationEvents: Map<string, TypedAdaptationEvent[]> = new Map();

  // CH16 Storage Maps
  private worldTemplates: Map<string, any> = new Map();
  private storyRuns: Map<string, any> = new Map();
  private storyThreads: Map<string, any[]> = new Map();
  private activeEffects: Map<string, any[]> = new Map();
  private worldFactsMap: Map<string, any[]> = new Map();
  private protagonistAgendas: Map<string, any> = new Map();

  // Slice 2 Storage Maps
  private characterDraftsMap: Map<string, any[]> = new Map();
  private confirmedCharactersMap: Map<string, any[]> = new Map();
  private readonly persistentStore = new PersistentGameStore();

  constructor() {
    const persisted = this.persistentStore.load();
    for (const [worldId, world] of Object.entries(persisted.worldTemplates)) {
      this.worldTemplates.set(worldId, world);
    }
    for (const [storyId, run] of Object.entries(persisted.storyRuns)) {
      this.storyRuns.set(storyId, run);
    }

    this.geographies.set('default_story', new GeographyGraph());
    this.seedDefaultTemplates();
    this.seedDefaultStory('default_story');
  }

  private seedDefaultTemplates(): void {
    if (this.worldTemplates.size === 0) {
      this.worldTemplates.set('world_solar_archive', {
        worldId: 'world_solar_archive',
        title: 'Elysium Solar Citadel',
        worldManifestVersion: 1,
        genreTags: ['Solarpunk', 'High Fantasy'],
        toneTags: ['Heroic', 'Luminescent'],
        defaultEra: 'First Radiance',
        setting: 'Elysium Solar Citadel',
        sourcePolicy: 'ORIGINAL_CANON',
        supportedPlaystyles: ['Tactical', 'Exploration'],
        rulesetId: 'FULL_DND',
        dndRulesMode: 'FULL_DND',
        summary: 'A luminous civilization harnessing solar resonance crystals across floating celestial citadels.',
        description: 'An expansive realm where solar energy powers arcane engines and celestial bridges.',
        capabilities: [
          {
            capabilityId: 'cap_solar_resonance',
            name: 'Solar Resonance',
            description: 'Manipulate concentrated sunlight for healing and divine radiant power.',
            source: 'ORIGINAL_CANON',
            verificationStatus: 'VERIFIED',
          },
        ],
        canonicalCapabilities: [
          {
            capabilityId: 'cap_solar_resonance',
            name: 'Solar Resonance',
            description: 'Manipulate concentrated sunlight for healing and divine radiant power.',
            source: 'ORIGINAL_CANON',
            verificationStatus: 'VERIFIED',
          },
        ],
      });

      this.worldTemplates.set('world_shadow_depths', {
        worldId: 'world_shadow_depths',
        title: 'Shadow Depths of the Sunken Spire',
        worldManifestVersion: 1,
        genreTags: ['Cosmic Horror', 'Steampunk'],
        toneTags: ['Grimdark', 'Ominous'],
        defaultEra: 'Age of Sinking',
        setting: 'Undersea Trenches',
        sourcePolicy: 'COMMUNITY_EXTENDED',
        supportedPlaystyles: ['Survival', 'Investigation'],
        rulesetId: 'HYBRID_DND',
        dndRulesMode: 'HYBRID_DND',
        summary: 'Submerged pressure-sealed colonies threatened by abyssal entities beneath frozen oceans.',
        description: 'Deep abyss settlements where bioluminescent tech battles pressure and maddening whispers.',
        capabilities: [
          {
            capabilityId: 'cap_abyssal_sonar',
            name: 'Abyssal Sonar',
            description: 'Echolocate through deep ocean trenches detecting hidden horrors.',
            source: 'COMMUNITY_EXTENDED',
            verificationStatus: 'VERIFIED',
          },
        ],
        canonicalCapabilities: [
          {
            capabilityId: 'cap_abyssal_sonar',
            name: 'Abyssal Sonar',
            description: 'Echolocate through deep ocean trenches detecting hidden horrors.',
            source: 'COMMUNITY_EXTENDED',
            verificationStatus: 'VERIFIED',
          },
        ],
      });
    }
  }

  public seedStory(storyId: string): void {
    if (storyId === 'default_story' || !storyId) {
      this.seedDefaultStory('default_story');
      return;
    }

    const run = this.getStoryRun(storyId);
    if (run) {
      const world = this.getWorldTemplate(run.worldId);
      if (world) {
        const persistedRun = JSON.parse(JSON.stringify(run));

        if (run.protagonist) {
          this.createStoryRunFromConfirmedCharacter({
            worldId: run.worldId,
            confirmedCharacter: run.protagonist,
            storyId,
            storyMode: run.storyMode,
            dndRulesMode: run.dndRulesMode,
          });
        } else {
          this.seedDynamicStoryRun(storyId, world, {
            characterName: run.characterName || 'Hero Vael',
            characterRole: run.characterRole,
            characterBackground: run.characterBackground,
            characterAppearance: run.characterAppearance,
            characterPersonality: run.characterPersonality,
            characterMotivations: run.characterMotivations,
            characterEquipment: run.characterEquipment,
            characterPortraitEmoji: run.characterPortraitEmoji,
            characterPortraitUrl: run.characterPortraitUrl,
            capabilities: run.capabilities,
            initialConditions: run.initialConditions,
            storyMode: run.storyMode,
            dndRulesMode: run.dndRulesMode,
          });
        }

        const rebuiltRun = this.getStoryRun(storyId);
        if (rebuiltRun) {
          this.storyRuns.set(storyId, {
            ...rebuiltRun,
            ...persistedRun,
            storyId,
            id: persistedRun.id || rebuiltRun.id || storyId,
          });
          this.persistLibrary();
        }
        return;
      }
    }
    this.seedDefaultStory(storyId);
  }

  public createStoryRunFromConfirmedCharacter(params: {
    worldId: string;
    confirmedCharacter: any;
    storyId?: string;
    storyMode?: string;
    dndRulesMode?: string;
  }): { storyId: string; run: any } {
    const { worldId, confirmedCharacter: char } = params;

    // 1. Validation of World
    const world = this.getWorldTemplate(worldId);
    if (!world) {
      throw new Error(`World template "${worldId}" not found.`);
    }

    // 2. Validation of Confirmed Character
    if (!char || !char.characterId || !char.identity?.name) {
      throw new Error('Invalid confirmed character: characterId and identity.name are required.');
    }

    if (char.worldId && char.worldId !== worldId) {
      throw new Error(`Confirmed character is bound to world "${char.worldId}", not target world "${worldId}".`);
    }

    // 3. Atomicity & Story ID Setup
    const storyId = params.storyId || `story_${worldId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      // 4. Pin World Version (strictly from confirmed character or manifest)
      const pinnedWorldVersion = char.worldVersion || world.worldManifestVersion || 1;

      // 5. Build Geography Graph & Validate Starting Location
      const geographyGraph = new GeographyGraph(false);
      const worldGeography = world.geography || {};
      const rawNodes = worldGeography.nodes || worldGeography.locations || worldGeography.zones || world.startingStarts || [];

      let startingLocationId = char.startingLocation?.locationId;
      const registeredNodes: any[] = [];

      if (Array.isArray(rawNodes) && rawNodes.length > 0) {
        // If startingLocationId is provided, check existence in world nodes
        if (startingLocationId) {
          const exists = rawNodes.some((n: any) => (n.id || n.locationId) === startingLocationId);
          if (!exists) {
            throw new Error(`Starting location "${startingLocationId}" does not exist in world "${worldId}" geography.`);
          }
        } else {
          startingLocationId = rawNodes[0].id || rawNodes[0].locationId || `loc_${storyId}_0`;
        }

        rawNodes.forEach((nodeItem: any, idx: number) => {
          const isObj = typeof nodeItem === 'object' && nodeItem !== null;
          const nodeId = isObj ? (nodeItem.id || nodeItem.locationId || `loc_${storyId}_${idx}`) : `loc_${storyId}_${idx}`;
          const name = isObj ? (nodeItem.name || nodeItem.title || `Area ${idx + 1}`) : String(nodeItem);
          const regionId = isObj ? (nodeItem.region || nodeItem.regionId || world.setting || world.title) : world.title;
          const description = isObj ? (nodeItem.description || `A location in ${world.title}.`) : `A region in ${world.title}.`;
          const angle = (idx / rawNodes.length) * 2 * Math.PI;
          const defaultX = Math.round(50 + 30 * Math.cos(angle));
          const defaultY = Math.round(50 + 25 * Math.sin(angle));

          const locNode = {
            id: nodeId,
            name,
            regionId,
            description,
            coordinates: isObj && nodeItem.coordinates ? nodeItem.coordinates : { x: defaultX, y: defaultY },
            accessible: isObj && nodeItem.accessible !== undefined ? Boolean(nodeItem.accessible) : true,
            discovered: nodeId === startingLocationId, // Epistemic isolation: only starting location discovered initially
            ambientSensory: isObj && typeof nodeItem.ambientSensory === 'string'
              ? nodeItem.ambientSensory
              : `Visual: Distinct environment of ${name}. Sounds: Ambient murmurs. Scent: Fresh air. Tactile: Stable terrain.`,
            provenance: (isObj && nodeItem.provenance) || 'authored',
          };
          registeredNodes.push(locNode);
          geographyGraph.addNode(locNode as any);
        });

        // Add connections
        const connections = worldGeography.connections || [];
        if (Array.isArray(connections) && connections.length > 0) {
          connections.forEach((conn: any, cIdx: number) => {
            if (conn.fromLocationId && conn.toLocationId) {
              geographyGraph.addEdge({
                id: conn.id || `edge_${storyId}_${cIdx}`,
                fromLocationId: conn.fromLocationId,
                toLocationId: conn.toLocationId,
                distanceKm: conn.distanceKm || 5.0,
                terrain: conn.terrain || 'Trail',
                allowedModes: conn.allowedModes || ['Foot', 'Horse'],
                hazardRisk: conn.hazardRisk !== undefined ? conn.hazardRisk : 0.05,
                isBlocked: Boolean(conn.isBlocked),
                provenance: conn.provenance || 'authored',
              });
            }
          });
        } else {
          // Synthetic edges between nodes in a loop
          for (let i = 0; i < registeredNodes.length; i++) {
            const fromNode = registeredNodes[i];
            const toNode = registeredNodes[(i + 1) % registeredNodes.length];
            if (fromNode.id !== toNode.id) {
              geographyGraph.addEdge({
                id: `edge_${fromNode.id}_${toNode.id}`,
                fromLocationId: fromNode.id,
                toLocationId: toNode.id,
                distanceKm: 4.5,
                terrain: 'Trail',
                allowedModes: ['Foot', 'Horse'],
                hazardRisk: 0.05,
                isBlocked: false,
                provenance: 'authored',
              });
              geographyGraph.addEdge({
                id: `edge_${toNode.id}_${fromNode.id}`,
                fromLocationId: toNode.id,
                toLocationId: fromNode.id,
                distanceKm: 4.5,
                terrain: 'Trail',
                allowedModes: ['Foot', 'Horse'],
                hazardRisk: 0.05,
                isBlocked: false,
                provenance: 'authored',
              });
            }
          }
        }
      } else {
        // World has no nodes; construct canonical starting waypoint
        if (!startingLocationId) {
          startingLocationId = `loc_${storyId}_start`;
        }
        const startNode = {
          id: startingLocationId,
          name: char.startingLocation?.name || world.setting || `${world.title} Capital`,
          regionId: char.startingLocation?.region || world.title,
          description: char.startingLocation?.description || world.description || `Starting area in ${world.title}.`,
          coordinates: { x: 50, y: 50 },
          accessible: true,
          discovered: true,
          ambientSensory: `Visual: First light over ${world.title}. Sounds: Distant atmosphere. Scent: Native vegetation. Tactile: Firm earth.`,
          provenance: 'generated' as const,
        };
        geographyGraph.addNode(startNode as any);
        registeredNodes.push(startNode);
      }

      this.geographies.set(storyId, geographyGraph);

      // 6. Chronology: Brand-new WorldClock with Era, turn 0
      const clock = new WorldClock(world.defaultEra || 'Age of Discovery');
      this.worldClocks.set(storyId, clock);

      // 7. Protagonist Actor & Lifecycle
      const actorId = `player_actor_${storyId}`;

      // Deep copy injuries from condition
      const initialInjuries: any[] = [];
      if (Array.isArray(char.condition?.injuries)) {
        char.condition.injuries.forEach((inj: any, idx: number) => {
          if (typeof inj === 'string') {
            initialInjuries.push({
              id: `inj_${storyId}_${idx}`,
              name: inj,
              severity: 'minor',
              treated: false,
              location: 'body',
            });
          } else if (inj && typeof inj === 'object') {
            initialInjuries.push({
              id: inj.id || `inj_${storyId}_${idx}`,
              name: inj.name || 'Injury',
              severity: inj.severity || 'minor',
              treated: Boolean(inj.treated),
              location: inj.location || 'body',
            });
          }
        });
      }

      const activeForm: import('../domain/types').TransformationRecord | null = Array.isArray(char.condition?.forms) && char.condition.forms.length > 0
        ? {
            id: `trans_${storyId}_0`,
            formName: String(char.condition.forms[0]),
            vesselType: 'metamorphic',
            active: true,
            beganAtTimestamp: clock.getTimestamp(),
            expiresAtTimestamp: null,
          }
        : null;

      const player = new PlayerLifecycleState({
        actorId,
        name: char.identity.name,
        locationId: startingLocationId,
        discoveredLocationIds: [startingLocationId], // Strict epistemic boundary
        lastUpdatedTime: clock.getTimestamp().totalElapsedSeconds,
        currentActivity: 'idle',
        activeJourney: null,
        injuries: initialInjuries,
        transformationRecord: activeForm,
      });
      this.playerLifecycles.set(storyId, player);

      // 8. Inventory & Equipment Paper Doll
      const invEngine = new InventoryItemEngine();
      this.inventoryEngines.set(storyId, invEngine);

      const equippedItems = Array.isArray(char.startingEquipment?.equipped) ? char.startingEquipment.equipped : [];
      const inventoryItems = [
        ...(Array.isArray(char.startingEquipment?.inventory) ? char.startingEquipment.inventory : []),
        ...(Array.isArray(char.startingEquipment?.weapons) ? char.startingEquipment.weapons : []),
        ...(Array.isArray(char.startingEquipment?.armor) ? char.startingEquipment.armor : []),
        ...(Array.isArray(char.startingEquipment?.tools) ? char.startingEquipment.tools : []),
        ...(Array.isArray(char.startingEquipment?.consumables) ? char.startingEquipment.consumables : []),
      ];

      let itemDefCounter = 0;

      // Register and equip equipped items
      equippedItems.forEach((eqItem: any) => {
        itemDefCounter++;
        const defId = `def_${storyId}_eq_${itemDefCounter}`;
        const slot = normalizeEquipmentSlot(eqItem.slot, eqItem.category);
        const category = normalizeItemCategory(eqItem.category);

        invEngine.registerDefinition({
          id: defId,
          name: eqItem.name || 'Equipped Gear',
          category,
          rarity: (eqItem.rarity as any) || 'Common',
          description: eqItem.description || 'Starting equipped equipment.',
          allowedSlots: [slot],
          weightKg: typeof eqItem.weightKg === 'number' ? eqItem.weightKg : 1.0,
          baseValueGold: 10,
          maxDurability: eqItem.maxDurability || eqItem.durability || 100,
          tags: ['equipped', 'starting'],
          properties: eqItem.properties || {},
        });

        const instance = invEngine.createInstance({
          defId,
          ownerEntityId: actorId,
          quantity: 1,
          provenance: 'Starting Equipment',
          customName: eqItem.name,
        });

        invEngine.equipItem(actorId, instance.id, slot);
      });

      // Register backpack/inventory items
      inventoryItems.forEach((invItem: any) => {
        itemDefCounter++;
        const defId = `def_${storyId}_inv_${itemDefCounter}`;
        const category = normalizeItemCategory(invItem.category);

        invEngine.registerDefinition({
          id: defId,
          name: invItem.name || 'Adventuring Item',
          category,
          rarity: (invItem.rarity as any) || 'Common',
          description: invItem.description || 'Starting inventory item.',
          weightKg: typeof invItem.weightKg === 'number' ? invItem.weightKg : 0.5,
          baseValueGold: 5,
          maxDurability: invItem.maxDurability || invItem.durability || 100,
          tags: ['inventory', 'starting'],
          properties: invItem.properties || {},
        });

        invEngine.createInstance({
          defId,
          ownerEntityId: actorId,
          quantity: 1,
          provenance: 'Starting Equipment',
          customName: invItem.name,
        });
      });

      // 9. Capabilities & Techniques
      const capEngine = new CapabilityEngine();
      this.capabilityEngines.set(storyId, capEngine);

      const allCaps = [
        ...(Array.isArray(world.capabilities) ? world.capabilities : []),
        ...(Array.isArray(char.capabilities) ? char.capabilities : []),
      ];

      allCaps.forEach((cap: any) => {
        if (cap && (cap.name || cap.id)) {
          const capId = cap.id || `cap_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          const capDef: CapabilityDefinition = {
            id: capId,
            name: cap.name || capId,
            category: (cap.category as any) || 'Magic',
            activationMode: cap.activationMode || 'immediate',
            powerTier: cap.powerTier || 'Moderate',
            baseEnergyCost: cap.baseEnergyCost || 0,
            baseStrainCost: cap.baseStrainCost || 0,
            minVesselCapacityRequired: cap.minVesselCapacityRequired || 0,
            description: cap.description || 'Synthesized capability.',
            provenance: cap.provenance || cap.source || 'WORLD_CANON',
            storyCheckChallenges: cap.storyCheckChallenges || cap.savingThrowChallenges,
          };

          capEngine.registerCapability(capDef);

          // Link derived skills from generatedSkills
          const matchingSkills = (char.generatedSkills || [])
            .filter((s: any) => s.parentCapabilityId === capId || s.parentCapabilityName === cap.name)
            .map((s: any) => s.name || s.id);

          capEngine.setCapabilityGraphNode(capId, {
            capabilityId: capId,
            name: capDef.name,
            derivedSkills: matchingSkills,
            prerequisites: [],
          });

          // Acquire skill for protagonist
          capEngine.acquireSkill(actorId, capId);

          this.reusableSkillRegistry.registerApprovedSkill({
            id: `lib_skill_${capId}`,
            definitionId: capId,
            definition: capDef,
            progressionSnapshot: {
              level: 1,
              xp: 0,
              xpToNext: 100,
              evolutionPoints: 0,
            },
            evolutionLineage: [capId],
            visualIdentityRef: capDef.visualIdentityRef,
            compatibility: {
              requiredWorldModes: [],
              minVesselCapacity: 0,
              permittedCategories: [],
              forbiddenTraits: [],
            },
            provenance: {
              sourceStoryIds: [storyId],
              registeredAtSeconds: 0,
              approvedBy: 'WORLD_COORDINATOR',
              version: '1.0.0',
            },
          });
        }
      });

      // Anchor the canonical power-state HP to the confirmed character's D&D core stats.
      // The capability system may still track its own energy/strain resources, but HP starts from
      // CharacterGenesis rather than a hard-coded default.
      const seededPowerState = capEngine.seedStarterPowerStateForActor(actorId);
      const conditionEngine = this.getConditionEngine(storyId);
      const confirmedConditionState = char.conditionState || char.startingState?.conditionState;
      conditionEngine.seedActor(actorId, {
        healthCurrent: Number(char.coreStats?.hpCurrent ?? char.startingState?.healthCurrent ?? 50),
        healthMax: Number(char.coreStats?.hpMax ?? char.startingState?.healthMax ?? 50),
        fatigue: Number(char.startingState?.fatigue ?? 0),
        stress: Number(char.startingState?.stress ?? 0),
        legacyConditions: Array.isArray(char.startingState?.conditions) ? char.startingState.conditions : [],
        conditionState: confirmedConditionState,
      });
      if (char.coreStats) {
        capEngine.setPowerState(actorId, {
          ...seededPowerState,
          healthCurrent: Math.max(0, Number(char.coreStats.hpCurrent ?? seededPowerState.healthCurrent)),
          healthMax: Math.max(1, Number(char.coreStats.hpMax ?? seededPowerState.healthMax)),
        });
      }

      // 10. Epistemic Knowledge Boundary: Initial Facts
      const startLocNode = geographyGraph.getNode(startingLocationId);
      const startLocName = startLocNode?.name || char.startingLocation?.name || startingLocationId;
      const startLocDesc = startLocNode?.description || char.startingLocation?.description || `Starting area in ${world.title}.`;

      const initialFacts: KnowledgeFact[] = [
        {
          id: `fact_identity_${storyId}`,
          subjectEntityId: actorId,
          predicate: 'identity',
          objectValue: `${char.identity.name}, ${char.identity.species || 'Human'} ${char.role?.profession || char.role?.archetype || 'Adventurer'}`,
          sourceType: 'witnessed',
          acquiredAtTimestamp: clock.getTimestamp(),
          confidence: 1.0,
          secretLevel: 'public',
          scope: 'exact',
          provenanceSummary: 'Self-knowledge from genesis identity.',
        },
        {
          id: `fact_background_${storyId}`,
          subjectEntityId: actorId,
          predicate: 'origin_history',
          objectValue: char.background?.history || `${char.identity.name} begins their journey.`,
          sourceType: 'witnessed',
          acquiredAtTimestamp: clock.getTimestamp(),
          confidence: 1.0,
          secretLevel: 'public',
          scope: 'exact',
          provenanceSummary: 'Personal memory and background.',
        },
        {
          id: `fact_starting_location_${storyId}`,
          subjectEntityId: startingLocationId,
          predicate: 'current_surroundings',
          objectValue: `${startLocName}: ${startLocDesc}`,
          sourceType: 'witnessed',
          acquiredAtTimestamp: clock.getTimestamp(),
          confidence: 1.0,
          secretLevel: 'public',
          scope: 'exact',
          provenanceSummary: `Immediate observation at ${startLocName}.`,
        },
        {
          id: `fact_world_premise_${storyId}`,
          subjectEntityId: `world_${world.worldId}`,
          predicate: 'public_premise',
          objectValue: world.description || `The realm of ${world.title}.`,
          sourceType: 'witnessed',
          acquiredAtTimestamp: clock.getTimestamp(),
          confidence: 1.0,
          secretLevel: 'public',
          scope: 'exact',
          provenanceSummary: `Common public knowledge of ${world.title}.`,
        },
      ];
      this.knowledgeBases.set(storyId, initialFacts);

      // 11. Timeline State & Planned World Events (Slice 1B)
      // Cloned with status 'PLANNED', strictly unexecuted
      const rawEvents = Array.isArray(world.events) ? world.events : [];
      const plannedEvents = rawEvents.map((ev: any) => ({
        id: ev.id,
        title: ev.title,
        description: ev.description,
        category: ev.category,
        scheduledTime: ev.scheduledTime ? { ...ev.scheduledTime } : undefined,
        locationId: ev.locationId,
        status: 'PLANNED' as const,
        visibility: ev.visibility || 'HIDDEN',
        participatingActors: Array.isArray(ev.participatingActors) ? [...ev.participatingActors] : [],
        plannedConsequences: Array.isArray(ev.plannedConsequences) ? [...ev.plannedConsequences] : [],
        preconditions: Array.isArray(ev.preconditions) ? [...ev.preconditions] : undefined,
      }));

      const eventStates = plannedEvents.reduce((acc: any, ev: any) => {
        acc[ev.id] = {
          id: ev.id,
          status: 'PLANNED',
          scheduledTime: ev.scheduledTime,
        };
        return acc;
      }, {});

      // 12. Historical Chronicle Engine
      const chronicle = new HistoricalChronicleEngine();
      this.chronicleEngines.set(storyId, chronicle);

      const initialSceneHook = char.startingSituation?.summary || char.startingSituation?.hook || world.summary || `You awaken in ${startLocName} as ${char.identity.name}. The journey begins.`;
      chronicle.recordEvidence({
        id: `ev_genesis_${storyId}`,
        category: 'SACRED_OR_HISTORIC',
        timestamp: clock.getTimestamp(),
        primarySubjectId: actorId,
        locationId: startingLocationId,
        summary: `Awakened in ${startLocName}`,
        details: initialSceneHook,
        sourceEventId: `evt_genesis_${storyId}`,
        provenance: 'story_genesis',
        visibility: 'PUBLIC',
        metadata: {
          characterName: char.identity.name,
          characterId: char.characterId,
          worldTitle: world.title,
          worldVersion: pinnedWorldVersion,
        },
      });

      // 13. Construct and Persist StoryRun
      const allEquipNames = [
        ...equippedItems.map((e: any) => e.name),
        ...inventoryItems.map((i: any) => i.name),
      ];

      const run = {
        id: storyId,
        storyId,
        worldId: world.worldId,
        worldVersion: pinnedWorldVersion,
        pinnedWorldVersion,
        activeCharacterId: char.characterId,
        storyMode: params.storyMode || world.storyMode || 'PROTAGONIST',
        dndRulesMode: params.dndRulesMode || world.dndRulesMode || world.rulesetId || 'FULL_DND',
        ruleset: params.dndRulesMode || world.rulesetId || 'FULL_DND',
        rulesProfile: rulesProfileEngine.resolve({
          mode: params.dndRulesMode || world.dndRulesMode || world.rulesetId || 'FULL_DND',
          rulesProfile: world.rulesProfile,
          worldRules: world.worldRules || [],
          ruleConstraints: world.ruleConstraints || [],
          canonicalCapabilities: world.canonicalCapabilities || [],
        }).profile,
        characterName: char.identity.name,
        characterRole: char.role?.profession || char.role?.archetype || 'Adventurer',
        characterBackground: [char.background?.history, ...(char.background?.notableEvents || [])].filter(Boolean).join('. ') || '',
        characterAppearance: char.appearance?.physicalDescription || '',
        characterPersonality: Array.isArray(char.personality?.traits)
          ? char.personality.traits.join(', ')
          : (char.personality?.traits || ''),
        characterMotivations: Array.isArray(char.motivations?.goals)
          ? char.motivations.goals.join(', ')
          : (char.motivations?.goals || ''),
        characterEquipment: allEquipNames,
        characterPortraitEmoji: char.portraitAsset?.emoji || '🧙‍♂️',
        characterPortraitUrl: char.portraitAsset?.imageUrl || char.portraitAsset?.url,
        currentLocationId: startingLocationId,
        currentHp: Number(char.coreStats?.hpCurrent ?? char.startingState?.healthCurrent ?? 30),
        maxHp: Number(char.coreStats?.hpMax ?? char.startingState?.healthMax ?? 30),
        characterCoreStats: char.coreStats ? JSON.parse(JSON.stringify(char.coreStats)) : undefined,
        conditionState: char.conditionState || char.startingState?.conditionState
          ? JSON.parse(JSON.stringify(char.conditionState || char.startingState?.conditionState))
          : undefined,
        characterSkills: char.skills ? JSON.parse(JSON.stringify(char.skills)) : undefined,
        protagonist: JSON.parse(JSON.stringify(char)), // Sealed snapshot
        characterAttributes: JSON.parse(JSON.stringify(char.attributes || [])),
        characterStats: JSON.parse(JSON.stringify(char.stats || [])),
        characterTraits: [...(char.traits || [])],
        characterFeats: JSON.parse(JSON.stringify(char.feats || [])),
        characterTitles: JSON.parse(JSON.stringify(char.titles || [])),
        characterEffects: JSON.parse(JSON.stringify([
          ...(char.startingState?.activeEffects || []),
          ...(char.capabilities || []).flatMap((cap: any) => cap.effects || []),
          ...(char.feats || []).flatMap((feat: any) => feat.effects || []),
          ...(char.titles || []).flatMap((title: any) => title.effects || []),
        ])),
        startingState: JSON.parse(JSON.stringify(char.startingState || {})),
        startingLocation: JSON.parse(JSON.stringify(char.startingLocation || {})),
        startingSituation: JSON.parse(JSON.stringify(char.startingSituation || {})),
        plannedEvents,
        eventStates,
        createdAt: new Date().toISOString(),
        initialScene: initialSceneHook,
      };

      this.saveStoryRun(run);

      return { storyId, run };
    } catch (err) {
      // Atomic rollback on failure
      this.deleteStoryRun(storyId);
      throw err;
    }
  }

  public seedDynamicStoryRun(
    storyId: string,
    world: any,
    characterData: {
      storyMode?: string;
      dndRulesMode?: string;
      characterName: string;
      characterRole?: string;
      characterBackground?: string;
      characterAppearance?: string;
      characterPersonality?: string;
      characterMotivations?: string;
      characterEquipment?: string[];
      characterPortraitEmoji?: string;
      characterPortraitUrl?: string;
      capabilities?: any[];
      initialConditions?: string[];
    }
  ): void {
    const syntheticConfirmedChar = {
      characterId: `char_synth_${storyId}`,
      worldId: world.worldId,
      worldVersion: world.worldManifestVersion || 1,
      confirmedAt: new Date().toISOString(),
      identity: {
        name: characterData.characterName || 'Hero Vael',
        species: 'Human',
      },
      role: {
        profession: characterData.characterRole || 'Adventurer',
        archetype: characterData.characterRole || 'Adventurer',
      },
      background: {
        history: characterData.characterBackground || '',
      },
      appearance: {
        physicalDescription: characterData.characterAppearance || '',
      },
      personality: {
        traits: characterData.characterPersonality ? [characterData.characterPersonality] : [],
      },
      motivations: {
        goals: characterData.characterMotivations ? [characterData.characterMotivations] : [],
      },
      condition: {
        injuries: characterData.initialConditions || [],
      },
      capabilities: characterData.capabilities || [],
      generatedSkills: [],
      startingEquipment: {
        equipped: [],
        inventory: (characterData.characterEquipment || []).map((eqName) => ({
          name: eqName,
          category: 'Weapon',
          description: 'Starting equipment.',
        })),
        weapons: [],
        armor: [],
        tools: [],
        consumables: [],
      },
      portraitAsset: {
        emoji: characterData.characterPortraitEmoji || '🧙‍♂️',
        imageUrl: characterData.characterPortraitUrl,
      },
      startingLocation: {
        locationId: world.geography?.nodes?.[0]?.id || world.geography?.locations?.[0]?.id,
        name: world.geography?.nodes?.[0]?.name || world.setting || world.title,
      },
      startingSituation: {
        summary: world.description || `Entering ${world.title}.`,
      },
    };

    if (!this.worldTemplates.has(world.worldId)) {
      this.worldTemplates.set(world.worldId, world as any);
    }

    this.createStoryRunFromConfirmedCharacter({
      worldId: world.worldId,
      confirmedCharacter: syntheticConfirmedChar,
      storyId,
      storyMode: characterData.storyMode,
      dndRulesMode: characterData.dndRulesMode,
    });
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
      const existingRun = this.storyRuns.get(storyId);
      const initialPlayer = new PlayerLifecycleState({
        actorId: `player_actor_${storyId}`,
        name: existingRun?.characterName || 'Scribe Vael',
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
    if (!state && storyId === 'default_story') {
      this.seedStory('default_story');
      state = this.playerLifecycles.get('default_story');
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
      geo = new GeographyGraph(true);
      this.geographies.set(storyId, geo);
    }
    return geo;
  }

  public getGeography(storyId = 'default_story'): GeographyGraph {
    return this.getGeographyGraph(storyId);
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
      engine = new CapabilityEngine(this.getConditionEngine(storyId));
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

  public getConditionEngine(storyId: string): ConditionEngine {
    let engine = this.conditionEngines.get(storyId);
    if (!engine) {
      engine = new ConditionEngine();
      const player = this.getPlayerLifecycle(storyId);
      const run = this.getStoryRun(storyId);
      const actorId = player ? player.actorId : `player_actor_${storyId}`;
      const coreStats = run?.characterCoreStats || run?.protagonist?.coreStats;
      engine.seedActor(actorId, {
        healthCurrent: Number(coreStats?.hpCurrent ?? run?.currentHp ?? 50),
        healthMax: Number(coreStats?.hpMax ?? run?.maxHp ?? 50),
        legacyConditions: run?.startingState?.conditions || [],
        conditionState: run?.conditionState || run?.startingState?.conditionState,
        fatigue: Number(run?.startingState?.fatigue ?? 0),
        stress: Number(run?.startingState?.stress ?? 0),
      });
      this.conditionEngines.set(storyId, engine);
    }
    return engine;
  }

  public getStoryCheckEngine(storyId: string): StoryCheckEngine {
    let engine = this.storyCheckEngines.get(storyId);
    if (!engine) {
      engine = new StoryCheckEngine();
      this.storyCheckEngines.set(storyId, engine);
    }
    return engine;
  }

  public getCombatEngine(storyId: string): TacticalCombatEngine {
    let engine = this.combatEngines.get(storyId);
    if (!engine) {
      engine = new TacticalCombatEngine(1337, undefined, this.getConditionEngine(storyId));
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
    if (!this.aiOrchestrator) {
      this.aiOrchestrator = new MultiModelOrchestrator();
      this.aiOrchestrator.setWorldRepository(this);
    }
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

  getAdaptedStoryBible(storyId: string): AdaptedStoryBible | null {
    return this.adaptedStoryBibles.get(storyId) || null;
  }

  saveAdaptedStoryBible(storyId: string, bible: AdaptedStoryBible): void {
    this.adaptedStoryBibles.set(storyId, bible);
  }

  getAdaptationProfile(storyId: string): AdaptationProfile | null {
    return this.adaptationProfiles.get(storyId) || null;
  }

  saveAdaptationProfile(storyId: string, profile: AdaptationProfile): void {
    this.adaptationProfiles.set(storyId, profile);
  }

  getPipelineState(storyId: string): PipelineState | null {
    return this.pipelineStates.get(storyId) || null;
  }

  savePipelineState(storyId: string, state: PipelineState): void {
    this.pipelineStates.set(storyId, state);
  }

  getAdaptationSession(storyId: string): AdaptationSession | null {
    return this.adaptationSessions.get(storyId) || null;
  }

  saveAdaptationSession(storyId: string, session: AdaptationSession): void {
    this.adaptationSessions.set(storyId, session);
  }

  getAdaptationEvents(storyId: string): TypedAdaptationEvent[] {
    return this.adaptationEvents.get(storyId) || [];
  }

  addAdaptationEvent(storyId: string, event: TypedAdaptationEvent): void {
    const list = this.getAdaptationEvents(storyId);
    list.push(event);
    this.adaptationEvents.set(storyId, list);
  }

  duplicateAdaptationBranch(
    parentStoryId: string,
    newBranchId: string,
    options?: { branchTitle?: string }
  ): { success: boolean; newStoryId: string; errorReason?: string } {
    const newStoryId = `${parentStoryId}_branch_${newBranchId}`;
    this.seedStory(newStoryId);

    const parentPlayer = this.getPlayerLifecycle(parentStoryId);
    if (parentPlayer) {
      const clonedPlayer = PlayerLifecycleState.fromJSON(parentPlayer.toJSON());
      this.updatePlayerLifecycle(newStoryId, clonedPlayer);
    }

    const parentClock = this.getWorldClock(parentStoryId);
    const newClock = new WorldClock();
    newClock.importState(parentClock.exportState());
    this.worldClocks.set(newStoryId, newClock);

    const parentBible = this.getAdaptedStoryBible(parentStoryId);
    if (parentBible) {
      this.saveAdaptedStoryBible(newStoryId, {
        ...parentBible,
        storyId: newStoryId,
        title: options?.branchTitle || `${parentBible.title} (${newBranchId})`,
      });
    }

    const parentProfile = this.getAdaptationProfile(parentStoryId);
    if (parentProfile) {
      this.saveAdaptationProfile(newStoryId, { ...parentProfile, storyId: newStoryId });
    }

    const parentPipelineState = this.getPipelineState(parentStoryId);
    if (parentPipelineState) {
      this.savePipelineState(newStoryId, { ...parentPipelineState, storyId: newStoryId });
    }

    const parentSession = this.getAdaptationSession(parentStoryId);
    if (parentSession) {
      this.saveAdaptationSession(newStoryId, {
        ...parentSession,
        sessionId: `session_${newStoryId}_${Date.now()}`,
        storyId: newStoryId,
        branchId: newBranchId,
        parentStoryId,
      });
    }

    const parentEvents = this.getAdaptationEvents(parentStoryId);
    this.adaptationEvents.set(newStoryId, [...parentEvents]);

    return { success: true, newStoryId };
  }

  getAllAdaptationStories(): {
    storyId: string;
    title: string;
    mode: string;
    branchId: string;
    parentStoryId?: string;
    isAdapted: boolean;
  }[] {
    const list: {
      storyId: string;
      title: string;
      mode: string;
      branchId: string;
      parentStoryId?: string;
      isAdapted: boolean;
    }[] = [];

    this.adaptedStoryBibles.forEach((bible, storyId) => {
      const session = this.getAdaptationSession(storyId);
      list.push({
        storyId,
        title: bible.title,
        mode: bible.profile.mode,
        branchId: session?.branchId || 'main',
        parentStoryId: session?.parentStoryId,
        isAdapted: true,
      });
    });

    if (!list.some((s) => s.storyId === 'default_story')) {
      list.unshift({
        storyId: 'default_story',
        title: 'Original Dreamville Campaign',
        mode: 'Original',
        branchId: 'main',
        isAdapted: false,
      });
    }

    return list;
  }

  /**
   * Challenge 13: Export Lossless Campaign Archive (.dreamarchive)
   */
  public exportCampaignArchive(storyId = 'default_story', title = 'Dreamville Campaign'): PartitionedArchive {
    let player = this.getPlayerLifecycle(storyId);
    if (!player || !player.actorId) {
      player = new PlayerLifecycleState({
        actorId: `player_actor_${storyId}`,
        name: 'Player',
        locationId: this.getGeographyGraph(storyId).getAllNodes()[0]?.id || 'loc_whispering_orrery',
        lastUpdatedTime: this.getWorldClock(storyId).getTimestamp().totalElapsedSeconds,
        currentActivity: 'idle',
        activeJourney: null,
        injuries: [],
      });
      this.updatePlayerLifecycle(storyId, player);
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
    const sensoryEngine = this.getSensoryEngine();
    const sensoryState = {
      settings: sensoryEngine.getSettings(storyId),
      voiceProfiles: sensoryEngine.getAllVoiceProfiles(storyId),
    };
    const run = this.getStoryRun(storyId);
    const worldTemplate = run?.worldId ? this.getWorldTemplate(run.worldId) : null;

    const adaptationState = {
      bible: this.getAdaptedStoryBible(storyId),
      profile: this.getAdaptationProfile(storyId),
      pipelineState: this.getPipelineState(storyId),
      session: this.getAdaptationSession(storyId),
      events: this.getAdaptationEvents(storyId),
      ch16Run: run,
      ch16Threads: this.getStoryThreads(storyId),
      ch16ActiveEffects: this.getActiveEffects(storyId),
      ch16WorldFacts: this.getWorldFacts(storyId),
      ch16Agenda: this.getProtagonistAgenda(storyId),
      worldTemplate,
    };

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
      sensoryState,
      adaptationState,
    });
  }

  /**
   * Challenge 13: Staged Atomic Restore Pipeline (DEF-CH13-01)
   * Validates archive, stages subsystem instances in isolation, validates cross-references,
   * and atomically swaps them into live repository maps ONLY on 100% validation success.
   */
  public restoreCampaignArchive(
    archive: PartitionedArchive,
    targetStoryId?: string
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
    let effectiveStoryId = targetStoryId;
    if (!effectiveStoryId) {
      if (restored.campaignId && restored.campaignId.startsWith('campaign_')) {
        effectiveStoryId = restored.campaignId.slice('campaign_'.length);
      } else {
        effectiveStoryId = restored.campaignId || 'default_story';
      }
    }

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
          actorId: `player_actor_${effectiveStoryId}`,
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

      let stagedSensorySettings: any = null;
      let stagedVoiceProfiles: any[] = [];
      if (restored.sensoryConfig) {
        if ((restored.sensoryConfig as any).settings) {
          stagedSensorySettings = (restored.sensoryConfig as any).settings;
        }
        if (Array.isArray((restored.sensoryConfig as any).voiceProfiles)) {
          stagedVoiceProfiles = (restored.sensoryConfig as any).voiceProfiles;
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
      this.worldClocks.set(effectiveStoryId, stagedClock);
      this.geographies.set(effectiveStoryId, stagedGeography);
      this.knowledgeBases.set(effectiveStoryId, stagedKnowledgeFacts);
      this.playerLifecycles.set(effectiveStoryId, stagedPlayer);
      this.chronicleEngines.set(effectiveStoryId, stagedChronicle);
      this.getAiOrchestrator().restoreNarrativeHistory(effectiveStoryId, stagedNarrative);
      this.inventoryEngines.set(effectiveStoryId, stagedInventory);
      if (stagedSensorySettings) {
        this.sensoryEngine.updateSettings(effectiveStoryId, stagedSensorySettings);
      }
      if (stagedVoiceProfiles && stagedVoiceProfiles.length > 0) {
        this.sensoryEngine.restoreVoiceProfiles(effectiveStoryId, stagedVoiceProfiles);
      }
      this.capabilityEngines.set(effectiveStoryId, stagedCapability);
      this.combatEngines.set(effectiveStoryId, stagedCombat);
      this.memoryEngines.set(effectiveStoryId, stagedMemory);
      this.livingSimulations.set(effectiveStoryId, stagedLivingWorld);
      this.characterAlignmentEngine = stagedAlignment;
      this.npcLifecycles.set(effectiveStoryId, stagedNpcLifecycles);

      if (restored.adaptationState) {
        if (restored.adaptationState.bible) {
          this.saveAdaptedStoryBible(effectiveStoryId, {
            ...restored.adaptationState.bible,
            storyId: effectiveStoryId,
          });
        }
        if (restored.adaptationState.profile) {
          this.saveAdaptationProfile(effectiveStoryId, {
            ...restored.adaptationState.profile,
            storyId: effectiveStoryId,
          });
        }
        if (restored.adaptationState.pipelineState) {
          this.savePipelineState(effectiveStoryId, {
            ...restored.adaptationState.pipelineState,
            storyId: effectiveStoryId,
          });
        }
        if (restored.adaptationState.session) {
          this.saveAdaptationSession(effectiveStoryId, {
            ...restored.adaptationState.session,
            storyId: effectiveStoryId,
          });
        }
        if (Array.isArray(restored.adaptationState.events)) {
          this.adaptationEvents.set(effectiveStoryId, restored.adaptationState.events);
        }
        if (restored.adaptationState.ch16Run) {
          this.saveStoryRun({
            ...restored.adaptationState.ch16Run,
            storyId: effectiveStoryId,
          });
        }
        if (Array.isArray(restored.adaptationState.ch16Threads)) {
          for (const thread of restored.adaptationState.ch16Threads) {
            this.saveStoryThread({ ...thread, storyId: effectiveStoryId });
          }
        }
        if (Array.isArray(restored.adaptationState.ch16ActiveEffects)) {
          for (const eff of restored.adaptationState.ch16ActiveEffects) {
            this.saveActiveEffect({ ...eff, storyId: effectiveStoryId });
          }
        }
        if (Array.isArray(restored.adaptationState.ch16WorldFacts)) {
          for (const fact of restored.adaptationState.ch16WorldFacts) {
            this.saveWorldFact(effectiveStoryId, fact);
          }
        }
        if (restored.adaptationState.ch16Agenda) {
          this.saveProtagonistAgenda(effectiveStoryId, restored.adaptationState.ch16Agenda);
        }
        if (restored.adaptationState.worldTemplate) {
          this.saveWorldTemplate(restored.adaptationState.worldTemplate);
        }
      }

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

  // CH16 Repository Methods
  public getAllWorldTemplates(): any[] {
    return Array.from(this.worldTemplates.values());
  }

  public getWorldTemplate(worldId: string): any | null {
    return this.worldTemplates.get(worldId) || null;
  }

  public saveWorldTemplate(world: any): void {
    this.worldTemplates.set(world.worldId, world);
    this.persistLibrary();
  }

  private persistLibrary(): void {
    this.persistentStore.save({
      version: 1,
      worldTemplates: Object.fromEntries(this.worldTemplates),
      storyRuns: Object.fromEntries(this.storyRuns),
    });
  }

  public searchWorldTemplates(criteria: {
    query?: string;
    genre?: string;
    tone?: string;
    medium?: string;
    era?: string;
    setting?: string;
    source?: string;
    playstyle?: string;
    rules?: string;
  } = {}): any[] {
    const all = this.getAllWorldTemplates();
    return all.filter((w) => {
      if (criteria.query) {
        const q = criteria.query.toLowerCase();
        const matchesTitle = (w.title || '').toLowerCase().includes(q);
        const matchesSummary = (w.summary || '').toLowerCase().includes(q);
        const matchesDesc = (w.description || '').toLowerCase().includes(q);
        const matchesGenre = Array.isArray(w.genreTags) && w.genreTags.some((g: string) => g.toLowerCase().includes(q));
        const matchesTone = Array.isArray(w.toneTags) && w.toneTags.some((t: string) => t.toLowerCase().includes(q));
        const matchesMedium = Array.isArray(w.mediumTags) && w.mediumTags.some((m: string) => m.toLowerCase().includes(q));
        const matchesEra = (w.era || w.defaultEra || '').toLowerCase().includes(q);
        const matchesSetting = (w.setting || '').toLowerCase().includes(q);
        const matchesSource = (w.source || w.sourcePolicy || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesSummary && !matchesDesc && !matchesGenre && !matchesTone && !matchesMedium && !matchesEra && !matchesSetting && !matchesSource) {
          return false;
        }
      }
      if (criteria.genre) {
        const g = criteria.genre.toLowerCase();
        const hasGenre = Array.isArray(w.genreTags) && w.genreTags.some((tag: string) => tag.toLowerCase() === g || tag.toLowerCase().includes(g));
        if (!hasGenre) return false;
      }
      if (criteria.tone) {
        const t = criteria.tone.toLowerCase();
        const hasTone = Array.isArray(w.toneTags) && w.toneTags.some((tag: string) => tag.toLowerCase() === t || tag.toLowerCase().includes(t));
        if (!hasTone) return false;
      }
      if (criteria.medium) {
        const m = criteria.medium.toLowerCase();
        const hasMedium =
          (Array.isArray(w.mediumTags) && w.mediumTags.some((tag: string) => tag.toLowerCase() === m || tag.toLowerCase().includes(m))) ||
          (typeof w.medium === 'string' && w.medium.toLowerCase().includes(m));
        if (!hasMedium) return false;
      }
      if (criteria.era) {
        const e = criteria.era.toLowerCase();
        const eraVal = (w.era || w.defaultEra || '').toLowerCase();
        if (!eraVal.includes(e)) return false;
      }
      if (criteria.setting) {
        const s = criteria.setting.toLowerCase();
        const settingVal = (w.setting || '').toLowerCase();
        if (!settingVal.includes(s)) return false;
      }
      if (criteria.source) {
        const src = criteria.source.toLowerCase();
        const sourceVal = (w.source || w.sourcePolicy || '').toLowerCase();
        if (!sourceVal.includes(src)) return false;
      }
      if (criteria.playstyle) {
        const p = criteria.playstyle.toLowerCase();
        const playstyleVal = (w.playstyle || '').toLowerCase();
        const hasSupported =
          Array.isArray(w.supportedPlaystyles) &&
          w.supportedPlaystyles.some((s: string) => s.toLowerCase() === p || s.toLowerCase().includes(p));
        if (!playstyleVal.includes(p) && !hasSupported) return false;
      }
      if (criteria.rules) {
        const r = criteria.rules.toLowerCase();
        const rulesVal = (w.rules || w.rulesetId || w.dndRulesMode || '').toLowerCase();
        if (!rulesVal.includes(r)) return false;
      }
      return true;
    });
  }

  public getChronologicallyAvailableFacts(storyId: string): any[] {
    const clock = this.getWorldClock(storyId);
    const currentSeconds = clock.getTimestamp().totalElapsedSeconds;
    const allFacts: any[] = [...this.getKnowledgeFacts(storyId), ...this.getWorldFacts(storyId)];
    return allFacts.filter((f) => {
      const ts = f.acquiredAtTimestamp;
      if (!ts || typeof ts.totalElapsedSeconds !== 'number') {
        return true;
      }
      return ts.totalElapsedSeconds <= currentSeconds;
    });
  }

  public getStoryRun(storyId: string): any | null {
    return this.storyRuns.get(storyId) || null;
  }

  public getRulesProfile(storyId: string): RulesProfile | null {
    const run = this.getStoryRun(storyId);
    const world = run?.worldId ? this.getWorldTemplate(run.worldId) : null;
    if (!run && !world) return null;

    return rulesProfileEngine.resolve({
      mode: run?.dndRulesMode || world?.dndRulesMode || run?.ruleset || world?.rulesetId || 'FULL_DND',
      rulesProfile: run?.rulesProfile || world?.rulesProfile,
      worldRules: world?.worldRules || [],
      ruleConstraints: world?.ruleConstraints || [],
      canonicalCapabilities: world?.canonicalCapabilities || [],
    }).profile;
  }

  public getAllStoryRuns(): any[] {
    return Array.from(this.storyRuns.values());
  }

  public saveStoryRun(run: any): void {
    this.storyRuns.set(run.storyId, run);
    if (run && run.storyId && run.characterName) {
      const existingPlayer = this.playerLifecycles.get(run.storyId);
      if (existingPlayer && existingPlayer.name === 'Scribe Vael' && run.characterName !== 'Scribe Vael') {
        this.playerLifecycles.set(run.storyId, existingPlayer.copyWith({ name: run.characterName }));
      }
    }
    this.persistLibrary();
  }

  public registerStoryRun(run: any): void {
    this.saveStoryRun(run);
  }

  public getStoryThreads(storyId: string): any[] {
    return this.storyThreads.get(storyId) || [];
  }

  public saveStoryThread(thread: any): void {
    const list = this.getStoryThreads(thread.storyId);
    const idx = list.findIndex((t) => t.threadId === thread.threadId);
    if (idx >= 0) {
      list[idx] = thread;
    } else {
      list.push(thread);
    }
    this.storyThreads.set(thread.storyId, list);
  }

  public getActiveEffects(storyId: string): any[] {
    return this.activeEffects.get(storyId) || [];
  }

  public saveActiveEffect(effect: any): void {
    const list = this.getActiveEffects(effect.storyId);
    list.push(effect);
    this.activeEffects.set(effect.storyId, list);
  }

  public getWorldFacts(storyId: string): any[] {
    return this.worldFactsMap.get(storyId) || [];
  }

  public saveWorldFact(storyId: string, fact: any): void {
    const list = this.getWorldFacts(storyId);
    list.push(fact);
    this.worldFactsMap.set(storyId, list);
  }

  public getProtagonistAgenda(storyId: string): any | null {
    return this.protagonistAgendas.get(storyId) || null;
  }

  public saveProtagonistAgenda(storyId: string, agenda: any): void {
    this.protagonistAgendas.set(storyId, agenda);
  }

  public resolveDiceClashExchange(
    storyId: string,
    playerPool: { dice: number[] },
    enemyPool: { dice: number[] },
    options: { exchangeIndex?: number; attackerStats?: { atk: number }; defenderStats?: { def: number } } = {}
  ) {
    if (!playerPool?.dice || !enemyPool?.dice) {
      throw new Error('Player and Enemy dice pools are required.');
    }
    if (playerPool.dice.length > 5 || enemyPool.dice.length > 5) {
      throw new Error('Dice pool size cannot exceed 5.');
    }

    const exchangeIdx = options.exchangeIndex ?? 1;
    const atk = options.attackerStats?.atk ?? 12;
    const def = options.defenderStats?.def ?? 6;

    // Check active effects for reactive damage reflection
    const activeEffs = this.getActiveEffects(storyId);
    const reflectionEff = activeEffs.find((e) => e.damageReflection && e.charges && e.charges > 0);

    let totalPlayerDamage = 0;
    let totalEnemyDamage = 0;
    const beatResults: any[] = [];

    const pairsCount = Math.min(playerPool.dice.length, enemyPool.dice.length);
    for (let i = 0; i < pairsCount; i++) {
      const pDie = playerPool.dice[i];
      const eDie = enemyPool.dice[i];
      const diff = pDie - eDie;

      let pDmg = 0;
      let eDmg = 0;

      if (diff > 0) {
        // Player wins beat
        pDmg = Math.max(1, atk - def + Math.floor(diff / 2));
      } else if (diff < 0) {
        // Enemy wins beat
        const defAtk = (options.defenderStats as any)?.atk ?? 10;
        const atkDef = (options.attackerStats as any)?.def ?? 5;
        eDmg = Math.max(1, defAtk - atkDef + Math.floor(Math.abs(diff) / 2));
      }

      // Reactive effect handling (Fire Mantle damage reflection)
      if (eDmg > 0 && reflectionEff) {
        const reflected = reflectionEff.damageReflection || 5;
        pDmg += reflected; // reflected damage dealt to enemy
        reflectionEff.charges -= 1;
      }

      totalPlayerDamage += pDmg;
      totalEnemyDamage += eDmg;

      beatResults.push({
        beatIndex: i + 1,
        playerDie: pDie,
        enemyDie: eDie,
        differential: diff,
        playerDamageDealt: pDmg,
        enemyDamageDealt: eDmg,
        outcome: diff > 0 ? 'WIN' : diff < 0 ? 'LOSS' : 'DRAW',
      });
    }

    // Mutate HP on story run / player lifecycle
    const run = this.getStoryRun(storyId);
    if (run) {
      run.currentHp = Math.max(0, (run.currentHp ?? 30) - totalEnemyDamage);
      this.saveStoryRun(run);
    }

    return {
      success: true,
      storyId,
      exchangeIndex: exchangeIdx,
      beatResults,
      totalPlayerDamageDealt: totalPlayerDamage,
      totalEnemyDamageDealt: totalEnemyDamage,
      remainingPlayerHp: run ? run.currentHp : 30,
      activeEffectTriggered: Boolean(reflectionEff),
    };
  }

  public evaluateCustomSpellProposal(storyId: string, spellProposal: any) {
    const run = this.getStoryRun(storyId);
    const dndMode = run?.dndRulesMode || 'FULL_DND';
    const characterLevel = spellProposal.casterLevel || 5;

    return dndSpellRulesEvaluator.evaluateSpellProposal({
      proposal: spellProposal,
      characterLevel,
      dndMode,
      overrideCapabilities: run?.canonicalCapabilities || [],
      rulesProfile: run?.rulesProfile,
    });
  }

  // Character Genesis / Drafts & Confirmed Characters (Slice 2)
  public getCharacterDrafts(worldId: string): any[] {
    if (!worldId) return [];
    return this.characterDraftsMap.get(worldId) || [];
  }

  public saveCharacterDraft(worldId: string, draft: any): void {
    if (!worldId || !draft) return;
    const existing = this.getCharacterDrafts(worldId);
    const draftId = draft.draftId || draft.id || `draft_${Date.now()}`;
    draft.draftId = draftId;
    draft.worldId = worldId;
    const idx = existing.findIndex((d) => (d.draftId || d.id) === draftId);
    if (idx >= 0) {
      existing[idx] = draft;
    } else {
      existing.push(draft);
    }
    this.characterDraftsMap.set(worldId, [...existing]);
  }

  public getConfirmedCharacters(worldId: string): any[] {
    if (!worldId) return [];
    return this.confirmedCharactersMap.get(worldId) || [];
  }

  public saveConfirmedCharacter(worldId: string, char: any): void {
    if (!worldId || !char) return;
    const existing = this.getConfirmedCharacters(worldId);
    const charId = char.characterId || char.id || `char_${Date.now()}`;
    char.characterId = charId;
    char.worldId = worldId;
    const idx = existing.findIndex((c) => (c.characterId || c.id) === charId);
    if (idx >= 0) {
      existing[idx] = char;
    } else {
      existing.push(char);
    }
    this.confirmedCharactersMap.set(worldId, [...existing]);
  }

  public getConfirmedCharacter(worldId: string, characterId: string): any | null {
    if (!worldId || !characterId) return null;
    const chars = this.getConfirmedCharacters(worldId);
    return chars.find((c) => (c.characterId || c.id) === characterId) || null;
  }

  public deleteStoryRun(storyId: string): void {
    if (!storyId) return;
    this.storyRuns.delete(storyId);
    this.playerLifecycles.delete(storyId);
    this.worldClocks.delete(storyId);
    this.geographies.delete(storyId);
    this.inventoryEngines.delete(storyId);
    this.capabilityEngines.delete(storyId);
    this.chronicleEngines.delete(storyId);
    this.knowledgeBases.delete(storyId);
    this.combatEngines.delete(storyId);
    this.memoryEngines.delete(storyId);
    this.livingSimulations.delete(storyId);
    this.npcLifecycles.delete(storyId);
  }
}

export const worldRepository = new InMemoryWorldRepository();
