import { MEDIA, mediaMachine } from '@studyroom/shared';
import type { MediaPlayerState, MediaState } from '@studyroom/shared';
import { playerStateOf, type MediaPlayer } from './youtubePlayer';

/**
 * How the local player is kept in step with the room's shared video. All of the
 * decisions are here, against an injected `MediaPlayer` and clock, so they are
 * testable without YouTube or a DOM.
 */

/** How long the player gets to prove it is actually playing before we ask. */
export const PLAYABLE_CHECK_MS = 1500;

/**
 * YouTube's own "this cannot be played here" codes: 2 bad parameter, 5 HTML5
 * trouble, 100 / 101 / 150 not found or not allowed to be embedded.
 */
const UNPLAYABLE_ERRORS = new Set([2, 5, 100, 101, 150]);

export function isUnplayableError(code: number): boolean {
  return UNPLAYABLE_ERRORS.has(code);
}

export interface Scheduler {
  after(ms: number, fn: () => void): number;
  cancel(handle: number): void;
}

/** The only part of the engine that needs a timer, kept injectable for tests. */
export const windowScheduler: Scheduler = {
  after: (ms, fn) => window.setTimeout(fn, ms),
  cancel: (handle) => window.clearTimeout(handle),
};

export interface MediaSyncCallbacks {
  /** The room is playing but this browser will not, until someone clicks. */
  onBlocked: (blocked: boolean) => void;
  /** The video reached its end and the room is not looping. */
  onEnded: (ended: boolean) => void;
  /** A player error code, already filtered down to the unplayable ones. */
  onError: (code: number) => void;
}

export interface MediaSyncDeps {
  player: MediaPlayer;
  /** The synced server clock, never `Date.now()` on this machine. */
  now: () => number;
  callbacks: MediaSyncCallbacks;
  scheduler?: Scheduler;
}

export interface MediaSync {
  applyMedia(media: MediaState): void;
  /** Called every `MEDIA.DRIFT_CHECK_MS`: fixes drift, notices an ending. */
  tick(): void;
  setListening(listening: boolean): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  /** A real user gesture: this is what unlocks autoplay. */
  joinTheMusic(): void;
  replay(): void;
  targetMs(): number;
  durationMs(): number;
  isLive(): boolean;
  state(): MediaPlayerState;
  title(): string;
  dispose(): void;
}

export function createMediaSync(deps: MediaSyncDeps): MediaSync {
  const { player, now, callbacks } = deps;
  const scheduler = deps.scheduler ?? windowScheduler;

  let media: MediaState | null = null;
  let loadedId: string | null = null;
  let listening = true;
  let ended = false;
  let watchdog: number | null = null;

  const cancelWatchdog = (): void => {
    if (watchdog !== null) {
      scheduler.cancel(watchdog);
      watchdog = null;
    }
  };

  const status = (): MediaState['status'] => media?.status ?? 'stopped';

  /** Where the room thinks this video is, wrapped or clamped for the player. */
  const targetFor = (m: MediaState): number =>
    mediaMachine.effectivePositionMs(
      mediaMachine.positionAt(m, now()),
      player.getDurationMs(),
      m.loop,
    );

  /**
   * Live streams have no seekable position, and a player with no trustworthy
   * time yet is left alone — `computeCorrection` covers the buffering case.
   */
  const correctTo = (target: number): void => {
    if (player.isLive()) return;
    if (
      mediaMachine.computeCorrection(
        player.getCurrentTimeMs(),
        target,
        player.getState(),
        MEDIA.DRIFT_THRESHOLD_MS,
      ) === 'seek'
    ) {
      player.seekTo(target / 1000);
    }
  };

  const shouldPlay = (): boolean => Boolean(media?.videoId) && status() === 'playing' && listening;

  const armWatchdog = (): void => {
    cancelWatchdog();
    watchdog = scheduler.after(PLAYABLE_CHECK_MS, () => {
      watchdog = null;
      if (shouldPlay() && player.getState() !== 'playing') callbacks.onBlocked(true);
    });
  };

  // A player that reports 'playing' answers the watchdog, and an 'ended' state
  // is the video's own last word on finishing.
  player.on('state', (payload) => {
    const state = playerStateOf(payload);
    if (state === 'playing') {
      cancelWatchdog();
      callbacks.onBlocked(false);
    }
    if (state === 'ended' && media && !media.loop) {
      ended = true;
      player.pause();
      callbacks.onEnded(true);
    }
  });

  player.on('error', (payload) => {
    const code = Number(payload);
    if (isUnplayableError(code)) callbacks.onError(code);
  });

  const applyMedia = (next: MediaState): void => {
    const previousId = loadedId;
    media = next;
    if (next.videoId) {
      ended = false;
      callbacks.onEnded(false);
    }

    if (!next.videoId) {
      // Nothing to hear: the empty state replaces the player's contents.
      loadedId = null;
      player.pause();
      callbacks.onBlocked(false);
      return;
    }

    const target = targetFor(next);
    if (next.videoId !== previousId) {
      loadedId = next.videoId;
      player.load(next.videoId, target / 1000, shouldPlay());
      if (shouldPlay()) armWatchdog();
      return;
    }

    correctTo(target);
    if (shouldPlay()) {
      player.play();
      armWatchdog();
    } else {
      player.pause();
      if (status() !== 'playing') callbacks.onBlocked(false);
    }
  };

  return {
    applyMedia,

    tick: () => {
      const m = media;
      if (!m?.videoId || ended || player.isLive()) return;
      if (m.status !== 'playing') {
        // An embed that started on its own did not ask the room.
        if (m.status === 'paused' && player.getState() === 'playing') player.pause();
        return;
      }
      const duration = player.getDurationMs();
      // Without a loop the room keeps counting but there is nothing left to
      // watch: stop locally instead of pretending to be in step. A looping
      // room never gets here, because its position wraps instead of ending.
      if (
        !m.loop &&
        duration > 0 &&
        mediaMachine.positionAt(m, now()) >= duration
      ) {
        ended = true;
        player.pause();
        callbacks.onEnded(true);
        return;
      }
      if (!listening) return;
      // The player can fall out of playback on its own — a stall it never came
      // back from, an interaction that reached it — and sit there with the room
      // still counting. Asking again is the only way that silence ends.
      if (player.getState() === 'paused') player.play();
      correctTo(targetFor(m));
    },

    setListening: (next) => {
      listening = next;
      if (!media?.videoId) return;
      if (next && media.status === 'playing') {
        player.play();
        armWatchdog();
      } else if (!next) {
        player.pause();
        callbacks.onBlocked(false);
      }
    },

    setVolume: (volume) => player.setVolume(volume),

    setMuted: (muted) => {
      if (muted) player.mute();
      else player.unMute();
    },

    joinTheMusic: () => {
      if (!media?.videoId) return;
      ended = false;
      player.unMute();
      player.play();
      armWatchdog();
    },

    replay: () => {
      if (!media?.videoId) return;
      ended = false;
      callbacks.onEnded(false);
      player.seekTo(0);
      player.play();
      armWatchdog();
    },

    targetMs: () => (media ? targetFor(media) : 0),
    durationMs: () => player.getDurationMs(),
    isLive: () => player.isLive(),
    state: () => player.getState(),
    title: () => player.getTitle(),

    dispose: () => {
      cancelWatchdog();
    },
  };
}
