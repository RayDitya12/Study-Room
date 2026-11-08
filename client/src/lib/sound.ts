import type { TimerPhase } from '@studyroom/shared';
import { getAudioContext, getBus, resumeAudio } from './audio';
import { DEFAULT_GAIN, findPreset, reversePreset, type PresetNote, type Wave } from './soundPresets';

function playNote(ctx: AudioContext, out: AudioNode, wave: Wave, note: PresetNote, startsAt: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(note.freq, startsAt);
  if (note.glideTo) osc.frequency.linearRampToValueAtTime(note.glideTo, startsAt + note.dur);
  gain.gain.setValueAtTime(0, startsAt);
  gain.gain.linearRampToValueAtTime(note.gain ?? DEFAULT_GAIN, startsAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + note.dur);
  osc.connect(gain).connect(out);
  osc.start(startsAt);
  osc.stop(startsAt + note.dur + 0.02);
}

export function playPreset(id: string, options: { descending?: boolean } = {}): void {
  const ctx = getAudioContext();
  const out = getBus('alerts');
  if (!ctx || !out) return;
  resumeAudio();
  const source = findPreset(id);
  const preset = options.descending ? reversePreset(source) : source;
  const base = ctx.currentTime + 0.02;
  for (const note of preset.notes) playNote(ctx, out, preset.wave, note, base + note.at);
}

/** The chime that marks a completed phase: rising into focus, falling out of it. */
export function playPhaseChange(toPhase: TimerPhase, presetId: string): void {
  playPreset(presetId, { descending: toPhase !== 'focus' });
}
