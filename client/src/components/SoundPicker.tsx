import { useState } from 'react';
import { Dialog } from './Dialog';
import { useT } from '../i18n/useT';
import { playPreset } from '../lib/sound';
import { SOUND_PRESETS, type PresetId } from '../lib/soundPresets';
import { usePrefsStore } from '../stores/prefsStore';

export function SoundPicker() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const soundPreset = usePrefsStore((s) => s.soundPreset);
  const setSoundPreset = usePrefsStore((s) => s.setSoundPreset);

  const pick = (id: PresetId) => {
    setSoundPreset(id);
    playPreset(id);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t('sound.picker')}
        aria-label={t('sound.picker')}
        aria-haspopup="dialog"
        className="rounded-lg p-2 text-subtext0 hover:bg-surface0 hover:text-text"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
        </svg>
      </button>
      <Dialog open={open} title={t('sound.picker')} onClose={() => setOpen(false)}>
        <p className="mb-3 text-sm text-subtext0">{t('sound.pickerHint')}</p>
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {SOUND_PRESETS.map((preset) => (
            <label
              key={preset.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface0"
            >
              <input
                type="radio"
                name="timer-sound"
                value={preset.id}
                checked={soundPreset === preset.id}
                onChange={() => pick(preset.id)}
                className="accent-mauve"
              />
              <span className={soundPreset === preset.id ? 'text-text' : 'text-subtext0'}>
                {t(`sound.presets.${preset.id}`)}
              </span>
            </label>
          ))}
        </div>
      </Dialog>
    </>
  );
}
