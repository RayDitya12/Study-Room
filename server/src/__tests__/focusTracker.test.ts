import { describe, expect, it } from 'vitest';
import {
  INITIAL_FOCUS,
  onDisconnect,
  onRoomActiveChange,
  resetSession,
  setAway,
  setTracking,
  summarize,
  type FocusTrackerState,
} from '../focus/focusTracker';

const T0 = 1_000_000;

/** Opted in and being measured, which is the state most cases start from. */
function tracked(over: Partial<FocusTrackerState> = {}): FocusTrackerState {
  return { ...INITIAL_FOCUS, tracking: true, activeSince: T0, ...over };
}

describe('setTracking', () => {
  it('opens a counted window when the room is already in a focus phase', () => {
    const next = setTracking(INITIAL_FOCUS, true, true, T0);
    expect(next.tracking).toBe(true);
    expect(next.activeSince).toBe(T0);
  });

  it('waits for the focus phase when opted in during a break', () => {
    const next = setTracking(INITIAL_FOCUS, true, false, T0);
    expect(next.activeSince).toBeNull();
  });

  it('closing an open away interval bills it before opting out', () => {
    const before = tracked({ away: true, awaySince: T0 + 1_000, awayCount: 1, awayCounted: true });
    const next = setTracking(before, false, true, T0 + 3_000);
    expect(next.awayMs).toBe(2_000);
    expect(next.activeMs).toBe(3_000);
    expect(next.tracking).toBe(false);
    expect(next.away).toBe(false);
    expect(next.awaySince).toBeNull();
  });

  it('keeps the counters it already gathered', () => {
    const before = { ...tracked(), awayCount: 3, awayMs: 5_000, activeMs: 20_000 };
    const next = setTracking(before, false, false, T0 + 9_000);
    expect(next.awayCount).toBe(3);
    expect(next.awayMs).toBe(5_000);
  });

  it('ignores a repeated value', () => {
    const before = tracked();
    expect(setTracking(before, true, true, T0 + 5_000)).toBe(before);
    expect(setTracking(INITIAL_FOCUS, false, true, T0)).toBe(INITIAL_FOCUS);
  });
});

describe('setAway', () => {
  it('counts and timestamps an interval only inside a focus phase', () => {
    const active = setAway(tracked(), true, true, T0 + 2_000);
    expect(active).toMatchObject({ away: true, awaySince: T0 + 2_000, awayCount: 1, awayCounted: true });

    const idle = setAway({ ...tracked(), activeSince: null }, true, false, T0 + 2_000);
    expect(idle).toMatchObject({ away: true, awaySince: null, awayCount: 0, awayCounted: false });
  });

  it('bills the interval when the member comes back', () => {
    const away = setAway(tracked(), true, true, T0);
    const back = setAway(away, false, true, T0 + 4_000);
    expect(back).toMatchObject({ away: false, awaySince: null, awayMs: 4_000, awayCount: 1, awayCounted: false });
  });

  it('ignores every report from a member who did not opt in', () => {
    expect(setAway(INITIAL_FOCUS, true, true, T0)).toBe(INITIAL_FOCUS);
    expect(setAway(INITIAL_FOCUS, false, true, T0)).toBe(INITIAL_FOCUS);
  });

  it('ignores a repeated value', () => {
    const away = setAway(tracked(), true, true, T0);
    expect(setAway(away, true, true, T0 + 1_000)).toBe(away);
  });

  it('does not count a second away while still away', () => {
    const away = setAway(tracked(), true, true, T0);
    const again = setAway(away, true, true, T0 + 5_000);
    expect(again.awayCount).toBe(1);
    expect(again.awaySince).toBe(T0);
  });
});

