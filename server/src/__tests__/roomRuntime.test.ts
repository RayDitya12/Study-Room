import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RoomSettings, TimerStateEvent } from '@studyroom/shared';
import type { Clock, TimeoutHandle } from '../lib/clock';
import { createMemoryStore } from '../store/memoryStore';
import { RoomRuntime, type RuntimeEmitter, type RuntimeSocket } from '../rooms/RoomRuntime';
import type { RoomStore } from '../store/RoomStore';

interface FakeClock extends Clock {
  advance(ms: number): void;
}

function createFakeClock(start = 1_000_000): FakeClock {
  let current = start;
  let nextId = 1;
  const timers = new Map<number, { fn: () => void; at: number }>();
  return {
    now: () => current,
    setTimeout(fn: () => void, ms: number): TimeoutHandle {
      const id = nextId++;
      timers.set(id, { fn, at: current + ms });
      return id as unknown as TimeoutHandle;
    },
    clearTimeout(handle: TimeoutHandle) {
      timers.delete(handle as unknown as number);
    },
    advance(ms: number) {
      const target = current + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
        const first = due[0];
        if (!first) break;
        timers.delete(first[0]);
        current = Math.max(current, first[1].at);
        first[1].fn();
      }
      current = target;
    },
  };
}

interface RecordedEvent {
  event: string;
  args: unknown[];
  exceptSocketId?: string;
}

function createRecordingEmitter(): { emitter: RuntimeEmitter; events: RecordedEvent[] } {
  const events: RecordedEvent[] = [];
  return {
    events,
    emitter: {
      toRoom: (event, ...args) => events.push({ event: event as string, args }),
      toRoomExcept: (socketId, event, ...args) =>
        events.push({ event: event as string, args, exceptSocketId: socketId }),
    },
  };
}

function fakeSocket(id: string): RuntimeSocket {
  return { id, data: {}, join: () => {} };
}

