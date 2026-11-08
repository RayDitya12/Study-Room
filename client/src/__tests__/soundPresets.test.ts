import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAIN,
  DEFAULT_PRESET_ID,
  SOUND_PRESETS,
  findPreset,
  presetLength,
  reversePreset,
} from '../lib/soundPresets';

describe('timer sound presets', () => {
  it('offers at least ten distinct presets', () => {
    expect(SOUND_PRESETS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(SOUND_PRESETS.map((p) => p.id)).size).toBe(SOUND_PRESETS.length);
  });

  it('keeps every note audible, short and below the clipping threshold', () => {
    for (const preset of SOUND_PRESETS) {
      expect(preset.notes.length).toBeGreaterThan(1);
      let previousAt = -1;
      for (const n of preset.notes) {
        expect(n.freq).toBeGreaterThan(60);
        expect(n.freq).toBeLessThan(4000);
        expect(n.dur).toBeGreaterThan(0);
        expect(n.at).toBeGreaterThan(previousAt);
        expect(n.gain ?? DEFAULT_GAIN).toBeLessThanOrEqual(0.2);
        previousAt = n.at;
      }
      expect(presetLength(preset)).toBeLessThan(1.5);
    }
  });

  it('falls back to the default preset for an unknown id', () => {
    expect(findPreset('nope').id).toBe(DEFAULT_PRESET_ID);
    expect(findPreset('gong').id).toBe('gong');
  });

  it('mirrors a preset in time and back', () => {
    const source = findPreset('chime');
    const backwards = reversePreset(source);
    expect(backwards.notes.map((n) => n.at)).toEqual([0.2, 0.1, 0]);
    expect(reversePreset(backwards).notes.map((n) => n.at)).toEqual(
      source.notes.map((n) => n.at),
    );
    expect(backwards.notes.map((n) => `${n.freq}:${n.at}`)).toEqual([
      '523.25:0.2',
      '659.25:0.1',
      '783.99:0',
    ]);
  });
});
