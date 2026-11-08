import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Ack,
  ChatMessage,
  EmptyPayload,
  ErrorCode,
  Member,
  MemberStatus,
  RoomSettings,
  RoomSnapshot,
  TimerState,
} from '@studyroom/shared';
import { clockSync } from '../lib/clock';
import { createSocket, type AppSocketClient } from '../lib/socket';
import { playPhaseChange } from '../lib/sound';
import { getClientId, getRoomSession, setNickname, setRoomSession } from '../lib/session';
import { usePrefsStore } from '../stores/prefsStore';
import { useRoomStore } from '../stores/roomStore';
import { useToastStore } from '../stores/toastStore';
import { useT } from '../i18n/useT';
import type { Translate } from '../i18n';

export type TimerAction = 'start' | 'pause' | 'reset' | 'skip';

export type JoinResult = { ok: true } | { ok: false; error: ErrorCode };

export interface RoomActions {
  join: (nickname: string, password?: string) => Promise<JoinResult>;
  leave: () => void;
  sendChat: (text: string) => Promise<void>;
  sendTyping: (isTyping: boolean) => void;
  updateMember: (patch: { status?: MemberStatus; task?: string }) => Promise<void>;
  timerAction: (action: TimerAction) => Promise<void>;
  updateSettings: (patch: Partial<RoomSettings>) => Promise<boolean>;
  transferHost: (targetUserId: string) => Promise<void>;
  setModerator: (targetUserId: string, isModerator: boolean) => Promise<void>;
}

const ACK_TIMEOUT_MS = 10_000;

/** Resolves with the server ack, or INTERNAL if the socket never answers. */
function withAck<T>(run: (cb: (res: Ack<T>) => void) => void): Promise<Ack<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (res: Ack<T>): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(res);
    };
    const timeout = window.setTimeout(() => done({ ok: false, error: 'INTERNAL' }), ACK_TIMEOUT_MS);
    run(done);
  });
}

function storedSession(code: string): { nickname: string; password?: string } | null {
  const session = getRoomSession();
  if (!session || session.code !== code) return null;
  return { nickname: session.nickname, password: session.password };
}

function errorText(t: Translate, error: ErrorCode): string {
  return error === 'RATE_LIMITED' ? t('toasts.slowDown') : t(`errors.${error}`);
}

/**
 * Owns the socket for one room: connects, clock-syncs, re-joins a stored
 * session automatically, mirrors every server event into the room store, and
 * exposes the actions the UI calls.
 */
