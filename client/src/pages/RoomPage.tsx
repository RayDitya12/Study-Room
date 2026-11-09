import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRemainingMs, KICK_COOLDOWN_MS } from '@studyroom/shared';
import { getRoomMeta, type RoomMeta } from '../lib/api';
import { serverNowEstimate } from '../lib/clock';
import { copyText } from '../lib/clipboard';
import { formatRemaining } from '../lib/format';
import { useAmbient } from '../hooks/useAmbient';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useFocusTracking } from '../hooks/useFocusTracking';
import { useNow } from '../hooks/useNow';
import { useRoomConnection } from '../hooks/useRoomConnection';
import { hasAskedFocusConsent, markFocusConsentAsked } from '../lib/session';
import { usePrefsStore } from '../stores/prefsStore';
import { useRoomStore } from '../stores/roomStore';
import { useToastStore } from '../stores/toastStore';
import { useT } from '../i18n/useT';
import { ChatPanel } from '../components/ChatPanel';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { FocusConsentDialog } from '../components/FocusConsentDialog';
import { FocusSummaryDialog } from '../components/FocusSummaryDialog';
import { JoinDialog } from '../components/JoinDialog';
import { LanguageToggle } from '../components/LanguageToggle';
import { MemberList } from '../components/MemberList';
import { SoundDisplayPopover } from '../components/SoundDisplayPopover';
import { SoundToggle } from '../components/SoundToggle';
import { ThemeToggle } from '../components/ThemeToggle';
import { TimerCard } from '../components/TimerCard';

type Tab = 'timer' | 'members' | 'chat';

const panel = (active: boolean): string =>
  `${active ? 'flex' : 'hidden'} min-h-0 flex-col lg:flex`;

