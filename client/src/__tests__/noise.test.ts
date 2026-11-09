import { describe, expect, it } from 'vitest';
import { generateBrown, generatePink, generateWhite, loopBuffer, normalize, type Rng } from '../lib/noise';

/** mulberry32: a tiny deterministic source, so a generator run can be pinned. */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LENGTH = 4096;

/** Pink noise drifts for a long while before settling, so the mean test needs a long run. */
const MEAN_LENGTH = 262_144;

function mean(samples: Float32Array): number {
  let total = 0;
  for (const value of samples) total += value;
  return total / samples.length;
}

/** Mean absolute step between samples: the coarse stand-in for high-frequency energy. */
function roughness(samples: Float32Array): number {
  let total = 0;
  for (let i = 1; i < samples.length; i += 1) {
    total += Math.abs((samples[i] ?? 0) - (samples[i - 1] ?? 0));
  }
  return total / (samples.length - 1);
}

function loudest(samples: Float32Array): number {
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  return peak;
}

describe('noise generators', () => {
  it('returns the requested length', () => {
    for (const generate of [generateWhite, generatePink, generateBrown]) {
      expect(generate(0, seeded(1)).length).toBe(0);
      expect(generate(7, seeded(1)).length).toBe(7);
      expect(generate(LENGTH, seeded(1)).length).toBe(LENGTH);
    }
  });

  it('replays the same run from the same seed', () => {
    for (const generate of [generateWhite, generatePink, generateBrown]) {
      expect(Array.from(generate(64, seeded(7)))).toEqual(Array.from(generate(64, seeded(7))));
      expect(Array.from(generate(64, seeded(7)))).not.toEqual(Array.from(generate(64, seeded(8))));
    }
  });

  it('stays inside the sample range once normalised', () => {
    for (const generate of [generateWhite, generatePink, generateBrown]) {
      const samples = normalize(generate(LENGTH, seeded(3)));
      expect(loudest(samples)).toBeLessThanOrEqual(1);
    }
  });

  it('centres on zero', () => {
    // Brown is a random walk, so its DC offset wanders; the filter bank tames it anyway.
    for (const generate of [generateWhite, generatePink]) {
      expect(Math.abs(mean(generate(MEAN_LENGTH, seeded(5))))).toBeLessThan(0.05);
    }
  });

  it('makes brown noise smoother than white', () => {
    expect(roughness(generateBrown(LENGTH, seeded(9)))).toBeLessThan(
      roughness(generateWhite(LENGTH, seeded(9))),
    );
  });
});

describe('normalize', () => {
  it('scales the loudest sample to the peak', () => {
    const samples = normalize(new Float32Array([0.2, -0.4, 0]), 0.9);
    expect(loudest(samples)).toBeCloseTo(0.9);
    expect(samples[0]).toBeCloseTo(0.45);
  });

  it('leaves silence alone instead of dividing by zero', () => {
    expect(Array.from(normalize(new Float32Array(4)))).toEqual([0, 0, 0, 0]);
  });
});

describe('loopBuffer', () => {
  it('crossfades the extra tail over the head', () => {
    // head 0..3, tail 4..7: every output lands exactly on the midpoint ramp.
    const out = loopBuffer(new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]), 4);
    expect(Array.from(out)).toEqual([4, 4, 4, 4]);
  });

  it('copies everything past the fade untouched', () => {
    const raw = new Float32Array([10, 20, 30, 40, 50, 60, 70]);
    const out = loopBuffer(raw, 2);
    expect(out.length).toBe(5);
    expect(Array.from(out).slice(2)).toEqual([30, 40, 50]);
  });

  it('hands back a copy when there is nothing to fade', () => {
    const raw = new Float32Array([1, 2, 3]);
    const out = loopBuffer(raw, 0);
    expect(Array.from(out)).toEqual([1, 2, 3]);
    expect(out).not.toBe(raw);
  });
});
