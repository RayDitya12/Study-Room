import { Link } from 'react-router-dom';
import { useT } from '../i18n/useT';

export function NotFound() {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-bold">{t('notFound.title')}</h1>
      <p className="text-sm text-subtext0">{t('notFound.description')}</p>
      <Link
        to="/"
        className="mt-2 rounded-xl bg-surface0 px-4 py-2 text-sm text-text hover:bg-surface1"
      >
        {t('notFound.back')}
      </Link>
    </div>
  );
}
