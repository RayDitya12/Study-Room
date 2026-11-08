import { randomUUID } from 'node:crypto';
import { createInitialTimer, LIMITS } from '@studyroom/shared';
import type { RoomStore, StoredMessage, StoredRoom } from './RoomStore';

const clone = <T>(value: T): T => structuredClone(value);

export function createMemoryStore(): RoomStore {
  const roomsById = new Map<string, StoredRoom>();
  const roomIdsByCode = new Map<string, string>();
  const messagesByRoom = new Map<string, StoredMessage[]>();
  // Pruning runs after every 20th addMessage for a room.
  const addCounts = new Map<string, number>();

  return {
    async createRoom(input) {
      const now = Date.now();
      const room: StoredRoom = {
        id: randomUUID(),
        code: input.code,
        name: input.name,
        passwordHash: input.passwordHash,
        hostClientId: input.hostClientId,
        settings: input.settings,
        timer: createInitialTimer(input.settings),
        createdAt: now,
        lastActiveAt: now,
      };
      roomsById.set(room.id, room);
      roomIdsByCode.set(room.code, room.id);
      messagesByRoom.set(room.id, []);
      return clone(room);
    },

    async getByCode(code) {
      const id = roomIdsByCode.get(code);
      const room = id ? roomsById.get(id) : undefined;
      return room ? clone(room) : null;
    },

    async saveRoomState(roomId, patch) {
      const room = roomsById.get(roomId);
      if (!room) return;
      Object.assign(room, patch);
    },

    async addMessage(m) {
      const message: StoredMessage = {
        id: randomUUID(),
        roomId: m.roomId,
        clientId: m.clientId,
        nickname: m.nickname,
        text: m.text,
        createdAt: m.createdAt ?? Date.now(),
      };
      const list = messagesByRoom.get(m.roomId);
      if (list) {
        list.push(message);
        const count = (addCounts.get(m.roomId) ?? 0) + 1;
        addCounts.set(m.roomId, count);
        if (count % 20 === 0 && list.length > LIMITS.HISTORY_SIZE) {
          list.splice(0, list.length - LIMITS.HISTORY_SIZE);
        }
      }
      return clone(message);
    },

    async getRecentMessages(roomId, limit) {
      const list = messagesByRoom.get(roomId) ?? [];
      return clone(list.slice(Math.max(0, list.length - limit)));
    },

    async listRunningRooms() {
      return [...roomsById.values()].filter((room) => room.timer.status === 'running').map(clone);
    },

    async deleteInactiveSince(cutoffMs) {
      let deleted = 0;
      for (const room of roomsById.values()) {
        if (room.lastActiveAt < cutoffMs) {
          roomsById.delete(room.id);
          roomIdsByCode.delete(room.code);
          messagesByRoom.delete(room.id);
          addCounts.delete(room.id);
          deleted++;
        }
      }
      return deleted;
    },

    async codeExists(code) {
      return roomIdsByCode.has(code);
    },
  };
}
