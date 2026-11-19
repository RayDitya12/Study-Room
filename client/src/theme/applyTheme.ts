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
    // Read from the palette rather than repeating it: browser chrome follows
    // the app, and the value cannot drift from the CSS.
    const base = getComputedStyle(document.documentElement).getPropertyValue('--ctp-base').trim();
    const accent = document.querySelector('meta[name="theme-color"]');
    if (accent && base) accent.setAttribute('content', base);
  };
  usePrefsStore.subscribe(apply);
  media.addEventListener('change', apply);
  apply();
}
