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
  const pending = useRef<Promise<MediaPlayer> | null>(null);
  const mounted = useRef(true);

  const [sync, setSync] = useState<MediaSync | null>(null);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [ended, setEnded] = useState(false);
  const [unplayable, setUnplayable] = useState(false);
  /** YouTube is never mounted into a box that has no size yet. */
  const [laidOut, setLaidOut] = useState(false);

  // The card is rendered as soon as the room snapshot has media, but the box
  // itself only exists once there is a video to put in it, and on a phone it can
  // still be behind another tab. Watching the box means the player is built the
  // moment it becomes visible, and never before.
  const hasVideo = media?.videoId != null;
  useEffect(() => {
    if (!hasVideo) return;
    const element = containerRef.current;
    if (!element) return;
    if (typeof ResizeObserver === 'undefined') {
      setLaidOut(true);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      setLaidOut((box?.width ?? 0) > 0 && (box?.height ?? 0) > 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasVideo]);

  useEffect(() => {
    if (!media?.videoId || !laidOut) return;
    const element = containerRef.current;
    if (!element || syncRef.current) return;
    mounted.current = true;

    // One construction per box, even when the room swaps videos while the API
    // script is still on its way.
    if (!pending.current) pending.current = createYouTubePlayer(element);
    void pending.current
      .then((player) => {
        if (!mounted.current || syncRef.current) return;
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
        pending.current = null;
        if (mounted.current) setFailed(true);
      });
  }, [media?.videoId, laidOut]);

  useEffect(
    () => () => {
      mounted.current = false;
      syncRef.current?.dispose();
      syncRef.current = null;
      // A player that was still being built must not outlive the card, or its
      // audio keeps going after the room is gone. The promise is dropped with it:
      // the next card mounts a different box, and an old player cannot be
      // re-aimed at it.
      const built = pending.current;
      pending.current = null;
      void built?.then((player) => player.destroy());
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
