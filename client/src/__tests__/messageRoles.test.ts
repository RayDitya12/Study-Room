import { describe, expect, it } from 'vitest';
import type { Member } from '@studyroom/shared';
import { nameColor } from '../components/MessageItem';

const member = (over: Partial<Member> = {}): Member => ({
  userId: 'u1',
  nickname: 'Anna',
  status: 'focusing',
  task: '',
  isHost: false,
  isModerator: false,
  isMuted: false,
  online: true,
  joinedAt: 1_000,
  ...over,
});

describe('chat name colors', () => {
  it('host outranks moderator, plain members keep the accent colour', () => {
    expect(nameColor(member({ isHost: true }))).toBe('text-yellow');
    expect(nameColor(member({ isHost: true, isModerator: true }))).toBe('text-yellow');
    expect(nameColor(member({ isModerator: true }))).toBe('text-subtext1');
    expect(nameColor(member())).toBe('text-mauve');
  });

  it('falls back to the accent colour for senders who already left', () => {
    expect(nameColor(undefined)).toBe('text-mauve');
  });
});
