import { STATUSES, type MemberStatus } from '@studyroom/shared';
import { useT } from '../i18n/useT';

const ACTIVE: Record<MemberStatus, string> = {
  focusing: 'bg-green/20 text-green',
  break: 'bg-blue/20 text-blue',
  away: 'bg-surface1 text-subtext0',
};

export interface StatusPickerProps {
  value: MemberStatus;
  onChange: (status: MemberStatus) => void;
}

export function StatusPicker({ value, onChange }: StatusPickerProps) {
  const t = useT();
  return (
    <div
      role="group"
      aria-label={t('members.yourStatus')}
      className="flex gap-1 rounded-xl bg-mantle p-1"
    >
      {STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          aria-pressed={value === status}
          onClick={() => onChange(status)}
          className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
            value === status ? ACTIVE[status] : 'text-subtext0 hover:text-text'
          }`}
        >
          {t(`members.${status}`)}
        </button>
      ))}
    </div>
  );
}
