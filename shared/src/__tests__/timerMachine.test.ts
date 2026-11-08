import { describe, expect, it } from 'vitest';
import {
  applySettings,
  complete,
  createInitialTimer,
  getRemainingMs,
  pause,
  phaseDurationMs,
  reset,
  skip,
  start,
} from '../timerMachine';
import type { RoomSettings, TimerPhase, TimerState } from '../types';

const baseSettings: RoomSettings = {
  focusMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cyclesBeforeLong: 4,
  autoStart: false,
  timerControl: 'host',
};

const settings = (overrides: Partial<RoomSettings> = {}): RoomSettings => ({
  ...baseSettings,
  ...overrides,
});

const timer = (overrides: Partial<TimerState> = {}): TimerState => ({
  phase: 'focus',
  status: 'idle',
  phaseDurationMs: 1_500_000,
  remainingMs: 1_500_000,
  endsAt: null,
  completedFocus: 0,
  version: 0,
  ...overrides,
});

/** Asserts the op did not mutate its input. */
function expectPure(fn: () => TimerState, input: TimerState): TimerState {
  const before = JSON.stringify(input);
  const out = fn();
  expect(JSON.stringify(input)).toBe(before);
  return out;
}

describe('phaseDurationMs', () => {
  it.each([
    ['focus', 25 * 60_000],
    ['break', 5 * 60_000],
    ['longBreak', 15 * 60_000],
  ] as [TimerPhase, number][])('%s -> %i ms', (phase, expected) => {
    expect(phaseDurationMs(phase, baseSettings)).toBe(expected);
  });
});

describe('createInitialTimer', () => {
  it('is focus/idle with full duration and version 0', () => {
    expect(createInitialTimer(settings({ focusMin: 25 }))).toEqual({
      phase: 'focus',
      status: 'idle',
      phaseDurationMs: 1_500_000,
      remainingMs: 1_500_000,
      endsAt: null,
      completedFocus: 0,
      version: 0,
    });
  });

  it('follows custom focus length', () => {
    const t = createInitialTimer(settings({ focusMin: 50 }));
    expect(t.phaseDurationMs).toBe(3_000_000);
    expect(t.remainingMs).toBe(3_000_000);
  });
});

describe('start / pause', () => {
  it('start sets endsAt = now + remaining and bumps version', () => {
    const t0 = timer();
    const t1 = expectPure(() => start(t0, 1_000), t0);
    expect(t1).toEqual(timer({ status: 'running', endsAt: 1_501_000, version: 1 }));
  });

  it('start is idempotent while running', () => {
    const running = start(timer(), 0);
    expect(start(running, 999)).toBe(running);
  });

  it('pause computes remaining from endsAt', () => {
    const running = start(timer(), 0); // endsAt 1_500_000
    const paused = expectPure(() => pause(running, 60_000), running);
    expect(paused).toMatchObject({
      status: 'paused',
      remainingMs: 1_440_000,
      endsAt: null,
      version: 2,
    });
  });

  it('pause clamps remaining to 0 when the deadline passed', () => {
    const running = start(timer(), 0);
    expect(pause(running, 9_999_999)).toMatchObject({ remainingMs: 0, status: 'paused' });
  });

  it('pause is a no-op when not running', () => {
    const idle = timer();
    expect(pause(idle, 5)).toBe(idle);
  });

  it('resume continues from the paused remaining time', () => {
    const paused = pause(start(timer(), 0), 600_000); // 900_000 left
    const resumed = start(paused, 1_000_000);
    expect(resumed.endsAt).toBe(1_900_000);
    expect(getRemainingMs(resumed, 1_000_000)).toBe(900_000);
  });
});

describe('getRemainingMs', () => {
  it('running: max(0, endsAt - now)', () => {
    const running = timer({ status: 'running', endsAt: 10_000, remainingMs: 0 });
    expect(getRemainingMs(running, 4_000)).toBe(6_000);
    expect(getRemainingMs(running, 20_000)).toBe(0);
  });

  it('idle/paused: remainingMs', () => {
    expect(getRemainingMs(timer({ remainingMs: 42 }), 999)).toBe(42);
  });
});

describe('reset', () => {
  it('goes back to focus/idle/completedFocus 0 with fresh duration', () => {
    const t = timer({ phase: 'break', status: 'running', endsAt: 5, remainingMs: 10, completedFocus: 3, version: 7 });
    const out = expectPure(() => reset(t, settings({ focusMin: 30 })), t);
    expect(out).toEqual({
      phase: 'focus',
      status: 'idle',
      phaseDurationMs: 1_800_000,
      remainingMs: 1_800_000,
      endsAt: null,
      completedFocus: 0,
      version: 8,
    });
  });
});

