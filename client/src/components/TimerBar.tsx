import type { TimerPhase, TimerStatus } from '@studyroom/shared';

const FILL: Record<TimerPhase, string> = {
  focus: 'bg-accent-text',
  break: 'bg-success-text',
  longBreak: 'bg-info-text',
};

const OPACITY: Record<TimerStatus, number> = { idle: 0.3, running: 1, paused: 0.5 };

export interface TimerBarProps {
  phase: TimerPhase;
  status: TimerStatus;
  /** 0 = full time left, 1 = phase finished. */
  progress: number;
}

export function TimerBar({ phase, status, progress }: TimerBarProps) {
  const remaining = 1 - Math.min(1, Math.max(0, progress));
  return (
    <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-surface0">
      <div
        className="h-full rounded-full transition-[width,opacity] duration-[250ms] ease-linear"
        style={{ width: `${remaining * 100}%`, opacity: OPACITY[status] }}
      >
        <div className={`h-full w-full rounded-full ${FILL[phase]}`} />
      </div>
    </div>
  );
}
