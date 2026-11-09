import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type {
  BlockedMember,
  ChatMessage,
  EmptyPayload,
  FocusSummaryEvent,
  MediaState,
  MediaStateEvent,
  Member,
  RoomSettings,
  RoomSnapshot,
  TimerState,
} from '@studyroom/shared';
import type { TimerStateEvent } from '@studyroom/shared';
import { LIMITS } from '@studyroom/shared';
import {
  collectEvents,
  emitAck,
  joinRoom,
  nextEvent,
  sleep,
  startTestServer,
  type TestClient,
  type TestServer,
} from './testServer';

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer({ presenceGraceMs: 200 });
});

afterAll(async () => {
  await server.stop();
});

const cid = (): string => randomUUID();

const tracked: TestClient[] = [];
afterEach(() => {
  while (tracked.length > 0) {
    tracked.pop()?.disconnect();
  }
});

async function client(): Promise<TestClient> {
  const c = await server.connectClient();
  tracked.push(c);
  return c;
}

describe('1. join + presence', () => {
  it('A and B see each other; B snapshot has A as host', async () => {
    const hostCid = cid();
    const guestCid = cid();
    const code = await server.createRoom({ name: 'Presence room', clientId: hostCid });

    const a = await client();
    const b = await client();
    const snapA = await joinRoom(a, { code, nickname: 'Anna', clientId: hostCid });
    expect(snapA.members).toHaveLength(1);
    expect(snapA.members[0]?.isHost).toBe(true);

    const joinedOnA = nextEvent<Member>(a, 'member:joined');
    const snapB = await joinRoom(b, { code, nickname: 'Budi', clientId: guestCid });

    const memberB = await joinedOnA;
    expect(memberB.nickname).toBe('Budi');
    expect(memberB.userId).toBe(snapB.you.userId);
    expect(memberB.online).toBe(true);

    expect(snapB.members).toHaveLength(2);
    const aInB = snapB.members.find((m) => m.userId === snapB.hostUserId);
    expect(aInB?.nickname).toBe('Anna');
    expect(aInB?.isHost).toBe(true);
    expect(snapB.hostUserId).toBe(snapA.you.userId);
  });

  it('same clientId in two tabs is ONE member', async () => {
    const hostCid = cid();
    const code = await server.createRoom({ name: 'Tabs', clientId: hostCid });
    const a1 = await client();
    const a2 = await client();
    await joinRoom(a1, { code, nickname: 'Anna', clientId: hostCid });
    const snap = await joinRoom(a2, { code, nickname: 'Anna', clientId: hostCid });
    expect(snap.members).toHaveLength(1);
  });

  it('duplicate nicknames get " (2)" suffixes', async () => {
    const code = await server.createRoom({ name: 'Dupes', clientId: cid() });
    const a = await client();
    const b = await client();
    await joinRoom(a, { code, nickname: 'Anna', clientId: cid() });
    const snapB = await joinRoom(b, { code, nickname: 'Anna', clientId: cid() });
    expect(snapB.members.find((m) => m.userId === snapB.you.userId)?.nickname).toBe('Anna (2)');
  });
});

