import { useEffect, useRef } from 'react';
import { FOCUS } from '@studyroom/shared';
import { usePrefsStore } from '../stores/prefsStore';
import { useRoomStore } from '../stores/roomStore';
import type { RoomActions } from './useRoomConnection';

/**
 * Opt-in accountability for the shared timer. This reports only that the tab
 * stopped being visible, after a short grace period, and never which tab or
 * app took its place: that stays on this machine.
 *
 * `visibilityState` is the only signal used on purpose. Window `blur`/`focus`
 * fire when a user clicks inside the music player or a dropdown, which would
 * mark a perfectly focused person as away.
 */
export function useFocusTracking(actions: RoomActions): void {
  const enabled = usePrefsStore((s) => s.focusTracking);
  const hasRoom = useRoomStore((s) => s.hasRoom);
  const connected = useRoomStore((s) => s.connection === 'connected');

  /** What the room is believed to know, so a reconnect can replay it. */
  const reported = useRef({ tracking: false, away: false });
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const liveRef = useRef(false);
  liveRef.current = enabled && hasRoom && connected;

  /** Sends a change of the away flag, and stays quiet when nothing changed. */
  const report = (away: boolean): void => {
    if (!liveRef.current || !reported.current.tracking || reported.current.away === away) return;
    reported.current = { ...reported.current, away };
    actionsRef.current.sendFocusState(away);
  };
  const reportRef = useRef(report);
  reportRef.current = report;

  useEffect(() => {
    const live = enabled && hasRoom && connected;
    if (live) {
      if (reported.current.tracking) return;
      reported.current = { tracking: true, away: false };
      void actionsRef.current.setFocusTracking(true).then((ok) => {
        // Replays the current visibility once the room knows about the opt-in,
        // which is also what a reconnect needs.
        if (ok) reportRef.current(document.visibilityState === 'hidden');
      });
      return;
    }
    if (!reported.current.tracking) return;
    reported.current = { tracking: false, away: false };
    // Only an explicit opt-out is worth announcing: leaving the room or losing
    // the connection takes the member with it.
    if (!enabled && hasRoom && connected) void actionsRef.current.setFocusTracking(false);
  }, [enabled, hasRoom, connected]);

  useEffect(() => {
    let timer: number | null = null;
    const clear = (): void => {
      if (timer === null) return;
      window.clearTimeout(timer);
      timer = null;
    };

    const onChange = (): void => {
      if (document.visibilityState === 'hidden') {
        if (timer !== null) return;
        timer = window.setTimeout(() => {
          timer = null;
          // A tab that flashed past is not an away interval.
          if (document.visibilityState !== 'hidden') return;
          reportRef.current(true);
        }, FOCUS.AWAY_DEBOUNCE_MS);
        return;
      }
      clear();
      reportRef.current(false);
    };

    document.addEventListener('visibilitychange', onChange);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
      clear();
    };
  }, []);
}
