import type { z } from 'zod';
import type { ERROR_CODES, PHASES, STATUSES, TIMER_CONTROLS, TIMER_STATUSES } from './constants';
import type { roomSettingsSchema } from './schemas';

export type RoomSettings = z.infer<typeof roomSettingsSchema>;

export type TimerPhase = (typeof PHASES)[number];
export type TimerStatus = (typeof TIMER_STATUSES)[number];
export type TimerControl = (typeof TIMER_CONTROLS)[number];
export type MemberStatus = (typeof STATUSES)[number];
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
  online: boolean;
  joinedAt: number;
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
  /** Up to last 100, oldest first. */
  messages: ChatMessage[];
  serverNow: number;
}

export type Ack<T> = { ok: true; data: T } | { ok: false; error: ErrorCode };
