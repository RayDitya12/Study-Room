import type { TimerControl } from '@studyroom/shared';

/**
 * The one rule for who may touch the shared timer. The timer card, the command
 * list and the space bar all need the same answer, so none of them gets to
 * invent it.
 */
export function canControlTimer(
  you: { isHost: boolean; isModerator: boolean },
  timerControl: TimerControl,
): boolean {
  return you.isHost || you.isModerator || timerControl === 'everyone';
}
