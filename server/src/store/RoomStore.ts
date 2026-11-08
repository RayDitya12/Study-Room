import type { RoomSettings, TimerState } from '@studyroom/shared';

export interface StoredRoom {
  id: string;
  code: string;
  name: string;
  passwordHash: string | null;
  hostClientId: string;
  settings: RoomSettings;
  timer: TimerState;
  createdAt: number;
  lastActiveAt: number;
}

export interface StoredMessage {
  id: string;
  roomId: string;
  clientId: string;
  nickname: string;
  text: string;
  createdAt: number;
}

export interface CreateRoomInput {
  code: string;
  name: string;
  passwordHash: string | null;
  hostClientId: string;
  settings: RoomSettings;
}

export type RoomStatePatch = Partial<{
  hostClientId: string;
  settings: RoomSettings;
  timer: TimerState;
  lastActiveAt: number;
}>;

export interface RoomStore {
  createRoom(input: CreateRoomInput): Promise<StoredRoom>;
  getByCode(code: string): Promise<StoredRoom | null>;
  saveRoomState(roomId: string, patch: RoomStatePatch): Promise<void>;
  addMessage(m: Omit<StoredMessage, 'id' | 'createdAt'> & { createdAt?: number }): Promise<StoredMessage>;
  /** Oldest first, capped at `limit`. */
  getRecentMessages(roomId: string, limit: number): Promise<StoredMessage[]>;
  listRunningRooms(): Promise<StoredRoom[]>;
  deleteInactiveSince(cutoffMs: number): Promise<number>;
  codeExists(code: string): Promise<boolean>;
}
