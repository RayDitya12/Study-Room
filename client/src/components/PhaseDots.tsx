import type { TimerPhase } from '@studyroom/shared';
import { useT } from '../i18n/useT';

const FILL: Record<TimerPhase, string> = {
  focus: 'bg-accent-text',
  break: 'bg-success-text',
  longBreak: 'bg-info-text',
};

const RING: Record<TimerPhase, string> = {
  focus: 'ring-accent-text',
  break: 'ring-success-text',
  longBreak: 'ring-info-text',
};

export interface PhaseDotsProps {
  total: number;
  completed: number;
  phase: TimerPhase;
}

/**
 * One dot per focus session in the current set. Completed dots are filled in
 * the phase colour, the cycle now in progress is ringed, and a screen reader
 * gets a plain "Cycle 2 of 4" instead of a row of dots.
 */
export function PhaseDots({ total, completed, phase }: PhaseDotsProps) {
  const t = useT();
  const current = Math.min(completed + 1, total);
  const activeIndex = phase === 'focus' ? Math.min(completed, total - 1) : -1;
  return (
    <div
      role="group"
      aria-label={t('timer.cycle', { current, total })}
      className="flex items-center gap-2"
    >
      {Array.from({ length: total }, (_, index) => {
        const done = index < completed;
        const active = index === activeIndex;
        return (
          <span
            key={index}
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full ${
              done
                ? FILL[phase]
                : active
                  ? `bg-surface1 ring-2 ${RING[phase]}`
                  : 'bg-surface1'
            }`}
          />
        );
      })}
    </div>
  );
}
