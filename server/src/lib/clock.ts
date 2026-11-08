export type TimeoutHandle = ReturnType<typeof setTimeout>;

/** Injectable clock so tests can use fake timers. */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): TimeoutHandle;
  clearTimeout(handle: TimeoutHandle): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};
