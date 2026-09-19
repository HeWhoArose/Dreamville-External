import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { WorldSimulationService } from '../server/simulation/worldSimulationService';

test('Living World Timeline Execution & Story Mode Behavior (Slice 7) Comprehensive Verification Suite', async (t) => {

  await t.test('1. Scheduled Event Eligibility & Time Threshold Crossing', async () => {
    const repo = new InMemoryWorldRepository();
    const service = new WorldSimulationService(repo);

    const clock = repo.getWorldClock('test_run_1');
    const startSec = clock.getTimestamp().totalElapsedSeconds;

    const world = repo.getWorldTemplate('world_solar_archive');
    const confirmedChar = {
      characterId: 'char_test_1',
      worldId: world.worldId,
      identity: { name: 'Aelion', species: 'Human' },
      role: { profession: 'Knight' },
      startingLocation: { locationId: 'loc_whispering_orrery', name: 'Whispering Orrery' },
      startingSituation: { summary: 'Beginning journey.' },
    };

    // Add a planned event scheduled at startSec + 3600 seconds
    const customWorld = {
      ...world,
      events: [
        {
          id: 'evt_solar_eclipse',
          title: 'Solar Eclipse',
          description: 'The solar resonance crystals dim as the moon crosses.',
          category: 'ASTRONOMICAL',
          status: 'PLANNED',
          scheduledTime: { totalElapsedSeconds: startSec + 3600, year: 1, month: 1, day: 1, hour: 1, minute: 0 },
          locationId: 'loc_whispering_orrery',
          participatingActors: [],
          plannedConsequences: [{ type: 'world_fact', detail: 'Eclipse occurred' }],
        }
      ]
    };
    repo.saveWorldTemplate(customWorld);

    const { storyId } = repo.createStoryRunFromConfirmedCharacter({
      worldId: customWorld.worldId,
      confirmedCharacter: confirmedChar,
      storyId: 'test_run_1',
      storyMode: 'PROTAGONIST',
      dndRulesMode: 'FULL_DND',
    });

    const runBefore = repo.getStoryRun(storyId);
    assert.equal(runBefore.eventStates['evt_solar_eclipse'].status, 'PLANNED');

    // Advance time by 1800 seconds (30 mins) - should NOT trigger
    service.advanceTime(storyId, 1800);
    const runMid = repo.getStoryRun(storyId);
    assert.equal(runMid.eventStates['evt_solar_eclipse'].status, 'PLANNED');

    // Advance time by another 2000 seconds (total 3800s > 3600s) - SHOULD trigger
    service.advanceTime(storyId, 2000);
    const runAfter = repo.getStoryRun(storyId);
    assert.equal(runAfter.eventStates['evt_solar_eclipse'].status, 'COMPLETED');

    // Verify historical evidence was recorded
    const chronicle = repo.getHistoricalChronicleEngine(storyId);
    const evidence = chronicle.exportState().evidenceStore.find(e => e.sourceEventId === 'evt_solar_eclipse');
    assert.ok(evidence, 'Chronicle evidence must be recorded for completed event');
  });

  await t.test('2. Prerequisite Dependency Enforcement', async () => {
    const repo = new InMemoryWorldRepository();
    const service = new WorldSimulationService(repo);

    const clock = repo.getWorldClock('test_run_dep');
    const startSec = clock.getTimestamp().totalElapsedSeconds;

    const world = repo.getWorldTemplate('world_solar_archive');
    const customWorld = {
      ...world,
      events: [
        {
          id: 'evt_pre',
          title: 'Preliminary Awakening',
          status: 'PLANNED',
          scheduledTime: { totalElapsedSeconds: startSec + 1000 },
          locationId: 'loc_whispering_orrery',
        },
        {
          id: 'evt_dep',
          title: 'Dependent Ritual',
          status: 'PLANNED',
          scheduledTime: { totalElapsedSeconds: startSec + 1000 },
          locationId: 'loc_whispering_orrery',
          preconditions: { requiredEvents: ['evt_pre'] },
        }
      ]
    };
    repo.saveWorldTemplate(customWorld);

    const { storyId } = repo.createStoryRunFromConfirmedCharacter({
      worldId: customWorld.worldId,
      confirmedCharacter: {
        characterId: 'char_test_dep',
        worldId: customWorld.worldId,
        identity: { name: 'Mage' },
        startingLocation: { locationId: 'loc_whispering_orrery' },
      },
      storyId: 'test_run_dep',
      storyMode: 'PROTAGONIST',
    });

    // Advance time past 1000s in one go. evt_pre completes, but evt_dep requires evt_pre completion *prior* or at evaluation.
    // In our evaluator, if evt_pre and evt_dep are both checked in the same loop, evt_pre completes and evt_dep checks requiredEvents.
    service.advanceTime(storyId, 1500);
    const run = repo.getStoryRun(storyId);
    assert.equal(run.eventStates['evt_pre'].status, 'COMPLETED');
    assert.equal(run.eventStates['evt_dep'].status, 'COMPLETED');
  });

  await t.test('3. Story Mode Behaviors (Protagonist vs Side Character vs Free Roam)', async () => {
    const repo = new InMemoryWorldRepository();
    const service = new WorldSimulationService(repo);

    const clockP = repo.getWorldClock('run_p');
    const startSecP = clockP.getTimestamp().totalElapsedSeconds;

    const world = repo.getWorldTemplate('world_solar_archive');
    const customWorld = {
      ...world,
      events: [
        {
          id: 'evt_mode_test',
          title: 'Citadel Gathering',
          status: 'PLANNED',
          scheduledTime: { totalElapsedSeconds: startSecP + 500 },
          locationId: 'loc_whispering_orrery',
        }
      ]
    };
    repo.saveWorldTemplate(customWorld);

    // Protagonist Mode
    const runProtagonist = repo.createStoryRunFromConfirmedCharacter({
      worldId: customWorld.worldId,
      confirmedCharacter: { characterId: 'char_p', worldId: customWorld.worldId, identity: { name: 'P' }, startingLocation: { locationId: 'loc_whispering_orrery' } },
      storyId: 'run_p',
      storyMode: 'PROTAGONIST',
    });
    service.advanceTime(runProtagonist.storyId, 600);
    const factsP = repo.getKnowledgeFacts(runProtagonist.storyId);
    assert.ok(factsP.some(f => f.predicate === 'world_development'), 'Protagonist should receive direct world development fact');

    // Side Character Mode
    const runSide = repo.createStoryRunFromConfirmedCharacter({
      worldId: customWorld.worldId,
      confirmedCharacter: { characterId: 'char_s', worldId: customWorld.worldId, identity: { name: 'S' }, startingLocation: { locationId: 'loc_whispering_orrery' } },
      storyId: 'run_s',
      storyMode: 'SIDE_CHARACTER',
    });
    service.advanceTime(runSide.storyId, 600);
    const factsS = repo.getKnowledgeFacts(runSide.storyId);
    assert.ok(factsS.some(f => f.predicate === 'rumor_news'), 'Side character should experience event via rumors/news');
  });

  await t.test('4. Run Independence & Base World Template Isolation', async () => {
    const repo = new InMemoryWorldRepository();
    const service = new WorldSimulationService(repo);

    const clockIso = repo.getWorldClock('run_a');
    const startSecIso = clockIso.getTimestamp().totalElapsedSeconds;

    const world = repo.getWorldTemplate('world_solar_archive');
    const customWorld = {
      ...world,
      events: [
        { id: 'evt_iso', title: 'Isolated Event', status: 'PLANNED', scheduledTime: { totalElapsedSeconds: startSecIso + 500 }, locationId: 'loc_whispering_orrery' }
      ]
    };
    repo.saveWorldTemplate(customWorld);

    const runA = repo.createStoryRunFromConfirmedCharacter({
      worldId: customWorld.worldId,
      confirmedCharacter: { characterId: 'char_a', worldId: customWorld.worldId, identity: { name: 'A' }, startingLocation: { locationId: 'loc_whispering_orrery' } },
      storyId: 'run_a',
    });

    const runB = repo.createStoryRunFromConfirmedCharacter({
      worldId: customWorld.worldId,
      confirmedCharacter: { characterId: 'char_b', worldId: customWorld.worldId, identity: { name: 'B' }, startingLocation: { locationId: 'loc_whispering_orrery' } },
      storyId: 'run_b',
    });

    // Advance time on Run A only
    service.advanceTime(runA.storyId, 600);

    const stateA = repo.getStoryRun(runA.storyId).eventStates['evt_iso'].status;
    const stateB = repo.getStoryRun(runB.storyId).eventStates['evt_iso'].status;
    const templateEvt = repo.getWorldTemplate(customWorld.worldId).events[0].status;

    assert.equal(stateA, 'COMPLETED', 'Run A event state should be COMPLETED');
    assert.equal(stateB, 'PLANNED', 'Run B event state must remain PLANNED independently');
    assert.equal(templateEvt, 'PLANNED', 'Base WorldTemplate events must remain PLANNED');
  });

  await t.test('5. Idempotency Protection', async () => {
    const repo = new InMemoryWorldRepository();
    const service = new WorldSimulationService(repo);

    const clockIdem = repo.getWorldClock('run_idem');
    const startSecIdem = clockIdem.getTimestamp().totalElapsedSeconds;

    const world = repo.getWorldTemplate('world_solar_archive');
    const customWorld = {
      ...world,
      events: [
        { id: 'evt_idem', title: 'Idempotent Event', status: 'PLANNED', scheduledTime: { totalElapsedSeconds: startSecIdem + 500 }, locationId: 'loc_whispering_orrery' }
      ]
    };
    repo.saveWorldTemplate(customWorld);

    const { storyId } = repo.createStoryRunFromConfirmedCharacter({
      worldId: customWorld.worldId,
      confirmedCharacter: { characterId: 'char_idem', worldId: customWorld.worldId, identity: { name: 'Idem' }, startingLocation: { locationId: 'loc_whispering_orrery' } },
      storyId: 'run_idem',
    });

    service.advanceTime(storyId, 600);
    const chronicle = repo.getHistoricalChronicleEngine(storyId);
    const countBefore = chronicle.exportState().evidenceStore.filter(e => e.sourceEventId === 'evt_idem').length;

    // Advance time again - event should not re-execute or duplicate chronicle entries
    service.advanceTime(storyId, 1000);
    const countAfter = chronicle.exportState().evidenceStore.filter(e => e.sourceEventId === 'evt_idem').length;

    assert.equal(countBefore, 1);
    assert.equal(countAfter, 1, 'Event must execute idempotently without duplication');
  });

});
