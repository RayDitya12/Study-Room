import { describe, expect, it } from 'vitest';
import { formatClockTime, formatRemaining } from '../lib/format';

describe('formatRemaining', () => {
  it('renders mm:ss and ceils to whole seconds', () => {
    expect(formatRemaining(1_500_000)).toBe('25:00');
    expect(formatRemaining(1_499_999)).toBe('25:00');
    expect(formatRemaining(65_000)).toBe('1:05');
    expect(formatRemaining(59_999)).toBe('1:00');
    expect(formatRemaining(500)).toBe('0:01');
  });

  it('clamps at zero', () => {
    expect(formatRemaining(0)).toBe('0:00');
    expect(formatRemaining(-4_000)).toBe('0:00');
  });

  it('switches to h:mm:ss past an hour', () => {
    expect(formatRemaining(3_600_000)).toBe('1:00:00');
    expect(formatRemaining(3_725_000)).toBe('1:02:05');
  });

  it('formats a wall-clock timestamp', () => {
    const stamp = Date.UTC(2026, 10, 8, 14, 5);
    expect(formatClockTime(stamp, 'en')).toMatch(/\d{1,2}:\d{2}/);
  });
});
