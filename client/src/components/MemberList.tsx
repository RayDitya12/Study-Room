import { useState } from 'react';
import { KICK_COOLDOWN_MS, type BlockedMember, type Member, type MemberStatus } from '@studyroom/shared';
import { useRoomStore } from '../stores/roomStore';
import { useT } from '../i18n/useT';
import type { RoomActions } from '../hooks/useRoomConnection';
import { BlockedDialog } from './BlockedDialog';
import { ConfirmDialog, type ConfirmRequest } from './ConfirmDialog';
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
  actions: RoomActions;
}

export function MemberList({ actions }: MemberListProps) {
  const t = useT();
  const members = useRoomStore((s) => s.members);
  const youUserId = useRoomStore((s) => s.youUserId);
  const hostUserId = useRoomStore((s) => s.hostUserId);
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  const [blocks, setBlocks] = useState<BlockedMember[]>([]);
  const [blockedOpen, setBlockedOpen] = useState(false);

  const you = members.find((m) => m.userId === youUserId);
  const isHost = youUserId !== '' && youUserId === hostUserId;
  const sorted = sortMembers(members);
  const kickMinutes = Math.round(KICK_COOLDOWN_MS / 60_000);

  const nameOf = (userId: string): string =>
    members.find((m) => m.userId === userId)?.nickname ?? userId;

  const askModerator = (userId: string, isModerator: boolean): void => {
    const name = nameOf(userId);
    setPending({
      title: t(isModerator ? 'confirm.makeModeratorTitle' : 'confirm.removeModeratorTitle', {
        name,
      }),
      body: t(isModerator ? 'confirm.makeModeratorBody' : 'confirm.removeModeratorBody'),
      confirmLabel: t(isModerator ? 'members.makeModerator' : 'members.removeModerator'),
      danger: false,
      onConfirm: () => void actions.setModerator(userId, isModerator),
    });
  };

  const askHost = (userId: string): void => {
    setPending({
      title: t('confirm.makeHostTitle', { name: nameOf(userId) }),
      body: t('confirm.makeHostBody'),
      confirmLabel: t('members.makeHost'),
      danger: false,
      onConfirm: () => void actions.transferHost(userId),
    });
  };

  const askKick = (userId: string): void => {
    setPending({
      title: t('confirm.kickTitle', { name: nameOf(userId) }),
      body: t('confirm.kickBody', { minutes: kickMinutes }),
      confirmLabel: t('members.kick'),
      danger: true,
      onConfirm: () => void actions.kick(userId),
    });
  };

  const askBan = (userId: string): void => {
    setPending({
      title: t('confirm.banTitle', { name: nameOf(userId) }),
      body: t('confirm.banBody'),
      confirmLabel: t('members.ban'),
      danger: true,
      onConfirm: () => void actions.ban(userId),
    });
  };

  const openBlocked = async (): Promise<void> => {
    const result = await actions.getBlocks();
    if (!result) return;
    setBlocks(result);
    setBlockedOpen(true);
  };

  const unban = async (userId: string): Promise<void> => {
    if (await actions.unban(userId)) {
      setBlocks((prev) => prev.filter((b) => b.userId !== userId));
    }
  };

  const update = (patch: { status?: MemberStatus; task?: string }): void => {
    void actions.updateMember(patch);
  };

  return (
    <section aria-label={t('members.title')} className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex items-center justify-between gap-2 px-2">
        <h2 className="text-sm font-semibold text-text">{t('members.title')}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-subtext0">
            {members.filter((m) => m.online).length}/{members.length}
          </span>
          {isHost ? (
            <button
              type="button"
              onClick={() => void openBlocked()}
              className="rounded-md px-1.5 py-0.5 text-xs text-mauve hover:bg-surface0"
            >
              {t('members.blocked')}
            </button>
          ) : null}
        </div>
      </header>

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {sorted.map((member) => (
          <MemberItem
            key={member.userId}
            member={member}
            isYou={member.userId === youUserId}
            canManage={isHost}
            onMakeHost={askHost}
            onSetModerator={askModerator}
            onSetMuted={(userId, isMuted) => void actions.setMuted(userId, isMuted)}
            onKick={askKick}
            onBan={askBan}
          />
        ))}
      </ul>

      {you ? (
        <div className="space-y-2 border-t border-surface0 pt-3">
          <StatusPicker value={you.status} onChange={(status) => update({ status })} />
          <TaskInput value={you.task} onChange={(task) => update({ task })} />
        </div>
      ) : null}

      <ConfirmDialog request={pending} onCancel={() => setPending(null)} />
      <BlockedDialog
        open={blockedOpen}
        blocks={blocks}
        onClose={() => setBlockedOpen(false)}
        onUnban={(userId) => void unban(userId)}
      />
    </section>
  );
}
