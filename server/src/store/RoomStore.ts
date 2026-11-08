import type { BlockReason, RoomSettings, TimerState } from '@studyroom/shared';

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

export interface StoredBlock {
  userId: string;
  nickname: string;
  reason: BlockReason;
  blockedAt: number;
  expiresAt: number | null;
}

export interface BlockInput {
  roomId: string;
  userId: string;
  /** Display name at removal time; never used for authorisation. */
  nickname: string;
  reason: BlockReason;
  /** Server epoch ms, taken from the runtime clock. */
  blockedAt: number;
  expiresAt: number | null;
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
  /** Replaces any existing block for the same user. */
  addBlock(input: BlockInput): Promise<void>;
  removeBlock(roomId: string, userId: string): Promise<void>;
  listBlocks(roomId: string): Promise<StoredBlock[]>;
  listRunningRooms(): Promise<StoredRoom[]>;
  deleteInactiveSince(cutoffMs: number): Promise<number>;
  codeExists(code: string): Promise<boolean>;
}
