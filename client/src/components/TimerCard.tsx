import { useState } from 'react';
import { getRemainingMs, type RoomSettings } from '@studyroom/shared';
import { serverNowEstimate } from '../lib/clock';
import { formatRemaining } from '../lib/format';
import { nextPhase } from '../lib/nextPhase';
import { canControlTimer } from '../lib/permissions';
import { matchPreset } from '../lib/timerPresets';
import { useNow } from '../hooks/useNow';
import { usePrefsStore } from '../stores/prefsStore';
import { useRoomStore } from '../stores/roomStore';
import { useT } from '../i18n/useT';
import type { TimerAction } from '../hooks/useRoomConnection';
import { Button } from './Button';
import { PhaseDots } from './PhaseDots';
import { SettingsDialog } from './SettingsDialog';
import { TimerBar } from './TimerBar';
import { TimerRing } from './TimerRing';

export interface TimerCardProps {
  onTimerAction: (action: TimerAction) => Promise<void>;
  onUpdateSettings: (patch: Partial<RoomSettings>) => Promise<boolean>;
  /** The gear and the command palette both open this dialog, so the page owns it. */
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
}

export function TimerCard({
  onTimerAction,
  onUpdateSettings,
  settingsOpen,
  onSettingsOpenChange,
}: TimerCardProps) {
  const t = useT();
  useNow(250);
  const timer = useRoomStore((s) => s.timer);
  const settings = useRoomStore((s) => s.settings);
  const youUserId = useRoomStore((s) => s.youUserId);
  const hostUserId = useRoomStore((s) => s.hostUserId);
  const isModerator = useRoomStore(
    (s) => s.members.find((m) => m.userId === s.youUserId)?.isModerator === true,
  );
  const timerStyle = usePrefsStore((s) => s.timerStyle);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!timer || !settings) return null;

  const isHost = youUserId === hostUserId;
  const canControl = canControlTimer({ isHost, isModerator }, settings.timerControl);
  const remainingMs = getRemainingMs(timer, serverNowEstimate());
  const progress =
    timer.phaseDurationMs > 0 ? 1 - remainingMs / timer.phaseDurationMs : 0;
  // Asked of the shared machine rather than re-derived here, so the long break
  // after the last cycle cannot disagree with the server's.
  const next = nextPhase(timer, settings);

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
      className="card flex h-full flex-col items-center justify-center gap-4 rounded-2xl p-4 sm:gap-5 sm:p-6 lg:gap-4"
    >
      {/* The digits are aria-live="off" on purpose, so the one thing worth
          hearing — that the room has switched to break — gets its own region.
          The text only changes when the phase does. */}
      <p role="status" className="sr-only">
        {t('timer.phaseNow', { phase: t(`timer.${timer.phase}`) })}
      </p>

      {timerStyle === 'minimal' ? (
        <div className="flex w-full max-w-[320px] flex-col items-center gap-3">
          <span
            role="timer"
            aria-live="off"
            className="font-mono text-6xl font-semibold tabular-nums tracking-tight text-text"
          >
            {formatRemaining(remainingMs)}
          </span>
          <span className="text-sm font-medium text-muted">{t(`timer.${timer.phase}`)}</span>
          {timer.status === 'paused' ? (
            <span className="rounded-full bg-surface0 px-2 py-0.5 text-xs font-medium text-text">
              {t('timer.paused')}
            </span>
          ) : null}
          <TimerBar phase={timer.phase} status={timer.status} progress={progress} />
          <PhaseDots
            total={settings.cyclesBeforeLong}
            completed={timer.completedFocus}
            phase={timer.phase}
          />
        </div>
      ) : (
        <div className="relative mx-auto aspect-square w-full max-w-[240px] sm:max-w-[260px] xl:max-w-[300px] 2xl:max-w-[340px]">
          <TimerRing phase={timer.phase} status={timer.status} progress={progress} />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span
              role="timer"
              aria-live="off"
              className="font-mono text-5xl font-semibold tabular-nums text-text"
            >
              {formatRemaining(remainingMs)}
            </span>
            <span className="text-sm font-medium text-muted">{t(`timer.${timer.phase}`)}</span>
            {timer.status === 'paused' ? (
              <span className="rounded-full bg-surface0 px-2 py-0.5 text-xs font-medium text-text">
                {t('timer.paused')}
              </span>
            ) : null}
            <PhaseDots
              total={settings.cyclesBeforeLong}
              completed={timer.completedFocus}
              phase={timer.phase}
            />
          </div>
        </div>
      )}

      {/* One row, one height. The primary action keeps its word because start
          and pause are not obvious from an icon; reset, skip and settings are,
          so they stay square and the row does not grow around them. */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          onClick={() => void run(timer.status === 'running' ? 'pause' : 'start')}
          disabled={!canControl || busy}
          className="phase-button h-10 min-w-24"
        >
          {t(timer.status === 'running' ? 'timer.pause' : 'timer.start')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void run('reset')}
          disabled={!canControl || busy}
          aria-label={t('timer.reset')}
          title={t('timer.reset')}
          className="flex h-10 w-10 items-center justify-center px-0!"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3.2-6.9M3 4v5h5" />
          </svg>
        </Button>
        <Button
          variant="secondary"
          onClick={() => void run('skip')}
          disabled={!canControl || busy}
          aria-label={t('timer.skip')}
          title={t('timer.skip')}
          className="flex h-10 w-10 items-center justify-center px-0!"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 4l10 8-10 8zM19 5v14" />
          </svg>
        </Button>
        {isHost ? (
          <Button
            variant="ghost"
            aria-label={t('room.settings')}
            title={t('room.settings')}
            onClick={() => onSettingsOpenChange(true)}
            className="flex h-10 w-10 items-center justify-center px-0!"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09c0 .68.4 1.3 1.03 1.56a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.26.63.88 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09c-.68 0-1.3.4-1.51.97z" />
            </svg>
          </Button>
        ) : null}
      </div>

      {!canControl ? (
        <p className="text-xs text-muted">{t('timer.hostControls')}</p>
      ) : null}
      <p className="text-center text-sm text-muted">
        {t('timer.next', {
          phase: t(`timer.${next.phase}`),
          duration: formatRemaining(next.durationMs),
        })}
      </p>
      <p className="text-center text-xs text-muted">
        {t('timer.summary', {
          name: t(`timer.preset.${matchPreset(settings)}`),
          focus: settings.focusMin,
          break: settings.breakMin,
          long: settings.longBreakMin,
          cycles: settings.cyclesBeforeLong,
        })}
      </p>

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        busy={saving}
        onClose={() => onSettingsOpenChange(false)}
        onSave={save}
      />
    </section>
  );
}
