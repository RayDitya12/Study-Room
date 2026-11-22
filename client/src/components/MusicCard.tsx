import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { MEDIA } from '@studyroom/shared';
import { formatRemaining, formatTrack } from '../lib/format';
import { useNow } from '../hooks/useNow';
import { useMediaSync } from '../hooks/useMediaSync';
import type { MediaAction } from '../hooks/useRoomConnection';
import { usePrefsStore } from '../stores/prefsStore';
import { useRoomStore } from '../stores/roomStore';
import { useT } from '../i18n/useT';

export interface MusicCardProps {
  onMediaAction: (action: MediaAction) => Promise<void>;
  onSeek: (positionMs: number) => Promise<void>;
  onSetLoop: (loop: boolean) => Promise<void>;
  /** Tells the room this video finished here, so the next request can start. */
  onTrackEnded: (videoId: string) => void;
}

/** Host or moderator — the same rule the server applies to every media event. */
export function useMediaControl(): boolean {
  const isHost = useRoomStore((s) => s.youUserId === s.hostUserId);
  const isModerator = useRoomStore(
    (s) => s.members.find((m) => m.userId === s.youUserId)?.isModerator === true,
  );
  return isHost || isModerator;
}

function Glyph({
  children,
  size = 16,
  filled = false,
}: {
  children: ReactNode;
  size?: number;
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const Play = ({ size }: { size?: number }): ReactNode => (
  <Glyph size={size} filled>
    <path d="M8 5.2v13.6L19 12z" />
  </Glyph>
);

const Pause = ({ size }: { size?: number }): ReactNode => (
  <Glyph size={size} filled>
    <path d="M7 4.5h3.4v15H7zM13.6 4.5H17v15h-3.4z" />
  </Glyph>
);

function IconButton({
  label,
  onClick,
  pressed,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={`shrink-0 rounded-lg p-2 transition-colors hover:bg-surface0 disabled:cursor-not-allowed disabled:opacity-40 ${
        pressed ? 'bg-surface0 text-accent-text' : 'text-muted'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The volume is not a control most of the room ever touches, so it lives behind
 * the speaker rather than in a bar that spends the card's width on it.
 */
function VolumePopup({
  close,
  triggerRef,
}: {
  close: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const musicVolume = usePrefsStore((s) => s.musicVolume);
  const setMusicVolume = usePrefsStore((s) => s.setMusicVolume);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      close();
      triggerRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [close, triggerRef]);

  return (
    <div
      ref={panelRef}
      className="absolute top-11 right-2 z-20 w-44 rounded-xl border border-surface1 bg-base p-3 shadow-lg"
    >
      <label className="block space-y-1">
        <span className="flex items-center justify-between text-xs text-muted">
          <span>{t('music.volume')}</span>
          <span className="tabular-nums text-text">{musicVolume}</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={musicVolume}
          onChange={(event) => setMusicVolume(Number(event.currentTarget.value))}
          aria-label={t('music.volume')}
          className="w-full accent-mauve"
        />
      </label>
    </div>
  );
}

export function MusicCard({ onMediaAction, onSeek, onSetLoop, onTrackEnded }: MusicCardProps) {
  const t = useT();
  // The seek bar and the time read-out follow the room's clock, not the player's.
  useNow(500);

  // Who asked for the track is said once, in the chat thread, not repeated here.
  const media = useRoomStore((s) => s.media);
  const canControl = useMediaControl();

  const musicListening = usePrefsStore((s) => s.musicListening);
  const setMusicListening = usePrefsStore((s) => s.setMusicListening);
  // The speaker's cross is the slider at zero, so the two cannot disagree.
  const musicVolume = usePrefsStore((s) => s.musicVolume);

  const { containerRef, ready, failed, blocked, ended, unplayable, title, sync, joinTheMusic, replay } =
    useMediaSync(onTrackEnded);

  const [dragMs, setDragMs] = useState<number | null>(null);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumeTrigger = useRef<HTMLButtonElement>(null);
  const muted = musicVolume === 0;

  if (!media) return null;

  const hasVideo = media.videoId !== null;
  const playing = media.status === 'playing';
  /** The record only turns when this device is actually making sound. */
  const spins = playing && musicListening && !blocked;
  const isLive = sync !== null && sync.isLive();
  const durationMs = sync?.durationMs() ?? 0;
  const seekable = hasVideo && ready && !isLive && durationMs > 0;
  const positionMs = dragMs ?? (seekable && sync ? sync.targetMs() : 0);
  const positionLabel = t('music.position', {
    current: formatRemaining(Math.floor(positionMs / 1000) * 1000),
    total: formatRemaining(durationMs),
  });
  const next = media.queue[0] ?? null;
  const waiting = media.queue.length;

  const run = (action: MediaAction): void => {
    void onMediaAction(action);
  };

  // A browser keeps an embed's sound behind a click, and a clip that finished
  // needs one to start again. That gesture is this device's own business, so
  // every member gets it; steering what the room hears is a controller's.
  const local = blocked
    ? { label: t('music.join'), run: joinTheMusic }
    : ended
      ? { label: t('music.replay'), run: replay }
      : null;

  const commitSeek = async (): Promise<void> => {
    if (dragMs === null) return;
    const target = dragMs;
    setDragMs(null);
    await onSeek(target);
  };

  return (
    <section
      aria-label={t('room.musicTab')}
      className="card relative flex flex-col gap-3 rounded-2xl p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-text">{t('room.musicTab')}</h2>
        <div className="flex items-center gap-1">
          <IconButton
            label={t(musicListening ? 'music.stopListening' : 'music.listening')}
            pressed={musicListening}
            onClick={() => setMusicListening(!musicListening)}
          >
            <Glyph>
              <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
              <path d="M4 15h2.5v5H4a1 1 0 0 1-1-1v-3z" />
              <path d="M20 15h-2.5v5H20a1 1 0 0 0 1-1v-3z" />
            </Glyph>
          </IconButton>
          <button
            ref={volumeTrigger}
            type="button"
            onClick={() => setVolumeOpen((open) => !open)}
            aria-expanded={volumeOpen}
            title={t('music.volume')}
            aria-label={t('music.volume')}
            className={`shrink-0 rounded-lg p-2 transition-colors hover:bg-surface0 ${
              muted ? 'text-danger-text' : volumeOpen ? 'bg-surface0 text-text' : 'text-muted'
            }`}
          >
            <Glyph>
              <path d="M11 5 6 9H3v6h3l5 4z" />
              {muted ? <path d="m17 9 4 6M21 9l-4 6" /> : <path d="M16 8.5a5 5 0 0 1 0 7" />}
            </Glyph>
          </button>
        </div>
      </div>

      {!hasVideo ? (
        <p className="text-xs text-muted">{t('music.empty')}</p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          {/* The record is the video's face rather than a picture beside it: the
              embed fills the circle with the middle of its own frame and the
              disc's grooves lie over it. Controlling it is the row underneath
              the bar, so the whole face stays watchable. */}
          <div
            className="vinyl-shell self-center sm:self-auto"
            style={{ '--vinyl-size': `${MEDIA.VINYL_DIAMETER_PX}px` } as CSSProperties}
          >
            <div className="vinyl-embed" data-spin={String(spins)}>
              <div ref={containerRef} className="vinyl-frame" />
            </div>
            <span className="vinyl" data-spin={String(spins)} aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <p className="truncate text-sm text-muted" title={title ?? undefined}>
              {title || t('music.noTitle')}
            </p>

            {seekable ? (
              <div className="space-y-1">
                <input
                  type="range"
                  min={0}
                  max={Math.round(durationMs / 1000)}
                  step={1}
                  value={Math.round(positionMs / 1000)}
                  disabled={!canControl}
                  onChange={(event) => {
                    if (!canControl) return;
                    setDragMs(Number(event.currentTarget.value) * 1000);
                  }}
                  onPointerUp={() => void commitSeek()}
                  onKeyUp={() => void commitSeek()}
                  aria-label={positionLabel}
                  className="w-full accent-mauve disabled:opacity-50"
                />
                <p className="text-center font-mono text-xs tabular-nums text-muted">
                  {positionLabel}
                </p>
              </div>
            ) : null}

            {/* The controls sit on the bar's own axis, in the order a room uses
                them: what repeats, what plays, what comes next, what stops. */}
            {local ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={local.run}
                  className="phase-button h-10 min-w-24"
                >
                  {local.label}
                </button>
              </div>
            ) : canControl ? (
              <div className="flex items-center justify-center gap-1">
                <IconButton
                  label={t('music.loop')}
                  pressed={media.loop}
                  onClick={() => void onSetLoop(!media.loop)}
                >
                  <Glyph>
                    <path d="m17 2 4 4-4 4" />
                    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                    <path d="m7 22-4-4 4-4" />
                    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
                  </Glyph>
                </IconButton>
                <button
                  type="button"
                  onClick={() => run(playing ? 'pause' : 'play')}
                  disabled={!ready}
                  title={playing ? t('music.pause') : t('music.play')}
                  aria-label={playing ? t('music.pause') : t('music.play')}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mauve text-base transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {playing ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <IconButton label={t('music.skip')} onClick={() => run('skip')}>
                  <Glyph filled>
                    <path d="M6 5.2v13.6L15 12z" />
                    <path d="M18 4.5v15" />
                  </Glyph>
                </IconButton>
                <IconButton label={t('music.clear')} onClick={() => run('clear')}>
                  <Glyph>
                    <path d="M3 6h18M8 6V3.5h8V6" />
                    <path d="M5.5 6 7 20.5h10L18.5 6" />
                  </Glyph>
                </IconButton>
              </div>
            ) : null}

            {next ? (
              <p className="truncate text-center text-xs text-muted">
                {t('music.nextUp')} · <span className="font-mono">{formatTrack(next.videoId)}</span>
                {waiting > 1 ? ` · ${t('music.waiting', { count: waiting - 1 })}` : ''}
              </p>
            ) : null}

            {blocked ? <p className="text-xs text-muted">{t('music.joinPrompt')}</p> : null}
            {isLive ? <p className="text-xs text-muted">{t('music.live')}</p> : null}
            {unplayable ? <p className="text-xs text-danger-text">{t('music.unplayable')}</p> : null}
            {!ready && !failed ? <p className="text-xs text-muted">{t('music.loading')}</p> : null}
            {failed ? <p className="text-xs text-danger-text">{t('music.failed')}</p> : null}
          </div>
        </div>
      )}

      {volumeOpen ? <VolumePopup close={() => setVolumeOpen(false)} triggerRef={volumeTrigger} /> : null}
    </section>
  );
}
