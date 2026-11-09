import { useEffect } from 'react';
import { startAmbient, stopAmbient } from '../lib/ambient';
import { usePrefsStore } from '../stores/prefsStore';
import { useRoomStore } from '../stores/roomStore';

/**
 * Drives the local ambient engine from the stored prefs. `ambientOnlyWhileFocus`
 * ties it to a running focus phase; leaving the page always stops it.
 */
export function useAmbient(): void {
  const type = usePrefsStore((s) => s.ambientType);
  const volume = usePrefsStore((s) => s.ambientVolume);
  const onlyWhileFocus = usePrefsStore((s) => s.ambientOnlyWhileFocus);
  const timer = useRoomStore((s) => s.timer);
  const focusing = timer?.status === 'running' && timer.phase === 'focus';

  useEffect(() => {
    if (type === 'off' || (onlyWhileFocus && !focusing)) {
      stopAmbient();
      return;
    }
    // A volume change arrives here too: startAmbient keeps the running voice
    // and only re-ramps its level.
    startAmbient(type, volume);
  }, [type, volume, onlyWhileFocus, focusing]);

  useEffect(() => {
    return () => stopAmbient();
  }, []);
}
