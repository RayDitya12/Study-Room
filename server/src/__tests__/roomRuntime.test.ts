import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { KICK_COOLDOWN_MS, mediaMachine } from '@studyroom/shared';
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
  strictFocus: false,
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

  it('reports every member through a single role field', async () => {
    const { runtime, hostSock, guestUserId } = await hostPlusGuest();
    const otherCid = randomUUID();
    await runtime.join(fakeSocket('s3'), { nickname: 'Cathy', clientId: otherCid, ip: '1.2.3.4' });
    await runtime.setModerator(hostSock, guestUserId, true);
    const snap = await runtime.snapshotFor(otherCid);
    const roleOf = new Map(snap.members.map((m) => [m.userId, m.role]));
    expect(roleOf.get(snap.hostUserId)).toBe('host');
    expect(roleOf.get(guestUserId)).toBe('mod');
    expect(roleOf.get(snap.you.userId)).toBe('member');
  });

  it('a moderator keeps timer control after the room is reloaded from the store', async () => {
    const { runtime, store, clock, hostSock, guestUserId } = await hostPlusGuest();
    await runtime.setModerator(hostSock, guestUserId, true);
    await flush();
    const stored = await store.getByCode('ABC234');
    if (!stored) throw new Error('room disappeared');
    expect(stored.modClientIds).toEqual([guestCid]);

    const reloaded = new RoomRuntime({
      stored,
      store,
      clock,
      emitter: createRecordingEmitter().emitter,
      presenceGraceMs: 1_000,
      maxMembers: 30,
    });
    const sock = fakeSocket('s9');
    await reloaded.join(sock, { nickname: 'Budi', clientId: guestCid, ip: '1.2.3.4' });
    const snap = await reloaded.snapshotFor(guestCid);
    expect(snap.members.find((m) => m.userId === guestUserId)?.role).toBe('mod');
    expect((await reloaded.timerAction(sock, 'start')).status).toBe('running');
  });
});

