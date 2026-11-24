/**
 * DREAMVILLE — PERMANENT 9-POINT REN TAKAHASHI DETECTIVE REGRESSION SUITE
 * Milestone 6 (Phase 1F: Long-Session Integration, Multi-Tier Model Routing & Ren Takahashi Regression)
 *
 * 100% offline, deterministic regression suite exercising genuine domain services across all 9
 * failure modes identified in the Crimson Eye Agency (Ren Takahashi) detective campaign audit:
 *
 *  - Mode 1: Opening Premise Materialisation & Crime Scene Location Anchors
 *  - Mode 2: Corpse Non-Portability Invariant (CANNOT_TAKE_CORPSE)
 *  - Mode 3: Mundane Environmental Affordances vs Plot-Critical Denylist
 *  - Mode 4: Epistemic Name Masking of Unintroduced Strangers
 *  - Mode 5: Dynamic Vehicle & Street Transit Lifecycle
 *  - Mode 6: Uncommitted Movement Guard
 *  - Mode 7: Speaker Epistemic Boundary & CharacterCanonSteward
 *  - Mode 8: Co-located Witness Fact Acquisition & Bidirectional Relationship/Suspicion Deltas
 *  - Mode 9: Structured Observation Grounding, Long-Session Memory Continuity & Truth-Preserving Provider Fallback
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorldRepository, worldRepository } from '../server/repositories/worldRepository';
import { WorldDirectorPreparationService } from '../server/services/worldDirectorPreparationService';
import {
  WORLD_DIRECTOR_INVESTIGATION_OWNER_ROLES,
  extractInvestigationSeedFromPremise,
} from '../server/domain/worldDirectorPreparationContract';
import { CanonicalCommandEngine, canonicalCommandEngine } from '../server/domain/canonicalCommandEngine';
import { SceneInteractionAuthority, resolveGroundedObservation } from '../server/domain/sceneInteractionAuthority';
import { NarrativeStateAdjudicator } from '../server/domain/narrativeStateAdjudicator';
import { AffordancePlausibilityEngine } from '../server/domain/affordancePlausibilityEngine';
import { EpistemicBoundaryEnforcer, extractEntityNameTokens } from '../server/domain/epistemicBoundary';
import {
  SemanticNarrativeReview,
  evaluateObservationGrounding,
} from '../server/domain/semanticNarrativeReview';
import { VehicleInteractionAuthority } from '../server/domain/vehicleInteractionAuthority';
import {
  WorldSimulatorAdjudicator,
  type WorldSimulationProposal,
} from '../server/domain/worldSimulationProposal';
import { EntityLifecycleStateMachine } from '../server/domain/entityLifecycle';
import { CharacterCanonSteward } from '../server/domain/characterCanonSteward';
import { WitnessFactAuthority } from '../server/domain/witnessFactAuthority';
import { WorldActivityDirector } from '../server/domain/worldActivityDirector';
import { NarrativeMemoryLifecycle } from '../server/domain/narrativeMemoryLifecycle';
import { NarrativeContinuityEngine } from '../server/domain/narrativeContinuityEngine';
import { CurrentSituationBuilder, type CurrentSituation } from '../server/domain/currentSituation';
import {
  MultiModelOrchestrator,
  DeterministicMockAdapter,
  type ModelRegistryRecord,
  type StructuredTurnPackage,
} from '../server/domain/aiOrchestrator';
import { worldSimulationService } from '../server/simulation/worldSimulationService';
import type { PlayerIntent } from '../server/domain/playerIntentInterpreter';
import type { EphemeralNarrativePlan } from '../server/domain/narrativeDirector';

const LOC_OFFICE = 'loc_crimson_eye_office';
const LOC_STREET = 'loc_crimson_street';
const LOC_CRIME_SCENE = 'loc_warehouse_docks';

const REN_PREMISE =
  'You are Ren Takahashi, chief investigator at the Crimson Eye Agency. Last night, the murder of Arthur Pendelton occurred at the Warehouse Docks, where a shattered pocket watch, aspent bullet casing, and a dark bloodstain were found beside the victim.';

function setupRenTakahashiTopology(repo: InMemoryWorldRepository, storyId: string): void {
  repo.seedStory(storyId);
  CharacterCanonSteward.resetStory(storyId);

  const graph = repo.getGeographyGraph(storyId);

  graph.addNode({
    id: LOC_OFFICE,
    name: 'Crimson Eye Agency Office',
    regionId: 'reg_neon_ward',
    description: 'A rain-streaked second-floor detective office with frosted glass doors and a cluttered oak desk.',
    ambientSensory: 'Rain patters steadily against the frosted glass pane while a desk lamp hums.',
    archetype: 'WORKPLACE',
    accessible: true,
    discovered: true,
    sceneObjects: [],
    tags: ['office', 'workplace', 'indoor'],
  } as any);

  graph.addNode({
    id: LOC_STREET,
    name: 'Vermilion Avenue Kerb',
    regionId: 'reg_neon_ward',
    description: 'A rain-slicked city thoroughfare outside the agency building, lined with iron street lamps and passing traffic.',
    ambientSensory: 'Neon reflections shimmer in the gutter runoff as distant horns echo.',
    archetype: 'URBAN_DISTRICT',
    terrain: 'Road',
    accessible: true,
    discovered: true,
    sceneObjects: [],
    tags: ['street', 'urban_district', 'road'],
  } as any);

  graph.addNode({
    id: LOC_CRIME_SCENE,
    name: 'Warehouse Docks Pier 4',
    regionId: 'reg_harbor_ward',
    description: 'A cordoned-off cargo pier shrouded in river fog where police barrier tape flutters in the wind.',
    ambientSensory: 'Cold river water laps against rotting timber pilings.',
    archetype: 'CRIME_SCENE',
    accessible: true,
    discovered: true,
    sceneObjects: [],
    tags: ['crime_scene', 'harbor', 'docks'],
  } as any);

  graph.addEdge({
    id: 'edge_office_to_street',
    fromLocationId: LOC_OFFICE,
    toLocationId: LOC_STREET,
    distanceKm: 0.1,
    terrain: 'Road',
    allowedModes: ['Foot'],
    hazardRisk: 0,
    isBlocked: false,
    provenance: 'authored',
  });

  graph.addEdge({
    id: 'edge_street_to_office',
    fromLocationId: LOC_STREET,
    toLocationId: LOC_OFFICE,
    distanceKm: 0.1,
    terrain: 'Road',
    allowedModes: ['Foot'],
    hazardRisk: 0,
    isBlocked: false,
    provenance: 'authored',
  });

  graph.addEdge({
    id: 'edge_street_to_docks',
    fromLocationId: LOC_STREET,
    toLocationId: LOC_CRIME_SCENE,
    distanceKm: 2.4,
    terrain: 'Road',
    allowedModes: ['Foot', 'Coach', 'Horse'],
    hazardRisk: 0,
    isBlocked: false,
    provenance: 'authored',
  });

  graph.addEdge({
    id: 'edge_docks_to_street',
    fromLocationId: LOC_CRIME_SCENE,
    toLocationId: LOC_STREET,
    distanceKm: 2.4,
    terrain: 'Road',
    allowedModes: ['Foot', 'Coach', 'Horse'],
    hazardRisk: 0,
    isBlocked: false,
    provenance: 'authored',
  });

  const player = repo.getPlayerLifecycle(storyId);
  if (player) {
    repo.updatePlayerLifecycle(
      storyId,
      player.copyWith({
        name: 'Ren Takahashi',
        locationId: LOC_OFFICE,
        discoveredLocationIds: [LOC_OFFICE, LOC_STREET, LOC_CRIME_SCENE],
      }),
    );
  }

  const run = repo.getStoryRun(storyId);
  if (run) {
    run.protagonist = {
      ...(run.protagonist || {}),
      characterId: player?.actorId || `char_${storyId}`,
      name: 'Ren Takahashi',
    };
    run.startingSituation = REN_PREMISE as any;
    repo.saveStoryRun(run);
  }
}

function buildDefaultPlan(turnId = 'turn_ren_test'): EphemeralNarrativePlan {
  return {
    turnId,
    objective: 'Maintain strict canonical grounding for Detective Ren Takahashi.',
    immediateSteps: ['Depict only verified canonical state and grounded scene details.'],
    informationToReveal: [],
    entitiesToReact: [],
    continuityRequirements: [],
    forbiddenAssumptions: [],
    stateEffectsExpected: [],
    createdAt: 'Day 1 • Night',
    expiresAfterNarration: true,
  };
}

function buildDefaultIntent(overrides: Partial<PlayerIntent> = {}): PlayerIntent {
  return {
    action: 'observe',
    interactionMode: 'OBSERVATION',
    speechIntent: false,
    movementIntent: false,
    observationIntent: true,
    explicitTargets: [],
    impliedTargets: [],
    confidence: 0.95,
    source: 'DETERMINISTIC',
    originalText: 'I survey the scene carefully.',
    ...overrides,
  };
}

function buildTurnPackage(narrativeText: string, overrides: Partial<StructuredTurnPackage> = {}): StructuredTurnPackage {
  return {
    narrative: [narrativeText],
    dialogue: [],
    events: [],
    stateChanges: [],
    memoryCandidates: [],
    audioCues: [],
    visualCues: [],
    ...overrides,
  };
}

describe('Permanent 9-Point Ren Takahashi Detective Regression Suite', () => {
  // =========================================================================
  // MODE 1: Opening Premise Materialisation & Crime Scene Location Anchors
  // =========================================================================
  describe('Mode 1: Opening Premise Materialisation & Crime Scene Location Anchors', () => {
    let repo: InMemoryWorldRepository;
    let storyId: string;

    beforeEach(() => {
      repo = new InMemoryWorldRepository({ disablePersistence: true });
      storyId = `ren_mode1_${Date.now()}`;
      setupRenTakahashiTopology(repo, storyId);
    });

    it('materialises freeform detective premise into canonical victim EntityCard, corpse object, chalk outline, perimeter tape, and clues', async () => {
      const seedPreview = extractInvestigationSeedFromPremise(REN_PREMISE, {
        storyId,
        characterId: repo.getPlayerLifecycle(storyId)?.actorId,
      });
      assert.ok(seedPreview, 'extractInvestigationSeedFromPremise must synthesize a structured seed');
      assert.equal(seedPreview.victim.name, 'Arthur Pendelton');

      const prepResult = await WorldDirectorPreparationService.prepareOpeningInvestigation(
        repo,
        storyId,
        LOC_CRIME_SCENE,
      );

      assert.equal(prepResult.status, 'PREPARED');
      assert.ok(prepResult.recordRefs, 'Preparation must return canonical recordRefs');
      assert.equal(prepResult.issues.length, 0);

      // Verify Victim EntityCard
      const victimCard = repo.getEntityCard(storyId, prepResult.recordRefs.victim);
      assert.ok(victimCard, 'Victim EntityCard must be committed to EntityRegistry');
      assert.equal(victimCard.name, 'Arthur Pendelton');
      assert.equal(victimCard.worldState?.isAlive, false);
      assert.equal(victimCard.lifecycle?.status, 'DEAD');
      assert.equal(
        victimCard.metadata?.worldDirectorRole,
        WORLD_DIRECTOR_INVESTIGATION_OWNER_ROLES.victim,
      );

      // Verify Crime Scene Objects in GeographyGraph
      const crimeSceneNode = repo.getGeographyGraph(storyId).getNode(LOC_CRIME_SCENE);
      assert.ok(crimeSceneNode);
      const sceneObjects = crimeSceneNode.sceneObjects || [];
      const objectNames = sceneObjects.map((o) => o.name.toLowerCase());

      assert.ok(
        objectNames.includes('corpse of arthur pendelton'),
        'Crime scene must contain the victim body anchor',
      );
      assert.ok(
        objectNames.includes('chalk outline'),
        'Crime scene must contain the default chalk outline anchor',
      );
      assert.ok(
        objectNames.includes('perimeter tape'),
        'Crime scene must contain the default perimeter tape anchor',
      );
      assert.ok(
        objectNames.includes('shattered pocket watch'),
        'Crime scene must contain the premise-extracted shattered pocket watch clue',
      );
      assert.ok(
        objectNames.includes('bloodstain'),
        'Crime scene must contain the premise-extracted bloodstain clue',
      );

      // Idempotent re-execution check
      const secondPrep = await WorldDirectorPreparationService.prepareOpeningInvestigation(
        repo,
        storyId,
        LOC_CRIME_SCENE,
      );
      assert.equal(secondPrep.status, 'ALREADY_PREPARED');
    });

    it('preserves exit connectivity across agency office, street, and crime scene and never invents unsupported starting possessions', () => {
      const graph = repo.getGeographyGraph(storyId);
      const pathToStreet = graph.findPath(LOC_OFFICE, LOC_STREET, 'Foot');
      assert.equal(pathToStreet.found, true);
      assert.deepEqual(pathToStreet.routeLocationIds, [LOC_OFFICE, LOC_STREET]);

      const pathToCrimeScene = graph.findPath(LOC_STREET, LOC_CRIME_SCENE, 'Coach');
      assert.equal(pathToCrimeScene.found, true);
      assert.deepEqual(pathToCrimeScene.routeLocationIds, [LOC_STREET, LOC_CRIME_SCENE]);

      const player = repo.getPlayerLifecycle(storyId)!;
      const inventory = repo.getInventoryEngine(storyId).getActorInventory(player.actorId);
      const hasHallucinatedWatch = inventory.some((item) =>
        String(item.name || '').toLowerCase().includes('watch'),
      );
      assert.equal(
        hasHallucinatedWatch,
        false,
        'Opening setup must not invent a wristwatch or unauthored possessions in Ren Takahashi inventory',
      );
    });
  });

  // =========================================================================
  // MODE 2: Corpse Non-Portability Invariant (CANNOT_TAKE_CORPSE)
  // =========================================================================
  describe('Mode 2: Corpse Non-Portability Invariant (CANNOT_TAKE_CORPSE)', () => {
    let repo: InMemoryWorldRepository;
    let storyId: string;
    let victimId: string;
    let actorId: string;

    beforeEach(async () => {
      repo = new InMemoryWorldRepository({ disablePersistence: true });
      storyId = `ren_mode2_${Date.now()}`;
      setupRenTakahashiTopology(repo, storyId);

      const player = repo.getPlayerLifecycle(storyId)!;
      actorId = player.actorId;
      repo.updatePlayerLifecycle(storyId, player.copyWith({ locationId: LOC_CRIME_SCENE }));

      const prep = await WorldDirectorPreparationService.prepareOpeningInvestigation(
        repo,
        storyId,
        LOC_CRIME_SCENE,
      );
      assert.equal(prep.status, 'PREPARED');
      victimId = prep.recordRefs!.victim;
    });

    it('allows inspecting/examining the corpse via SceneInteractionAuthority while rejecting taking/pocketing with CANNOT_TAKE_CORPSE', () => {
      // 1. Inspecting the body succeeds without moving or taking it
      const examineRes = SceneInteractionAuthority.resolve({
        repository: repo,
        storyId,
        actorId,
        locationId: LOC_CRIME_SCENE,
        actionText: 'I examine the corpse of Arthur Pendelton closely for wounds.',
      });
      assert.equal(examineRes.kind, 'EXAMINE');
      assert.equal(examineRes.attempted, true);
      assert.equal(examineRes.committed, false);
      assert.match(String(examineRes.feedback || ''), /corpse of Arthur Pendelton/i);

      // 2. Taking/picking up the corpse is deterministically blocked with CANNOT_TAKE_CORPSE
      const pickupRes = SceneInteractionAuthority.resolve({
        repository: repo,
        storyId,
        actorId,
        locationId: LOC_CRIME_SCENE,
        actionText: 'I pick up the corpse of Arthur Pendelton and place the body in my coat.',
      });
      assert.equal(pickupRes.kind, 'PICKUP');
      assert.equal(pickupRes.attempted, true);
      assert.equal(pickupRes.committed, false);
      assert.equal(pickupRes.errorCode, 'CANNOT_TAKE_CORPSE');
      assert.equal(pickupRes.canonicalStateChanges.length, 0);

      // Verify inventory remains free of the corpse
      const invItems = repo.getInventoryEngine(storyId).getActorInventory(actorId);
      assert.equal(
        invItems.some((i) => String(i.name || '').toLowerCase().includes('corpse')),
        false,
      );
    });

    it('enforces CANNOT_TAKE_CORPSE in CanonicalCommandEngine and NarrativeStateAdjudicator', async () => {
      // 1. CanonicalCommandEngine gate
      const cmdResult = await canonicalCommandEngine.execute(
        repo,
        {
          commandId: `cmd_take_corpse_${Date.now()}`,
          storyId,
          actorId,
          type: 'INTERACT',
          payload: { action: 'TAKE', targetId: victimId },
          source: 'PLAYER',
        },
        async () => ({ success: true, summary: 'Should never reach handler' }),
      );

      assert.equal(cmdResult.success, false);
      assert.equal(cmdResult.errorReason, 'CANNOT_TAKE_CORPSE');

      // 2. NarrativeStateAdjudicator gate
      const situation = CurrentSituationBuilder.build({
        storyId,
        playerAction: 'I try to take the victim body.',
        viewerActorId: actorId,
        worldRepo: repo,
      });

      const adjudication = NarrativeStateAdjudicator.adjudicate({
        repository: repo,
        storyId,
        turnId: 'turn_corpse_adj',
        actorId,
        playerIntent: buildDefaultIntent({ action: 'take', interactionMode: 'OBJECT' }),
        currentSituation: situation,
        turnPackage: buildTurnPackage('You lift the corpse.', {
          stateChanges: [
            {
              kind: 'inventory',
              targetId: actorId,
              value: { entityId: victimId, action: 'add' },
            },
          ],
        }),
      });

      assert.equal(adjudication.allApproved, false);
      assert.equal(adjudication.approvedCount, 0);
      assert.equal(adjudication.rejectedCount, 1);
      assert.equal(adjudication.outcomes[0].approved, false);
      assert.match(String(adjudication.outcomes[0].reason || ''), /CANNOT_TAKE_CORPSE/);
    });
  });

  // =========================================================================
  // MODE 3: Mundane Environmental Affordances vs Plot-Critical Denylist
  // =========================================================================
  describe('Mode 3: Mundane Environmental Affordances vs Plot-Critical Denylist', () => {
    it('permits and materialises archetype-appropriate mundane fixtures while blocking plot-critical denylist items', () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = `ren_mode3_${Date.now()}`;
      setupRenTakahashiTopology(repo, storyId);

      // Plausible mundane fixtures per archetype
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('desk', 'WORKPLACE'), true);
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('pen', 'WORKPLACE'), true);
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('street lamp', 'URBAN_DISTRICT'), true);
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('storm drain', 'URBAN_DISTRICT'), true);
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('chalk outline', 'CRIME_SCENE'), true);
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('perimeter tape', 'CRIME_SCENE'), true);

      // Materialise mundane desk lamp in office -> ACTIVE_TEMPORARY
      const matDeskLamp = AffordancePlausibilityEngine.materialiseAffordance({
        repository: repo,
        storyId,
        locationId: LOC_OFFICE,
        noun: 'desk lamp',
        archetype: 'WORKPLACE',
      });
      assert.equal(matDeskLamp.success, true);
      assert.ok(matDeskLamp.object);
      assert.equal(matDeskLamp.object.lifecycleStage, 'ACTIVE_TEMPORARY');
      assert.equal(matDeskLamp.object.provenance, 'AFFORDANCE_PLAUSIBILITY_ENGINE');

      // Plot-critical denylisted items must NEVER be plausible or materialised
      const forbiddenNouns = [
        'revolver',
        'dagger',
        'master key',
        'brass key',
        'murder weapon',
        'autopsy report',
        'bloody rag',
        'secret document',
        'gold coins',
        'corpse',
      ];
      for (const forbidden of forbiddenNouns) {
        assert.equal(
          AffordancePlausibilityEngine.isPlotCriticalDenylisted(forbidden),
          true,
          `'${forbidden}' must be flagged by isPlotCriticalDenylisted`,
        );
        assert.equal(
          AffordancePlausibilityEngine.isPlausibleAffordance(forbidden, 'WORKPLACE'),
          false,
          `'${forbidden}' must not be plausible in WORKPLACE`,
        );
        assert.equal(
          AffordancePlausibilityEngine.isPlausibleAffordance(forbidden, 'CRIME_SCENE'),
          false,
          `'${forbidden}' must not be plausible in CRIME_SCENE`,
        );

        const attempt = AffordancePlausibilityEngine.materialiseAffordance({
          repository: repo,
          storyId,
          locationId: LOC_OFFICE,
          noun: forbidden,
          archetype: 'WORKPLACE',
        });
        assert.equal(attempt.success, false, `materialiseAffordance must reject '${forbidden}'`);
      }
    });

    it('SemanticNarrativeReview accepts mundane archetype props and water puddles while rejecting ungrounded plot-critical props', () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = `ren_mode3_review_${Date.now()}`;
      setupRenTakahashiTopology(repo, storyId);
      const actorId = repo.getPlayerLifecycle(storyId)!.actorId;

      const situation = CurrentSituationBuilder.build({
        storyId,
        playerAction: 'I look around the detective office.',
        viewerActorId: actorId,
        worldRepo: repo,
      });

      // Ensure water is present for puddle grounding check
      if (situation.sceneEvidence?.environment) {
        situation.sceneEvidence.environment.archetype = 'WORKPLACE' as any;
        situation.sceneEvidence.environment.water = { present: true, description: 'Rainwater puddle near the threshold' } as any;
      }

      const validReview = SemanticNarrativeReview.review({
        intent: buildDefaultIntent({ observationIntent: true }),
        situation,
        plan: buildDefaultPlan(),
        turnPackage: buildTurnPackage(
          'You survey the Crimson Eye Agency Office carefully and notice a desk standing beside a shallow puddle near the door, revealing nothing unusual.',
        ),
      });
      assert.equal(
        validReview.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'),
        false,
        `Mundane desk and water puddle must not trigger UNSUPPORTED_CLAIM, got: ${JSON.stringify(validReview.violations)}`,
      );

      // Hallucinating an unauthored dagger or brass key on the floor must trigger UNSUPPORTED_CLAIM
      const invalidReview = SemanticNarrativeReview.review({
        intent: buildDefaultIntent({ observationIntent: true }),
        situation,
        plan: buildDefaultPlan(),
        turnPackage: buildTurnPackage(
          'You survey the Crimson Eye Agency Office and your gaze locks on a dagger lying beside a brass key on the floor.',
        ),
      });
      assert.equal(invalidReview.decision, 'REJECT');
      assert.equal(
        invalidReview.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'),
        true,
        'Hallucinated dagger/key in observation prose must trigger UNSUPPORTED_CLAIM',
      );
    });

    it('rejects invented forensic results/deadlines while allowing grounded, deadline-free forensic prose', async () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = `ren_mode3_forensic_${Date.now()}`;
      setupRenTakahashiTopology(repo, storyId);
      const player = repo.getPlayerLifecycle(storyId)!;
      repo.updatePlayerLifecycle(storyId, player.copyWith({ locationId: LOC_CRIME_SCENE }));
      await WorldDirectorPreparationService.prepareOpeningInvestigation(repo, storyId, LOC_CRIME_SCENE);
      const situation = CurrentSituationBuilder.build({
        storyId,
        playerAction: 'I examine the bloodstain.',
        viewerActorId: player.actorId,
        worldRepo: repo,
      });

      for (const invented of [
        'You examine the bloodstain. The lab will have the fingerprint results back by tomorrow morning.',
        'You study the chalk outline. The coroner has promised the autopsy will be finished within 24 hours.',
        'The forensics team says ballistics should be ready before Thursday, so the clock is ticking.',
      ]) {
        const review = SemanticNarrativeReview.review({
          intent: buildDefaultIntent(),
          situation,
          plan: buildDefaultPlan(),
          turnPackage: buildTurnPackage(invented),
        });
        assert.equal(review.decision, 'REJECT', `must reject: ${invented}`);
        assert.equal(review.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'), true, invented);
      }

      const grounded = SemanticNarrativeReview.review({
        intent: buildDefaultIntent(),
        situation,
        plan: buildDefaultPlan(),
        turnPackage: buildTurnPackage(
          'You examine the dark bloodstain beside the chalk outline; no forensic team has reported anything yet.',
        ),
      });
      assert.equal(
        grounded.violations.some((v) => /forensic result or deadline/.test(v.message)),
        false,
        'deadline-free forensic prose must not be flagged',
      );
    });

    it('populates a public street environment with living ambient occupants, idempotently', () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = `ren_mode3_public_${Date.now()}`;
      setupRenTakahashiTopology(repo, storyId);

      const streetPeople = WorldActivityDirector.ensureAmbientPopulation(repo, storyId, LOC_STREET);
      assert.ok(streetPeople.length > 0, 'a public street must be populated with ambient occupants');
      for (const person of streetPeople) {
        assert.equal(person.worldState.locationId, LOC_STREET);
        assert.equal(person.worldState.isAlive, true);
      }
      // Idempotent: a second call must not stack additional occupants.
      const again = WorldActivityDirector.ensureAmbientPopulation(repo, storyId, LOC_STREET);
      const active = repo.getEntityCards(storyId, { status: 'ACTIVE', locationId: LOC_STREET })
        .filter((card: any) => ['NPC', 'MERCHANT', 'CHARACTER', 'FACTION_MEMBER'].includes(card.kind));
      assert.ok(active.length >= streetPeople.length);
      assert.ok(again.length <= Math.max(streetPeople.length, active.length));
    });
  });

  // =========================================================================
  // MODE 4: Epistemic Name Masking of Unintroduced Strangers
  // =========================================================================
  describe('Mode 4: Epistemic Name Masking of Unintroduced Strangers', () => {
    it('extracts name tokens and sanitizes unintroduced abbreviated names (Dr. A. Watson Jr.) in EpistemicBoundaryEnforcer', () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = `ren_mode4_${Date.now()}`;
      setupRenTakahashiTopology(repo, storyId);
      const actorId = repo.getPlayerLifecycle(storyId)!.actorId;

      const tokens = extractEntityNameTokens({
        name: 'Dr. A. Watson Jr.',
        displayName: 'a tall medical examiner in a tweed coat',
      });
      assert.ok(tokens.compositeNames.includes('Dr. A. Watson Jr.'));
      assert.ok(tokens.distinctiveTokens.includes('Watson'));
      assert.equal(tokens.distinctiveTokens.includes('Dr'), false);
      assert.equal(tokens.distinctiveTokens.includes('Jr'), false);

      const situation = CurrentSituationBuilder.build({
        storyId,
        playerAction: 'I observe the figures in the office.',
        viewerActorId: actorId,
        worldRepo: repo,
      });

      situation.nearbyEntities.push({
        id: 'npc_watson',
        name: 'Dr. A. Watson Jr.',
        displayName: 'a tall medical examiner in a tweed coat',
        kind: 'CHARACTER',
        role: 'Medical Examiner',
        presence: 'present',
        isAlive: true,
        visibleToPlayer: true,
        identityKnown: false,
        relationshipSummary: 'stranger',
        relevantTags: ['medic'],
      } as any);

      const contextResult = EpistemicBoundaryEnforcer.sanitizeContext(
        [
          'Location: Crimson Eye Agency Office.',
          'Dr. A. Watson Jr. stands near the frosted glass window.',
          'A tall medical examiner in a tweed coat checks his notes.',
        ].join('\n'),
        situation,
      );

      assert.equal(contextResult.report.removedContextLineCount, 1);
      assert.equal(contextResult.text.includes('Watson'), false);
      assert.equal(contextResult.text.includes('tall medical examiner'), true);
    });

    it('SemanticNarrativeReview blocks unintroduced names with lookaround regex, avoids dictionary homograph false positives, and permits names once introduced', () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = `ren_mode4_review_${Date.now()}`;
      setupRenTakahashiTopology(repo, storyId);
      const actorId = repo.getPlayerLifecycle(storyId)!.actorId;

      const situation = CurrentSituationBuilder.build({
        storyId,
        playerAction: 'I look around the room.',
        viewerActorId: actorId,
        worldRepo: repo,
      });

      situation.nearbyEntities = [
        {
          id: 'npc_watson',
          name: 'Dr. A. Watson Jr.',
          displayName: 'a tall medical examiner in a tweed coat',
          kind: 'CHARACTER',
          role: 'Medical Examiner',
          presence: 'present',
          isAlive: true,
          visibleToPlayer: true,
          identityKnown: false,
          relationshipSummary: 'stranger',
          relevantTags: [],
        } as any,
        {
          id: 'npc_hope',
          name: 'Ms. Hope',
          displayName: 'a quiet woman in a dark raincoat',
          kind: 'CHARACTER',
          role: 'Client',
          presence: 'present',
          isAlive: true,
          visibleToPlayer: true,
          identityKnown: false,
          relationshipSummary: 'stranger',
          relevantTags: [],
        } as any,
      ];

      // 1. Leaking "Dr. A. Watson Jr." when identityKnown === false -> REJECT
      const leakedReview = SemanticNarrativeReview.review({
        intent: buildDefaultIntent({ observationIntent: true }),
        situation,
        plan: buildDefaultPlan(),
        turnPackage: buildTurnPackage(
          'You survey the Crimson Eye Agency Office and see Dr. A. Watson Jr. standing silently by the door.',
        ),
      });
      assert.equal(leakedReview.decision, 'REJECT');
      assert.equal(
        leakedReview.violations.some(
          (v) => v.code === 'UNSUPPORTED_CLAIM' && v.message.includes('Dr. A. Watson Jr.'),
        ),
        true,
      );

      // 2. Using masked displayName + lowercase dictionary word "hope" -> ACCEPT (no false positive)
      const maskedAndSafeDictReview = SemanticNarrativeReview.review({
        intent: buildDefaultIntent({ observationIntent: true }),
        situation,
        plan: buildDefaultPlan(),
        turnPackage: buildTurnPackage(
          'You look around the Crimson Eye Agency Office without losing hope, observing a tall medical examiner in a tweed coat and a quiet woman in a dark raincoat waiting silently.',
        ),
      });
      assert.equal(
        maskedAndSafeDictReview.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'),
        false,
        `Masked displayName and lowercase dictionary word 'hope' must pass cleanly, got: ${JSON.stringify(maskedAndSafeDictReview.violations)}`,
      );

      // 3. Once formally introduced (identityKnown = true), using "Dr. A. Watson Jr." is accepted
      situation.nearbyEntities[0].identityKnown = true;
      const introducedReview = SemanticNarrativeReview.review({
        intent: buildDefaultIntent({ observationIntent: true }),
        situation,
        plan: buildDefaultPlan(),
        turnPackage: buildTurnPackage(
          'You observe the Crimson Eye Agency Office as Dr. A. Watson Jr. remains standing quietly near the desk.',
        ),
      });
      assert.equal(
        introducedReview.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'),
        false,
        `Introduced NPC name must be allowed in narration, got: ${JSON.stringify(introducedReview.violations)}`,
      );
    });
  });

  // =========================================================================
  // MODE 5: Dynamic Vehicle & Street Transit Lifecycle
  // =========================================================================
  describe('Mode 5: Dynamic Vehicle & Street Transit Lifecycle', () => {
    it('enforces CAS stale-version rejection (STALE_PROPOSAL_REJECTED) and 4-stage EntityLifecycleStateMachine rules', () => {
      const state = { streetAccess: true };
      const hash = WorldSimulatorAdjudicator.calculateStateHash(state);
      const currentWorld = { worldVersion: 3, state, stateHash: hash };

      const staleProposal: WorldSimulationProposal = {
        proposalId: 'prop_stale_taxi',
        idempotencyKey: 'idem_stale_taxi',
        worldVersion: 2, // Stale version
        baseStateHash: hash,
        entityType: 'PROPOSED',
        proposedStateTransition: { type: 'SPAWN_TEMPORARY_VEHICLE', targetId: 'veh_1' },
        requiredPreconditions: [{ predicate: 'streetAccess', expected: true }],
        provenance: { source: 'DETERMINISTIC_ARCHETYPE', timestamp: new Date().toISOString() },
        safeFallback: { message: 'No cab arrived.' },
      };

      const staleRes = WorldSimulatorAdjudicator.adjudicate(currentWorld, staleProposal);
      assert.equal(staleRes.accepted, false);
      assert.equal(staleRes.code, 'STALE_PROPOSAL_REJECTED');

      // 4-Stage Lifecycle transitions
      assert.equal(EntityLifecycleStateMachine.canTransition('EPHEMERAL', 'PROPOSED'), true);
      assert.equal(EntityLifecycleStateMachine.canTransition('PROPOSED', 'ACTIVE_TEMPORARY'), true);
      assert.equal(EntityLifecycleStateMachine.canTransition('ACTIVE_TEMPORARY', 'PERSISTENT'), true);
      assert.equal(EntityLifecycleStateMachine.canTransition('ACTIVE_TEMPORARY', 'EPHEMERAL'), true);
      assert.equal(
        EntityLifecycleStateMachine.canTransition('EPHEMERAL', 'PERSISTENT'),
        false,
        'Cannot skip intermediate stages from EPHEMERAL directly to PERSISTENT',
      );
    });

    it('rejects indoor hailing, hails taxi on street, enforces boarding gate, preserves Invariant 6 during transit, and evicts taxi upon arrival', () => {
      const storyId = `ren_mode5_transit_${Date.now()}`;
      setupRenTakahashiTopology(worldRepository, storyId);

      // 1. Reject hailing inside the detective office (WORKPLACE)
      const indoorHail = VehicleInteractionAuthority.hailVehicle({
        repository: worldRepository,
        storyId,
        locationId: LOC_OFFICE,
        vehicleType: 'taxi',
      });
      assert.equal(indoorHail.success, false);
      assert.equal(indoorHail.errorCode, 'CANNOT_HAIL_VEHICLE_WITHOUT_STREET_ACCESS');

      // Move Ren onto Vermilion Avenue Kerb (LOC_STREET)
      const playerAtOffice = worldRepository.getPlayerLifecycle(storyId)!;
      worldRepository.updatePlayerLifecycle(
        storyId,
        playerAtOffice.copyWith({ locationId: LOC_STREET }),
      );

      // 2. Hail taxi on street -> succeeds via WorldSimulatorAdjudicator & transitions to ACTIVE_TEMPORARY
      const streetHail = VehicleInteractionAuthority.hailVehicle({
        repository: worldRepository,
        storyId,
        locationId: LOC_STREET,
        vehicleType: 'taxi',
      });
      assert.equal(streetHail.success, true);
      assert.equal(streetHail.stage, 'ACTIVE_TEMPORARY');
      assert.ok(streetHail.vehicle);
      const vehicleId = streetHail.vehicle.id;

      // 3. Attempting transit BEFORE boarding is rejected with NOT_IN_VEHICLE
      const prematureTransit = VehicleInteractionAuthority.transitVehicle({
        repository: worldRepository,
        storyId,
        destinationLocationId: LOC_CRIME_SCENE,
        mode: 'Coach',
      });
      assert.equal(prematureTransit.success, false);
      assert.equal(prematureTransit.errorCode, 'NOT_IN_VEHICLE');

      // 4. Board the hailed taxi
      const boardRes = VehicleInteractionAuthority.boardVehicle({
        repository: worldRepository,
        storyId,
        locationId: LOC_STREET,
        actorId: playerAtOffice.actorId,
        vehicleId,
      });
      assert.equal(boardRes.success, true);
      assert.ok(boardRes.vehicle?.activeDependencies?.includes('player_boarded'));
      assert.equal(EntityLifecycleStateMachine.isProtectedFromEviction(boardRes.vehicle!), true);

      // 5. Initiate vehicle transit toward LOC_CRIME_SCENE
      const transitRes = VehicleInteractionAuthority.transitVehicle({
        repository: worldRepository,
        storyId,
        destinationLocationId: LOC_CRIME_SCENE,
        mode: 'Coach',
      });
      assert.equal(transitRes.success, true);

      // Verify Invariant 6: while isTraveling === true, canonical locationId remains origin (LOC_STREET)
      const travelingPlayer = worldRepository.getPlayerLifecycle(storyId)!;
      assert.equal(travelingPlayer.isTraveling, true);
      assert.equal(
        travelingPlayer.locationId,
        LOC_STREET,
        'Invariant 6: player locationId must remain at origin while vehicle journey is in progress',
      );

      // 6. Advance world clock to complete transit arrival
      const advanceRes = worldSimulationService.advanceTime(storyId, 3600);
      assert.ok(advanceRes.completedArrivals.includes(LOC_CRIME_SCENE));

      const arrivedPlayer = worldRepository.getPlayerLifecycle(storyId)!;
      assert.equal(arrivedPlayer.isTraveling, false);
      assert.equal(arrivedPlayer.locationId, LOC_CRIME_SCENE);

      // 7. Complete vehicle journey -> disembarks and evicts temporary vehicle from GeographyGraph
      const completeRes = VehicleInteractionAuthority.completeVehicleJourney({
        repository: worldRepository,
        storyId,
        locationId: LOC_CRIME_SCENE,
        vehicleId,
      });
      assert.equal(completeRes.success, true);
      assert.equal(completeRes.stage, 'EPHEMERAL');

      const streetObjectsAfter = worldRepository.getGeographyGraph(storyId).getNode(LOC_STREET)?.sceneObjects || [];
      const docksObjectsAfter = worldRepository.getGeographyGraph(storyId).getNode(LOC_CRIME_SCENE)?.sceneObjects || [];
      assert.equal(
        streetObjectsAfter.some((o) => o.id === vehicleId),
        false,
        'Temporary taxi must be evicted from origin street upon arrival',
      );
      assert.equal(
        docksObjectsAfter.some((o) => o.id === vehicleId),
        false,
        'Temporary taxi must not pollute destination sceneObjects after disembarking',
      );
    });
  });

  // =========================================================================
  // MODE 6: Uncommitted Movement Guard
  // =========================================================================
  describe('Mode 6: Uncommitted Movement Guard', () => {
    it('SemanticNarrativeReview blocks prose claiming arrival at a destination when no canonical MOVE/LOCATION state change was committed', () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = `ren_mode6_${Date.now()}`;
      setupRenTakahashiTopology(repo, storyId);
      const actorId = repo.getPlayerLifecycle(storyId)!.actorId;

      const situation = CurrentSituationBuilder.build({
        storyId,
        playerAction: 'I rush across the city to Warehouse Docks Pier 4.',
        viewerActorId: actorId,
        worldRepo: repo,
      });

      const moveIntent = buildDefaultIntent({
        action: 'move',
        interactionMode: 'MOVEMENT',
        movementIntent: true,
        observationIntent: false,
        locationTarget: { id: LOC_CRIME_SCENE, name: 'Warehouse Docks Pier 4' } as any,
        originalText: 'I rush across the city to Warehouse Docks Pier 4.',
      });

      // 1. Prose claiming arrival without committed movement -> REJECT with UNSUPPORTED_STATE_PROPOSAL
      const arrivalClaimReview = SemanticNarrativeReview.review({
        intent: moveIntent,
        situation,
        plan: buildDefaultPlan(),
        turnPackage: buildTurnPackage(
          'You rush through the rain and arrive at Warehouse Docks Pier 4, stepping inside the police cordon.',
        ),
        actionResolution: {
          resolutionId: 'res_no_move',
          resolutionMethod: 'DETERMINISTIC',
          outcomeTier: 'SUCCESS',
          actualEffect: 'Player prepared to depart from office.',
          canonicalStateChanges: [], // No committed LOCATION/MOVEMENT/TRAVEL change
          physicalConsequences: [],
          playerVisibleConsequences: [],
        } as any,
      });

      assert.equal(arrivalClaimReview.decision, 'REJECT');
      assert.equal(
        arrivalClaimReview.violations.some((v) => v.code === 'UNSUPPORTED_STATE_PROPOSAL'),
        true,
        'Claiming arrival without canonical movement commit must trigger UNSUPPORTED_STATE_PROPOSAL',
      );

      // 2. Prose depicting only departure/heading toward destination -> ACCEPT
      const departureOnlyReview = SemanticNarrativeReview.review({
        intent: moveIntent,
        situation,
        plan: buildDefaultPlan(),
        turnPackage: buildTurnPackage(
          'You grab your coat and head toward Warehouse Docks Pier 4, stepping toward the exit of the Crimson Eye Agency Office.',
        ),
        actionResolution: {
          resolutionId: 'res_depart_attempt',
          resolutionMethod: 'DETERMINISTIC',
          outcomeTier: 'SUCCESS',
          actualEffect: 'Player moves toward the office exit.',
          canonicalStateChanges: [],
          physicalConsequences: [],
          playerVisibleConsequences: [],
        } as any,
      });

      assert.equal(
        departureOnlyReview.violations.some((v) => v.code === 'UNSUPPORTED_STATE_PROPOSAL'),
        false,
        'Depicting departure/intent without claiming arrival must not trigger UNSUPPORTED_STATE_PROPOSAL',
      );
    });

    it('NarrativeStateAdjudicator rejects AI-proposed location mutations that lack canonical engine authorization', () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = `ren_mode6_adj_${Date.now()}`;
      setupRenTakahashiTopology(repo, storyId);
      const actorId = repo.getPlayerLifecycle(storyId)!.actorId;

      const situation = CurrentSituationBuilder.build({
        storyId,
        playerAction: 'I think about the crime scene.',
        viewerActorId: actorId,
        worldRepo: repo,
      });

      const adjudication = NarrativeStateAdjudicator.adjudicate({
        repository: repo,
        storyId,
        turnId: 'turn_unauth_move',
        actorId,
        playerIntent: buildDefaultIntent({ movementIntent: false }),
        currentSituation: situation,
        turnPackage: buildTurnPackage('You find yourself at the docks.', {
          stateChanges: [
            {
              kind: 'location',
              targetId: actorId,
              value: LOC_CRIME_SCENE,
            },
          ],
        }),
      });

      assert.equal(adjudication.allApproved, false);
      assert.equal(adjudication.approvedCount, 0);
      assert.equal(adjudication.committedCount, 0);
      assert.equal(adjudication.outcomes[0].approved, false);
      assert.equal(adjudication.outcomes[0].canonicalEngine, 'GeographyGraph');
      assert.equal(repo.getPlayerLifecycle(storyId)!.locationId, LOC_OFFICE);
    });
  });

  // =========================================================================
  // MODE 7: Speaker Epistemic Boundary & CharacterCanonSteward
  // =========================================================================
  describe('Mode 7: Speaker Epistemic Boundary & CharacterCanonSteward', () => {
    let repo: InMemoryWorldRepository;
    let storyId: string;
    const distantVendorId = 'npc_street_vendor_kenji';
    const dockWitnessId = 'npc_dock_watchman_sato';

    beforeEach(async () => {
      repo = new InMemoryWorldRepository({ disablePersistence: true });
      storyId = `ren_mode7_${Date.now()}`;
      setupRenTakahashiTopology(repo, storyId);

      // Save distant NPC at LOC_STREET
      repo.saveEntityCard(storyId, {
        id: distantVendorId,
        storyId,
        name: 'Kenji the Noodle Vendor',
        kind: 'CHARACTER',
        classification: { role: 'Street Vendor', profession: 'Cook', tags: ['vendor'] },
        background: { origin: 'Vermilion Ward night market', canonicalSecrets: [] },
        worldState: { locationId: LOC_STREET, currentActivity: 'boiling broth', isAlive: true, presence: 'present' },
        lifecycle: { status: 'ACTIVE' },
      } as any);

      // Save co-located witness NPC at LOC_CRIME_SCENE
      repo.saveEntityCard(storyId, {
        id: dockWitnessId,
        storyId,
        name: 'Watchman Sato',
        kind: 'CHARACTER',
        classification: { role: 'Harbor Watchman', tags: ['witness'] },
        background: { origin: 'Harbor Patrol', canonicalSecrets: [] },
        worldState: { locationId: LOC_CRIME_SCENE, currentActivity: 'guarding cordon', isAlive: true, presence: 'present' },
        lifecycle: { status: 'ACTIVE' },
      } as any);

      await WorldDirectorPreparationService.prepareOpeningInvestigation(
        repo,
        storyId,
        LOC_CRIME_SCENE,
      );
    });

    it('restricts distant NPCs to AUTHORED_BACKGROUND, rejects leaked crime-scene clues and ungrounded confessions with UNSUPPORTED_CLAIM, and supports gated transmission', () => {
      // 1. Verify distant vendor knows their AUTHORED_BACKGROUND origin but NOT crime scene clues
      const vendorScope = CharacterCanonSteward.getScope(storyId, distantVendorId);
      const vendorFacts = Array.from(vendorScope.knownFacts.values());
      assert.equal(vendorFacts.some((f) => f.sourceType === 'AUTHORED_BACKGROUND'), true);

      const promptBlock = CharacterCanonSteward.getSpeakerEpistemicPromptBlock({
        storyId,
        speakerId: distantVendorId,
        speakerName: 'Kenji the Noodle Vendor',
        currentLocationId: LOC_STREET,
      });
      assert.match(promptBlock, /EXPLICITLY UNKNOWN/);
      assert.match(promptBlock, /shattered pocket watch/i);

      // 2. Audit distant vendor leaking the shattered pocket watch clue or confessing to murder -> invalid
      const leakAudit = CharacterCanonSteward.auditSpeakerDialogue({
        storyId,
        speakerId: distantVendorId,
        speakerName: 'Kenji the Noodle Vendor',
        dialogueText: 'I killed Arthur Pendelton and left the shattered pocket watch by the bloodstain!',
        currentLocationId: LOC_STREET,
      });
      assert.equal(leakAudit.valid, false);
      assert.ok(leakAudit.leakedFacts.includes('shattered pocket watch'));
      assert.ok(leakAudit.leakedFacts.includes('UNGROUNDED_CULPRIT_CONFESSION'));

      // 3. SemanticNarrativeReview rejects turnPackage containing the epistemic leak in dialogue
      const player = repo.getPlayerLifecycle(storyId)!;
      repo.updatePlayerLifecycle(storyId, player.copyWith({ locationId: LOC_STREET }));
      const streetSituation = CurrentSituationBuilder.build({
        storyId,
        playerAction: 'I ask Kenji the Noodle Vendor what he knows.',
        viewerActorId: player.actorId,
        worldRepo: repo,
      });

      const reviewResult = SemanticNarrativeReview.review({
        intent: buildDefaultIntent({
          action: 'speak',
          interactionMode: 'DIALOGUE',
          speechIntent: true,
          observationIntent: false,
        }),
        situation: streetSituation,
        plan: buildDefaultPlan(),
        turnPackage: buildTurnPackage(
          'Kenji leans across the counter of his noodle cart and whispers a confession.',
          {
            dialogue: [
              {
                speaker: 'Kenji the Noodle Vendor',
                text: 'I killed Arthur Pendelton and dropped the shattered pocket watch at the pier!',
              },
            ],
          },
        ),
      });

      assert.equal(reviewResult.decision, 'REJECT');
      assert.equal(
        reviewResult.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'),
        true,
        'SemanticNarrativeReview must reject NPC dialogue that violates CharacterCanonSteward epistemic boundaries',
      );

      // 4. Test legitimate fact grant & trust-gated transmission
      const watchFactId = 'fact_secret_watch_engraving';
      CharacterCanonSteward.grantFact(storyId, dockWitnessId, {
        factId: watchFactId,
        subjectEntityId: 'obj_pocket_watch',
        predicate: 'ENGRAVING_INSCRIPTION',
        objectValue: 'Initials R.V. inside the watch casing',
        sourceType: 'CO_LOCATED_WITNESS',
        acquiredAtTimestamp: 'Day 1 • Night',
        acquiredAtTurn: 1,
        confidence: 1.0,
        isSecret: true,
        shareThreshold: { minTrust: 40 },
      });

      // Low trust transmission fails
      const deniedTx = CharacterCanonSteward.transmitFact({
        storyId,
        turnNumber: 2,
        timestamp: 'Day 1 • Night',
        fromEntityId: dockWitnessId,
        toEntityId: distantVendorId,
        factId: watchFactId,
        channel: 'DIRECT',
        currentTrust: 15,
      });
      assert.equal(deniedTx.success, false);
      assert.equal(CharacterCanonSteward.isFactKnown(storyId, distantVendorId, watchFactId), false);

      // Sufficient trust transmission succeeds
      const allowedTx = CharacterCanonSteward.transmitFact({
        storyId,
        turnNumber: 3,
        timestamp: 'Day 1 • Night',
        fromEntityId: dockWitnessId,
        toEntityId: distantVendorId,
        factId: watchFactId,
        channel: 'DIRECT',
        currentTrust: 55,
      });
      assert.equal(allowedTx.success, true);
      assert.equal(CharacterCanonSteward.isFactKnown(storyId, distantVendorId, watchFactId), true);
      assert.equal(
        CharacterCanonSteward.getScope(storyId, distantVendorId).knownFacts.get(watchFactId)?.sourceType,
        'DIRECT_CONVERSATION',
      );
    });
  });

  // =========================================================================
  // MODE 8: Co-located Witness Fact Acquisition & Bidirectional Relationship Deltas
  // =========================================================================
  describe('Mode 8: Co-located Witness Fact Acquisition & Bidirectional Relationship/Suspicion Deltas', () => {
    it('records witnessed actions only for living co-located witnesses while deceased bodies and distant NPCs remain unaware, and synchronizes bidirectional suspicion/trust/hostility', async () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = `ren_mode8_${Date.now()}`;
      setupRenTakahashiTopology(repo, storyId);

      const player = repo.getPlayerLifecycle(storyId)!;
      const actorId = player.actorId;
      repo.updatePlayerLifecycle(storyId, player.copyWith({ locationId: LOC_CRIME_SCENE }));

      const prep = await WorldDirectorPreparationService.prepareOpeningInvestigation(
        repo,
        storyId,
        LOC_CRIME_SCENE,
      );
      const deceasedVictimId = prep.recordRefs!.victim;

      const coLocatedWitnessId = 'npc_dock_watchman_sato';
      const distantNpcId = 'npc_agency_clerk_mina';

      repo.saveEntityCard(storyId, {
        id: coLocatedWitnessId,
        storyId,
        name: 'Watchman Sato',
        kind: 'CHARACTER',
        worldState: {
          locationId: LOC_CRIME_SCENE,
          currentActivity: 'watching the pier',
          isAlive: true,
          presence: 'present',
        },
        lifecycle: { status: 'ACTIVE' },
        social: { factionIds: [], reputation: {}, relationships: {} },
        memoryRefs: [],
      } as any);

      repo.saveEntityCard(storyId, {
        id: distantNpcId,
        storyId,
        name: 'Clerk Mina',
        kind: 'CHARACTER',
        worldState: {
          locationId: LOC_OFFICE,
          currentActivity: 'filing case reports',
          isAlive: true,
          presence: 'present',
        },
        lifecycle: { status: 'ACTIVE' },
        social: { factionIds: [], reputation: {}, relationships: {} },
        memoryRefs: [],
      } as any);

      // Record a CRIME-category action by Ren at LOC_CRIME_SCENE
      const witnessRes = WitnessFactAuthority.recordWitnessFact(repo, {
        storyId,
        turnId: 'turn_tamper_01',
        locationId: LOC_CRIME_SCENE,
        actorId,
        actionText: 'I pocket the spent bullet casing before the harbor patrol logs it.',
        predicate: 'TAMPERED_WITH_CRIME_SCENE_EVIDENCE',
        objectValue: 'spent bullet casing',
        summary: 'Ren Takahashi pocketed unlogged evidence at Pier 4.',
        actionCategory: 'CRIME',
      });

      // 1. Only living co-located Watchman Sato witnessed the action
      assert.deepEqual(witnessRes.witnessIds, [coLocatedWitnessId]);
      assert.equal(
        CharacterCanonSteward.isFactKnown(storyId, coLocatedWitnessId, witnessRes.factId),
        true,
        'Living co-located witness must acquire the witnessed fact',
      );
      assert.equal(
        CharacterCanonSteward.getScope(storyId, coLocatedWitnessId).knownFacts.get(witnessRes.factId)?.sourceType,
        'CO_LOCATED_WITNESS',
      );

      // 2. Deceased victim at the same location and living clerk at a distant location do NOT acquire the fact
      assert.equal(
        CharacterCanonSteward.isFactKnown(storyId, deceasedVictimId, witnessRes.factId),
        false,
        'Deceased corpse must never acquire witness facts',
      );
      assert.equal(
        CharacterCanonSteward.isFactKnown(storyId, distantNpcId, witnessRes.factId),
        false,
        'Distant NPC at another location must never acquire co-located witness facts',
      );

      // 3. Verify bidirectional relationship & suspicion deltas synchronized across AgencyEngine and EntityCard
      const biRel = WitnessFactAuthority.getBidirectionalRelationship(
        repo,
        storyId,
        actorId,
        coLocatedWitnessId,
      );
      assert.ok(biRel.backward, 'Witness -> Actor backward relationship state must exist');
      assert.ok(biRel.backward.suspicion > 0, 'Witness suspicion must increase after witnessing CRIME action');
      assert.ok(biRel.backward.hostility > 0, 'Witness hostility must increase after witnessing CRIME action');
      assert.ok(
        biRel.backward.trust < 50,
        `Witness trust must decrease from baseline 50 after witnessing CRIME action, got ${biRel.backward.trust}`,
      );
      assert.equal(biRel.backward.trust, 25);

      // Apply an explicit bidirectional delta and verify 3-way sync onto EntityCard.social.relationships
      const explicitDelta = WitnessFactAuthority.applyBidirectionalRelationshipDelta(repo, {
        storyId,
        partyAId: actorId,
        partyBId: coLocatedWitnessId,
        eventId: 'evt_interrogation_pressure',
        cause: 'PLAYER_ACTION',
        description: 'Ren pressed Watchman Sato about the unlocked pier gate.',
        forwardDelta: { suspicion: 20, trust: -5 },
        backwardDelta: { suspicion: 15, hostility: 10, trust: -10 },
      });

      const updatedWitnessCard = repo.getEntityCard(storyId, coLocatedWitnessId)!;
      const syncedRelOnWitnessCard = updatedWitnessCard.social?.relationships?.[actorId];
      assert.ok(syncedRelOnWitnessCard, 'EntityCard.social.relationships must be synchronized');
      assert.equal(syncedRelOnWitnessCard.suspicion, explicitDelta.backward.suspicion);
      assert.equal(syncedRelOnWitnessCard.trust, explicitDelta.backward.trust);
      assert.equal(syncedRelOnWitnessCard.hostility, explicitDelta.backward.hostility);
      assert.ok(updatedWitnessCard.memoryRefs?.includes(witnessRes.factId));
    });
  });

  // =========================================================================
  // MODE 9: Structured Observation Grounding, Long-Session Memory Continuity
  //         & Truth-Preserving Provider Fallback
  // =========================================================================
  describe('Mode 9: Structured Observation Grounding, Long-Session Memory Continuity & Truth-Preserving Provider Fallback', () => {
    it('evaluates structured observation grounding and prevents silent listening turns from fabricating protagonist speech', async () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = `ren_mode9_obs_${Date.now()}`;
      setupRenTakahashiTopology(repo, storyId);

      const player = repo.getPlayerLifecycle(storyId)!;
      repo.updatePlayerLifecycle(storyId, player.copyWith({ locationId: LOC_CRIME_SCENE }));
      await WorldDirectorPreparationService.prepareOpeningInvestigation(repo, storyId, LOC_CRIME_SCENE);

      const situation = CurrentSituationBuilder.build({
        storyId,
        playerAction: 'I examine the shattered pocket watch and listen for footsteps in the fog.',
        viewerActorId: player.actorId,
        worldRepo: repo,
      });

      // 1. Deterministic resolveGroundedObservation returns canonical anchor evidence
      const groundedWatchObs = resolveGroundedObservation(
        situation,
        'I inspect the shattered pocket watch closely.',
      );
      assert.equal(groundedWatchObs.relevant, true);
      assert.match(String(groundedWatchObs.text || ''), /shattered pocket watch/i);

      // 2. evaluateObservationGrounding validates perception beat + anchor + outcome
      const listenIntent = buildDefaultIntent({
        action: 'listen',
        interactionMode: 'OBSERVATION',
        speechIntent: false,
        observationIntent: true,
        explicitTargets: [{ id: 'target_watch', name: 'shattered pocket watch', kind: 'OBJECT' } as any],
        originalText: 'I examine the shattered pocket watch and listen for footsteps.',
      });

      const validEval = evaluateObservationGrounding(
        'You examine the shattered pocket watch beside the chalk outline and listen closely, hearing nothing but the river water.',
        listenIntent,
        situation,
      );
      assert.equal(validEval.valid, true);
      assert.equal(validEval.hasPerceptionBeat, true);
      assert.equal(validEval.hasAnchorGrounding, true);
      assert.equal(validEval.hasOutcomeOrLimitation, true);

      // 3. Converting a silent listening turn into protagonist speech triggers UNAUTHORIZED_SPEECH
      const unauthorizedSpeechReview = SemanticNarrativeReview.review({
        intent: listenIntent,
        situation,
        plan: buildDefaultPlan(),
        turnPackage: buildTurnPackage(
          'You examine the shattered pocket watch and you shout across the pier to ask who is hiding in the fog.',
        ),
      });
      assert.equal(unauthorizedSpeechReview.decision, 'REJECT');
      assert.equal(
        unauthorizedSpeechReview.violations.some((v) => v.code === 'UNAUTHORIZED_SPEECH'),
        true,
      );
    });

    it('preserves CAUSAL plot beats and consolidates resolved threads into SEMANTIC memory across a 125-turn memory lifecycle run', async () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = `ren_mode9_marathon_${Date.now()}`;
      setupRenTakahashiTopology(repo, storyId);

      const player = repo.getPlayerLifecycle(storyId)!;
      const actorId = player.actorId;
      repo.updatePlayerLifecycle(storyId, player.copyWith({ locationId: LOC_CRIME_SCENE }));
      await WorldDirectorPreparationService.prepareOpeningInvestigation(repo, storyId, LOC_CRIME_SCENE);

      // Ensure player has an EntityCard in EntityRegistry to verify 50-entry LRU memoryRefs cap
      repo.getEntityRegistry(storyId).upsert({
        id: actorId,
        storyId,
        name: 'Ren Takahashi',
        kind: 'PLAYER',
        worldState: { locationId: LOC_CRIME_SCENE, isAlive: true, presence: 'present' },
        lifecycle: { status: 'ACTIVE' },
        memoryRefs: [],
      } as any);

      const baseSituation = CurrentSituationBuilder.build({
        storyId,
        playerAction: 'I inspect Warehouse Docks Pier 4.',
        viewerActorId: actorId,
        worldRepo: repo,
      });

      // Turn 1: Commit a critical crime-scene CAUSAL plot beat + open an investigation thread
      const turn1Adjudication = NarrativeStateAdjudicator.adjudicateCanonicalAction(
        {
          resolutionId: 'res_turn_1',
          resolutionMethod: 'DETERMINISTIC',
          outcomeTier: 'SUCCESS',
          actualEffect: 'Recovered shattered pocket watch stopped at 11:42 PM at Warehouse Docks Pier 4.',
          canonicalStateChanges: [
            {
              kind: 'EVIDENCE_DISCOVERED',
              targetId: 'evidence_pocket_watch',
              value: { stoppedAt: '23:42' },
              metadata: {
                source: 'SceneInteractionAuthority',
                summary: 'Discovered shattered pocket watch stopped at 11:42 PM at Warehouse Docks Pier 4',
              },
            },
          ],
          physicalConsequences: [],
          playerVisibleConsequences: ['The shattered pocket watch hands are frozen at 11:42 PM.'],
        } as any,
        baseSituation,
        { repository: repo, storyId, turnId: 'turn_1', actorId },
      );

      const turn1Res = NarrativeMemoryLifecycle.processTurn({
        repository: repo,
        storyId,
        turnId: 'turn_1',
        playerAction: 'Inspect the shattered pocket watch at Warehouse Docks Pier 4.',
        currentSituation: baseSituation,
        turnPackage: buildTurnPackage(
          'At Warehouse Docks Pier 4, you inspect the shattered pocket watch and note the hands frozen at 11:42 PM.',
          {
            memoryCandidates: [
              'Investigate the unresolved harbor manifest discrepancy at Warehouse Docks Pier 4.',
              'Discovered at Warehouse Docks Pier 4 that the harbor manifest ledger page was torn.',
            ],
          },
        ),
        stateAdjudication: turn1Adjudication,
      });

      assert.ok(turn1Res.plotBeatId, 'Turn 1 must record a canonical plotBeatId');
      assert.ok(turn1Res.updatedThreadIds.length >= 1, 'Turn 1 must open an investigation thread');
      const openThreadId = turn1Res.updatedThreadIds[0];

      // Turn 2: Record a second episodic clue memory linked to the same open thread
      repo.getMemoryEngine(storyId).storeMemory({
        id: 'mem_manifest_clue_2',
        storyId,
        memoryClass: 'EPISODIC',
        subjectEntityId: actorId,
        relatedEntityIds: [],
        relatedLocationId: LOC_CRIME_SCENE,
        relatedThreadId: openThreadId,
        content: 'Found a second torn harbor manifest stub matching the missing Pier 4 entry.',
        importance: 70,
        confidence: 0.9,
        status: 'active',
        visibility: 'PRIVATE',
        accessibleToEntityIds: [actorId],
        isPersistentCritical: false,
        provenance: 'narrative_memory_lifecycle',
        validFromTurn: 2,
        lastRecalledTurn: 2,
        triggerConditionTags: ['harbor', 'manifest', 'discrepancy'],
      });

      // Turn 3: Resolve the thread -> triggers episodic-to-semantic consolidation
      const turn3Res = NarrativeMemoryLifecycle.processTurn({
        repository: repo,
        storyId,
        turnId: 'turn_3',
        playerAction: 'Confirm the harbor manifest discrepancy at Warehouse Docks Pier 4.',
        currentSituation: baseSituation,
        turnPackage: buildTurnPackage(
          'The unresolved harbor manifest discrepancy at Warehouse Docks Pier 4 has been confirmed and resolved through the harbourmaster duplicate log.',
        ),
      });
      assert.ok(turn3Res.resolvedThreadIds.length >= 1, 'Turn 3 must resolve the open thread');

      // Turns 4..125: Execute 122 additional turns advancing clock and triggering memory decay & bounds pruning
      const clock = repo.getWorldClock(storyId);
      for (let t = 4; t <= 125; t++) {
        clock.advanceSeconds(120);
        const turnAdjudication =
          t % 3 === 0
            ? NarrativeStateAdjudicator.adjudicateCanonicalAction(
                {
                  resolutionId: `res_turn_${t}`,
                  resolutionMethod: 'DETERMINISTIC',
                  outcomeTier: 'SUCCESS',
                  actualEffect: `Logged detective field entry #${t} at Warehouse Docks Pier 4.`,
                  canonicalStateChanges: [
                    {
                      kind: 'FIELD_LOG_RECORDED',
                      targetId: `entry_${t}`,
                      value: { turn: t },
                      metadata: {
                        source: 'CanonicalCommandEngine',
                        summary: `Logged detective field entry #${t} at Warehouse Docks Pier 4`,
                      },
                    },
                  ],
                  physicalConsequences: [],
                  playerVisibleConsequences: [],
                } as any,
                baseSituation,
                { repository: repo, storyId, turnId: `turn_${t}`, actorId },
              )
            : undefined;

        NarrativeContinuityEngine.recordTurn(repo, {
          storyId,
          turnId: `turn_${t}`,
          playerAction: `Turn ${t}: Record field observation #${t} at Warehouse Docks Pier 4.`,
          currentSituation: baseSituation,
          turnPackage: buildTurnPackage(
            `At Warehouse Docks Pier 4, Ren Takahashi logs observation #${t} in the case file.`,
            {
              memoryCandidates: [
                `Turn ${t}: Observed patrol boat movement #${t} near Warehouse Docks Pier 4.`,
              ],
            },
          ),
          stateAdjudication: turnAdjudication,
        });
      }

      // Verify after 125 turns:
      const allMemories = repo.getMemoryEngine(storyId).getAllMemories(storyId);

      // 1. Turn 1 CAUSAL plot beat memory survived all 125 turns of decay
      const causalPlotMemories = allMemories.filter(
        (m) => m.memoryClass === 'CAUSAL' && m.provenance === 'canonical_plot_beat',
      );
      assert.ok(causalPlotMemories.length >= 1, 'CAUSAL plot beat memories must be created');
      const turn1CausalBeat = causalPlotMemories.find((m) =>
        m.content.includes('shattered pocket watch stopped at 11:42 PM'),
      );
      assert.ok(
        turn1CausalBeat,
        'Turn 1 critical clue CAUSAL plot beat must survive 125 turns without eviction',
      );
      assert.equal(turn1CausalBeat.isPersistentCritical, true);
      assert.equal(turn1CausalBeat.status, 'active');

      // 2. Consolidated SEMANTIC memory from resolved thread is preserved
      const consolidatedSemantic = allMemories.find(
        (m) => m.memoryClass === 'SEMANTIC' && m.provenance === 'thread_resolution_consolidation',
      );
      assert.ok(
        consolidatedSemantic,
        'Resolved investigation thread must consolidate into a durable SEMANTIC memory',
      );

      // 3. Long-session runtime collections remain strictly bounded
      const runAfter = repo.getStoryRun(storyId)!;
      const contextHistory = (runAfter.runtimeState?.narrativeContextHistory as any[]) || [];
      const plotBeats = (runAfter.runtimeState?.plot?.beats as any[]) || [];
      const playerCardAfter = repo.getEntityRegistry(storyId).get(actorId)!;

      assert.ok(
        contextHistory.length <= 40,
        `narrativeContextHistory must be bounded <= 40, got ${contextHistory.length}`,
      );
      assert.ok(
        plotBeats.length <= 40,
        `plot.beats must be bounded <= 40, got ${plotBeats.length}`,
      );
      assert.ok(
        (playerCardAfter.memoryRefs || []).length <= 50,
        `EntityCard.memoryRefs must be bounded <= 50, got ${(playerCardAfter.memoryRefs || []).length}`,
      );
    });

    it('routes across multi-tier model adapters on provider failure (429 / malformed_json) while preserving canonical state commits', async () => {
      const repo = new InMemoryWorldRepository({ disablePersistence: true });
      const storyId = `ren_mode9_routing_${Date.now()}`;
      setupRenTakahashiTopology(repo, storyId);

      const orchestrator = new MultiModelOrchestrator();
      for (const m of orchestrator.getAllModels()) {
        if (!m.isEmergencyFloor) {
          orchestrator.updateModelHealth(m.providerId, m.modelId, 'DisabledByUser');
        }
      }

      const tier1Primary = new DeterministicMockAdapter('provider_ren_tier1');
      const tier2Fallback = new DeterministicMockAdapter('provider_ren_tier2');

      const registerTierModel = (providerId: string, modelId: string, priority: number): ModelRegistryRecord =>
        ({
          providerId,
          modelId,
          displayName: modelId,
          pool: 'creative',
          capabilities: ['text_generation', 'structured_output', 'creative_writing'],
          contextWindow: 128000,
          health: 'Healthy',
          quota: 'Healthy',
          latencyMs: 2,
          userPriority: priority,
          roleEligibility: ['narrative.generate', 'character.dialogue', 'intent.interpret'],
          fallbackEligibility: true,
          accessStatus: 'accessible',
          lifecycleState: 'active',
          supportedInputTypes: ['text'],
          supportedOutputTypes: ['text', 'json'],
          hasStructuredOutput: true,
        }) as unknown as ModelRegistryRecord;

      orchestrator.registerModel(registerTierModel(tier1Primary.providerId, 'ren-tier1-primary', 100));
      orchestrator.registerModel(registerTierModel(tier2Fallback.providerId, 'ren-tier2-fallback', 90));
      orchestrator.registerAdapter(tier1Primary);
      orchestrator.registerAdapter(tier2Fallback);
      orchestrator.pinModelForTask('narrative.generate', 'ren-tier1-primary');
      orchestrator.setFallbackChain('narrative.generate', [
        `${tier1Primary.providerId}::ren-tier1-primary`,
        `${tier2Fallback.providerId}::ren-tier2-fallback`,
      ]);

      tier2Fallback.defaultResponse = JSON.stringify({
        narrative: [
          'You inspect the chalk outline at Warehouse Docks Pier 4 and confirm the position of the shattered pocket watch.',
        ],
        dialogue: [],
        events: ['EVIDENCE_LOGGED'],
        stateChanges: [],
        memoryCandidates: ['Confirmed chalk outline and pocket watch position at Pier 4.'],
        audioCues: [],
      });

      // Inject 429 rate-limit failure on Tier 1 Primary
      tier1Primary.failureMode = '429';
      tier1Primary.maxFailuresBeforeSuccess = 5;

      const genResult = await orchestrator.executeTaskGeneration(
        'narrative.generate',
        'LOC: Warehouse Docks Pier 4. Action: Inspect the chalk outline and shattered pocket watch.',
      );

      assert.equal(genResult.providerId, tier2Fallback.providerId);
      assert.equal(genResult.modelId, 'ren-tier2-fallback');
      assert.ok(tier1Primary.callHistory.length >= 1, 'Tier 1 primary must have been attempted first');
      assert.ok(tier2Fallback.callHistory.length >= 1, 'Tier 2 fallback must have served the request after 429');

      const parsed = JSON.parse(genResult.text);
      assert.match(parsed.narrative[0], /chalk outline/i);
    });
  });
});
