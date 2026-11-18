import { describe, expect, it } from 'vitest';
import {
  MAX_RECENT_ROOMS,
  type RecentRoom,
  describeLastUsed,
  parseRecentRooms,
  withRecentRoom,
  withoutRecentRoom,
} from '../lib/recentRooms';

const DAY = 86_400_000;
const room = (code: string, at = 1_700_000_000_000): RecentRoom => ({
  code,
  name: `Room ${code}`,
  at,
});

describe('recentRooms: withRecentRoom', () => {
  it('puts the room you just used first', () => {
    const list = [room('AAAAAA'), room('BBBBBB')];
    expect(withRecentRoom(list, room('BBBBBB')).map((r) => r.code)).toEqual(['BBBBBB', 'AAAAAA']);
  });

  it('lists a room once, under the name it last had', () => {
    const list = [room('AAAAAA'), room('BBBBBB')];
    const next = withRecentRoom(list, { code: 'aaaaaa', name: 'Renamed', at: 2 });
    expect(next[0]).toEqual({ code: 'AAAAAA', name: 'Renamed', at: 2 });
    expect(next).toHaveLength(2);
  });

  it('never grows past the cap', () => {
    let list: RecentRoom[] = [];
    for (let i = 0; i < 20; i++) list = withRecentRoom(list, room(`C${i}`.padEnd(6, 'X')));
    expect(list).toHaveLength(MAX_RECENT_ROOMS);
    expect(list[0]?.code).toBe('C19XXX');
  });
});

describe('recentRooms: withoutRecentRoom', () => {
  it('drops a room whatever case it is offered in', () => {
    const list = [room('AAAAAA'), room('BBBBBB')];
    expect(withoutRecentRoom(list, 'bbbbbb')).toEqual([room('AAAAAA')]);
  });

  it('leaves the list alone when the code is not there', () => {
    const list = [room('AAAAAA')];
    expect(withoutRecentRoom(list, 'ZZZZZZ')).toEqual(list);
  });
});

describe('recentRooms: describeLastUsed', () => {
  const now = 10 * DAY;

  it('calls anything used today today', () => {
    expect(describeLastUsed(now, now)).toEqual({ key: 'today', count: 0 });
    expect(describeLastUsed(now - 3_600_000, now)).toEqual({ key: 'today', count: 0 });
  });

  it('says yesterday once, and counts days after that', () => {
    expect(describeLastUsed(now - DAY, now)).toEqual({ key: 'yesterday', count: 1 });
    expect(describeLastUsed(now - 2 * DAY, now)).toEqual({ key: 'daysAgo', count: 2 });
    expect(describeLastUsed(now - 11 * DAY, now)).toEqual({ key: 'daysAgo', count: 11 });
  });

  it('treats a clock in the future as just now', () => {
    expect(describeLastUsed(now + DAY, now)).toEqual({ key: 'today', count: 0 });
  });
});

describe('recentRooms: parseRecentRooms', () => {
  it('reads an empty device as no rooms', () => {
    expect(parseRecentRooms(null)).toEqual([]);
    expect(parseRecentRooms('')).toEqual([]);
  });

  it('shrugs at storage it did not write', () => {
    expect(parseRecentRooms('not json')).toEqual([]);
    expect(parseRecentRooms('{"code":"AAAAAA"}')).toEqual([]);
    expect(parseRecentRooms('null')).toEqual([]);
  });

  it('keeps the rows it can use and drops the ones it cannot', () => {
    const raw = JSON.stringify([room('AAAAAA'), { code: 7 }, null, 'x', room('BBBBBB')]);
    expect(parseRecentRooms(raw).map((r) => r.code)).toEqual(['AAAAAA', 'BBBBBB']);
  });

  it('drops a row whose last-used stamp is missing or junk', () => {
    const raw = JSON.stringify([{ code: 'AAAAAA', name: 'No stamp' }, room('BBBBBB')]);
    expect(parseRecentRooms(raw).map((r) => r.code)).toEqual(['BBBBBB']);
  });

  it('caps what it returns at the same size the writer caps at', () => {
    const raw = JSON.stringify(Array.from({ length: 12 }, (_, i) => room(`C${i}`)));
    expect(parseRecentRooms(raw)).toHaveLength(MAX_RECENT_ROOMS);
  });
});
