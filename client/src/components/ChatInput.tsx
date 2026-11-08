import { useEffect, useRef, useState } from 'react';
import { LIMITS } from '@studyroom/shared';
import { useT } from '../i18n/useT';

const TYPING_THROTTLE_MS = 2_000;
const TYPING_IDLE_MS = 2_500;
const COUNTER_FROM = 400;

export interface ChatInputProps {
  disabled: boolean;
  onSend: (text: string) => Promise<void> | void;
  onTyping: (isTyping: boolean) => void;
}

export function ChatInput({ disabled, onSend, onTyping }: ChatInputProps) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const lastTypingSent = useRef(0);
  const idleTimer = useRef<number | null>(null);
  const onTypingRef = useRef(onTyping);
  onTypingRef.current = onTyping;

  const stopTyping = (): void => {
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    idleTimer.current = null;
    if (lastTypingSent.current !== 0) {
      lastTypingSent.current = 0;
      onTypingRef.current(false);
    }
  };

  const announceTyping = (): void => {
    const now = Date.now();
    if (now - lastTypingSent.current > TYPING_THROTTLE_MS) {
      lastTypingSent.current = now;
      onTyping(true);
    }
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  useEffect(() => stopTyping, []);

  const submit = async (): Promise<void> => {
    const text = draft.trim();
    if (!text || disabled) return;
    stopTyping();
    setDraft('');
    await onSend(text);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-end gap-2 rounded-2xl border border-surface1 bg-mantle p-2 focus-within:border-mauve">
        <textarea
          rows={1}
          value={draft}
          disabled={disabled}
          maxLength={LIMITS.MESSAGE_MAX}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.placeholder')}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value.trim()) announceTyping();
            else stopTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          className="max-h-32 min-h-[2.25rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-text placeholder:text-subtext0 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={disabled || !draft.trim()}
          aria-label={t('chat.send')}
          className="shrink-0 rounded-xl bg-mauve p-2 text-base transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12h15M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      {draft.length > COUNTER_FROM ? (
        <p className="px-2 text-right text-[10px] text-overlay0">
          {t('chat.counter', { count: draft.length })}
        </p>
      ) : null}
    </div>
  );
}
