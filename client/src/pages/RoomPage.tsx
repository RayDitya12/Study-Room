import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getRemainingMs, KICK_COOLDOWN_MS } from '@studyroom/shared';
import { getRoomMeta, type RoomMeta } from '../lib/api';
import { buildCommands, type CommandId } from '../lib/commands';
import { serverNowEstimate } from '../lib/clock';
import { copyText } from '../lib/clipboard';
import { formatRemaining } from '../lib/format';
import { canControlTimer } from '../lib/permissions';
import { useAmbient } from '../hooks/useAmbient';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useFocusTracking } from '../hooks/useFocusTracking';
import { useIsDark } from '../hooks/useIsDark';
import { useNow } from '../hooks/useNow';
import { usePhaseNotifications } from '../hooks/usePhaseNotifications';
import { useRoomConnection } from '../hooks/useRoomConnection';
import { useRoomHotkeys } from '../hooks/useRoomHotkeys';
import { useServerWake } from '../hooks/useServerWake';
import { forgetRoom, rememberRoom } from '../lib/recentRooms';
import { hasAskedFocusConsent, markFocusConsentAsked } from '../lib/session';
import { usePrefsStore } from '../stores/prefsStore';
import { useRoomStore } from '../stores/roomStore';
import { useToastStore } from '../stores/toastStore';
import { useT } from '../i18n/useT';
import { ChatPanel } from '../components/ChatPanel';
import { CommandPalette } from '../components/CommandPalette';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { FocusConsentDialog } from '../components/FocusConsentDialog';
import { FocusSummaryDialog } from '../components/FocusSummaryDialog';
import { JoinDialog } from '../components/JoinDialog';
import { LanguageToggle } from '../components/LanguageToggle';
import { MemberList } from '../components/MemberList';
import { MusicCard, useMediaControl } from '../components/MusicCard';
import { PresenceStrip } from '../components/PresenceStrip';
import { SoundDisplayPopover } from '../components/SoundDisplayPopover';
import { ThemeToggle } from '../components/ThemeToggle';
import { TimerCard } from '../components/TimerCard';

type Tab = 'timer' | 'members' | 'chat' | 'music';

const panel = (active: boolean): string =>
  `${active ? 'flex' : 'hidden'} min-h-0 flex-col lg:flex`;

/**
 * The middle column scrolls, so its cards are content-sized. A `flex-1` card in
 * a scrollable column gets squeezed to the viewport height, overflows it by a
 * few pixels, and leaves behind a scrollbar with almost nothing to move.
 */
const cardPanel = (active: boolean): string =>
  `${active ? 'flex' : 'hidden'} shrink-0 flex-col lg:flex`;

