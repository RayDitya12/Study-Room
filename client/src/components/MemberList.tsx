import type { Member, MemberStatus } from '@studyroom/shared';
import { useRoomStore } from '../stores/roomStore';
import { useT } from '../i18n/useT';
import { MemberItem } from './MemberItem';
import { StatusPicker } from './StatusPicker';
import { TaskInput } from './TaskInput';

/** Host first, then online members by join time, then offline ones. */
export function sortMembers(members: Member[]): Member[] {
  return members.slice().sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
    if (a.online !== b.online) return a.online ? -1 : 1;
    return a.joinedAt - b.joinedAt;
  });
}

export interface MemberListProps {
  onUpdateMember: (patch: { status?: MemberStatus; task?: string }) => void;
  onTransferHost: (userId: string) => void;
  onSetModerator: (userId: string, isModerator: boolean) => void;
}

export function MemberList({ onUpdateMember, onTransferHost, onSetModerator }: MemberListProps) {
  const t = useT();
  const members = useRoomStore((s) => s.members);
  const youUserId = useRoomStore((s) => s.youUserId);
  const hostUserId = useRoomStore((s) => s.hostUserId);
  const you = members.find((m) => m.userId === youUserId);
  const sorted = sortMembers(members);

  return (
    <section aria-label={t('members.title')} className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex items-baseline justify-between px-2">
        <h2 className="text-sm font-semibold text-text">{t('members.title')}</h2>
        <span className="text-xs text-subtext0">
          {members.filter((m) => m.online).length}/{members.length}
        </span>
      </header>

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {sorted.map((member) => (
          <MemberItem
            key={member.userId}
            member={member}
            isYou={member.userId === youUserId}
            canManageHost={youUserId === hostUserId}
            onMakeHost={onTransferHost}
            onSetModerator={onSetModerator}
          />
        ))}
      </ul>

      {you ? (
        <div className="space-y-2 border-t border-surface0 pt-3">
          <StatusPicker value={you.status} onChange={(status) => onUpdateMember({ status })} />
          <TaskInput value={you.task} onChange={(task) => onUpdateMember({ task })} />
        </div>
      ) : null}
    </section>
  );
}
