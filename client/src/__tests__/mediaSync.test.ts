import { describe, expect, it } from 'vitest';
import { MEDIA, mediaMachine } from '@studyroom/shared';
import type { MediaState, MediaPlayerState } from '@studyroom/shared';
import {
  createMediaSync,
  isUnplayableError,
  PLAYABLE_CHECK_MS,
  type Scheduler,
} from '../lib/mediaSync';
import type { MediaPlayer } from '../lib/youtubePlayer';

const ID = 'dQw4w9WgXcQ';
const OTHER = 'zYxWvUtSrQp';
const START = 1_700_000_000_000;

const CODE_BY_STATE: Record<MediaPlayerState, number> = {
  unstarted: -1,
  ended: 0,
  playing: 1,
  paused: 2,
  buffering: 3,
  cued: 5,
};

/** Stands in for the YouTube embed: it records calls and owns no clock of its own. */
class FakePlayer implements MediaPlayer {
  calls: string[] = [];
  timeMs = 0;
  durationMs = 60_000;
  live = false;
  volume = 100;
  muted = false;
  private playerState: MediaPlayerState = 'unstarted';
  private readonly handlers = {
    state: [] as ((payload?: unknown) => void)[],
    ready: [] as ((payload?: unknown) => void)[],
    error: [] as ((payload?: unknown) => void)[],
  };

  load(videoId: string, startSec: number, autoplay: boolean): void {
    this.calls.push(`load ${videoId} ${startSec} ${autoplay}`);
    this.timeMs = startSec * 1_000;
    this.report(autoplay ? 'playing' : 'cued');
  }

  play(): void {
    this.calls.push('play');
    this.report('playing');
  }

  pause(): void {
    this.calls.push('pause');
    this.report('paused');
  }

  seekTo(sec: number): void {
    this.calls.push(`seek ${sec}`);
    this.timeMs = sec * 1_000;
  }

  getCurrentTimeMs(): number {
    return this.timeMs;
  }

  getDurationMs(): number {
    return this.durationMs;
  }

  isLive(): boolean {
    return this.live;
  }

  getState(): MediaPlayerState {
    return this.playerState;
  }

  getTitle(): string {
    return 'A track';
  }

  setVolume(value: number): void {
    this.volume = value;
  }

  mute(): void {
    this.muted = true;
  }

  unMute(): void {
    this.muted = false;
  }

  destroy(): void {
    this.calls.push('destroy');
  }

  on(event: 'state' | 'ready' | 'error', cb: (payload?: unknown) => void): void {
    this.handlers[event].push(cb);
  }

  /** What the iframe would push at the browser: numeric state codes. */
  report(state: MediaPlayerState): void {
    this.playerState = state;
    for (const cb of this.handlers.state) cb(CODE_BY_STATE[state]);
  }

  emitError(code: number): void {
    for (const cb of this.handlers.error) cb(code);
  }
}

interface FakeScheduler extends Scheduler {
  scheduled(): number[];
  runAll(): void;
}

function makeScheduler(): FakeScheduler {
  let jobs = new Map<number, { ms: number; fn: () => void }>();
  let handle = 0;
  return {
    after: (ms, fn) => {
      handle += 1;
      jobs.set(handle, { ms, fn });
      return handle;
    },
    cancel: (id) => {
      jobs.delete(id);
    },
    scheduled: () => [...jobs.values()].map((job) => job.ms),
    runAll: () => {
      const due = [...jobs.values()];
      jobs = new Map();
      for (const job of due) job.fn();
    },
  };
}

function harness() {
  const player = new FakePlayer();
  const scheduler = makeScheduler();
  let now = START;
  const blocked: boolean[] = [];
  const ended: boolean[] = [];
  const errors: number[] = [];
  const sync = createMediaSync({
    player,
    now: () => now,
    scheduler,
    callbacks: {
      onBlocked: (value) => blocked.push(value),
      onEnded: (value) => ended.push(value),
      onError: (code) => errors.push(code),
    },
  });
  return {
    player,
    scheduler,
    sync,
    blocked,
    ended,
    errors,
    tick: (ms: number) => {
      now += ms;
    },
    drain: () => {
      player.calls = [];
    },
  };
}

const empty = (): MediaState => mediaMachine.createInitialMedia(START);

