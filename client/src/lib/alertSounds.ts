import type { TimerPhase } from '@studyroom/shared';
import { getAudioContext, getBus, resumeAudio } from './audio';
import type { AlertSoundPref } from './prefs';

/**
 * The phase-change chimes, written as data so the whole set is one table and
 * stays unit-testable. Times and durations are seconds, gains are relative to
 * the variant's master level.
 */
export interface AlertNote {
  readonly f: number;
  readonly t: number;
  readonly d: number;
  readonly g: number;
}

export interface AlertSound {
  readonly id: AlertSoundPref;
  /** `null` is the silent option: it schedules no oscillator at all. */
  readonly wave: OscillatorType | null;
  /** Written quieter than sine voices, since square waves sum and clip. */
  readonly gain: number;
  readonly toFocus: readonly AlertNote[];
  readonly toBreak: readonly AlertNote[];
}

const note = (f: number, t: number, d: number, g = 1): AlertNote => ({ f, t, d, g });

export const ALERT_SOUNDS = [
  {
    id: 'chime',
    wave: 'sine',
    gain: 1,
    toFocus: [note(523.25, 0, 0.18), note(659.25, 0.15, 0.3)],
    toBreak: [note(659.25, 0, 0.18), note(523.25, 0.15, 0.3)],
  },
  {
    id: 'bell',
    wave: 'sine',
    gain: 1,
    toFocus: [note(880, 0, 0.9), note(1760, 0, 0.5, 0.4)],
    toBreak: [note(659.25, 0, 0.9), note(1318.5, 0, 0.5, 0.4)],
  },
  {
    id: 'marimba',
    wave: 'triangle',
    gain: 1,
    toFocus: [note(392, 0, 0.2), note(493.88, 0.12, 0.2), note(587.33, 0.24, 0.3)],
    toBreak: [note(587.33, 0, 0.2), note(493.88, 0.12, 0.2), note(392, 0.24, 0.3)],
  },
  {
    id: 'pulse',
    wave: 'square',
    gain: 0.3,
    toFocus: [note(880, 0, 0.1), note(880, 0.18, 0.1)],
    toBreak: [note(660, 0, 0.25)],
  },
  { id: 'none', wave: null, gain: 1, toFocus: [], toBreak: [] },
] as const satisfies readonly AlertSound[];

/** A full-volume alert peaks here, before the per-sound and per-note gains. */
export const ALERT_MASTER_GAIN = 0.5;
const ATTACK_S = 0.01;
const PREVIEW_GAP_S = 0.6;

export function findAlertSound(id: string): AlertSound | undefined {
  return ALERT_SOUNDS.find((sound) => sound.id === id);
}

function levelFor(volume: number, sound: AlertSound): number {
  const clamped = Math.min(100, Math.max(0, volume));
  return (clamped / 100) * ALERT_MASTER_GAIN * sound.gain;
}

function schedule(
  ctx: AudioContext,
  out: AudioNode,
  sound: AlertSound,
  notes: readonly AlertNote[],
  startAt: number,
  level: number,
): void {
  if (!sound.wave || level <= 0) return;
  for (const item of notes) {
    const from = startAt + item.t;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = sound.wave;
    osc.frequency.setValueAtTime(item.f, from);
    env.gain.setValueAtTime(0, from);
    env.gain.linearRampToValueAtTime(level * item.g, from + ATTACK_S);
    env.gain.exponentialRampToValueAtTime(0.0001, from + item.d);
    osc.connect(env).connect(out);
    osc.start(from);
    osc.stop(from + item.d + 0.02);
  }
}

function alertsBus(): { ctx: AudioContext; out: GainNode } | null {
  const ctx = getAudioContext();
  const out = getBus('alerts');
  if (!ctx || !out) return null;
  resumeAudio();
  return { ctx, out };
}

/** The chime that marks a completed phase: rising into focus, falling out of it. */
export function playAlert(id: AlertSoundPref, toPhase: TimerPhase, volume: number): void {
  const sound = findAlertSound(id);
  // Checked before the bus so the silent option never opens an AudioContext.
  if (!sound?.wave) return;
  const bus = alertsBus();
  if (!bus) return;
  const notes = toPhase === 'focus' ? sound.toFocus : sound.toBreak;
  schedule(bus.ctx, bus.out, sound, notes, bus.ctx.currentTime + 0.02, levelFor(volume, sound));
}

/** Both variants of one sound, back to back, so a single click demonstrates it. */
export function previewAlert(id: AlertSoundPref, volume: number): void {
  const sound = findAlertSound(id);
  if (!sound?.wave) return;
  const bus = alertsBus();
  if (!bus) return;
  const level = levelFor(volume, sound);
  const base = bus.ctx.currentTime + 0.02;
  schedule(bus.ctx, bus.out, sound, sound.toFocus, base, level);
  schedule(bus.ctx, bus.out, sound, sound.toBreak, base + PREVIEW_GAP_S, level);
}
