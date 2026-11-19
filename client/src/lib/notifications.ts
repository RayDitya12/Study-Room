/**
 * The rules behind a browser notification, kept away from `window` so they can
 * be argued with in a test. Whether a notification is actually shown is decided
 * here; the calling code only reports what it sees and does the showing.
 */

import type { TimerPhase } from '@studyroom/shared';
import { formatRemaining } from './format';
import type { Translate } from '../i18n';

/**
 * `ask` is the browser's `default`: nothing has been answered yet, so a prompt
 * is still possible. `unsupported` is a browser with no Notification at all.
 */
export type PermissionState = 'granted' | 'denied' | 'ask' | 'unsupported';

/** Read from whatever the platform exposes, without assuming it is there. */
export function permissionStateOf(
  notification: { permission: string } | null | undefined,
): PermissionState {
  if (!notification) return 'unsupported';
  switch (notification.permission) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    default:
      return 'ask';
  }
}

/** Only an unanswered prompt can be asked, and asking is a user gesture. */
export function canAskForPermission(permission: PermissionState): boolean {
  return permission === 'ask';
}

export interface PhaseSight {
  /** The phase this device last saw, or null before the first timer lands. */
  from: TimerPhase | null;
  to: TimerPhase;
  enabled: boolean;
  hidden: boolean;
  permission: PermissionState;
}

/**
 * One sentence, because every part of it has been surprising: a phase this
 * person is not looking at, that they asked to be told about, in a browser that
 * is allowed to say it. The first timer of a session is not a change.
 */
export function shouldNotifyPhase(sight: PhaseSight): boolean {
  return (
    sight.enabled &&
    sight.hidden &&
    sight.permission === 'granted' &&
    sight.from !== null &&
    sight.from !== sight.to
  );
}

export interface NextPhase {
  phase: TimerPhase;
  durationMs: number;
}

/**
 * The title says what just started; the body is the same sentence the card
 * shows, so the two cannot drift apart.
 */
export function phaseMessage(
  t: Translate,
  phase: TimerPhase,
  next: NextPhase,
): { title: string; body: string } {
  return {
    title: t('notify.started', { phase: t(`timer.${phase}`) }),
    body: t('timer.next', {
      phase: t(`timer.${next.phase}`),
      duration: formatRemaining(next.durationMs),
    }),
  };
}
