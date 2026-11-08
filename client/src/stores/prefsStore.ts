import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_PRESET_ID, type PresetId } from '../lib/soundPresets';

export type ThemePref = 'system' | 'light' | 'dark';
/** The two modes the toggle can actually land on. */
export type SelectableTheme = Exclude<ThemePref, 'system'>;
export type LangPref = 'en' | 'id';

interface PrefsState {
  theme: ThemePref;
  lang: LangPref;
  soundOn: boolean;
  soundPreset: PresetId;
  setTheme: (theme: SelectableTheme) => void;
  setLang: (lang: LangPref) => void;
  toggleLang: () => void;
  toggleSound: () => void;
  setSoundPreset: (id: PresetId) => void;
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      // 'system' means "never chosen yet": the theme follows the OS until the
      // toggle is used, after which it is always an explicit light or dark.
      theme: 'system',
      lang: 'en',
      soundOn: true,
      soundPreset: DEFAULT_PRESET_ID,
      setTheme: (theme) => set({ theme }),
      setLang: (lang) => set({ lang }),
      toggleLang: () => set((s) => ({ lang: s.lang === 'en' ? 'id' : 'en' })),
      toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),
      setSoundPreset: (soundPreset) => set({ soundPreset }),
    }),
    { name: 'studyroom.prefs' },
  ),
);
