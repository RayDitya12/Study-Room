import { useEffect, useRef, useState, type RefObject } from 'react';
import { MEDIA } from '@studyroom/shared';
import type { MediaState } from '@studyroom/shared';
import { serverNowEstimate } from '../lib/clock';
import { createMediaSync, type MediaSync } from '../lib/mediaSync';
import { createYouTubePlayer, type MediaPlayer } from '../lib/youtubePlayer';
import { usePrefsStore } from '../stores/prefsStore';
import { useRoomStore } from '../stores/roomStore';

export interface MediaSyncState {
  /** The box the iframe is mounted in. The card that holds it is the smallest
   *  thing that ever gets hidden, and never while sound is coming out. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** The player exists and takes commands. */
  ready: boolean;
  /** The YouTube script never arrived, so the card says so instead of hanging. */
  failed: boolean;
  /** Blocked until the user clicks: browser autoplay policy, not a bug. */
  blocked: boolean;
  ended: boolean;
  unplayable: boolean;
  title: string | null;
  sync: MediaSync | null;
  joinTheMusic: () => void;
  replay: () => void;
}

/**
 * Owns the one player this device has for the room's shared video. It is created
 * for the first video and survives every change after that, so a clear-and-replace
 * never pays for the script twice and never leaves the card pointing at a
 * destroyed player.
 */
export function useMediaSync(): MediaSyncState {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const media = useRoomStore((s) => s.media);
  const listening = usePrefsStore((s) => s.musicListening);
  const volume = usePrefsStore((s) => s.musicVolume);

  const latest = useRef<MediaState | null>(media);
  latest.current = media;
  const syncRef = useRef<MediaSync | null>(null);
  const pendingPlayer = useRef<MediaPlayer | null>(null);
  const mounted = useRef(true);

  const [sync, setSync] = useState<MediaSync | null>(null);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [ended, setEnded] = useState(false);
  const [unplayable, setUnplayable] = useState(false);

  useEffect(() => {
    if (!media?.videoId) return;
    const element = containerRef.current;
    if (!element || syncRef.current || pendingPlayer.current) return;
    mounted.current = true;

    void createYouTubePlayer(element)
      .then((player) => {
        pendingPlayer.current = null;
        if (!mounted.current) {
          player.destroy();
          return;
        }
        const created = createMediaSync({
          player,
          now: serverNowEstimate,
          callbacks: {
            onBlocked: setBlocked,
            onEnded: setEnded,
            onError: () => setUnplayable(true),
          },
        });
        created.setVolume(usePrefsStore.getState().musicVolume);
        created.setListening(usePrefsStore.getState().musicListening);
        const current = latest.current;
        if (current) created.applyMedia(current);
        syncRef.current = created;
        setSync(created);
      })
      .catch(() => {
        if (mounted.current) setFailed(true);
      });
  }, [media?.videoId]);

  useEffect(
    () => () => {
      mounted.current = false;
      syncRef.current?.dispose();
      syncRef.current = null;
      pendingPlayer.current?.destroy();
      pendingPlayer.current = null;
    },
    [],
  );

  // Every room-wide change lands here: a new video, play, pause, seek, loop,
  // and the cleared state that tells the local player to stop.
  useEffect(() => {
    if (sync && media) sync.applyMedia(media);
  }, [sync, media]);

  useEffect(() => {
    if (!sync) return;
    sync.setVolume(volume);
  }, [sync, volume]);

  useEffect(() => {
    if (!sync) return;
    sync.setListening(listening);
  }, [sync, listening]);

  useEffect(() => {
    if (!sync) return;
    const id = window.setInterval(() => sync.tick(), MEDIA.DRIFT_CHECK_MS);
    return () => window.clearInterval(id);
  }, [sync]);

  // A new video can fix an old error, and a cleared one has nothing to show.
  useEffect(() => {
    if (!media?.videoId) {
      setUnplayable(false);
      setBlocked(false);
      setEnded(false);
    }
  }, [media?.videoId]);

  return {
    containerRef,
    ready: sync !== null,
    failed,
    blocked,
    ended,
    unplayable,
    title: sync?.title() || null,
    sync,
    joinTheMusic: () => sync?.joinTheMusic(),
    replay: () => sync?.replay(),
  };
}
