import type {
  MediaCorrection,
  MediaPlayerState,
  MediaState,
  QueuedTrack,
} from './types';

/**
 * The shared music player, as a pure state machine. Like the timer the server
 * owns this state: positions are derived from the server clock, never from a
 * client report. Every function returns the SAME object when there is nothing
 * to change, so callers can compare identities to decide whether to broadcast.
 */

export function createInitialMedia(now: number): MediaState {
  return {
    videoId: null,
    status: 'stopped',
    anchorPositionMs: 0,
    anchorAt: now,
    loop: false,
    setBy: null,
    queue: [],
    version: 0,
  };
}

/** Where the playhead is at `now`, without touching the player. */
export function positionAt(m: MediaState, now: number): number {
  return m.status === 'playing' ? m.anchorPositionMs + Math.max(0, now - m.anchorAt) : m.anchorPositionMs;
}

export function setVideo(m: MediaState, videoId: string, by: string, now: number): MediaState {
  return {
    ...m,
    videoId,
    status: 'playing',
    anchorPositionMs: 0,
    anchorAt: now,
    setBy: by,
    version: m.version + 1,
  };
}

/**
 * A request from anyone in the room. While the room is silent the request
 * becomes the song, because that is the whole point of asking; once something
 * is playing it waits its turn at the back instead of cutting the track short.
 */
export function enqueue(m: MediaState, videoId: string, by: string, now: number): MediaState {
  if (m.videoId === null) return setVideo({ ...m, queue: [] }, videoId, by, now);
  const track: QueuedTrack = { videoId, by };
  return { ...m, queue: [...m.queue, track], version: m.version + 1 };
}

/**
 * The end of a track, whether someone skipped it or the video ran out. The
 * next request takes over; with nothing waiting the room goes quiet.
 */
export function advance(m: MediaState, now: number): MediaState {
  if (m.videoId === null && m.queue.length === 0) return m;
  const [next, ...rest] = m.queue;
  if (!next) return clear(m);
  return setVideo({ ...m, queue: rest }, next.videoId, next.by, now);
}

/**
 * Has this song already been asked for? One person pressing the same link over
 * and over must be able to fill a queue of ten with one track.
 */
export function isRequested(m: MediaState, videoId: string): boolean {
  return m.videoId === videoId || m.queue.some((track) => track.videoId === videoId);
}

export function play(m: MediaState, now: number): MediaState {
  if (m.videoId === null || m.status === 'playing') return m;
  // A stopped player starts from the top; a paused one picks up where it was.
  const from = m.status === 'paused' ? positionAt(m, now) : 0;
  return { ...m, status: 'playing', anchorPositionMs: from, anchorAt: now, version: m.version + 1 };
}

export function pause(m: MediaState, now: number): MediaState {
  if (m.status !== 'playing') return m;
  return {
    ...m,
    status: 'paused',
    anchorPositionMs: positionAt(m, now),
    anchorAt: now,
    version: m.version + 1,
  };
}

export function seek(m: MediaState, positionMs: number, now: number): MediaState {
  if (m.videoId === null) return m;
  return { ...m, anchorPositionMs: positionMs, anchorAt: now, version: m.version + 1 };
}

export function setLoop(m: MediaState, loop: boolean): MediaState {
  if (m.loop === loop) return m;
  return { ...m, loop, version: m.version + 1 };
}

export function clear(m: MediaState): MediaState {
  if (m.videoId === null && m.status === 'stopped' && m.queue.length === 0) return m;
  return {
    ...m,
    videoId: null,
    status: 'stopped',
    anchorPositionMs: 0,
    anchorAt: m.anchorAt,
    queue: [],
    version: m.version + 1,
  };
}

/** Wraps when looping, clamps once the video is over. */
export function effectivePositionMs(posMs: number, durationMs: number, loop: boolean): number {
  if (loop && durationMs > 0) return posMs % durationMs;
  return durationMs > 0 ? Math.min(posMs, durationMs) : posMs;
}

/**
 * Decides whether the local player has drifted from the room's target. An
 * unstarted, cued or buffering player has no trustworthy position, so it is
 * left alone until it reports one.
 */
export function computeCorrection(
  playerPosMs: number,
  targetPosMs: number,
  playerState: MediaPlayerState,
  thresholdMs: number,
): MediaCorrection {
  if (playerState === 'unstarted' || playerState === 'cued' || playerState === 'buffering') {
    return 'none';
  }
  return Math.abs(playerPosMs - targetPosMs) > thresholdMs ? 'seek' : 'none';
}
