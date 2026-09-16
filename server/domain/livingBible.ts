import { LivingBibleRequirement, WorkstationState } from './types';

/**
 * LIVING BIBLE & WORKSTATION REGISTRY
 * In-app operational representation of the DreamBook v10.8 specification
 * (DreamBook §406, §408, §412-§420)
 */

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
  },
  {
    id: 'CH17.CONTROLS',
    area: 'Challenge 17 · Living Bible & Workstation',
    title: 'Operational Living Bible & Control Ledger',
    requirementText: 'Machine-readable operational specification tracking requirement IDs, implementation status, code evidence, and test evidence.',
    dreamBookRef: 'v10.5 §408, §413',
    status: 'VERIFIED',
    codeEvidence: 'server/domain/livingBible.ts; server/api/gameRoutes.ts',
    testEvidence: 'tests/coreDomain.test.ts',
    notes: 'Live API endpoint GET /api/game/living-bible active.',
  },
];

export class LivingBibleRegistry {
  private requirements: Map<string, LivingBibleRequirement> = new Map();

  constructor() {
    for (const req of INITIAL_LIVING_BIBLE_REQUIREMENTS) {
      this.requirements.set(req.id, { ...req });
    }
  }

  public getAllRequirements(): LivingBibleRequirement[] {
    return Array.from(this.requirements.values()).map((r) => ({ ...r }));
  }

  public getRequirement(id: string): LivingBibleRequirement | undefined {
    const req = this.requirements.get(id);
    return req ? { ...req } : undefined;
  }

  public updateRequirementStatus(
    id: string,
    status: LivingBibleRequirement['status'],
    codeEvidence?: string,
    testEvidence?: string
  ): void {
    const req = this.requirements.get(id);
    if (req) {
      req.status = status;
      if (codeEvidence) req.codeEvidence = codeEvidence;
      if (testEvidence) req.testEvidence = testEvidence;
    }
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
      currentPhase: 'Broad Implementation Pass · Deep Dreamville Core Subsystems',
      phaseObjective: 'Implement and verify core domain engines across Inventory/Crafting, Capability/Consequence, Combat/Ruleset, Memory/Opportunities, Living World, Context Budgeting, AI Orchestration, Archive Portability, Story Adaptation, and Character Alignment',
      lastAuditDate: '2026-09-15',
      nextTask: 'Integrated Narrative Loop & Frontend Workstation Telemetry Integration',
      blockers: [],
      counts,
      iterationHistory: [
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
      ],
    };
  }
}

export const livingBibleRegistry = new LivingBibleRegistry();
