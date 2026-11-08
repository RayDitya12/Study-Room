import type { TimerPhase } from '@studyroom/shared';
import { DEFAULT_GAIN, findPreset, reversePreset, type PresetNote, type Wave } from './soundPresets';

let context: AudioContext | null = null;
let gestureListenerInstalled = false;

function getContext(): AudioContext | null {
  try {
    context ??= new AudioContext();
  } catch {
    return null; // audio unavailable: fail silently
  }
  return context;
}

// Browsers start AudioContexts suspended; resume on the first user gesture.
if (typeof window !== 'undefined' && !gestureListenerInstalled) {
  gestureListenerInstalled = true;
  const resume = () => {
    const ctx = getContext();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  };
  window.addEventListener('click', resume);
  window.addEventListener('keydown', resume);
}

function playNote(ctx: AudioContext, wave: Wave, note: PresetNote, startsAt: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(note.freq, startsAt);
  if (note.glideTo) osc.frequency.linearRampToValueAtTime(note.glideTo, startsAt + note.dur);
  gain.gain.setValueAtTime(0, startsAt);
  gain.gain.linearRampToValueAtTime(note.gain ?? DEFAULT_GAIN, startsAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + note.dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startsAt);
  osc.stop(startsAt + note.dur + 0.02);
}

export function playPreset(id: string, options: { descending?: boolean } = {}): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const source = findPreset(id);
  const preset = options.descending ? reversePreset(source) : source;
  const base = ctx.currentTime + 0.02;
  for (const note of preset.notes) playNote(ctx, preset.wave, note, base + note.at);
}

/** The chime that marks a completed phase: rising into focus, falling out of it. */
export function playPhaseChange(toPhase: TimerPhase, presetId: string): void {
  playPreset(presetId, { descending: toPhase !== 'focus' });
}
