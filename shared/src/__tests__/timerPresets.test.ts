import { describe, expect, it } from 'vitest';
import { LIMITS, TIMER_PRESETS } from '../constants';

const RANGES = {
  focusMin: LIMITS.FOCUS_MIN,
  breakMin: LIMITS.BREAK_MIN,
  longBreakMin: LIMITS.LONG_BREAK_MIN,
  cyclesBeforeLong: LIMITS.CYCLES,
} as const;

describe('TIMER_PRESETS', () => {
  it('has unique ids', () => {
    const ids = TIMER_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stays inside the LIMITS ranges the server validates against', () => {
    for (const preset of TIMER_PRESETS) {
      for (const key of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
        const [min, max] = RANGES[key];
        expect(preset[key]).toBeGreaterThanOrEqual(min);
        expect(preset[key]).toBeLessThanOrEqual(max);
        expect(Number.isInteger(preset[key])).toBe(true);
      }
    }
  });

  it('keeps the 25/5 classic as the first entry', () => {
    expect(TIMER_PRESETS[0]).toMatchObject({ id: 'classic', focusMin: 25, breakMin: 5 });
  });
});
