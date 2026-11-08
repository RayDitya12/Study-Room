import { useT } from '../i18n/useT';
import { usePrefsStore } from '../stores/prefsStore';

export function ThemeToggle() {
  const t = useT();
  const theme = usePrefsStore((s) => s.theme);
  const cycleTheme = usePrefsStore((s) => s.cycleTheme);
  const label =
    theme === 'light' ? t('theme.light') : theme === 'dark' ? t('theme.dark') : t('theme.system');

  return (
    <button
      type="button"
      onClick={cycleTheme}
      title={`${t('theme.label')}: ${label}`}
      aria-label={`${t('theme.label')}: ${label}`}
      className="rounded-lg p-2 text-subtext0 hover:bg-surface0 hover:text-text"
    >
      {theme === 'light' && (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
        </svg>
      )}
      {theme === 'dark' && (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
      {theme === 'system' && (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8m-4-4v4" />
        </svg>
      )}
    </button>
  );
}
