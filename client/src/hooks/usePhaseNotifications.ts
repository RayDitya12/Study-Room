import { useEffect, useRef } from 'react';
import type { TimerPhase } from '@studyroom/shared';
import { nextPhase } from '../lib/nextPhase';
import { permissionStateOf, phaseMessage, shouldNotifyPhase } from '../lib/notifications';
import { usePrefsStore } from '../stores/prefsStore';
import { useRoomStore } from '../stores/roomStore';
import { useT } from '../i18n/useT';

/**
 * The browser's own notice for a phase that ends while this tab is not the one
 * being looked at. Nothing here reaches the room: the server does not know this
 * preference exists, and the tab's visibility is read at the moment of the
 * change rather than watched.
 */
export function usePhaseNotifications(): void {
  const t = useT();
  const enabled = usePrefsStore((s) => s.notifyOnPhase);
  const phase = useRoomStore((s) => s.timer?.phase ?? null);
  const code = useRoomStore((s) => s.code);
  // The phase this device has already been shown, so arriving mid-break does not
  // announce a change that happened before the room was on screen.
  const seen = useRef<TimerPhase | null>(null);

  useEffect(() => {
    const from = seen.current;
    seen.current = phase;
    if (!phase || !enabled) return;
    const state = useRoomStore.getState();
    if (!state.timer || !state.settings) return;
    if (
      !shouldNotifyPhase({
        from,
        to: phase,
        enabled,
        hidden: document.hidden,
        permission: permissionStateOf(typeof Notification === 'undefined' ? null : Notification),
      })
    ) {
      return;
    }
    const { title, body } = phaseMessage(t, phase, nextPhase(state.timer, state.settings));
    // One notice per room, replacing the last, so three tabs open at once cannot
    // stack up a pile of the same sentence.
    new Notification(title, { body, tag: `studyroom-phase-${code}` });
  }, [phase, enabled, code, t]);
}
