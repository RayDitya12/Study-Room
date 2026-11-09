import { useEffect, useRef, useState } from 'react';
import { ALERT_SOUNDS, previewAlert } from '../lib/alertSounds';
import type { AmbientPref } from '../stores/prefsStore';
import { usePrefsStore, type TimerStylePref } from '../stores/prefsStore';
import { useT } from '../i18n/useT';

const PANEL_WIDTH = 244;
/** The three groups are taller than this, so the panel scrolls inside. */
const PANEL_HEIGHT = 420;
const SMALL_SCREEN = '(max-width: 639.98px)';

const TIMER_STYLES: TimerStylePref[] = ['ring', 'minimal'];
const AMBIENT_TYPES: AmbientPref[] = ['off', 'white', 'pink', 'brown', 'rain', 'waves'];

/** Anchored under the header button on desktop, a bottom sheet on small screens. */
type Anchor = { top: number; left: number; maxHeight: number } | 'sheet';

export function SoundDisplayPopover() {
  const t = useT();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const alertSound = usePrefsStore((s) => s.alertSound);
  const setAlertSound = usePrefsStore((s) => s.setAlertSound);
  const alertVolume = usePrefsStore((s) => s.alertVolume);
  const setAlertVolume = usePrefsStore((s) => s.setAlertVolume);
  const soundOn = usePrefsStore((s) => s.soundOn);
  const toggleSound = usePrefsStore((s) => s.toggleSound);
  const ambientType = usePrefsStore((s) => s.ambientType);
  const setAmbientType = usePrefsStore((s) => s.setAmbientType);
  const ambientVolume = usePrefsStore((s) => s.ambientVolume);
  const setAmbientVolume = usePrefsStore((s) => s.setAmbientVolume);
  const ambientOnlyWhileFocus = usePrefsStore((s) => s.ambientOnlyWhileFocus);
  const setAmbientOnlyWhileFocus = usePrefsStore((s) => s.setAmbientOnlyWhileFocus);
  const timerStyle = usePrefsStore((s) => s.timerStyle);
  const setTimerStyle = usePrefsStore((s) => s.setTimerStyle);

  useEffect(() => {
    if (!anchor) return;
    const close = (): void => setAnchor(null);
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    const onMouseDown = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [anchor]);

  const toggle = (): void => {
    if (anchor) {
      setAnchor(null);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (window.matchMedia(SMALL_SCREEN).matches) {
      setAnchor('sheet');
      return;
    }
    const left = Math.max(8, Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8));
    const below = window.innerHeight - rect.bottom;
    const underneath = below >= PANEL_HEIGHT + 8;
    setAnchor({
      top: underneath ? rect.bottom + 4 : Math.max(8, rect.top - PANEL_HEIGHT - 4),
      left,
      maxHeight: Math.max(160, (underneath ? below : rect.top) - 16),
    });
  };

  const pick = (id: (typeof ALERT_SOUNDS)[number]['id']): void => {
    setAlertSound(id);
    previewAlert(id, alertVolume);
  };

  const open = anchor !== null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t('display.title')}
        aria-label={t('display.title')}
        className={`rounded-lg p-2 transition-colors hover:bg-surface0 hover:text-text ${
          ambientType !== 'off' ? 'text-mauve' : 'text-subtext0'
        } ${open ? 'bg-surface0' : ''}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 15h8" />
        </svg>
      </button>

      {anchor ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t('display.title')}
          style={
            anchor === 'sheet'
              ? { maxHeight: '65dvh' }
              : { top: anchor.top, left: anchor.left, width: PANEL_WIDTH, maxHeight: anchor.maxHeight }
          }
          className={`fixed z-50 space-y-4 overflow-y-auto rounded-xl border border-surface1 bg-base p-3 shadow-lg ${
            anchor === 'sheet' ? 'inset-x-3 bottom-3' : ''
          }`}
        >
          <fieldset className="space-y-2">
            <legend className="text-sm text-subtext0">{t('display.alerts')}</legend>
            <p className="text-xs text-subtext0">{t('display.alertHint')}</p>
            <div className="space-y-0.5">
              {ALERT_SOUNDS.map((sound) => (
                <div key={sound.id} className="flex items-center gap-1">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 text-sm">
                    <input
                      type="radio"
                      name="alert-sound"
                      checked={alertSound === sound.id}
                      onChange={() => pick(sound.id)}
                      className="accent-mauve"
                    />
                    <span className={alertSound === sound.id ? 'text-text' : 'text-subtext0'}>
                      {t(`display.sounds.${sound.id}`)}
                    </span>
                  </label>
                  {sound.wave ? (
                    <button
                      type="button"
                      onClick={() => previewAlert(sound.id, alertVolume)}
                      title={t('display.preview')}
                      aria-label={`${t('display.preview')} · ${t(`display.sounds.${sound.id}`)}`}
                      className="shrink-0 rounded-lg p-1.5 text-subtext0 hover:bg-surface0 hover:text-text"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <label className="block space-y-1">
              <span className="flex items-center justify-between text-sm text-subtext0">
                <span>{t('display.alertVolume')}</span>
                <span className="tabular-nums text-xs text-text">{alertVolume}</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={alertVolume}
                onChange={(e) => setAlertVolume(Number(e.currentTarget.value))}
                aria-label={t('display.alertVolume')}
                className="w-full accent-mauve"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-subtext0">{t('display.playAlerts')}</span>
              <input
                type="checkbox"
                role="switch"
                checked={soundOn}
                onChange={toggleSound}
                className="h-5 w-5 accent-mauve"
              />
            </label>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm text-subtext0">{t('display.ambient')}</legend>
            <p className="text-xs text-subtext0">{t('display.ambientHint')}</p>
            <div className="space-y-0.5">
              {AMBIENT_TYPES.map((value) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2 py-1 text-sm"
                >
                  <input
                    type="radio"
                    name="ambient-type"
                    checked={ambientType === value}
                    onChange={() => setAmbientType(value)}
                    className="accent-mauve"
                  />
                  <span className={ambientType === value ? 'text-text' : 'text-subtext0'}>
                    {t(`display.ambientTypes.${value}`)}
                  </span>
                </label>
              ))}
            </div>

            <label className="block space-y-1">
              <span className="flex items-center justify-between text-sm text-subtext0">
                <span>{t('display.ambientVolume')}</span>
                <span className="tabular-nums text-xs text-text">{ambientVolume}</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={ambientVolume}
                onChange={(e) => setAmbientVolume(Number(e.currentTarget.value))}
                aria-label={t('display.ambientVolume')}
                className="w-full accent-mauve"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-subtext0">{t('display.ambientFocusOnly')}</span>
              <input
                type="checkbox"
                role="switch"
                checked={ambientOnlyWhileFocus}
                onChange={(e) => setAmbientOnlyWhileFocus(e.currentTarget.checked)}
                className="h-5 w-5 accent-mauve"
              />
            </label>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="text-sm text-subtext0">{t('display.timerStyle')}</legend>
            <div className="flex gap-1 rounded-xl bg-mantle p-1">
              {TIMER_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  aria-pressed={timerStyle === style}
                  onClick={() => setTimerStyle(style)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    timerStyle === style ? 'bg-mauve/20 text-mauve' : 'text-subtext0 hover:text-text'
                  }`}
                >
                  {t(style === 'ring' ? 'display.ring' : 'display.minimal')}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}
    </>
  );
}
