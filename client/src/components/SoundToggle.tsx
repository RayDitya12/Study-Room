import { useT } from '../i18n/useT';
import { usePrefsStore } from '../stores/prefsStore';

export function SoundToggle() {
  const t = useT();
  const soundOn = usePrefsStore((s) => s.soundOn);
  const toggleSound = usePrefsStore((s) => s.toggleSound);
  const label = soundOn ? t('sound.on') : t('sound.off');

  return (
    <button
      type="button"
      onClick={toggleSound}
      title={label}
      aria-label={label}
      aria-pressed={soundOn}
      className="rounded-lg p-2 text-subtext0 hover:bg-surface0 hover:text-text"
    >
      {soundOn ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H2v6h4l5 4V5Z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H2v6h4l5 4V5Z" />
          <path d="m17 9 4 6m0-6-4 6" />
        </svg>
      )}
    </button>
  );
}
