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
  'INTERNAL',
] as const;

/** How long a kick keeps a member out before they may join again on their own. */
export const KICK_COOLDOWN_MS = 15 * 60_000;
