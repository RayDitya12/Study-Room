import { useEffect, useMemo, useRef, useState } from 'react';
import { searchPalette, type Command, type CommandId } from '../lib/commands';
import { useT } from '../i18n/useT';
import { Dialog } from './Dialog';

export interface CommandPaletteProps {
  open: boolean;
  commands: Command[];
  onClose: () => void;
  onRun: (id: CommandId) => void;
}

/**
 * Ctrl/Cmd+K. The list is the room's own permissions, not a menu of things that
 * might fail: what you cannot do is still there, greyed, so the answer to
 * "why can't I start the timer" is on screen rather than in a toast.
 */
export function CommandPalette({ open, commands, onClose, onRun }: CommandPaletteProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const results = useMemo(() => searchPalette(commands, query), [commands, query]);
  // Every command stays walkable, including the ones that cannot be run: the
  // point of stopping on one is to read why. The index is clamped rather than
  // looked up, so an arrow press continues from where the highlight really is
  // even just after the list has shortened.
  const index = Math.min(active, Math.max(0, results.length - 1));
  const current = results[index];

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!current) return;
    const node = listRef.current?.querySelector(`[data-id="${current.id}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const move = (step: number): void => {
    if (!current) return;
    // Around the end and back: a list you can walk in one direction only is
    // annoying to leave, and the first command is usually the one you want.
    setActive((index + step + results.length) % results.length);
  };

  const run = (command: Command | undefined): void => {
    if (!command?.enabled) return;
    onClose();
    onRun(command.id);
  };

  return (
    <Dialog open={open} title={t('palette.title')} onClose={onClose}>
      <div className="space-y-3">
        <label className="block space-y-1.5">
          <span className="sr-only">{t('palette.search')}</span>
          <input
            autoFocus
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={current ? `palette-option-${current.id}` : undefined}
            autoComplete="off"
            value={query}
            placeholder={t('palette.placeholder')}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                move(1);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                move(-1);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(current);
              }
            }}
            className="w-full rounded-xl border border-surface1 bg-mantle px-3 py-2 text-sm text-text focus:border-mauve focus:outline-none"
          />
        </label>

        {results.length === 0 ? (
          <p className="text-sm text-muted">{t('palette.empty')}</p>
        ) : (
          <ul
            ref={listRef}
            id="palette-list"
            role="listbox"
            aria-label={t('palette.title')}
            className="-mx-2 max-h-72 overflow-y-auto px-2"
          >
            {results.map((command) => {
              const isCurrent = command.id === current?.id;
              return (
                <li
                  key={command.id}
                  id={`palette-option-${command.id}`}
                  data-id={command.id}
                  role="option"
                  aria-selected={isCurrent}
                  aria-disabled={!command.enabled}
                  onMouseMove={() => setActive(results.indexOf(command))}
                  onClick={() => run(command)}
                  className={`cursor-pointer truncate rounded-lg px-3 py-2 text-sm ${
                    isCurrent
                      ? 'bg-accent-soft text-accent-text'
                      : command.enabled
                        ? 'text-text'
                        : 'text-muted'
                  }`}
                >
                  {command.label}
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-muted">
          {current && !current.enabled ? t('palette.locked') : t('palette.hint')}
        </p>
      </div>
    </Dialog>
  );
}
