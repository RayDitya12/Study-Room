import { describe, expect, it } from 'vitest';
import { TIMER_PRESETS } from '@studyroom/shared';
import { en } from '../i18n/en';
import { id } from '../i18n/id';
import { matchPreset, type PresetValues, type TimerPresetId } from '../lib/timerPresets';

const classic = TIMER_PRESETS[0];

describe('matchPreset', () => {
  it('matches every preset exactly', () => {
    for (const preset of TIMER_PRESETS) {
      expect(matchPreset(preset)).toBe(preset.id);
    }
  });

  it('falls back to custom as soon as one number differs', () => {
    for (const key of ['focusMin', 'breakMin', 'longBreakMin', 'cyclesBeforeLong'] as const) {
      const draft: PresetValues = { ...classic, [key]: classic[key] + 1 };
      expect(matchPreset(draft)).toBe('custom');
    }
  });

  it('ignores settings a preset does not own', () => {
    const draft = { ...classic, autoStart: true, timerControl: 'everyone' };
    expect(matchPreset(draft)).toBe('classic');
  });

  it('labels every preset and custom in both languages', () => {
    const keys = TIMER_PRESETS.map((preset): TimerPresetId => preset.id).concat('custom');
    for (const key of keys) {
      expect(en.settings.presets[key]).toBeTruthy();
      expect(en.timer.preset[key]).toBeTruthy();
      expect(id.settings.presets[key]).toBeTruthy();
      expect(id.timer.preset[key]).toBeTruthy();
    }
  });
});
