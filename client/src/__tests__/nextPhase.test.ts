import { describe, expect, it } from 'vitest';
import { createInitialTimer, type RoomSettings, type TimerState } from '@studyroom/shared';
import { nextPhase } from '../lib/nextPhase';

const MIN = 60_000;

const settings = (over: Partial<RoomSettings> = {}): RoomSettings => ({
  focusMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cyclesBeforeLong: 4,
  autoStart: true,
  timerControl: 'host',
  strictFocus: false,
  ...over,
});

const timerIn = (over: Partial<TimerState> = {}): TimerState => ({
  ...createInitialTimer(settings()),
  status: 'running',
  ...over,
});

describe('nextPhase', () => {
  it('offers a break after a focus session that does not close the set', () => {
    expect(nextPhase(timerIn({ completedFocus: 0 }), settings())).toEqual({
      phase: 'break',
      durationMs: 5 * MIN,
    });
  });

  it('offers the long break when the focus session closes the set', () => {
    expect(nextPhase(timerIn({ completedFocus: 3 }), settings())).toEqual({
      phase: 'longBreak',
      durationMs: 15 * MIN,
    });
  });

  it('goes back to focus from either break', () => {
    expect(nextPhase(timerIn({ phase: 'break' }), settings()).phase).toBe('focus');
    expect(nextPhase(timerIn({ phase: 'longBreak' }), settings()).phase).toBe('focus');
  });

  it('follows the room when the room is not the classic four', () => {
    expect(nextPhase(timerIn({ completedFocus: 1 }), settings({ cyclesBeforeLong: 2 })).phase).toBe(
      'longBreak',
    );
    expect(nextPhase(timerIn({ completedFocus: 1 }), settings({ breakMin: 3 })).durationMs).toBe(
      3 * MIN,
    );
  });

  it('reads the future without writing it', () => {
    const timer = timerIn({ completedFocus: 2 });
    const before = structuredClone(timer);
    nextPhase(timer, settings());
    expect(timer).toEqual(before);
  });
});
