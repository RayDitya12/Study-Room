import type { Ack } from '@studyroom/shared';

export interface SyncSample {
  clientSentAt: number;
  serverNow: number;
  receivedAt: number;
}

/** The sample with the smallest RTT gives the most reliable offset. */
export function selectOffset(samples: SyncSample[]): number | null {
  let best: { rtt: number; offset: number } | null = null;
  for (const s of samples) {
    const rtt = s.receivedAt - s.clientSentAt;
    if (rtt < 0) continue;
    const offset = s.serverNow + rtt / 2 - s.receivedAt;
    if (best === null || rtt < best.rtt) best = { rtt, offset };
  }
  return best ? best.offset : null;
}

interface TimeSyncSocket {
  emit(
    event: 'time:sync',
    payload: { clientSentAt: number },
    ack: (res: Ack<{ clientSentAt: number; serverNow: number }>) => void,
  ): void;
}

const SAMPLES_PER_ROUND = 5;
const SAMPLE_SPACING_MS = 200;
const RESYNC_INTERVAL_MS = 30_000;
const SAMPLE_TIMEOUT_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class ClockSync {
  private offset = 0;
  private socket: TimeSyncSocket | null = null;
  private interval: number | null = null;
  private onVisibility: (() => void) | null = null;

  serverNowEstimate(): number {
    return Date.now() + this.offset;
  }

  getOffset(): number {
    return this.offset;
  }

  async start(socket: unknown): Promise<void> {
    this.socket = socket as TimeSyncSocket;
    await this.runRound();
    this.interval = window.setInterval(() => void this.runRound(), RESYNC_INTERVAL_MS);
    this.onVisibility = () => {
      if (document.visibilityState === 'visible') void this.runRound();
    };
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop(): void {
    if (this.interval !== null) window.clearInterval(this.interval);
    if (this.onVisibility) document.removeEventListener('visibilitychange', this.onVisibility);
    this.interval = null;
    this.onVisibility = null;
    this.socket = null;
  }

  private async runRound(): Promise<void> {
    const socket = this.socket;
    if (!socket) return;
    const samples: SyncSample[] = [];
    for (let i = 0; i < SAMPLES_PER_ROUND; i++) {
      const sample = await this.takeSample(socket);
      if (sample) samples.push(sample);
      if (i < SAMPLES_PER_ROUND - 1) await sleep(SAMPLE_SPACING_MS);
    }
    const offset = selectOffset(samples);
    if (offset !== null) this.offset = offset;
  }

  private takeSample(socket: TimeSyncSocket): Promise<SyncSample | null> {
    return new Promise((resolve) => {
      const clientSentAt = Date.now();
      const timeout = window.setTimeout(() => resolve(null), SAMPLE_TIMEOUT_MS);
      socket.emit('time:sync', { clientSentAt }, (res) => {
        window.clearTimeout(timeout);
        if (res.ok) {
          resolve({ clientSentAt, serverNow: res.data.serverNow, receivedAt: Date.now() });
        } else {
          resolve(null);
        }
      });
    });
  }
}

export const clockSync = new ClockSync();

export function serverNowEstimate(): number {
  return clockSync.serverNowEstimate();
}
