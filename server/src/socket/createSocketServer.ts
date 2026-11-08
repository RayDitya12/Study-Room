import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@studyroom/shared';
import type { AppConfig } from '../config';
import type { Clock } from '../lib/clock';
import type { RoomManager } from '../rooms/RoomManager';
import type { RoomStore } from '../store/RoomStore';
import { registerHandlers } from './registerHandlers';
import type { SocketData } from './handle';

export type AppIoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export interface SocketServerDeps {
  config: Pick<AppConfig, 'corsOrigins'>;
  store: RoomStore;
  roomManager: RoomManager;
  clock: Clock;
}

export function createSocketServer(httpServer: HttpServer, deps: SocketServerDeps): AppIoServer {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    httpServer,
    {
      cors: { origin: deps.config.corsOrigins },
      pingInterval: 10_000,
      pingTimeout: 8_000,
      maxHttpBufferSize: 1e4,
    },
  );

  deps.roomManager.setEmitterFactory((code) => {
    // Generic spread through Parameters<> defeats socket.io's typed emit
    // overloads; the RuntimeEmitter interface already guarantees payload types.
    const room = () => io.to(`room:${code}`);
    const emitUntyped = room().emit.bind(room()) as (event: string, ...args: unknown[]) => void;
    const emitExceptUntyped = (socketId: string) =>
      room().except(socketId).emit.bind(room().except(socketId)) as (
        event: string,
        ...args: unknown[]
      ) => void;
    return {
      toRoom: (event, ...args) => emitUntyped(event as string, ...args),
      toRoomExcept: (socketId, event, ...args) => emitExceptUntyped(socketId)(event as string, ...args),
    };
  });

  registerHandlers(io, { roomManager: deps.roomManager, clock: deps.clock });
  return io;
}
