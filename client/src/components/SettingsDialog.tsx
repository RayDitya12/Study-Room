import { useEffect, useState } from 'react';
import {
  LIMITS,
  TIMER_CONTROLS,
  TIMER_PRESETS,
  type RoomSettings,
  type TimerControl,
} from '@studyroom/shared';
import { matchPreset, type PresetValues } from '../lib/timerPresets';
import { useT } from '../i18n/useT';
import { Button } from './Button';
import { Dialog } from './Dialog';

interface NumberField {
  key: 'focusMin' | 'breakMin' | 'longBreakMin' | 'cyclesBeforeLong';
  labelKey: 'settings.focusMin' | 'settings.breakMin' | 'settings.longBreakMin' | 'settings.cycles';
  min: number;
  max: number;
}

const FIELDS: NumberField[] = [
  { key: 'focusMin', labelKey: 'settings.focusMin', min: LIMITS.FOCUS_MIN[0], max: LIMITS.FOCUS_MIN[1] },
  { key: 'breakMin', labelKey: 'settings.breakMin', min: LIMITS.BREAK_MIN[0], max: LIMITS.BREAK_MIN[1] },
  {
    key: 'longBreakMin',
    labelKey: 'settings.longBreakMin',
    min: LIMITS.LONG_BREAK_MIN[0],
    max: LIMITS.LONG_BREAK_MIN[1],
  },
  { key: 'cyclesBeforeLong', labelKey: 'settings.cycles', min: LIMITS.CYCLES[0], max: LIMITS.CYCLES[1] },
];

export interface SettingsDialogProps {
  open: boolean;
  settings: RoomSettings;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: Partial<RoomSettings>) => Promise<boolean>;
}

const chip = (selected: boolean): string =>
  `rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
    selected ? 'bg-mauve/20 text-mauve' : 'bg-mantle text-subtext0 hover:text-text'
  }`;

export function SettingsDialog({ open, settings, busy, onClose, onSave }: SettingsDialogProps) {
  const t = useT();
  const [draft, setDraft] = useState<RoomSettings>(settings);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const presetId = matchPreset(draft);

  const applyPreset = (values: PresetValues): void => {
    setDraft((d) => ({ ...d, ...values }));
  };

  const setNumber = (key: NumberField['key'], raw: string): void => {
    const parsed = Number.parseInt(raw, 10);
    setDraft((d) => ({ ...d, [key]: Number.isNaN(parsed) ? 0 : parsed }));
  };

  const submit = async (): Promise<void> => {
    const patch: Partial<RoomSettings> = {};
    for (const field of FIELDS) {
      const value = Math.min(field.max, Math.max(field.min, draft[field.key]));
      if (value !== settings[field.key]) patch[field.key] = value;
    }
    if (draft.autoStart !== settings.autoStart) patch.autoStart = draft.autoStart;
    if (draft.timerControl !== settings.timerControl) patch.timerControl = draft.timerControl;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    if (await onSave(patch)) onClose();
  };

  return (
    <Dialog open={open} title={t('settings.title')} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="space-y-1.5">
          <span className="block text-sm text-subtext0">{t('settings.presetGroup')}</span>
          <div className="flex flex-wrap gap-1.5">
            {TIMER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-pressed={presetId === preset.id}
                onClick={() => applyPreset(preset)}
                className={chip(presetId === preset.id)}
              >
                {t(`settings.presets.${preset.id}`)}
              </button>
            ))}
            {presetId === 'custom' ? (
              // A status, not a control: there is nothing to click to become custom.
              <span className={chip(true)}>{t('settings.presets.custom')}</span>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((field) => (
            <label key={field.key} className="block space-y-1.5">
              <span className="text-sm text-subtext0">{t(field.labelKey)}</span>
              <input
                type="number"
                inputMode="numeric"
                min={field.min}
                max={field.max}
                value={draft[field.key]}
                onChange={(e) => setNumber(field.key, e.target.value)}
                className="w-full rounded-xl border border-surface1 bg-mantle px-3 py-2 text-sm text-text focus:border-mauve focus:outline-none"
              />
            </label>
          ))}
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-sm text-subtext0">{t('settings.autoStart')}</span>
          <input
            type="checkbox"
            role="switch"
            checked={draft.autoStart}
            onChange={(e) => setDraft((d) => ({ ...d, autoStart: e.target.checked }))}
            className="h-5 w-5 accent-mauve"
          />
        </label>

        <fieldset className="space-y-1.5">
          <legend className="text-sm text-subtext0">{t('settings.timerControl')}</legend>
          <div className="flex gap-1 rounded-xl bg-mantle p-1">
            {TIMER_CONTROLS.map((control: TimerControl) => (
              <button
                key={control}
                type="button"
                aria-pressed={draft.timerControl === control}
                onClick={() => setDraft((d) => ({ ...d, timerControl: control }))}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                  draft.timerControl === control
                    ? 'bg-mauve/20 text-mauve'
                    : 'text-subtext0 hover:text-text'
                }`}
              >
                {t(control === 'host' ? 'settings.controlHost' : 'settings.controlEveryone')}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('settings.cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {t('settings.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
