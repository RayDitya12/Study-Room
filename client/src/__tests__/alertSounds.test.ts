import { describe, expect, it } from 'vitest';
import { ALERT_MASTER_GAIN, ALERT_SOUNDS } from '../lib/alertSounds';
import type { AlertSoundPref } from '../lib/prefs';

const VOICED = ALERT_SOUNDS.filter((sound) => sound.id !== 'none');

describe('ALERT_SOUNDS', () => {
  it('lists every alert sound the pref allows, once', () => {
    const ids = ALERT_SOUNDS.map((sound) => sound.id);
    expect(new Set(ids).size).toBe(ids.length);
    const allowed: AlertSoundPref[] = ['chime', 'bell', 'marimba', 'pulse', 'none'];
    expect([...ids].sort()).toEqual([...allowed].sort());
  });

  it('keeps every note inside sane bounds', () => {
    for (const sound of ALERT_SOUNDS) {
      for (const notes of [sound.toFocus, sound.toBreak]) {
        for (const note of notes) {
          expect(note.f).toBeGreaterThan(0);
          expect(note.t).toBeGreaterThanOrEqual(0);
          expect(note.d).toBeGreaterThan(0);
          expect(note.d).toBeLessThanOrEqual(2);
          expect(note.g).toBeGreaterThan(0);
          expect(note.g).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('starts each variant in order', () => {
    for (const sound of ALERT_SOUNDS) {
      for (const notes of [sound.toFocus, sound.toBreak]) {
        const starts = notes.map((note) => note.t);
        expect(starts).toEqual([...starts].sort((a, b) => a - b));
      }
    }
  });

  it('gives every sound that makes noise both variants, and they differ', () => {
    for (const sound of VOICED) {
      expect(sound.wave).not.toBeNull();
      expect(sound.toFocus.length).toBeGreaterThan(0);
      expect(sound.toBreak.length).toBeGreaterThan(0);
      expect(sound.toFocus).not.toEqual(sound.toBreak);
    }
  });

  it('makes the silent option play nothing at all', () => {
    const none = ALERT_SOUNDS.find((sound) => sound.id === 'none');
    expect(none?.wave).toBeNull();
    expect(none?.toFocus).toEqual([]);
    expect(none?.toBreak).toEqual([]);
  });

  it('cannot sum past full scale at maximum volume', () => {
    for (const sound of ALERT_SOUNDS) {
      const loudest = Math.max(0, ...[...sound.toFocus, ...sound.toBreak].map((note) => note.g));
      expect(ALERT_MASTER_GAIN * sound.gain * loudest).toBeLessThanOrEqual(1);
    }
  });
});
