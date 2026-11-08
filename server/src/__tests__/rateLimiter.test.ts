import { describe, expect, it } from 'vitest';
import { createFailureLimiter, createRateLimiter } from '../lib/rateLimiter';
import type { Clock, TimeoutHandle } from '../lib/clock';

function fakeClock(start = 0): Clock & { advance(ms: number): void } {
  let current = start;
  let nextId = 1;
  const timers = new Map<number, { fn: () => void; at: number }>();
  return {
    now: () => current,
    setTimeout(fn: () => void, ms: number): TimeoutHandle {
      const id = nextId++;
      timers.set(id, { fn, at: current + ms });
      return id as unknown as TimeoutHandle;
    },
    clearTimeout(handle: TimeoutHandle) {
      timers.delete(handle as unknown as number);
    },
    advance(ms: number) {
      current += ms;
    },
  };
}

describe('createRateLimiter (token bucket)', () => {
  it('allows a burst up to capacity, then denies', () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ capacity: 5, refillPerMs: 5 / 5_000, clock });
    for (let i = 0; i < 5; i++) expect(limiter.allow('user')).toBe(true);
    expect(limiter.allow('user')).toBe(false);
  });

  it('refills over time', () => {
    const clock = fakeClock();
    // chat rule: 5 messages per 5 seconds => 1 token/sec
    const limiter = createRateLimiter({ capacity: 5, refillPerMs: 1 / 1_000, clock });
    for (let i = 0; i < 5; i++) limiter.allow('user');
    expect(limiter.allow('user')).toBe(false);
    clock.advance(1_000);
    expect(limiter.allow('user')).toBe(true);
    expect(limiter.allow('user')).toBe(false);
    clock.advance(10_000); // refill caps at capacity
    for (let i = 0; i < 5; i++) expect(limiter.allow('user')).toBe(true);
    expect(limiter.allow('user')).toBe(false);
  });

  it('tracks keys independently', () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ capacity: 1, refillPerMs: 0, clock });
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('a')).toBe(false);
    expect(limiter.allow('b')).toBe(true);
  });

  it('reset/clear restore tokens', () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ capacity: 1, refillPerMs: 0, clock });
    limiter.allow('a');
    expect(limiter.allow('a')).toBe(false);
    limiter.reset('a');
    expect(limiter.allow('a')).toBe(true);
    limiter.clear();
    expect(limiter.allow('a')).toBe(true);
  });
});

describe('createFailureLimiter (sliding window)', () => {
  it('blocks after maxFailures within the window and recovers after it', () => {
    const clock = fakeClock();
    const limiter = createFailureLimiter(5, 60_000, clock);
    for (let i = 0; i < 4; i++) {
      limiter.recordFailure('ip:room');
      expect(limiter.isBlocked('ip:room')).toBe(false);
    }
    limiter.recordFailure('ip:room');
    expect(limiter.isBlocked('ip:room')).toBe(true);
    clock.advance(60_001);
    expect(limiter.isBlocked('ip:room')).toBe(false);
  });

  it('tracks keys independently', () => {
    const clock = fakeClock();
    const limiter = createFailureLimiter(1, 1_000, clock);
    limiter.recordFailure('a');
    expect(limiter.isBlocked('a')).toBe(true);
    expect(limiter.isBlocked('b')).toBe(false);
  });
});
