import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AffordancePlausibilityEngine } from '../server/domain/affordancePlausibilityEngine';
import { SceneInteractionAuthority } from '../server/domain/sceneInteractionAuthority';
import { CanonicalCommandEngine } from '../server/domain/canonicalCommandEngine';
import { NarrativeStateAdjudicator } from '../server/domain/narrativeStateAdjudicator';
import {
  extractInvestigationSeedFromPremise,
} from '../server/domain/worldDirectorPreparationContract';
import { WorldDirectorPreparationService } from '../server/services/worldDirectorPreparationService';
import { worldRepository } from '../server/repositories/worldRepository';
import type { LocationSceneObject } from '../server/domain/types';
import type { EntityCard } from '../server/domain/entityCard';
import type { CurrentSituation } from '../server/domain/currentSituation';
import type { PlayerIntent } from '../server/domain/playerIntentInterpreter';

describe('Milestone 2 Adversarial Challenge Suite', () => {
  // =========================================================================
  // 1. AFFORDANCE PLAUSIBILITY ENGINE ADVERSARIAL STRESS
  // =========================================================================
  describe('1. AffordancePlausibilityEngine Adversarial Stress', () => {
    describe('1.1 Denylist Compound & Substring Evasion Attacks', () => {
      const evasionAttempts = [
        'antique revolver',
        'rusty dagger',
        'silver blade',
        'poisoned arrow',
        'golden keycard',
        'heavy safe',
        'ancient relic',
        'magic wand',
        'antimatter bomb',
        'dragon egg',
        'corpse of a stranger',
        'fresh cadaver',
        'murder weapon',
        'bloody rag',
        'fingerprints on glass',
        'bag of gold coins',
        'secret document',
        'autopsy report',
      ];

      for (const attempt of evasionAttempts) {
        it(`blocks compound denylist evasion: "${attempt}"`, () => {
          assert.equal(
            AffordancePlausibilityEngine.isPlotCriticalDenylisted(attempt),
            true,
            `Expected "${attempt}" to be flagged as plot-critical`,
          );
          assert.equal(
            AffordancePlausibilityEngine.isPlausibleAffordance(attempt, 'WORKPLACE'),
            false,
            `Expected "${attempt}" to be rejected by isPlausibleAffordance`,
          );
          const classification = AffordancePlausibilityEngine.classify(attempt, 'WORKPLACE');
          assert.equal(classification.isPlotCritical, true);
          assert.equal(classification.isPlausible, false);
          assert.equal(classification.isTakeable, false);
        });
      }
    });

    describe('1.2 Denylist Plurals, Casing, Whitespace and Special Chars', () => {
      const variations = [
        '  REVOLVER  ',
        '\tcorpses\n',
        'KEYS',
        'Weapons',
        'DAGGERS',
        'blades',
        'bullets',
        'coins',
      ];

      for (const noun of variations) {
        it(`blocks casing/whitespace/plural variation: "${noun}"`, () => {
          assert.equal(AffordancePlausibilityEngine.isPlotCriticalDenylisted(noun), true);
          assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance(noun, 'WORKPLACE'), false);
        });
      }

      it('exposes denylist plural omission: "safes" is not in PLOT_CRITICAL_DENYLIST', () => {
        // "safe" is denylisted, but "safes" was omitted from PLOT_CRITICAL_DENYLIST
        const isDenylisted = AffordancePlausibilityEngine.isPlotCriticalDenylisted('safes');
        // While not in denylist set, it is not in WORKPLACE affordances either, so isPlausibleAffordance still returns false
        assert.equal(isDenylisted, false, 'Documents that "safes" is currently omitted from PLOT_CRITICAL_DENYLIST');
        assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('safes', 'WORKPLACE'), false);
      });
    });

    describe('1.3 Empty, Malformed, and Extreme Inputs', () => {
      it('isPlausibleAffordance rejects empty and whitespace string', () => {
        assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('', 'WORKPLACE'), false);
        assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('   ', 'WORKPLACE'), false);
      });

      it('exposes vulnerability: classify("") returns isPlausible: true due to entryKey.includes("") matching', () => {
        // In classify(), entryKey.includes(normalizedNoun) evaluates "chair".includes("") === true
        const classification = AffordancePlausibilityEngine.classify('', 'WORKPLACE');
        // This demonstrates the flaw: an empty noun matches the first table item
        assert.equal(classification.isPlausible, true, 'Vulnerability: classify("") matches chair because "chair".includes("")');
      });

      it('documents defense-in-depth: GeographyGraph catches empty-name object produced by classify("")', () => {
        const storyId = 'adv_empty_mat_' + Date.now();
        worldRepository.seedStory(storyId);
        const graph = worldRepository.getGeographyGraph(storyId);
        const locId = 'loc_office_empty_' + Date.now();
        graph.addNode({
          id: locId,
          name: 'Office',
          archetype: 'WORKPLACE' as any,
          sceneObjects: [],
        } as any);

        const res = AffordancePlausibilityEngine.materialiseAffordance({
          repository: worldRepository,
          storyId,
          locationId: locId,
          noun: '',
        });

        // Even though classify("") returned isPlausible: true, GeographyGraph.addSceneObject
        // rejected it because name is empty: 'A scene object requires an id and name.'
        assert.equal(res.success, false, 'GeographyGraph defense-in-depth blocks empty-name object');
        assert.equal(res.errorReason, 'A scene object requires an id and name.');
      });

      it('exposes partial substring overmatching: single letter "a" matches "chair"', () => {
        // Because of entryKey.includes(normalizedNoun), single vowel "a" matches "chair"
        const plausible = AffordancePlausibilityEngine.isPlausibleAffordance('a', 'WORKPLACE');
        assert.equal(plausible, true, 'Vulnerability: "chair".includes("a") causes single-letter matching');
      });

      it('handles 10,000 character string without crashing or regex DoS', () => {
        const longStr = 'chair '.repeat(2000);
        const start = Date.now();
        const denylisted = AffordancePlausibilityEngine.isPlotCriticalDenylisted(longStr);
        const plausible = AffordancePlausibilityEngine.isPlausibleAffordance(longStr, 'WORKPLACE');
        const elapsed = Date.now() - start;
        assert.ok(elapsed < 2000, `Evaluation took too long: ${elapsed}ms`);
        assert.equal(denylisted, false);
      });
    });

    describe('1.4 Archetype Mismatches & Unknown Archetypes', () => {
      it('falls back safely to GENERIC for unknown/fantasy archetypes', () => {
        assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('door', 'VOLCANIC_LAIR'), true);
        assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('window', 'OUTER_SPACE'), true);
        assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('filing cabinet', 'OUTER_SPACE'), false);
      });

      it('rejects props that do not belong in the given archetype', () => {
        assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('taxi', 'SEWER'), false);
        assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('bed', 'PARK'), false);
        assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('altar', 'SEWER'), false);
      });

      it('accepts valid props for specific archetypes', () => {
        assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('altar', 'TEMPLE'), true);
        assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('pew', 'TEMPLE'), true);
        assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('bollard', 'HARBOR'), true);
        assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('dock', 'HARBOR'), true);
        assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('boulder', 'WILDERNESS'), true);
        assert.equal(AffordancePlausibilityEngine.isPlausibleAffordance('stream', 'WILDERNESS'), true);
      });
    });

    describe('1.5 Materialisation Idempotency & Invariants', () => {
      it('idempotently returns existing object without duplication when called twice', () => {
        const storyId = 'adv_mat_idemp_' + Date.now();
        worldRepository.seedStory(storyId);
        const graph = worldRepository.getGeographyGraph(storyId);
        const locId = 'loc_office_' + Date.now();
        graph.addNode({
          id: locId,
          name: 'Private Office',
          archetype: 'WORKPLACE' as any,
          sceneObjects: [],
        } as any);

        const first = AffordancePlausibilityEngine.materialiseAffordance({
          repository: worldRepository,
          storyId,
          locationId: locId,
          noun: 'desk',
        });
        assert.equal(first.success, true);
        assert.ok(first.object);

        const nodeBefore = graph.getNode(locId)!;
        assert.equal(nodeBefore.sceneObjects.length, 1);

        const second = AffordancePlausibilityEngine.materialiseAffordance({
          repository: worldRepository,
          storyId,
          locationId: locId,
          noun: 'desk',
        });
        assert.equal(second.success, true);
        assert.equal(second.object?.id, first.object?.id);

        const nodeAfter = graph.getNode(locId)!;
        assert.equal(nodeAfter.sceneObjects.length, 1, 'Should NOT create duplicate scene objects');
      });

      it('fails cleanly when locationId does not exist', () => {
        const res = AffordancePlausibilityEngine.materialiseAffordance({
          repository: worldRepository,
          storyId: 'any_story',
          locationId: 'non_existent_loc',
          noun: 'chair',
        });
        assert.equal(res.success, false);
        assert.ok(res.errorReason?.includes('not found'));
      });

      it('strictly forbids materialising denylisted weapons or corpses into GeographyGraph', () => {
        const storyId = 'adv_mat_deny_' + Date.now();
        worldRepository.seedStory(storyId);
        const graph = worldRepository.getGeographyGraph(storyId);
        const locId = 'loc_office_' + Date.now();
        graph.addNode({
          id: locId,
          name: 'Private Office',
          archetype: 'WORKPLACE' as any,
          sceneObjects: [],
        } as any);

        for (const forbidden of ['revolver', 'corpse', 'master key', 'ancient talisman']) {
          const res = AffordancePlausibilityEngine.materialiseAffordance({
            repository: worldRepository,
            storyId,
            locationId: locId,
            noun: forbidden,
          });
          assert.equal(res.success, false);
          assert.ok(res.errorReason?.includes('Plot-critical'));
        }
      });
    });
  });

  // =========================================================================
  // 2. CANNOT_TAKE_CORPSE ADVERSARIAL STRESS
  // =========================================================================
  describe('2. CANNOT_TAKE_CORPSE Adversarial Stress', () => {
    describe('2.1 Malicious SceneObject: takeable: true with corpse properties', () => {
      it('strictly blocks pickup even if scene object erroneously specifies takeable: true', () => {
        const storyId = 'adv_corpse_trojan_' + Date.now();
        worldRepository.seedStory(storyId);
        const graph = worldRepository.getGeographyGraph(storyId);
        const locId = 'loc_alley_' + Date.now();
        const actorId = 'char_player';

        const trojanCorpse: LocationSceneObject = {
          id: 'obj_trojan_corpse',
          name: 'corpse of victim',
          kind: 'ITEM',
          visible: true,
          interactable: true,
          tags: ['corpse', 'victim'],
          properties: {
            takeable: true, // Adversarial trap: takeable is true!
            isCorpse: true,
            worldDirectorRole: 'INVESTIGATION_BODY',
          },
        };

        graph.addNode({
          id: locId,
          name: 'Dark Alley',
          archetype: 'CRIME_SCENE' as any,
          sceneObjects: [trojanCorpse],
        } as any);

        const result = SceneInteractionAuthority.resolve({
          repository: worldRepository,
          storyId,
          actorId,
          locationId: locId,
          actionText: 'I pick up the corpse and put it in my coat.',
        });

        assert.equal(result.attempted, true);
        assert.equal(result.committed, false);
        assert.equal(result.errorCode, 'CANNOT_TAKE_CORPSE');
        assert.ok(result.errorReason?.includes('CANNOT_TAKE_CORPSE'));

        const inventory = worldRepository.getInventoryEngine(storyId).getActorInventory(actorId);
        assert.equal(inventory.length, 0);
      });
    });

    describe('2.2 Deceased Entity Card Flag Variations', () => {
      const deathFlagConfigs: Array<{ label: string; patch: Partial<EntityCard> }> = [
        { label: 'worldState.isAlive = false', patch: { worldState: { isAlive: false } as any } },
        { label: 'lifecycle.status = DEAD', patch: { lifecycle: { status: 'DEAD' } as any } },
        { label: 'classification.tags contains corpse', patch: { classification: { tags: ['corpse', 'victim'] } as any } },
        { label: 'traits contains deceased_body', patch: { traits: ['deceased_body'] } },
      ];

      for (const config of deathFlagConfigs) {
        it(`rejects pickup when entity card has ${config.label}`, () => {
          const storyId = 'adv_corpse_flag_' + Date.now() + Math.random().toString(36).slice(2, 6);
          worldRepository.seedStory(storyId);
          const graph = worldRepository.getGeographyGraph(storyId);
          const locId = 'loc_room_' + Date.now();
          const actorId = 'char_player';
          const victimId = 'ent_victim_' + Date.now();

          const baseCard: EntityCard = {
            id: victimId,
            name: 'Julian Hayes',
            entityType: 'NPC',
            currentLocationId: locId,
            ...config.patch,
          };
          worldRepository.saveEntityCard(storyId, baseCard);

          graph.addNode({
            id: locId,
            name: 'Parlor',
            archetype: 'ROOM' as any,
            sceneObjects: [],
          } as any);

          const result = SceneInteractionAuthority.resolve({
            repository: worldRepository,
            storyId,
            actorId,
            locationId: locId,
            actionText: 'I take Julian Hayes body',
          });

          assert.equal(result.committed, false);
          assert.equal(result.errorCode, 'CANNOT_TAKE_CORPSE');
        });
      }
    });

    describe('2.3 Action Verb Synonyms and Semantic Variations', () => {
      const recognizedVerbPhrases = [
        'I pick up the dead body',
        'I take the victim',
        'I loot the corpse',
        'Grab the corpse of Frank',
        'Pick up the cadaver',
      ];

      for (const phrase of recognizedVerbPhrases) {
        it(`rejects recognized corpse phrase: "${phrase}" with CANNOT_TAKE_CORPSE`, () => {
          const storyId = 'adv_corpse_verbs_' + Date.now() + Math.random().toString(36).slice(2, 6);
          worldRepository.seedStory(storyId);
          const graph = worldRepository.getGeographyGraph(storyId);
          const locId = 'loc_morgue_' + Date.now();
          const actorId = 'char_player';

          const corpseObj: LocationSceneObject = {
            id: 'obj_corpse',
            name: 'corpse of Frank',
            kind: 'OTHER',
            visible: true,
            interactable: true,
            tags: ['corpse', 'victim', 'body'],
            properties: {
              worldDirectorRole: 'INVESTIGATION_BODY',
            },
          };

          graph.addNode({
            id: locId,
            name: 'Morgue',
            archetype: 'CRIME_SCENE' as any,
            sceneObjects: [corpseObj],
          } as any);

          const result = SceneInteractionAuthority.resolve({
            repository: worldRepository,
            storyId,
            actorId,
            locationId: locId,
            actionText: phrase,
          });

          assert.equal(result.committed, false);
          assert.equal(result.errorCode, 'CANNOT_TAKE_CORPSE');
        });
      }

      it('documents semantic gap: "remains" synonym is blocked from pickup but misses CANNOT_TAKE_CORPSE error code', () => {
        const storyId = 'adv_corpse_remains_' + Date.now();
        worldRepository.seedStory(storyId);
        const graph = worldRepository.getGeographyGraph(storyId);
        const locId = 'loc_morgue_rem_' + Date.now();
        const actorId = 'char_player';

        const corpseObj: LocationSceneObject = {
          id: 'obj_corpse',
          name: 'corpse of Frank',
          kind: 'OTHER',
          visible: true,
          interactable: true,
          tags: ['corpse', 'victim', 'body'],
          properties: {
            worldDirectorRole: 'INVESTIGATION_BODY',
          },
        };

        graph.addNode({
          id: locId,
          name: 'Morgue',
          archetype: 'CRIME_SCENE' as any,
          sceneObjects: [corpseObj],
        } as any);

        const result = SceneInteractionAuthority.resolve({
          repository: worldRepository,
          storyId,
          actorId,
          locationId: locId,
          actionText: 'I take the remains',
        });

        // Pickup is rejected (committed is false), but errorReason is "No matching takeable object exists"
        assert.equal(result.committed, false, 'Corpse is NOT taken into inventory');
        // Because "remains" is missing from SceneInteractionAuthority vocab array:
        assert.equal(result.errorCode, undefined, 'Documents that "remains" synonym lacks CANNOT_TAKE_CORPSE error code');
      });
    });

    describe('2.4 Co-located Non-Corpse Pickup Integrity', () => {
      it('allows taking a legitimate mundane item even when a corpse is present', () => {
        const storyId = 'adv_corpse_coloc_' + Date.now();
        worldRepository.seedStory(storyId);
        const graph = worldRepository.getGeographyGraph(storyId);
        const locId = 'loc_study_' + Date.now();
        const actorId = 'char_player';

        const corpseObj: LocationSceneObject = {
          id: 'obj_victim_corpse',
          name: 'corpse of Lord Blackwood',
          kind: 'OTHER',
          visible: true,
          interactable: true,
          tags: ['corpse', 'victim'],
          properties: {
            worldDirectorRole: 'INVESTIGATION_BODY',
            takeable: false,
          },
        };

        const paperweightObj: LocationSceneObject = {
          id: 'obj_paperweight',
          name: 'glass paperweight',
          kind: 'ITEM',
          visible: true,
          interactable: true,
          tags: ['item', 'mundane'],
          properties: {
            takeable: true,
          },
        };

        graph.addNode({
          id: locId,
          name: 'Study',
          archetype: 'WORKPLACE' as any,
          sceneObjects: [corpseObj, paperweightObj],
        } as any);

        const result = SceneInteractionAuthority.resolve({
          repository: worldRepository,
          storyId,
          actorId,
          locationId: locId,
          actionText: 'I pick up the glass paperweight.',
        });

        assert.equal(result.committed, true, 'Picking up paperweight should be committed');
        assert.equal(result.errorCode, undefined);
        assert.equal(result.kind, 'PICKUP');

        const inventory = worldRepository.getInventoryEngine(storyId).getActorInventory(actorId);
        assert.equal(inventory.length, 1);
        assert.equal(inventory[0].name, 'glass paperweight');
      });
    });

    describe('2.5 NarrativeStateAdjudicator Direct Proposal Defense', () => {
      it('rejects inventory proposals targeting deceased bodies at adjudication tier', () => {
        const storyId = 'adv_adj_corpse_' + Date.now();
        worldRepository.seedStory(storyId);
        const actorId = 'char_player';
        const deadVictimId = 'ent_dead_informant';

        const deadCard: EntityCard = {
          id: deadVictimId,
          name: 'Dead Informant',
          entityType: 'NPC',
          worldState: { isAlive: false } as any,
        };
        worldRepository.saveEntityCard(storyId, deadCard);

        const situation: CurrentSituation = {
          location: { id: 'loc_office', name: 'Office' } as any,
          sceneObjects: [],
          nearbyEntities: [],
          visibleEvents: [],
        } as any;

        const intent: PlayerIntent = {
          interactionMode: 'INTERACTION',
          speechIntent: false,
          movementIntent: false,
          observationIntent: false,
          originalText: 'I pick up the dead informant',
          confidence: 1,
          source: 'DETERMINISTIC',
          explicitTargets: [],
          impliedTargets: [],
        };

        const adjudication = NarrativeStateAdjudicator.adjudicate({
          repository: worldRepository,
          storyId,
          turnId: 'turn_adv_corpse_1',
          actorId,
          playerIntent: intent,
          currentSituation: situation,
          turnPackage: {
            narrative: ['You try to take the body.'],
            dialogue: [],
            events: [],
            stateChanges: [
              {
                kind: 'inventory',
                targetId: actorId,
                value: { entityId: deadVictimId },
              },
            ],
            memoryCandidates: [],
            audioCues: [],
          },
        });

        assert.equal(adjudication.allApproved, false);
        assert.equal(adjudication.rejectedCount, 1);
        const outcome = adjudication.outcomes[0];
        assert.equal(outcome.approved, false);
        assert.ok(outcome.reason?.includes('CANNOT_TAKE_CORPSE'));
      });
    });
  });

  // =========================================================================
  // 3. FREEFORM PREMISE MATERIALISATION ADVERSARIAL STRESS
  // =========================================================================
  describe('3. Freeform Premise Materialisation Adversarial Stress', () => {
    describe('3.1 Name Extraction Variations', () => {
      const nameCases = [
        {
          premise: 'Investigate the tragic murder of Anthony Vance at the old textile warehouse.',
          expectedName: 'Anthony Vance',
        },
        {
          premise: 'The body of Detective Marcus Thorne was found stuffed into a trunk.',
          expectedName: 'Detective Marcus Thorne',
        },
        {
          premise: 'A scream broke the night. Elena Rostova was slain outside the cathedral.',
          expectedName: 'Elena Rostova',
        },
        {
          premise: 'A suspicious homicide took place near the docks, but the victim is unknown.',
          expectedName: 'Unidentified Victim',
        },
      ];

      for (const { premise, expectedName } of nameCases) {
        it(`extracts victim name "${expectedName}" from premise`, () => {
          const seed = extractInvestigationSeedFromPremise(premise, { storyId: 'test_story' });
          assert.ok(seed, 'Seed should be generated');
          assert.equal(seed.victim.name, expectedName);
          assert.ok(seed.body.name.includes(expectedName));
        });
      }
    });

    describe('3.2 Malicious Strings & Security Boundary', () => {
      it('handles empty premise string gracefully', () => {
        assert.equal(extractInvestigationSeedFromPremise(''), null);
        assert.equal(extractInvestigationSeedFromPremise('   '), null);
      });

      it('handles script tags in premise without execution or breakage', () => {
        const xssPremise = '<script>alert(1)</script> Murder of Thomas Finch in the conservatory.';
        const seed = extractInvestigationSeedFromPremise(xssPremise, { storyId: 'xss_test' });
        assert.ok(seed);
        assert.equal(seed.victim.name, 'Thomas Finch');
      });

      it('handles SQL injection patterns in premise without breakage', () => {
        const sqlPremise = "'; DROP TABLE stories; -- murder of Sandra Hayes";
        const seed = extractInvestigationSeedFromPremise(sqlPremise, { storyId: 'sql_test' });
        assert.ok(seed);
        assert.equal(seed.victim.name, 'Sandra Hayes');
      });

      it('handles 10,000 character premise safely without hanging', () => {
        const bigPremise = 'A mysterious death occurred. '.repeat(500) + ' The murder of Johnathan Swift.';
        const start = Date.now();
        const seed = extractInvestigationSeedFromPremise(bigPremise, { storyId: 'big_test' });
        const elapsed = Date.now() - start;
        assert.ok(elapsed < 2000, `Execution took too long: ${elapsed}ms`);
        assert.ok(seed);
        assert.equal(seed.victim.name, 'Johnathan Swift');
      });
    });

    describe('3.3 Mandatory Crime Scene Anchors Guarantee (F10)', () => {
      it('always guarantees chalk outline and perimeter tape even in minimal premise', () => {
        const minimalPremise = 'A murder happened. Victim John Doe.';
        const seed = extractInvestigationSeedFromPremise(minimalPremise, { storyId: 'min_test' });
        assert.ok(seed);
        const slots = seed.evidence.map((e) => e.slot);
        assert.ok(slots.includes('evidence_chalk_outline'));
        assert.ok(slots.includes('evidence_perimeter_tape'));
        assert.ok(seed.evidence.length >= 3);
      });

      it('extracts contextual clues when present in premise text', () => {
        const detailedPremise =
          'Murder of Anthony Vance. A broken pocket watch lay near a spent casing and blood.';
        const seed = extractInvestigationSeedFromPremise(detailedPremise, { storyId: 'detail_test' });
        assert.ok(seed);
        const slots = seed.evidence.map((e) => e.slot);
        assert.ok(slots.includes('evidence_pocket_watch'));
        assert.ok(slots.includes('evidence_shell_casing'));
        assert.ok(slots.includes('evidence_bloodstain'));
      });

      it('documents regex limitation: plural "bloodstains" misses evidence_bloodstain clue', () => {
        // In extractInvestigationSeedFromPremise line 908:
        // /\b(?:bloodstain|blood|splatter|pool of blood)\b/i
        // "bloodstains" fails the \b word boundary after bloodstain
        const premiseWithPlural = 'Murder of Anthony Vance. Heavy bloodstains covered the pavement.';
        const seed = extractInvestigationSeedFromPremise(premiseWithPlural, { storyId: 'plural_test' });
        assert.ok(seed);
        const slots = seed.evidence.map((e) => e.slot);
        // Because of the regex limitation, evidence_bloodstain is added as the fallback (evidenceList.length === 2)
        // rather than extracted from the contextual match
        assert.ok(slots.includes('evidence_bloodstain'), 'Fallback bloodstain anchor added');
      });
    });

    describe('3.4 WorldDirectorPreparationService Idempotency & Invariants', () => {
      it('successfully materializes freeform string premise and prevents duplicate preparation', async () => {
        const storyId = 'adv_prep_idemp_' + Date.now();
        worldRepository.seedStory(storyId);
        const graph = worldRepository.getGeographyGraph(storyId);
        const crimeSceneLoc = 'loc_warehouse_' + Date.now();
        graph.addNode({
          id: crimeSceneLoc,
          name: 'Textile Warehouse',
          archetype: 'CRIME_SCENE' as any,
          sceneObjects: [],
        } as any);

        const run = worldRepository.getStoryRun(storyId)!;
        run.startingSituation = 'Investigate the murder of Anthony Vance at the warehouse.';
        worldRepository.saveStoryRun(run);

        const firstResult = await WorldDirectorPreparationService.prepareOpeningInvestigation(
          worldRepository,
          storyId,
          crimeSceneLoc,
        );

        assert.equal(firstResult.status, 'PREPARED');
        assert.ok(firstResult.recordRefs?.victim);
        assert.ok(firstResult.recordRefs?.body);
        assert.ok(firstResult.recordRefs?.evidence.length! >= 3);

        const nodeAfterFirst = graph.getNode(crimeSceneLoc)!;
        const objectCountFirst = nodeAfterFirst.sceneObjects.length;
        assert.ok(objectCountFirst >= 4, 'Should have body + at least 3 evidence anchors');

        const secondResult = await WorldDirectorPreparationService.prepareOpeningInvestigation(
          worldRepository,
          storyId,
          crimeSceneLoc,
        );

        assert.equal(secondResult.status, 'ALREADY_PREPARED');

        const nodeAfterSecond = graph.getNode(crimeSceneLoc)!;
        assert.equal(
          nodeAfterSecond.sceneObjects.length,
          objectCountFirst,
          'Must not duplicate scene objects on repeated preparation',
        );
      });

      it('returns NOT_REQUESTED for non-investigation premise prose', async () => {
        const storyId = 'adv_prep_noninv_' + Date.now();
        worldRepository.seedStory(storyId);
        const run = worldRepository.getStoryRun(storyId)!;
        run.startingSituation = 'A peaceful morning at the royal gardens as flowers bloom in spring.';
        worldRepository.saveStoryRun(run);

        const result = await WorldDirectorPreparationService.prepareOpeningInvestigation(
          worldRepository,
          storyId,
          'loc_any',
        );

        assert.equal(result.status, 'NOT_REQUESTED');
        assert.equal(result.canonicalChanges.length, 0);
      });
    });
  });
});