describe('mediaSync applies the room state to the player', () => {
  it('loads a new video at the room position and starts it', () => {
    const h = harness();
    const media = mediaMachine.setVideo(empty(), ID, 'u1', START);
    h.sync.applyMedia(media);
    expect(h.player.calls).toEqual([`load ${ID} 0 true`]);
    expect(h.scheduler.scheduled()).toEqual([PLAYABLE_CHECK_MS]);
  });

  it('reloads only when the video changes, and cues for a paused room', () => {
    const h = harness();
    const playing = mediaMachine.setVideo(empty(), ID, 'u1', START);
    h.sync.applyMedia(playing);
    expect(h.player.calls).toEqual([`load ${ID} 0 true`]);
    h.drain();

    h.sync.applyMedia(mediaMachine.seek(playing, 20_000, START));
    expect(h.player.calls).toEqual(['seek 20', 'play']);
    h.drain();

    h.sync.applyMedia(mediaMachine.setVideo(playing, OTHER, 'u1', START));
    expect(h.player.calls).toEqual([`load ${OTHER} 0 true`]);
    h.drain();

    const paused = mediaMachine.pause(mediaMachine.setVideo(empty(), ID, 'u1', START), START);
    h.sync.applyMedia(paused);
    expect(h.player.calls).toEqual([`load ${ID} 0 false`]);
  });

  it('plays, pauses, seeks and loops in the order the room asks', () => {
    const h = harness();
    let media = mediaMachine.setVideo(empty(), ID, 'u1', START);
    h.sync.applyMedia(media);
    h.drain();

    h.tick(10_000);
    h.player.timeMs = 10_000;
    media = mediaMachine.pause(media, START + 10_000);
    h.sync.applyMedia(media);
    expect(h.player.calls).toEqual(['pause']);
    h.drain();

    media = mediaMachine.play(media, START + 10_000);
    h.sync.applyMedia(media);
    expect(h.player.calls).toEqual(['play']);
    h.drain();

    h.tick(5_000);
    media = mediaMachine.seek(media, 40_000, START + 15_000);
    h.sync.applyMedia(media);
    expect(h.player.calls).toEqual(['seek 40', 'play']);
    h.drain();

    media = mediaMachine.setLoop(media, true);
    h.sync.applyMedia(media);
    // Loop alone moves nothing: the player is already where the room is.
    expect(h.player.calls).toEqual(['play']);
  });

  it('stops the player and forgets the video when the room clears it', () => {
    const h = harness();
    h.sync.applyMedia(mediaMachine.setVideo(empty(), ID, 'u1', START));
    h.drain();
    h.sync.applyMedia(mediaMachine.clear(mediaMachine.setVideo(empty(), ID, 'u1', START)));
    expect(h.player.calls).toEqual(['pause']);
    expect(h.sync.targetMs()).toBe(0);
  });
});

describe('mediaSync keeps step with the room', () => {
  const drifting = (h: ReturnType<typeof harness>) => {
    const media = mediaMachine.setVideo(empty(), ID, 'u1', START);
    h.sync.applyMedia(media);
    h.tick(30_000);
    h.drain();
    return media;
  };

  it('seeks when the player drifts past the threshold', () => {
    const h = harness();
    drifting(h);
    h.player.timeMs = 30_000 - MEDIA.DRIFT_THRESHOLD_MS - 500;
    h.sync.tick();
    expect(h.player.calls).toEqual(['seek 30']);
  });

  it('leaves a player inside the threshold alone', () => {
    const h = harness();
    drifting(h);
    h.player.timeMs = 30_000 - MEDIA.DRIFT_THRESHOLD_MS + 500;
    h.sync.tick();
    expect(h.player.calls).toEqual([]);
  });

  it('never corrects a player that is buffering', () => {
    const h = harness();
    drifting(h);
    h.player.timeMs = 0;
    h.player.report('buffering');
    h.drain();
    h.sync.tick();
    expect(h.player.calls).toEqual([]);
  });

  it('never corrects a live stream', () => {
    const h = harness();
    drifting(h);
    h.player.live = true;
    h.player.durationMs = 0;
    h.player.timeMs = 0;
    h.sync.tick();
    expect(h.player.calls).toEqual([]);
  });

  it('wraps the target while looping', () => {
    const h = harness();
    let media = mediaMachine.setVideo(empty(), ID, 'u1', START);
    media = mediaMachine.setLoop(media, true);
    h.sync.applyMedia(media);
    h.drain();

    h.tick(75_000);
    h.player.timeMs = 0;
    h.sync.tick();
    expect(h.player.calls).toEqual(['seek 15']);
    expect(h.sync.targetMs()).toBe(15_000);
  });

  it('stops locally at the end without a server round trip', () => {
    const h = harness();
    const media = mediaMachine.setVideo(empty(), ID, 'u1', START);
    h.sync.applyMedia(media);
    h.tick(61_000);
    h.drain();

    h.sync.tick();
    expect(h.player.calls).toEqual(['pause']);
    expect(h.ended).toEqual([false, true]);

    // Once it is over, ticking again changes nothing.
    h.drain();
    h.sync.tick();
    expect(h.player.calls).toEqual([]);
  });

  it('keeps watching a video that loops past its length', () => {
    const h = harness();
    let media = mediaMachine.setVideo(empty(), ID, 'u1', START);
    media = mediaMachine.setLoop(media, true);
    h.sync.applyMedia(media);
    h.tick(61_000);
    h.drain();

    h.sync.tick();
    // A one-second drift is under the threshold, so nothing is touched at all.
    expect(h.player.calls).toEqual([]);
    expect(h.ended).toEqual([false]);
    expect(h.sync.targetMs()).toBe(1_000);
  });
});

