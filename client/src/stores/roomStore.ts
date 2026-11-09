import { create } from 'zustand';
import type {
  BlockReason,
  ChatMessage,
  FocusSummaryEvent,
  Member,
  RoomSettings,
  RoomSnapshot,
  TimerPhase,
  TimerState,
  TimerStateEvent,
} from '@studyroom/shared';
import type { TranslationKey } from '../i18n/en';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

/** A chat line the client generates from a room event; never persisted. */
export interface SystemLine {
  kind: 'system';
  id: string;
  key: TranslationKey;
  params?: Record<string, string>;
  /** Raw phase for `chat.phaseChanged`, translated at render time. */
  phase?: TimerPhase;
  createdAt: number;
}

export interface ChatLine {
  kind: 'chat';
  id: string;
  message: ChatMessage;
  createdAt: number;
}

export type MessageItem = SystemLine | ChatLine;

const TYPING_TTL_MS = 3_000;

interface RoomState {
  connection: ConnectionStatus;
  hasRoom: boolean;
  code: string;
  name: string;
  hasPassword: boolean;
  settings: RoomSettings | null;
  hostUserId: string;
  youUserId: string;
  members: Member[];
  timer: TimerState | null;
  messages: MessageItem[];
  /** userId -> local timestamp at which the indicator expires. */
  typing: Record<string, number>;
  /** Set when the host removed *this* client from the room. */
  kicked: BlockReason | null;
  /** The session that just ended; drives the summary dialog. */
  focusSummary: FocusSummaryEvent | null;

  setConnection: (connection: ConnectionStatus) => void;
  applySnapshot: (snapshot: RoomSnapshot) => void;
  memberJoined: (member: Member) => void;
  memberLeft: (userId: string) => void;
  memberOffline: (userId: string) => void;
  memberUpdated: (member: Member) => void;
  memberKicked: (userId: string, reason: BlockReason) => void;
  setKicked: (reason: BlockReason) => void;
  hostChanged: (hostUserId: string) => void;
  settingsUpdated: (settings: RoomSettings) => void;
  timerState: (event: TimerStateEvent) => void;
  focusSummaryReceived: (event: FocusSummaryEvent | null) => void;
  chatMessage: (message: ChatMessage) => void;
  chatTyping: (userId: string, isTyping: boolean) => void;
  clear: () => void;
}

let lineSeq = 0;
const nextLineId = (): string => `s${Date.now().toString(36)}-${lineSeq++}`;

function systemLine(
  key: TranslationKey,
  params?: Record<string, string>,
  phase?: TimerPhase,
): SystemLine {
  return { kind: 'system', id: nextLineId(), key, params, phase, createdAt: Date.now() };
}

function upsert(members: Member[], member: Member): Member[] {
  const index = members.findIndex((m) => m.userId === member.userId);
  if (index === -1) return [...members, member];
  const next = members.slice();
  next[index] = member;
  return next;
}

function patch(
  members: Member[],
  userId: string,
  changes: Partial<Member>,
): Member[] {
  return members.map((m) => (m.userId === userId ? { ...m, ...changes } : m));
}

const empty = {
  connection: 'connecting' as ConnectionStatus,
  hasRoom: false,
  code: '',
  name: '',
  hasPassword: false,
  settings: null,
  hostUserId: '',
  youUserId: '',
  members: [] as Member[],
  timer: null,
  messages: [] as MessageItem[],
  typing: {} as Record<string, number>,
  kicked: null,
  focusSummary: null as FocusSummaryEvent | null,
};

