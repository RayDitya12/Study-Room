import { useState } from 'react';
import { getRemainingMs, type RoomSettings } from '@studyroom/shared';
import { serverNowEstimate } from '../lib/clock';
import { formatRemaining } from '../lib/format';
import { useNow } from '../hooks/useNow';
import { useRoomStore } from '../stores/roomStore';
import { useT } from '../i18n/useT';
import type { TimerAction } from '../hooks/useRoomConnection';
import { Button } from './Button';
import { PhaseDots } from './PhaseDots';
import { SettingsDialog } from './SettingsDialog';
import { TimerRing } from './TimerRing';

export interface TimerCardProps {
  onTimerAction: (action: TimerAction) => Promise<void>;
  onUpdateSettings: (patch: Partial<RoomSettings>) => Promise<boolean>;
}

export function TimerCard({ onTimerAction, onUpdateSettings }: TimerCardProps) {
  const t = useT();
  useNow(250);
  const timer = useRoomStore((s) => s.timer);
  const settings = useRoomStore((s) => s.settings);
  const youUserId = useRoomStore((s) => s.youUserId);
  const hostUserId = useRoomStore((s) => s.hostUserId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!timer || !settings) return null;

  const isHost = youUserId === hostUserId;
  const canControl = isHost || settings.timerControl === 'everyone';
  const remainingMs = getRemainingMs(timer, serverNowEstimate());
  const progress =
    timer.phaseDurationMs > 0 ? 1 - remainingMs / timer.phaseDurationMs : 0;

  const run = async (action: TimerAction): Promise<void> => {
    setBusy(true);
    try {
      await onTimerAction(action);
    } finally {
      setBusy(false);
    }
  };

  const save = async (patch: Partial<RoomSettings>): Promise<boolean> => {
    setSaving(true);
    try {
      return await onUpdateSettings(patch);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-label={t('room.timerTab')}
      className="flex h-full flex-col items-center justify-center gap-5 rounded-2xl bg-mantle p-6"
    >
      <div className="relative mx-auto aspect-square w-full max-w-[240px]">
        <TimerRing phase={timer.phase} progress={progress} />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span
            role="timer"
            aria-live="off"
            className="font-mono text-5xl font-semibold tabular-nums text-text"
          >
            {formatRemaining(remainingMs)}
          </span>
          <span className="text-sm font-medium text-subtext0">{t(`timer.${timer.phase}`)}</span>
          <PhaseDots total={settings.cyclesBeforeLong} completed={timer.completedFocus} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          onClick={() => void run(timer.status === 'running' ? 'pause' : 'start')}
          disabled={!canControl || busy}
          className="min-w-24"
        >
          {t(timer.status === 'running' ? 'timer.pause' : 'timer.start')}
        </Button>
        <Button variant="secondary" onClick={() => void run('reset')} disabled={!canControl || busy}>
          {t('timer.reset')}
        </Button>
        <Button variant="secondary" onClick={() => void run('skip')} disabled={!canControl || busy}>
          {t('timer.skip')}
        </Button>
        {isHost ? (
          <Button
            variant="ghost"
            aria-label={t('room.settings')}
            title={t('room.settings')}
            onClick={() => setSettingsOpen(true)}
            className="px-2.5"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09c0 .68.4 1.3 1.03 1.56a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.26.63.88 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09c-.68 0-1.3.4-1.51.97z" />
            </svg>
          </Button>
        ) : null}
      </div>

      {!canControl ? <p className="text-xs text-subtext0">{t('timer.hostOnly')}</p> : null}
      {!isHost ? (
        <p className="text-center text-xs text-overlay0">
          {t('timer.summary', {
            focus: settings.focusMin,
            break: settings.breakMin,
            long: settings.longBreakMin,
            cycles: settings.cyclesBeforeLong,
          })}
        </p>
      ) : null}

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        busy={saving}
        onClose={() => setSettingsOpen(false)}
        onSave={save}
      />
    </section>
  );
}