describe('2. chat', () => {
  it('broadcasts to sender and others, persists history', async () => {
    const code = await server.createRoom({ name: 'Chat room', clientId: cid() });
    const a = await client();
    const b = await client();
    await joinRoom(a, { code, nickname: 'Anna', clientId: cid() });
    const snapB = await joinRoom(b, { code, nickname: 'Budi', clientId: cid() });

    const onA = nextEvent<ChatMessage>(a, 'chat:message');
    const onB = nextEvent<ChatMessage>(b, 'chat:message');
    const ack = await emitAck<ChatMessage>(b, 'chat:send', { text: '  hello world  ' });
    expect(ack.ok).toBe(true);

    const msgA = await onA;
    const msgB = await onB;
    expect(msgA.text).toBe('hello world');
    expect(msgA.userId).toBe(snapB.you.userId);
    expect(msgB).toEqual(msgA);
    if (!ack.ok) throw new Error('unreachable');
    expect(ack.data.id).toBe(msgA.id);

    // A fresh joiner sees the message in the snapshot history.
    const c = await client();
    const snapC = await joinRoom(c, { code, nickname: 'Cici', clientId: cid() });
    expect(snapC.messages.map((m) => m.text)).toContain('hello world');
  });

  it('typing indicator goes to everyone except the sender', async () => {
    const code = await server.createRoom({ name: 'Typing room', clientId: cid() });
    const a = await client();
    const b = await client();
    await joinRoom(a, { code, nickname: 'Anna', clientId: cid() });
    const snapB = await joinRoom(b, { code, nickname: 'Budi', clientId: cid() });

    const onA = nextEvent<{ userId: string; isTyping: boolean }>(a, 'chat:typing');
    const onB = collectEvents<{ userId: string; isTyping: boolean }>(b, 'chat:typing');

    const ack = await emitAck<Record<string, never>>(b, 'chat:typing', { isTyping: true });
    expect(ack.ok).toBe(true);
    const typing = await onA;
    expect(typing.userId).toBe(snapB.you.userId);
    expect(typing.isTyping).toBe(true);

    await sleep(100);
    expect(onB.events).toHaveLength(0); // never echoed back to the sender
    onB.stop();
  });
});

describe('3. room access errors', () => {
  it('PASSWORD_REQUIRED / WRONG_PASSWORD / correct password', async () => {
    const code = await server.createRoom({ name: 'Locked room', clientId: cid(), password: 'open1234' });
    const c = await client();

    const noPw = await emitAck<RoomSnapshot>(c, 'room:join', { code, nickname: 'Anna', clientId: cid() });
    expect(noPw).toEqual({ ok: false, error: 'PASSWORD_REQUIRED' });

    const wrong = await emitAck<RoomSnapshot>(c, 'room:join', {
      code,
      nickname: 'Anna',
      clientId: cid(),
      password: 'wrongpass',
    });
    expect(wrong).toEqual({ ok: false, error: 'WRONG_PASSWORD' });

    const right = await emitAck<RoomSnapshot>(c, 'room:join', {
      code,
      nickname: 'Anna',
      clientId: cid(),
      password: 'open1234',
    });
    expect(right.ok).toBe(true);
  });

  it('ROOM_NOT_FOUND for unknown codes', async () => {
    const c = await client();
    const ack = await emitAck<RoomSnapshot>(c, 'room:join', {
      code: 'ZZZZZZ',
      nickname: 'Anna',
      clientId: cid(),
    });
    expect(ack).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
  });

  it('NOT_IN_ROOM for actions before joining', async () => {
    const c = await client();
    const ack = await emitAck<ChatMessage>(c, 'chat:send', { text: 'hi' });
    expect(ack).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
  });
});

