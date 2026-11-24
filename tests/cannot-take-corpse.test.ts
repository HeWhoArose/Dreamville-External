import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SceneInteractionAuthority } from '../server/domain/sceneInteractionAuthority';
import { CanonicalCommandEngine } from '../server/domain/canonicalCommandEngine';
import { NarrativeStateAdjudicator } from '../server/domain/narrativeStateAdjudicator';
import { worldRepository, type InMemoryWorldRepository } from '../server/repositories/worldRepository';
import type { LocationSceneObject } from '../server/domain/types';
import type { EntityCard } from '../server/domain/entityCard';
import type { CurrentSituation } from '../server/domain/currentSituation';
import type { PlayerIntent } from '../server/domain/playerIntentInterpreter';

describe('Strict CANNOT_TAKE_CORPSE Invariant (F12)', () => {
  // 1. Crime Scene Victim Pickup Failure
  describe('Crime Scene Victim Pickup Rejection', () => {
    it('fails deterministically with CANNOT_TAKE_CORPSE when attempting to pick up a victim body scene object', () => {
      const storyId = 'test_corpse_pickup_' + Date.now();
      worldRepository.seedStory(storyId);
      const graph = worldRepository.getGeographyGraph(storyId);
      const locationId = 'loc_crime_scene_' + Date.now();
      const victimId = 'ent_victim_' + Date.now();
      const actorId = 'char_detective';

      const corpseObject: LocationSceneObject = {
        id: 'obj_victim_corpse',
        name: 'corpse of Frank Morgan',
        kind: 'OTHER',
        description: 'The deceased body of Frank Morgan.',
        visible: true,
        interactable: true,
        tags: ['investigation', 'corpse', 'victim', 'body'],
        properties: {
          worldDirectorRole: 'INVESTIGATION_BODY',
          slot: 'BODY',
          representsVictimRef: victimId,
          takeable: false,
          discoverable: true,
        },
        provenance: 'WORLD_DIRECTOR',
      };

      graph.addNode({
        id: locationId,
        name: 'Dockside Warehouse',
        description: 'A cold, dimly lit crime scene.',
        archetype: 'CRIME_SCENE' as any,
        sceneObjects: [corpseObject],
      } as any);

      const result = SceneInteractionAuthority.resolve({
        repository: worldRepository,
        storyId,
        actorId,
        locationId,
        actionText: 'I pick up the victim body and place it into my bag.',
      });

      assert.equal(result.attempted, true);
      assert.equal(result.committed, false);
      assert.equal(result.errorCode, 'CANNOT_TAKE_CORPSE');
      assert.ok(result.errorReason?.includes('CANNOT_TAKE_CORPSE'));
      assert.equal(result.canonicalStateChanges.length, 0);

      // Verify inventory remains untouched
      const inv = worldRepository.getInventoryEngine(storyId).getActorInventory(actorId);
      assert.equal(inv.length, 0);

      // Verify corpse scene object remains in geography graph
      const node = graph.getNode(locationId)!;
      assert.ok(node.sceneObjects.some((o) => o.id === corpseObject.id));
    });

    it('rejects action using "loot" verb targeting a deceased body', () => {
      const storyId = 'test_corpse_loot_' + Date.now();
      worldRepository.seedStory(storyId);
      const graph = worldRepository.getGeographyGraph(storyId);
      const locationId = 'loc_dock_' + Date.now();
      const actorId = 'char_detective';

      const corpseObject: LocationSceneObject = {
        id: 'obj_dead_body',
        name: 'corpse of victim',
        kind: 'OTHER',
        visible: true,
        interactable: true,
        tags: ['corpse', 'victim'],
        properties: {
          worldDirectorRole: 'INVESTIGATION_BODY',
          takeable: false,
        },
      };

      graph.addNode({
        id: locationId,
        name: 'Dock',
        archetype: 'CRIME_SCENE' as any,
        sceneObjects: [corpseObject],
      } as any);

      const result = SceneInteractionAuthority.resolve({
        repository: worldRepository,
        storyId,
        actorId,
        locationId,
        actionText: 'I loot the corpse.',
      });

      assert.equal(result.attempted, true);
      assert.equal(result.committed, false);
      assert.equal(result.errorCode, 'CANNOT_TAKE_CORPSE');
    });
  });

  // 2. Dead NPC Entity Pickup Failure
  describe('Deceased NPC Entity Pickup Rejection', () => {
    it('fails deterministically when targeting a deceased NPC entity card', () => {
      const storyId = 'test_dead_npc_' + Date.now();
      worldRepository.seedStory(storyId);
      const graph = worldRepository.getGeographyGraph(storyId);
      const locationId = 'loc_alley_' + Date.now();
      const deadNpcId = 'npc_fallen_guard';
      const actorId = 'char_player';

      const deadCard: EntityCard = {
        id: deadNpcId,
        name: 'Fallen Guard',
        kind: 'NPC' as any,
        classification: {
          role: 'GUARD',
          tags: ['corpse', 'guard'],
        },
        traits: ['corpse', 'guard'],
        worldState: {
          isAlive: false,
          currentActivity: 'deceased',
        },
        lifecycle: {
          status: 'DEAD' as any,
          enteredCurrentStateAtTurn: 1,
          stateHistory: [],
        },
      } as any;

      worldRepository.saveEntityCard(storyId, deadCard);

      graph.addNode({
        id: locationId,
        name: 'Dark Alley',
        archetype: 'ALLEY' as any,
        sceneObjects: [],
      } as any);

      const result = SceneInteractionAuthority.resolve({
        repository: worldRepository,
        storyId,
        actorId,
        locationId,
        actionText: 'I take the Fallen Guard body into my inventory.',
      });

      assert.equal(result.attempted, true);
      assert.equal(result.committed, false);
      assert.equal(result.errorCode, 'CANNOT_TAKE_CORPSE');
      assert.ok(result.errorReason?.includes('CANNOT_TAKE_CORPSE'));
    });
  });

  // 3. Command Engine Precondition Rejection
  describe('Canonical Command Engine Invariant Enforcement', () => {
    it('precondition check rejects TAKE/PICKUP command targeting a deceased entity with CANNOT_TAKE_CORPSE', async () => {
      const storyId = 'test_cce_corpse_' + Date.now();
      worldRepository.seedStory(storyId);
      const deadVictimId = 'ent_victim_cce_' + Date.now();

      const deadCard: EntityCard = {
        id: deadVictimId,
        name: 'Murder Victim',
        worldState: { isAlive: false },
        lifecycle: { status: 'DEAD' as any },
      } as any;
      worldRepository.saveEntityCard(storyId, deadCard);

      const engine = CanonicalCommandEngine.getInstance();
      const command = {
        commandId: 'cmd_take_corpse_' + Date.now(),
        storyId,
        actorId: 'char_player',
        type: 'INTERACT' as const,
        source: 'PLAYER' as const,
        payload: {
          action: 'TAKE',
          targetEntityId: deadVictimId,
        },
      };

      const result = await engine.execute(worldRepository as InMemoryWorldRepository, command, async () => {
        return { success: true, summary: 'Should not run handler' };
      });

      assert.equal(result.success, false);
      assert.equal(result.errorReason, 'CANNOT_TAKE_CORPSE');
      assert.equal(result.rolledBack, false);
    });
  });

  // 4. Narrative State Adjudicator Proposal Rejection
  describe('Narrative State Adjudicator Proposal Rejection', () => {
    it('rejects inventory proposals targeting deceased bodies with CANNOT_TAKE_CORPSE', () => {
      const storyId = 'test_adj_corpse_' + Date.now();
      worldRepository.seedStory(storyId);
      const deadVictimId = 'ent_victim_adj_' + Date.now();
      const actorId = 'char_player';

      const deadCard: EntityCard = {
        id: deadVictimId,
        name: 'Dead Informant',
        worldState: { isAlive: false },
        lifecycle: { status: 'DEAD' as any },
        traits: ['corpse'],
      } as any;
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
        turnId: 'turn_1',
        actorId,
        playerIntent: intent,
        currentSituation: situation,
        turnPackage: {
          narrative: ['You hoist the dead informant.'],
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
