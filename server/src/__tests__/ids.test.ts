import { describe, expect, it } from 'vitest';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@studyroom/shared';
import { generateRoomCode, publicUserId } from '../lib/ids';

describe('generateRoomCode', () => {
  it('produces codes of the right length from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      for (const char of code) {
        expect(ROOM_CODE_ALPHABET).toContain(char);
      }
    }
  });

  it('never contains 0/O/1/I', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateRoomCode()).not.toMatch(/[0O1I]/);
    }
  });
});

describe('publicUserId', () => {
  const clientId = '5b0f6a1e-6d3a-4a5b-9a2c-1f7d3e4b5c6d';

  it('is stable for the same inputs', () => {
    expect(publicUserId(clientId, 'room1')).toBe(publicUserId(clientId, 'room1'));
  });

  it('differs per room and per client', () => {
    expect(publicUserId(clientId, 'room1')).not.toBe(publicUserId(clientId, 'room2'));
    expect(publicUserId(clientId, 'room1')).not.toBe(publicUserId('other-' + clientId, 'room1'));
  });

  it('is 12 lowercase hex chars and hides the clientId', () => {
    const id = publicUserId(clientId, 'room1');
    expect(id).toMatch(/^[0-9a-f]{12}$/);
    expect(id).not.toContain(clientId.slice(0, 8));
  });
});
