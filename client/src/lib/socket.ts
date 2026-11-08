import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@studyroom/shared';

export type AppSocketClient = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createSocket(): AppSocketClient {
  // Empty in dev (same origin, Vite proxies /socket.io); absolute URL in production.
  const url: string | undefined = import.meta.env.VITE_SERVER_URL || undefined;
  return io(url, { autoConnect: false });
}
