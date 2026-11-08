import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { id } from '../i18n/id';
import { makeTranslator } from '../i18n/index';

type Dict = Record<string, unknown>;

function flatten(dict: Dict, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      out[path] = value;
    } else if (value && typeof value === 'object') {
      Object.assign(out, flatten(value as Dict, path));
    }
  }
  return out;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();
}

describe('i18n parity', () => {
  const flatEn = flatten(en as unknown as Dict);
  const flatId = flatten(id as unknown as Dict);

  it('id has every key of en', () => {
    const missing = Object.keys(flatEn).filter((k) => !(k in flatId));
    expect(missing).toEqual([]);
  });

  it('en has every key of id (no extras)', () => {
    const extra = Object.keys(flatId).filter((k) => !(k in flatEn));
    expect(extra).toEqual([]);
  });

  it('placeholders match on every key', () => {
    const mismatches: string[] = [];
    for (const [key, value] of Object.entries(flatEn)) {
      const other = flatId[key];
      if (other !== undefined && placeholders(value).join() !== placeholders(other).join()) {
        mismatches.push(key);
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('makeTranslator', () => {
  it('translates dot paths in both languages', () => {
    expect(makeTranslator('en')('timer.start')).toBe('Start');
    expect(makeTranslator('id')('timer.start')).toBe('Mulai');
  });

  it('interpolates {params}', () => {
    const t = makeTranslator('en');
    expect(t('chat.joined', { name: 'Anna' })).toBe('Anna joined');
    expect(t('chat.typingTwo', { a: 'Anna', b: 'Budi' })).toBe('Anna and Budi are typing…');
  });

  it('keeps unknown params as-is', () => {
    expect(makeTranslator('en')('chat.joined')).toBe('{name} joined');
  });
});
