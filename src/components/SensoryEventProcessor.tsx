import React, { useEffect } from 'react';
import { useAudioHaptic } from './AudioHapticManager';

export const SensoryEventProcessor: React.FC<{ events?: any[] }> = ({ events }) => {
  const { triggerHaptic } = useAudioHaptic();

  useEffect(() => {
    if (!events || events.length === 0) return;
    events.forEach(event => {
      if (event.hapticDirection) {
        triggerHaptic(event.hapticDirection);
      }
    });
  }, [events, triggerHaptic]);

  return null;
};
