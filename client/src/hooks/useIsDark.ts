import { useEffect, useState } from 'react';
import { usePrefsStore } from '../stores/prefsStore';
import { DARK_FLAVOR, resolveFlavor } from '../theme/flavors';

/**
 * Which flavour this device is showing. A theme of 'system' follows the OS, so
 * the OS setting is watched rather than read once — otherwise the icon and the
 * command list would keep offering the theme you are already in.
 */
export function useIsDark(): boolean {
  const theme = usePrefsStore((s) => s.theme);
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent): void => setPrefersDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return resolveFlavor(theme, prefersDark) === DARK_FLAVOR;
}
