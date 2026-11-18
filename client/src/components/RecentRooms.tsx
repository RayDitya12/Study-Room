import { useState } from 'react';
import { Link } from 'react-router-dom';
import { describeLastUsed, forgetRoom, readRecentRooms } from '../lib/recentRooms';
import { useT } from '../i18n/useT';

/**
 * The rooms this device has been in, so a returning visitor taps once instead of
 * typing six characters. A row is a link, which means middle-click and
 * "open in new tab" work the way they should; the only thing here that is not
 * navigation is the × that forgets the room.
 */
export function RecentRooms() {
  const t = useT();
  const [rooms, setRooms] = useState(readRecentRooms);

  if (rooms.length === 0) return null;

  const now = Date.now();
  const remove = (code: string): void => {
    forgetRoom(code);
    setRooms(readRecentRooms());
  };

  return (
    <div className="border-t border-surface0 pt-3">
      <h4 className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
        {t('recent.title')}
      </h4>
      <ul className="-mx-1 flex flex-col">
        {rooms.map((room) => {
          const when = describeLastUsed(room.at, now);
          return (
            <li key={room.code} className="flex items-center gap-1">
              <Link
                to={`/r/${room.code}`}
                className="min-w-0 flex-1 rounded-xl px-2 py-1.5 hover:bg-surface0"
              >
                <span className="block truncate text-sm font-medium text-text">
                  {room.name || room.code}
                </span>
                <span className="mt-0.5 flex min-w-0 items-center gap-x-2 text-xs text-muted">
                  <span className="shrink-0 font-mono tracking-[0.18em]">{room.code}</span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">
                    {when.key === 'daysAgo'
                      ? t('recent.daysAgo', { count: when.count })
                      : t(`recent.${when.key}`)}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => remove(room.code)}
                aria-label={t('recent.remove', { code: room.code })}
                className="shrink-0 rounded-lg p-2 text-muted hover:bg-surface0 hover:text-text"
              >
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