describe('4. timer permissions + sync', () => {
  it('non-host is forbidden, host start syncs endsAt, everyone-control unlocks B', async () => {
    const hostCid = cid();
    const guestCid = cid();
    const code = await server.createRoom({ name: 'Timer room', clientId: hostCid });
    const a = await client();
    const b = await client();
    await joinRoom(a, { code, nickname: 'Anna', clientId: hostCid });
    await joinRoom(b, { code, nickname: 'Budi', clientId: guestCid });

    // timerControl defaults to 'host': B may not start
    const forbidden = await emitAck<TimerState>(b, 'timer:start', {});
    expect(forbidden).toEqual({ ok: false, error: 'FORBIDDEN' });

    // Host starts: both receive timer:state with an identical endsAt
    const stateOnA = nextEvent<TimerStateEvent>(a, 'timer:state');
    const stateOnB = nextEvent<TimerStateEvent>(b, 'timer:state');
    const startAck = await emitAck<TimerState>(a, 'timer:start', {});
    expect(startAck.ok).toBe(true);
    const evA = await stateOnA;
    const evB = await stateOnB;
    expect(evA.reason).toBe('start');
    expect(evA.timer.status).toBe('running');
    expect(evA.timer.endsAt).not.toBeNull();
    expect(evB.timer.endsAt).toBe(evA.timer.endsAt);
    expect(evB.timer.version).toBe(evA.timer.version);

    // Host opens control to everyone; B can now pause
    const settingsUpdated = nextEvent<RoomSettings>(b, 'room:settingsUpdated');
    const settingsAck = await emitAck<RoomSettings>(a, 'room:updateSettings', {
      timerControl: 'everyone',
    });
    expect(settingsAck.ok).toBe(true);
    if (!settingsAck.ok) return;
    expect(settingsAck.data.timerControl).toBe('everyone');
    expect((await settingsUpdated).timerControl).toBe('everyone');

    const pauseAck = await emitAck<TimerState>(b, 'timer:pause', {});
    expect(pauseAck.ok).toBe(true);
    if (!pauseAck.ok) return;
    expect(pauseAck.data.status).toBe('paused');
  });

  it('rejects settings patches from non-hosts and invalid values', async () => {
    const code = await server.createRoom({ name: 'Settings room', clientId: cid() });
    const a = await client();
    const b = await client();
    await joinRoom(a, { code, nickname: 'Anna', clientId: cid() });
    await joinRoom(b, { code, nickname: 'Budi', clientId: cid() });

    const forbidden = await emitAck<RoomSettings>(b, 'room:updateSettings', { focusMin: 50 });
    expect(forbidden).toEqual({ ok: false, error: 'FORBIDDEN' });

    const invalid = await emitAck<RoomSettings>(a, 'room:updateSettings', { focusMin: 999 });
    expect(invalid).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });
});

describe('5. disconnect / grace / reconnect', () => {
  it('offline on drop, no left within grace, left after grace', async () => {
    const hostCid = cid();
    const guestCid = cid();
    const code = await server.createRoom({ name: 'Grace room', clientId: hostCid });
    const a = await client();
    const b = await client();
    await joinRoom(a, { code, nickname: 'Anna', clientId: hostCid });
    const snapB = await joinRoom(b, { code, nickname: 'Budi', clientId: guestCid });

    const leftEvents = collectEvents<{ userId: string }>(a, 'member:left');

    // B drops -> A sees offline
    const offline = nextEvent<{ userId: string }>(a, 'member:offline');
    b.disconnect();
    expect((await offline).userId).toBe(snapB.you.userId);

    // B rejoins with the same clientId within the grace window
    const b2 = await client();
    await sleep(50);
    await joinRoom(b2, { code, nickname: 'Budi', clientId: guestCid });
    await sleep(250); // longer than grace: a pending removal WOULD have fired
    expect(leftEvents.events).toHaveLength(0);

    // B drops again and stays away -> A sees left after the grace period
    const left = nextEvent<{ userId: string }>(a, 'member:left', 3_000);
    b2.disconnect();
    expect((await left).userId).toBe(snapB.you.userId);
    leftEvents.stop();
  });
});

describe('6. host transfer', () => {
  it('host leaving explicitly promotes the earliest online member', async () => {
    const hostCid = cid();
    const guestCid = cid();
    const code = await server.createRoom({ name: 'Transfer room', clientId: hostCid });
    const a = await client();
    const b = await client();
    const snapA = await joinRoom(a, { code, nickname: 'Anna', clientId: hostCid });
    const snapB = await joinRoom(b, { code, nickname: 'Budi', clientId: guestCid });

    const left = nextEvent<{ userId: string }>(b, 'member:left');
    const changed = nextEvent<{ hostUserId: string; reason: string }>(b, 'room:hostChanged');

    const ack = await emitAck<Record<string, never>>(a, 'room:leave', {});
    expect(ack.ok).toBe(true);

    expect((await left).userId).toBe(snapA.you.userId);
    const event = await changed;
    expect(event.reason).toBe('auto');
    expect(event.hostUserId).toBe(snapB.you.userId);
  });
});

