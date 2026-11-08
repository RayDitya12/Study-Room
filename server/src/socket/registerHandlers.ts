import {
  chatSendPayloadSchema,
  chatTypingPayloadSchema,
  emptyPayloadSchema,
  joinRoomPayloadSchema,
  memberTargetPayloadSchema,
  memberUpdatePayloadSchema,
  roomSettingsPatchSchema,
  setModeratorPayloadSchema,
  setMutedPayloadSchema,
  timeSyncPayloadSchema,
  transferHostPayloadSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type TimerState,
  type EmptyPayload,
} from '@studyroom/shared';
import type { Server } from 'socket.io';
import type { Clock } from '../lib/clock';
import type { RoomManager } from '../rooms/RoomManager';
import type { RoomRuntime } from '../rooms/RoomRuntime';
import { AppError, makeHandle, type AppSocket, type SocketData } from './handle';

export interface RegisterHandlersDeps {
  roomManager: RoomManager;
  clock: Clock;
}

export function registerHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
  deps: RegisterHandlersDeps,
): void {
  io.on('connection', (socket) => {
    const handle = makeHandle(socket as AppSocket);
    const ip = socket.handshake.address;

    const runtimeOf = (s: AppSocket): RoomRuntime => {
      const code = s.data.code;
      if (!code) throw new AppError('NOT_IN_ROOM');
      const runtime = deps.roomManager.getLoaded(code);
      if (!runtime) throw new AppError('NOT_IN_ROOM');
      return runtime;
    };

    socket.on(
      'time:sync',
      handle(timeSyncPayloadSchema, (payload) => ({
        clientSentAt: payload.clientSentAt,
        serverNow: deps.clock.now(),
      })),
    );

    socket.on(
      'room:join',
      handle(joinRoomPayloadSchema, async (payload, s) => {
        const runtime = await deps.roomManager.getOrLoad(payload.code);
        if (!runtime) throw new AppError('ROOM_NOT_FOUND');
        return runtime.join(s, {
          nickname: payload.nickname,
          clientId: payload.clientId,
          password: payload.password,
          ip,
        });
      }),
    );

    socket.on(
      'room:leave',
      handle(emptyPayloadSchema, (_payload, s) => {
        runtimeOf(s).leave(s);
        return {} as EmptyPayload;
      }),
    );

    socket.on(
      'chat:send',
      handle(chatSendPayloadSchema, (payload, s) => runtimeOf(s).sendChat(s, payload.text)),
    );

    socket.on(
      'chat:typing',
      handle(chatTypingPayloadSchema, (payload, s) => {
        runtimeOf(s).setTyping(s, payload.isTyping);
        return {} as EmptyPayload;
      }),
    );

    socket.on(
      'member:update',
      handle(memberUpdatePayloadSchema, (payload, s) => runtimeOf(s).updateMember(s, payload)),
    );

    const timerHandler = (action: 'start' | 'pause' | 'reset' | 'skip') =>
      handle(emptyPayloadSchema, (_payload, s): Promise<TimerState> =>
        runtimeOf(s).timerAction(s, action),
      );
    socket.on('timer:start', timerHandler('start'));
    socket.on('timer:pause', timerHandler('pause'));
    socket.on('timer:reset', timerHandler('reset'));
    socket.on('timer:skip', timerHandler('skip'));

    socket.on(
      'room:updateSettings',
      handle(roomSettingsPatchSchema, (payload, s) => runtimeOf(s).updateSettings(s, payload)),
    );

    socket.on(
      'room:transferHost',
      handle(transferHostPayloadSchema, (payload, s) =>
        runtimeOf(s).transferHost(s, payload.targetUserId).then(() => ({} as EmptyPayload)),
      ),
    );

    socket.on(
      'member:setModerator',
      handle(setModeratorPayloadSchema, (payload, s) =>
        runtimeOf(s).setModerator(s, payload.targetUserId, payload.isModerator),
      ),
    );

    socket.on(
      'member:setMuted',
      handle(setMutedPayloadSchema, (payload, s) =>
        runtimeOf(s).setMuted(s, payload.targetUserId, payload.isMuted),
      ),
    );

    const blockHandler = (action: 'kick' | 'ban') =>
      handle(memberTargetPayloadSchema, (payload, s): Promise<EmptyPayload> =>
        runtimeOf(s)[action](s, payload.targetUserId).then(() => ({} as EmptyPayload)),
      );
    socket.on('member:kick', blockHandler('kick'));
    socket.on('member:ban', blockHandler('ban'));

    socket.on(
      'member:unban',
      handle(memberTargetPayloadSchema, (payload, s) =>
        runtimeOf(s).unban(s, payload.targetUserId).then(() => ({} as EmptyPayload)),
      ),
    );

    socket.on(
      'room:getBlocks',
      handle(emptyPayloadSchema, (_payload, s) => runtimeOf(s).listBlocks(s)),
    );

    socket.on('disconnect', () => {
      const code = socket.data.code;
      if (!code) return;
      deps.roomManager.getLoaded(code)?.disconnectSocket(socket);
    });
  });
}
