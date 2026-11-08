import type { TimerPhase } from '@studyroom/shared';

const STROKE: Record<TimerPhase, string> = {
  focus: 'stroke-mauve',
  break: 'stroke-green',
  longBreak: 'stroke-blue',
};

const SIZE = 240;
const RADIUS = 108;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface TimerRingProps {
  phase: TimerPhase;
  /** 0 = full time left, 1 = phase finished. */
  progress: number;
}

export function TimerRing({ phase, progress }: TimerRingProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-full w-full"
      aria-hidden="true"
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        strokeWidth="10"
        className="stroke-surface0"
      />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        className={`${STROKE[phase]} transition-[stroke] duration-300`}
      />
    </svg>
  );
}
