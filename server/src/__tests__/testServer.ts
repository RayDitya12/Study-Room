import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, RoomSnapshot, ServerToClientEvents } from '@studyroom/shared';
import { roomSettingsInputSchema } from '@studyroom/shared';
import { createApp } from '../app';
import { systemClock } from '../lib/clock';
import { generateRoomCode } from '../lib/ids';
import { RoomManager } from '../rooms/RoomManager';
import { createMemoryStore } from '../store/memoryStore';
import type { RoomStore } from '../store/RoomStore';
import { createSocketServer, type AppIoServer } from '../socket/createSocketServer';

export type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

export interface TestServer {
  url: string;
  store: RoomStore;
  io: AppIoServer;
  httpServer: HttpServer;
  roomManager: RoomManager;
  createRoom(body: {
    name: string;
    clientId: string;
    password?: string;
    settings?: Record<string, unknown>;
  }): Promise<string>;
  connectClient(): Promise<TestClient>;
  stop(): Promise<void>;
}

export async function startTestServer(options: { presenceGraceMs?: number } = {}): Promise<TestServer> {
  const store = createMemoryStore();
  const roomManager = new RoomManager({
    store,
    clock: systemClock,
    config: {
      presenceGraceMs: options.presenceGraceMs ?? 200,
      maxMembers: 30,
      roomTtlDays: 7,
    },
  });
  const corsConfig = { corsOrigins: ['http://localhost:5173'], TRUST_PROXY: 0 };
  const app = createApp({
    config: corsConfig,
    store,
    getMemberCount: (code) => roomManager.getLoaded(code)?.memberCount(),
  });
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer, {
    config: corsConfig,
    store,
    roomManager,
    clock: systemClock,
  });

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const port = (httpServer.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    store,
    io,
    httpServer,
    roomManager,
    async createRoom(body) {
      // The rooms here are a fixture, not the thing under test: they are written
      // straight to the store, so a long suite never runs into the 20-creates-a-
      // minute limit that REST itself is checked against in rest.test.ts.
      const settings = roomSettingsInputSchema.parse(body.settings ?? {});
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateRoomCode();
        if (await store.codeExists(code)) continue;
        await store.createRoom({
          code,
          name: body.name,
          passwordHash: body.password ? await bcrypt.hash(body.password, 10) : null,
          hostClientId: body.clientId,
          settings,
        });
        return code;
      }
      throw new Error('could not make a room code');
    },
    connectClient() {
      return new Promise<TestClient>((resolve, reject) => {
        const client = connect(url, {
          transports: ['websocket'],
          forceNew: true,
          reconnection: false,
        });
        client.once('connect', () => resolve(client));
        client.once('connect_error', reject);
      });
    },
    async stop() {
      roomManager.disposeAll();
      // io.close() also closes the attached http server.
      await new Promise<void>((resolve, reject) =>
        io.close((err?: Error) => (err ? reject(err) : resolve())),
      );
    },
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Emits an event and resolves with its ack. */
export function emitAck<T>(client: TestClient, event: string, payload: unknown): Promise<Ack<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout for ${event}`)), 5_000);
    // Typed emit overloads cannot be composed generically; payload types are
    // guaranteed by the tests themselves.
    const emit = client.emit.bind(client) as unknown as (
      e: string,
      p: unknown,
      cb: (res: Ack<T>) => void,
    ) => void;
    emit(event, payload, (res) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

/** Resolves with the next payload of `event`. */
export function nextEvent<T>(client: TestClient, event: string, timeoutMs = 5_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const off = client.off.bind(client) as unknown as (e: string, h?: (p: unknown) => void) => void;
    const once = client.once.bind(client) as unknown as (e: string, h: (p: unknown) => void) => void;
    const timer = setTimeout(() => {
      off(event);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload as T);
    });
  });
}

/** Collects every payload of `event` until `stop()` is called. */
export function collectEvents<T>(client: TestClient, event: string): { events: T[]; stop: () => void } {
  const events: T[] = [];
  const on = client.on.bind(client) as unknown as (e: string, h: (p: unknown) => void) => void;
  const off = client.off.bind(client) as unknown as (e: string, h: (p: unknown) => void) => void;
  const handler = (payload: unknown) => {
    events.push(payload as T);
  };
  on(event, handler);
  return {
    events,
    stop: () => off(event, handler),
  };
}

/** Joins a room and returns the snapshot, throwing on a failed ack. */
export async function joinRoom(
  client: TestClient,
  input: { code: string; nickname: string; clientId: string; password?: string },
): Promise<RoomSnapshot> {
  const ack = await emitAck<RoomSnapshot>(client, 'room:join', input);
  if (!ack.ok) throw new Error(`join failed: ${ack.error}`);
  return ack.data;
}
