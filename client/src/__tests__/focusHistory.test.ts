import { describe, expect, it } from 'vitest';
import type { FocusSessionSummary } from '@studyroom/shared';
import {
  FOCUS_HISTORY_MAX,
  parseHistory,
  pushHistory,
  sortSummaries,
  type FocusHistoryEntry,
} from '../lib/focusHistory';

function entry(at: number, focusPct = 90): FocusHistoryEntry {
  return { at, focusPct, awayCount: 2, activeMs: 60_000 };
}

describe('pushHistory', () => {
  it('keeps the last ten sessions, newest first', () => {
    let history: FocusHistoryEntry[] = [];
    for (let i = 0; i < 25; i += 1) history = pushHistory(history, entry(i));
    expect(history.length).toBe(FOCUS_HISTORY_MAX);
    expect(history.map((e) => e.at)).toEqual([24, 23, 22, 21, 20, 19, 18, 17, 16, 15]);
  });

  it('puts the new session in front of an existing list', () => {
    const history = pushHistory([entry(1)], entry(2));
    expect(history.map((e) => e.at)).toEqual([2, 1]);
  });

  it('never mutates the list it was given', () => {
    const before = [entry(1)];
    pushHistory(before, entry(2));
    expect(before.length).toBe(1);
  });
});

describe('parseHistory', () => {
  it('reads back what was written', () => {
    const raw = JSON.stringify([entry(5, 100), entry(4, 0)]);
    expect(parseHistory(raw)).toEqual([entry(5, 100), entry(4, 0)]);
  });

  it('drops anything that is not a plausible entry', () => {
    const raw = JSON.stringify([entry(1), 'nope', 7, null, { at: 2 }, { at: 3, focusPct: 'x' }]);
    expect(parseHistory(raw)).toEqual([entry(1)]);
  });

  it('survives missing, corrupt and non-array storage', () => {
    for (const raw of [null, '', 'not json', '{}', '42', '[]']) {
      expect(parseHistory(raw)).toEqual([]);
    }
  });

  it('reclamps values a hand-edited entry carries', () => {
    const raw = JSON.stringify([{ at: 1, focusPct: 140, awayCount: -3, activeMs: 1_500.7 }]);
    expect(parseHistory(raw)).toEqual([{ at: 1, focusPct: 100, awayCount: 0, activeMs: 1_501 }]);
  });
});

describe('sortSummaries', () => {
  const summary = (
    nickname: string,
    focusPct: number,
    awayCount = 0,
  ): FocusSessionSummary => ({
    userId: nickname,
    nickname,
    focusPct,
    awayCount,
    awayMs: 6_000,
    activeMs: 60_000,
  });

  it('ranks the best focus first', () => {
    const sorted = sortSummaries([summary('Cai', 40), summary('Ada', 92), summary('Bo', 75)]);
    expect(sorted.map((s) => s.nickname)).toEqual(['Ada', 'Bo', 'Cai']);
  });

  it('breaks a tie by fewer absences, then by name', () => {
    const sorted = sortSummaries([
      summary('Zoe', 80, 3),
      summary('Ann', 80, 1),
      summary('Ben', 80, 1),
    ]);
    expect(sorted.map((s) => s.nickname)).toEqual(['Ann', 'Ben', 'Zoe']);
  });

  it('does not reorder the list it was given', () => {
    const list = [summary('Ann', 50), summary('Bo', 90)];
    sortSummaries(list);
    expect(list.map((s) => s.nickname)).toEqual(['Ann', 'Bo']);
  });
});