describe('mediaSync listening, volume and the autoplay gate', () => {
  it('asks the user to join the music when playback never starts', () => {
    const h = harness();
    h.sync.applyMedia(mediaMachine.setVideo(empty(), ID, 'u1', START));
    // The iframe claims to be buffering, so nothing has really started.
    h.player.report('buffering');
    h.drain();

    h.scheduler.runAll();
    expect(h.blocked).toEqual([false, true]);

    h.player.report('playing');
    expect(h.blocked).toEqual([false, true, false]);
  });

  it('does not ask when the room is only paused', () => {
    const h = harness();
    const media = mediaMachine.setVideo(empty(), ID, 'u1', START);
    h.sync.applyMedia(mediaMachine.pause(media, START));
    expect(h.scheduler.scheduled()).toEqual([]);
    h.scheduler.runAll();
    expect(h.blocked).toEqual([]);
  });

  it('joining the music unmutes, plays and re-arms the check', () => {
    const h = harness();
    h.sync.applyMedia(mediaMachine.setVideo(empty(), ID, 'u1', START));
    h.player.muted = true;
    h.drain();

    h.sync.joinTheMusic();
    expect(h.player.muted).toBe(false);
    expect(h.player.calls).toEqual(['play']);
    expect(h.scheduler.scheduled()).toEqual([PLAYABLE_CHECK_MS]);
  });

  it('stays silent for a listener who stopped listening', () => {
    const h = harness();
    const media = mediaMachine.setVideo(empty(), ID, 'u1', START);
    h.sync.setListening(false);
    h.drain();

    h.sync.applyMedia(media);
    expect(h.player.calls).toEqual([`load ${ID} 0 false`]);
    expect(h.scheduler.scheduled()).toEqual([]);

    h.sync.applyMedia(mediaMachine.pause(media, START));
    h.drain();
    h.sync.setListening(true);
    // The room is paused, so turning listening back on must not start it.
    expect(h.player.calls).toEqual([]);
  });

  it('carries volume and mute to the player', () => {
    const h = harness();
    h.sync.setVolume(35);
    h.sync.setMuted(true);
    expect(h.player.volume).toBe(35);
    expect(h.player.muted).toBe(true);
    h.sync.setMuted(false);
    expect(h.player.muted).toBe(false);
    expect(h.sync.title()).toBe('A track');
    expect(h.sync.durationMs()).toBe(60_000);
    expect(h.sync.state()).toBe('unstarted');
  });

  it('reports only the codes that mean the video cannot be embedded', () => {
    expect([2, 5, 100, 101, 150].every(isUnplayableError)).toBe(true);
    expect([0, 1, 3, 99].some(isUnplayableError)).toBe(false);

    const h = harness();
    h.player.emitError(101);
    h.player.emitError(0);
    expect(h.errors).toEqual([101]);
  });

  it('replays from the top after a video has ended', () => {
    const h = harness();
    const media = mediaMachine.setVideo(empty(), ID, 'u1', START);
    h.sync.applyMedia(media);
    h.tick(61_000);
    h.sync.tick();
    h.drain();

    h.sync.replay();
    expect(h.player.calls).toEqual(['seek 0', 'play']);
    expect(h.ended).toEqual([false, true, false]);
  });
});
