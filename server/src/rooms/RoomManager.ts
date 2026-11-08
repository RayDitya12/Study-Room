import type { Clock, TimeoutHandle } from '../lib/clock';
import type { RoomStore } from '../store/RoomStore';
import { noopEmitter, RoomRuntime, type RuntimeEmitter } from './RoomRuntime';

const HOUR_MS = 3_600_000;
const EMPTY_IDLE_UNLOAD_MS = 600_000;
const DAY_MS = 86_400_000;

export interface RoomManagerConfig {
  presenceGraceMs: number;
  maxMembers: number;
  roomTtlDays: number;
}

export interface RoomManagerDeps {
  store: RoomStore;
  clock: Clock;
  config: RoomManagerConfig;
}

export class RoomManager {
  private readonly runtimes = new Map<string, RoomRuntime>();
  private readonly loading = new Map<string, Promise<RoomRuntime | null>>();
  private emitterFactory: (code: string) => RuntimeEmitter = () => noopEmitter;
  private cleanupTimer?: TimeoutHandle;

  constructor(private readonly deps: RoomManagerDeps) {}

  /** Called by the socket server so runtimes can broadcast through socket.io. */
  setEmitterFactory(factory: (code: string) => RuntimeEmitter): void {
    this.emitterFactory = factory;
  }

  getLoaded(code: string): RoomRuntime | undefined {
    return this.runtimes.get(code);
  }

  async getOrLoad(code: string): Promise<RoomRuntime | null> {
    const cached = this.runtimes.get(code);
    if (cached) return cached;
    // Collapse concurrent loads of the same room into one promise.
    const inFlight = this.loading.get(code);
    if (inFlight) return inFlight;

    const promise = (async () => {
      const stored = await this.deps.store.getByCode(code);
      if (!stored) return null;
      const runtime = new RoomRuntime({
        stored,
        store: this.deps.store,
        clock: this.deps.clock,
        emitter: this.emitterFactory(code),
        presenceGraceMs: this.deps.config.presenceGraceMs,
        maxMembers: this.deps.config.maxMembers,
      });
      await runtime.resumeFromStored();
      this.runtimes.set(code, runtime);
      return runtime;
    })();

    this.loading.set(code, promise);
    try {
      return await promise;
    } finally {
      this.loading.delete(code);
    }
  }

  /** Boot recovery: reload every room whose persisted timer is running. */
  async recoverRunningRooms(): Promise<void> {
    const rooms = await this.deps.store.listRunningRooms();
    for (const room of rooms) {
      await this.getOrLoad(room.code);
    }
    if (rooms.length > 0) {
      console.log(`[rooms] recovered ${rooms.length} running room(s)`);
    }
  }

  startCleanupJob(): void {
    const tick = (): void => {
      this.cleanupTimer = this.deps.clock.setTimeout(() => {
        void this.runCleanup().finally(tick);
      }, HOUR_MS);
      const handle = this.cleanupTimer as { unref?: () => void };
      handle.unref?.();
    };
    tick();
  }

  private async runCleanup(): Promise<void> {
    const { store, clock, config } = this.deps;
    try {
      const cutoff = clock.now() - config.roomTtlDays * DAY_MS;
      const deleted = await store.deleteInactiveSince(cutoff);
      if (deleted > 0) console.log(`[rooms] deleted ${deleted} inactive room(s)`);

      for (const [code, runtime] of this.runtimes) {
        if (
          runtime.memberCount() === 0 &&
          clock.now() - runtime.lastActivityAt >= EMPTY_IDLE_UNLOAD_MS
        ) {
          runtime.dispose();
          this.runtimes.delete(code);
        }
      }
    } catch (err) {
      console.error('[rooms] cleanup job failed:', err);
    }
  }

  stopCleanupJob(): void {
    if (this.cleanupTimer !== undefined) {
      this.deps.clock.clearTimeout(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  disposeAll(): void {
    for (const runtime of this.runtimes.values()) runtime.dispose();
    this.runtimes.clear();
  }
}
