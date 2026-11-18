import { STATUSES, type MemberStatus } from '@studyroom/shared';
import { useT } from '../i18n/useT';

const ACTIVE: Record<MemberStatus, string> = {
  focusing: 'bg-success-soft text-success-text',
  break: 'bg-info-soft text-info-text',
  away: 'bg-surface0 text-text',
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
            value === status ? ACTIVE[status] : 'text-muted hover:text-text'
          }`}
        >
          {t(`members.${status}`)}
        </button>
      ))}
    </div>
  );
}
