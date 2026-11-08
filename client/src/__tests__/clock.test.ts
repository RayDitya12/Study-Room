import { describe, expect, it } from 'vitest';
import { selectOffset, type SyncSample } from '../lib/clock';

describe('selectOffset', () => {
  it('picks the sample with the smallest round trip', () => {
    const samples: SyncSample[] = [
      // rtt 500 -> offset 1000 + 250 - 500 = 750
      { clientSentAt: 0, serverNow: 1_000, receivedAt: 500 },
      // rtt 100 -> offset 1000 + 50 - 100 = 950
      { clientSentAt: 0, serverNow: 1_000, receivedAt: 100 },
      // rtt 300 -> offset 1000 + 150 - 300 = 850
      { clientSentAt: 0, serverNow: 1_000, receivedAt: 300 },
    ];
    expect(selectOffset(samples)).toBe(950);
  });

  it('halves the round trip so a symmetric link yields the true offset', () => {
    const serverAheadBy = 2_000;
    const sentAt = 10_000;
    const rtt = 80;
    const sample: SyncSample = {
      clientSentAt: sentAt,
      serverNow: sentAt + rtt / 2 + serverAheadBy,
      receivedAt: sentAt + rtt,
    };
    expect(selectOffset([sample])).toBe(serverAheadBy);
  });

  it('ignores samples whose reply predates the request', () => {
    expect(selectOffset([{ clientSentAt: 100, serverNow: 0, receivedAt: 50 }])).toBeNull();
  });

  it('returns null without usable samples', () => {
    expect(selectOffset([])).toBeNull();
  });
});
