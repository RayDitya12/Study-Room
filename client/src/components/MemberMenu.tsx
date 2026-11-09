import { useEffect, useRef, useState } from 'react';
import type { Member } from '@studyroom/shared';
import { useT } from '../i18n/useT';

const MENU_WIDTH = 208;
const MENU_HEIGHT = 228;

export interface MemberMenuProps {
  member: Member;
  onMakeHost: () => void;
  onToggleModerator: () => void;
  onToggleMute: () => void;
  onKick: () => void;
  onBan: () => void;
}

function Glyph({ d }: { d: string }) {
  return (
    <svg
      aria-hidden="true"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

const ICON = {
  crown: 'M3 8l4.5 3L12 4l4.5 7L21 8l-1.8 9H4.8L3 8z',
  shield: 'M12 3l7 2.6v5.2c0 4.3-2.9 8.1-7 9.5-4.1-1.4-7-5.2-7-9.5V5.6L12 3z',
  micOff: 'M15 9.3V6a3 3 0 00-5.9-.6M9 9.5V11a3 3 0 004.6 2.5M12 18a3 3 0 003-3M5 5l14 14',
  userOut: 'M15 4a3 3 0 11-6 0 3 3 0 016 0zM4 20v-1a5 5 0 015-5h1M17 9l5 5m0-5l-5 5',
  ban: 'M12 3a9 9 0 100 18 9 9 0 000-18zM6.5 17.5l11-11',
} as const;

interface RowProps {
  label: string;
  d: string;
  danger?: boolean;
  onClick: () => void;
}

function Row({ label, d, danger = false, onClick }: RowProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-surface0 ${
        danger ? 'text-red' : 'text-text'
      }`}
    >
      <Glyph d={d} />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function MemberMenu({
  member,
  onMakeHost,
  onToggleModerator,
  onToggleMute,
  onKick,
  onBan,
}: MemberMenuProps) {
  const t = useT();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!pos) return;
    const menu = menuRef.current;
    const items = (): HTMLElement[] =>
      Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const close = (): void => setPos(null);
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        close();
        triggerRef.current?.focus();
        return;
      }
      if (!menu?.contains(document.activeElement)) return;
      const list = items();
      if (list.length === 0) return;
      const active = document.activeElement;
      const index = active instanceof HTMLElement ? list.indexOf(active) : -1;
      if (e.key === 'Home') {
        e.preventDefault();
        list[0]?.focus();
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        list[list.length - 1]?.focus();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const from = index < 0 ? (step === 1 ? -1 : 0) : index;
      list[(from + step + list.length) % list.length]?.focus();
    };
    const onMouseDown = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);
    // The menu is positioned against the trigger, so any scroll makes it stale.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    items()[0]?.focus();
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  const pick = (action: () => void): void => {
    setPos(null);
    // The confirmation dialog remembers this as the element to return focus to.
    triggerRef.current?.focus();
    action();
  };

  const toggle = (): void => {
    if (pos) {
      setPos(null);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    const below = window.innerHeight - rect.bottom;
    const top =
      below >= MENU_HEIGHT + 8 ? rect.bottom + 4 : Math.max(8, rect.top - MENU_HEIGHT - 4);
    setPos({ top, left });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={pos !== null}
        aria-label={t('members.actions')}
        title={t('members.actions')}
        className={`shrink-0 rounded-lg p-1.5 transition-colors hover:bg-surface0 hover:text-text ${
          pos ? 'bg-surface0 text-text' : 'text-subtext0'
        }`}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="12" cy="19" r="1.7" />
        </svg>
      </button>

      {pos ? (
        // Fixed so the popover is not clipped by the scrolling members list.
        <div
          ref={menuRef}
          role="menu"
          aria-label={`${t('members.actions')} · ${member.nickname}`}
          style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
          className="fixed z-50 rounded-xl border border-surface1 bg-base p-1 shadow-lg"
        >
          <Row
            label={t(member.isModerator ? 'members.removeModerator' : 'members.makeModerator')}
            d={ICON.shield}
            onClick={() => pick(onToggleModerator)}
          />
          <Row label={t('members.makeHost')} d={ICON.crown} onClick={() => pick(onMakeHost)} />
          <Row
            label={t(member.isMuted ? 'members.unmute' : 'members.mute')}
            d={ICON.micOff}
            onClick={() => pick(onToggleMute)}
          />
          <div aria-hidden="true" className="my-1 h-px bg-surface0" />
          <Row label={t('members.kick')} d={ICON.userOut} danger onClick={() => pick(onKick)} />
          <Row label={t('members.ban')} d={ICON.ban} danger onClick={() => pick(onBan)} />
        </div>
      ) : null}
    </>
  );
}
