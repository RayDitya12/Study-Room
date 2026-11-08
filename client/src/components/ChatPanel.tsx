import { useEffect, useRef, useState } from 'react';
import { useRoomStore } from '../stores/roomStore';
import { useT } from '../i18n/useT';
import { ChatInput } from './ChatInput';
import { MessageItem } from './MessageItem';
import { TypingIndicator } from './TypingIndicator';

const NEAR_BOTTOM_PX = 80;

export interface ChatPanelProps {
  onSend: (text: string) => Promise<void> | void;
  onTyping: (isTyping: boolean) => void;
}

export function ChatPanel({ onSend, onTyping }: ChatPanelProps) {
  const t = useT();
  const messages = useRoomStore((s) => s.messages);
  const youUserId = useRoomStore((s) => s.youUserId);
  const isMuted = useRoomStore(
    (s) => s.members.some((m) => m.userId === s.youUserId && m.isMuted),
  );
  const hasRoom = useRoomStore((s) => s.hasRoom);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const previousCount = useRef<number | null>(null);
  const [showNewPill, setShowNewPill] = useState(false);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const isFirstRender = previousCount.current === null;
    const appended = messages.length > (previousCount.current ?? messages.length);
    previousCount.current = messages.length;
    if (isFirstRender || (appended && stickToBottom.current)) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (appended) setShowNewPill(true);
  }, [messages.length]);

  const handleScroll = (): void => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stickToBottom.current = nearBottom;
    if (nearBottom) setShowNewPill(false);
  };

  const jumpToBottom = (): void => {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = true;
    el.scrollTop = el.scrollHeight;
    setShowNewPill(false);
  };

  return (
    <section aria-label={t('room.chatTab')} className="flex h-full min-h-0 flex-col gap-2">
      <h2 className="px-1 text-sm font-semibold text-text">{t('room.chatTab')}</h2>

      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="h-full space-y-2 overflow-y-auto rounded-2xl bg-mantle p-3"
        >
          {messages.map((item) => (
            <MessageItem key={item.id} item={item} youUserId={youUserId} />
          ))}
        </div>
        {showNewPill ? (
          <button
            type="button"
            onClick={jumpToBottom}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-surface1 px-3 py-1 text-xs text-text shadow-sm hover:bg-surface2"
          >
            {t('chat.newMessages')} ↓
          </button>
        ) : null}
      </div>

      <TypingIndicator />
      {isMuted ? (
        <p className="px-1 text-xs text-red">{t('chat.mutedHint')}</p>
      ) : null}
      <ChatInput disabled={!hasRoom || isMuted} onSend={onSend} onTyping={onTyping} />
    </section>
  );
}
