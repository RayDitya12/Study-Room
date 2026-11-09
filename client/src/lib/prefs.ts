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

export const PREFS_STORAGE_VERSION = 2;

/**
 * The ten-voice chime picker that came before the alert table, folded into the
 * five sounds that table defines.
 */
const LEGACY_ALERT_SOUND: Record<string, AlertSoundPref> = {
  classic: 'chime',
  bell: 'bell',
  chime: 'chime',
  marimba: 'marimba',
  beep: 'pulse',
  pulse: 'pulse',
  gong: 'bell',
  pluck: 'marimba',
  arpeggio: 'chime',
  sweep: 'pulse',
};

/**
 * Brings any stored object up to the current shape: keys added later get their
 * default, values of the wrong type are dropped, and keys no longer used are
 * left behind.
 */
export function migratePrefs(stored: unknown): PrefsValues {
  const next: Record<string, unknown> = { ...PREF_DEFAULTS };
  const source = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(source)) {
    const fallback = next[key];
    if (fallback !== undefined && typeof value === typeof fallback) next[key] = value;
  }
  if (typeof source.alertSound !== 'string' && typeof source.soundPreset === 'string') {
    const mapped = LEGACY_ALERT_SOUND[source.soundPreset];
    if (mapped) next.alertSound = mapped;
  }
  return next as unknown as PrefsValues;
}
