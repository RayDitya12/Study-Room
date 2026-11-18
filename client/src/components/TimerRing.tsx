import type { TimerPhase, TimerStatus } from '@studyroom/shared';

const STROKE: Record<TimerPhase, string> = {
  focus: 'stroke-accent-text',
  break: 'stroke-success-text',
  longBreak: 'stroke-info-text',
};

const SIZE = 240;
const RADIUS = 108;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** The whole ring is one colour; only how much of it is drawn changes. */
const OPACITY: Record<TimerStatus, number> = {
  // Idle: a full ring sitting quiet so the card never reads as dead.
  idle: 0.28,
  // Running: at full strength, depleting.
  running: 1,
  // Paused: clearly dimmed, and the label in the middle says why.
  paused: 0.45,
};

export interface TimerRingProps {
  phase: TimerPhase;
  status: TimerStatus;
  /** 0 = full time left, 1 = phase finished. */
  progress: number;
}

export function TimerRing({ phase, status, progress }: TimerRingProps) {
  const remaining = 1 - Math.min(1, Math.max(0, progress));
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-full w-full"
      aria-hidden="true"
    >
      <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth="10" className="stroke-surface0" />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - remaining)}
        strokeOpacity={OPACITY[status]}
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        className={`${STROKE[phase]} transition-[stroke-dashoffset,stroke-opacity] duration-[250ms] ease-linear`}
      />
    </svg>
  );
}