/** Lets queued microtasks (store persistence) settle. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10));

const baseSettings: RoomSettings = {
  focusMin: 1,
  breakMin: 1,
  longBreakMin: 1,
  cyclesBeforeLong: 2,
  autoStart: false,
  timerControl: 'host',
};

interface TestContext {
  runtime: RoomRuntime;
  store: RoomStore;
  clock: FakeClock;
  events: RecordedEvent[];
}

async function makeRuntime(settingsOverrides: Partial<RoomSettings> = {}, graceMs = 1_000): Promise<TestContext> {
  const store = createMemoryStore();
  const clock = createFakeClock();
  const settings: RoomSettings = { ...baseSettings, ...settingsOverrides };
  const stored = await store.createRoom({
    code: 'ABC234',
    name: 'Test room',
    passwordHash: null,
    hostClientId: hostCid,
    settings,
  });
  const { emitter, events } = createRecordingEmitter();
  const runtime = new RoomRuntime({
    stored,
    store,
    clock,
    emitter,
    presenceGraceMs: graceMs,
    maxMembers: 30,
  });
  return { runtime, store, clock, events };
}

let hostCid: string;
let guestCid: string;

beforeEach(() => {
  hostCid = randomUUID();
  guestCid = randomUUID();
});

describe('phase scheduling', () => {
  it('auto-advances focus -> break when the phase ends', async () => {
    const { runtime, clock, events } = await makeRuntime();
    const sock = fakeSocket('s1');
    await runtime.join(sock, { nickname: 'Anna', clientId: hostCid, ip: '1.2.3.4' });

    const started = await runtime.timerAction(sock, 'start');
    expect(started.status).toBe('running');
    expect(started.endsAt).toBe(clock.now() + 60_000);

    clock.advance(60_000);
    await flush();

    expect(runtime.timer.phase).toBe('break');
    expect(runtime.timer.status).toBe('idle'); // autoStart is off
    expect(runtime.timer.completedFocus).toBe(1);
    const completes = events.filter((e) => e.event === 'timer:state');
    const last = completes[completes.length - 1]?.args[0] as TimerStateEvent;
    expect(last.reason).toBe('complete');
    expect(last.timer.phase).toBe('break');
  });

  it('autoStart re-schedules through break and back to focus', async () => {
    const { runtime, clock } = await makeRuntime({ autoStart: true });
    const sock = fakeSocket('s1');
    await runtime.join(sock, { nickname: 'Anna', clientId: hostCid, ip: '1.2.3.4' });
    await runtime.timerAction(sock, 'start');

    clock.advance(60_000); // focus ends
    await flush();
    expect(runtime.timer).toMatchObject({ phase: 'break', status: 'running' });

    clock.advance(60_000); // break ends
    await flush();
    expect(runtime.timer).toMatchObject({ phase: 'focus', status: 'running', completedFocus: 1 });
  });

  it('pause clears the pending phase timeout', async () => {
    const { runtime, clock } = await makeRuntime();
    const sock = fakeSocket('s1');
    await runtime.join(sock, { nickname: 'Anna', clientId: hostCid, ip: '1.2.3.4' });
    await runtime.timerAction(sock, 'start');
    await runtime.timerAction(sock, 'pause');
    clock.advance(120_000);
    await flush();
    expect(runtime.timer).toMatchObject({ phase: 'focus', status: 'paused' });
  });

  it('start while running is a no-op (no extra timer:state)', async () => {
    const { runtime, events } = await makeRuntime();
    const sock = fakeSocket('s1');
    await runtime.join(sock, { nickname: 'Anna', clientId: hostCid, ip: '1.2.3.4' });
    const first = await runtime.timerAction(sock, 'start');
    const before = events.filter((e) => e.event === 'timer:state').length;
    const second = await runtime.timerAction(sock, 'start');
    expect(second).toEqual(first);
    expect(events.filter((e) => e.event === 'timer:state').length).toBe(before);
  });

  it('boot recovery completes an overdue running phase once', async () => {
    const store = createMemoryStore();
    const clock = createFakeClock();
    const stored = await store.createRoom({
      code: 'REC234',
      name: 'Recovery',
      passwordHash: null,
      hostClientId: hostCid,
      settings: baseSettings,
    });
    // Simulate a crash: focus started 2 minutes before "now".
    await store.saveRoomState(stored.id, {
      timer: {
        phase: 'focus',
        status: 'running',
        phaseDurationMs: 60_000,
        remainingMs: 60_000,
        endsAt: clock.now() - 120_000,
        completedFocus: 0,
        version: 3,
      },
    });
    const fresh = await store.getByCode('REC234');
    expect(fresh).not.toBeNull();
    const { emitter } = createRecordingEmitter();
    const runtime = new RoomRuntime({
      stored: fresh!,
      store,
      clock,
      emitter,
      presenceGraceMs: 1_000,
      maxMembers: 30,
    });
    await runtime.resumeFromStored();
    expect(runtime.timer).toMatchObject({ phase: 'break', status: 'idle', completedFocus: 1 });
  });
});

describe('presence + host transfer', () => {
  it('grace expiry removes the member', async () => {
    const { runtime, clock, events } = await makeRuntime({}, 500);
    const sock = fakeSocket('s1');
    await runtime.join(sock, { nickname: 'Anna', clientId: hostCid, ip: '1.2.3.4' });

    runtime.disconnectSocket(sock);
    expect(events.some((e) => e.event === 'member:offline')).toBe(true);
    expect(runtime.memberCount()).toBe(1);

    clock.advance(500);
    await flush();
    expect(runtime.memberCount()).toBe(0);
    expect(events.some((e) => e.event === 'member:left')).toBe(true);
  });

  it('reconnect within grace cancels removal', async () => {
    const { runtime, clock, events } = await makeRuntime({}, 500);
    const sock = fakeSocket('s1');
    await runtime.join(sock, { nickname: 'Anna', clientId: hostCid, ip: '1.2.3.4' });
    runtime.disconnectSocket(sock);

    clock.advance(200);
    const sock2 = fakeSocket('s2');
    await runtime.join(sock2, { nickname: 'Anna', clientId: hostCid, ip: '1.2.3.4' });
    clock.advance(1_000);
    await flush();
    expect(runtime.memberCount()).toBe(1);
    expect(events.some((e) => e.event === 'member:left')).toBe(false);
  });

  it('auto-transfers host to the earliest online member and persists it', async () => {
    const { runtime, store, events } = await makeRuntime();
    const hostSock = fakeSocket('s1');
    const guestSock = fakeSocket('s2');
    await runtime.join(hostSock, { nickname: 'Anna', clientId: hostCid, ip: '1.2.3.4' });
    const guestSnap = await runtime.join(guestSock, {
      nickname: 'Budi',
      clientId: guestCid,
      ip: '1.2.3.4',
    });
    const guestUserId = guestSnap.you.userId;

    runtime.leave(hostSock);
    await flush();

    expect(runtime.hostClientId).toBe(guestCid);
    const changed = events.find((e) => e.event === 'room:hostChanged');
    expect(changed?.args[0]).toEqual({ hostUserId: guestUserId, reason: 'auto' });

    const stored = await store.getByCode('ABC234');
    expect(stored?.hostClientId).toBe(guestCid);
  });

  it('empty room pauses a running timer and keeps the host', async () => {
    const { runtime, store, clock } = await makeRuntime({}, 500);
    const sock = fakeSocket('s1');
    await runtime.join(sock, { nickname: 'Anna', clientId: hostCid, ip: '1.2.3.4' });
    await runtime.timerAction(sock, 'start');
    expect(runtime.timer.status).toBe('running');

    runtime.disconnectSocket(sock);
    clock.advance(500);
    await flush();

    expect(runtime.memberCount()).toBe(0);
    expect(runtime.timer.status).toBe('paused');
    expect(runtime.hostClientId).toBe(hostCid);
    const stored = await store.getByCode('ABC234');
    expect(stored?.timer).toMatchObject({ status: 'paused', endsAt: null });
  });
});

describe('nickname de-duplication', () => {
  it('appends " (2)" to the later joiner', async () => {
    const { runtime } = await makeRuntime();
    await runtime.join(fakeSocket('s1'), { nickname: 'Anna', clientId: hostCid, ip: '1.2.3.4' });
    const snap = await runtime.join(fakeSocket('s2'), {
      nickname: 'Anna',
      clientId: guestCid,
      ip: '1.2.3.4',
    });
    const names = snap.members.map((m) => m.nickname).sort();
    expect(names).toEqual(['Anna', 'Anna (2)']);
  });

  it('truncates so the deduped nickname stays within 20 chars', async () => {
    const { runtime } = await makeRuntime();
    const longName = 'x'.repeat(20);
    await runtime.join(fakeSocket('s1'), { nickname: longName, clientId: hostCid, ip: '1.2.3.4' });
    const snap = await runtime.join(fakeSocket('s2'), {
      nickname: longName,
      clientId: guestCid,
      ip: '1.2.3.4',
    });
    const second = snap.members.find((m) => m.userId === snap.you.userId);
    expect(second?.nickname).toBe('x'.repeat(16) + ' (2)');
    expect(second?.nickname.length).toBeLessThanOrEqual(20);
  });
});

describe('timer permissions', () => {
  it('FORBIDDEN for non-host while timerControl is host', async () => {
    const { runtime } = await makeRuntime();
    await runtime.join(fakeSocket('s1'), { nickname: 'Anna', clientId: hostCid, ip: '1.2.3.4' });
    const guestSock = fakeSocket('s2');
    await runtime.join(guestSock, { nickname: 'Budi', clientId: guestCid, ip: '1.2.3.4' });
    await expect(runtime.timerAction(guestSock, 'start')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allowed for everyone when timerControl is everyone', async () => {
    const { runtime } = await makeRuntime({ timerControl: 'everyone' });
    await runtime.join(fakeSocket('s1'), { nickname: 'Anna', clientId: hostCid, ip: '1.2.3.4' });
    const guestSock = fakeSocket('s2');
    await runtime.join(guestSock, { nickname: 'Budi', clientId: guestCid, ip: '1.2.3.4' });
    const state = await runtime.timerAction(guestSock, 'start');
    expect(state.status).toBe('running');
  });
});

describe('moderators', () => {
  async function hostPlusGuest() {
    const ctx = await makeRuntime();
    const hostSock = fakeSocket('s1');
    const guestSock = fakeSocket('s2');
    await ctx.runtime.join(hostSock, { nickname: 'Anna', clientId: hostCid, ip: '1.2.3.4' });
    const guestSnap = await ctx.runtime.join(guestSock, {
      nickname: 'Budi',
      clientId: guestCid,
      ip: '1.2.3.4',
    });
    return { ...ctx, hostSock, guestSock, guestUserId: guestSnap.you.userId };
  }

  it('a moderator may control the timer, and losing the flag takes that away', async () => {
    const { runtime, guestSock, guestUserId, hostSock } = await hostPlusGuest();
    await expect(runtime.timerAction(guestSock, 'start')).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const promoted = await runtime.setModerator(hostSock, guestUserId, true);
    expect(promoted).toMatchObject({ isModerator: true, isHost: false });
    expect((await runtime.timerAction(guestSock, 'start')).status).toBe('running');

    await runtime.setModerator(hostSock, guestUserId, false);
    await expect(runtime.timerAction(guestSock, 'pause')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('broadcasts member:updated so everyone sees the new role', async () => {
    const { runtime, events, hostSock, guestUserId } = await hostPlusGuest();
    await runtime.setModerator(hostSock, guestUserId, true);
    const updates = events.filter((e) => e.event === 'member:updated');
    expect(updates.at(-1)?.args[0]).toMatchObject({ userId: guestUserId, isModerator: true });
  });

  it('only the host can appoint a moderator, and the host is never the target', async () => {
    const { runtime, guestSock, hostSock } = await hostPlusGuest();
    const hostUserId = (await runtime.snapshotFor(hostCid)).hostUserId;
    await expect(
      runtime.setModerator(guestSock, hostUserId, true),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      runtime.setModerator(hostSock, hostUserId, true),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(runtime.setModerator(hostSock, 'nope', true)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('a moderator still cannot change settings or hand over the host', async () => {
    const { runtime, guestSock, guestUserId, hostSock } = await hostPlusGuest();
    await runtime.setModerator(hostSock, guestUserId, true);
    await expect(
      runtime.updateSettings(guestSock, { focusMin: 2 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(runtime.transferHost(guestSock, guestUserId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('becoming host drops the moderator flag', async () => {
    const { runtime, events, guestUserId, hostSock } = await hostPlusGuest();
    await runtime.setModerator(hostSock, guestUserId, true);
    await runtime.transferHost(hostSock, guestUserId);
    const updates = events.filter((e) => e.event === 'member:updated');
    expect(updates.at(-1)?.args[0]).toMatchObject({
      userId: guestUserId,
      isHost: true,
      isModerator: false,
    });
  });

  it('an auto host transfer also drops the moderator flag', async () => {
    const { runtime, hostSock, guestUserId } = await hostPlusGuest();
    await runtime.setModerator(hostSock, guestUserId, true);
    runtime.leave(hostSock);
    await flush();
    expect(runtime.hostClientId).toBe(guestCid);
    const snap = await runtime.snapshotFor(guestCid);
    expect(snap.members.find((m) => m.userId === guestUserId)).toMatchObject({
      isHost: true,
      isModerator: false,
    });
  });
});
