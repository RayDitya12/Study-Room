import { describe, expect, it } from 'vitest';
import { migratePrefs, PREF_DEFAULTS, PREFS_STORAGE_VERSION } from '../lib/prefs';

describe('prefs migration', () => {
  it('fills every newer key with its default', () => {
    const old = { theme: 'dark', lang: 'en', soundOn: true, soundPreset: 'gong' };
    const migrated = migratePrefs(old);
    expect(migrated.theme).toBe('dark');
    expect(migrated.soundPreset).toBe('gong');
    expect(migrated.alertSound).toBe(PREF_DEFAULTS.alertSound);
    expect(migrated.timerStyle).toBe('ring');
    expect(migrated.focusTracking).toBe(false);
    expect(migrated.musicListening).toBe(true);
    expect(Object.keys(migrated).sort()).toEqual(Object.keys(PREF_DEFAULTS).sort());
  });

  it('keeps values that are already stored', () => {
    const migrated = migratePrefs({ ...PREF_DEFAULTS, ambientType: 'rain', alertVolume: 12 });
    expect(migrated.ambientType).toBe('rain');
    expect(migrated.alertVolume).toBe(12);
  });

  it('drops values of the wrong type instead of trusting them', () => {
    const migrated = migratePrefs({ alertVolume: 'loud', soundOn: 'yes', theme: 7 });
    expect(migrated.alertVolume).toBe(PREF_DEFAULTS.alertVolume);
    expect(migrated.soundOn).toBe(true);
    expect(migrated.theme).toBe('system');
  });

  it('survives a missing or unusable stored object', () => {
    for (const stored of [undefined, null, 'nope', 42, []]) {
      expect(migratePrefs(stored)).toEqual(PREF_DEFAULTS);
    }
  });

  it('never leaks a reference to the defaults object', () => {
    const migrated = migratePrefs(undefined);
    expect(migrated).not.toBe(PREF_DEFAULTS);
  });

  it('is versioned so zustand only runs it on older stores', () => {
    expect(PREFS_STORAGE_VERSION).toBe(1);
  });
});
