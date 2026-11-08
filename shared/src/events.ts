import type {
  Ack,
  BlockedMember,
  BlockReason,
  ChatMessage,
  FocusSessionSummary,
  MediaState,
  Member,
  MemberStatus,
  RoomSettings,
  RoomSnapshot,
  TimerState,
} from './types';

export type EmptyPayload = Record<string, never>;

export interface TimeSyncPayload {
  clientSentAt: number;
}

export interface TimeSyncResult {
  clientSentAt: number;
  serverNow: number;
}

export type TimerChangeReason = 'start' | 'pause' | 'reset' | 'skip' | 'complete' | 'settings';

export type MediaChangeReason = 'set' | 'play' | 'pause' | 'seek' | 'loop' | 'clear';

/** Why a focus session ended; a pause never ends one. */
export type FocusEndReason = 'complete' | 'skip' | 'reset';

export interface TimerStateEvent {
  timer: TimerState;
  reason: TimerChangeReason;
  /** Public userId of the member who triggered the change, when applicable. */
  by?: string;
}

export interface MediaStateEvent {
  media: MediaState;
  reason: MediaChangeReason;
  by?: string;
}

export interface FocusSummaryEvent {
  summaries: FocusSessionSummary[];
  endedBy: FocusEndReason;
}

export interface SetModeratorPayload {
  targetUserId: string;
  isModerator: boolean;
}

export interface SetMutedPayload {
  targetUserId: string;
  isMuted: boolean;
}

export interface MediaSetPayload {
  url: string;
}

export interface MediaSeekPayload {
  positionMs: number;
}

export interface MediaLoopPayload {
  loop: boolean;
}

export interface FocusSetTrackingPayload {
  enabled: boolean;
}

export interface FocusStatePayload {
  away: boolean;
}

/** Target of a host action: kick, ban or lift a block. */
export interface MemberTargetPayload {
  targetUserId: string;
}

export interface ClientToServerEvents {
  'time:sync': (payload: TimeSyncPayload, ack: (res: Ack<TimeSyncResult>) => void) => void;
  'room:join': (
    payload: { code: string; nickname: string; clientId: string; password?: string },
    ack: (res: Ack<RoomSnapshot>) => void,
  ) => void;
  'room:leave': (payload: EmptyPayload, ack: (res: Ack<EmptyPayload>) => void) => void;
  'chat:send': (payload: { text: string }, ack: (res: Ack<ChatMessage>) => void) => void;
  'chat:typing': (payload: { isTyping: boolean }, ack: (res: Ack<EmptyPayload>) => void) => void;
  'member:update': (
    payload: { status?: MemberStatus; task?: string },
    ack: (res: Ack<Member>) => void,
  ) => void;
  'timer:start': (payload: EmptyPayload, ack: (res: Ack<TimerState>) => void) => void;
  'timer:pause': (payload: EmptyPayload, ack: (res: Ack<TimerState>) => void) => void;
  'timer:reset': (payload: EmptyPayload, ack: (res: Ack<TimerState>) => void) => void;
  'timer:skip': (payload: EmptyPayload, ack: (res: Ack<TimerState>) => void) => void;
  'room:updateSettings': (
    payload: Partial<RoomSettings>,
    ack: (res: Ack<RoomSettings>) => void,
  ) => void;
  'room:transferHost': (
    payload: { targetUserId: string },
    ack: (res: Ack<EmptyPayload>) => void,
  ) => void;
  'member:setModerator': (payload: SetModeratorPayload, ack: (res: Ack<Member>) => void) => void;
  'member:setMuted': (payload: SetMutedPayload, ack: (res: Ack<Member>) => void) => void;
  'member:kick': (payload: MemberTargetPayload, ack: (res: Ack<EmptyPayload>) => void) => void;
  'member:ban': (payload: MemberTargetPayload, ack: (res: Ack<EmptyPayload>) => void) => void;
  'member:unban': (
    payload: MemberTargetPayload,
    ack: (res: Ack<EmptyPayload>) => void,
  ) => void;
  /** Host-only: the kick/ban list, so a mistaken block can be lifted. */
  'room:getBlocks': (payload: EmptyPayload, ack: (res: Ack<BlockedMember[]>) => void) => void;
  /** Host or moderator: the whole shared music player, like the timer. */
  'media:set': (payload: MediaSetPayload, ack: (res: Ack<MediaState>) => void) => void;
  'media:play': (payload: EmptyPayload, ack: (res: Ack<MediaState>) => void) => void;
  'media:pause': (payload: EmptyPayload, ack: (res: Ack<MediaState>) => void) => void;
  'media:seek': (payload: MediaSeekPayload, ack: (res: Ack<MediaState>) => void) => void;
  'media:setLoop': (payload: MediaLoopPayload, ack: (res: Ack<MediaState>) => void) => void;
  'media:clear': (payload: EmptyPayload, ack: (res: Ack<MediaState>) => void) => void;
  /** Self only: opt in or out of focus tracking. */
  'focus:setTracking': (payload: FocusSetTrackingPayload, ack: (res: Ack<Member>) => void) => void;
  /** Self only, and only while tracking: the tab is hidden or shown again. */
  'focus:state': (payload: FocusStatePayload, ack: (res: Ack<EmptyPayload>) => void) => void;
}

export interface ServerToClientEvents {
  'member:joined': (member: Member) => void;
  'member:left': (payload: { userId: string }) => void;
  'member:offline': (payload: { userId: string }) => void;
  /**
   * The host removed someone. Replaces `member:left` for that person, and the
   * client whose own id it carries must drop its stored session.
   */
  'room:kicked': (payload: { userId: string; reason: BlockReason }) => void;
  'member:updated': (member: Member) => void;
  'room:hostChanged': (payload: { hostUserId: string; reason: 'transfer' | 'auto' }) => void;
  'room:settingsUpdated': (settings: RoomSettings) => void;
  'timer:state': (payload: TimerStateEvent) => void;
  'media:state': (payload: MediaStateEvent) => void;
  /** Sent to the whole room when a focus phase ends; only tracked members appear. */
  'focus:summary': (payload: FocusSummaryEvent) => void;
  'chat:message': (message: ChatMessage) => void;
  'chat:typing': (payload: { userId: string; isTyping: boolean }) => void;
}
