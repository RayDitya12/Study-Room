import { useEffect, useState } from 'react';
import { useT } from '../i18n/useT';
import { usePrefsStore } from '../stores/prefsStore';
import { DARK_FLAVOR, resolveFlavor } from '../theme/flavors';

export function ThemeToggle() {
  const t = useT();
  const theme = usePrefsStore((s) => s.theme);
  const setTheme = usePrefsStore((s) => s.setTheme);
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // 'system' is only the first-run default; the first click pins it to light or dark.
  const isDark = resolveFlavor(theme, prefersDark) === DARK_FLAVOR;
  const label = isDark ? t('theme.dark') : t('theme.light');

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={`${t('theme.label')}: ${label}`}
      aria-label={`${t('theme.label')}: ${label}`}
      className="rounded-lg p-2 text-subtext0 hover:bg-surface0 hover:text-text"
    >
      {isDark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
        </svg>
      )}
    </button>
  );
}
