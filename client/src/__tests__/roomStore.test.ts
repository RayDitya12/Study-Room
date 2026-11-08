import { beforeEach, describe, expect, it } from 'vitest';
import type { Member, RoomSnapshot, TimerState } from '@studyroom/shared';
import { useRoomStore, type SystemLine } from '../stores/roomStore';

const member = (over: Partial<Member> = {}): Member => ({
  userId: 'u1',
  nickname: 'Anna',
  status: 'focusing',
  task: '',
  isHost: true,
  online: true,
  joinedAt: 1_000,
  ...over,
});

const timer = (over: Partial<TimerState> = {}): TimerState => ({
  phase: 'focus',
  status: 'idle',
  phaseDurationMs: 60_000,
  remainingMs: 60_000,
  endsAt: null,
  completedFocus: 0,
  version: 1,
  ...over,
});

const snapshot = (over: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
  code: 'ABC123',
  name: 'Morning focus',
  hasPassword: false,
  settings: {
    focusMin: 25,
    breakMin: 5,
    longBreakMin: 15,
    cyclesBeforeLong: 4,
    autoStart: false,
    timerControl: 'host',
  },
  you: { userId: 'u1' },
  hostUserId: 'u1',
  members: [member()],
  timer: timer(),
  messages: [],
  serverNow: 5_000,
  ...over,
});

const lines = (): SystemLine[] =>
  useRoomStore
    .getState()
    .messages.filter((m): m is SystemLine => m.kind === 'system');

beforeEach(() => {
  useRoomStore.getState().clear();
});

describe('roomStore', () => {
  it('replaces everything on a snapshot', () => {
    useRoomStore.getState().applySnapshot(snapshot());
    const s = useRoomStore.getState();
    expect(s.hasRoom).toBe(true);
    expect(s.code).toBe('ABC123');
    expect(s.youUserId).toBe('u1');
    expect(s.members).toHaveLength(1);
    expect(s.timer?.version).toBe(1);
  });

  it('adds a joined line only for a member it has not seen', () => {
    useRoomStore.getState().applySnapshot(snapshot());
    useRoomStore.getState().memberJoined(member({ userId: 'u2', nickname: 'Bo', isHost: false }));
    useRoomStore.getState().memberJoined(member({ userId: 'u2', nickname: 'Bo', isHost: false }));
    expect(lines()).toHaveLength(1);
    expect(lines()[0]?.params).toEqual({ name: 'Bo' });
    expect(useRoomStore.getState().members).toHaveLength(2);
  });

  it('ignores updates for members that already left', () => {
    useRoomStore.getState().applySnapshot(
      snapshot({ members: [member(), member({ userId: 'u2', nickname: 'Bo', isHost: false })] }),
    );
    useRoomStore.getState().memberLeft('u2');
    useRoomStore.getState().memberUpdated(member({ userId: 'u2', nickname: 'Bo' }));
    expect(useRoomStore.getState().members.map((m) => m.userId)).toEqual(['u1']);
    expect(lines().map((l) => l.key)).toContain('chat.left');
  });

  it('never rewinds the timer to an older version', () => {
    useRoomStore.getState().applySnapshot(snapshot());
    useRoomStore.getState().timerState({ timer: timer({ version: 5, remainingMs: 10_000 }), reason: 'pause' });
    useRoomStore.getState().timerState({ timer: timer({ version: 3, remainingMs: 60_000 }), reason: 'start' });
    expect(useRoomStore.getState().timer?.version).toBe(5);
    expect(useRoomStore.getState().timer?.remainingMs).toBe(10_000);
  });

  it('writes a phase line only when the server completed a phase', () => {
    useRoomStore.getState().applySnapshot(snapshot());
    useRoomStore.getState().timerState({ timer: timer({ version: 2 }), reason: 'start' });
    expect(lines()).toHaveLength(0);
    useRoomStore.getState().timerState({
      timer: timer({ version: 3, phase: 'break' }),
      reason: 'complete',
    });
    expect(lines()).toHaveLength(1);
    expect(lines()[0]?.phase).toBe('break');
  });

  it('flips host flags and announces the new host', () => {
    useRoomStore.getState().applySnapshot(
      snapshot({ members: [member(), member({ userId: 'u2', nickname: 'Bo', isHost: false })] }),
    );
    useRoomStore.getState().hostChanged('u2');
    const s = useRoomStore.getState();
    expect(s.hostUserId).toBe('u2');
    expect(s.members.find((m) => m.userId === 'u1')?.isHost).toBe(false);
    expect(s.members.find((m) => m.userId === 'u2')?.isHost).toBe(true);
    expect(lines()[0]?.key).toBe('chat.hostChanged');
  });

  it('drops a typing indicator when that member sends a message', () => {
    useRoomStore.getState().applySnapshot(snapshot());
    useRoomStore.getState().chatTyping('u2', true);
    expect(useRoomStore.getState().typing.u2).toBeGreaterThan(Date.now());
    useRoomStore.getState().chatMessage({
      id: 'm1',
      userId: 'u2',
      nickname: 'Bo',
      text: 'hi',
      createdAt: 9_000,
    });
    expect(useRoomStore.getState().typing.u2).toBeUndefined();
    expect(useRoomStore.getState().messages).toHaveLength(1);
  });

  it('clears offline typing indicators', () => {
    useRoomStore.getState().applySnapshot(
      snapshot({ members: [member(), member({ userId: 'u2', nickname: 'Bo', isHost: false })] }),
    );
    useRoomStore.getState().chatTyping('u2', true);
    useRoomStore.getState().memberOffline('u2');
    expect(useRoomStore.getState().typing.u2).toBeUndefined();
    expect(useRoomStore.getState().members.find((m) => m.userId === 'u2')?.online).toBe(false);
  });
});
