import type { MemberStatus } from '@studyroom/shared';
import { useT } from '../i18n/useT';

const FILL: Record<MemberStatus, string> = {
  // Darker than the official accents so each shape clears 3:1 on the card too.
  focusing: 'bg-success-text',
  break: 'bg-info-text',
  away: 'border-2 border-muted',
};

/**
 * The status as a dot that carries its meaning in shape, not just colour:
 * a full disc (focusing), a donut (break), or an outline (away) — plus an
 * `sr-only` word so assistive tech reads it too.
 */
export function StatusDot({ status }: { status: MemberStatus }) {
  const t = useT();
  return (
    <span className="relative inline-block h-3 w-3 shrink-0">
      <span
        aria-hidden="true"
        className={`absolute inset-0 rounded-full border-2 border-mantle ${
          status === 'away' ? 'border-muted bg-transparent' : FILL[status]
        }`}
      />
      {status === 'break' ? (
        <span aria-hidden="true" className="absolute inset-[3px] rounded-full bg-mantle" />
      ) : null}
      <span className="sr-only">{t(`members.${status}`)}</span>
    </span>
  );
}
