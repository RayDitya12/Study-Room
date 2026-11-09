/**
 * The accounting behind focus tracking, kept pure and free of sockets so the
 * arithmetic can be tested directly.
 *
 * Only three numbers ever leave a client: whether they opted in, whether they
 * are away from the tab right now, and — at the end of a focus session — how
 * many times and how long. Which tab or app they opened stays on their machine.
 */

/** Per member, keyed by clientId inside the room runtime. */
export interface FocusTrackerState {
  /** The member opted in, so their intervals are counted. */
  tracking: boolean;
  away: boolean;
  /** Server epoch ms of the ongoing away interval, else null. */
  awaySince: number | null;
  /** Away intervals started in the current focus session. */
  awayCount: number;
  /** Total away time of the COMPLETED intervals in the current session. */
  awayMs: number;
  /** Server epoch ms when the current counted window opened, else null. */
  activeSince: number | null;
  /** Total time the room spent in a running focus phase while this member was present. */
  activeMs: number;
  /** Guards `awayCount`: an interval interrupted by a pause must not be counted twice. */
  awayCounted: boolean;
}

export interface FocusSummary {
  awayCount: number;
  awayMs: number;
  activeMs: number;
  /** 0..100, rounded and clamped. */
  focusPct: number;
}

export const INITIAL_FOCUS: FocusTrackerState = {
  tracking: false,
  away: false,
  awaySince: null,
  awayCount: 0,
  awayMs: 0,
  activeSince: null,
  activeMs: 0,
  awayCounted: false,
};

/** `timer.status === 'running' && timer.phase === 'focus'`, decided by the caller. */
export type RoomActive = boolean;

/** Closes the counted window and adds its length to `activeMs`. */
function closeActive(s: FocusTrackerState, now: number): FocusTrackerState {
  if (s.activeSince === null) return s;
  return {
    ...s,
    activeMs: s.activeMs + Math.max(0, now - s.activeSince),
    activeSince: null,
  };
}

/** Closes the ongoing away interval; the member may still be away. */
function closeAway(s: FocusTrackerState, now: number): FocusTrackerState {
  if (s.awaySince === null) return s;
  return {
    ...s,
    awayMs: s.awayMs + Math.max(0, now - s.awaySince),
    awaySince: null,
  };
}

export function setTracking(
  s: FocusTrackerState,
  enabled: boolean,
  roomActive: RoomActive,
  now: number,
): FocusTrackerState {
  if (s.tracking === enabled) return s;
  if (enabled) {
    return { ...s, tracking: true, activeSince: roomActive ? now : s.activeSince };
  }
  // Opting out keeps the counters until the session ends, so a summary can
  // still report what was already measured.
  return {
    ...closeAway(closeActive(s, now), now),
    tracking: false,
    away: false,
    awayCounted: false,
  };
}

export function setAway(
  s: FocusTrackerState,
  away: boolean,
  roomActive: RoomActive,
  now: number,
): FocusTrackerState {
  if (!s.tracking || s.away === away) return s;
  if (!away) return { ...closeAway(s, now), away: false, awayCounted: false };
  if (!roomActive) {
    // Nothing is being measured, so the interval is neither opened nor counted.
    return { ...s, away: true, awaySince: null, awayCounted: false };
  }
  return { ...s, away: true, awaySince: now, awayCount: s.awayCount + 1, awayCounted: true };
}

/**
 * Called with the room's active flag before and after every timer change:
 * a pause or a phase change freezes the clocks rather than discarding them.
 */
export function onRoomActiveChange(
  s: FocusTrackerState,
  wasActive: RoomActive,
  isActive: RoomActive,
  now: number,
): FocusTrackerState {
  if (wasActive === isActive || !s.tracking) return s;
  if (isActive) {
    const next: FocusTrackerState = {
      ...s,
      activeSince: now,
      ...(s.away && !s.awayCounted
        ? { awaySince: now, awayCount: s.awayCount + 1, awayCounted: true }
        : s.away
          ? { awaySince: now }
          : {}),
    };
    return next;
  }
  // Inactive: the away interval ends but the away flag survives, so a member
  // who walks off during a break is not credited with being back.
  return closeAway(closeActive(s, now), now);
}

/** The socket dropped; the client re-sends its state when it comes back. */
export function onDisconnect(s: FocusTrackerState, now: number): FocusTrackerState {
  return closeAway(s, now);
}

export function summarize(s: FocusTrackerState): FocusSummary {
  const ratio = s.activeMs > 0 ? 1 - s.awayMs / s.activeMs : 1;
  const pct = s.activeMs > 0 ? Math.round(100 * ratio) : 100;
  return {
    awayCount: s.awayCount,
    awayMs: s.awayMs,
    activeMs: s.activeMs,
    focusPct: Math.min(100, Math.max(0, pct)),
  };
}

/** New session: the counters start over, the opt-in and the away flag do not. */
export function resetSession(s: FocusTrackerState): FocusTrackerState {
  return {
    ...s,
    awayCount: 0,
    awayMs: 0,
    activeSince: null,
    activeMs: 0,
    awayCounted: false,
  };
}
