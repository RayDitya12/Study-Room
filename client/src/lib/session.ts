const CLIENT_ID_KEY = 'studyroom.clientId';
const NICKNAME_KEY = 'studyroom.nickname';
const SESSION_KEY = 'studyroom.session';

/** Secret identity; created once, persisted, never sent to other users. */
export function getClientId(): string {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  localStorage.setItem(CLIENT_ID_KEY, fresh);
  return fresh;
}

export function getNickname(): string {
  return localStorage.getItem(NICKNAME_KEY) ?? '';
}

export function setNickname(nickname: string): void {
  localStorage.setItem(NICKNAME_KEY, nickname);
}

export interface RoomSession {
  code: string;
  nickname: string;
  password?: string;
}

// In-memory copy survives navigation; sessionStorage survives a page refresh
// within the tab (used to re-join automatically after F5).
let memorySession: RoomSession | null = null;

export function setRoomSession(session: RoomSession): void {
  memorySession = session;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getRoomSession(): RoomSession | null {
  if (memorySession) return memorySession;
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RoomSession;
    if (typeof parsed.code === 'string' && typeof parsed.nickname === 'string') {
      memorySession = parsed;
      return parsed;
    }
  } catch {
    // corrupted session storage: fall through and clear
  }
  sessionStorage.removeItem(SESSION_KEY);
  return null;
}

export function clearRoomSession(): void {
  memorySession = null;
  sessionStorage.removeItem(SESSION_KEY);
}

const CONSENT_KEY = 'studyroom.focusConsent';

/**
 * Per room code, whether this device has already answered the tracking ask, so
 * a strict-focus room questions you once instead of on every render.
 */
export function hasAskedFocusConsent(code: string): boolean {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.includes(code);
  } catch {
    return false;
  }
}

export function markFocusConsentAsked(code: string): void {
  let known: unknown[] = [];
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) known = parsed;
  } catch {
    // Corrupted record: start a fresh one rather than asking again forever.
  }
  if (known.includes(code)) return;
  localStorage.setItem(CONSENT_KEY, JSON.stringify([...known, code]));
}
