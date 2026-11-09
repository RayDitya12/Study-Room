/**
 * The pure half of the focus summary: the results this device keeps, and the
 * order the dialog shows them in. The history lives on this device only.
 */

import type { FocusSessionSummary } from '@studyroom/shared';

export interface FocusHistoryEntry {
  /** Server epoch ms of the session that ended. */
  at: number;
  focusPct: number;
  awayCount: number;
  activeMs: number;
}

export const FOCUS_HISTORY_KEY = 'studyroom.focusHistory';
/** Stored ceiling and what the summary dialog actually shows. */
export const FOCUS_HISTORY_MAX = 10;
export const FOCUS_HISTORY_SHOWN = 5;

function isEntry(value: unknown): value is FocusHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at) &&
    typeof entry.focusPct === 'number' &&
    Number.isFinite(entry.focusPct) &&
    typeof entry.awayCount === 'number' &&
    Number.isFinite(entry.awayCount) &&
    typeof entry.activeMs === 'number' &&
    Number.isFinite(entry.activeMs)
  );
}

/** Never trusts the stored blob: a hand-edited or half-written entry is dropped. */
export function parseHistory(raw: string | null): FocusHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).map((entry) => ({
      at: entry.at,
      focusPct: Math.min(100, Math.max(0, Math.round(entry.focusPct))),
      awayCount: Math.max(0, Math.round(entry.awayCount)),
      activeMs: Math.max(0, Math.round(entry.activeMs)),
    }));
  } catch {
    return [];
  }
}

/** Newest first, and only the most recent `FOCUS_HISTORY_MAX` sessions are kept. */
export function pushHistory(
  entries: readonly FocusHistoryEntry[],
  entry: FocusHistoryEntry,
): FocusHistoryEntry[] {
  return [entry, ...entries].slice(0, FOCUS_HISTORY_MAX);
}

export function readHistory(): FocusHistoryEntry[] {
  return parseHistory(localStorage.getItem(FOCUS_HISTORY_KEY));
}

export function appendHistory(entry: FocusHistoryEntry): FocusHistoryEntry[] {
  const next = pushHistory(readHistory(), entry);
  localStorage.setItem(FOCUS_HISTORY_KEY, JSON.stringify(next));
  return next;
}

/** Best first, so the room reads as a leaderboard rather than a roster. */
export function sortSummaries(summaries: FocusSessionSummary[]): FocusSessionSummary[] {
  return summaries.slice().sort(
    (a, b) =>
      b.focusPct - a.focusPct ||
      a.awayCount - b.awayCount ||
      a.nickname.localeCompare(b.nickname),
  );
}
