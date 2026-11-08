import { useNow } from '../hooks/useNow';
import { useRoomStore } from '../stores/roomStore';
import { useT } from '../i18n/useT';

/** Shows who is typing; entries expire locally if no further event arrives. */
export function TypingIndicator() {
  const t = useT();
  const now = useNow(500);
  const typing = useRoomStore((s) => s.typing);
  const members = useRoomStore((s) => s.members);
  const youUserId = useRoomStore((s) => s.youUserId);

  const names = Object.entries(typing)
    .filter(([userId, expiresAt]) => userId !== youUserId && expiresAt > now)
    .map(([userId]) => members.find((m) => m.userId === userId)?.nickname)
    .filter((name): name is string => Boolean(name));

  if (names.length === 0) return <p aria-live="polite" className="h-4 text-xs text-subtext0" />;

  const text =
    names.length === 1
      ? t('chat.typingOne', { name: names[0]! })
      : names.length === 2
        ? t('chat.typingTwo', { a: names[0]!, b: names[1]! })
        : t('chat.typingMany');

  return (
    <p aria-live="polite" className="h-4 text-xs text-subtext0">
      {text}
    </p>
  );
}
