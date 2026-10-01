import type { WorldRepository } from '../repositories/worldRepository';

export interface CanonicalNarrativeEventRecord {
  id: string;
  storyId: string;
  canonicalEventId?: string;
  commandId?: string;
  turnId: string;
  timestamp: string;
  summary: string;
  mutationPaths: string[];
  perspective: 'OBJECTIVE';
  provenance: 'CANONICAL_COMMAND';
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function recordCanonicalNarrativeEvent(
  repository: WorldRepository,
  params: {
    storyId: string;
    turnId: string;
    summary: string;
    mutationPaths?: string[];
    canonicalEventId?: string;
    commandId?: string;
  },
): CanonicalNarrativeEventRecord {
  const run = repository.getStoryRun(params.storyId);
  const timestamp = repository.getWorldClock(params.storyId).getTimestamp();
  const id = 'narrative_event_' + params.storyId + '_' + (params.canonicalEventId || params.commandId || params.turnId);
  const record: CanonicalNarrativeEventRecord = {
    id,
    storyId: params.storyId,
    canonicalEventId: params.canonicalEventId,
    commandId: params.commandId,
    turnId: params.turnId,
    timestamp: JSON.stringify(timestamp),
    summary: String(params.summary || 'Canonical action committed.').slice(0, 1200),
    mutationPaths: (params.mutationPaths || []).slice(0, 32),
    perspective: 'OBJECTIVE',
    provenance: 'CANONICAL_COMMAND',
  };
  if (run) {
    const runtime = { ...(run.runtimeState || {}) } as Record<string, any>;
    const existing = Array.isArray(runtime.canonicalNarrativeEvents)
      ? runtime.canonicalNarrativeEvents
      : [];
    const withoutDuplicate = existing.filter((entry: CanonicalNarrativeEventRecord) => entry.id !== id);
    runtime.canonicalNarrativeEvents = [...withoutDuplicate, clone(record)].slice(-120);
    run.runtimeState = runtime;
    repository.saveStoryRun(run);
  }
  return record;
}

export function getCanonicalNarrativeEvents(
  repository: WorldRepository,
  storyId: string,
): CanonicalNarrativeEventRecord[] {
  const run = repository.getStoryRun(storyId);
  const events = Array.isArray(run?.runtimeState?.canonicalNarrativeEvents)
    ? run!.runtimeState!.canonicalNarrativeEvents
    : [];
  return events.map((entry: CanonicalNarrativeEventRecord) => clone(entry));
}