describe('complete', () => {
  const cases = [
    { name: 'focus -> break, increments', input: timer({ phase: 'focus', completedFocus: 0 }), phase: 'break', cf: 1 },
    { name: '2nd focus -> break', input: timer({ phase: 'focus', completedFocus: 1 }), phase: 'break', cf: 2 },
    { name: '4th focus -> longBreak', input: timer({ phase: 'focus', completedFocus: 3 }), phase: 'longBreak', cf: 4 },
    { name: 'break -> focus, cf unchanged', input: timer({ phase: 'break', completedFocus: 2 }), phase: 'focus', cf: 2 },
    { name: 'longBreak -> focus, cf resets', input: timer({ phase: 'longBreak', completedFocus: 4 }), phase: 'focus', cf: 0 },
  ] as const;

  it.each(cases)('$name', ({ input, phase, cf }) => {
    const out = expectPure(() => complete(input, baseSettings, 1_000), input);
    expect(out.phase).toBe(phase);
    expect(out.completedFocus).toBe(cf);
    expect(out.status).toBe('idle');
    expect(out.endsAt).toBeNull();
    expect(out.remainingMs).toBe(phaseDurationMs(out.phase, baseSettings));
    expect(out.phaseDurationMs).toBe(out.remainingMs);
    expect(out.version).toBe(input.version + 1);
  });

  it('with autoStart the new phase is running', () => {
    const s = settings({ autoStart: true, breakMin: 5 });
    const out = complete(timer({ phase: 'focus' }), s, 2_000);
    expect(out).toMatchObject({
      phase: 'break',
      status: 'running',
      endsAt: 2_000 + 300_000,
      remainingMs: 300_000,
    });
  });
});

describe('skip', () => {
  it('from focus does NOT increment completedFocus', () => {
    const t = timer({ phase: 'focus', completedFocus: 2 });
    const out = expectPure(() => skip(t, baseSettings, 0), t);
    expect(out).toMatchObject({ phase: 'break', completedFocus: 2 });
  });

  it('from break -> focus, cf unchanged', () => {
    expect(skip(timer({ phase: 'break', completedFocus: 2 }), baseSettings, 0)).toMatchObject({
      phase: 'focus',
      completedFocus: 2,
    });
  });

  it('from longBreak -> focus, cf resets', () => {
    expect(skip(timer({ phase: 'longBreak', completedFocus: 4 }), baseSettings, 0)).toMatchObject({
      phase: 'focus',
      completedFocus: 0,
    });
  });

  it('honors autoStart', () => {
    const out = skip(timer(), settings({ autoStart: true }), 500);
    expect(out).toMatchObject({ status: 'running', endsAt: 500 + out.phaseDurationMs });
  });
});

describe('applySettings', () => {
  it('idle: adopts the new phase duration', () => {
    const t = timer({ status: 'idle', phaseDurationMs: 1_500_000, remainingMs: 1_500_000 });
    const out = expectPure(() => applySettings(t, settings({ focusMin: 30 })), t);
    expect(out).toMatchObject({ phaseDurationMs: 1_800_000, remainingMs: 1_800_000, version: 1 });
  });

  it('running: leaves the current phase untouched', () => {
    const t = start(timer(), 0);
    const out = applySettings(t, settings({ focusMin: 30 }));
    expect(out.phaseDurationMs).toBe(1_500_000);
    expect(out.remainingMs).toBe(1_500_000);
    expect(out.endsAt).toBe(t.endsAt);
    expect(out.version).toBe(t.version + 1);
  });

  it('paused: leaves the current phase untouched', () => {
    const t = pause(start(timer(), 0), 600_000);
    const out = applySettings(t, settings({ focusMin: 1 }));
    expect(out.remainingMs).toBe(900_000);
  });

  it('clamps completedFocus below cyclesBeforeLong', () => {
    const t = timer({ completedFocus: 5, phase: 'break' });
    expect(applySettings(t, settings({ cyclesBeforeLong: 2 })).completedFocus).toBe(1);
  });
});

describe('version bookkeeping', () => {
  it('increments on every real change', () => {
    const s = settings({ focusMin: 1, breakMin: 1 });
    let t = createInitialTimer(s); // v0
    t = start(t, 0); // v1
    t = pause(t, 10_000); // v2
    t = start(t, 20_000); // v3
    t = complete(t, s, 99_999); // v4
    t = skip(t, s, 100_000); // v5
    t = applySettings(t, s); // v6
    t = reset(t, s); // v7
    expect(t.version).toBe(7);
  });
});
