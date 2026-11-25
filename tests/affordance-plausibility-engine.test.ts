import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AffordancePlausibilityEngine } from '../server/domain/affordancePlausibilityEngine';
import { worldRepository } from '../server/repositories/worldRepository';
import { SemanticNarrativeReview } from '../server/domain/semanticNarrativeReview';
import { resolveGroundedObservation } from '../server/domain/sceneInteractionAuthority';
import { CurrentSituationBuilder } from '../server/domain/currentSituation';
import type { CurrentSituation } from '../server/domain/currentSituation';
import type { PlayerIntent } from '../server/domain/playerIntentInterpreter';
import type { EphemeralNarrativePlan } from '../server/domain/narrativeDirector';

describe('AffordancePlausibilityEngine (F11)', () => {
  // 1. Archetype Mundane Affordances
  describe('Archetype Mundane Affordance Acceptance', () => {
    it('accepts mundane props in WORKPLACE and OFFICE', () => {
      for (const noun of ['office chair', 'chair', 'desk', 'filing cabinet', 'lamp', 'window', 'door']) {
        assert.equal(
          AffordancePlausibilityEngine.isPlausibleAffordance(noun, 'WORKPLACE'),
          true,
          `Expected '${noun}' to be plausible in WORKPLACE`,
        );
        assert.equal(
          AffordancePlausibilityEngine.isPlausibleAffordance(noun, 'OFFICE'),
          true,
          `Expected '${noun}' to be plausible in OFFICE alias`,
        );
      }
    });

    it('accepts mundane props in PARK', () => {
      for (const noun of ['bench', 'gravel path', 'pebble', 'fallen branch', 'fountain', 'trash bin']) {
        assert.equal(
          AffordancePlausibilityEngine.isPlausibleAffordance(noun, 'PARK'),
          true,
          `Expected '${noun}' to be plausible in PARK`,
        );
      }
    });

    it('accepts mundane props in SEWER', () => {
      for (const noun of ['sewer drain', 'pipe', 'grate', 'water', 'brick']) {
        assert.equal(
          AffordancePlausibilityEngine.isPlausibleAffordance(noun, 'SEWER'),
          true,
          `Expected '${noun}' to be plausible in SEWER`,
        );
      }
    });

    it('accepts mundane props in INN', () => {
      for (const noun of ['table', 'mug', 'serving counter', 'hearth', 'fireplace', 'chair']) {
        assert.equal(
          AffordancePlausibilityEngine.isPlausibleAffordance(noun, 'INN'),
          true,
          `Expected '${noun}' to be plausible in INN`,
        );
      }
    });

    it('accepts mundane props in STREET / URBAN_DISTRICT and CRIME_SCENE', () => {
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('taxi', 'STREET'), true);
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('yellow cab', 'URBAN_DISTRICT'), true);
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('lamppost', 'STREET'), true);
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('chalk outline', 'CRIME_SCENE'), true);
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('perimeter tape', 'CRIME_SCENE'), true);
      assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('bloodstain', 'CRIME_SCENE'), true);
    });
  });

  // 2. Plot-Critical Denylist Rejection
  describe('Plot-Critical Denylist Rejection', () => {
    const denylistedItems = [
      'revolver',
      'dagger',
      'sword',
      'brass key',
      'keycard',
      'victim body',
      'corpse',
      'dead body',
      'bloody rag',
      'fingerprints',
      'murder weapon',
      'locked safe',
      'strongbox',
      'gold coins',
      'wallet',
      'ancient talisman',
      'magic wand',
      'laser rifle',
      'antimatter bomb',
    ];

    for (const item of denylistedItems) {
      it(`strictly rejects plot-critical item '${item}'`, () => {
        assert.equal(
          AffordancePlausibilityEngine.isPlausibleAffordance(item, 'WORKPLACE'),
          false,
          `Expected plot-critical '${item}' to return false for isPlausibleAffordance`,
        );
        const classification = AffordancePlausibilityEngine.classify(item, 'WORKPLACE');
        assert.equal(classification.isPlotCritical, true, `Expected '${item}' to be marked isPlotCritical`);
        assert.equal(classification.isPlausible, false);
      });
    }
  });

  // 3. On-Demand Materialisation
  describe('On-Demand Affordance Materialisation', () => {
    it('materialises an unauthored office chair in an office as an immobile fixture', () => {
      const storyId = 'test_affordance_mat_' + Date.now();
      worldRepository.seedStory(storyId);
      const graph = worldRepository.getGeographyGraph(storyId);
      const locationId = 'loc_office_' + Date.now();
      graph.addNode({
        id: locationId,
        name: 'Private Office',
        description: 'A modest workplace with plain walls.',
        archetype: 'WORKPLACE',
        sceneObjects: [],
      } as any);

      const res = AffordancePlausibilityEngine.materialiseAffordance({
        repository: worldRepository,
        storyId,
        locationId,
        noun: 'office chair',
      });

      assert.equal(res.success, true);
      assert.ok(res.object);
      assert.equal(res.object?.name, 'Office chair');
      assert.equal(res.object?.kind, 'STRUCTURE');
      assert.equal(res.object?.properties?.takeable, false);
      assert.equal(res.object?.provenance, 'AFFORDANCE_PLAUSIBILITY_ENGINE');

      // Verify node contains object
      const node = graph.getNode(locationId)!;
      assert.ok(node.sceneObjects.some((o) => o.id === res.object!.id));
    });

    it('materialises a pebble in a park as a takeable item', () => {
      const storyId = 'test_affordance_pebble_' + Date.now();
      worldRepository.seedStory(storyId);
      const graph = worldRepository.getGeographyGraph(storyId);
      const locationId = 'loc_park_' + Date.now();
      graph.addNode({
        id: locationId,
        name: 'Municipal Park',
        description: 'Green park grounds.',
        archetype: 'PARK',
        sceneObjects: [],
      } as any);

      const res = AffordancePlausibilityEngine.materialiseAffordance({
        repository: worldRepository,
        storyId,
        locationId,
        noun: 'pebble',
      });

      assert.equal(res.success, true);
      assert.ok(res.object);
      assert.equal(res.object?.kind, 'ITEM');
      assert.equal(res.object?.properties?.takeable, true);
    });

    it('rejects on-demand materialisation of plot-critical items', () => {
      const storyId = 'test_affordance_weapon_' + Date.now();
      worldRepository.seedStory(storyId);
      const graph = worldRepository.getGeographyGraph(storyId);
      const locationId = 'loc_office_weapon_' + Date.now();
      graph.addNode({
        id: locationId,
        name: 'Office',
        archetype: 'WORKPLACE',
        sceneObjects: [],
      } as any);

      const res = AffordancePlausibilityEngine.materialiseAffordance({
        repository: worldRepository,
        storyId,
        locationId,
        noun: 'revolver',
      });

      assert.equal(res.success, false);
      assert.ok(res.errorReason?.includes('Plot-critical'));
    });
  });

  // 4. Narrative Review Grounding Without Pre-authoring
  describe('Narrative Review Grounding', () => {
    it('accepts observation of an unauthored office chair without UNSUPPORTED_CLAIM', () => {
      const storyId = 'test_review_chair_' + Date.now();
      worldRepository.seedStory(storyId);
      const player = worldRepository.getPlayerLifecycle(storyId)!;
      const loc = worldRepository.getGeographyGraph(storyId).getNode(player.locationId)!;
      loc.archetype = 'WORKPLACE' as any;

      const situation = CurrentSituationBuilder.build({
        storyId,
        playerAction: 'I examine the office chair.',
        viewerActorId: player.actorId,
        worldRepo: worldRepository,
      });

      const intent: PlayerIntent = {
        interactionMode: 'PASSIVE_OBSERVATION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: true,
        originalText: 'I examine the office chair.',
        confidence: 1,
        source: 'DETERMINISTIC',
        explicitTargets: [],
        impliedTargets: [],
      };

      const plan: EphemeralNarrativePlan = {
        turnId: 'turn_test',
        storyId,
        primaryBeat: 'OBSERVATION',
        selectedHooks: [],
        targetAtmosphere: 'TENSE',
        epistemicScope: 'LOCAL',
        canonicalGuidance: [],
        forbiddenAssumptions: [],
      } as any;

      const review = SemanticNarrativeReview.review({
        intent,
        situation,
        plan,
        turnPackage: {
          narrative: ['You look around, where an office chair rests by the window.'],
          dialogue: [],
          events: [],
          stateChanges: [],
          memoryCandidates: [],
          audioCues: [],
        },
      });

      assert.notEqual(review.decision, 'REJECT');
      assert.equal(
        review.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'),
        false,
        'Should not flag mundane office chair as UNSUPPORTED_CLAIM',
      );
    });

    it('rejects observation inventing an ungrounded revolver with UNSUPPORTED_CLAIM', () => {
      const storyId = 'test_review_revolver_' + Date.now();
      worldRepository.seedStory(storyId);
      const player = worldRepository.getPlayerLifecycle(storyId)!;
      const loc = worldRepository.getGeographyGraph(storyId).getNode(player.locationId)!;
      loc.archetype = 'WORKPLACE' as any;

      const situation = CurrentSituationBuilder.build({
        storyId,
        playerAction: 'I look around for a weapon.',
        viewerActorId: player.actorId,
        worldRepo: worldRepository,
      });

      const intent: PlayerIntent = {
        interactionMode: 'PASSIVE_OBSERVATION',
        speechIntent: false,
        movementIntent: false,
        observationIntent: true,
        originalText: 'I look around for a weapon.',
        confidence: 1,
        source: 'DETERMINISTIC',
        explicitTargets: [],
        impliedTargets: [],
      };

      const plan: EphemeralNarrativePlan = {
        turnId: 'turn_test',
        storyId,
        primaryBeat: 'OBSERVATION',
        selectedHooks: [],
        targetAtmosphere: 'TENSE',
        epistemicScope: 'LOCAL',
        canonicalGuidance: [],
        forbiddenAssumptions: [],
      } as any;

      const review = SemanticNarrativeReview.review({
        intent,
        situation,
        plan,
        turnPackage: {
          narrative: ['You look around, where a loaded revolver rests on the desk.'],
          dialogue: [],
          events: [],
          stateChanges: [],
          memoryCandidates: [],
          audioCues: [],
        },
      });

      assert.equal(
        review.violations.some((v) => v.code === 'UNSUPPORTED_CLAIM'),
        true,
        'Must flag unauthored revolver as UNSUPPORTED_CLAIM',
      );
    });
  });

  // 5. Grounded Observation Feedback
  describe('Grounded Observation Resolution', () => {
    it('returns grounded fixture evidence for mundane chair instead of crowd occupancy boilerplate', () => {
      const storyId = 'test_ground_chair_' + Date.now();
      worldRepository.seedStory(storyId);
      const player = worldRepository.getPlayerLifecycle(storyId)!;
      const loc = worldRepository.getGeographyGraph(storyId).getNode(player.locationId)!;
      loc.archetype = 'WORKPLACE' as any;

      const situation = CurrentSituationBuilder.build({
        storyId,
        playerAction: 'I look at the office chair.',
        viewerActorId: player.actorId,
        worldRepo: worldRepository,
      });

      const obs = resolveGroundedObservation(situation, 'I look at the office chair.');
      assert.equal(obs.relevant, true);
      assert.ok(obs.text?.includes('office chair') || obs.text?.includes('chair'));
      assert.ok(!obs.text?.includes('Canonical occupancy'), 'Should not fall back to crowd occupancy');
    });
  });
});
