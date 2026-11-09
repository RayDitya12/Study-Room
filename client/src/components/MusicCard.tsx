import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { MEDIA } from '@studyroom/shared';
import type { ErrorCode } from '@studyroom/shared';
import { formatRemaining } from '../lib/format';
import { useNow } from '../hooks/useNow';
import { useMediaSync } from '../hooks/useMediaSync';
import type { MediaAction } from '../hooks/useRoomConnection';
import { usePrefsStore } from '../stores/prefsStore';
import { useRoomStore } from '../stores/roomStore';
import { useT } from '../i18n/useT';
import { Button } from './Button';

export interface MusicCardProps {
  onSetMedia: (url: string) => Promise<ErrorCode | null>;
  onMediaAction: (action: MediaAction) => Promise<void>;
  onSeek: (positionMs: number) => Promise<void>;
  onSetLoop: (loop: boolean) => Promise<void>;
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

/** The bar's controls are shapes with a name: nothing here needs reading. */
function IconButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={`shrink-0 rounded-lg p-2 hover:bg-surface0 ${
        pressed ? 'bg-surface0 text-mauve' : 'text-subtext0'
      }`}
    >
      {children}
    </button>
  );
}

export function MusicCard({ onSetMedia, onMediaAction, onSeek, onSetLoop }: MusicCardProps) {
  const t = useT();
  // The seek bar and the time read-out follow the room's clock, not the player's.
  useNow(500);

  const media = useRoomStore((s) => s.media);
  const setByName = useRoomStore((s) => {
    const by = s.media?.setBy;
    return by ? (s.members.find((m) => m.userId === by)?.nickname ?? null) : null;
  });
  const canControl = useMediaControl();

  const musicListening = usePrefsStore((s) => s.musicListening);
  const setMusicListening = usePrefsStore((s) => s.setMusicListening);
  const musicVolume = usePrefsStore((s) => s.musicVolume);
  const setMusicVolume = usePrefsStore((s) => s.setMusicVolume);

  const { containerRef, ready, failed, blocked, ended, unplayable, title, sync, joinTheMusic, replay } =
    useMediaSync();

  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragMs, setDragMs] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    sync?.setMuted(muted);
  }, [sync, muted]);

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

  const run = (action: MediaAction): void => {
    void onMediaAction(action);
  };

  // One button in the middle of the record answers the only question that
  // matters: is this device making sound, or is it waiting to be asked to.
  const center = blocked
    ? { label: t('music.join'), run: joinTheMusic, disabled: false }
    : ended
      ? { label: t('music.replay'), run: replay, disabled: false }
      : playing
        ? { label: t('music.pause'), run: () => run('pause'), disabled: !ready }
        : { label: t('music.play'), run: () => run('play'), disabled: !ready };
  const showCenter = hasVideo && (canControl || blocked);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const value = url.trim();
    if (!value) return;
    setBusy(true);
    const error = await onSetMedia(value);
    setBusy(false);
    if (error === null) {
      setUrl('');
      setUrlError(null);
    } else {
      setUrlError(t('errors.INVALID_MEDIA_URL'));
    }
  };

  const commitSeek = async (): Promise<void> => {
    if (dragMs === null) return;
    const target = dragMs;
    setDragMs(null);
    await onSeek(target);
  };

  return (
    <section
      aria-label={t('room.musicTab')}
      className="flex flex-col gap-3 rounded-2xl bg-mantle p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-text">{t('room.musicTab')}</h2>
        {hasVideo && !canControl ? (
          <span className="truncate text-xs text-subtext0">
            {setByName ? t('music.addedBy', { name: setByName }) : t('music.addedByGone')}
          </span>
        ) : null}
      </div>

      {canControl ? (
        <form onSubmit={(event) => void submit(event)} className="space-y-1">
          <label className="block space-y-1">
            <span className="text-xs text-subtext0">{t('music.addLabel')}</span>
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(event) => {
                  setUrl(event.currentTarget.value);
                  setUrlError(null);
                }}
                maxLength={MEDIA.URL_MAX}
                placeholder={t('music.addPlaceholder')}
                aria-invalid={urlError !== null}
                className="min-w-0 flex-1 rounded-xl border border-surface1 bg-base px-3 py-2 text-sm text-text placeholder:text-overlay0 focus:border-mauve focus:outline-none"
              />
              <Button type="submit" disabled={busy || url.trim() === ''} className="shrink-0">
                {t('music.add')}
              </Button>
            </div>
          </label>
          {urlError ? <p className="text-xs text-red">{urlError}</p> : null}
        </form>
      ) : null}

      {!hasVideo ? (
        canControl ? <p className="text-xs text-subtext0">{t('music.empty')}</p> : null
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          {/* The record is the player rather than a picture beside it: the embed
              fills the circle with the middle of its own frame, the disc's
              grooves lie over it, and the only thing a pointer can reach is the
              room's own button. */}
          <div
            className="vinyl-shell self-center sm:self-auto"
            style={{ '--vinyl-size': `${MEDIA.VINYL_DIAMETER_PX}px` } as CSSProperties}
          >
            <div className="vinyl-embed" data-spin={String(spins)}>
              <div ref={containerRef} className="vinyl-frame" />
            </div>
            <span className="vinyl" data-spin={String(spins)} aria-hidden="true" />
            {showCenter ? (
              <button
                type="button"
                className="vinyl-button"
                onClick={center.run}
                disabled={center.disabled}
                title={center.label}
                aria-label={center.label}
              >
                {playing && !blocked && !ended ? <Pause size={20} /> : <Play size={20} />}
              </button>
            ) : null}
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <p className="truncate text-sm text-subtext1" title={title ?? undefined}>
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
                <p className="text-right font-mono text-xs tabular-nums text-subtext0">
                  {positionLabel}
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-1">
              {canControl ? (
                <>
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
                  <IconButton label={t('music.clear')} onClick={() => run('clear')}>
                    <Glyph>
                      <path d="M3 6h18M8 6V3.5h8V6" />
                      <path d="M5.5 6 7 20.5h10L18.5 6" />
                    </Glyph>
                  </IconButton>
                </>
              ) : null}

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

              <IconButton
                label={t('music.mute')}
                pressed={muted}
                onClick={() => setMuted((value) => !value)}
              >
                <Glyph>
                  <path d="M11 5 6 9H3v6h3l5 4z" />
                  {muted ? <path d="m17 9 4 6M21 9l-4 6" /> : <path d="M16 8.5a5 5 0 0 1 0 7" />}
                </Glyph>
              </IconButton>

              <div className="flex min-w-24 flex-1 items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={musicVolume}
                  onChange={(event) => setMusicVolume(Number(event.currentTarget.value))}
                  aria-label={t('music.volume')}
                  className="w-full accent-mauve"
                />
                <span className="w-7 shrink-0 text-right font-mono text-xs tabular-nums text-subtext0">
                  {musicVolume}
                </span>
              </div>
            </div>

            {blocked ? <p className="text-xs text-subtext0">{t('music.joinPrompt')}</p> : null}
            {ended ? <p className="text-xs text-subtext0">{t('music.ended')}</p> : null}
            {isLive ? <p className="text-xs text-subtext0">{t('music.live')}</p> : null}
            {unplayable ? <p className="text-xs text-red">{t('music.unplayable')}</p> : null}
            {!ready && !failed ? <p className="text-xs text-subtext0">{t('music.loading')}</p> : null}
            {failed ? <p className="text-xs text-red">{t('music.failed')}</p> : null}
          </div>
        </div>
      )}
    </section>
  );
}
