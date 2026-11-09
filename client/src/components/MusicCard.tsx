import { useEffect, useState, type FormEvent } from 'react';
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

  const run = (action: MediaAction): void => {
    void onMediaAction(action);
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* Hidden only when there is nothing in it to hear. The width is what
            keeps the stream cheap, and `pointer-events-none` is what keeps
            YouTube's own play/pause out of reach: the room has one set. */}
        <div
          className={`shrink-0 self-center overflow-hidden rounded-lg bg-crust sm:self-auto ${
            hasVideo ? 'block pointer-events-none' : 'hidden'
          }`}
          style={{ width: MEDIA.MINI_PLAYER_WIDTH_PX, aspectRatio: '16 / 9' }}
        >
          <div ref={containerRef} className="h-full w-full" />
        </div>

        <div className="min-w-0 flex-1">
          {hasVideo ? (
            <div className="flex items-center gap-3">
              <span className="vinyl" data-spin={String(spins)} aria-hidden="true" />
              {title ? (
                <p className="min-w-0 flex-1 truncate text-sm text-subtext1" title={title}>
                  {title}
                </p>
              ) : (
                <p className="min-w-0 flex-1 text-sm text-subtext0">{t('music.noTitle')}</p>
              )}
            </div>
          ) : null}

          {!hasVideo ? (
            canControl ? (
              <p className="text-xs text-subtext0">{t('music.empty')}</p>
            ) : null
          ) : (
            <div className="space-y-3">
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

              <div className="flex flex-wrap items-center gap-2">
                {canControl ? (
                  <>
                    <Button
                      onClick={() => run(playing ? 'pause' : 'play')}
                      disabled={!ready}
                      className="min-w-24"
                    >
                      {t(playing ? 'music.pause' : 'music.play')}
                    </Button>
                    <Button
                      variant="secondary"
                      aria-pressed={media.loop}
                      onClick={() => void onSetLoop(!media.loop)}
                    >
                      {t('music.loop')}
                    </Button>
                    <Button variant="ghost" onClick={() => run('clear')}>
                      {t('music.clear')}
                    </Button>
                  </>
                ) : null}

                <Button
                  variant={musicListening ? 'secondary' : 'ghost'}
                  aria-pressed={musicListening}
                  onClick={() => setMusicListening(!musicListening)}
                >
                  {t(musicListening ? 'music.stopListening' : 'music.listening')}
                </Button>
              </div>

              <label className="block space-y-1">
                <span className="flex items-center justify-between text-xs text-subtext0">
                  <span>{t('music.volume')}</span>
                  <span className="tabular-nums text-text">{musicVolume}</span>
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={musicVolume}
                    onChange={(event) => setMusicVolume(Number(event.currentTarget.value))}
                    aria-label={t('music.volume')}
                    className="w-full accent-mauve"
                  />
                  <button
                    type="button"
                    aria-pressed={muted}
                    onClick={() => setMuted((value) => !value)}
                    title={t('music.mute')}
                    aria-label={t('music.mute')}
                    className={`shrink-0 rounded-lg p-2 hover:bg-surface0 ${
                      muted ? 'text-red' : 'text-subtext0'
                    }`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M11 5 6 9H3v6h3l5 4z" />
                      {muted ? <path d="m17 9 4 6M21 9l-4 6" /> : <path d="M16 8.5a5 5 0 0 1 0 7" />}
                    </svg>
                  </button>
                </div>
              </label>

              {blocked ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface0/60 p-2">
                  <p className="min-w-0 flex-1 text-xs text-subtext0">{t('music.joinPrompt')}</p>
                  <Button onClick={joinTheMusic}>{t('music.join')}</Button>
                </div>
              ) : null}

              {!musicListening ? <p className="text-xs text-subtext0">{t('music.notListening')}</p> : null}
              {isLive ? <p className="text-xs text-subtext0">{t('music.live')}</p> : null}
              {ended ? (
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 text-xs text-subtext0">{t('music.ended')}</p>
                  <Button variant="secondary" onClick={replay}>
                    {t('music.replay')}
                  </Button>
                </div>
              ) : null}
              {unplayable ? <p className="text-xs text-red">{t('music.unplayable')}</p> : null}
              {!ready && !failed ? <p className="text-xs text-subtext0">{t('music.loading')}</p> : null}
              {failed ? <p className="text-xs text-red">{t('music.failed')}</p> : null}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-overlay0">{t('music.footnote')}</p>
    </section>
  );
}
