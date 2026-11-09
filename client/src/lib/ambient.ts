import { getAudioContext, getBus, resumeAudio } from './audio';
import {
  generateBrown,
  generatePink,
  generateWhite,
  loopBuffer,
  normalize,
  type Rng,
  type Samples,
} from './noise';
import type { AmbientPref } from './prefs';

/**
 * The ambient engine. Everything it makes is local: the loop is generated on
 * this device, the level comes from a local slider, and nothing about it ever
 * reaches the room.
 */

export type AmbientType = Exclude<AmbientPref, 'off'>;

const BUFFER_SECONDS = 6;
const CROSSFADE_SECONDS = 0.15;
/** Fade in and out, so a start or stop never clicks. */
const FADE_SECONDS = 0.3;
const VOLUME_RAMP_SECONDS = 0.1;

interface Filter {
  readonly type: BiquadFilterType;
  readonly freq: number;
}

interface Voice {
  readonly generator: (length: number, rng?: Rng) => Samples;
  /** Headroom for this colour: brighter noise has to be written quieter. */
  readonly gain: number;
  readonly filters?: readonly Filter[];
  /** Amplitude swing of `depth` around `offset`, in Hz. */
  readonly lfo?: { readonly freq: number; readonly depth: number; readonly offset: number };
}

const VOICES: Record<AmbientType, Voice> = {
  white: { generator: generateWhite, gain: 0.25 },
  pink: { generator: generatePink, gain: 0.5 },
  brown: { generator: generateBrown, gain: 0.6 },
  rain: {
    generator: generatePink,
    gain: 0.5,
    filters: [
      { type: 'highpass', freq: 500 },
      { type: 'lowpass', freq: 9000 },
    ],
    lfo: { freq: 0.35, depth: 0.08, offset: 1 },
  },
  waves: {
    generator: generateBrown,
    gain: 0.6,
    filters: [{ type: 'lowpass', freq: 700 }],
    lfo: { freq: 0.08, depth: 0.5, offset: 0.5 },
  },
};

interface Playing {
  readonly type: AmbientType;
  readonly nodes: readonly AudioNode[];
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly lfo: OscillatorNode | null;
  readonly lfoGain: GainNode | null;
}

let playing: Playing | null = null;
const buffers = new Map<string, AudioBuffer>();

function levelFor(type: AmbientType, volume: number): number {
  const clamped = Math.min(100, Math.max(0, volume));
  return (clamped / 100) * VOICES[type].gain;
}

function rampTo(param: AudioParam, to: number, seconds: number, now: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(to, now + seconds);
}

function applyLevel(target: Playing, level: number, seconds: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const swing = VOICES[target.type].lfo;
  rampTo(target.gain.gain, level * (swing?.offset ?? 1), seconds, now);
  if (target.lfoGain) rampTo(target.lfoGain.gain, level * (swing?.depth ?? 0), seconds, now);
}

function dispose(target: Playing): void {
  try {
    target.source.stop();
    target.lfo?.stop();
  } catch {
    // Already stopped: nothing left to tear down.
  }
  for (const node of target.nodes) node.disconnect();
}

function noiseBuffer(ctx: AudioContext, type: AmbientType): AudioBuffer {
  const key = `${type}@${ctx.sampleRate}`;
  const cached = buffers.get(key);
  if (cached) return cached;
  const voice = VOICES[type];
  const length = Math.round(ctx.sampleRate * BUFFER_SECONDS);
  const fade = Math.round(ctx.sampleRate * CROSSFADE_SECONDS);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    // A fresh run per channel: the same noise on both sides would be mono.
    buffer.copyToChannel(normalize(loopBuffer(voice.generator(length + fade), fade)), channel);
  }
  buffers.set(key, buffer);
  return buffer;
}

export function startAmbient(type: AmbientType, volume: number): void {
  if (playing?.type === type) {
    setAmbientVolume(volume);
    return;
  }
  const ctx = getAudioContext();
  const bus = getBus('ambient');
  if (!ctx || !bus) return;

  const current = playing;
  if (current) {
    applyLevel(current, 0, FADE_SECONDS);
    window.setTimeout(() => dispose(current), FADE_SECONDS * 1000 + 30);
  }

  const voice = VOICES[type];
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, type);
  source.loop = true;

  const nodes: AudioNode[] = [source];
  let tail: AudioNode = source;
  for (const filter of voice.filters ?? []) {
    const node = ctx.createBiquadFilter();
    node.type = filter.type;
    node.frequency.value = filter.freq;
    tail.connect(node);
    tail = node;
    nodes.push(node);
  }

  const gain = ctx.createGain();
  tail.connect(gain);
  gain.connect(bus);
  nodes.push(gain);

  let lfo: OscillatorNode | null = null;
  let lfoGain: GainNode | null = null;
  if (voice.lfo) {
    lfoGain = ctx.createGain();
    lfo = ctx.createOscillator();
    lfo.frequency.value = voice.lfo.freq;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    nodes.push(lfo, lfoGain);
  }

  const target: Playing = { type, nodes, source, gain, lfo, lfoGain };
  playing = target;
  gain.gain.value = 0;
  applyLevel(target, levelFor(type, volume), FADE_SECONDS);
  source.start();
  lfo?.start();
  resumeAudio();
}

export function stopAmbient(): void {
  const current = playing;
  if (!current) return;
  playing = null;
  applyLevel(current, 0, FADE_SECONDS);
  window.setTimeout(() => dispose(current), FADE_SECONDS * 1000 + 30);
}

export function setAmbientVolume(volume: number): void {
  const current = playing;
  if (!current) return;
  applyLevel(current, levelFor(current.type, volume), VOLUME_RAMP_SECONDS);
}
