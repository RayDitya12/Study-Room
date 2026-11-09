export const LIMITS = {
  NICKNAME_MIN: 2,
  NICKNAME_MAX: 20,
  ROOM_NAME_MIN: 1,
  ROOM_NAME_MAX: 40,
  PASSWORD_MIN: 4,
  PASSWORD_MAX: 64,
  MESSAGE_MAX: 500,
  TASK_MAX: 80,
  MAX_MEMBERS: 30,
  HISTORY_SIZE: 100,
  FOCUS_MIN: [1, 120],
  BREAK_MIN: [1, 60],
  LONG_BREAK_MIN: [1, 60],
  CYCLES: [2, 8],
} as const;

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export const STATUSES = ['focusing', 'break', 'away'] as const;
export const PHASES = ['focus', 'break', 'longBreak'] as const;
export const TIMER_STATUSES = ['idle', 'running', 'paused'] as const;
export const TIMER_CONTROLS = ['host', 'everyone'] as const;

export const ROLES = ['host', 'mod', 'member'] as const;
export const MEDIA_STATUSES = ['stopped', 'playing', 'paused'] as const;

/**
 * Ready-made Pomodoro settings. Every value stays inside the matching `LIMITS`
 * range, which a unit test guards.
 */
export const TIMER_PRESETS = [
  { id: 'classic', focusMin: 25, breakMin: 5, longBreakMin: 15, cyclesBeforeLong: 4 },
  { id: 'sprint', focusMin: 15, breakMin: 3, longBreakMin: 10, cyclesBeforeLong: 4 },
  { id: 'deep', focusMin: 50, breakMin: 10, longBreakMin: 30, cyclesBeforeLong: 3 },
  { id: 'ultra', focusMin: 90, breakMin: 20, longBreakMin: 30, cyclesBeforeLong: 2 },
] as const;

export const MEDIA = {
  URL_MAX: 200,
  /**
   * The whole player, disc and all, in pixels. Small on purpose: an embed
   * chooses its stream from the size it is rendered at, and a room that came to
   * work would rather spend the bandwidth on sound.
   */
  VINYL_DIAMETER_PX: 88,
  DRIFT_THRESHOLD_MS: 2000,
  DRIFT_CHECK_MS: 5000,
} as const;

export const FOCUS = { AWAY_DEBOUNCE_MS: 3000 } as const;

/** One day of playback is a sane upper bound for a seek position. */
export const MAX_SEEK_MS = 86_400_000;

export const ERROR_CODES = [
  'ROOM_NOT_FOUND',
  'PASSWORD_REQUIRED',
  'WRONG_PASSWORD',
  'INVALID_INPUT',
  'RATE_LIMITED',
  'NOT_IN_ROOM',
  'FORBIDDEN',
  'ROOM_FULL',
  'MUTED',
  'KICKED',
  'BANNED',
  'INVALID_MEDIA_URL',
  'NO_MEDIA',
  'INTERNAL',
] as const;

/** How long a kick keeps a member out before they may join again on their own. */
export const KICK_COOLDOWN_MS = 15 * 60_000;