describe('6b. moderators', () => {
  it('the host appoints a moderator who may then drive the timer', async () => {
    const hostCid = cid();
    const guestCid = cid();
    const code = await server.createRoom({ name: 'Mod room', clientId: hostCid });
    const a = await client();
    const b = await client();
    await joinRoom(a, { code, nickname: 'Anna', clientId: hostCid });
    const snapB = await joinRoom(b, { code, nickname: 'Budi', clientId: guestCid });

    expect((await emitAck<TimerState>(b, 'timer:start', {}))).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });

    const updatedOnB = nextEvent<Member>(b, 'member:updated');
    const ack = await emitAck<Member>(a, 'member:setModerator', {
      targetUserId: snapB.you.userId,
      isModerator: true,
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.data).toMatchObject({ userId: snapB.you.userId, isModerator: true, isHost: false });
    expect(await updatedOnB).toMatchObject({ isModerator: true });

    expect((await emitAck<TimerState>(b, 'timer:start', {})).ok).toBe(true);
    // Timer control only: settings stay host-only.
    expect(await emitAck<RoomSettings>(b, 'room:updateSettings', { focusMin: 30 })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });

  it('rejects setModerator from a non-host and bad payloads', async () => {
    const hostCid = cid();
    const code = await server.createRoom({ name: 'Mod guard', clientId: hostCid });
    const a = await client();
    const b = await client();
    const snapA = await joinRoom(a, { code, nickname: 'Anna', clientId: hostCid });
    await joinRoom(b, { code, nickname: 'Budi', clientId: cid() });

    expect(
      await emitAck<Member>(b, 'member:setModerator', {
        targetUserId: snapA.you.userId,
        isModerator: true,
      }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });

    expect(
      await emitAck<Member>(a, 'member:setModerator', {
        targetUserId: snapA.you.userId,
        isModerator: true,
      }),
    ).toEqual({ ok: false, error: 'INVALID_INPUT' });

    expect(await emitAck<Member>(a, 'member:setModerator', { targetUserId: 'x' })).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    });
  });
});

