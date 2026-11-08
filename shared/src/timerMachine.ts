import type { RoomSettings, TimerPhase, TimerState } from './types';

const MS_PER_MIN = 60_000;

export function phaseDurationMs(phase: TimerPhase, settings: RoomSettings): number {
  switch (phase) {
    case 'focus':
      return settings.focusMin * MS_PER_MIN;
    case 'break':
      return settings.breakMin * MS_PER_MIN;
    case 'longBreak':
      return settings.longBreakMin * MS_PER_MIN;
  }
}

export function createInitialTimer(settings: RoomSettings): TimerState {
  const duration = phaseDurationMs('focus', settings);
  return {
    phase: 'focus',
    status: 'idle',
    phaseDurationMs: duration,
    remainingMs: duration,
    endsAt: null,
    completedFocus: 0,
    version: 0,
  };
}

export function getRemainingMs(t: TimerState, now: number): number {
  if (t.status === 'running' && t.endsAt !== null) {
    return Math.max(0, t.endsAt - now);
  }
  return t.remainingMs;
}

export function start(t: TimerState, now: number): TimerState {
  if (t.status === 'running') return t;
  return {
    ...t,
    status: 'running',
    endsAt: now + t.remainingMs,
    version: t.version + 1,
  };
}

export function pause(t: TimerState, now: number): TimerState {
  if (t.status !== 'running') return t;
  return {
    ...t,
    status: 'paused',
    remainingMs: getRemainingMs(t, now),
    endsAt: null,
    version: t.version + 1,
  };
}

export function reset(t: TimerState, settings: RoomSettings): TimerState {
  const duration = phaseDurationMs('focus', settings);
  return {
    phase: 'focus',
    status: 'idle',
    phaseDurationMs: duration,
    remainingMs: duration,
    endsAt: null,
    completedFocus: 0,
    version: t.version + 1,
  };
}

function enterPhase(
  t: TimerState,
  phase: TimerPhase,
  completedFocus: number,
  settings: RoomSettings,
  now: number,
): TimerState {
  const duration = phaseDurationMs(phase, settings);
  const autoStart = settings.autoStart;
  return {
    phase,
    status: autoStart ? 'running' : 'idle',
    phaseDurationMs: duration,
    remainingMs: duration,
    endsAt: autoStart ? now + duration : null,
    completedFocus,
    version: t.version + 1,
  };
}

export function complete(t: TimerState, settings: RoomSettings, now: number): TimerState {
  switch (t.phase) {
    case 'focus': {
      const completedFocus = t.completedFocus + 1;
      const next: TimerPhase =
        completedFocus % settings.cyclesBeforeLong === 0 ? 'longBreak' : 'break';
      return enterPhase(t, next, completedFocus, settings, now);
    }
    case 'break':
      return enterPhase(t, 'focus', t.completedFocus, settings, now);
    case 'longBreak':
      return enterPhase(t, 'focus', 0, settings, now);
  }
}

export function skip(t: TimerState, settings: RoomSettings, now: number): TimerState {
  switch (t.phase) {
    case 'focus':
      // Skipping focus does NOT count as completing it.
      return enterPhase(t, 'break', t.completedFocus, settings, now);
    case 'break':
      return enterPhase(t, 'focus', t.completedFocus, settings, now);
    case 'longBreak':
      return enterPhase(t, 'focus', 0, settings, now);
  }
}

export function applySettings(t: TimerState, settings: RoomSettings): TimerState {
  const completedFocus = Math.min(t.completedFocus, settings.cyclesBeforeLong - 1);
  if (t.status === 'idle') {
    const duration = phaseDurationMs(t.phase, settings);
    return {
      ...t,
      phaseDurationMs: duration,
      remainingMs: duration,
      completedFocus,
      version: t.version + 1,
    };
  }
  // Running/paused: the current phase keeps its duration; new settings apply
  // from the next phase onward.
  return { ...t, completedFocus, version: t.version + 1 };
}
