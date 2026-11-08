import type { TimerPhase } from '@studyroom/shared';

const NOTE_C5 = 523.25;
const NOTE_E5 = 659.25;
const NOTE_DURATION = 0.15;
const NOTE_GAP = 0.16;
const MAX_GAIN = 0.15;

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

function playNote(ctx: AudioContext, frequency: number, startsAt: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, startsAt);
  gain.gain.linearRampToValueAtTime(MAX_GAIN, startsAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + NOTE_DURATION);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startsAt);
  osc.stop(startsAt + NOTE_DURATION + 0.02);
}

export function playPhaseChange(toPhase: TimerPhase): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const notes = toPhase === 'focus' ? [NOTE_C5, NOTE_E5] : [NOTE_E5, NOTE_C5];
  const base = ctx.currentTime + 0.02;
  notes.forEach((frequency, i) => playNote(ctx, frequency, base + i * NOTE_GAP));
}
