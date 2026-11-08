import type {
  Ack,
  ChatMessage,
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

export interface TimerStateEvent {
  timer: TimerState;
  reason: TimerChangeReason;
  /** Public userId of the member who triggered the change, when applicable. */
  by?: string;
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
}

export interface ServerToClientEvents {
  'member:joined': (member: Member) => void;
  'member:left': (payload: { userId: string }) => void;
  'member:offline': (payload: { userId: string }) => void;
  'member:updated': (member: Member) => void;
  'room:hostChanged': (payload: { hostUserId: string; reason: 'transfer' | 'auto' }) => void;
  'room:settingsUpdated': (settings: RoomSettings) => void;
  'timer:state': (payload: TimerStateEvent) => void;
  'chat:message': (message: ChatMessage) => void;
  'chat:typing': (payload: { userId: string; isTyping: boolean }) => void;
}