describe('6c. mute, kick and ban', () => {
  it('a muted member loses chat but keeps everything else', async () => {
    const hostCid = cid();
    const guestCid = cid();
    const code = await server.createRoom({ name: 'Mute room', clientId: hostCid });
    const a = await client();
    const b = await client();
    await joinRoom(a, { code, nickname: 'Anna', clientId: hostCid });
    const snapB = await joinRoom(b, { code, nickname: 'Budi', clientId: guestCid });

    const updatedOnB = nextEvent<Member>(b, 'member:updated');
    expect(
      (await emitAck<Member>(a, 'member:setMuted', { targetUserId: snapB.you.userId, isMuted: true }))
        .ok,
    ).toBe(true);
    expect(await updatedOnB).toMatchObject({ isMuted: true });

    expect(await emitAck<ChatMessage>(b, 'chat:send', { text: 'can I still talk?' })).toEqual({
      ok: false,
      error: 'MUTED',
    });
    // Typing is dropped without a broadcast, so the other side stays quiet.
    const typing = collectEvents<{ userId: string; isTyping: boolean }>(a, 'chat:typing');
    await emitAck<Record<string, never>>(b, 'chat:typing', { isTyping: true });
    await sleep(50);
    expect(typing.events).toEqual([]);
    typing.stop();

    // A muted member still controls the timer if they were a moderator.
    expect((await emitAck<ChatMessage>(a, 'chat:send', { text: 'host is fine' })).ok).toBe(true);
    expect(
      (await emitAck<Member>(a, 'member:setMuted', { targetUserId: snapB.you.userId, isMuted: false }))
        .ok,
    ).toBe(true);
    expect((await emitAck<ChatMessage>(b, 'chat:send', { text: 'back again' })).ok).toBe(true);
  });

  it('a kick removes the member, blocks the door, and can be lifted', async () => {
    const hostCid = cid();
    const guestCid = cid();
    const code = await server.createRoom({ name: 'Kick room', clientId: hostCid });
    const a = await client();
    const b = await client();
    await joinRoom(a, { code, nickname: 'Anna', clientId: hostCid });
    const snapB = await joinRoom(b, { code, nickname: 'Budi', clientId: guestCid });

    const onHost = nextEvent<{ userId: string; reason: string }>(a, 'room:kicked');
    const onGuest = nextEvent<{ userId: string; reason: string }>(b, 'room:kicked');
    expect((await emitAck<Record<string, never>>(a, 'member:kick', { targetUserId: snapB.you.userId })).ok).toBe(
      true,
    );
    expect(await onHost).toEqual({ userId: snapB.you.userId, reason: 'kick' });
    expect(await onGuest).toEqual({ userId: snapB.you.userId, reason: 'kick' });

    const c = await client();
    expect(
      await emitAck<RoomSnapshot>(c, 'room:join', { code, nickname: 'Budi', clientId: guestCid }),
    ).toEqual({ ok: false, error: 'KICKED' });

    const blocks = await emitAck<BlockedMember[]>(a, 'room:getBlocks', {});
    expect(blocks.ok).toBe(true);
    if (!blocks.ok) return;
    expect(blocks.data).toHaveLength(1);
    expect(blocks.data[0]).toMatchObject({
      userId: snapB.you.userId,
      nickname: 'Budi',
      reason: 'kick',
      expiresAt: expect.any(Number),
    });

    expect((await emitAck<Record<string, never>>(a, 'member:unban', { targetUserId: snapB.you.userId })).ok).toBe(
      true,
    );
    expect((await emitAck<RoomSnapshot>(c, 'room:join', { code, nickname: 'Budi', clientId: guestCid })).ok).toBe(
      true,
    );
  });

  it('a ban keeps working people out, and only the host may hand one out', async () => {
    const hostCid = cid();
    const guestCid = cid();
    const code = await server.createRoom({ name: 'Ban room', clientId: hostCid });
    const a = await client();
    const b = await client();
    const snapA = await joinRoom(a, { code, nickname: 'Anna', clientId: hostCid });
    const snapB = await joinRoom(b, { code, nickname: 'Budi', clientId: guestCid });

    expect(
      await emitAck<Record<string, never>>(b, 'member:ban', { targetUserId: snapA.you.userId }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });
    // A guest cannot ban the host, so it cannot clear the seat for itself.
    expect(
      await emitAck<Record<string, never>>(b, 'member:kick', { targetUserId: snapA.you.userId }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' });

    expect((await emitAck<Record<string, never>>(a, 'member:ban', { targetUserId: snapB.you.userId })).ok).toBe(
      true,
    );
    const c = await client();
    expect(
      await emitAck<RoomSnapshot>(c, 'room:join', { code, nickname: 'Budi', clientId: guestCid }),
    ).toEqual({ ok: false, error: 'BANNED' });

    expect(await emitAck<Record<string, never>>(a, 'member:kick', {})).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    });
    expect(await emitAck<Record<string, never>>(a, 'member:kick', { targetUserId: '' })).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    });
  });
});

