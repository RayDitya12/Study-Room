import { beforeEach, describe, expect, it } from 'vitest';
import {
  mediaMachine,
  type FocusSummaryEvent,
  type Member,
  type RoomSnapshot,
  type TimerState,
} from '@studyroom/shared';
import { useRoomStore, type SystemLine } from '../stores/roomStore';

const member = (over: Partial<Member> = {}): Member => {
  const m: Member = {
    userId: 'u1',
    nickname: 'Anna',
    status: 'focusing',
    task: '',
    isHost: true,
    isModerator: false,
    role: 'host',
    isMuted: false,
    focus: { tracking: false, away: false, awaySince: null, awayCount: 0, awayMs: 0 },
    online: true,
    joinedAt: 1_000,
    ...over,
  };
  // Derive the role exactly like the server does, so a test cannot describe a
  // member who is both host and plain member.
  if (over.role) return m;
  return { ...m, role: m.isHost ? 'host' : m.isModerator ? 'mod' : 'member' };
};

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
    strictFocus: false,
  },
  you: { userId: 'u1' },
  hostUserId: 'u1',
  members: [member()],
  timer: timer(),
  media: mediaMachine.createInitialMedia(5_000),
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
      snapshot({
        members: [
          member(),
          member({ userId: 'u2', nickname: 'Bo', isHost: false }),
          member({ userId: 'u3', nickname: 'Cy', isHost: false, isModerator: true }),
        ],
      }),
    );
    useRoomStore.getState().hostChanged('u2');
    const s = useRoomStore.getState();
    expect(s.hostUserId).toBe('u2');
    expect(s.members.find((m) => m.userId === 'u1')?.isHost).toBe(false);
    expect(s.members.find((m) => m.userId === 'u2')?.isHost).toBe(true);
    // The role label has to move with the crown, and a moderator keeps theirs.
    expect(s.members.find((m) => m.userId === 'u1')?.role).toBe('member');
    expect(s.members.find((m) => m.userId === 'u2')?.role).toBe('host');
    expect(s.members.find((m) => m.userId === 'u3')?.role).toBe('mod');
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

  it('removes a kicked member with a line naming the reason', () => {
    useRoomStore.getState().applySnapshot(
      snapshot({ members: [member(), member({ userId: 'u2', nickname: 'Bo', isHost: false })] }),
    );
    useRoomStore.getState().chatTyping('u2', true);
    useRoomStore.getState().memberKicked('u2', 'kick');
    const s = useRoomStore.getState();
    expect(s.members.map((m) => m.userId)).toEqual(['u1']);
    expect(s.typing.u2).toBeUndefined();
    expect(s.kicked).toBeNull();
    expect(lines().at(-1)?.key).toBe('chat.kicked');
    expect(lines().at(-1)?.params).toEqual({ name: 'Bo' });
  });

  it('names a ban differently from a kick', () => {
    useRoomStore.getState().applySnapshot(
      snapshot({ members: [member(), member({ userId: 'u2', nickname: 'Bo', isHost: false })] }),
    );
    useRoomStore.getState().memberKicked('u2', 'ban');
    expect(lines().at(-1)?.key).toBe('chat.banned');
  });

  it('empties the room when this client is the one removed', () => {
    useRoomStore.getState().applySnapshot(snapshot());
    useRoomStore.getState().memberKicked('u1', 'ban');
    const s = useRoomStore.getState();
    expect(s.hasRoom).toBe(false);
    expect(s.members).toHaveLength(0);
    expect(s.kicked).toBe('ban');
    expect(s.connection).toBe('disconnected');
  });

  it('starts the room empty for a join the server already rejected', () => {
    useRoomStore.getState().applySnapshot(snapshot());
    useRoomStore.getState().setKicked('kick');
    expect(useRoomStore.getState().hasRoom).toBe(false);
    expect(useRoomStore.getState().kicked).toBe('kick');
    useRoomStore.getState().applySnapshot(snapshot());
    expect(useRoomStore.getState().kicked).toBeNull();
  });

  it('carries a focus summary until the dialog closes it', () => {
    useRoomStore.getState().applySnapshot(snapshot());
    const event: FocusSummaryEvent = {
      summaries: [
        { userId: 'u1', nickname: 'Anna', awayCount: 2, awayMs: 8_000, activeMs: 60_000, focusPct: 87 },
      ],
      endedBy: 'complete',
    };
    useRoomStore.getState().focusSummaryReceived(event);
    expect(useRoomStore.getState().focusSummary).toEqual(event);
    useRoomStore.getState().focusSummaryReceived(null);
    expect(useRoomStore.getState().focusSummary).toBeNull();
  });

  it('does not leave a summary dialog behind when the room goes', () => {
    useRoomStore.getState().focusSummaryReceived({ summaries: [], endedBy: 'reset' });
    useRoomStore.getState().clear();
    expect(useRoomStore.getState().focusSummary).toBeNull();
  });

  it('keeps the focus counters a member update brings', () => {
    useRoomStore.getState().applySnapshot(snapshot());
    useRoomStore.getState().memberUpdated(
      member({
        focus: { tracking: true, away: true, awaySince: 9_000, awayCount: 3, awayMs: 12_000 },
      }),
    );
    expect(useRoomStore.getState().members[0]?.focus).toEqual({
      tracking: true,
      away: true,
      awaySince: 9_000,
      awayCount: 3,
      awayMs: 12_000,
    });
  });
});
