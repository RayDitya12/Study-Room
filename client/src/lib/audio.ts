/**
 * One lazily created AudioContext shared by every sound the app synthesises,
 * plus a `GainNode` bus per feature so a feature can set its own level without
 * touching the others. WebAudio is optional: if it is missing, every helper
 * returns null and callers stay silent.
 */

let context: AudioContext | null = null;
let gestureInstalled = false;
const buses = new Map<AudioBus, GainNode>();

export type AudioBus = 'alerts' | 'ambient';

export function getAudioContext(): AudioContext | null {
  try {
    context ??= new AudioContext();
  } catch {
    return null; // audio unavailable: fail silently
  }
  return context;
}

/** Browsers start a fresh context suspended until the user interacts. */
export function resumeAudio(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
}

if (typeof window !== 'undefined' && !gestureInstalled) {
  gestureInstalled = true;
  window.addEventListener('click', resumeAudio);
  window.addEventListener('keydown', resumeAudio);
}

export function getBus(id: AudioBus): GainNode | null {
  const ctx = getAudioContext();
  if (!ctx) return null;
  const existing = buses.get(id);
  if (existing) return existing;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  buses.set(id, gain);
  return gain;
}
