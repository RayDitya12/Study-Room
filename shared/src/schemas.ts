import { z } from 'zod';
import { LIMITS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, STATUSES, TIMER_CONTROLS } from './constants';

export const nicknameSchema = z
  .string()
  .trim()
  .min(LIMITS.NICKNAME_MIN)
  .max(LIMITS.NICKNAME_MAX);

export const roomNameSchema = z
  .string()
  .trim()
  .min(LIMITS.ROOM_NAME_MIN)
  .max(LIMITS.ROOM_NAME_MAX);

export const passwordSchema = z.string().min(LIMITS.PASSWORD_MIN).max(LIMITS.PASSWORD_MAX);

export const clientIdSchema = z.string().uuid();

export const roomCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine(
    (v) =>
      v.length === ROOM_CODE_LENGTH &&
      [...v].every((c) => ROOM_CODE_ALPHABET.includes(c)),
    { message: 'invalid room code' },
  );

export const roomSettingsSchema = z
  .object({
    focusMin: z.number().int().min(LIMITS.FOCUS_MIN[0]).max(LIMITS.FOCUS_MIN[1]),
    breakMin: z.number().int().min(LIMITS.BREAK_MIN[0]).max(LIMITS.BREAK_MIN[1]),
    longBreakMin: z.number().int().min(LIMITS.LONG_BREAK_MIN[0]).max(LIMITS.LONG_BREAK_MIN[1]),
    cyclesBeforeLong: z.number().int().min(LIMITS.CYCLES[0]).max(LIMITS.CYCLES[1]),
    autoStart: z.boolean(),
    timerControl: z.enum(TIMER_CONTROLS),
  })
  .strict();

// Same shape but every field defaulted, so clients may send a partial object.
export const roomSettingsInputSchema = z
  .object({
    focusMin: z.number().int().min(LIMITS.FOCUS_MIN[0]).max(LIMITS.FOCUS_MIN[1]).default(25),
    breakMin: z.number().int().min(LIMITS.BREAK_MIN[0]).max(LIMITS.BREAK_MIN[1]).default(5),
    longBreakMin: z
      .number()
      .int()
      .min(LIMITS.LONG_BREAK_MIN[0])
      .max(LIMITS.LONG_BREAK_MIN[1])
      .default(15),
    cyclesBeforeLong: z.number().int().min(LIMITS.CYCLES[0]).max(LIMITS.CYCLES[1]).default(4),
    autoStart: z.boolean().default(false),
    timerControl: z.enum(TIMER_CONTROLS).default('host'),
  })
  .strict();

export const roomSettingsPatchSchema = roomSettingsSchema.partial().strict();

export const emptyPayloadSchema = z.object({}).strict();

export const timeSyncPayloadSchema = z.object({ clientSentAt: z.number() }).strict();

export const joinRoomPayloadSchema = z
  .object({
    code: roomCodeSchema,
    nickname: nicknameSchema,
    clientId: clientIdSchema,
    password: passwordSchema.optional(),
  })
  .strict();

export const chatSendPayloadSchema = z
  .object({ text: z.string().min(1).max(LIMITS.MESSAGE_MAX) })
  .strict();

export const chatTypingPayloadSchema = z.object({ isTyping: z.boolean() }).strict();

export const memberUpdatePayloadSchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    task: z.string().max(LIMITS.TASK_MAX).optional(),
  })
  .strict();

export const transferHostPayloadSchema = z.object({ targetUserId: z.string().min(1) }).strict();

export const setModeratorPayloadSchema = z
  .object({ targetUserId: z.string().min(1), isModerator: z.boolean() })
  .strict();

export const setMutedPayloadSchema = z
  .object({ targetUserId: z.string().min(1), isMuted: z.boolean() })
  .strict();

/** Kick, ban and unban all carry just the public id of the target. */
export const memberTargetPayloadSchema = transferHostPayloadSchema;

export const createRoomBodySchema = z
  .object({
    name: roomNameSchema,
    password: passwordSchema.optional(),
    clientId: clientIdSchema,
    settings: roomSettingsInputSchema.optional(),
  })
  .strict();
