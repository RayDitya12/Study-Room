import bcrypt from 'bcryptjs';
import {
  applySettings as applyTimerSettings,
  complete,
  KICK_COOLDOWN_MS,
  LIMITS,
  mediaMachine,
  parseYouTubeVideoId,
  pause as pauseTimer,
  reset as resetTimer,
  skip as skipTimer,
  start as startTimer,
  type BlockedMember,
  type BlockReason,
  type ChatMessage,
  type FocusEndReason,
  type FocusSessionSummary,
  type MediaChangeReason,
  type MediaState,
  type Member,
  type MemberFocus,
  type MemberStatus,
  type RoomSettings,
  type RoomSnapshot,
  type Role,
  type ServerToClientEvents,
  type TimerChangeReason,
  type TimerState,
} from '@studyroom/shared';
import {
  INITIAL_FOCUS,
  onDisconnect,
  onRoomActiveChange,
  resetSession,
  setAway,
  setTracking,
  summarize,
  type FocusTrackerState,
} from '../focus/focusTracker';
import type { Clock, TimeoutHandle } from '../lib/clock';
import { publicUserId } from '../lib/ids';
import { createFailureLimiter, createRateLimiter, type FailureLimiter, type RateLimiter } from '../lib/rateLimiter';
import { cleanText } from '../lib/sanitize';
import type { RoomStore, StoredRoom } from '../store/RoomStore';
import { AppError } from '../socket/handle';

