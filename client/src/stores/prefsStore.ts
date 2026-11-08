import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePref = 'system' | 'light' | 'dark';
export type LangPref = 'en' | 'id';

interface PrefsState {
  theme: ThemePref;
  lang: LangPref;
  soundOn: boolean;
  setTheme: (theme: ThemePref) => void;
  cycleTheme: () => void;
  setLang: (lang: LangPref) => void;
  toggleLang: () => void;
  toggleSound: () => void;
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      theme: 'system',
      lang: 'en',
      soundOn: true,
      setTheme: (theme) => set({ theme }),
      cycleTheme: () =>
        set((s) => ({
          theme: s.theme === 'system' ? 'light' : s.theme === 'light' ? 'dark' : 'system',
        })),
      setLang: (lang) => set({ lang }),
      toggleLang: () => set((s) => ({ lang: s.lang === 'en' ? 'id' : 'en' })),
      toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),
    }),
    { name: 'studyroom.prefs' },
  ),
);
