import { DEFAULT_PRESET_ID, type PresetId } from './soundPresets';

/**
 * The contract for everything stored under `studyroom.prefs`. It lives here,
 * pure and free of zustand, so an old stored object can be migrated in a test.
 */

export type ThemePref = 'system' | 'light' | 'dark';
/** The two modes the toggle can actually land on. */
export type SelectableTheme = Exclude<ThemePref, 'system'>;
export type LangPref = 'en' | 'id';
export type AlertSoundPref = 'chime' | 'bell' | 'marimba' | 'pulse' | 'none';
export type AmbientPref = 'off' | 'white' | 'pink' | 'brown' | 'rain' | 'waves';
export type TimerStylePref = 'ring' | 'minimal';

export interface PrefsValues {
  theme: ThemePref;
  lang: LangPref;
  /** Master mute for the alert sounds. */
  soundOn: boolean;
  /** The older ten-voice chime picker, kept until the alert table replaces it. */
  soundPreset: PresetId;
  alertSound: AlertSoundPref;
  /** 0..100 sliders, all stored as whole percents. */
  alertVolume: number;
  ambientType: AmbientPref;
  ambientVolume: number;
  ambientOnlyWhileFocus: boolean;
  timerStyle: TimerStylePref;
  focusTracking: boolean;
  musicVolume: number;
  musicListening: boolean;
}

export const PREF_DEFAULTS: PrefsValues = {
  // 'system' means "never chosen yet": the theme follows the OS until the
  // toggle is used, after which it is always an explicit light or dark.
  theme: 'system',
  lang: 'en',
  soundOn: true,
  soundPreset: DEFAULT_PRESET_ID,
  alertSound: 'chime',
  alertVolume: 60,
  ambientType: 'off',
  ambientVolume: 35,
  ambientOnlyWhileFocus: false,
  timerStyle: 'ring',
  focusTracking: false,
  musicVolume: 50,
  musicListening: true,
};

export const PREFS_STORAGE_VERSION = 1;

/**
 * Brings any stored object up to the current shape: keys added later get their
 * default, values of the wrong type are dropped, and keys no longer used are
 * left behind.
 */
export function migratePrefs(stored: unknown): PrefsValues {
  const next: Record<string, unknown> = { ...PREF_DEFAULTS };
  if (stored && typeof stored === 'object') {
    for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
      const fallback = next[key];
      if (fallback !== undefined && typeof value === typeof fallback) next[key] = value;
    }
  }
  return next as unknown as PrefsValues;
}