export interface RuntimeEmitter {
  toRoom<E extends keyof ServerToClientEvents>(
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void;
  toRoomExcept<E extends keyof ServerToClientEvents>(
    socketId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void;
}

export const noopEmitter: RuntimeEmitter = { toRoom: () => {}, toRoomExcept: () => {} };

/** The subset of a socket.io Socket the runtime needs (keeps unit tests simple). */
export interface RuntimeSocket {
  id: string;
  data: { code?: string; clientId?: string; userId?: string; roomId?: string };
  join(name: string): void | Promise<void>;
}

interface MemberEntry {
  clientId: string;
  userId: string;
  nickname: string;
  status: MemberStatus;
  task: string;
  isModerator: boolean;
  isMuted: boolean;
  /** Attention accounting for this member; see `focus/focusTracker.ts`. */
  focus: FocusTrackerState;
  joinedAt: number;
  sockets: Set<string>;
  graceTimer?: TimeoutHandle;
}

export interface RoomRuntimeDeps {
  stored: StoredRoom;
  store: RoomStore;
  clock: Clock;
  emitter: RuntimeEmitter;
  presenceGraceMs: number;
  maxMembers: number;
}

export type TimerAction = 'start' | 'pause' | 'reset' | 'skip';

export type MediaAction = 'play' | 'pause' | 'clear';

/** The timer changes that close a focus session; a pause never does. */
function focusEndReason(reason: TimerChangeReason): FocusEndReason | null {
  return reason === 'complete' || reason === 'skip' || reason === 'reset' ? reason : null;
}

export class RoomRuntime {
  readonly roomId: string;
  readonly code: string;
  name: string;
  passwordHash: string | null;
  hostClientId: string;
  settings: RoomSettings;
  timer: TimerState;
  media: MediaState;

  private readonly members = new Map<string, MemberEntry>();
  /** Promoted clientIds, mirrored in the store so moderators survive a restart. */
  private readonly modClientIds = new Set<string>();
  /** Kept in memory as well as in the store, so joining needs no extra query. */
  private readonly blocks = new Map<
    string,
    { nickname: string; reason: BlockReason; blockedAt: number; expiresAt: number | null }
  >();
  private readonly store: RoomStore;
  private readonly clock: Clock;
  private readonly emitter: RuntimeEmitter;
  private readonly presenceGraceMs: number;
  private readonly maxMembers: number;
  private phaseTimeout?: TimeoutHandle;
  private lastActivity: number;

  // 5 chat messages per 5 seconds per clientId (token bucket, 1 token/sec refill).
  private readonly chatLimiter: RateLimiter;
  // 10 typing events per second per socket; extras are silently dropped.
  private readonly typingLimiter: RateLimiter;
  // 10 away reports per 10 seconds per socket; extras are silently dropped.
  private readonly focusLimiter: RateLimiter;
  // 6 media commands per 10 seconds per clientId: one person must not be able to
  // restart the room's video by holding down a key.
  private readonly mediaLimiter: RateLimiter;
  // 5 wrong-password failures per minute per IP+room.
  private readonly passwordFailures: FailureLimiter;

  constructor(deps: RoomRuntimeDeps) {
    const { stored, store, clock, emitter, presenceGraceMs, maxMembers } = deps;
    this.roomId = stored.id;
    this.code = stored.code;
    this.name = stored.name;
    this.passwordHash = stored.passwordHash;
    this.hostClientId = stored.hostClientId;
    this.settings = stored.settings;
    this.timer = stored.timer;
    // The playhead is never persisted, so a reloaded room offers its video from
    // the top, paused until a controller presses play.
    this.media = {
      ...mediaMachine.createInitialMedia(clock.now()),
      videoId: stored.mediaVideoId,
      loop: stored.mediaLoop,
      status: stored.mediaVideoId ? 'paused' : 'stopped',
    };
    this.modClientIds = new Set(stored.modClientIds);
    this.store = store;
    this.clock = clock;
    this.emitter = emitter;
    this.presenceGraceMs = presenceGraceMs;
    this.maxMembers = maxMembers;
    this.lastActivity = clock.now();
    this.chatLimiter = createRateLimiter({ capacity: 5, refillPerMs: 1 / 1_000, clock });
    this.typingLimiter = createRateLimiter({ capacity: 10, refillPerMs: 10 / 1_000, clock });
    this.focusLimiter = createRateLimiter({ capacity: 10, refillPerMs: 10 / 10_000, clock });
    this.mediaLimiter = createRateLimiter({ capacity: 6, refillPerMs: 6 / 10_000, clock });
    this.passwordFailures = createFailureLimiter(5, 60_000, clock);
  }

  get lastActivityAt(): number {
    return this.lastActivity;
  }

  memberCount(): number {
    return this.members.size;
  }

  private touch(): void {
    this.lastActivity = this.clock.now();
  }

  private persistTimer(): Promise<void> {
    this.touch();
    return this.store
      .saveRoomState(this.roomId, { timer: this.timer, lastActiveAt: this.clock.now() })
      .catch((err) => {
        console.error('[room] failed to persist timer:', err);
      });
  }

  // ---------- join / presence ----------

  async join(
    socket: RuntimeSocket,
    input: { nickname: string; clientId: string; password?: string; ip: string },
  ): Promise<RoomSnapshot> {
    const nickname = cleanText(input.nickname, LIMITS.NICKNAME_MAX);
    if (nickname.length < LIMITS.NICKNAME_MIN) throw new AppError('INVALID_INPUT');

    const userId = publicUserId(input.clientId, this.roomId);
    const block = this.activeBlock(userId);
    if (block) throw new AppError(block === 'ban' ? 'BANNED' : 'KICKED');

    const existing = this.members.get(input.clientId);
    if (!existing && this.passwordHash) {
      const failKey = `${input.ip}:${this.code}`;
      if (this.passwordFailures.isBlocked(failKey)) throw new AppError('RATE_LIMITED');
      if (!input.password) throw new AppError('PASSWORD_REQUIRED');
      const ok = await bcrypt.compare(input.password, this.passwordHash);
      if (!ok) {
        this.passwordFailures.recordFailure(failKey);
        throw new AppError('WRONG_PASSWORD');
      }
    }
    if (!existing && this.members.size >= this.maxMembers) throw new AppError('ROOM_FULL');

    let entry = existing;
    let isNewOrBack: boolean;
    if (entry) {
      isNewOrBack = entry.sockets.size === 0;
      if (entry.graceTimer !== undefined) {
        this.clock.clearTimeout(entry.graceTimer);
        entry.graceTimer = undefined;
      }
      entry.sockets.add(socket.id);
      entry.nickname = this.dedupeNickname(nickname, entry.clientId);
    } else {
      entry = {
        clientId: input.clientId,
        userId,
        nickname: this.dedupeNickname(nickname),
        status: 'focusing',
        task: '',
        isModerator: this.modClientIds.has(input.clientId),
        isMuted: false,
        focus: { ...INITIAL_FOCUS },
        joinedAt: this.clock.now(),
        sockets: new Set([socket.id]),
      };
      this.members.set(entry.clientId, entry);
      isNewOrBack = true;
    }

    socket.data.code = this.code;
    socket.data.clientId = entry.clientId;
    socket.data.userId = entry.userId;
    socket.data.roomId = this.roomId;
    await socket.join(`room:${this.code}`);

    if (isNewOrBack) {
      this.emitter.toRoomExcept(socket.id, 'member:joined', this.toMember(entry));
    }
    this.touch();
    return this.snapshotFor(input.clientId);
  }

  disconnectSocket(socket: RuntimeSocket): void {
    const clientId = socket.data.clientId;
    if (!clientId) return;
    const entry = this.members.get(clientId);
    if (!entry) return;
    entry.sockets.delete(socket.id);
    this.emitter.toRoom('chat:typing', { userId: entry.userId, isTyping: false });
    if (entry.sockets.size === 0) {
      // An open away interval ends with the socket; the client re-sends its
      // state when it comes back, so nothing is counted against them offline.
      entry.focus = onDisconnect(entry.focus, this.clock.now());
      this.emitter.toRoom('member:offline', { userId: entry.userId });
      entry.graceTimer = this.clock.setTimeout(() => {
        entry.graceTimer = undefined;
        void this.removeMember(clientId);
      }, this.presenceGraceMs);
    }
    this.touch();
  }

  leave(socket: RuntimeSocket): void {
    const clientId = socket.data.clientId;
    if (!clientId) return;
    void this.removeMember(clientId);
  }

  private async removeMember(clientId: string, blocked?: BlockReason): Promise<void> {
    const entry = this.members.get(clientId);
    if (!entry) return;
    if (entry.graceTimer !== undefined) this.clock.clearTimeout(entry.graceTimer);
    this.members.delete(clientId);
    // A removal the host ordered says who was thrown out rather than pretending
    // they left on their own, and it is the event the removed client acts on.
    if (blocked) this.emitter.toRoom('room:kicked', { userId: entry.userId, reason: blocked });
    else this.emitter.toRoom('member:left', { userId: entry.userId });

    if (clientId === this.hostClientId && this.members.size > 0) {
      // Auto-transfer to the online member who joined earliest.
      const candidates = [...this.members.values()]
        .filter((m) => m.sockets.size > 0)
        .sort((a, b) => a.joinedAt - b.joinedAt);
      const next = candidates[0];
      if (next) {
        // The host outranks a moderator, so promotion clears that flag for good.
        next.isModerator = false;
        this.modClientIds.delete(next.clientId);
        this.hostClientId = next.clientId;
        await this.store
          .saveRoomState(this.roomId, {
            hostClientId: next.clientId,
            modClientIds: [...this.modClientIds],
            lastActiveAt: this.clock.now(),
          })
          .catch((err) => console.error('[room] failed to persist host transfer:', err));
        this.emitter.toRoom('room:hostChanged', { hostUserId: next.userId, reason: 'auto' });
        this.emitter.toRoom('member:updated', { ...this.toMember(entry), isHost: false, online: false });
        this.emitter.toRoom('member:updated', this.toMember(next));
      }
    }

    if (this.members.size === 0) {
      if (this.timer.status === 'running') {
        // Empty room: pause so time doesn't silently expire while nobody watches.
        this.timer = pauseTimer(this.timer, this.clock.now());
        this.clearPhaseTimeout();
        await this.persistTimer();
      }
      // Music nobody can hear is only bandwidth. The status is not persisted, so
      // a reloaded room offers the same video paused anyway.
      this.media = mediaMachine.pause(this.media, this.clock.now());
    }
    this.touch();
  }

  private dedupeNickname(candidate: string, exceptClientId?: string): string {
    const taken = (name: string): boolean =>
      [...this.members.values()].some((m) => m.clientId !== exceptClientId && m.nickname === name);
    if (!taken(candidate)) return candidate;
    for (let n = 2; n <= 99; n++) {
      const suffix = ` (${n})`;
      const name = candidate.slice(0, LIMITS.NICKNAME_MAX - suffix.length) + suffix;
      if (!taken(name)) return name;
    }
    return candidate.slice(0, LIMITS.NICKNAME_MAX - 5) + ` (${Date.now() % 1_000})`;
  }

  // ---------- chat ----------

  async sendChat(socket: RuntimeSocket, rawText: string): Promise<ChatMessage> {
    const entry = this.requireMember(socket);
    if (entry.isMuted) throw new AppError('MUTED');
    const text = cleanText(rawText, LIMITS.MESSAGE_MAX, { keepNewlines: true });
    if (!text) throw new AppError('INVALID_INPUT');
    if (!this.chatLimiter.allow(entry.clientId)) throw new AppError('RATE_LIMITED');

    const stored = await this.store.addMessage({
      roomId: this.roomId,
      clientId: entry.clientId,
      nickname: entry.nickname,
      text,
      createdAt: this.clock.now(),
    });
    const message: ChatMessage = {
      id: stored.id,
      userId: entry.userId,
      nickname: entry.nickname,
      text: stored.text,
      createdAt: stored.createdAt,
    };
    this.emitter.toRoom('chat:message', message);
    this.touch();
    return message;
  }

  setTyping(socket: RuntimeSocket, isTyping: boolean): void {
    if (!this.typingLimiter.allow(socket.id)) return; // silently drop extras
    const entry = this.members.get(socket.data.clientId ?? '');
    if (!entry || entry.isMuted) return;
    this.emitter.toRoomExcept(socket.id, 'chat:typing', { userId: entry.userId, isTyping });
  }

  // ---------- member updates ----------

  updateMember(socket: RuntimeSocket, update: { status?: MemberStatus; task?: string }): Member {
    const entry = this.requireMember(socket);
    if (update.status !== undefined) entry.status = update.status;
    if (update.task !== undefined) entry.task = cleanText(update.task, LIMITS.TASK_MAX);
    const member = this.toMember(entry);
    this.emitter.toRoom('member:updated', member);
    this.touch();
    return member;
  }

  // ---------- focus tracking ----------

  /** Self only: opt in or out. The opt-in is never something the room can impose. */
  setFocusTracking(socket: RuntimeSocket, enabled: boolean): Member {
    const entry = this.requireMember(socket);
    entry.focus = setTracking(entry.focus, enabled, this.roomActive(), this.clock.now());
    this.touch();
    const member = this.toMember(entry);
    this.emitter.toRoom('member:updated', member);
    return member;
  }

  /**
   * Self only, and only while tracking: the tab went hidden or came back.
   * Over the rate limit the report is dropped rather than answered with an
   * error, because the client cannot do anything useful about it.
   */
  setFocusAway(socket: RuntimeSocket, away: boolean): void {
    const entry = this.requireMember(socket);
    if (!entry.focus.tracking) throw new AppError('FORBIDDEN');
    if (!this.focusLimiter.allow(socket.id)) return;
    const next = setAway(entry.focus, away, this.roomActive(), this.clock.now());
    if (next === entry.focus) return;
    entry.focus = next;
    this.touch();
    this.emitter.toRoom('member:updated', this.toMember(entry));
  }

  /** The one window focus tracking measures: a running Pomodoro focus phase. */
  private roomActive(): boolean {
    return this.timer.status === 'running' && this.timer.phase === 'focus';
  }

  /**
   * Every timer write comes through here so the tracked windows follow the
   * phase exactly. Returns how a focus session ended, which the caller reports
   * right after `timer:state`.
   */
  private syncFocus(before: TimerState, reason: TimerChangeReason): FocusEndReason | null {
    const wasActive = before.status === 'running' && before.phase === 'focus';
    const isActive = this.roomActive();
    const now = this.clock.now();
    if (wasActive !== isActive) {
      for (const entry of this.members.values()) {
        const next = onRoomActiveChange(entry.focus, wasActive, isActive, now);
        if (next === entry.focus) continue;
        entry.focus = next;
        this.emitter.toRoom('member:updated', this.toMember(entry));
      }
    }
    return before.phase === 'focus' ? focusEndReason(reason) : null;
  }

  /** Reports the session that just ended, then starts everyone's counters over. */
  private emitFocusSummary(endedBy: FocusEndReason): void {
    const summaries: FocusSessionSummary[] = [];
    for (const entry of this.members.values()) {
      if (entry.focus.tracking) {
        const sum = summarize(entry.focus);
        if (sum.activeMs > 0) {
          summaries.push({ userId: entry.userId, nickname: entry.nickname, ...sum });
        }
      }
      // Reset tracked and untracked alike: opting out keeps the counters until
      // the session ends, and they must not leak into the next one.
      entry.focus = resetSession(entry.focus);
    }
    if (summaries.length === 0) return;
    this.emitter.toRoom('focus:summary', { summaries, endedBy });
  }

  // ---------- timer ----------

  /** Host or moderator: the tier allowed to drive the shared timer and music. */
  canControl(clientId: string): boolean {
    if (clientId === this.hostClientId) return true;
    return this.members.get(clientId)?.isModerator === true;
  }

  canControlTimer(clientId: string): boolean {
    if (this.settings.timerControl === 'everyone') return true;
    return this.canControl(clientId);
  }

  async timerAction(socket: RuntimeSocket, action: TimerAction): Promise<TimerState> {
    const entry = this.requireMember(socket);
    if (!this.canControlTimer(entry.clientId)) throw new AppError('FORBIDDEN');

    const now = this.clock.now();
    const before = this.timer;
    switch (action) {
      case 'start':
        this.timer = startTimer(before, now);
        break;
      case 'pause':
        this.timer = pauseTimer(before, now);
        break;
      case 'reset':
        this.timer = resetTimer(before, this.settings);
        break;
      case 'skip':
        this.timer = skipTimer(before, this.settings, now);
        break;
    }

    if (this.timer !== before) {
      const endedBy = this.syncFocus(before, action);
      await this.persistTimer();
      this.emitter.toRoom('timer:state', { timer: this.timer, reason: action, by: entry.userId });
      if (endedBy) this.emitFocusSummary(endedBy);
    }
    this.syncScheduling();
    return this.timer;
  }

  async updateSettings(socket: RuntimeSocket, patch: Partial<RoomSettings>): Promise<RoomSettings> {
    const entry = this.requireHost(socket);

    this.settings = { ...this.settings, ...patch };
    const beforeTimer = this.timer;
    this.timer = applyTimerSettings(this.timer, this.settings);
    // A settings change never ends a session, but it can stop the phase, so the
    // tracked windows still have to follow it.
    this.syncFocus(beforeTimer, 'settings');
    this.touch();
    await this.store
      .saveRoomState(this.roomId, {
        settings: this.settings,
        timer: this.timer,
        lastActiveAt: this.clock.now(),
      })
      .catch((err) => console.error('[room] failed to persist settings:', err));

    this.emitter.toRoom('room:settingsUpdated', this.settings);
    this.emitter.toRoom('timer:state', { timer: this.timer, reason: 'settings', by: entry.userId });
    this.syncScheduling();
    return this.settings;
  }

  async transferHost(socket: RuntimeSocket, targetUserId: string): Promise<void> {
    const entry = this.requireHost(socket);
    const target = this.findPromotable(targetUserId);

    // The host outranks a moderator, so the promoted member drops that flag.
    target.isModerator = false;
    this.modClientIds.delete(target.clientId);
    this.hostClientId = target.clientId;
    await this.store
      .saveRoomState(this.roomId, {
        hostClientId: target.clientId,
        modClientIds: [...this.modClientIds],
        lastActiveAt: this.clock.now(),
      })
      .catch((err) => console.error('[room] failed to persist host transfer:', err));
    this.emitter.toRoom('room:hostChanged', { hostUserId: target.userId, reason: 'transfer' });
    this.emitter.toRoom('member:updated', this.toMember(entry));
    this.emitter.toRoom('member:updated', this.toMember(target));
    this.touch();
  }

  /** Host-only: grant or revoke timer control without handing over the room. */
  async setModerator(
    socket: RuntimeSocket,
    targetUserId: string,
    isModerator: boolean,
  ): Promise<Member> {
    this.requireHost(socket);
    const target = this.findPromotable(targetUserId);

    target.isModerator = isModerator;
    if (isModerator) this.modClientIds.add(target.clientId);
    else this.modClientIds.delete(target.clientId);
    await this.store
      .saveRoomState(this.roomId, {
        modClientIds: [...this.modClientIds],
        lastActiveAt: this.clock.now(),
      })
      .catch((err) => console.error('[room] failed to persist moderators:', err));
    this.touch();
    const member = this.toMember(target);
    this.emitter.toRoom('member:updated', member);
    return member;
  }

  /** Host-only: take away chat without removing the member from the room. */
  setMuted(socket: RuntimeSocket, targetUserId: string, isMuted: boolean): Member {
    this.requireHost(socket);
    const target = this.findTarget(targetUserId);

    target.isMuted = isMuted;
    this.touch();
    const member = this.toMember(target);
    this.emitter.toRoom('member:updated', member);
    return member;
  }

  /** Host-only: remove the member; they may join again after the cooldown. */
  async kick(socket: RuntimeSocket, targetUserId: string): Promise<void> {
    this.requireHost(socket);
    await this.blockTarget(targetUserId, 'kick');
  }

  /** Host-only: remove the member until the host lifts the block. */
  async ban(socket: RuntimeSocket, targetUserId: string): Promise<void> {
    this.requireHost(socket);
    await this.blockTarget(targetUserId, 'ban');
  }

  /** Host-only: lift a kick or ban early. */
  async unban(socket: RuntimeSocket, targetUserId: string): Promise<void> {
    this.requireHost(socket);
    if (!this.blocks.delete(targetUserId)) throw new AppError('INVALID_INPUT');
    await this.store
      .removeBlock(this.roomId, targetUserId)
      .catch((err) => console.error('[room] failed to lift block:', err));
    this.touch();
  }

  /** Host-only: who is currently kept out, and until when. */
  listBlocks(socket: RuntimeSocket): BlockedMember[] {
    this.requireHost(socket);
    const now = this.clock.now();
    return [...this.blocks.entries()]
      .filter(([, block]) => block.expiresAt === null || block.expiresAt > now)
      .map(([userId, block]) => ({ userId, ...block }));
  }

  // ---------- media ----------

  /**
   * The room's one shared video, exactly like the room's one shared timer: the
   * server owns the state, positions come from its clock, and only a controller
   * may change it.
   */
  async setMedia(socket: RuntimeSocket, url: string): Promise<MediaState> {
    const entry = this.requireMediaControl(socket);
    const videoId = parseYouTubeVideoId(url);
    // Only the parsed id is ever stored or broadcast, never the submitted text.
    if (!videoId) throw new AppError('INVALID_MEDIA_URL');
    const now = this.clock.now();
    return this.commitMedia(mediaMachine.setVideo(this.media, videoId, entry.userId, now), 'set', entry.userId);
  }

  async mediaAction(socket: RuntimeSocket, action: MediaAction): Promise<MediaState> {
    const entry = this.requireMediaControl(socket);
    if (action !== 'clear' && this.media.videoId === null) throw new AppError('NO_MEDIA');
    const now = this.clock.now();
    const next =
      action === 'play'
        ? mediaMachine.play(this.media, now)
        : action === 'pause'
          ? mediaMachine.pause(this.media, now)
          : mediaMachine.clear(this.media);
    return this.commitMedia(next, action, entry.userId);
  }

  async seekMedia(socket: RuntimeSocket, positionMs: number): Promise<MediaState> {
    const entry = this.requireMediaControl(socket);
    if (this.media.videoId === null) throw new AppError('NO_MEDIA');
    return this.commitMedia(
      mediaMachine.seek(this.media, positionMs, this.clock.now()),
      'seek',
      entry.userId,
    );
  }

  async setMediaLoop(socket: RuntimeSocket, loop: boolean): Promise<MediaState> {
    const entry = this.requireMediaControl(socket);
    return this.commitMedia(mediaMachine.setLoop(this.media, loop), 'loop', entry.userId);
  }

  /** Controller plus rate limit: the same tier that drives the timer owns the music. */
  private requireMediaControl(socket: RuntimeSocket): MemberEntry {
    const entry = this.requireMember(socket);
    if (!this.canControl(entry.clientId)) throw new AppError('FORBIDDEN');
    if (!this.mediaLimiter.allow(entry.clientId)) throw new AppError('RATE_LIMITED');
    return entry;
  }

  /**
   * Commits a machine-produced media state. Unchanged state is neither stored
   * nor broadcast, so a redundant click cannot bump anyone's version counter.
   */
  private async commitMedia(
    next: MediaState,
    reason: MediaChangeReason,
    by: string,
  ): Promise<MediaState> {
    const before = this.media;
    if (next === before) return before;
    this.media = next;
    this.touch();
    // The playhead is deliberately never persisted; only the video and the loop
    // choice outlive a restart.
    if (next.videoId !== before.videoId || next.loop !== before.loop) {
      await this.store
        .saveRoomState(this.roomId, {
          mediaVideoId: next.videoId,
          mediaLoop: next.loop,
          lastActiveAt: this.clock.now(),
        })
        .catch((err) => console.error('[room] failed to persist media:', err));
    }
    this.emitter.toRoom('media:state', { media: next, reason, by });
    return next;
  }

  private async blockTarget(targetUserId: string, reason: BlockReason): Promise<void> {
    const target = this.findTarget(targetUserId);
    const now = this.clock.now();
    const expiresAt = reason === 'kick' ? now + KICK_COOLDOWN_MS : null;
    // Write the block first: the removal hands the client a fresh chance to join.
    this.blocks.set(target.userId, {
      nickname: target.nickname,
      reason,
      blockedAt: now,
      expiresAt,
    });
    await this.store
      .addBlock({
        roomId: this.roomId,
        userId: target.userId,
        nickname: target.nickname,
        reason,
        blockedAt: now,
        expiresAt,
      })
      .catch((err) => console.error('[room] failed to persist block:', err));
    await this.removeMember(target.clientId, reason);
  }

  private activeBlock(userId: string): BlockReason | undefined {
    const block = this.blocks.get(userId);
    if (!block) return undefined;
    if (block.expiresAt !== null && block.expiresAt <= this.clock.now()) {
      this.blocks.delete(userId);
      void this.store
        .removeBlock(this.roomId, userId)
        .catch((err) => console.error('[room] failed to prune kick:', err));
      return undefined;
    }
    return block.reason;
  }

  /** A member who is actually in the room and not the host. */
  private findPromotable(targetUserId: string): MemberEntry {
    const target = [...this.members.values()].find(
      (m) => m.userId === targetUserId && m.sockets.size > 0,
    );
    if (!target || target.clientId === this.hostClientId) throw new AppError('INVALID_INPUT');
    return target;
  }

  /** Any member still on the roster, including one inside the grace period. */
  private findTarget(targetUserId: string): MemberEntry {
    const target = [...this.members.values()].find((m) => m.userId === targetUserId);
    if (!target || target.clientId === this.hostClientId) throw new AppError('INVALID_INPUT');
    return target;
  }

  private requireHost(socket: RuntimeSocket): MemberEntry {
    const entry = this.requireMember(socket);
    if (entry.clientId !== this.hostClientId) throw new AppError('FORBIDDEN');
    return entry;
  }

  /** Phase-end scheduling: re-arm whenever the timer is running, clear otherwise. */
  private syncScheduling(): void {
    this.clearPhaseTimeout();
    if (this.timer.status === 'running' && this.timer.endsAt !== null) {
      const delay = Math.max(0, this.timer.endsAt - this.clock.now());
      this.phaseTimeout = this.clock.setTimeout(() => {
        void this.onPhaseEnd().catch((err) => console.error('[room] phase end failed:', err));
      }, delay);
    }
  }

  private clearPhaseTimeout(): void {
    if (this.phaseTimeout !== undefined) {
      this.clock.clearTimeout(this.phaseTimeout);
      this.phaseTimeout = undefined;
    }
  }

  private async onPhaseEnd(): Promise<void> {
    if (this.timer.status !== 'running' || this.timer.endsAt === null) return;
    const now = this.clock.now();
    // Timer fired slightly early (clock jitter): re-schedule for the remainder.
    if (now < this.timer.endsAt - 5) {
      this.syncScheduling();
      return;
    }
    const before = this.timer;
    this.timer = complete(before, this.settings, now);
    const endedBy = this.syncFocus(before, 'complete');
    await this.persistTimer();
    this.emitter.toRoom('timer:state', { timer: this.timer, reason: 'complete' });
    if (endedBy) this.emitFocusSummary(endedBy);
    this.syncScheduling();
  }

  /** Boot recovery: a persisted running timer may already be past its deadline. */
  async resumeFromStored(): Promise<void> {
    const blocks = await this.store
      .listBlocks(this.roomId)
      .catch((err) => {
        console.error('[room] failed to load blocks:', err);
        return [];
      });
    for (const block of blocks) {
      this.blocks.set(block.userId, {
        nickname: block.nickname,
        reason: block.reason,
        blockedAt: block.blockedAt,
        expiresAt: block.expiresAt,
      });
    }

    if (this.timer.status === 'running' && this.timer.endsAt !== null) {
      if (this.timer.endsAt <= this.clock.now()) {
        this.timer = complete(this.timer, this.settings, this.clock.now());
        await this.persistTimer();
      }
      this.syncScheduling();
    }
  }

  dispose(): void {
    this.clearPhaseTimeout();
    for (const entry of this.members.values()) {
      if (entry.graceTimer !== undefined) this.clock.clearTimeout(entry.graceTimer);
    }
  }

  // ---------- snapshots ----------

  async snapshotFor(clientId: string): Promise<RoomSnapshot> {
    const you = this.members.get(clientId);
    if (!you) throw new AppError('NOT_IN_ROOM');
    const stored = await this.store.getRecentMessages(this.roomId, LIMITS.HISTORY_SIZE);
    return {
      code: this.code,
      name: this.name,
      hasPassword: this.passwordHash !== null,
      settings: this.settings,
      you: { userId: you.userId },
      hostUserId: publicUserId(this.hostClientId, this.roomId),
      members: [...this.members.values()].map((m) => this.toMember(m)),
      timer: this.timer,
      media: this.media,
      messages: stored.map((m) => ({
        id: m.id,
        userId: publicUserId(m.clientId, this.roomId),
        nickname: m.nickname,
        text: m.text,
        createdAt: m.createdAt,
      })),
      serverNow: this.clock.now(),
    };
  }

  private roleOf(entry: MemberEntry): Role {
    if (entry.clientId === this.hostClientId) return 'host';
    return entry.isModerator ? 'mod' : 'member';
  }

  private focusOf(entry: MemberEntry): MemberFocus {
    const { tracking, away, awaySince, awayCount, awayMs } = entry.focus;
    return { tracking, away, awaySince, awayCount, awayMs };
  }

  private toMember(entry: MemberEntry): Member {
    return {
      userId: entry.userId,
      nickname: entry.nickname,
      status: entry.status,
      task: entry.task,
      isHost: entry.clientId === this.hostClientId,
      isModerator: entry.isModerator,
      role: this.roleOf(entry),
      isMuted: entry.isMuted,
      focus: this.focusOf(entry),
      online: entry.sockets.size > 0,
      joinedAt: entry.joinedAt,
    };
  }

  private requireMember(socket: RuntimeSocket): MemberEntry {
    const clientId = socket.data.clientId;
    const entry = clientId ? this.members.get(clientId) : undefined;
    if (!entry || socket.data.code !== this.code) throw new AppError('NOT_IN_ROOM');
    return entry;
  }
}
