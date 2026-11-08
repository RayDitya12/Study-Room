import { systemClock, type Clock } from './clock';

export interface RateLimiterOptions {
  /** Maximum burst size (bucket capacity). */
  capacity: number;
  /** Tokens added per millisecond. */
  refillPerMs: number;
  clock?: Clock;
}

export interface RateLimiter {
  allow(key: string): boolean;
  reset(key: string): void;
  clear(): void;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const clock = options.clock ?? systemClock;
  const buckets = new Map<string, { tokens: number; last: number }>();

  return {
    allow(key) {
      const now = clock.now();
      const bucket = buckets.get(key);
      const tokens = bucket
        ? Math.min(options.capacity, bucket.tokens + (now - bucket.last) * options.refillPerMs)
        : options.capacity;
      if (tokens >= 1) {
        buckets.set(key, { tokens: tokens - 1, last: now });
        return true;
      }
      buckets.set(key, { tokens, last: now });
      return false;
    },
    reset(key) {
      buckets.delete(key);
    },
    clear() {
      buckets.clear();
    },
  };
}

export interface FailureLimiter {
  recordFailure(key: string): void;
  isBlocked(key: string): boolean;
}

/** Sliding-window failure counter (used for room password attempts). */
export function createFailureLimiter(maxFailures: number, windowMs: number, clock: Clock = systemClock): FailureLimiter {
  const failures = new Map<string, number[]>();
  return {
    recordFailure(key) {
      const now = clock.now();
      const recent = (failures.get(key) ?? []).filter((t) => now - t < windowMs);
      recent.push(now);
      failures.set(key, recent);
    },
    isBlocked(key) {
      const now = clock.now();
      const recent = (failures.get(key) ?? []).filter((t) => now - t < windowMs);
      failures.set(key, recent);
      return recent.length >= maxFailures;
    },
  };
}
