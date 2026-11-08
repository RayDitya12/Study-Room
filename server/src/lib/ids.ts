import { createHash, randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@studyroom/shared';

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/** Public per-room identity: first 12 hex chars of sha256(clientId + ":" + roomId). */
export function publicUserId(clientId: string, roomId: string): string {
  return createHash('sha256').update(`${clientId}:${roomId}`).digest('hex').slice(0, 12);
}
