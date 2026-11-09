import type { MediaPlayerState } from '@studyroom/shared';

/**
 * The one seam between the app and the YouTube iframe API. Everything that
 * decides *what* the player should do lives behind this interface, so the sync
 * logic can be tested with a fake player and no network.
 */
export interface MediaPlayer {
  /** `startSec` is where playback should begin; `autoplay` false means "cue only". */
  load(videoId: string, startSec: number, autoplay: boolean): void;
  play(): void;
  pause(): void;
  seekTo(sec: number): void;
  getCurrentTimeMs(): number;
  getDurationMs(): number;
  isLive(): boolean;
  getState(): MediaPlayerState;
  /** Local only: a title is never sent anywhere. */
  getTitle(): string;
  setVolume(v0to100: number): void;
  mute(): void;
  unMute(): void;
  destroy(): void;
  on(event: 'state' | 'ready' | 'error', cb: (payload?: unknown) => void): void;
}

const API_SRC = 'https://www.youtube.com/iframe_api';
/** A consent-lighter host for the frame itself. */
const PLAYER_HOST = 'https://www.youtube-nocookie.com';
const API_TIMEOUT_MS = 10_000;

/** The player codes, straight from the iframe API reference. */
const STATE_BY_CODE: Record<number, MediaPlayerState> = {
  [-1]: 'unstarted',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'cued',
};

export function playerStateOf(code: unknown): MediaPlayerState {
  return STATE_BY_CODE[Number(code)] ?? 'unstarted';
}

type Listener = (payload?: unknown) => void;

interface YtPlayerApi {
  Player: new (element: HTMLElement, options: YtPlayerOptions) => YtInstance;
}

interface YtPlayerOptions {
  host: string;
  width: string;
  height: string;
  playerVars: Record<string, number | string>;
  events: {
    onReady: () => void;
    onError: (event: { data: number }) => void;
    onStateChange: (event: { data: number }) => void;
  };
}

interface YtInstance {
  cueVideoById(args: { videoId: string; startSeconds: number }): void;
  loadVideoById(args: { videoId: string; startSeconds: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  /** Absent, or empty before a video is cued, on some player builds. */
  getVideoData?(): { title?: string } | undefined;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  destroy(): void;
}

interface YouTubeWindow {
  YT?: YtPlayerApi & { PlayerReady?: boolean };
  onYouTubeIframeAPIReady?: () => void;
}

let apiPromise: Promise<YtPlayerApi> | null = null;

/**
 * Adds the iframe API script once. The promise is cached, so ten players and a
 * refresh cost a single download; a script that never calls back is an error
 * rather than a spinner.
 */
export function loadYouTubeApi(): Promise<YtPlayerApi> {
  const win = window as Window & YouTubeWindow;
  if (win.YT?.Player) return Promise.resolve(win.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YtPlayerApi>((resolve, reject) => {
    const fail = (message: string): void => {
      window.clearTimeout(timer);
      apiPromise = null;
      reject(new Error(message));
    };
    const timer = window.setTimeout(() => fail('youtube api timed out'), API_TIMEOUT_MS);

    win.onYouTubeIframeAPIReady = () => {
      const api = (window as Window & YouTubeWindow).YT;
      if (!api?.Player) fail('youtube api did not load');
      else {
        window.clearTimeout(timer);
        resolve(api);
      }
    };

    const script = document.createElement('script');
    script.src = API_SRC;
    script.async = true;
    script.onerror = () => fail('youtube api could not be fetched');
    document.head.appendChild(script);
  });
  return apiPromise;
}

/**
 * Mounts a player in `element`. Resolves once the player is ready, with an
 * adapter whose methods are safe to call before then.
 */
export async function createYouTubePlayer(element: HTMLElement): Promise<MediaPlayer> {
  const api = await loadYouTubeApi();

  return new Promise<MediaPlayer>((resolve) => {
    let inner: YtInstance | null = null;
    const listeners: Record<'state' | 'ready' | 'error', Listener[]> = {
      state: [],
      ready: [],
      error: [],
    };

    const call = <T,>(fn: (player: YtInstance) => T, fallback: T): T =>
      inner ? fn(inner) : fallback;

    const adapter: MediaPlayer = {
      // Only ever the validated id, never a URL a member typed in.
      load(videoId, startSec, autoplay) {
        const args = { videoId, startSeconds: Math.max(0, startSec) };
        call((p) => (autoplay ? p.loadVideoById(args) : p.cueVideoById(args)), undefined);
      },
      play: () => void call((p) => p.playVideo(), undefined),
      pause: () => void call((p) => p.pauseVideo(), undefined),
      seekTo: (sec) => void call((p) => p.seekTo(Math.max(0, sec), true), undefined),
      getCurrentTimeMs: () => call((p) => p.getCurrentTime() * 1000, 0),
      getDurationMs: () => call((p) => p.getDuration() * 1000, 0),
      // A livestream reports no length, which is also how an unstarted player
      // looks; the sync code only ever treats it as "nothing to seek".
      isLive: () => call((p) => p.getDuration() <= 0, true),
      getState: () => call((p) => playerStateOf(p.getPlayerState()), 'unstarted'),
      getTitle: () => call((p) => p.getVideoData?.()?.title ?? '', ''),
      setVolume: (v) => void call((p) => p.setVolume(Math.round(Math.min(100, Math.max(0, v)))), undefined),
      mute: () => void call((p) => p.mute(), undefined),
      unMute: () => void call((p) => p.unMute(), undefined),
      destroy: () => void call((p) => p.destroy(), undefined),
      on(event, cb) {
        listeners[event].push(cb);
      },
    };

    inner = new api.Player(element, {
      host: PLAYER_HOST,
      width: '100%',
      height: '100%',
      playerVars: {
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          for (const cb of listeners.ready) cb();
          resolve(adapter);
        },
        onError: (event) => {
          for (const cb of listeners.error) cb(event.data);
        },
        onStateChange: (event) => {
          for (const cb of listeners.state) cb(event.data);
        },
      },
    });
  });
}
