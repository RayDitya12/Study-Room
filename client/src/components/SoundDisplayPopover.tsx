import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/useT';
import { usePrefsStore, type TimerStylePref } from '../stores/prefsStore';

const PANEL_WIDTH = 232;
const PANEL_HEIGHT = 96;
const SMALL_SCREEN = '(max-width: 639.98px)';

const TIMER_STYLES: TimerStylePref[] = ['ring', 'minimal'];

/** Anchored under the header button on desktop, a bottom sheet on small screens. */
type Anchor = { top: number; left: number } | 'sheet';

export function SoundDisplayPopover() {
  const t = useT();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
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
    const top =
      below >= PANEL_HEIGHT + 8 ? rect.bottom + 4 : Math.max(8, rect.top - PANEL_HEIGHT - 4);
    setAnchor({ top, left });
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
          open ? 'bg-surface0 text-text' : 'text-subtext0'
        }`}
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
          style={anchor === 'sheet' ? undefined : { top: anchor.top, left: anchor.left, width: PANEL_WIDTH }}
          className={`fixed z-50 rounded-xl border border-surface1 bg-base p-3 shadow-lg ${
            anchor === 'sheet' ? 'inset-x-3 bottom-3' : ''
          }`}
        >
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
                    timerStyle === style
                      ? 'bg-mauve/20 text-mauve'
                      : 'text-subtext0 hover:text-text'
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
