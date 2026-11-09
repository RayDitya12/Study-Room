import { useEffect, useRef, type ReactNode } from 'react';
import { focusableWithin } from '../lib/focus';
import { useT } from '../i18n/useT';

export interface DialogProps {
  open: boolean;
  title: string;
  /** Omitted for a decision the user has to answer, like joining a room. */
  onClose?: () => void;
  children: ReactNode;
}

export function Dialog({ open, title, onClose, children }: DialogProps) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Callers pass inline callbacks, so a changing identity must not re-run the
  // focus effect and pull the caret out of whatever is being typed into.
  const dismiss = useRef(onClose);
  dismiss.current = onClose;

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const previous = document.activeElement;
    const items = focusableWithin(panel);
    // An `autoFocus` child has already run by the time this effect does.
    if (!panel.contains(previous)) {
      (items.find((el) => el !== closeRef.current) ?? items[0] ?? panel).focus();
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      // A dialog stacked on top of this one owns the keyboard while it is open.
      if (!panel.contains(document.activeElement)) return;
      if (e.key === 'Escape') {
        dismiss.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusableWithin(panel);
      const first = list[0];
      const last = list[list.length - 1];
      if (!first || !last) {
        e.preventDefault();
        panel.focus();
        return;
      }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-crust/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismiss.current?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="max-h-full w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-surface1 bg-base p-6"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          {onClose ? (
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="shrink-0 rounded-lg p-1 text-subtext0 hover:bg-surface0 hover:text-text"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
