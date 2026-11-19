/**
 * The rooms this device joined most recently, newest first. Only what a row
 * needs: the code, the name it last had, and when it was used.
 */
export interface RecentRoom {
  code: string;
  name: string;
  /** When this device last joined it, in epoch ms. */
  at: number;
}

export const MAX_RECENT_ROOMS = 5;

const RECENT_KEY = 'studyroom.recentRooms';
const DAY_MS = 86_400_000;

function isRecentRoom(value: unknown): value is RecentRoom {
  if (typeof value !== 'object' || value === null) return false;
  const { code, name, at } = value as { code?: unknown; name?: unknown; at?: unknown };
  return (
    typeof code === 'string' &&
    code.length > 0 &&
    typeof name === 'string' &&
    typeof at === 'number' &&
    Number.isFinite(at)
  );
}

/** Move `room` to the front, so a room you keep using is never listed twice. */
export function withRecentRoom(list: RecentRoom[], room: RecentRoom): RecentRoom[] {
  const code = room.code.toUpperCase();
  const rest = list.filter((entry) => entry.code.toUpperCase() !== code);
  return [{ ...room, code }, ...rest].slice(0, MAX_RECENT_ROOMS);
}

export function withoutRecentRoom(list: RecentRoom[], code: string): RecentRoom[] {
  const needle = code.toUpperCase();
  return list.filter((entry) => entry.code.toUpperCase() !== needle);
}

/**
 * Which `home.recent*` key says when this room was used. A key and a number
 * rather than a sentence, because the sentence lives in the dictionaries and
 * English needs the singular for one day.
 */
export function describeLastUsed(
  at: number,
  now: number,
): { key: 'today' | 'yesterday' | 'daysAgo'; count: number } {
  const days = Math.floor((now - at) / DAY_MS);
  if (days <= 0) return { key: 'today', count: 0 };
  if (days === 1) return { key: 'yesterday', count: 1 };
  return { key: 'daysAgo', count: days };
}

/**
 * Anything in storage is untrusted: it survives a bad deploy, a hand edit, and
 * whatever else was written under this key. A list that cannot be read is no
 * list, so it reads as empty rather than throwing on the home page.
 */
export function parseRecentRooms(raw: string | null): RecentRoom[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentRoom).slice(0, MAX_RECENT_ROOMS);
  } catch {
    return [];
  }
}

export function readRecentRooms(): RecentRoom[] {
  return parseRecentRooms(localStorage.getItem(RECENT_KEY));
}

function writeRecentRooms(list: RecentRoom[]): void {
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

export function rememberRoom(room: { code: string; name: string }, at: number): void {
  writeRecentRooms(withRecentRoom(readRecentRooms(), { ...room, code: room.code.toUpperCase(), at }));
}

export function forgetRoom(code: string): void {
  writeRecentRooms(withoutRecentRoom(readRecentRooms(), code));
}
