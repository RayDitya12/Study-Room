import { TIMER_PRESETS } from '@studyroom/shared';

/**
 * The four numbers a Pomodoro preset owns. Everything else in the room settings
 * (auto-start, who may control the timer) is independent of the preset.
 */
export interface PresetValues {
  focusMin: number;
  breakMin: number;
  longBreakMin: number;
  cyclesBeforeLong: number;
}

export type TimerPresetId = (typeof TIMER_PRESETS)[number]['id'] | 'custom';

/**
 * Which preset chip the given numbers line up with, or 'custom' when none does.
 */
export function matchPreset(values: PresetValues): TimerPresetId {
  const preset = TIMER_PRESETS.find(
    (candidate) =>
      candidate.focusMin === values.focusMin &&
      candidate.breakMin === values.breakMin &&
      candidate.longBreakMin === values.longBreakMin &&
      candidate.cyclesBeforeLong === values.cyclesBeforeLong,
  );
  return preset?.id ?? 'custom';
}
