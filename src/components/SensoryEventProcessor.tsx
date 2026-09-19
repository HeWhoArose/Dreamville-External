import React, { useEffect, useRef } from 'react';
import { useAudioHaptic } from './AudioHapticManager';

export interface SensoryEventProcessorProps {
  events?: any[];
}

export const SensoryEventProcessor: React.FC<SensoryEventProcessorProps> = ({ events }) => {
  const { triggerHaptic, playSfx } = useAudioHaptic();
  const processedEventIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!events || !Array.isArray(events) || events.length === 0) return;

    events.forEach((event) => {
      // Epistemic security: Never play audio or haptics for suppressed events
      if (!event || event.suppressed) return;

      const eventId = event.eventId || `${event.type}_${Date.now()}`;
      if (processedEventIdsRef.current.has(eventId)) return;
      processedEventIdsRef.current.add(eventId);

      // Trigger tactile haptics if specified
      if (event.hapticDirection && event.hapticDirection !== 'off') {
        triggerHaptic(event.hapticDirection);
      }

      // Trigger acoustic SFX
      const cue = event.audio?.cue || event.audioDirection?.soundId || event.visualDirection || event.type;
      if (cue) {
        const priority = event.audio?.priority || event.audioDirection?.priority || 'NORMAL';
        const volume = event.audio?.volume ?? event.audioDirection?.volume ?? 1.0;
        playSfx(cue, priority, volume);
      }
    });

    // Keep processed IDs set bounded
    if (processedEventIdsRef.current.size > 200) {
      processedEventIdsRef.current.clear();
    }
  }, [events, triggerHaptic, playSfx]);

  return null;
};
