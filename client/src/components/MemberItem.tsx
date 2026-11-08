import type { Member } from '@studyroom/shared';
import { MemberMenu } from './MemberMenu';
import { useT } from '../i18n/useT';

const AVATAR_COLORS = [
  'bg-mauve/20 text-mauve',
  'bg-blue/20 text-blue',
  'bg-green/20 text-green',
  'bg-peach/20 text-peach',
  'bg-pink/20 text-pink',
  'bg-teal/20 text-teal',
  'bg-yellow/20 text-yellow',
  'bg-red/20 text-red',
  'bg-lavender/20 text-lavender',
] as const;

const STATUS_DOT: Record<Member['status'], string> = {
  focusing: 'bg-green',
  break: 'bg-blue',
  away: 'bg-overlay0',
};

function avatarColor(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? 'bg-mauve/20 text-mauve';
}

export interface MemberItemProps {
  member: Member;
  isYou: boolean;
  canManage: boolean;
  onMakeHost: (userId: string) => void;
  onSetModerator: (userId: string, isModerator: boolean) => void;
  onSetMuted: (userId: string, isMuted: boolean) => void;
  onKick: (userId: string) => void;
  onBan: (userId: string) => void;
}

export function MemberItem({
  member,
  isYou,
  canManage,
  onMakeHost,
  onSetModerator,
  onSetMuted,
  onKick,
  onBan,
}: MemberItemProps) {
  const t = useT();
  const isModerator = member.isModerator && !member.isHost;
  const showMenu = canManage && member.online && !member.isHost && !isYou;

  return (
    <li
      className={`group flex items-start gap-3 rounded-xl px-2 py-2 ${
        member.online ? '' : 'opacity-50'
      }`}
    >
      <div className="relative shrink-0">
        <div
          aria-hidden="true"
          className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${avatarColor(
            member.userId,
          )}`}
        >
          {member.nickname.slice(0, 1).toUpperCase()}
        </div>
        <span
          aria-hidden="true"
          title={t(`members.${member.status}`)}
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-base ${
            STATUS_DOT[member.status]
          }`}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {member.isHost ? (
            <svg
              aria-label={t('members.host')}
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="shrink-0 text-yellow"
            >
              <path d="M3 8l4.5 3L12 4l4.5 7L21 8l-1.8 9H4.8L3 8zm2.6 11h12.8v1.6H5.6V19z" />
            </svg>
          ) : null}
          {isModerator ? (
            <svg
              aria-label={t('members.moderator')}
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="shrink-0 text-subtext1"
            >
              <path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z" />
            </svg>
          ) : null}
          {member.isMuted ? (
            <svg
              aria-label={t('members.muted')}
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-red"
            >
              <path d="M15 9.3V6a3 3 0 00-5.9-.6M9 9.5V11a3 3 0 004.6 2.5M12 18a3 3 0 003-3M5 5l14 14" />
            </svg>
          ) : null}
          <span className="truncate text-sm font-medium text-text" title={member.nickname}>
            {member.nickname}
          </span>
          {isYou ? <span className="shrink-0 text-xs text-subtext0">{t('members.you')}</span> : null}
        </div>
        {member.online ? (
          <div className="flex items-center gap-1.5 text-xs text-subtext0">
            <span className="shrink-0">{t(`members.${member.status}`)}</span>
            {member.task ? (
              <>
                <span aria-hidden="true" className="text-overlay0">
                  ·
                </span>
                <span className="truncate text-overlay1" title={member.task}>
                  {member.task}
                </span>
              </>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-subtext0">{t('members.offline')}</p>
        )}
      </div>

      {showMenu ? (
        <div className="flex shrink-0 items-center opacity-0 transition-opacity max-lg:opacity-100 focus-within:opacity-100 group-hover:opacity-100">
          <MemberMenu
            member={member}
            onMakeHost={() => onMakeHost(member.userId)}
            onToggleModerator={() => onSetModerator(member.userId, !member.isModerator)}
            onToggleMute={() => onSetMuted(member.userId, !member.isMuted)}
            onKick={() => onKick(member.userId)}
            onBan={() => onBan(member.userId)}
          />
        </div>
      ) : null}
    </li>
  );
}