export function useRoomConnection(code: string): {
  autoJoinPending: boolean;
  actions: RoomActions;
} {
  const socketRef = useRef<AppSocketClient | null>(null);
  const codeRef = useRef(code);
  codeRef.current = code;
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;
  const [autoJoinPending, setAutoJoinPending] = useState(() => storedSession(code) !== null);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;
    useRoomStore.getState().setConnection('connecting');

    const autoJoin = (): void => {
      const session = storedSession(codeRef.current);
      if (!session) return;
      setAutoJoinPending(true);
      void withAck<RoomSnapshot>((cb) =>
        socket.emit(
          'room:join',
          {
            code: codeRef.current,
            nickname: session.nickname,
            clientId: getClientId(),
            ...(session.password ? { password: session.password } : {}),
          },
          cb,
        ),
      ).then((res) => {
        setAutoJoinPending(false);
        if (res.ok) {
          useRoomStore.getState().applySnapshot(res.data);
        } else if (res.error === 'ROOM_NOT_FOUND') {
          useToastStore.getState().push(errorText(tRef.current, res.error));
        }
      });
    };

    socket.on('connect', () => {
      useRoomStore.getState().setConnection('connected');
      void clockSync.start(socket);
      autoJoin();
    });
    socket.on('disconnect', () => useRoomStore.getState().setConnection('disconnected'));
    socket.on('connect_error', () => useRoomStore.getState().setConnection('disconnected'));

    socket.on('member:joined', (member: Member) => useRoomStore.getState().memberJoined(member));
    socket.on('member:left', ({ userId }) => useRoomStore.getState().memberLeft(userId));
    socket.on('member:offline', ({ userId }) => useRoomStore.getState().memberOffline(userId));
    socket.on('member:updated', (member: Member) => useRoomStore.getState().memberUpdated(member));
    socket.on('room:hostChanged', ({ hostUserId }) =>
      useRoomStore.getState().hostChanged(hostUserId),
    );
    socket.on('room:settingsUpdated', (settings: RoomSettings) =>
      useRoomStore.getState().settingsUpdated(settings),
    );
    socket.on('chat:message', (message: ChatMessage) => useRoomStore.getState().chatMessage(message));
    socket.on('chat:typing', ({ userId, isTyping }) =>
      useRoomStore.getState().chatTyping(userId, isTyping),
    );
    socket.on('timer:state', (event) => {
      useRoomStore.getState().timerState(event);
      if (event.reason === 'complete' && usePrefsStore.getState().soundOn) {
        playPhaseChange(event.timer.phase);
      }
    });

    socket.connect();

    return () => {
      socketRef.current = null;
      clockSync.stop();
      if (socket.connected) {
        // Tell the server this is an explicit leave so the seat is freed at once
        // instead of waiting out the grace period.
        let finished = false;
        const finish = (): void => {
          if (finished) return;
          finished = true;
          socket.disconnect();
        };
        socket.emit('room:leave', {}, finish);
        window.setTimeout(finish, 300);
      } else {
        socket.disconnect();
      }
      useRoomStore.getState().clear();
    };
  }, []);

  const request = useCallback(
    <T,>(emit: (socket: AppSocketClient, cb: (res: Ack<T>) => void) => void): Promise<Ack<T>> => {
      const socket = socketRef.current;
      if (!socket?.connected) return Promise.resolve({ ok: false, error: 'INTERNAL' });
      return withAck<T>((cb) => emit(socket, cb));
    },
    [],
  );

  const notifyError = useCallback((error: ErrorCode) => {
    useToastStore.getState().push(errorText(tRef.current, error));
  }, []);

  const actions = useMemo<RoomActions>(
    () => ({
      join: async (nickname, password) => {
        const roomCode = codeRef.current;
        const res = await request<RoomSnapshot>((socket, cb) =>
          socket.emit(
            'room:join',
            {
              code: roomCode,
              nickname,
              clientId: getClientId(),
              ...(password ? { password } : {}),
            },
            cb,
          ),
        );
        if (!res.ok) return { ok: false, error: res.error };
        useRoomStore.getState().applySnapshot(res.data);
        setNickname(nickname);
        setRoomSession({ code: roomCode, nickname, ...(password ? { password } : {}) });
        return { ok: true };
      },
      leave: () => {
        socketRef.current?.emit('room:leave', {}, () => undefined);
        useRoomStore.getState().clear();
      },
      sendChat: async (text) => {
        const res = await request<ChatMessage>((socket, cb) => socket.emit('chat:send', { text }, cb));
        if (!res.ok) notifyError(res.error);
      },
      sendTyping: (isTyping) => {
        socketRef.current?.emit('chat:typing', { isTyping }, () => undefined);
      },
      updateMember: async (memberPatch) => {
        const res = await request<Member>((socket, cb) =>
          socket.emit('member:update', memberPatch, cb),
        );
        if (!res.ok) notifyError(res.error);
      },
      timerAction: async (action) => {
        const event = `timer:${action}` as const;
        const res = await request<TimerState>((socket, cb) => socket.emit(event, {}, cb));
        if (!res.ok) notifyError(res.error);
      },
      updateSettings: async (settingsPatch) => {
        const res = await request<RoomSettings>((socket, cb) =>
          socket.emit('room:updateSettings', settingsPatch, cb),
        );
        if (!res.ok) {
          notifyError(res.error);
          return false;
        }
        useToastStore.getState().push(tRef.current('settings.saved'));
        return true;
      },
      transferHost: async (targetUserId) => {
        const res = await request<EmptyPayload>((socket, cb) =>
          socket.emit('room:transferHost', { targetUserId }, cb),
        );
        if (!res.ok) notifyError(res.error);
      },
      setModerator: async (targetUserId, isModerator) => {
        const res = await request<Member>((socket, cb) =>
          socket.emit('member:setModerator', { targetUserId, isModerator }, cb),
        );
        if (!res.ok) notifyError(res.error);
      },
    }),
    [notifyError, request],
  );

  return { autoJoinPending, actions };
}