describe('media state carried by the room', () => {
  it('a fresh room has no video and is stopped', async () => {
    const { runtime } = await makeRuntime();
    await runtime.join(fakeSocket('s1'), { nickname: 'Anna', clientId: hostCid, ip: '1.2.3.4' });
    const snap = await runtime.snapshotFor(hostCid);
    expect(snap.media).toMatchObject({ videoId: null, status: 'stopped', anchorPositionMs: 0 });
  });

  it('a stored video comes back paused at the top, never playing', async () => {
    const ctx = await makeRuntime();
    await ctx.store.saveRoomState(ctx.runtime.roomId, {
      mediaVideoId: 'dQw4w9WgXcQ',
      mediaLoop: true,
    });
    const stored = await ctx.store.getByCode('ABC234');
    if (!stored) throw new Error('room disappeared');
    const reloaded = new RoomRuntime({
      stored,
      store: ctx.store,
      clock: ctx.clock,
      emitter: createRecordingEmitter().emitter,
      presenceGraceMs: 1_000,
      maxMembers: 30,
    });
    expect(reloaded.media).toMatchObject({
      videoId: 'dQw4w9WgXcQ',
      status: 'paused',
      loop: true,
      anchorPositionMs: 0,
    });
  });

  async function hostWithMusic() {
    const ctx = await makeRuntime();
    const hostSock = fakeSocket('s1');
    const hostSnap = await ctx.runtime.join(hostSock, {
      nickname: 'Anna',
      clientId: hostCid,
      ip: '1.2.3.4',
    });
    const media = await ctx.runtime.setMedia(hostSock, 'https://youtu.be/dQw4w9WgXcQ');
    return { ...ctx, hostSock, hostUserId: hostSnap.you.userId, media };
  }

  it('the host can add a video, and only the parsed id is kept', async () => {
    const { runtime, media, hostUserId, events } = await hostWithMusic();
    expect(media).toMatchObject({
      videoId: 'dQw4w9WgXcQ',
      status: 'playing',
      anchorPositionMs: 0,
      setBy: hostUserId,
      version: 1,
    });
    expect(events.find((e) => e.event === 'media:state')?.args[0]).toMatchObject({
      media,
      reason: 'set',
      by: hostUserId,
    });

    const snap = await runtime.snapshotFor(hostCid);
    expect(snap.media).toEqual(media);
  });

  it('a link that is not an embeddable YouTube video is refused', async () => {
    const { runtime, hostSock } = await hostWithMusic();
    for (const url of [
      'https://vimeo.com/12345',
      'https://youtube.com/playlist?list=PL1234567890',
      'javascript:alert(1)',
      'dQw4w9WgXc',
    ]) {
      await expect(runtime.setMedia(hostSock, url)).rejects.toMatchObject({
        code: 'INVALID_MEDIA_URL',
      });
    }
  });

  it('only a controller may change the music, and a moderator is one', async () => {
    const { runtime, hostSock } = await hostWithMusic();
    const guestSock = fakeSocket('s2');
    const guestSnap = await runtime.join(guestSock, {
      nickname: 'Budi',
      clientId: guestCid,
      ip: '1.2.3.4',
    });

    await expect(runtime.setMedia(guestSock, 'https://youtu.be/oHg5SJYRHA0')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(runtime.mediaAction(guestSock, 'pause')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(runtime.seekMedia(guestSock, 30_000)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    runtime.setModerator(hostSock, guestSnap.you.userId, true);
    const paused = await runtime.mediaAction(guestSock, 'pause');
    expect(paused).toMatchObject({ status: 'paused', version: 2 });
    // A pause freezes the playhead wherever the server clock left it.
    expect(paused.anchorPositionMs).toBe(0);
    expect((await runtime.mediaAction(guestSock, 'play')).status).toBe('playing');
    expect((await runtime.setMediaLoop(guestSock, true)).loop).toBe(true);
  });

  it('a position is measured by the server clock, not reported by a client', async () => {
    const { runtime, clock, hostSock } = await hostWithMusic();
    clock.advance(40_000);
    const paused = await runtime.mediaAction(hostSock, 'pause');
    expect(paused.anchorPositionMs).toBe(40_000);
    clock.advance(10_000);
    // Paused is paused: the wall clock keeps moving, the playhead does not.
    expect(mediaMachine.positionAt(paused, clock.now())).toBe(40_000);

    const resumed = await runtime.mediaAction(hostSock, 'play');
    expect(resumed.anchorPositionMs).toBe(40_000);
    expect(mediaMachine.positionAt(resumed, clock.now())).toBe(40_000);

    const seeked = await runtime.seekMedia(hostSock, 5_000);
    expect(seeked.anchorPositionMs).toBe(5_000);
    expect(seeked.status).toBe('playing');
  });

  it('commands without a video in the room are refused', async () => {
    const { runtime } = await makeRuntime();
    const sock = fakeSocket('s1');
    await runtime.join(sock, { nickname: 'Anna', clientId: hostCid, ip: '1.2.3.4' });
    await expect(runtime.mediaAction(sock, 'play')).rejects.toMatchObject({ code: 'NO_MEDIA' });
    await expect(runtime.mediaAction(sock, 'pause')).rejects.toMatchObject({ code: 'NO_MEDIA' });
    await expect(runtime.seekMedia(sock, 1_000)).rejects.toMatchObject({ code: 'NO_MEDIA' });
    // Clearing nothing is a no-op rather than an error.
    expect(await runtime.mediaAction(sock, 'clear')).toMatchObject({ status: 'stopped' });
  });

  it('a redundant command changes nothing and tells nobody', async () => {
    const { runtime, hostSock, events } = await hostWithMusic();
    await runtime.mediaAction(hostSock, 'play');
    const mark = events.length;
    // Already playing: the machine returns the same state, so no event.
    expect(await runtime.mediaAction(hostSock, 'play')).toMatchObject({ version: 1 });
    expect(events.slice(mark)).toHaveLength(0);

    const cleared = await runtime.mediaAction(hostSock, 'clear');
    expect(cleared).toMatchObject({ videoId: null, status: 'stopped', version: 2 });
    await runtime.mediaAction(hostSock, 'clear');
    expect(events.slice(mark).filter((e) => e.event === 'media:state')).toHaveLength(1);
  });

  it('music stops when the last person leaves', async () => {
    const { runtime, clock } = await makeRuntime({}, 500);
    const sock = fakeSocket('s1');
    await runtime.join(sock, { nickname: 'Anna', clientId: hostCid, ip: '1.2.3.4' });
    await runtime.setMedia(sock, 'https://youtu.be/dQw4w9WgXcQ');
    expect(runtime.media.status).toBe('playing');

    runtime.disconnectSocket(sock);
    clock.advance(500);
    await flush();
    expect(runtime.media).toMatchObject({ status: 'paused', videoId: 'dQw4w9WgXcQ' });
  });

  it('media commands are rate limited per member, not per socket', async () => {
    const { runtime, clock, hostSock } = await hostWithMusic();
    // setMedia already spent one of the six.
    for (let i = 0; i < 5; i += 1) {
      await runtime.setMediaLoop(hostSock, i % 2 === 0);
    }
    await expect(runtime.setMediaLoop(hostSock, true)).rejects.toMatchObject({ code: 'RATE_LIMITED' });

    clock.advance(10_000);
    expect((await runtime.setMediaLoop(hostSock, true)).loop).toBe(true);
  });

  it('the video and the loop choice are remembered, the playhead is not', async () => {
    const ctx = await makeRuntime();
    const sock = fakeSocket('s1');
    await ctx.runtime.join(sock, { nickname: 'Anna', clientId: hostCid, ip: '1.2.3.4' });
    await ctx.runtime.setMedia(sock, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s');
    ctx.clock.advance(20_000);
    await ctx.runtime.seekMedia(sock, 90_000);
    await ctx.runtime.setMediaLoop(sock, true);
    await flush();

    const stored = await ctx.store.getByCode('ABC234');
    expect(stored).toMatchObject({ mediaVideoId: 'dQw4w9WgXcQ', mediaLoop: true });
    if (!stored) throw new Error('room disappeared');

    const reloaded = new RoomRuntime({
      stored,
      store: ctx.store,
      clock: ctx.clock,
      emitter: createRecordingEmitter().emitter,
      presenceGraceMs: 1_000,
      maxMembers: 30,
    });
    expect(reloaded.media).toMatchObject({
      videoId: 'dQw4w9WgXcQ',
      status: 'paused',
      loop: true,
      anchorPositionMs: 0,
      setBy: null,
    });
  });
});

describe('mute, kick and ban', () => {
  async function hostPlusGuest(graceMs = 1_000) {
    const ctx = await makeRuntime({}, graceMs);
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

  it('a muted member cannot send or appear to type', async () => {
    const { runtime, hostSock, guestSock, guestUserId } = await hostPlusGuest();
    expect(runtime.setMuted(hostSock, guestUserId, true)).toMatchObject({ isMuted: true });

    await expect(runtime.sendChat(guestSock, 'hello')).rejects.toMatchObject({ code: 'MUTED' });
    runtime.setTyping(guestSock, true);
    const snap = await runtime.snapshotFor(hostCid);
    expect(snap.members.find((m) => m.userId === guestUserId)?.online).toBe(true);

    await expect(runtime.sendChat(hostSock, 'still fine')).resolves.toMatchObject({ text: 'still fine' });
    runtime.setMuted(hostSock, guestUserId, false);
    await expect(runtime.sendChat(guestSock, 'hello again')).resolves.toBeDefined();
  });

  it('a kick removes the member at once and keeps them out for the cooldown', async () => {
    const { runtime, clock, events, hostSock, guestSock, guestUserId } = await hostPlusGuest();
    await runtime.kick(hostSock, guestUserId);
    await flush();

    expect(events.find((e) => e.event === 'room:kicked')).toMatchObject({
      event: 'room:kicked',
      args: [{ userId: guestUserId, reason: 'kick' }],
    });
    expect((await runtime.snapshotFor(hostCid)).members.map((m) => m.userId)).toEqual([
      (await runtime.snapshotFor(hostCid)).hostUserId,
    ]);
    await expect(
      runtime.join(fakeSocket('s3'), { nickname: 'Budi', clientId: guestCid, ip: '1.2.3.4' }),
    ).rejects.toMatchObject({ code: 'KICKED' });

    clock.advance(KICK_COOLDOWN_MS);
    await expect(
      runtime.join(fakeSocket('s4'), { nickname: 'Budi', clientId: guestCid, ip: '1.2.3.4' }),
    ).resolves.toBeDefined();
  });

  it('a ban lasts until the host lifts it, and the list explains who is out', async () => {
    const { runtime, clock, hostSock, guestSock, guestUserId } = await hostPlusGuest();
    await runtime.ban(hostSock, guestUserId);
    await flush();

    clock.advance(KICK_COOLDOWN_MS * 10);
    await expect(
      runtime.join(fakeSocket('s5'), { nickname: 'Budi', clientId: guestCid, ip: '1.2.3.4' }),
    ).rejects.toMatchObject({ code: 'BANNED' });

    expect(runtime.listBlocks(hostSock)).toEqual([
      { userId: guestUserId, nickname: 'Budi', reason: 'ban', blockedAt: expect.any(Number), expiresAt: null },
    ]);

    await runtime.unban(hostSock, guestUserId);
    expect(runtime.listBlocks(hostSock)).toEqual([]);
    await expect(
      runtime.join(fakeSocket('s6'), { nickname: 'Budi', clientId: guestCid, ip: '1.2.3.4' }),
    ).resolves.toBeDefined();
  });

  it('blocks survive a reload because they live in the store', async () => {
    const { runtime, store, hostSock, guestUserId } = await hostPlusGuest();
    await runtime.ban(hostSock, guestUserId);
    await flush();

    const blocks = await store.listBlocks(runtime.roomId);
    expect(blocks).toEqual([
      { userId: guestUserId, nickname: 'Budi', reason: 'ban', blockedAt: expect.any(Number), expiresAt: null },
    ]);
  });

  it('only the host may moderate, and never the host themselves', async () => {
    const { runtime, hostSock, guestSock } = await hostPlusGuest();
    const hostUserId = (await runtime.snapshotFor(hostCid)).hostUserId;
    expect(() => runtime.setMuted(guestSock, hostUserId, true)).toThrow('FORBIDDEN');
    await expect(runtime.kick(guestSock, hostUserId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(runtime.ban(guestSock, hostUserId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(() => runtime.listBlocks(guestSock)).toThrow('FORBIDDEN');

    expect(() => runtime.setMuted(hostSock, hostUserId, true)).toThrow('INVALID_INPUT');
    await expect(runtime.kick(hostSock, hostUserId)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(runtime.ban(hostSock, 'nope')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(runtime.unban(hostSock, 'nope')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('a guest can be kicked while it is only reconnecting', async () => {
    const { runtime, hostSock, guestSock, guestUserId } = await hostPlusGuest(60_000);
    runtime.disconnectSocket(guestSock);
    await flush();
    expect(
      (await runtime.snapshotFor(hostCid)).members.find((m) => m.userId === guestUserId)?.online,
    ).toBe(false);
    await expect(runtime.kick(hostSock, guestUserId)).resolves.toBeUndefined();
  });

  it('a mute dies with the member entry, so a rejoin starts clean', async () => {
    const { runtime, clock, hostSock, guestSock, guestUserId } = await hostPlusGuest(500);
    runtime.setMuted(hostSock, guestUserId, true);
    runtime.disconnectSocket(guestSock);
    clock.advance(600);
    await flush();
    const rejoined = await runtime.join(fakeSocket('s7'), {
      nickname: 'Budi',
      clientId: guestCid,
      ip: '1.2.3.4',
    });
    expect(rejoined.members.find((m) => m.userId === guestUserId)?.isMuted).toBe(false);
  });
});

describe('focus tracking', () => {
  async function hostPlusTrackedGuest() {
    const ctx = await makeRuntime();
    const hostSock = fakeSocket('s1');
    const guestSock = fakeSocket('s2');
    const hostSnap = await ctx.runtime.join(hostSock, {
      nickname: 'Anna',
      clientId: hostCid,
      ip: '1.2.3.4',
    });
    const guestSnap = await ctx.runtime.join(guestSock, {
      nickname: 'Budi',
      clientId: guestCid,
      ip: '1.2.3.4',
    });
    ctx.runtime.setFocusTracking(guestSock, true);
    return {
      ...ctx,
      hostSock,
      guestSock,
      hostUserId: hostSnap.you.userId,
      guestUserId: guestSnap.you.userId,
    };
  }

  /** The member:updated events recorded after `mark`, for one member. */
  function updatesFor(events: RecordedEvent[], mark: number, userId: string): unknown[] {
    return events
      .slice(mark)
      .filter((e) => e.event === 'member:updated')
      .map((e) => e.args[0])
      .filter((m) => (m as { userId: string }).userId === userId);
  }

  const focusOf = async (runtime: RoomRuntime, userId: string) => {
    const snap = await runtime.snapshotFor(hostCid);
    const member = snap.members.find((m) => m.userId === userId);
    if (!member) throw new Error('member disappeared');
    return member.focus;
  };

  it('starts every member untracked, and opting in only touches yourself', async () => {
    const { runtime, guestSock, guestUserId } = await hostPlusTrackedGuest();
    const hostUserId = (await runtime.snapshotFor(hostCid)).hostUserId;

    expect(await focusOf(runtime, guestUserId)).toMatchObject({ tracking: true, away: false });
    expect(await focusOf(runtime, hostUserId)).toMatchObject({
      tracking: false,
      away: false,
      awayCount: 0,
      awayMs: 0,
      awaySince: null,
    });

    // Nothing in this API can opt another member in or out: the call only ever
    // touches the caller's own entry.
    runtime.setFocusTracking(guestSock, false);
    expect((await focusOf(runtime, guestUserId)).tracking).toBe(false);
    expect((await focusOf(runtime, hostUserId)).tracking).toBe(false);
  });

  it('rejects an away report from a member who never opted in', async () => {
    const { runtime, hostSock } = await hostPlusTrackedGuest();
    expect(() => runtime.setFocusAway(hostSock, true)).toThrow('FORBIDDEN');
  });

  it('counts each away interval and tells the room as it happens', async () => {
    const { runtime, clock, events, hostSock, guestSock, guestUserId } = await hostPlusTrackedGuest();
    await runtime.timerAction(hostSock, 'start');

    const mark = events.length;
    runtime.setFocusAway(guestSock, true);
    clock.advance(5_000);
    runtime.setFocusAway(guestSock, false);

    const mine = updatesFor(events, mark, guestUserId);
    expect(mine).toHaveLength(2);
    expect(mine[0]).toMatchObject({
      focus: { tracking: true, away: true, awayCount: 1, awaySince: expect.any(Number) },
    });
    expect(await focusOf(runtime, guestUserId)).toMatchObject({
      away: false,
      awaySince: null,
      awayCount: 1,
      awayMs: 5_000,
    });
  });

  it('ignores away reports while the room is paused, and charges no time for them', async () => {
    const { runtime, clock, events, hostSock, guestSock, guestUserId } = await hostPlusTrackedGuest();
    await runtime.timerAction(hostSock, 'start');
    clock.advance(10_000);
    await runtime.timerAction(hostSock, 'pause');

    const mark = events.length;
    runtime.setFocusAway(guestSock, true);
    clock.advance(3_000);
    runtime.setFocusAway(guestSock, false);
    expect(updatesFor(events, mark, guestUserId)).toHaveLength(2);

    await runtime.timerAction(hostSock, 'start');
    clock.advance(10_000);
    await runtime.timerAction(hostSock, 'skip');

    expect(await focusOf(runtime, guestUserId)).toMatchObject({
      away: false,
      awayCount: 0,
      awayMs: 0,
    });
    const summary = events.find((e) => e.event === 'focus:summary');
    expect(summary?.args[0]).toMatchObject({
      endedBy: 'skip',
      summaries: [{ userId: guestUserId, activeMs: 20_000, awayMs: 0, awayCount: 0, focusPct: 100 }],
    });
  });

  it('a finished focus phase reports the session once, then restarts the counters', async () => {
    const { runtime, clock, events, hostSock, guestSock, guestUserId } = await hostPlusTrackedGuest();
    await runtime.timerAction(hostSock, 'start');
    clock.advance(30_000);
    runtime.setFocusAway(guestSock, true);
    clock.advance(20_000);
    runtime.setFocusAway(guestSock, false);
    clock.advance(10_000);
    await flush();

    const summaries = events.filter((e) => e.event === 'focus:summary');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.args[0]).toEqual({
      endedBy: 'complete',
      summaries: [
        { userId: guestUserId, nickname: 'Budi', awayCount: 1, awayMs: 20_000, activeMs: 60_000, focusPct: 67 },
      ],
    });
    expect(await focusOf(runtime, guestUserId)).toMatchObject({
      tracking: true,
      awayCount: 0,
      awayMs: 0,
    });
  });

  it('a pause or a settings change never ends the session', async () => {
    const { runtime, clock, events, hostSock } = await hostPlusTrackedGuest();
    await runtime.timerAction(hostSock, 'start');
    clock.advance(20_000);
    await runtime.timerAction(hostSock, 'pause');
    clock.advance(5_000);
    await runtime.timerAction(hostSock, 'start');
    await runtime.updateSettings(hostSock, { breakMin: 2 });

    expect(events.filter((e) => e.event === 'focus:summary')).toHaveLength(0);
  });

  it('reports over the rate limit are dropped instead of rejected', async () => {
    const { runtime, clock, events, hostSock, guestSock, guestUserId } = await hostPlusTrackedGuest();
    await runtime.timerAction(hostSock, 'start');

    const mark = events.length;
    for (let i = 0; i < 12; i += 1) runtime.setFocusAway(guestSock, i % 2 === 0);
    expect(updatesFor(events, mark, guestUserId)).toHaveLength(10);

    clock.advance(5_000);
    runtime.setFocusAway(guestSock, true);
    expect(updatesFor(events, mark, guestUserId)).toHaveLength(11);
    expect(await focusOf(runtime, guestUserId)).toMatchObject({ away: true, awayCount: 6 });
  });

  it('stays quiet when nobody tracked, or when no time was measured', async () => {
    const { runtime, clock, events } = await makeRuntime();
    const sock = fakeSocket('s1');
    await runtime.join(sock, { nickname: 'Anna', clientId: hostCid, ip: '1.2.3.4' });

    await runtime.timerAction(sock, 'start');
    clock.advance(60_000);
    await flush();
    expect(events.filter((e) => e.event === 'focus:summary')).toHaveLength(0);

    // Opting in mid-break measures nothing yet, and a break is not a session.
    runtime.setFocusTracking(sock, true);
    await runtime.timerAction(sock, 'skip');
    expect(events.filter((e) => e.event === 'focus:summary')).toHaveLength(0);

    clock.advance(1_000);
    await runtime.timerAction(sock, 'start');
    clock.advance(1_000);
    await runtime.timerAction(sock, 'reset');
    expect(events.filter((e) => e.event === 'focus:summary')).toHaveLength(1);
  });

  it('a disconnect stops the away clock but keeps the counted time', async () => {
    const { runtime, clock, hostSock, guestSock, guestUserId } = await hostPlusTrackedGuest();
    await runtime.timerAction(hostSock, 'start');
    runtime.setFocusAway(guestSock, true);
    clock.advance(7_000);

    runtime.disconnectSocket(guestSock);
    expect(await focusOf(runtime, guestUserId)).toMatchObject({
      tracking: true,
      awayMs: 7_000,
      awaySince: null,
    });
  });
});
