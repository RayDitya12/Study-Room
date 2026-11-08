import { createServer } from 'node:http';
import { config } from './config';
import { createApp } from './app';
import { createMemoryStore } from './store/memoryStore';
import type { RoomStore } from './store/RoomStore';
import { systemClock } from './lib/clock';
import { RoomManager } from './rooms/RoomManager';
import { createSocketServer } from './socket/createSocketServer';

async function createStore(): Promise<{ store: RoomStore; disconnect: () => Promise<void> }> {
  if (config.STORE === 'prisma') {
    const { PrismaClient } = await import('@prisma/client');
    const { createPrismaStore } = await import('./store/prismaStore');
    const prisma = new PrismaClient();
    return { store: createPrismaStore(prisma), disconnect: () => prisma.$disconnect() };
  }
  return { store: createMemoryStore(), disconnect: async () => {} };
}

async function main(): Promise<void> {
  const { store, disconnect } = await createStore();
  const roomManager = new RoomManager({
    store,
    clock: systemClock,
    config: {
      presenceGraceMs: config.PRESENCE_GRACE_MS,
      maxMembers: config.MAX_MEMBERS,
      roomTtlDays: config.ROOM_TTL_DAYS,
    },
  });

  const app = createApp({
    config,
    store,
    getMemberCount: (code) => roomManager.getLoaded(code)?.memberCount(),
  });
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer, { config, store, roomManager, clock: systemClock });

  await roomManager.recoverRunningRooms();
  roomManager.startCleanupJob();

  httpServer.listen(config.PORT, () => {
    console.log(`[server] listening on http://localhost:${config.PORT} (store: ${config.STORE})`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received, shutting down`);
    roomManager.stopCleanupJob();
    // Timers are persisted on every change, so there is nothing extra to flush.
    httpServer.close();
    io.close(() => {
      roomManager.disposeAll();
      void disconnect().then(() => process.exit(0));
    });
    // Force-exit if lingering sockets keep the server alive.
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