export function RoomPage() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = (rawCode ?? '').toUpperCase();
  const t = useT();
  const pushToast = useToastStore((s) => s.push);

  const [meta, setMeta] = useState<RoomMeta | null>(null);
  const [missing, setMissing] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('timer');
  const [unread, setUnread] = useState(0);

  const { autoJoinPending, actions } = useRoomConnection(code);
  useAmbient();
  useFocusTracking(actions);
  const hasRoom = useRoomStore((s) => s.hasRoom);
  const roomName = useRoomStore((s) => s.name);
  const timer = useRoomStore((s) => s.timer);
  const messages = useRoomStore((s) => s.messages);
  const kicked = useRoomStore((s) => s.kicked);
  const settings = useRoomStore((s) => s.settings);
  const focusTracking = usePrefsStore((s) => s.focusTracking);
  const setFocusTracking = usePrefsStore((s) => s.setFocusTracking);
  const strictFocus = settings?.strictFocus === true;
  const [consentAsked, setConsentAsked] = useState(false);
  useNow(1_000);

  // A strict-focus room asks once per code, on this device. Declining is a
  // complete answer, so the ask never comes back on the next render.
  useEffect(() => {
    if (!strictFocus || focusTracking || consentAsked || !hasRoom) return;
    if (hasAskedFocusConsent(code)) return;
    markFocusConsentAsked(code);
    setConsentAsked(true);
  }, [strictFocus, focusTracking, hasRoom, consentAsked, code]);

  useEffect(() => {
    let cancelled = false;
    getRoomMeta(code)
      .then((result) => {
        if (cancelled) return;
        if (result.exists) setMeta(result);
        else setMissing(true);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const seenCount = useRef(messages.length);
  useEffect(() => {
    if (tab === 'chat') {
      seenCount.current = messages.length;
      setUnread(0);
      return;
    }
    setUnread(Math.max(0, messages.length - seenCount.current));
  }, [messages.length, tab]);

  // Recomputed on every render; the 1s tick from useNow keeps it current.
  const documentTitle =
    hasRoom && timer
      ? `${formatRemaining(getRemainingMs(timer, serverNowEstimate()))} · ${t(
          `timer.${timer.phase}`,
        )} — ${t('app.title')}`
      : null;
  useDocumentTitle(documentTitle);

  const copyLink = async (): Promise<void> => {
    const ok = await copyText(`${window.location.origin}/r/${code}`);
    pushToast(t(ok ? 'toasts.linkCopied' : 'toasts.copyFailed'));
  };

  const submitJoin = async (nickname: string, password?: string): Promise<void> => {
    setJoinBusy(true);
    const result = await actions.join(nickname, password);
    setJoinBusy(false);
    setJoinError(
      result.ok
        ? null
        : result.error === 'WRONG_PASSWORD'
          ? t('join.wrongPassword')
          : t(`errors.${result.error}`),
    );
  };

  if (missing) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-xl font-semibold">{t('notFound.title')}</h1>
        <p className="text-sm text-subtext0">{t('notFound.description')}</p>
        <Link to="/" className="rounded-xl bg-surface0 px-4 py-2 text-sm text-text hover:bg-surface1">
          {t('notFound.back')}
        </Link>
      </div>
    );
  }

  if (kicked) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-xl font-semibold">{t('kicked.title')}</h1>
        <p className="max-w-md text-sm text-subtext0">
          {kicked === 'ban'
            ? t('kicked.ban')
            : t('kicked.kick', { minutes: Math.round(KICK_COOLDOWN_MS / 60_000) })}
        </p>
        <Link
          to="/"
          className="rounded-xl bg-surface0 px-4 py-2 text-sm text-text hover:bg-surface1"
        >
          {t('kicked.back')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-surface0 px-4 py-3">
        <Link
          to="/"
          aria-label={t('common.back')}
          className="rounded-lg p-1.5 text-subtext0 hover:bg-surface0 hover:text-text"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-text">{roomName || t('app.title')}</h1>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs tracking-widest text-subtext0">{code}</span>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="rounded-md px-1.5 py-0.5 text-xs text-mauve hover:bg-surface0"
            >
              {t('room.copyLink')}
            </button>
            {strictFocus ? (
              <span
                title={t('focus.badgeHint')}
                className="rounded-full bg-teal/15 px-2 py-0.5 text-xs font-medium text-teal"
              >
                {t('focus.badge')}
              </span>
            ) : null}
          </div>
        </div>
        <LanguageToggle />
        <SoundDisplayPopover />
        <SoundToggle />
        <ThemeToggle />
      </header>

      <ConnectionBanner />

      <main className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:grid lg:grid-cols-[280px_minmax(0,1fr)_360px]">
        <div className={panel(tab === 'members')}>
          <div className="min-h-0 flex-1 rounded-2xl bg-mantle p-3">
            <MemberList actions={actions} />
          </div>
        </div>

        <div className={panel(tab === 'timer')}>
          <div className="min-h-0 flex-1">
            <TimerCard
              onTimerAction={actions.timerAction}
              onUpdateSettings={actions.updateSettings}
            />
          </div>
        </div>

        <div className={panel(tab === 'chat')}>
          <div className="min-h-0 flex-1">
            <ChatPanel
              onSend={actions.sendChat}
              onTyping={actions.sendTyping}
            />
          </div>
        </div>
      </main>

      <nav
        aria-label={t('app.title')}
        className="grid grid-cols-3 border-t border-surface0 bg-base lg:hidden"
      >
        {(
          [
            ['timer', t('room.timerTab')],
            ['members', t('room.membersTab')],
            ['chat', t('room.chatTab')],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-current={tab === value}
            className={`relative py-3 text-xs font-medium ${
              tab === value ? 'text-mauve' : 'text-subtext0'
            }`}
          >
            {label}
            {value === 'chat' && unread > 0 ? (
              <span className="absolute right-1/4 top-2 h-2 w-2 rounded-full bg-red" />
            ) : null}
          </button>
        ))}
      </nav>

      <JoinDialog
        open={Boolean(meta) && !hasRoom && !autoJoinPending}
        roomName={meta?.name ?? code}
        hasPassword={Boolean(meta?.hasPassword)}
        error={joinError}
        busy={joinBusy}
        onSubmit={(nickname, password) => void submitJoin(nickname, password)}
      />

      <FocusConsentDialog
        open={consentAsked && !focusTracking}
        onEnable={() => {
          setFocusTracking(true);
          setConsentAsked(false);
        }}
        onDecline={() => setConsentAsked(false)}
      />

      <FocusSummaryDialog />
    </div>
  );
}
