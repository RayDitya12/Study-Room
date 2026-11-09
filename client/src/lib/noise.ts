export type Rng = () => number;
/** Backed by a plain `ArrayBuffer`, which is what `AudioBuffer.copyToChannel` takes. */
export type Samples = Float32Array<ArrayBuffer>;

/**
 * Noise generators for the ambient engine. They are pure apart from the
 * injectable random source, so a test can pin a seed and get the same run back.
 */

export function generateWhite(length: number, rng: Rng = Math.random): Samples {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = rng() * 2 - 1;
  return out;
}

/** Paul Kellet's economical pink-noise filter: a weighted sum of seven one-poles. */
export function generatePink(length: number, rng: Rng = Math.random): Samples {
  const out = new Float32Array(length);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < length; i += 1) {
    const w = rng() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return out;
}

/** Brown (red) noise: a leaky integrator of white noise, so it leans low. */
export function generateBrown(length: number, rng: Rng = Math.random): Samples {
  const out = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i += 1) {
    const w = rng() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    out[i] = last * 3.5;
  }
  return out;
}

/** Scale in place so the loudest sample sits at `peak`, keeping the shape intact. */
export function normalize(samples: Samples, peak = 0.9): Samples {
  let loudest = 0;
  for (const value of samples) loudest = Math.max(loudest, Math.abs(value));
  if (loudest === 0) return samples;
  const scale = peak / loudest;
  samples.forEach((value, index) => {
    samples[index] = value * scale;
  });
  return samples;
}

/**
 * Fold a run of `length + fade` samples into a `length` sample loop: the extra
 * tail is crossfaded over the head, so the last sample and the first one are
 * neighbours of the original run and the seam cannot click.
 */
export function loopBuffer(samples: Samples, fade: number): Samples {
  const length = samples.length - fade;
  if (fade <= 0 || length <= 0) return samples.slice();
  const out = new Float32Array(length);
  for (let i = 0; i < fade; i += 1) {
    const ramp = i / fade;
    out[i] = (samples[i] ?? 0) * ramp + (samples[length + i] ?? 0) * (1 - ramp);
  }
  out.set(samples.subarray(fade, length), fade);
  return out;
}
