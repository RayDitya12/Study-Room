/**
 * The command palette's list: what can be done right now, and what the typed
 * text should match. Both halves are pure so the ordering can be argued with in
 * a test instead of by clicking around a dialog.
 */

import type { Translate } from '../i18n';

export type CommandId =
  | 'timer.toggle'
  | 'timer.reset'
  | 'timer.skip'
  | 'room.copyLink'
  | 'room.settings'
  | 'room.leave'
  | 'tab.timer'
  | 'tab.members'
  | 'tab.chat'
  | 'tab.music'
  | 'status.focusing'
  | 'status.break'
  | 'status.away'
  | 'view.theme'
  | 'view.language'
  | 'view.sound'
  | 'media.toggle';

export interface Command {
  id: CommandId;
  /** What the list shows, already translated. */
  label: string;
  /** Extra words to match on, so "members" finds "Who is here". */
  aliases: string;
  /** A command the room will not let this person run stays in the list, greyed. */
  enabled: boolean;
}

const normalise = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * 4 the whole label, 3 it starts with, 2 it appears inside, 1 only in the
 * aliases, 0 every character present in order, and -1 for nothing. Typing a
 * whole label is worth more than any of these, which is decided by the caller.
 */
function rank(label: string, aliases: string, query: string): number {
  if (label === query) return 4;
  if (label.startsWith(query)) return 3;
  if (label.includes(query)) return 2;
  if (aliases.includes(query)) return 1;
  let cursor = 0;
  for (const char of query) {
    cursor = label.indexOf(char, cursor);
    if (cursor === -1) return -1;
    cursor += 1;
  }
  return 0;
}

/**
 * Every word typed has to land somewhere, and the best-matching command comes
 * first. Sorting is stable, so two commands that match equally stay in the
 * order they were given.
 */
export function searchPalette<T extends Pick<Command, 'label' | 'aliases'>>(
  items: T[],
  query: string,
): T[] {
  const q = normalise(query);
  if (!q) return [...items];
  const terms = q.split(' ');
  const matched: { item: T; score: number }[] = [];
  for (const item of items) {
    const label = normalise(item.label);
    const aliases = normalise(item.aliases);
    // The weakest word decides the standing: a command that only half matches
    // should not outrank one that matches all the way through. Typing a whole
    // label, in order, beats any partial.
    const scores = terms.map((term) => rank(label, aliases, term));
    if (scores.some((score) => score < 0)) continue;
    matched.push({ item, score: label === q ? 5 : Math.min(...scores) });
  }
  return matched.sort((a, b) => b.score - a.score).map((entry) => entry.item);
}

/** What the room will let this person do, as far as the list can tell. */
export interface CommandAccess {
  inRoom: boolean;
  canControlTimer: boolean;
  isHost: boolean;
  /** The music panel exists, so the tab can be opened. */
  hasMusic: boolean;
  /** Something is actually loaded, so the transport can do anything to it. */
  hasMedia: boolean;
  canControlMusic: boolean;
  timerRunning: boolean;
  musicPlaying: boolean;
  soundOn: boolean;
  isDark: boolean;
  isEnglish: boolean;
}

/**
 * The list in the order it is read: the timer, because that is why the room
 * exists, then the room itself, then the four panels, then how you appear to
 * others, then the things that only change this screen. A command that is not
 * available is still here — greyed, with the reason one keystroke away — rather
 * than missing, because "where is the start button" is a worse question than
 * "why is it dim".
 */
export function buildCommands(t: Translate, access: CommandAccess): Command[] {
  return [
    {
      id: 'timer.toggle',
      label: t(access.timerRunning ? 'timer.pause' : 'timer.start'),
      aliases: 'timer focus pomodoro begin resume session',
      enabled: access.canControlTimer,
    },
    { id: 'timer.reset', label: t('timer.reset'), aliases: 'timer restart again session', enabled: access.canControlTimer },
    { id: 'timer.skip', label: t('timer.skip'), aliases: 'timer next forward phase end', enabled: access.canControlTimer },
    { id: 'room.copyLink', label: t('room.copyLink'), aliases: 'link share invite url address code', enabled: access.inRoom },
    { id: 'room.settings', label: t('timer.settings'), aliases: 'settings minutes cycles length focus break', enabled: access.isHost },
    { id: 'room.leave', label: t('palette.leave'), aliases: 'leave exit quit room disconnect', enabled: access.inRoom },
    { id: 'tab.timer', label: t('room.timerTab'), aliases: 'go panel view clock pomodoro', enabled: access.inRoom },
    { id: 'tab.members', label: t('room.membersTab'), aliases: 'go panel view people presence who is here online', enabled: access.inRoom },
    { id: 'tab.chat', label: t('room.chatTab'), aliases: 'go panel view message talk write', enabled: access.inRoom },
    { id: 'tab.music', label: t('room.musicTab'), aliases: 'go panel view youtube video player', enabled: access.hasMusic },
    { id: 'status.focusing', label: t('palette.setStatus', { status: t('members.focusing') }), aliases: 'status set working focus', enabled: access.inRoom },
    { id: 'status.break', label: t('palette.setStatus', { status: t('members.break') }), aliases: 'status set resting break', enabled: access.inRoom },
    { id: 'status.away', label: t('palette.setStatus', { status: t('members.away') }), aliases: 'status set away idle', enabled: access.inRoom },
    { id: 'view.theme', label: t('palette.themeTo', { theme: t(access.isDark ? 'palette.light' : 'palette.dark') }), aliases: 'theme dark light colour color appearance mode', enabled: true },
    { id: 'view.language', label: t('palette.languageTo', { language: t(access.isEnglish ? 'palette.indonesian' : 'palette.english') }), aliases: 'language english indonesia bahasa locale', enabled: true },
    { id: 'view.sound', label: t(access.soundOn ? 'palette.soundOff' : 'palette.soundOn'), aliases: 'sound mute volume alert audio chime', enabled: true },
    { id: 'media.toggle', label: t(access.musicPlaying ? 'music.pause' : 'music.play'), aliases: 'music youtube video player play pause', enabled: access.hasMedia && access.canControlMusic },
  ];
}