export function RoomPage() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = (rawCode ?? '').toUpperCase();
  const t = useT();
  const pushToast = useToastStore((s) => s.push);

  const [meta, setMeta] = useState<RoomMeta | null>(null);
  const [missing, setMissing] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('timer');
  const [unread, setUnread] = useState(0);

  const { autoJoinPending, actions } = useRoomConnection(code);
  const { waking, healthyAt } = useServerWake();
  useAmbient();
  useFocusTracking(actions);
  usePhaseNotifications();
  const hasRoom = useRoomStore((s) => s.hasRoom);
  const roomCode = useRoomStore((s) => s.code);
  const roomName = useRoomStore((s) => s.name);
  const timer = useRoomStore((s) => s.timer);
  const messages = useRoomStore((s) => s.messages);
  const members = useRoomStore((s) => s.members);
  const kicked = useRoomStore((s) => s.kicked);
  const settings = useRoomStore((s) => s.settings);
  const focusTracking = usePrefsStore((s) => s.focusTracking);
  const setFocusTracking = usePrefsStore((s) => s.setFocusTracking);
  const musicListening = usePrefsStore((s) => s.musicListening);
  const media = useRoomStore((s) => s.media);
  const canControlMedia = useMediaControl();
  const hasMedia = (media?.videoId ?? null) !== null;
  const showMusic = canControlMedia || hasMedia;
  // An embed that is making sound may not be hidden, so the card stays on
  // screen while the room is playing and this device is listening.
  const musicHeard = media?.status === 'playing' && musicListening;
  const strictFocus = settings?.strictFocus === true;
  const onlineCount = members.filter((m) => m.online).length;
  // The store keeps the room you were in until this one's first snapshot lands,
  // so "in a room" only means something as "in *this* room".
  const inThisRoom = hasRoom && roomCode === code;
  const [consentAsked, setConsentAsked] = useState(false);
  useNow(1_000);

  // The command list, the space bar and the gear all ask the same question, so
  // it is answered once here rather than three times where it happens to be
  // needed.
  const isHost = useRoomStore((s) => s.youUserId === s.hostUserId);
  const isModerator = useRoomStore(
    (s) => s.members.find((m) => m.userId === s.youUserId)?.isModerator === true,
  );
  const mayControlTimer = canControlTimer(
    { isHost, isModerator },
    settings?.timerControl ?? 'host',
  );
  const lang = usePrefsStore((s) => s.lang);
  const toggleLang = usePrefsStore((s) => s.toggleLang);
  const soundOn = usePrefsStore((s) => s.soundOn);
  const toggleSound = usePrefsStore((s) => s.toggleSound);
  const setTheme = usePrefsStore((s) => s.setTheme);
  const isDark = useIsDark();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const togglePalette = useCallback((): void => setPaletteOpen((open) => !open), []);
  // Read at the moment the key is pressed, so the listener can stay put and the
  // timer cannot be toggled to whatever status the last render saw.
  const toggleTimer = useCallback((): void => {
    const running = useRoomStore.getState().timer?.status === 'running';
    void actions.timerAction(running ? 'pause' : 'start');
  }, [actions]);

  useRoomHotkeys({
    onPalette: togglePalette,
    onToggleTimer: mayControlTimer ? toggleTimer : null,
  });

  const commands = buildCommands(t, {
    inRoom: inThisRoom,
    canControlTimer: mayControlTimer,
    isHost,
    hasMusic: showMusic,
    hasMedia,
    canControlMusic: canControlMedia,
    timerRunning: timer?.status === 'running',
    musicPlaying: media?.status === 'playing',
    soundOn,
    isDark,
    isEnglish: lang === 'en',
  });

  const runCommand = (id: CommandId): void => {
    switch (id) {
      case 'timer.toggle':
        toggleTimer();
        return;
      case 'timer.reset':
        void actions.timerAction('reset');
        return;
      case 'timer.skip':
        void actions.timerAction('skip');
        return;
      case 'room.copyLink':
        void copyLink();
        return;
      case 'room.settings':
        setTab('timer');
        setSettingsOpen(true);
        return;
      case 'room.leave':
        actions.leave();
        navigate('/');
        return;
      case 'tab.timer':
        setTab('timer');
        return;
      case 'tab.members':
        setTab('members');
        return;
      case 'tab.chat':
        setTab('chat');
        return;
      case 'tab.music':
        setTab('music');
        return;
      case 'status.focusing':
        void actions.updateMember({ status: 'focusing' });
        return;
      case 'status.break':
        void actions.updateMember({ status: 'break' });
        return;
      case 'status.away':
        void actions.updateMember({ status: 'away' });
        return;
      case 'view.theme':
        setTheme(isDark ? 'light' : 'dark');
        return;
      case 'view.language':
        toggleLang();
        return;
      case 'view.sound':
        toggleSound();
        return;
      case 'media.toggle':
        void actions.mediaAction(media?.status === 'playing' ? 'pause' : 'play');
        return;
    }
  };

  // A strict-focus room asks once per code, on this device. Declining is a
  // complete answer, so the ask never comes back on the next render.
  useEffect(() => {
    if (!strictFocus || focusTracking || consentAsked || !hasRoom) return;
    if (hasAskedFocusConsent(code)) return;
    markFocusConsentAsked(code);
    setConsentAsked(true);
  }, [strictFocus, focusTracking, hasRoom, consentAsked, code]);

  // A new code is a different question, so the old answer cannot survive it:
  // React keeps this component mounted when only the param changes, and one
  // dead link used to leave every room opened after it reading "not found".
  // Done while rendering rather than in an effect, because an effect paints the
  // stale screen for a frame before correcting itself.
  const [askedCode, setAskedCode] = useState(code);
  if (askedCode !== code) {
    setAskedCode(code);
    setMeta(null);
    setMissing(false);
    setUnreachable(false);
    setJoinError(null);
  }

  useEffect(() => {
    let cancelled = false;
    getRoomMeta(code)
      .then((result) => {
        if (cancelled) return;
        setUnreachable(false);
        if (result.exists) {
          setMeta(result);
          return;
        }
        // The room really is gone, so it should stop offering itself at home.
        forgetRoom(code);
        setMissing(true);
      })
      .catch(() => {
        // A host that is still asleep is not a room that has been deleted, and
        // saying so is the difference between waiting and giving up.
        if (!cancelled) setUnreachable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code, healthyAt]);

  // The home page offers back what you actually use, so it is recorded here,
  // where the name has arrived from the room rather than from a form.
  useEffect(() => {
    if (!inThisRoom || !roomName) return;
    rememberRoom({ code, name: roomName }, Date.now());
  }, [inThisRoom, roomName, code]);

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
        <p className="text-sm text-muted">{t('notFound.description')}</p>
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
        <p className="max-w-md text-sm text-muted">
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
    <div data-phase={timer?.phase ?? 'focus'} className="flex h-dvh flex-col">
      <header className="phase-rule flex items-center gap-2 px-2 py-2 sm:gap-3 sm:px-4">
        <Link
          to="/"
          aria-label={t('common.back')}
          className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface0 hover:text-text"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-text" title={roomName || undefined}>
            {roomName || t('app.title')}
          </h1>
          <div className="flex min-w-0 items-center gap-x-2 text-xs">
            <span className="shrink-0 font-mono tracking-wider text-muted">{code}</span>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="shrink-0 whitespace-nowrap rounded-md px-1 py-0.5 text-accent-text hover:bg-surface0"
            >
              {t('room.copyLink')}
            </button>
            {strictFocus ? (
              <span
                title={t('focus.badgeHint')}
                className="min-w-0 truncate rounded-full bg-focus-soft px-2 py-0.5 font-medium text-focus-text"
              >
                {t('focus.badge')}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 rounded-xl bg-mantle p-0.5">
          <LanguageToggle />
          <SoundDisplayPopover />
          <ThemeToggle />
        </div>
      </header>

      <ConnectionBanner />

      {!inThisRoom && (waking || unreachable) ? (
        <p
          role="status"
          className="border-b border-surface0 bg-mantle px-4 py-2 text-center text-xs text-muted"
        >
          {t('server.waking')}
        </p>
      ) : null}

      <main className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:mx-auto lg:grid lg:w-full lg:max-w-[1536px] lg:grid-cols-[280px_minmax(0,1fr)_360px]">
        <div className={panel(tab === 'members')}>
          <div className="min-h-0 flex-1">
            <MemberList actions={actions} onCopyLink={() => void copyLink()} />
          </div>
        </div>

        {/* The timer is the room's main object, so it gets the whole middle
            column instead of a narrow card floating in the leftovers. The
            column still scrolls, and the card grows into the height the music
            leaves, so the empty space stays inside the timer rather than
            falling under the stack as a strip of bare page. */}
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <div className={`${cardPanel(tab === 'timer')} lg:grow`}>
            <TimerCard
              onTimerAction={actions.timerAction}
              onUpdateSettings={actions.updateSettings}
              settingsOpen={settingsOpen}
              onSettingsOpenChange={setSettingsOpen}
            />
          </div>

          {tab === 'timer' ? (
            <div className="flex flex-col lg:hidden">
              <PresenceStrip onUpdate={actions.updateMember} />
            </div>
          ) : null}

          {showMusic ? (
            <div className={cardPanel(tab === 'music' || musicHeard)}>
              <MusicCard
                onSetMedia={actions.setMedia}
                onMediaAction={actions.mediaAction}
                onSeek={actions.seekMedia}
                onSetLoop={actions.setMediaLoop}
              />
            </div>
          ) : null}
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
        aria-label={t('room.sections')}
        className="grid grid-cols-4 border-t border-surface0 bg-base [padding-bottom:max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        {(
          [
            ['timer', t('room.timerTab'), 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'],
            ['members', t('room.membersTab'), 'M16 20v-1a4 4 0 0 0-8 0v1M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1a3 3 0 0 0-2-2.8M4 20v-1a3 3 0 0 1 2-2.8'],
            ['chat', t('room.chatTab'), 'M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z'],
            ['music', t('room.musicTab'), 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
          ] as [Tab, string, string][]
        ).map(([value, label, path]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-current={tab === value}
            className={`flex flex-col items-center gap-1 py-2 text-[11px] font-medium ${
              tab === value ? 'text-accent-text' : 'text-muted'
            }`}
          >
            <span className="relative">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={path} />
              </svg>
              {value === 'members' && hasRoom ? (
                <span className="absolute -right-2.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-mauve px-1 text-[10px] font-semibold text-base">
                  {onlineCount}
                  <span className="sr-only">{t('members.onlineCount', { count: onlineCount })}</span>
                </span>
              ) : null}
              {value === 'chat' && unread > 0 ? (
                <span className="absolute -right-2.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-mauve px-1 text-[10px] font-semibold text-base">
                  {unread > 9 ? '9+' : unread}
                  <span className="sr-only">{t('chat.unreadCount', { count: unread })}</span>
                </span>
              ) : null}
              {value === 'music' && showMusic && musicHeard && tab !== 'music' ? (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-teal ring-2 ring-base">
                  <span className="sr-only">{t('music.playingNow')}</span>
                </span>
              ) : null}
            </span>
            {label}
          </button>
        ))}
      </nav>

      <CommandPalette
        open={paletteOpen}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
        onRun={runCommand}
      />

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
