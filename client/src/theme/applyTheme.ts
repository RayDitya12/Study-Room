import { usePrefsStore } from '../stores/prefsStore';
import { resolveFlavor } from './flavors';

/**
 * Keeps `data-theme` / `color-scheme` on <html> in sync with the theme pref
 * and the OS setting. Call once at startup (the inline script in index.html
 * already applied the theme before first paint; this keeps it reactive).
 */
export function initTheme(): void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    const flavor = resolveFlavor(usePrefsStore.getState().theme, media.matches);
    document.documentElement.dataset.theme = flavor;
    document.documentElement.style.colorScheme = flavor;
  };
  usePrefsStore.subscribe(apply);
  media.addEventListener('change', apply);
  apply();
}
