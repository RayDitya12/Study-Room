export type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth';

export interface PresetNote {
  readonly freq: number;
  readonly at: number;
  readonly dur: number;
  readonly gain?: number;
  /** Optional end frequency: the note slides from `freq` to this value. */
  readonly glideTo?: number;
}

export interface SoundPreset {
  readonly id: string;
  readonly wave: Wave;
  readonly notes: readonly PresetNote[];
}

export const DEFAULT_GAIN = 0.15;

const note = (
  freq: number,
  at: number,
  dur: number,
  gain?: number,
  glideTo?: number,
): PresetNote => ({ freq, at, dur, gain, glideTo });

export const SOUND_PRESETS = [
  {
    id: 'classic',
    wave: 'sine',
    notes: [note(523.25, 0, 0.15), note(659.25, 0.16, 0.15)],
  },
  {
    id: 'bell',
    wave: 'triangle',
    notes: [note(659.25, 0, 0.55, 0.13), note(987.77, 0.04, 0.6, 0.06)],
  },
  {
    id: 'chime',
    wave: 'sine',
    notes: [note(523.25, 0, 0.12), note(659.25, 0.1, 0.12), note(783.99, 0.2, 0.22)],
  },
  {
    id: 'marimba',
    wave: 'triangle',
    notes: [note(392, 0, 0.1, 0.16), note(523.25, 0.09, 0.14, 0.16)],
  },
  {
    id: 'beep',
    wave: 'square',
    // Square waves are loud for the same gain, so these stay quiet.
    notes: [note(440, 0, 0.07, 0.07), note(440, 0.13, 0.07, 0.07), note(660, 0.26, 0.1, 0.07)],
  },
  {
    id: 'pulse',
    wave: 'sine',
    notes: [note(130.81, 0, 0.11, 0.18), note(130.81, 0.16, 0.11, 0.18), note(196, 0.32, 0.18, 0.18)],
  },
  {
    id: 'gong',
    wave: 'sawtooth',
    notes: [note(130.81, 0, 0.9, 0.07), note(196, 0.02, 0.85, 0.04), note(261.63, 0.05, 0.8, 0.03)],
  },
  {
    id: 'pluck',
    wave: 'sawtooth',
    notes: [note(659.25, 0, 0.07, 0.1), note(880, 0.08, 0.07, 0.1), note(1174.66, 0.16, 0.12, 0.1)],
  },
  {
    id: 'arpeggio',
    wave: 'sine',
    notes: [
      note(523.25, 0, 0.1),
      note(659.25, 0.08, 0.1),
      note(783.99, 0.16, 0.1),
      note(1046.5, 0.24, 0.24),
    ],
  },
  {
    id: 'sweep',
    wave: 'sine',
    notes: [note(392, 0, 0.28, 0.13, 987.77), note(987.77, 0.3, 0.22, 0.11, 1318.51)],
  },
] as const;

export type PresetId = (typeof SOUND_PRESETS)[number]['id'];

export const DEFAULT_PRESET_ID: PresetId = 'classic';

export function findPreset(id: string): SoundPreset {
  return SOUND_PRESETS.find((preset) => preset.id === id) ?? SOUND_PRESETS[0];
}

/** Mirrors a preset in time so one voice can mark "in" and "out". */
export function reversePreset(preset: SoundPreset): SoundPreset {
  const last = preset.notes.reduce((max, n) => Math.max(max, n.at), 0);
  return {
    ...preset,
    notes: preset.notes.map((n) => ({ ...n, at: last - n.at })),
  };
}

/** Seconds from the first note to the end of the last one. */
export function presetLength(preset: SoundPreset): number {
  return preset.notes.reduce((max, n) => Math.max(max, n.at + n.dur), 0);
}
