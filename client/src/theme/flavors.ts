import type { ThemePref } from '../stores/prefsStore';

export const DARK_FLAVOR = 'mocha';
export const LIGHT_FLAVOR = 'latte';

export type Flavor = typeof DARK_FLAVOR | typeof LIGHT_FLAVOR;

export function resolveFlavor(theme: ThemePref, systemPrefersDark: boolean): Flavor {
  if (theme === 'dark') return DARK_FLAVOR;
  if (theme === 'light') return LIGHT_FLAVOR;
  return systemPrefersDark ? DARK_FLAVOR : LIGHT_FLAVOR;
}