describe('7. chat validation + rate limit', () => {
  it('rejects messages over 500 chars', async () => {
    const code = await server.createRoom({ name: 'Limits room', clientId: cid() });
    const a = await client();
    await joinRoom(a, { code, nickname: 'Anna', clientId: cid() });
    const ack = await emitAck<ChatMessage>(a, 'chat:send', { text: 'x'.repeat(LIMITS.MESSAGE_MAX + 1) });
    expect(ack).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('rate limits message spam', async () => {
    const code = await server.createRoom({ name: 'Spam room', clientId: cid() });
    const a = await client();
    await joinRoom(a, { code, nickname: 'Anna', clientId: cid() });
    const results: string[] = [];
    for (let i = 0; i < 7; i++) {
      const ack = await emitAck<ChatMessage>(a, 'chat:send', { text: `message ${i}` });
      results.push(ack.ok ? 'ok' : ack.error);
    }
    expect(results.slice(0, 5)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect(results[5]).toBe('RATE_LIMITED');
    expect(results[6]).toBe('RATE_LIMITED');
  });
});

describe('8. time:sync', () => {
  it('echoes clientSentAt and returns a plausible serverNow', async () => {
    const c = await client();
    const sent = Date.now();
    const ack = await emitAck<{ clientSentAt: number; serverNow: number }>(c, 'time:sync', {
      clientSentAt: sent,
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.data.clientSentAt).toBe(sent);
    expect(Math.abs(ack.data.serverNow - Date.now())).toBeLessThan(5_000);
  });
});

describe('9. shared music', () => {
  it('the host chooses the video, everyone hears the same state, members do not', async () => {
    const hostCid = cid();
    const code = await server.createRoom({ name: 'Music room', clientId: hostCid });
    const a = await client();
    const b = await client();
    await joinRoom(a, { code, nickname: 'Anna', clientId: hostCid });
    const snapB = await joinRoom(b, { code, nickname: 'Budi', clientId: cid() });

    expect(await emitAck<MediaState>(b, 'media:set', { url: 'https://youtu.be/dQw4w9WgXcQ' })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await emitAck<MediaState>(b, 'media:pause', {})).toEqual({ ok: false, error: 'FORBIDDEN' });

    const onA = nextEvent<MediaStateEvent>(a, 'media:state');
    const onB = nextEvent<MediaStateEvent>(b, 'media:state');
    const ack = await emitAck<MediaState>(a, 'media:set', {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s',
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    // The submitted text is gone; only the parsed id is ever shared.
    expect(ack.data).toMatchObject({ videoId: 'dQw4w9WgXcQ', status: 'playing', version: 1 });

    const eventA = await onA;
    expect(await onB).toEqual(eventA);
    expect(eventA.media).toEqual(ack.data);
    expect(eventA.reason).toBe('set');
    expect(eventA.by).toBe(snapB.hostUserId);

    // A moderator owns the music the same way they own the timer.
    const c = await client();
    const snapC = await joinRoom(c, { code, nickname: 'Cici', clientId: cid() });
    expect(
      (
        await emitAck<Member>(a, 'member:setModerator', {
          targetUserId: snapC.you.userId,
          isModerator: true,
        })
      ).ok,
    ).toBe(true);
    const seeked = await emitAck<MediaState>(c, 'media:seek', { positionMs: 42_000 });
    expect(seeked.ok).toBe(true);
    if (!seeked.ok) return;
    expect(seeked.data).toMatchObject({ anchorPositionMs: 42_000, status: 'playing', version: 2 });

    // A late joiner is told what is already playing.
    const d = await client();
    const snapD = await joinRoom(d, { code, nickname: 'Dewi', clientId: cid() });
    expect(snapD.media).toMatchObject({ videoId: 'dQw4w9WgXcQ', status: 'playing', version: 2 });
  });

  it('refuses a link that is not a YouTube video, and music that is not there', async () => {
    const hostCid = cid();
    const code = await server.createRoom({ name: 'Bad links', clientId: hostCid });
    const a = await client();
    await joinRoom(a, { code, nickname: 'Anna', clientId: hostCid });

    expect(await emitAck<MediaState>(a, 'media:set', { url: 'https://evil.example/x' })).toEqual({
      ok: false,
      error: 'INVALID_MEDIA_URL',
    });
    expect(await emitAck<MediaState>(a, 'media:set', { url: 'https://youtu.be/short' })).toEqual({
      ok: false,
      error: 'INVALID_MEDIA_URL',
    });
    expect(await emitAck<MediaState>(a, 'media:play', {})).toEqual({ ok: false, error: 'NO_MEDIA' });
    expect(await emitAck<MediaState>(a, 'media:seek', { positionMs: 1_000 })).toEqual({
      ok: false,
      error: 'NO_MEDIA',
    });
    expect(await emitAck<MediaState>(a, 'media:seek', { positionMs: -5 })).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    });
    // Payloads are strict, so an extra field is never quietly ignored.
    expect(
      await emitAck<MediaState>(a, 'media:set', {
        url: 'https://youtu.be/dQw4w9WgXcQ',
        html: '<script></script>',
      } as never),
    ).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('limits how fast one member may drive the music', async () => {
    const hostCid = cid();
    const code = await server.createRoom({ name: 'Fast music', clientId: hostCid });
    const a = await client();
    await joinRoom(a, { code, nickname: 'Anna', clientId: hostCid });
    expect((await emitAck<MediaState>(a, 'media:set', { url: 'dQw4w9WgXcQ' })).ok).toBe(true);

    // Sent at once, so the bucket cannot refill between commands. The bucket
    // holds six, and media:set already spent one of them.
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        emitAck<MediaState>(a, 'media:setLoop', { loop: i % 2 === 0 }),
      ),
    );
    const outcomes = results.map((r) => (r.ok ? 'ok' : r.error));
    expect(outcomes.filter((o) => o === 'ok')).toHaveLength(5);
    expect(outcomes.filter((o) => o === 'RATE_LIMITED')).toHaveLength(3);
    expect(outcomes[7]).toBe('RATE_LIMITED');
  });
});

describe('10. focus tracking', () => {
  it('counts away intervals for the room and summarises the session', async () => {
    const hostCid = cid();
    const guestCid = cid();
    const code = await server.createRoom({ name: 'Focus room', clientId: hostCid });
    const a = await client();
    const b = await client();
    await joinRoom(a, { code, nickname: 'Anna', clientId: hostCid });
    const snapB = await joinRoom(b, { code, nickname: 'Budi', clientId: guestCid });

    expect((await emitAck<Member>(a, 'focus:setTracking', { enabled: true })).ok).toBe(true);
    expect((await emitAck<Member>(b, 'focus:setTracking', { enabled: true })).ok).toBe(true);
    expect((await emitAck<TimerState>(a, 'timer:start', {})).ok).toBe(true);

    const awaySeen = nextEvent<Member>(a, 'member:updated');
    expect((await emitAck<EmptyPayload>(b, 'focus:state', { away: true })).ok).toBe(true);
    expect(await awaySeen).toMatchObject({
      userId: snapB.you.userId,
      focus: { tracking: true, away: true, awayCount: 1, awaySince: expect.any(Number) },
    });

    await sleep(300);
    const backSeen = nextEvent<Member>(a, 'member:updated');
    expect((await emitAck<EmptyPayload>(b, 'focus:state', { away: false })).ok).toBe(true);
    const back = await backSeen;
    expect(back.focus).toMatchObject({ away: false, awayCount: 1, awaySince: null });
    expect(back.focus.awayMs).toBeGreaterThanOrEqual(200);

    const summary = nextEvent<FocusSummaryEvent>(a, 'focus:summary');
    expect((await emitAck<TimerState>(a, 'timer:skip', {})).ok).toBe(true);
    const event = await summary;
    expect(event.endedBy).toBe('skip');
    const reported = event.summaries.find((s) => s.userId === snapB.you.userId);
    expect(reported).toMatchObject({ nickname: 'Budi', awayCount: 1 });
    expect(reported?.focusPct).toBeGreaterThanOrEqual(0);
    expect(reported?.focusPct).toBeLessThanOrEqual(100);

    // The summary is not a log: the next session starts from zero for everyone.
    const reset = await emitAck<Member>(b, 'focus:setTracking', { enabled: true });
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    expect(reset.data.focus).toMatchObject({ tracking: true, away: false, awayCount: 0, awayMs: 0 });
  });

  it('away reports need opt-in, and opt-in is always your own', async () => {
    const hostCid = cid();
    const code = await server.createRoom({ name: 'Quiet focus', clientId: hostCid });
    const a = await client();
    const b = await client();
    const snapA = await joinRoom(a, { code, nickname: 'Anna', clientId: hostCid });
    await joinRoom(b, { code, nickname: 'Budi', clientId: cid() });

    expect(await emitAck<EmptyPayload>(b, 'focus:state', { away: true })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    // There is no target field to send: the payload cannot name anybody else.
    expect(
      await emitAck<Member>(a, 'focus:setTracking', { userId: 'someone', enabled: true } as never),
    ).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(snapA.members[0]?.focus).toMatchObject({ tracking: false, away: false, awayCount: 0 });
  });
});
