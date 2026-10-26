import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldDirector } from '../server/domain/worldDirector';

test('World Director does not apply investigation requirements to an ordinary opening', () => {
  const report = WorldDirector.assessOpeningSceneReadiness({
    startingSituation: 'Arriving at the park to watch the sunset.',
  });
  assert.equal(report.profile, 'GENERAL');
  assert.equal(report.status, 'NOT_APPLICABLE');
  assert.deepEqual(report.issues, []);
});

test('World Director flags an investigation premise when victim and evidence anchors are absent', () => {
  const report = WorldDirector.assessOpeningSceneReadiness({
    startingSituation: 'Kaelen is investigating a fresh murder scene inside an isolated shack.',
    sceneObjects: [],
    visibleEntities: [],
    visibleEvents: [],
  });
  assert.equal(report.profile, 'INVESTIGATION');
  assert.equal(report.status, 'INCOMPLETE');
  assert.deepEqual(report.issues.map((issue) => issue.code), [
    'INVESTIGATION_VICTIM_NOT_ESTABLISHED',
    'INVESTIGATION_EVIDENCE_NOT_ESTABLISHED',
  ]);
});

test('World Director accepts a visible body and evidence while ignoring hidden objects', () => {
  const report = WorldDirector.assessOpeningSceneReadiness({
    startingSituation: 'Investigating a fresh murder scene.',
    sceneObjects: [
      { id: 'body', name: 'Victim body', kind: 'ENVIRONMENTAL_FEATURE', visible: true },
      { id: 'knife-hidden', name: 'Bloodied knife', tags: ['evidence'], visible: false },
      { id: 'blood-trail', name: 'Bloodstain near the threshold', tags: ['evidence', 'blood'], visible: true },
    ],
  });
  assert.equal(report.status, 'READY');
  assert.deepEqual(report.issues, []);
  assert.equal(report.evidenceCounts.visibleSceneObjects, 2);
});

test('World Director does not count hidden or absent entities as a victim anchor', () => {
  const report = WorldDirector.assessOpeningSceneReadiness({
    startingSituation: 'A detective investigates a homicide.',
    visibleEntities: [
      { id: 'hidden-victim', name: 'Victim', visibleToPlayer: false, presence: 'present' },
      { id: 'absent-victim', name: 'Deceased victim', presence: 'absent' },
    ],
    sceneObjects: [{ id: 'chair', name: 'Wooden chair', visible: true }],
  });
  assert.equal(report.status, 'INCOMPLETE');
  assert.ok(report.issues.some((issue) => issue.code === 'INVESTIGATION_VICTIM_NOT_ESTABLISHED'));
});
