import { en, type Messages, type TranslationKey } from './en';
import { id } from './id';

export type Lang = 'en' | 'id';

export { en, id };
export type { Messages, TranslationKey };

export type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function makeTranslator(lang: Lang): Translate {
  const dictionary: Record<string, unknown> = lang === 'id' ? id : en;
  return (key, params) => {
    let value: unknown = dictionary;
    for (const part of String(key).split('.')) {
      value = (value as Record<string, unknown> | undefined)?.[part];
    }
    if (typeof value !== 'string') return String(key);
    return value.replace(/\{(\w+)\}/g, (match, name: string) =>
      params && name in params ? String(params[name]) : match,
    );
  };
}
