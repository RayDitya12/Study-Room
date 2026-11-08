import type { TimerPhase } from '@studyroom/shared';

const FILL: Record<TimerPhase, string> = {
  focus: 'bg-mauve',
  break: 'bg-green',
  longBreak: 'bg-blue',
};

export interface TimerBarProps {
  phase: TimerPhase;
  /** 0 = full time left, 1 = phase finished. */
  progress: number;
}

export function TimerBar({ phase, progress }: TimerBarProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-surface0">
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${FILL[phase]}`}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}
