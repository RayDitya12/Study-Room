import type { Member } from '@studyroom/shared';
import type { MessageItem as MessageItemModel } from '../stores/roomStore';
import { formatClockTime } from '../lib/format';
import { usePrefsStore } from '../stores/prefsStore';
import { useRoomStore } from '../stores/roomStore';
import { useT } from '../i18n/useT';

/** Host names are gold, moderators silver, everyone else the accent colour. */
export function nameColor(member: Member | undefined): string {
  if (member?.isHost) return 'text-yellow';
  if (member?.isModerator) return 'text-subtext1';
  return 'text-mauve';
}

export interface MessageItemProps {
  item: MessageItemModel;
  youUserId: string;
}

export function MessageItem({ item, youUserId }: MessageItemProps) {
  const t = useT();
  const lang = usePrefsStore((s) => s.lang);
  const senderId = item.kind === 'chat' ? item.message.userId : '';
  const color = useRoomStore((s) => nameColor(s.members.find((m) => m.userId === senderId)));

  if (item.kind === 'system') {
    const params = item.phase
      ? { ...item.params, phase: t(`timer.${item.phase}`) }
      : item.params;
    return (
      <p className="py-1 text-center text-xs text-subtext0">{t(item.key, params)}</p>
    );
  }

  const own = item.message.userId === youUserId;
  return (
    <div className={`flex flex-col ${own ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 ${
          own ? 'rounded-br-md bg-mauve/20 text-text' : 'rounded-bl-md bg-surface0 text-text'
        }`}
      >
        {!own ? (
          <p className={`mb-0.5 text-xs font-medium ${color}`}>{item.message.nickname}</p>
        ) : null}
        <p className="whitespace-pre-wrap break-words text-sm">{item.message.text}</p>
      </div>
      <time
        dateTime={new Date(item.message.createdAt).toISOString()}
        className="mt-0.5 px-1 text-[10px] text-overlay0"
      >
        {formatClockTime(item.message.createdAt, lang)}
      </time>
    </div>
  );
}
