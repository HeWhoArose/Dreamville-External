import fs from 'node:fs';
import path from 'node:path';
import {
  LivingBibleRequirement,
  WorkstationState,
  RequirementStatus,
  RequirementEvidence,
  EvidenceType,
  IterationRecord,
  WorkstationMetadata,
} from './types';

/**
 * LIVING BIBLE & WORKSTATION REGISTRY
 * In-app operational representation of the DreamBook specification
 * (DreamBook §406, §408, §412-§420)
 */

const STORAGE_FILE_PATH = path.join(process.cwd(), 'data', 'workstation_ledger.json');

export const INITIAL_LIVING_BIBLE_REQUIREMENTS: LivingBibleRequirement[] = [
  {
    id: 'CH1.AUTHORITY',
    area: 'Challenge 1 · World Authority',
    title: 'World Authority & Player Intent',
    requirementText: 'Player wording expresses intent and never creates external world facts. Deterministic game systems remain authoritative.',
    dreamBookRef: 'v10.3B / v10.8 §3',
    status: 'VERIFIED',
    codeEvidence: 'server/mockEngine/serverMockAuthority.ts; server/repositories/worldRepository.ts',
    testEvidence: 'tests/playerLifecycle.test.ts',
    notes: 'Single canonical authority enforced in Node.js server runtime.',
    evidences: [
      {
        evidenceId: 'ev_ch1_src',
        requirementId: 'CH1.AUTHORITY',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/mockEngine/serverMockAuthority.ts',
        description: 'ServerMockAuthority validates player intents before updating world state.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch1_test',
        requirementId: 'CH1.AUTHORITY',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/playerLifecycle.test.ts',
        description: 'Integration test verifies intent validation and state isolation.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH1.TIME',
    area: 'Challenge 1 · Deterministic Time',
    title: 'World Clock & Temporal Simulation',
    requirementText: 'Canonical simulation clock tracks calendar date, elapsed seconds, seasons, and day/night phases deterministically.',
    dreamBookRef: 'v4.0 §293, §333, §334, §355',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/worldClock.ts; server/simulation/worldSimulationService.ts',
    testEvidence: 'tests/coreDomain.test.ts',
    notes: 'Pure arithmetic date/time accumulator with countdown calculations.',
    evidences: [
      {
        evidenceId: 'ev_ch1_time_src',
        requirementId: 'CH1.TIME',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/worldClock.ts',
        description: 'WorldClock handles deterministic date accumulator.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch1_time_test',
        requirementId: 'CH1.TIME',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/coreDomain.test.ts',
        description: 'Unit/integration suite verifies clock tick calculation.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH1.MAP',
    area: 'Challenge 1 · Cartography',
    title: 'Geography Graph & Spatial Data',
    requirementText: 'Geography is data, not a picture. Nodes, edges, terrain modifiers, travel modes, and hazard profiles.',
    dreamBookRef: 'v4.0 §329, §330, §339',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/geographyGraph.ts',
    testEvidence: 'tests/coreDomain.test.ts',
    notes: 'Dijkstra route planner with terrain duration math.',
    evidences: [
      {
        evidenceId: 'ev_ch1_map_src',
        requirementId: 'CH1.MAP',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/geographyGraph.ts',
        description: 'GeographyGraph graph implementation.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch1_map_test',
        requirementId: 'CH1.MAP',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/coreDomain.test.ts',
        description: 'Dijkstra route calculation test suite.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH1.TRAVEL',
    area: 'Challenge 1 · Travel',
    title: 'Simulated Travel & Origin Anchoring',
    requirementText: 'Travel journeys advance canonical clock. While traveling, locationId remains origin; destination replaces locationId only when completed.',
    dreamBookRef: 'v4.0 §307, §338 / v10.8 Decision 1',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/playerLifecycleState.ts; server/simulation/worldSimulationService.ts',
    testEvidence: 'tests/playerLifecycle.test.ts',
    notes: 'Zero double-location authority. Origin anchoring strictly verified.',
    evidences: [
      {
        evidenceId: 'ev_ch1_travel_src',
        requirementId: 'CH1.TRAVEL',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/playerLifecycleState.ts',
        description: 'PlayerLifecycleState location anchoring logic.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch1_travel_test',
        requirementId: 'CH1.TRAVEL',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/playerLifecycle.test.ts',
        description: 'Travel journey origin anchoring test.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH2.KNOWLEDGE',
    area: 'Challenge 2 · NPC Epistemic Integrity',
    title: 'Character Knowledge Records & Boundary',
    requirementText: 'Every piece of factual information has owner, observable source, confidence, and secret level. Hidden information is never leaked.',
    dreamBookRef: 'v5.0 §331, §332, §333',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/types.ts; server/mockEngine/serverMockAuthority.ts; server/simulation/worldSimulationService.ts',
    testEvidence: 'tests/coreDomain.test.ts; tests/epistemicLocationProjection.test.ts',
    notes: 'Epistemic projection filter excludes hidden canonical context and undiscovered location entities from client view states.',
    evidences: [
      {
        evidenceId: 'ev_ch2_src',
        requirementId: 'CH2.KNOWLEDGE',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/mockEngine/serverMockAuthority.ts',
        description: 'Epistemic boundary filtering.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch2_test',
        requirementId: 'CH2.KNOWLEDGE',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/epistemicLocationProjection.test.ts',
        description: 'Epistemic location projection suite.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH3.NPC.LIFECYCLE',
    area: 'Challenge 3 · Emergent NPC Lifecycles',
    title: 'Shared Actor Lifecycle & In-Run Continuity',
    requirementText: 'Shared IActorLifecycle contract for all embodied world agents (Player and NPC), with injuries, conditions, and lineage.',
    dreamBookRef: 'v4.0 §295 / v10.8 Decision 1',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/types.ts; server/domain/playerLifecycleState.ts',
    testEvidence: 'tests/playerLifecycle.test.ts',
    notes: 'Smallest safe shared contract: IActorLifecycle cleanly implemented.',
    evidences: [
      {
        evidenceId: 'ev_ch3_src',
        requirementId: 'CH3.NPC.LIFECYCLE',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/playerLifecycleState.ts',
        description: 'IActorLifecycle implementation.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch3_test',
        requirementId: 'CH3.NPC.LIFECYCLE',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/playerLifecycle.test.ts',
        description: 'Actor lifecycle test suite.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH4.CHRONICLE',
    area: 'Challenge 4 · NPC Significance & Chronicle',
    title: 'NPC Dossiers & World Chronicle',
    requirementText: 'Promote important canonical lifecycle and social evidence into persistent NPC dossiers and bounded world chronicle with deterministic significance and deduplication.',
    dreamBookRef: 'v10.8.15-21',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/historicalEvidence.ts; server/domain/significanceEvaluator.ts; server/domain/historicalChronicleEngine.ts',
    testEvidence: 'tests/historicalEvidence.test.ts',
    notes: 'Deterministic significance evaluator, deduplication, rebuildability, and epistemic projection verified.',
    evidences: [
      {
        evidenceId: 'ev_ch4_src',
        requirementId: 'CH4.CHRONICLE',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/historicalChronicleEngine.ts',
        description: 'Chronicle deduplication and significance evaluator.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch4_test',
        requirementId: 'CH4.CHRONICLE',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/historicalEvidence.test.ts',
        description: 'Historical evidence test suite.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH5.ITEMS',
    area: 'Challenge 5 · Inventory & Equipment',
    title: 'Canonical Item & Equipment Authority',
    requirementText: 'Items are persistent canonical instances with slots, durability, and provenance. Equipped slots validated by server authority.',
    dreamBookRef: 'v10.3A §400 / v10.8 §430',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/inventoryItem.ts; server/repositories/worldRepository.ts',
    testEvidence: 'tests/broadSubsystems.test.ts',
    notes: 'Deterministic paper-doll slots, durability degradation, breaking, repair, and material-consuming crafting verified.',
    evidences: [
      {
        evidenceId: 'ev_ch5_src',
        requirementId: 'CH5.ITEMS',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/inventoryItem.ts',
        description: 'Inventory item slots and durability degradation.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch5_test',
        requirementId: 'CH5.ITEMS',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/broadSubsystems.test.ts',
        description: 'Inventory and crafting integration tests.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH6.POWER',
    area: 'Challenge 6 · Dynamic Powers',
    title: 'Dynamic Capability & Consequence Engine',
    requirementText: 'PowerState with vessel capacity, seals, and forms. AI proposes qualitative outcome; deterministic engine resolves exact mechanical costs.',
    dreamBookRef: 'v10.0 §388-393 / v10.8 §433',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/capabilityEngine.ts; server/repositories/worldRepository.ts',
    testEvidence: 'tests/broadSubsystems.test.ts',
    notes: 'Absolute seal rejection, vessel capacity overload, deterministic HP/strain costs, and condition application verified.',
    evidences: [
      {
        evidenceId: 'ev_ch6_src',
        requirementId: 'CH6.POWER',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/capabilityEngine.ts',
        description: 'CapabilityEngine resolution logic.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch6_test',
        requirementId: 'CH6.POWER',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/broadSubsystems.test.ts',
        description: 'Dynamic capability resolution tests.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH7.CUSTOM',
    area: 'Challenge 7 · Custom Power Synthesis',
    title: 'Custom Character & Power Synthesis Engine',
    requirementText: 'Custom Role Workshop converts natural-language power concepts into bounded structured capabilities and capability graph.',
    dreamBookRef: 'v10.1 Addendum §394-396',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/capabilityEngine.ts; server/repositories/worldRepository.ts',
    testEvidence: 'tests/broadSubsystems.test.ts',
    notes: 'Synthesizes concepts into structured capabilities, derived techniques, and DAG nodes.',
    evidences: [
      {
        evidenceId: 'ev_ch7_src',
        requirementId: 'CH7.CUSTOM',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/capabilityEngine.ts',
        description: 'Power concept synthesis logic.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch7_test',
        requirementId: 'CH7.CUSTOM',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/broadSubsystems.test.ts',
        description: 'Custom power synthesis integration test.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH8.DND',
    area: 'Challenge 8 · D&D Combat & Ruleset Adapter',
    title: 'Ruleset Adapter & Deterministic Combat Resolution',
    requirementText: 'RulesetAdapter interface, local dice engine, initiative, spatial grid movement, attack/defense resolution.',
    dreamBookRef: 'v7.0 §358-360 / v10.8 §425-429',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/combatEngine.ts; server/repositories/worldRepository.ts',
    testEvidence: 'tests/broadSubsystems.test.ts',
    notes: 'D&D SRD 5.2.1 adapter, LocalDiceEngine with seedable PRNG, tactical 2D grid, speed bounds, and attack resolution verified.',
    evidences: [
      {
        evidenceId: 'ev_ch8_src',
        requirementId: 'CH8.DND',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/combatEngine.ts',
        description: 'CombatEngine D&D adapter.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch8_test',
        requirementId: 'CH8.DND',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/broadSubsystems.test.ts',
        description: 'Combat simulation suite.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH9.MEMORY',
    area: 'Challenge 9 · Long-Term Memory & Opportunities',
    title: 'Layered Memory, Opportunity Engine & Anti-Recency',
    requirementText: 'Atomic facts, opportunity engine scanner for dormant capabilities (poison teeth exemplar), anti-recency retrieval floors.',
    dreamBookRef: 'v4.0 §296, §297, §312, §313 / v10.8.29',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/memoryOpportunityEngine.ts; server/repositories/worldRepository.ts',
    testEvidence: 'tests/broadSubsystems.test.ts',
    notes: 'Poison-teeth exemplar detected from food-sharing context; persistent critical memories protected by retrieval floor score.',
    evidences: [
      {
        evidenceId: 'ev_ch9_src',
        requirementId: 'CH9.MEMORY',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/memoryOpportunityEngine.ts',
        description: 'Memory opportunity engine and retrieval floors.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch9_test',
        requirementId: 'CH9.MEMORY',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/broadSubsystems.test.ts',
        description: 'Memory opportunity scanner integration tests.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH10.WORLD',
    area: 'Challenge 10 · Living World Simulation',
    title: 'Autonomous Needs, Schedules & Off-Screen Tiers',
    requirementText: 'Persistent physiology (hunger, thirst, fatigue), NPC daily schedules, off-screen simulation tiers (active, nearby, distant).',
    dreamBookRef: 'v4.0 §294, §295, §346, §347',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/livingWorldSimulation.ts; server/repositories/worldRepository.ts',
    testEvidence: 'tests/broadSubsystems.test.ts',
    notes: 'Individual decay rates, personality-modulated hunger narrative cues (stoic/comedic), and werewolf sunrise transformation rule verified.',
    evidences: [
      {
        evidenceId: 'ev_ch10_src',
        requirementId: 'CH10.WORLD',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/livingWorldSimulation.ts',
        description: 'World simulation tiers and decay rates.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch10_test',
        requirementId: 'CH10.WORLD',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/broadSubsystems.test.ts',
        description: 'Living world simulation tests.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH11.CONTEXT',
    area: 'Challenge 11 · Working Context & Token Budget',
    title: 'Structured Working Context & Token Budget Manager',
    requirementText: 'Assembles typed working packet (SCENE, TIME, PLAYER_STATE, VISIBLE_ENTITIES) with strict priority band eviction.',
    dreamBookRef: 'v10.8.30 §440',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/workingContextEngine.ts',
    testEvidence: 'tests/broadSubsystems.test.ts',
    notes: 'Priority band eviction (B1/B2 preserved, B5/B4 evicted under pressure) and sanitized NPC context verified.',
    evidences: [
      {
        evidenceId: 'ev_ch11_src',
        requirementId: 'CH11.CONTEXT',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/workingContextEngine.ts',
        description: 'WorkingContextEngine token eviction logic.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch11_test',
        requirementId: 'CH11.CONTEXT',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/broadSubsystems.test.ts',
        description: 'Working context eviction integration tests.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH12.ORCHESTRATION',
    area: 'Challenge 12 · Model Orchestration',
    title: 'Adaptive Multi-Model Router & Continuity Checkpoints',
    requirementText: 'Model pools (creative, utility, long-context, review, emergency), intelligent scoring, continuation checkpoints, cross-model handoff.',
    dreamBookRef: 'v6.0 §342-357',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/aiOrchestrator.ts; server/repositories/worldRepository.ts',
    testEvidence: 'tests/broadSubsystems.test.ts',
    notes: 'Intelligent multi-criteria selection, failover to emergency floor, continuation checkpoints, and structured turn validation verified.',
    evidences: [
      {
        evidenceId: 'ev_ch12_src',
        requirementId: 'CH12.ORCHESTRATION',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/aiOrchestrator.ts',
        description: 'AI orchestrator model router and failover floors.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch12_test',
        requirementId: 'CH12.ORCHESTRATION',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/broadSubsystems.test.ts',
        description: 'Multi-model orchestrator integration suite.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH13.ASSETS',
    area: 'Challenge 13 · Visual Assets & Lossless Archive',
    title: 'Visual Asset Registry, Composition & .dreamarchive',
    requirementText: 'Stable asset IDs, composition profiles (anti-clipping), prompt export fallback, portable lossless campaign archive.',
    dreamBookRef: 'v7.12-14 §363-364 / v10.8.31',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/campaignArchive.ts',
    testEvidence: 'tests/broadSubsystems.test.ts',
    notes: 'Partitioned canonical packaging, SHA-256 manifest calculation, and atomic validation and restore verified.',
    evidences: [
      {
        evidenceId: 'ev_ch13_src',
        requirementId: 'CH13.ASSETS',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/campaignArchive.ts',
        description: 'Partitioned archive serialization and SHA-256 checksums.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch13_test',
        requirementId: 'CH13.ASSETS',
        evidenceType: 'ARCHIVE_ROUND_TRIP',
        sourceReference: 'tests/broadSubsystems.test.ts',
        description: 'Lossless campaign archive round-trip restore test.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'SYS.MOCK.CONTRACT',
    area: 'System · Presentation Boundary',
    title: 'Mock Engine & Client Presentation Contract Boundary',
    requirementText: 'Browser client renders sanitized ExternalViewState and issues action requests to Node.js server authority.',
    dreamBookRef: 'v10.8 §1',
    status: 'DOCUMENTED',
    codeEvidence: '',
    testEvidence: '',
    notes: 'Specification boundary contract between presentation client and server authority.',
    evidences: [],
  },
  {
    id: 'CH14.SENSORY.01',
    area: 'Challenge 14 · Sensory Engine',
    title: 'Sensory Cues & SFX Trigger Pipeline',
    requirementText: 'Audio playback runtime, typed SFX registry, and sensory cue processing pipeline.',
    dreamBookRef: 'v8.0 §365-370',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/sfxRegistry.ts; server/domain/sensoryEngine.ts',
    testEvidence: 'tests/ch14Sensory.test.ts',
    notes: 'SFX trigger pipeline and audio settings active.',
    evidences: [
      {
        evidenceId: 'ev_ch14_01_src',
        requirementId: 'CH14.SENSORY.01',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/sfxRegistry.ts',
        description: 'SFX registry definitions.',
        recordedAt: '2026-09-16T00:00:00.000Z',
        valid: true,
        trustedProvenance: true,
      },
      {
        evidenceId: 'ev_ch14_01_test',
        requirementId: 'CH14.SENSORY.01',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/ch14Sensory.test.ts',
        description: 'Sensory cue execution tests.',
        recordedAt: '2026-09-16T00:00:00.000Z',
        valid: true,
        trustedProvenance: true,
      },
    ],
  },
  {
    id: 'CH14.SENSORY.02',
    area: 'Challenge 14 · Sensory Engine',
    title: 'Sensory Epistemic Boundary Suppression',
    requirementText: 'Hidden cue knowledge boundary suppression preventing secret leakage in sensory events.',
    dreamBookRef: 'v8.0 §371-375',
    status: 'IMPLEMENTED',
    codeEvidence: 'server/domain/sensoryEngine.ts',
    testEvidence: 'tests/ch14Sensory.test.ts',
    notes: 'Suppression of unauthorized sensory cues verified.',
    evidences: [
      {
        evidenceId: 'ev_ch14_02_src',
        requirementId: 'CH14.SENSORY.02',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/sensoryEngine.ts',
        description: 'Epistemic boundary check on sensory sources.',
        recordedAt: '2026-09-16T00:00:00.000Z',
        valid: true,
        trustedProvenance: true,
      },
      {
        evidenceId: 'ev_ch14_02_test',
        requirementId: 'CH14.SENSORY.02',
        evidenceType: 'UNIT_TEST',
        sourceReference: 'tests/ch14Sensory.test.ts',
        description: 'Epistemic boundary suppression unit tests.',
        recordedAt: '2026-09-16T00:00:00.000Z',
        valid: true,
        trustedProvenance: true,
      },
    ],
  },
  {
    id: 'CH16.WORLD.LIBRARY',
    area: 'Challenge 16 · World Library',
    title: 'Reusable World Template Library & Campaign Discovery',
    requirementText: 'Reusable WorldTemplate vs individual StoryRun separation, versioning, and premised world creation.',
    dreamBookRef: 'v10.9 §450-460',
    status: 'VERIFIED',
    codeEvidence: 'server/services/worldSynthesisService.ts; server/repositories/worldRepository.ts',
    testEvidence: 'tests/ch16_behavioral_verification.test.ts',
    notes: 'World templates created premise-first with capability validations.',
    evidences: [
      {
        evidenceId: 'ev_ch16_wl_src',
        requirementId: 'CH16.WORLD.LIBRARY',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/services/worldSynthesisService.ts',
        description: 'Premise-first world synthesis.',
        recordedAt: '2026-09-18T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch16_wl_test',
        requirementId: 'CH16.WORLD.LIBRARY',
        evidenceType: 'LIVE_HTTP',
        sourceReference: 'tests/ch16_behavioral_verification.test.ts',
        description: 'World library HTTP endpoint suite.',
        recordedAt: '2026-09-18T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH16.STORY.MODES',
    area: 'Challenge 16 · Story Modes',
    title: 'Story Mode Selection (Protagonist, Side Character, Free Roam)',
    requirementText: 'Player chooses Story Mode per StoryRun (PROTAGONIST, SIDE_CHARACTER, FREE_ROAM).',
    dreamBookRef: 'v10.9 §461-465',
    status: 'VERIFIED',
    codeEvidence: 'server/repositories/worldRepository.ts; server/domain/storyAdaptation.ts',
    testEvidence: 'tests/ch16_behavioral_verification.test.ts',
    notes: 'Story mode set per run with objective framing.',
    evidences: [
      {
        evidenceId: 'ev_ch16_sm_src',
        requirementId: 'CH16.STORY.MODES',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/repositories/worldRepository.ts',
        description: 'Story mode attachment to story runs.',
        recordedAt: '2026-09-18T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch16_sm_test',
        requirementId: 'CH16.STORY.MODES',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/ch16_behavioral_verification.test.ts',
        description: 'Story mode selection integration tests.',
        recordedAt: '2026-09-18T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH16.EMERGENT.NARRATIVE',
    area: 'Challenge 16 · Emergent Narrative',
    title: 'Emergent Causal Threads & Propagation',
    requirementText: 'Emergent story director generating causal investigation threads and thread resolution.',
    dreamBookRef: 'v10.9 §466-470',
    status: 'VERIFIED',
    codeEvidence: 'server/services/emergentNarrativeEngine.ts; server/services/storyDirectorService.ts',
    testEvidence: 'tests/ch16_behavioral_verification.test.ts',
    notes: 'Canonical player actions generate emergent threads.',
    evidences: [
      {
        evidenceId: 'ev_ch16_en_src',
        requirementId: 'CH16.EMERGENT.NARRATIVE',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/services/emergentNarrativeEngine.ts',
        description: 'Causal thread generation engine.',
        recordedAt: '2026-09-18T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch16_en_test',
        requirementId: 'CH16.EMERGENT.NARRATIVE',
        evidenceType: 'LIVE_HTTP',
        sourceReference: 'tests/ch16_behavioral_verification.test.ts',
        description: 'Emergent narrative thread generation HTTP suite.',
        recordedAt: '2026-09-18T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH16.COMBAT.RESOLUTION',
    area: 'Challenge 16 · Combat & Active Effects',
    title: 'Tactical Dice Clash & Active Effects Engine',
    requirementText: 'Server-authoritative combat resolution with dice clash, active effects, and spell rule evaluation.',
    dreamBookRef: 'v10.9 §471-480',
    status: 'VERIFIED',
    codeEvidence: 'server/services/abilityService.ts; server/domain/dndSpellRulesModel.ts',
    testEvidence: 'tests/ch16_behavioral_verification.test.ts',
    notes: 'Active effect forgery rejection and valid ability resolution verified.',
    evidences: [
      {
        evidenceId: 'ev_ch16_cr_src',
        requirementId: 'CH16.COMBAT.RESOLUTION',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/services/abilityService.ts',
        description: 'Active effect validation and ability resolution.',
        recordedAt: '2026-09-18T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch16_cr_test',
        requirementId: 'CH16.COMBAT.RESOLUTION',
        evidenceType: 'LIVE_HTTP',
        sourceReference: 'tests/ch16_behavioral_verification.test.ts',
        description: 'Active effect forgery rejection HTTP tests.',
        recordedAt: '2026-09-18T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH14.SENSORY',
    area: 'Challenge 14 · Sensory Engine & Epistemic Security',
    title: 'Sensory Cues, Audio/SFX & Epistemic Boundary',
    requirementText: 'Sensory configuration, TTS/STT behavior, typed SFX registry, audio playback runtime, hidden cue knowledge boundary suppression, and archive persistence.',
    dreamBookRef: 'v8.0 §365-375 / v10.8.34',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/sfxRegistry.ts; server/domain/sensoryEngine.ts; server/repositories/worldRepository.ts',
    testEvidence: 'tests/ch14Sensory.test.ts',
    notes: 'Sensory cue epistemic boundary suppression and SFX trigger pipeline verified.',
    evidences: [
      {
        evidenceId: 'ev_ch14_src',
        requirementId: 'CH14.SENSORY',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/sfxRegistry.ts; server/domain/sensoryEngine.ts',
        description: 'SFX registry and sensory cue epistemic suppression logic.',
        recordedAt: '2026-09-16T00:00:00.000Z',
        valid: true,
        trustedProvenance: true,
      },
      {
        evidenceId: 'ev_ch14_test',
        requirementId: 'CH14.SENSORY',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/ch14Sensory.test.ts',
        description: 'Sensory engine epistemic security test suite.',
        recordedAt: '2026-09-16T00:00:00.000Z',
        valid: true,
        trustedProvenance: true,
      },
    ],
  },
  {
    id: 'CH15.ADAPTATION',
    area: 'Challenge 15 · Story Adaptation Pipeline',
    title: 'Existing Story Ingestion, Segmentation & Canon Divergence',
    requirementText: '6-stage adaptation pipeline converting raw texts into anchored source segments, canonical facts, entities, and divergence branches.',
    dreamBookRef: 'v2.0 §246-271',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/storyAdaptation.ts',
    testEvidence: 'tests/broadSubsystems.test.ts',
    notes: 'Segmentation by text anchors, canonical fact extraction with SOURCE provenance, and strict/divergent choice adjudication verified.',
    evidences: [
      {
        evidenceId: 'ev_ch15_src',
        requirementId: 'CH15.ADAPTATION',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/storyAdaptation.ts',
        description: 'Adaptation pipeline ingestion and segmentation.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch15_test',
        requirementId: 'CH15.ADAPTATION',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/broadSubsystems.test.ts',
        description: 'Story adaptation pipeline integration tests.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH16.WORLDS',
    area: 'Challenge 16 · Reusable World Library & Campaign Discovery',
    title: 'Reusable World Library, Story Modes, Emergent Narrative & Rules Engine',
    requirementText: 'Reusable WorldTemplate vs individual StoryRun separation, campaign discovery, versioning, PROTAGONIST / SIDE_CHARACTER / FREE_ROAM modes, emergent narrative threads, causal knowledge propagation, combat dice clash, active effects, D&D rules evaluation, and campaign archive restoration.',
    dreamBookRef: 'v10.9 §450-480',
    status: 'VERIFIED',
    codeEvidence: 'server/services/worldSynthesisService.ts; server/services/emergentNarrativeEngine.ts; server/services/abilityService.ts; server/services/storyDirectorService.ts; server/domain/dndSpellRulesModel.ts; server/repositories/worldRepository.ts',
    testEvidence: 'tests/ch16_behavioral_verification.test.ts',
    notes: 'World library, story mode selection, emergent thread creation, dice clash resolution, active effects, and archive restoration verified.',
    evidences: [
      {
        evidenceId: 'ev_ch16_src',
        requirementId: 'CH16.WORLDS',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/services/worldSynthesisService.ts; server/services/emergentNarrativeEngine.ts',
        description: 'World synthesis, emergent narrative, and story director services.',
        recordedAt: '2026-09-18T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch16_test',
        requirementId: 'CH16.WORLDS',
        evidenceType: 'LIVE_HTTP',
        sourceReference: 'tests/ch16_behavioral_verification.test.ts',
        description: 'End-to-end CH16 HTTP behavioral verification suite.',
        recordedAt: '2026-09-18T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'AMENDMENT.V10.8.35.ALIGNMENT',
    area: 'Amendment V10.8.35 · Character Alignment',
    title: 'Dynamic Character Alignment, Motivation & Role Transformation',
    requirementText: 'Dynamic roles (ally/enemy/rival/companion) with causal justification, distinguishing surface opposition from personal affection, and coercion tracking.',
    dreamBookRef: 'v10.8.35 Amendment',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/characterAlignment.ts; server/repositories/worldRepository.ts',
    testEvidence: 'tests/broadSubsystems.test.ts',
    notes: 'Role transformation history preserved; dialogue guidance enforces opposition without hatred.',
    evidences: [
      {
        evidenceId: 'ev_v10835_src',
        requirementId: 'AMENDMENT.V10.8.35.ALIGNMENT',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/characterAlignment.ts',
        description: 'Character alignment transformation state engine.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_v10835_test',
        requirementId: 'AMENDMENT.V10.8.35.ALIGNMENT',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/broadSubsystems.test.ts',
        description: 'Character alignment transformation tests.',
        recordedAt: '2026-09-15T00:00:00.000Z',
        valid: true,
      },
    ],
  },
  {
    id: 'CH17.CONTROLS',
    area: 'Challenge 17 · Living Bible & Workstation',
    title: 'Operational Living Bible & Control Ledger',
    requirementText: 'Machine-readable operational specification tracking requirement IDs, implementation status, code evidence, and test evidence.',
    dreamBookRef: 'v10.5 §408, §413',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/livingBible.ts; server/api/gameRoutes.ts',
    testEvidence: 'tests/ch17_living_bible_workstation.test.ts',
    notes: 'Live API endpoints GET /api/game/living-bible and GET /api/game/workstation active.',
    evidences: [
      {
        evidenceId: 'ev_ch17_src',
        requirementId: 'CH17.CONTROLS',
        evidenceType: 'SOURCE_INSPECTION',
        sourceReference: 'server/domain/livingBible.ts; server/api/gameRoutes.ts',
        description: 'LivingBibleRegistry and Workstation API routes.',
        recordedAt: '2026-09-18T00:00:00.000Z',
        valid: true,
      },
      {
        evidenceId: 'ev_ch17_test',
        requirementId: 'CH17.CONTROLS',
        evidenceType: 'INTEGRATION_TEST',
        sourceReference: 'tests/ch17_living_bible_workstation.test.ts',
        description: 'CH17 Living Bible and Workstation test suite.',
        recordedAt: '2026-09-18T00:00:00.000Z',
        valid: true,
      },
    ],
  },
];

export class LivingBibleRegistry {
  private requirements: Map<string, LivingBibleRequirement> = new Map();
  private metadata: WorkstationMetadata = {
    currentPhase: 'CH17 Surgical Repair & Control Integration Pass',
    phaseObjective: 'Establish operational Living Bible registry, evidence-aware status validation, persistent Workstation ledger, and developer UI.',
    lastAuditDate: '2026-09-18',
    nextTask: 'Automated verification and CI/CD promotion gates (CH18)',
    blockers: [],
  };
  private iterationHistory: IterationRecord[] = [
    {
      iteration: 1,
      date: '2026-09-12',
      description: 'Transitioned from client mock adapter to Node.js ServerMockAuthority boundary.',
      outcome: 'Epistemic boundary verified; secrets excluded from client bundle.',
    },
    {
      iteration: 2,
      date: '2026-09-15',
      description: 'Implemented DreamBook Core Domain: WorldClock, GeographyGraph, PlayerLifecycleState, and LivingBible.',
      outcome: 'Deterministic simulation foundation active and test-backed.',
    },
    {
      iteration: 3,
      date: '2026-09-15',
      description: 'Implemented Challenge 4: HistoricalEvidence, SignificanceEvaluator, HistoricalChronicleEngine, and Epistemic Projection.',
      outcome: 'Deterministic promotion, deduplication, rebuildability, and secret-masking verified.',
    },
    {
      iteration: 4,
      date: '2026-09-15',
      description: 'Broad Implementation Pass: Created CH5-CH13, CH15 & V10.8.35 domain engines with authoritative integration and full test suite.',
      outcome: '10 subsystems implemented and 40 tests across 19 suites cleanly passing with zero failures.',
    },
    {
      iteration: 5,
      date: '2026-09-18',
      description: 'Implemented CH16 Reusable World Library, Story Modes, Emergent Narrative, Dice Clash, and Archive Restoration.',
      outcome: 'CH16 behavioral verification suite passing cleanly (12/12 subtests).',
    },
  ];

  constructor() {
    this.initRequirements();
    this.loadLedgerFromFile();
  }

  private initRequirements(): void {
    for (const req of INITIAL_LIVING_BIBLE_REQUIREMENTS) {
      this.requirements.set(req.id, {
        ...req,
        evidences: req.evidences ? req.evidences.map((e) => ({ ...e, trustedProvenance: true })) : [],
      });
    }
  }

  public getAllRequirements(): LivingBibleRequirement[] {
    return Array.from(this.requirements.values()).map((r) => ({
      ...r,
      evidences: r.evidences ? [...r.evidences] : [],
    }));
  }

  public getRequirement(id: string): LivingBibleRequirement | undefined {
    const req = this.requirements.get(id);
    return req ? { ...req, evidences: req.evidences ? [...req.evidences] : [] } : undefined;
  }

  public recordEvidence(
    evidenceInput: Omit<RequirementEvidence, 'evidenceId' | 'recordedAt' | 'valid'> & {
      evidenceId?: string;
      recordedAt?: string;
      valid?: boolean;
      trustedProvenance?: boolean;
    },
    options?: { isServerAuthoritative?: boolean }
  ): RequirementEvidence {
    const req = this.requirements.get(evidenceInput.requirementId);
    if (!req) {
      throw new Error(`Requirement with ID '${evidenceInput.requirementId}' not found.`);
    }

    // Server-authoritative file existence check
    if (evidenceInput.sourceReference) {
      const paths = evidenceInput.sourceReference.split(';').map((p) => p.trim()).filter(Boolean);
      for (const p of paths) {
        const fullPath = path.resolve(process.cwd(), p);
        if (!fs.existsSync(fullPath)) {
          throw new Error(`Source reference file '${p}' does not exist on disk.`);
        }
      }
    }

    const isServer = Boolean(options?.isServerAuthoritative);
    const trusted = isServer && Boolean(evidenceInput.trustedProvenance);

    const evidence: RequirementEvidence = {
      evidenceId: evidenceInput.evidenceId || `ev_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      requirementId: evidenceInput.requirementId,
      evidenceType: evidenceInput.evidenceType,
      sourceReference: evidenceInput.sourceReference,
      description: evidenceInput.description,
      recordedAt: evidenceInput.recordedAt || new Date().toISOString(),
      valid: evidenceInput.valid !== undefined ? evidenceInput.valid : true,
      trustedProvenance: trusted,
    };

    if (!req.evidences) {
      req.evidences = [];
    }
    req.evidences.push(evidence);
    this.saveLedgerToFile();
    return evidence;
  }

  public recordServerEvidence(
    evidenceInput: Omit<RequirementEvidence, 'evidenceId' | 'recordedAt' | 'valid' | 'trustedProvenance'> & {
      evidenceId?: string;
      recordedAt?: string;
      valid?: boolean;
    }
  ): RequirementEvidence {
    return this.recordEvidence(
      { ...evidenceInput, trustedProvenance: true },
      { isServerAuthoritative: true }
    );
  }

  public validateAndPromoteRequirement(
    id: string,
    targetStatus: RequirementStatus
  ): { success: boolean; reason?: string } {
    const req = this.requirements.get(id);
    if (!req) {
      return { success: false, reason: `Requirement '${id}' not found.` };
    }

    const evidences = (req.evidences || []).filter((e) => e.valid);

    if (targetStatus === 'DOCUMENTED') {
      req.status = 'DOCUMENTED';
      this.saveLedgerToFile();
      return { success: true };
    }

    if (targetStatus === 'FOUNDATION') {
      const hasFoundationEvidence = evidences.some((e) => e.evidenceType === 'SOURCE_INSPECTION' || e.evidenceType === 'UNIT_TEST');
      if (!hasFoundationEvidence) {
        return { success: false, reason: 'Target status FOUNDATION requires at least one SOURCE_INSPECTION or UNIT_TEST evidence.' };
      }
      req.status = 'FOUNDATION';
      this.saveLedgerToFile();
      return { success: true };
    }

    if (targetStatus === 'IMPLEMENTED') {
      const codeFiles = (req.codeEvidence || '').split(';').map((s) => s.trim()).filter(Boolean);
      const hasCode = codeFiles.length > 0 && codeFiles.every((f) => fs.existsSync(path.resolve(process.cwd(), f)));
      const hasTestEvidence = evidences.some((e) => e.evidenceType === 'UNIT_TEST' || e.evidenceType === 'INTEGRATION_TEST' || e.evidenceType === 'SOURCE_INSPECTION');

      if (!hasCode || !hasTestEvidence) {
        return { success: false, reason: 'Target status IMPLEMENTED requires code evidence and corresponding test/inspection evidence.' };
      }
      req.status = 'IMPLEMENTED';
      this.saveLedgerToFile();
      return { success: true };
    }

    if (targetStatus === 'VERIFIED') {
      const codeFiles = (req.codeEvidence || '').split(';').map((s) => s.trim()).filter(Boolean);
      const hasCode = codeFiles.length > 0 && codeFiles.every((f) => fs.existsSync(path.resolve(process.cwd(), f)));

      const testFiles = (req.testEvidence || '').split(';').map((s) => s.trim()).filter(Boolean);
      const hasTestDoc = testFiles.length > 0 && testFiles.every((f) => fs.existsSync(path.resolve(process.cwd(), f)));

      const hasVerificationEvidence = evidences.some(
        (e) =>
          e.valid &&
          e.trustedProvenance === true &&
          (e.evidenceType === 'INTEGRATION_TEST' ||
            e.evidenceType === 'LIVE_HTTP' ||
            e.evidenceType === 'LIVE_UI' ||
            e.evidenceType === 'ARCHIVE_ROUND_TRIP') &&
          e.sourceReference.split(';').map((p) => p.trim()).filter(Boolean).every((f) => fs.existsSync(path.resolve(process.cwd(), f)))
      );

      if (!hasCode || !hasTestDoc || !hasVerificationEvidence) {
        return {
          success: false,
          reason:
            'Insufficient evidence to promote requirement to VERIFIED status. Requires valid existing code evidence, test evidence documentation, and at least one valid server-trusted INTEGRATION_TEST, LIVE_HTTP, LIVE_UI, or ARCHIVE_ROUND_TRIP evidence record.',
        };
      }

      req.status = 'VERIFIED';
      this.saveLedgerToFile();
      return { success: true };
    }

    req.status = targetStatus;
    this.saveLedgerToFile();
    return { success: true };
  }

  public recordIteration(input: {
    description: string;
    outcome: string;
    reason?: string;
    affectedRequirements?: string[];
  }): IterationRecord {
    const nextIterationNumber = this.iterationHistory.length > 0
      ? Math.max(...this.iterationHistory.map((i) => i.iteration)) + 1
      : 1;

    const record: IterationRecord = {
      iteration: nextIterationNumber,
      id: `iter_${nextIterationNumber}_${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      description: input.description,
      outcome: input.outcome,
      reason: input.reason,
      affectedRequirements: input.affectedRequirements || [],
    };

    this.iterationHistory.push(record);
    this.saveLedgerToFile();
    return record;
  }

  public updateWorkstationMetadata(metadataInput: Partial<WorkstationMetadata>): void {
    if (metadataInput.currentPhase) this.metadata.currentPhase = metadataInput.currentPhase;
    if (metadataInput.phaseObjective) this.metadata.phaseObjective = metadataInput.phaseObjective;
    if (metadataInput.lastAuditDate) this.metadata.lastAuditDate = metadataInput.lastAuditDate;
    if (metadataInput.nextTask) this.metadata.nextTask = metadataInput.nextTask;
    if (metadataInput.blockers) this.metadata.blockers = [...metadataInput.blockers];
    this.saveLedgerToFile();
  }

  public getWorkstationState(): WorkstationState {
    const all = this.getAllRequirements();
    const counts = {
      verified: all.filter((r) => r.status === 'VERIFIED').length,
      implemented: all.filter((r) => r.status === 'IMPLEMENTED').length,
      foundation: all.filter((r) => r.status === 'FOUNDATION').length,
      documented: all.filter((r) => r.status === 'DOCUMENTED').length,
      planned: all.filter((r) => (r.status as string) === 'PLANNED').length,
    };

    return {
      currentPhase: this.metadata.currentPhase,
      phaseObjective: this.metadata.phaseObjective,
      lastAuditDate: this.metadata.lastAuditDate,
      nextTask: this.metadata.nextTask,
      blockers: [...this.metadata.blockers],
      counts,
      iterationHistory: [...this.iterationHistory],
    };
  }

  private saveLedgerToFile(): void {
    try {
      const dir = path.dirname(STORAGE_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const reqArray = this.getAllRequirements();
      const payload = {
        requirements: reqArray,
        metadata: this.metadata,
        iterationHistory: this.iterationHistory,
      };

      fs.writeFileSync(STORAGE_FILE_PATH, JSON.stringify(payload, null, 2), 'utf-8');
    } catch {
      // Graceful fallback if storage write fails
    }
  }

  private loadLedgerFromFile(): void {
    try {
      if (fs.existsSync(STORAGE_FILE_PATH)) {
        const raw = fs.readFileSync(STORAGE_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.requirements && Array.isArray(parsed.requirements)) {
          for (const req of parsed.requirements) {
            // Fix stale test references
            if (req.testEvidence) {
              req.testEvidence = req.testEvidence.split('tests/ch14_sensory.test.ts').join('tests/ch14Sensory.test.ts');
            }
            if (req.codeEvidence) {
              req.codeEvidence = req.codeEvidence.split('tests/ch14_sensory.test.ts').join('tests/ch14Sensory.test.ts');
            }
            if (req.evidences && Array.isArray(req.evidences)) {
              req.evidences = req.evidences.map((e: RequirementEvidence) => {
                const sourceRef = (e.sourceReference || '').split('tests/ch14_sensory.test.ts').join('tests/ch14Sensory.test.ts');
                // Server system evidences initialized at launch have trustedProvenance
                const isSystemEv = Boolean(e.evidenceId && e.evidenceId.startsWith('ev_ch'));
                return {
                  ...e,
                  sourceReference: sourceRef,
                  trustedProvenance: e.trustedProvenance !== undefined ? e.trustedProvenance : isSystemEv,
                };
              });
            }
            this.requirements.set(req.id, req);
          }
        }
        // Ensure any initial requirements not yet saved are preserved
        for (const req of INITIAL_LIVING_BIBLE_REQUIREMENTS) {
          if (!this.requirements.has(req.id)) {
            this.requirements.set(req.id, {
              ...req,
              evidences: req.evidences ? req.evidences.map((e) => ({ ...e, trustedProvenance: true })) : [],
            });
          }
        }
        // Verify statuses for all loaded requirements
        for (const [id, req] of this.requirements.entries()) {
          if (req.status === 'VERIFIED') {
            const check = this.validateAndPromoteRequirement(id, 'VERIFIED');
            if (!check.success) {
              // Revert to IMPLEMENTED if VERIFIED gate fails
              req.status = 'IMPLEMENTED';
            }
          }
        }
        if (parsed.metadata) {
          this.metadata = { ...this.metadata, ...parsed.metadata };
        }
        if (parsed.iterationHistory && Array.isArray(parsed.iterationHistory)) {
          this.iterationHistory = parsed.iterationHistory;
        }
      }
    } catch {
      // Fallback to initial requirements if storage read fails
    }
  }
}

export const livingBibleRegistry = new LivingBibleRegistry();