export const useRoomStore = create<RoomState>()((set) => ({
  ...empty,

  setConnection: (connection) => set({ connection }),

  applySnapshot: (snapshot) =>
    set({
      hasRoom: true,
      connection: 'connected',
      code: snapshot.code,
      name: snapshot.name,
      hasPassword: snapshot.hasPassword,
      settings: snapshot.settings,
      hostUserId: snapshot.hostUserId,
      youUserId: snapshot.you.userId,
      members: snapshot.members,
      timer: snapshot.timer,
      messages: snapshot.messages.map<MessageItem>((message) => ({
        kind: 'chat',
        id: message.id,
        message,
        createdAt: message.createdAt,
      })),
      typing: {},
      kicked: null,
    }),

  memberJoined: (member) =>
    set((s) => {
      if (!s.hasRoom) return s;
      const wasKnown = s.members.some((m) => m.userId === member.userId);
      return {
        members: upsert(s.members, member),
        messages: wasKnown
          ? s.messages
          : [...s.messages, systemLine('chat.joined', { name: member.nickname })],
      };
    }),

  memberLeft: (userId) =>
    set((s) => {
      const member = s.members.find((m) => m.userId === userId);
      if (!member) return s;
      const typing = { ...s.typing };
      delete typing[userId];
      return {
        members: s.members.filter((m) => m.userId !== userId),
        messages: [...s.messages, systemLine('chat.left', { name: member.nickname })],
        typing,
      };
    }),

  memberOffline: (userId) =>
    set((s) => {
      if (!s.members.some((m) => m.userId === userId)) return s;
      const typing = { ...s.typing };
      delete typing[userId];
      return { members: patch(s.members, userId, { online: false }), typing };
    }),

  // Unknown ids are ignored so a member that already left cannot be resurrected
  // by a late-arriving event.
  memberUpdated: (member) =>
    set((s) => {
      if (!s.members.some((m) => m.userId === member.userId)) return s;
      return { members: upsert(s.members, member) };
    }),

  // Replaces member:left for a host-ordered removal, so it gets its own line.
  memberKicked: (userId, reason) =>
    set((s) => {
      const member = s.members.find((m) => m.userId === userId);
      if (!member) return s;
      if (userId === s.youUserId) {
        return { ...empty, connection: 'disconnected', kicked: reason };
      }
      const typing = { ...s.typing };
      delete typing[userId];
      return {
        members: s.members.filter((m) => m.userId !== userId),
        messages: [
          ...s.messages,
          systemLine(reason === 'ban' ? 'chat.banned' : 'chat.kicked', { name: member.nickname }),
        ],
        typing,
      };
    }),

  // A join rejected as KICKED/BANNED never created a member entry to remove.
  setKicked: (reason) => set({ ...empty, connection: 'disconnected', kicked: reason }),

  hostChanged: (hostUserId) =>
    set((s) => {
      const target = s.members.find((m) => m.userId === hostUserId);
      // The role badge is derived here too, exactly like the server derives it.
      const members = s.members.map<Member>((m) => {
        const isHost = m.userId === hostUserId;
        return { ...m, isHost, role: isHost ? 'host' : m.isModerator ? 'mod' : 'member' };
      });
      return {
        hostUserId,
        members,
        messages: target
          ? [...s.messages, systemLine('chat.hostChanged', { name: target.nickname })]
          : s.messages,
      };
    }),

  settingsUpdated: (settings) => set({ settings }),

  timerState: (event) =>
    set((s) => {
      // Out-of-order events must not rewind the visible timer.
      if (s.timer && event.timer.version < s.timer.version) return s;
      const messages =
        event.reason === 'complete'
          ? [...s.messages, systemLine('chat.phaseChanged', undefined, event.timer.phase)]
          : s.messages;
      return { timer: event.timer, messages };
    }),

  // Null closes the dialog; the event itself is not a log, so nothing is kept.
  focusSummaryReceived: (event) => set({ focusSummary: event }),

  chatMessage: (message) =>
    set((s) => {
      const typing = { ...s.typing };
      delete typing[message.userId];
      return {
        messages: [
          ...s.messages,
          { kind: 'chat', id: message.id, message, createdAt: message.createdAt } satisfies ChatLine,
        ],
        typing,
      };
    }),

  chatTyping: (userId, isTyping) =>
    set((s) => {
      const typing = { ...s.typing };
      if (isTyping) typing[userId] = Date.now() + TYPING_TTL_MS;
      else delete typing[userId];
      return { typing };
    }),

  clear: () => set({ ...empty, connection: 'disconnected' }),
}));
