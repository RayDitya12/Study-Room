import { describe, expect, it } from 'vitest';
import {
  chatSendPayloadSchema,
  clientIdSchema,
  createRoomBodySchema,
  joinRoomPayloadSchema,
  nicknameSchema,
  roomCodeSchema,
  roomSettingsInputSchema,
  roomSettingsSchema,
} from '../schemas';

const UUID = '5b0f6a1e-6d3a-4a5b-9a2c-1f7d3e4b5c6d';

describe('nicknameSchema', () => {
  it('accepts the bounds', () => {
    expect(nicknameSchema.safeParse('ab').success).toBe(true);
    expect(nicknameSchema.safeParse('a'.repeat(20)).success).toBe(true);
  });

  it('rejects too short / too long', () => {
    expect(nicknameSchema.safeParse('a').success).toBe(false);
    expect(nicknameSchema.safeParse('a'.repeat(21)).success).toBe(false);
  });

  it('trims before validating', () => {
    const parsed = nicknameSchema.safeParse('  anna  ');
    expect(parsed.success && parsed.data).toBe('anna');
    expect(nicknameSchema.safeParse(' a ').success).toBe(false);
  });
});

describe('roomCodeSchema', () => {
  it('uppercases valid codes', () => {
    const parsed = roomCodeSchema.safeParse('abc234');
    expect(parsed.success && parsed.data).toBe('ABC234');
  });

  it('rejects wrong length and ambiguous characters', () => {
    expect(roomCodeSchema.safeParse('ABC23').success).toBe(false);
    expect(roomCodeSchema.safeParse('ABC2345').success).toBe(false);
    expect(roomCodeSchema.safeParse('O0I1AB').success).toBe(false);
  });
});

describe('roomSettings schemas', () => {
  const valid = {
    focusMin: 25,
    breakMin: 5,
    longBreakMin: 15,
    cyclesBeforeLong: 4,
    autoStart: false,
    timerControl: 'host',
  };

  it('accepts a full valid object', () => {
    expect(roomSettingsSchema.safeParse(valid).success).toBe(true);
  });

  it('enforces ranges', () => {
    expect(roomSettingsSchema.safeParse({ ...valid, focusMin: 0 }).success).toBe(false);
    expect(roomSettingsSchema.safeParse({ ...valid, focusMin: 121 }).success).toBe(false);
    expect(roomSettingsSchema.safeParse({ ...valid, breakMin: 61 }).success).toBe(false);
    expect(roomSettingsSchema.safeParse({ ...valid, longBreakMin: 0 }).success).toBe(false);
    expect(roomSettingsSchema.safeParse({ ...valid, cyclesBeforeLong: 1 }).success).toBe(false);
    expect(roomSettingsSchema.safeParse({ ...valid, cyclesBeforeLong: 9 }).success).toBe(false);
    expect(roomSettingsSchema.safeParse({ ...valid, timerControl: 'anyone' }).success).toBe(false);
  });

  it('rejects unknown fields (.strict)', () => {
    expect(roomSettingsSchema.safeParse({ ...valid, evil: 1 }).success).toBe(false);
  });

  it('input schema fills defaults', () => {
    expect(roomSettingsInputSchema.parse({})).toEqual(valid);
  });
});

describe('joinRoomPayloadSchema', () => {
  const valid = { code: 'ABC234', nickname: 'anna', clientId: UUID };

  it('accepts a valid payload', () => {
    expect(joinRoomPayloadSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects extra fields', () => {
    expect(joinRoomPayloadSchema.safeParse({ ...valid, isAdmin: true }).success).toBe(false);
  });

  it('requires a UUID clientId and rejects a bad password length', () => {
    expect(joinRoomPayloadSchema.safeParse({ ...valid, clientId: 'nope' }).success).toBe(false);
    expect(joinRoomPayloadSchema.safeParse({ ...valid, password: '123' }).success).toBe(false);
  });
});

describe('chatSendPayloadSchema', () => {
  it('accepts up to 500 chars, rejects 501 and empty', () => {
    expect(chatSendPayloadSchema.safeParse({ text: 'a'.repeat(500) }).success).toBe(true);
    expect(chatSendPayloadSchema.safeParse({ text: 'a'.repeat(501) }).success).toBe(false);
    expect(chatSendPayloadSchema.safeParse({ text: '' }).success).toBe(false);
  });
});

describe('createRoomBodySchema', () => {
  it('accepts a minimal body', () => {
    expect(createRoomBodySchema.safeParse({ name: 'My room', clientId: UUID }).success).toBe(true);
  });

  it('rejects an empty name and extra fields', () => {
    expect(createRoomBodySchema.safeParse({ name: '', clientId: UUID }).success).toBe(false);
    expect(
      createRoomBodySchema.safeParse({ name: 'x', clientId: UUID, extra: 1 }).success,
    ).toBe(false);
  });
});

describe('clientIdSchema', () => {
  it('accepts UUID v4 only', () => {
    expect(clientIdSchema.safeParse(UUID).success).toBe(true);
    expect(clientIdSchema.safeParse('hello').success).toBe(false);
  });
});
