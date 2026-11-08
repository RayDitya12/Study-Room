import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createMemoryStore } from '../store/memoryStore';
import type { RoomStore } from '../store/RoomStore';

const CLIENT_ID = '5b0f6a1e-6d3a-4a5b-9a2c-1f7d3e4b5c6d';

let httpServer: Server;
let base: string;
let store: RoomStore;

beforeAll(async () => {
  store = createMemoryStore();
  const app = createApp({ config: { corsOrigins: ['http://localhost:5173'], TRUST_PROXY: 0 }, store });
  httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    httpServer.close((err) => (err ? reject(err) : resolve())),
  );
});

describe('GET /health', () => {
  it('reports ok with an uptime', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; uptime: number };
    expect(body.ok).toBe(true);
    expect(typeof body.uptime).toBe('number');
  });
});

describe('POST /api/rooms', () => {
  it('creates a room and returns a 6-char code', async () => {
    const res = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Morning focus', clientId: CLIENT_ID }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { code: string };
    expect(body.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);

    const room = await store.getByCode(body.code);
    expect(room).not.toBeNull();
    expect(room?.name).toBe('Morning focus');
    expect(room?.hostClientId).toBe(CLIENT_ID);
    expect(room?.passwordHash).toBeNull();
    expect(room?.settings).toMatchObject({ focusMin: 25, cyclesBeforeLong: 4, timerControl: 'host' });
    expect(room?.timer).toMatchObject({ phase: 'focus', status: 'idle' });
  });

  it('hashes the password with bcrypt (never stores it raw)', async () => {
    const res = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Locked', clientId: CLIENT_ID, password: 'secret1' }),
    });
    const { code } = (await res.json()) as { code: string };
    const room = await store.getByCode(code);
    expect(room?.passwordHash).not.toBeNull();
    expect(room?.passwordHash).not.toBe('secret1');
    expect(room?.passwordHash?.startsWith('$2')).toBe(true);
  });

  it('rejects invalid bodies with 400 INVALID_INPUT', async () => {
    const res = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', clientId: CLIENT_ID }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'INVALID_INPUT' });
  });

  it('rejects unknown fields (.strict)', async () => {
    const res = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'ok', clientId: CLIENT_ID, isHost: true }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/rooms/:code/meta', () => {
  it('returns exists:false for unknown rooms', async () => {
    const res = await fetch(`${base}/api/rooms/ZZZZZZ/meta`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ exists: false });
  });

  it('returns metadata without leaking the hash, normalizing case', async () => {
    const created = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Meta room', clientId: CLIENT_ID, password: 'pass1234' }),
    });
    const { code } = (await created.json()) as { code: string };

    const res = await fetch(`${base}/api/rooms/${code.toLowerCase()}/meta`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ exists: true, name: 'Meta room', hasPassword: true, memberCount: 0 });
    expect(JSON.stringify(body)).not.toContain('$2');
  });
});

describe('unknown routes', () => {
  it('answer 404 with an ErrorCode body', async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'INVALID_INPUT' });
  });
});