describe('onRoomActiveChange', () => {
  it('does nothing for a pause of the flag', () => {
    const s = tracked();
    expect(onRoomActiveChange(s, true, true, T0 + 1_000)).toBe(s);
    expect(onRoomActiveChange(s, false, false, T0 + 1_000)).toBe(s);
  });

  it('skips members who never opted in', () => {
    expect(onRoomActiveChange(INITIAL_FOCUS, false, true, T0)).toBe(INITIAL_FOCUS);
  });

  it('freezes both windows when the focus phase stops', () => {
    const s = tracked({ away: true, awaySince: T0 + 1_000, awayCount: 1, awayCounted: true });
    const next = onRoomActiveChange(s, true, false, T0 + 5_000);
    expect(next).toMatchObject({
      activeSince: null,
      activeMs: 5_000,
      awaySince: null,
      awayMs: 4_000,
      // Still away: a break is not a return to the tab.
      away: true,
      awayCounted: true,
    });
  });

  it('opens a window and counts an ongoing away when the focus phase starts', () => {
    const s = { ...INITIAL_FOCUS, tracking: true, away: true };
    const next = onRoomActiveChange(s, false, true, T0);
    expect(next).toMatchObject({ activeSince: T0, awaySince: T0, awayCount: 1, awayCounted: true });
  });

  it('resumes an already counted interval without counting it twice', () => {
    const s = { ...INITIAL_FOCUS, tracking: true, away: true, awayCount: 1, awayCounted: true };
    const next = onRoomActiveChange(s, false, true, T0);
    expect(next).toMatchObject({ awaySince: T0, awayCount: 1, awayCounted: true });
  });

  it('carries a long break through pause, resume and a second away', () => {
    let s = tracked();
    s = setAway(s, true, true, T0 + 1_000); // 1 away, interval open
    s = onRoomActiveChange(s, true, false, T0 + 2_000); // paused mid-away
    expect(s.awayCount).toBe(1);
    s = onRoomActiveChange(s, false, true, T0 + 3_000); // resumed, still away
    expect(s).toMatchObject({ awayCount: 1, awaySince: T0 + 3_000, awayMs: 1_000 });
    s = setAway(s, false, true, T0 + 5_000); // back on the tab
    expect(s).toMatchObject({ awayCount: 1, awayMs: 3_000, awaySince: null, awayCounted: false });
    s = setAway(s, true, true, T0 + 6_000); // leaves again
    expect(s).toMatchObject({ awayCount: 2, awaySince: T0 + 6_000 });
    s = onRoomActiveChange(s, true, false, T0 + 8_000); // session ends away
    // 2 s + 5 s present, 1 s + 2 s + 2 s away.
    expect(s.awayMs).toBe(5_000);
    expect(summarize(s)).toEqual({ awayCount: 2, awayMs: 5_000, activeMs: 7_000, focusPct: 29 });
  });
});

describe('onDisconnect', () => {
  it('closes an open away interval and keeps the opt-in', () => {
    const s = tracked({ away: true, awaySince: T0 + 2_000, awayCount: 1, awayCounted: true });
    const next = onDisconnect(s, T0 + 7_000);
    expect(next).toMatchObject({ tracking: true, away: true, awaySince: null, awayMs: 5_000 });
  });

  it('leaves a present member untouched', () => {
    const s = tracked();
    expect(onDisconnect(s, T0 + 9_000)).toBe(s);
  });
});

describe('summarize', () => {
  it('reports a full session as 100%', () => {
    expect(summarize(tracked({ activeMs: 60_000 }))).toEqual({
      awayCount: 0,
      awayMs: 0,
      activeMs: 60_000,
      focusPct: 100,
    });
  });

  it('has no opinion before a window has been measured', () => {
    expect(summarize(INITIAL_FOCUS).focusPct).toBe(100);
  });

  it('rounds to a whole percent', () => {
    // 100 s present, 7 s away -> 93%.
    expect(summarize({ ...tracked(), activeMs: 100_000, awayMs: 7_000 }).focusPct).toBe(93);
  });

  it('never reports less than zero or more than a hundred', () => {
    expect(summarize({ ...tracked(), activeMs: 1_000, awayMs: 9_000 }).focusPct).toBe(0);
    expect(summarize({ ...tracked(), activeMs: 1_000, awayMs: -9_000 }).focusPct).toBe(100);
  });
});

describe('resetSession', () => {
  it('zeroes the session but not the membership', () => {
    const s = tracked({ away: true, awaySince: T0, awayCount: 4, awayMs: 9_000, activeMs: 40_000 });
    const next = resetSession(s);
    expect(next).toMatchObject({
      tracking: true,
      away: true,
      awayCount: 0,
      awayMs: 0,
      activeSince: null,
      activeMs: 0,
      awayCounted: false,
    });
  });

  it('is what lets the next session start from zero', () => {
    const ended = onRoomActiveChange(tracked(), true, false, T0 + 30_000);
    expect(ended.activeMs).toBe(30_000);
    const next = onRoomActiveChange(resetSession(ended), false, true, T0 + 60_000);
    expect(next).toMatchObject({ activeSince: T0 + 60_000, activeMs: 0, awayCount: 0 });
  });
});
