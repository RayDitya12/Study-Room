import { useEffect } from 'react';

/** Anything that would take the space bar for itself: typing, or a control
 *  that already activates on space. */
const SELF_HELD =
  'input, textarea, select, [contenteditable], button, a[href], [role="button"], [role="switch"], [role="checkbox"], [role="option"]';

export interface RoomHotkeyHandlers {
  /** Ctrl or Cmd + K. */
  onPalette: () => void;
  /** Space. Null when this person may not touch the timer. */
  onToggleTimer: (() => void) | null;
}

/**
 * The two shortcuts the room offers. Neither is announced anywhere except the
 * palette's own hint line, so taking the space bar is only safe when nothing
 * else could have wanted it — which is what these checks are for.
 */
export function useRoomHotkeys({ onPalette, onToggleTimer }: RoomHotkeyHandlers): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onPalette();
        return;
      }
      if (e.key !== ' ' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (!onToggleTimer) return;
      const target = e.target;
      if (target instanceof HTMLElement && target.closest(SELF_HELD)) return;
      // A dialog owns the screen while it is open, including its own space bar.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      e.preventDefault();
      onToggleTimer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onPalette, onToggleTimer]);
}
