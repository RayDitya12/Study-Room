import {
  complete,
  phaseDurationMs,
  type RoomSettings,
  type TimerPhase,
  type TimerState,
} from '@studyroom/shared';

export interface NextPhase {
  phase: TimerPhase;
  durationMs: number;
}

/**
 * What the room moves to when this phase ends, asked of the machine itself
 * rather than guessed at here: the rule that decides whether the next thing is
 * a break or the long break belongs to the timer, and a copy of it in the
 * client is a copy that can drift. `complete` is pure, so running it on the
 * current state reads the future without writing it.
 */
export function nextPhase(t: TimerState, settings: RoomSettings): NextPhase {
  const phase = complete(t, settings, 0).phase;
  return { phase, durationMs: phaseDurationMs(phase, settings) };
}
