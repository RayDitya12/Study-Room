import { useT } from '../i18n/useT';
import { usePrefsStore } from '../stores/prefsStore';

export function LanguageToggle() {
  const t = useT();
  const lang = usePrefsStore((s) => s.lang);
  const toggleLang = usePrefsStore((s) => s.toggleLang);

  const label = t('language.label', { lang: lang === 'en' ? 'EN' : 'ID' });

  return (
    <button
      type="button"
      onClick={toggleLang}
      title={label}
      aria-label={label}
      className="rounded-lg px-2 py-1.5 text-xs font-semibold text-muted hover:bg-surface0 hover:text-text"
    >
      {lang === 'en' ? 'EN' : 'ID'}
    </button>
  );
}
