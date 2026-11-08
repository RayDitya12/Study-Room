import { useEffect, useRef, useState } from 'react';
import { LIMITS } from '@studyroom/shared';
import { useT } from '../i18n/useT';

const DEBOUNCE_MS = 500;

export interface TaskInputProps {
  value: string;
  onChange: (task: string) => void;
}

/** Local edits are debounced; blur and Enter flush immediately. */
export function TaskInput({ value, onChange }: TaskInputProps) {
  const t = useT();
  const [draft, setDraft] = useState(value);
  const timer = useRef<number | null>(null);
  const lastSent = useRef(value);

  useEffect(() => {
    if (value === lastSent.current) return;
    lastSent.current = value;
    setDraft(value);
  }, [value]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const flush = (next: string): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const trimmed = next.trim();
    if (trimmed === lastSent.current) return;
    lastSent.current = trimmed;
    onChange(trimmed);
  };

  const handleInput = (next: string): void => {
    setDraft(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flush(next), DEBOUNCE_MS);
  };

  return (
    <input
      type="text"
      value={draft}
      maxLength={LIMITS.TASK_MAX}
      placeholder={t('members.taskPlaceholder')}
      aria-label={t('members.taskPlaceholder')}
      onChange={(e) => handleInput(e.target.value)}
      onBlur={(e) => flush(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          flush(e.currentTarget.value);
        }
      }}
      className="w-full rounded-xl border border-surface1 bg-mantle px-3 py-2 text-sm text-text placeholder:text-overlay0 focus:border-mauve focus:outline-none"
    />
  );
}
