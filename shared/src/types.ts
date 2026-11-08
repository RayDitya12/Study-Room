import type { z } from 'zod';
import type {
  ERROR_CODES,
  MEDIA_STATUSES,
  PHASES,
  ROLES,
  STATUSES,
  TIMER_CONTROLS,
  TIMER_STATUSES,
} from './constants';
import type { roomSettingsSchema } from './schemas';

export type RoomSettings = z.infer<typeof roomSettingsSchema>;

export type TimerPhase = (typeof PHASES)[number];
export type TimerStatus = (typeof TIMER_STATUSES)[number];
export type TimerControl = (typeof TIMER_CONTROLS)[number];
export type MemberStatus = (typeof STATUSES)[number];
export type Role = (typeof ROLES)[number];
export type MediaStatus = (typeof MEDIA_STATUSES)[number];
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface TimerState {
  phase: TimerPhase;
  status: TimerStatus;
  /** Full length of the current phase. */
  phaseDurationMs: number;
  /** Authoritative when status !== 'running'. */
  remainingMs: number;
  /** Server epoch ms; non-null ONLY when running. */
  endsAt: number | null;
  /** Focus sessions completed in the current set (0..cyclesBeforeLong-1). */
  completedFocus: number;
  /** Increments on every change. */
  version: number;
}

/**
 * What the room knows about one member's attention. Only counts ever leave the
 * client — which tab or app is open stays on their machine.
 */
export interface MemberFocus {
  /** The member opted in to focus tracking. */
  tracking: boolean;
  /** Currently away from the tab; only meaningful while `tracking`. */
  away: boolean;
  /** Server epoch ms of the ongoing away interval, else null. */
  awaySince: number | null;
  /** Away intervals started in the current focus session. */
  awayCount: number;
  /** Total away time of the COMPLETED intervals in the current focus session. */
  awayMs: number;
}

/**
 * Playback state as reported by the embed. `unstarted` and `buffering` mean the
 * player has no reliable position yet, so nothing may be corrected against them.
 */
export type MediaPlayerState = 'unstarted' | 'ended' | 'playing' | 'paused' | 'buffering' | 'cued';

/** Whether the client should re-seek to the server target. */
export type MediaCorrection = 'none' | 'seek';

export interface MediaState {
  /** Validated 11-character YouTube id, null when nothing is queued. */
  videoId: string | null;
  status: MediaStatus;
  /** Playback position that was valid at `anchorAt`. */
  anchorPositionMs: number;
  /** Server epoch ms. */
  anchorAt: number;
  loop: boolean;
  /** Public userId of whoever set the current video. */
  setBy: string | null;
  /** Increments on every change. */
  version: number;
}

/** One member's result for the focus phase that just ended. */
export interface FocusSessionSummary {
  userId: string;
  nickname: string;
  awayCount: number;
  awayMs: number;
  activeMs: number;
  /** 0..100, rounded. */
  focusPct: number;
}

export interface Member {
  /** PUBLIC id (never the clientId). */
  userId: string;
  nickname: string;
  status: MemberStatus;
  /** '' if none, max 80 chars. */
  task: string;
  isHost: boolean;
  /** Timer control without host rights; always false for the host itself. */
  isModerator: boolean;
  /** Derived from `isHost`/`isModerator` so clients can render one label. */
  role: Role;
  /** Chat blocked by the host. */
  isMuted: boolean;
  focus: MemberFocus;
  online: boolean;
  joinedAt: number;
}

export type BlockReason = 'kick' | 'ban';

/**
 * A member the host removed. They cannot join again while the block is active:
 * a kick expires on its own, a ban lasts until the host lifts it.
 */
export interface BlockedMember {
  userId: string;
  /** Nickname at the time of the removal, so the block list is readable. */
  nickname: string;
  reason: BlockReason;
  blockedAt: number;
  /** Server epoch ms for a kick, null for a ban. */
  expiresAt: number | null;
}

export interface ChatMessage {
  id: string;
  userId: string;
  nickname: string;
  text: string;
  createdAt: number;
}

export interface RoomSnapshot {
  code: string;
  name: string;
  hasPassword: boolean;
  settings: RoomSettings;
  you: { userId: string };
  hostUserId: string;
  members: Member[];
  timer: TimerState;
  media: MediaState;
  /** Up to last 100, oldest first. */
  messages: ChatMessage[];
  serverNow: number;
}

export type Ack<T> = { ok: true; data: T } | { ok: false; error: ErrorCode };
