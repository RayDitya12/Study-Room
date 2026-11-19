import type { MemberStatus } from '@studyroom/shared';
import { useRoomStore } from '../stores/roomStore';
import { useT } from '../i18n/useT';
import { avatarColor } from './MemberItem';
import { sortMembers } from './MemberList';
import { StatusDot } from './StatusDot';
import { StatusPicker } from './StatusPicker';
import { TaskInput } from './TaskInput';

/** Six faces fit a phone row; past that the number is the useful part. */
const MAX_FACES = 6;

export interface PresenceStripProps {
  onUpdate: (patch: { status?: MemberStatus; task?: string }) => void;
}

/**
 * The timer tab on a phone is half empty sky, and the people are the reason the
 * room exists. This is the members column shrunk to what fits under a ring: the
 * faces, and the two controls you actually change. The status and the task are
 * the same store fields the members panel edits, so neither keeps its own copy.
 */
export function PresenceStrip({ onUpdate }: PresenceStripProps) {
  const t = useT();
  const members = useRoomStore((s) => s.members);
  const youUserId = useRoomStore((s) => s.youUserId);

  const you = members.find((m) => m.userId === youUserId);
  const sorted = sortMembers(members);
  const onlineCount = members.filter((m) => m.online).length;
  const faces = sorted.slice(0, MAX_FACES);
  const extra = sorted.length - faces.length;

  return (
    <section
      aria-label={t('presence.title')}
      className="card flex flex-col gap-3 rounded-2xl p-3"
    >
      <header className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-[1rem] font-semibold text-text">{t('presence.title')}</h2>
        <span className="text-xs text-muted">
          {onlineCount}/{members.length}
        </span>
      </header>

      <ul className="flex items-center gap-2 px-1">
        {faces.map((member) => (
          <li key={member.userId} className="relative h-9 w-9 shrink-0">
            <div
              aria-hidden="true"
              title={member.nickname}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${avatarColor(
                member.userId,
              )} ${member.online ? '' : 'opacity-40'}`}
            >
              {member.nickname.slice(0, 1).toUpperCase()}
            </div>
            <span className="absolute -bottom-1 -right-1">
              <StatusDot status={member.status} />
            </span>
            <span className="sr-only">{member.nickname}</span>
          </li>
        ))}
        {extra > 0 ? (
          <li className="flex h-9 items-center rounded-full bg-surface0 px-2 text-xs font-medium text-text">
            +{extra}
            <span className="sr-only">{t('presence.moreAria', { count: extra })}</span>
          </li>
        ) : null}
      </ul>

      {onlineCount <= 1 ? (
        <p className="px-1 text-xs text-muted">{t('members.emptyAlone')}</p>
      ) : null}

      {you ? (
        <div className="space-y-2 border-t border-surface0 pt-3">
          <StatusPicker value={you.status} onChange={(status) => onUpdate({ status })} />
          <TaskInput value={you.task} onChange={(task) => onUpdate({ task })} />
        </div>
      ) : null}
    </section>
  );
}
