import { describe, expect, it } from 'vitest';
import {
  clear,
  computeCorrection,
  createInitialMedia,
  effectivePositionMs,
  pause,
  play,
  positionAt,
  seek,
  setLoop,
  setVideo,
} from '../mediaMachine';
import type { MediaState } from '../types';

const ID = 'dQw4w9WgXcQ';
const T0 = 1_000_000;

const loaded = (): MediaState => setVideo(createInitialMedia(T0), ID, 'anna', T0);

describe('createInitialMedia', () => {
  it('is stopped at zero', () => {
    expect(createInitialMedia(T0)).toEqual({
      videoId: null,
      status: 'stopped',
      anchorPositionMs: 0,
      anchorAt: T0,
      loop: false,
      setBy: null,
      version: 0,
    });
  });
});

describe('setVideo', () => {
  it('starts a new video playing from the top', () => {
    const m = loaded();
    expect(m).toMatchObject({ videoId: ID, status: 'playing', anchorPositionMs: 0, anchorAt: T0 });
    expect(m.version).toBe(1);
  });

  it('keeps the loop choice across a video change', () => {
    const looping = setLoop(loaded(), true);
    const m = setVideo(looping, 'aaaaaaaaaaa', 'bob', T0 + 500);
    expect(m.loop).toBe(true);
    expect(m.anchorPositionMs).toBe(0);
  });
});

describe('play', () => {
  it('resumes a paused player from where it stopped', () => {
    const paused = pause(loaded(), T0 + 10_000);
    const m = play(paused, T0 + 20_000);
    expect(m.status).toBe('playing');
    expect(m.anchorPositionMs).toBe(10_000);
    expect(m.anchorAt).toBe(T0 + 20_000);
  });

  it('starts a stopped player that still has a video from zero', () => {
    const stopped = pause(loaded(), T0 + 10_000);
    const m = play({ ...stopped, status: 'stopped' }, T0 + 30_000);
    expect(m).toMatchObject({ status: 'playing', anchorPositionMs: 0, anchorAt: T0 + 30_000 });
    expect(m.version).toBe(stopped.version + 1);
  });

  it('is a no-op when already playing or with no video', () => {
    const m = loaded();
    const empty = createInitialMedia(T0);
    expect(play(m, T0 + 5_000)).toBe(m);
    expect(play(empty, T0 + 5_000)).toBe(empty);
  });
});

describe('pause', () => {
  it('freezes the elapsed position', () => {
    const m = pause(loaded(), T0 + 45_000);
    expect(m).toMatchObject({ status: 'paused', anchorPositionMs: 45_000, anchorAt: T0 + 45_000 });
  });

  it('does not touch an already paused or stopped player', () => {
    const m = pause(loaded(), T0 + 1000);
    const empty = createInitialMedia(T0);
    expect(pause(m, T0 + 2000)).toBe(m);
    expect(pause(empty, T0)).toBe(empty);
  });
});

describe('seek', () => {
  it('moves the anchor and keeps the status', () => {
    const m = seek(loaded(), 90_000, T0 + 10_000);
    expect(m).toMatchObject({ status: 'playing', anchorPositionMs: 90_000, anchorAt: T0 + 10_000 });
    expect(positionAt(m, T0 + 13_000)).toBe(93_000);
  });

  it('ignores a seek when there is no video', () => {
    const m = createInitialMedia(T0);
    expect(seek(m, 1000, T0)).toBe(m);
  });
});

describe('setLoop', () => {
  it('bumps the version only on a real change', () => {
    const m = loaded();
    const on = setLoop(m, true);
    expect(on).not.toBe(m);
    expect(on.version).toBe(m.version + 1);
    expect(setLoop(on, true)).toBe(on);
  });
});

describe('clear', () => {
  it('resets to the empty stopped state', () => {
    const m = clear(loaded());
    expect(m).toMatchObject({ videoId: null, status: 'stopped', anchorPositionMs: 0 });
    expect(m.version).toBe(2);
  });

  it('is a no-op when nothing is loaded', () => {
    const m = createInitialMedia(T0);
    expect(clear(m)).toBe(m);
  });
});

describe('positionAt', () => {
  it('advances only while playing', () => {
    const m = loaded();
    expect(positionAt(m, T0 + 60_000)).toBe(60_000);
    expect(positionAt(m, T0 - 5_000)).toBe(0); // never negative
    expect(positionAt(pause(m, T0 + 60_000), T0 + 120_000)).toBe(60_000);
  });
});

describe('every real change bumps the version once', () => {
  it('monotonically along a session', () => {
    let m = createInitialMedia(T0);
    const steps = [
      (s: MediaState) => setVideo(s, ID, 'anna', T0 + 1),
      (s: MediaState) => pause(s, T0 + 2),
      (s: MediaState) => seek(s, 5_000, T0 + 3),
      (s: MediaState) => setLoop(s, true),
      (s: MediaState) => clear(s),
    ];
    for (const step of steps) {
      const before = m.version;
      m = step(m);
      expect(m.version).toBe(before + 1);
    }
  });
});

describe('effectivePositionMs', () => {
  it('wraps when looping', () => {
    expect(effectivePositionMs(70_000, 60_000, true)).toBe(10_000);
    expect(effectivePositionMs(130_000, 60_000, true)).toBe(10_000);
  });

  it('clamps at the end without loop', () => {
    expect(effectivePositionMs(70_000, 60_000, false)).toBe(60_000);
    expect(effectivePositionMs(30_000, 60_000, false)).toBe(30_000);
  });

  it('passes through when the duration is still unknown', () => {
    expect(effectivePositionMs(1234, 0, false)).toBe(1234);
    expect(effectivePositionMs(1234, 0, true)).toBe(1234);
  });
});

describe('computeCorrection', () => {
  const THRESHOLD = 2000;

  it('never corrects a player that has no reliable position', () => {
    for (const state of ['unstarted', 'cued', 'buffering'] as const) {
      expect(computeCorrection(0, 90_000, state, THRESHOLD)).toBe('none');
    }
  });

  it('tolerates drift inside the threshold', () => {
    expect(computeCorrection(50_000, 51_999, 'playing', THRESHOLD)).toBe('none');
    expect(computeCorrection(50_000, 48_001, 'playing', THRESHOLD)).toBe('none');
  });

  it('seeks once drift is past the threshold', () => {
    expect(computeCorrection(50_000, 52_001, 'playing', THRESHOLD)).toBe('seek');
    expect(computeCorrection(50_000, 20_000, 'paused', THRESHOLD)).toBe('seek');
    expect(computeCorrection(50_000, 52_000, 'ended', THRESHOLD)).toBe('none');
  });
});
