import { describe, expect, it } from 'vitest';
import { LIMITS } from '@studyroom/shared';
import { cleanText } from '../lib/sanitize';

describe('cleanText', () => {
  it('removes control characters but keeps text', () => {
    expect(cleanText('he\u0000l\u0007lo\u001F', 100)).toBe('hello');
  });

  it('removes zero-width and bidi override characters', () => {
    expect(cleanText('a\u200Bb\u202Ec\u2069', 100)).toBe('abc');
  });

  it('collapses whitespace runs for nicknames/tasks', () => {
    expect(cleanText('  anna \t\t budi  ', 100)).toBe('anna budi');
    expect(cleanText('line1\nline2', 100)).toBe('line1 line2');
  });

  it('keeps single newlines for chat and collapses 3+ to 2', () => {
    expect(cleanText('a\nb', 100, { keepNewlines: true })).toBe('a\nb');
    expect(cleanText('a\r\nb', 100, { keepNewlines: true })).toBe('a\nb');
    expect(cleanText('a\n\n\n\nb', 100, { keepNewlines: true })).toBe('a\n\nb');
  });

  it('collapses horizontal whitespace in chat but not newlines', () => {
    expect(cleanText('a   b\t\tc\nd', 100, { keepNewlines: true })).toBe('a b c\nd');
  });

  it('trims and truncates to max', () => {
    expect(cleanText('  hello world  ', 5)).toBe('hello');
    expect(cleanText('x'.repeat(LIMITS.MESSAGE_MAX + 50), LIMITS.MESSAGE_MAX)).toHaveLength(
      LIMITS.MESSAGE_MAX,
    );
  });

  it('normalizes to NFC', () => {
    // "e" + combining acute accent -> single precomposed character
    expect(cleanText('e\u0301', 10)).toBe('\u00E9');
  });

  it('empty/invisible-only input cleans to empty string', () => {
    expect(cleanText('\u200B\u0000  ', 100)).toBe('');
  });
});
