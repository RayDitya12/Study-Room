import { useMemo } from 'react';
import { usePrefsStore } from '../stores/prefsStore';
import { makeTranslator, type Translate } from './index';

/** Returns `t(key, params?)` bound to the current language. */
export function useT(): Translate {
  const lang = usePrefsStore((s) => s.lang);
  return useMemo(() => makeTranslator(lang), [lang]);
}
