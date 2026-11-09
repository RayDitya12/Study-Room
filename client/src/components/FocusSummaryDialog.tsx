import { useEffect, useMemo, useState } from 'react';
import { formatClockTime, formatRemaining } from '../lib/format';
import {
  appendHistory,
  FOCUS_HISTORY_SHOWN,
  readHistory,
  sortSummaries,
  type FocusHistoryEntry,
} from '../lib/focusHistory';
import { useT } from '../i18n/useT';
import { usePrefsStore } from '../stores/prefsStore';
import { useRoomStore } from '../stores/roomStore';
import { Button } from './Button';
import { Dialog } from './Dialog';

export function FocusSummaryDialog() {
  const t = useT();
  const event = useRoomStore((s) => s.focusSummary);
  const youUserId = useRoomStore((s) => s.youUserId);
  const lang = usePrefsStore((s) => s.lang);
  // Read once per session end: the dialog is the only writer of this history.
  const [history, setHistory] = useState<FocusHistoryEntry[]>([]);

  useEffect(() => {
    if (!event) return;
    const mine = event.summaries.find((summary) => summary.userId === youUserId);
    if (!mine) {
      setHistory(readHistory());
      return;
    }
    setHistory(
      appendHistory({
        at: Date.now(),
        focusPct: mine.focusPct,
        awayCount: mine.awayCount,
        activeMs: mine.activeMs,
      }),
    );
  }, [event, youUserId]);

  const others = useMemo(
    () => (event ? sortSummaries(event.summaries.filter((s) => s.userId !== youUserId)) : []),
    [event, youUserId],
  );

  if (!event) return null;
  const mine = event.summaries.find((s) => s.userId === youUserId);

  return (
    <Dialog
      open
      title={t('focus.summaryTitle')}
      onClose={() => useRoomStore.getState().focusSummaryReceived(null)}
    >
      <div className="space-y-4">
        <p className="text-xs text-subtext0">{t(`focus.ended.${event.endedBy}`)}</p>

        {mine ? (
          <div className="rounded-2xl bg-mantle px-4 py-3">
            <p className="text-2xl font-semibold tabular-nums text-text">
              {t('focus.yourResult', { pct: mine.focusPct })}
            </p>
            <p className="mt-1 text-sm text-subtext0">
              {t('focus.leftTab', {
                count: mine.awayCount,
                time: formatRemaining(mine.awayMs),
              })}
            </p>
          </div>
        ) : (
          <p className="rounded-2xl bg-mantle px-4 py-3 text-sm text-subtext0">
            {t('focus.youWereNotTracked')}
          </p>
        )}

        {history.length > 0 ? (
          <div className="space-y-1.5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-overlay0">
              {t('focus.historyTitle')}
            </h3>
            <ul className="space-y-1">
              {history.slice(0, FOCUS_HISTORY_SHOWN).map((entry) => (
                <li key={entry.at} className="flex items-center gap-2 text-sm">
                  <span className="w-12 shrink-0 tabular-nums text-mauve">
                    {t('focus.pctShort', { pct: entry.focusPct })}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-overlay0">
                    {formatClockTime(entry.at, lang)}
                  </span>
                  <span className="flex-1 truncate text-right text-subtext0 tabular-nums">
                    {t('focus.historyLine', {
                      count: entry.awayCount,
                      time: formatRemaining(entry.activeMs),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-overlay0">
            {t('focus.membersTitle')}
          </h3>
          {others.length === 0 ? (
            <p className="text-sm text-subtext0">{t('focus.membersEmpty')}</p>
          ) : (
            <ul className="max-h-52 space-y-1 overflow-y-auto">
              {others.map((summary) => (
                <li key={summary.userId} className="flex items-center gap-2 text-sm">
                  <span className="w-10 shrink-0 tabular-nums text-text">
                    {t('focus.pctShort', { pct: summary.focusPct })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-subtext0" title={summary.nickname}>
                    {summary.nickname}
                  </span>
                  <span className="shrink-0 tabular-nums text-overlay0">
                    {t('focus.awayTimes', {
                      count: summary.awayCount,
                      time: formatRemaining(summary.awayMs),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-overlay0">{t('focus.privacyNote')}</p>

        <div className="flex justify-end">
          <Button
            onClick={() => useRoomStore.getState().focusSummaryReceived(null)}
          >
            {t('common.close')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
