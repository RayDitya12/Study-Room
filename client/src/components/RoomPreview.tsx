import { TIMER_PRESETS, type MemberStatus } from '@studyroom/shared';
import { formatRemaining } from '../lib/format';
import { useT } from '../i18n/useT';
import { avatarColor } from './MemberItem';
import { PhaseDots } from './PhaseDots';
import { StatusDot } from './StatusDot';
import { TimerRing } from './TimerRing';

const FACES: { id: string; initial: string; status: MemberStatus; taskKey: 'task1' | 'task2' | null }[] =
  [
    { id: 'anna', initial: 'A', status: 'focusing', taskKey: 'task1' },
    { id: 'bimo', initial: 'B', status: 'focusing', taskKey: 'task2' },
    { id: 'sari', initial: 'S', status: 'break', taskKey: null },
    { id: 'tomas', initial: 'T', status: 'away', taskKey: null },
  ];

/** The classic preset, so the number cannot drift from what a room actually starts at. */
const PREVIEW_MS = (TIMER_PRESETS[0]?.focusMin ?? 25) * 60_000;

/**
 * What the room is before you commit to it. Every piece is a real component
 * with invented input, which is why the whole picture is hidden from assistive
 * tech: a screen reader should hear the sentence above it, not a fake roster it
 * might mistake for the people in front of it.
 */
export function RoomPreview() {
  const t = useT();
  return (
    <section className="card rounded-2xl p-5 sm:p-6">
      <h3 className="text-[1rem] font-semibold text-text">{t('preview.title')}</h3>
      <p className="mt-1 max-w-[54ch] text-sm text-muted">{t('preview.body')}</p>

      <div aria-hidden="true" className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:gap-7">
        <div className="relative h-32 w-32 shrink-0 sm:h-36 sm:w-36">
          <TimerRing phase="focus" status="running" progress={0} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[1.4rem] font-semibold tabular-nums text-text sm:text-[1.6rem]">
              {formatRemaining(PREVIEW_MS)}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent-text">
              {t('timer.focus')}
            </span>
          </div>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-3">
          <PhaseDots total={4} completed={1} phase="focus" />
          <ul className="flex flex-col gap-1.5">
            {FACES.map((face) => (
              <li key={face.id} className="flex items-center gap-2.5">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${avatarColor(
                    face.id,
                  )}`}
                >
                  {face.initial}
                </span>
                <StatusDot status={face.status} />
                <span className="min-w-0 truncate text-sm text-muted">
                  {t(`members.${face.status}`)}
                  {face.taskKey ? ` · ${t(`preview.${face.taskKey}`)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted">{t('preview.note')}</p>
    </section>
  );
}
