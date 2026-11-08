import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePref = 'system' | 'light' | 'dark';
/** The two modes the toggle can actually land on. */
export type SelectableTheme = Exclude<ThemePref, 'system'>;
export type LangPref = 'en' | 'id';

interface PrefsState {
  theme: ThemePref;
  lang: LangPref;
  soundOn: boolean;
  setTheme: (theme: SelectableTheme) => void;
  setLang: (lang: LangPref) => void;
  toggleLang: () => void;
  toggleSound: () => void;
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      // 'system' means "never chosen yet": the theme follows the OS until the
      // toggle is used, after which it is always an explicit light or dark.
      theme: 'system',
      lang: 'en',
      soundOn: true,
      setTheme: (theme) => set({ theme }),
      setLang: (lang) => set({ lang }),
      toggleLang: () => set((s) => ({ lang: s.lang === 'en' ? 'id' : 'en' })),
      toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),
    }),
    { name: 'studyroom.prefs' },
  ),
);
