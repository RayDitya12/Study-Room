import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Ack,
  BlockedMember,
  ChatMessage,
  EmptyPayload,
  ErrorCode,
  FocusSummaryEvent,
  MediaState,
  MediaStateEvent,
  Member,
  MemberStatus,
  RoomSettings,
  RoomSnapshot,
  TimerState,
} from '@studyroom/shared';
import { clockSync } from '../lib/clock';
import { createSocket, type AppSocketClient } from '../lib/socket';
import { playAlert } from '../lib/alertSounds';
import {
  clearRoomSession,
  getClientId,
  getRoomSession,
  setNickname,
  setRoomSession,
} from '../lib/session';
import { usePrefsStore } from '../stores/prefsStore';
import { useRoomStore } from '../stores/roomStore';
import { useToastStore } from '../stores/toastStore';
import { useT } from '../i18n/useT';
import type { Translate } from '../i18n';

export type TimerAction = 'start' | 'pause' | 'reset' | 'skip';

/** The music commands a controller may send; `set`, `seek` and `setLoop` are separate. */
export type MediaAction = 'play' | 'pause' | 'clear';

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
  setModerator: (targetUserId: string, isModerator: boolean) => Promise<boolean>;
  setMuted: (targetUserId: string, isMuted: boolean) => Promise<boolean>;
  kick: (targetUserId: string) => Promise<boolean>;
  ban: (targetUserId: string) => Promise<boolean>;
  unban: (targetUserId: string) => Promise<boolean>;
  getBlocks: () => Promise<BlockedMember[] | null>;
  /**
   * Controller only. Resolves with null on success, or the error code — an
   * invalid link is shown under the input rather than as a toast.
   */
  setMedia: (url: string) => Promise<ErrorCode | null>;
  mediaAction: (action: MediaAction) => Promise<void>;
  seekMedia: (positionMs: number) => Promise<void>;
  setMediaLoop: (loop: boolean) => Promise<void>;
  /** Self only: opt in or out of focus tracking. */
  setFocusTracking: (enabled: boolean) => Promise<boolean>;
  /** Self only, fire and forget: the tab went hidden or came back. */
  sendFocusState: (away: boolean) => void;
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
        } else if (res.error === 'KICKED' || res.error === 'BANNED') {
          clearRoomSession();
          useRoomStore.getState().setKicked(res.error === 'BANNED' ? 'ban' : 'kick');
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
    socket.on('room:kicked', ({ userId, reason }) => {
      const mine = userId === useRoomStore.getState().youUserId;
      useRoomStore.getState().memberKicked(userId, reason);
      if (!mine) return;
      // Dropped by the host: forget the session so nothing re-joins, and stop
      // this socket rather than letting the reconnect logic fight the ban.
      clockSync.stop();
      clearRoomSession();
      socket.disconnect();
    });
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
    socket.on('focus:summary', (event: FocusSummaryEvent) =>
      useRoomStore.getState().focusSummaryReceived(event),
    );
    socket.on('media:state', (event: MediaStateEvent) =>
      useRoomStore.getState().mediaState(event),
    );
    socket.on('timer:state', (event) => {
      useRoomStore.getState().timerState(event);
      const prefs = usePrefsStore.getState();
      if (event.reason === 'complete' && prefs.soundOn) {
        playAlert(prefs.alertSound, event.timer.phase, prefs.alertVolume);
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

  /** For actions whose only outcome the UI cares about is success or failure. */
  const run = useCallback(
    async <T>(
      emit: (socket: AppSocketClient, cb: (res: Ack<T>) => void) => void,
    ): Promise<boolean> => {
      const res = await request<T>(emit);
      if (!res.ok) notifyError(res.error);
      return res.ok;
    },
    [notifyError, request],
  );

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
        if (!res.ok) {
          if (res.error === 'KICKED' || res.error === 'BANNED') {
            clearRoomSession();
            useRoomStore.getState().setKicked(res.error === 'BANNED' ? 'ban' : 'kick');
          }
          return { ok: false, error: res.error };
        }
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
      setModerator: (targetUserId, isModerator) =>
        run<Member>((socket, cb) =>
          socket.emit('member:setModerator', { targetUserId, isModerator }, cb),
        ),
      setMuted: (targetUserId, isMuted) =>
        run<Member>((socket, cb) =>
          socket.emit('member:setMuted', { targetUserId, isMuted }, cb),
        ),
      kick: (targetUserId) =>
        run<EmptyPayload>((socket, cb) => socket.emit('member:kick', { targetUserId }, cb)),
      ban: (targetUserId) =>
        run<EmptyPayload>((socket, cb) => socket.emit('member:ban', { targetUserId }, cb)),
      unban: (targetUserId) =>
        run<EmptyPayload>((socket, cb) => socket.emit('member:unban', { targetUserId }, cb)),
      getBlocks: async () => {
        const res = await request<BlockedMember[]>((socket, cb) =>
          socket.emit('room:getBlocks', {}, cb),
        );
        if (!res.ok) {
          notifyError(res.error);
          return null;
        }
        return res.data;
      },
      setFocusTracking: (enabled) =>
        run<Member>((socket, cb) => socket.emit('focus:setTracking', { enabled }, cb)),
      sendFocusState: (away) => {
        socketRef.current?.emit('focus:state', { away }, () => undefined);
      },
      setMedia: async (url) => {
        const res = await request<MediaState>((socket, cb) => socket.emit('media:set', { url }, cb));
        if (res.ok) return null;
        // A bad link is the input's own problem; everything else is a toast.
        if (res.error !== 'INVALID_MEDIA_URL') notifyError(res.error);
        return res.error;
      },
      mediaAction: async (action) => {
        const event = `media:${action}` as const;
        const res = await request<MediaState>((socket, cb) => socket.emit(event, {}, cb));
        if (!res.ok) notifyError(res.error);
      },
      seekMedia: async (positionMs) => {
        const res = await request<MediaState>((socket, cb) =>
          socket.emit('media:seek', { positionMs }, cb),
        );
        if (!res.ok) notifyError(res.error);
      },
      setMediaLoop: async (loop) => {
        const res = await request<MediaState>((socket, cb) =>
          socket.emit('media:setLoop', { loop }, cb),
        );
        if (!res.ok) notifyError(res.error);
      },
    }),
    [notifyError, request, run],
  );

  return { autoJoinPending, actions };
}
