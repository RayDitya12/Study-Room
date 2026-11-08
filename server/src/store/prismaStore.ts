import type { PrismaClient, Room as PrismaRoom } from '@prisma/client';
import {
  createInitialTimer,
  LIMITS,
  type RoomSettings,
  type TimerControl,
  type TimerPhase,
  type TimerState,
  type TimerStatus,
} from '@studyroom/shared';
import type { RoomStore, StoredBlock, StoredMessage, StoredRoom } from './RoomStore';

function toStoredRoom(row: PrismaRoom): StoredRoom {
  const settings: RoomSettings = {
    focusMin: row.focusMin,
    breakMin: row.breakMin,
    longBreakMin: row.longBreakMin,
    cyclesBeforeLong: row.cyclesBeforeLong,
    autoStart: row.autoStart,
    timerControl: row.timerControl as TimerControl,
  };
  const timer: TimerState = {
    phase: row.timerPhase as TimerPhase,
    status: row.timerStatus as TimerStatus,
    phaseDurationMs: row.timerDurationMs,
    remainingMs: row.timerRemainingMs,
    endsAt: row.timerEndsAt === null ? null : Number(row.timerEndsAt),
    completedFocus: row.completedFocus,
    version: row.timerVersion,
  };
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    passwordHash: row.passwordHash,
    hostClientId: row.hostClientId,
    settings,
    timer,
    createdAt: row.createdAt.getTime(),
    lastActiveAt: row.lastActiveAt.getTime(),
  };
}

export function createPrismaStore(prisma: PrismaClient): RoomStore {
  // Pruning counter is per-process, which is enough for a single-instance server.
  const addCounts = new Map<string, number>();

  return {
    async createRoom(input) {
      const timer = createInitialTimer(input.settings);
      const row = await prisma.room.create({
        data: {
          code: input.code,
          name: input.name,
          passwordHash: input.passwordHash,
          hostClientId: input.hostClientId,
          focusMin: input.settings.focusMin,
          breakMin: input.settings.breakMin,
          longBreakMin: input.settings.longBreakMin,
          cyclesBeforeLong: input.settings.cyclesBeforeLong,
          autoStart: input.settings.autoStart,
          timerControl: input.settings.timerControl,
          timerPhase: timer.phase,
          timerStatus: timer.status,
          timerDurationMs: timer.phaseDurationMs,
          timerRemainingMs: timer.remainingMs,
          timerEndsAt: null,
          completedFocus: timer.completedFocus,
          timerVersion: timer.version,
        },
      });
      return toStoredRoom(row);
    },

    async getByCode(code) {
      const row = await prisma.room.findUnique({ where: { code } });
      return row ? toStoredRoom(row) : null;
    },

    async saveRoomState(roomId, patch) {
      const data: Record<string, unknown> = {};
      if (patch.hostClientId !== undefined) data.hostClientId = patch.hostClientId;
      if (patch.lastActiveAt !== undefined) data.lastActiveAt = new Date(patch.lastActiveAt);
      if (patch.settings) {
        data.focusMin = patch.settings.focusMin;
        data.breakMin = patch.settings.breakMin;
        data.longBreakMin = patch.settings.longBreakMin;
        data.cyclesBeforeLong = patch.settings.cyclesBeforeLong;
        data.autoStart = patch.settings.autoStart;
        data.timerControl = patch.settings.timerControl;
      }
      if (patch.timer) {
        data.timerPhase = patch.timer.phase;
        data.timerStatus = patch.timer.status;
        data.timerDurationMs = patch.timer.phaseDurationMs;
        data.timerRemainingMs = patch.timer.remainingMs;
        data.timerEndsAt = patch.timer.endsAt === null ? null : BigInt(patch.timer.endsAt);
        data.completedFocus = patch.timer.completedFocus;
        data.timerVersion = patch.timer.version;
      }
      await prisma.room.update({ where: { id: roomId }, data });
    },

    async addMessage(m) {
      const row = await prisma.message.create({
        data: {
          roomId: m.roomId,
          clientId: m.clientId,
          nickname: m.nickname,
          text: m.text,
          ...(m.createdAt !== undefined ? { createdAt: new Date(m.createdAt) } : {}),
        },
      });
      const count = (addCounts.get(m.roomId) ?? 0) + 1;
      addCounts.set(m.roomId, count);
      if (count % 20 === 0) {
        const keep = await prisma.message.findMany({
          where: { roomId: m.roomId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: LIMITS.HISTORY_SIZE,
          select: { id: true },
        });
        await prisma.message.deleteMany({
          where: { roomId: m.roomId, id: { notIn: keep.map((k) => k.id) } },
        });
      }
      return {
        id: row.id,
        roomId: row.roomId,
        clientId: row.clientId,
        nickname: row.nickname,
        text: row.text,
        createdAt: row.createdAt.getTime(),
      };
    },

    async getRecentMessages(roomId, limit) {
      const rows = await prisma.message.findMany({
        where: { roomId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      });
      return rows.reverse().map((row): StoredMessage => ({
        id: row.id,
        roomId: row.roomId,
        clientId: row.clientId,
        nickname: row.nickname,
        text: row.text,
        createdAt: row.createdAt.getTime(),
      }));
    },

    async addBlock(input) {
      const blockedAt = new Date(input.blockedAt);
      const expiresAt = input.expiresAt === null ? null : new Date(input.expiresAt);
      await prisma.roomBlock.upsert({
        where: { roomId_userId: { roomId: input.roomId, userId: input.userId } },
        update: { nickname: input.nickname, reason: input.reason, blockedAt, expiresAt },
        create: {
          roomId: input.roomId,
          userId: input.userId,
          nickname: input.nickname,
          reason: input.reason,
          blockedAt,
          expiresAt,
        },
      });
    },

    async removeBlock(roomId, userId) {
      await prisma.roomBlock.deleteMany({ where: { roomId, userId } });
    },

    async listBlocks(roomId) {
      const rows = await prisma.roomBlock.findMany({
        where: { roomId },
        orderBy: { blockedAt: 'asc' },
      });
      return rows.map(
        (row): StoredBlock => ({
          userId: row.userId,
          nickname: row.nickname,
          reason: row.reason === 'kick' ? 'kick' : 'ban',
          blockedAt: row.blockedAt.getTime(),
          expiresAt: row.expiresAt === null ? null : row.expiresAt.getTime(),
        }),
      );
    },

    async listRunningRooms() {
      const rows = await prisma.room.findMany({ where: { timerStatus: 'running' } });
      return rows.map(toStoredRoom);
    },

    async deleteInactiveSince(cutoffMs) {
      const result = await prisma.room.deleteMany({
        where: { lastActiveAt: { lt: new Date(cutoffMs) } },
      });
      return result.count;
    },

    async codeExists(code) {
      return (await prisma.room.findUnique({ where: { code }, select: { id: true } })) !== null;
    },
  };
}
