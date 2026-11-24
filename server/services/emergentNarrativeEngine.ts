import { worldRepository } from '../repositories/worldRepository';
import { StoryThread, CanonicalGameplayEvent } from '../../src/types';
import { deterministicId } from '../domain/deterministicRng';

/** Player-facing wording for a thread, derived only from the committed event and the location's display name. */
export function describeEmergentThread(
  eventType: string,
  locationName: string | undefined,
): { title: string; description: string } {
  const words = String(eventType || 'event').replace(/[_\s]+/g, ' ').trim().toLowerCase() || 'event';
  const label = words.charAt(0).toUpperCase() + words.slice(1);
  const place = locationName && locationName.trim() ? locationName.trim() : 'an unrecorded location';
  return {
    title: `${label} at ${place}`,
    description: `Follow up on the ${words} at ${place}.`,
  };
}

function resolveLocationName(repository: typeof worldRepository, storyId: string, locationId: string | undefined): string | undefined {
  if (!locationId) return undefined;
  try {
    return repository.getGeographyGraph(storyId).getNode(locationId)?.name || undefined;
  } catch {
    return undefined;
  }
}

export class EmergentNarrativeEngine {
  public processCanonicalEvent(
    event: CanonicalGameplayEvent,
    repository = worldRepository
  ): { createdThread?: StoryThread; updatedThread?: StoryThread } {
    const existingThreads = repository.getStoryThreads(event.storyId);
    
    // Check if an existing thread is relevant
    const matchingThread = existingThreads.find((t) => t.status !== 'RESOLVED' && (t.locationId === event.locationId || t.title.toLowerCase().includes(event.eventType.toLowerCase())));

    if (matchingThread) {
      // Advance stage
      const newStage = Math.min(3, matchingThread.stage + 1);
      const updatedThread: StoryThread = {
        ...matchingThread,
        stage: newStage,
        status: newStage === 3 ? 'ESCALATED' : 'ACTIVE',
        updatedAt: event.timestamp,
        evidenceGathered: [...(matchingThread.evidenceGathered || []), ...(event.evidenceItems || [])],
      };
      repository.saveStoryThread(updatedThread);
      return { updatedThread };
    } else {
      // Create new emergent thread
      const threadId = deterministicId('thread', event.storyId, event.eventId, event.eventType, event.locationId || 'loc_unknown');
      // Never expose an internal location ID or a mechanical placeholder to the prompt-side thread list (V2 gap G8).
      const wording = describeEmergentThread(event.eventType, resolveLocationName(repository, event.storyId, event.locationId));
      const createdThread: StoryThread = {
        threadId,
        storyId: event.storyId,
        title: wording.title,
        description: wording.description,
        category: 'EMERGENT_INVESTIGATION',
        status: 'ACTIVE',
        stage: 1,
        locationId: event.locationId || 'loc_unknown',
        evidenceGathered: event.evidenceItems || [],
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
      };
      repository.saveStoryThread(createdThread);
      return { createdThread };
    }
  }
}

export const emergentNarrativeEngine = new EmergentNarrativeEngine();
