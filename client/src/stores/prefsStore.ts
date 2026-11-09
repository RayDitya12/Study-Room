import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  migratePrefs,
  PREF_DEFAULTS,
  PREFS_STORAGE_VERSION,
  type AlertSoundPref,
  type AmbientPref,
  type LangPref,
  type PrefsValues,
  type SelectableTheme,
  type ThemePref,
  type TimerStylePref,
} from '../lib/prefs';

export type { AlertSoundPref, AmbientPref, LangPref, SelectableTheme, ThemePref, TimerStylePref };

interface PrefsState extends PrefsValues {
  setTheme: (theme: SelectableTheme) => void;
  setLang: (lang: LangPref) => void;
  toggleLang: () => void;
  toggleSound: () => void;
  setAlertSound: (id: AlertSoundPref) => void;
  setAlertVolume: (volume: number) => void;
  setAmbientType: (type: AmbientPref) => void;
  setAmbientVolume: (volume: number) => void;
  setAmbientOnlyWhileFocus: (onlyWhileFocus: boolean) => void;
  setTimerStyle: (style: TimerStylePref) => void;
  setFocusTracking: (enabled: boolean) => void;
  setMusicVolume: (volume: number) => void;
  setMusicListening: (listening: boolean) => void;
  setMusicCover: (cover: boolean) => void;
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      ...PREF_DEFAULTS,
      setTheme: (theme) => set({ theme }),
      setLang: (lang) => set({ lang }),
      toggleLang: () => set((s) => ({ lang: s.lang === 'en' ? 'id' : 'en' })),
      toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),
      setAlertSound: (alertSound) => set({ alertSound }),
      setAlertVolume: (alertVolume) => set({ alertVolume }),
      setAmbientType: (ambientType) => set({ ambientType }),
      setAmbientVolume: (ambientVolume) => set({ ambientVolume }),
      setAmbientOnlyWhileFocus: (ambientOnlyWhileFocus) => set({ ambientOnlyWhileFocus }),
      setTimerStyle: (timerStyle) => set({ timerStyle }),
      setFocusTracking: (focusTracking) => set({ focusTracking }),
      setMusicVolume: (musicVolume) => set({ musicVolume }),
      setMusicListening: (musicListening) => set({ musicListening }),
      setMusicCover: (musicCover) => set({ musicCover }),
    }),
    {
      name: 'studyroom.prefs',
      version: PREFS_STORAGE_VERSION,
      // Anything stored before a key existed is filled with its default.
      migrate: (stored) => migratePrefs(stored),
    },
  ),
);
