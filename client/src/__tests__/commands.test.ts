import { describe, expect, it } from 'vitest';
import { buildCommands, searchPalette, type Command, type CommandAccess, type CommandId } from '../lib/commands';
import type { Translate } from '../i18n';

/** The gate tests read ids and flags, so the wording itself is left as keys. */
const t: Translate = (key) => key;

const access = (over: Partial<CommandAccess> = {}): CommandAccess => ({
  inRoom: true,
  canControlTimer: true,
  isHost: true,
  hasMusic: true,
  hasMedia: true,
  canControlMusic: true,
  timerRunning: false,
  musicPlaying: false,
  soundOn: true,
  isDark: true,
  isEnglish: true,
  ...over,
});

const enabled = (id: CommandId, over?: Partial<CommandAccess>): boolean =>
  buildCommands(t, access(over)).find((command) => command.id === id)?.enabled === true;

const item = (label: string, aliases = ''): Pick<Command, 'label' | 'aliases'> => ({
  label,
  aliases,
});

const LABELS = (items: { label: string }[]): string[] => items.map((entry) => entry.label);

const list = [
  item('Start timer', 'begin resume focus play'),
  item('Skip phase', 'next forward break'),
  item('Copy link', 'share invite address url'),
  item('Sound on', 'mute audio alert volume'),
  item('Who is here', 'members people presence'),
];

describe('searchPalette', () => {
  it('returns everything, in order, for an empty query', () => {
    expect(LABELS(searchPalette(list, ''))).toEqual(LABELS(list));
    expect(LABELS(searchPalette(list, '   '))).toEqual(LABELS(list));
  });

  it('puts an exact label above a longer one that starts the same way', () => {
    const items = [item('Copy link now'), item('Copy link')];
    expect(LABELS(searchPalette(items, 'copy link'))).toEqual(['Copy link', 'Copy link now']);
  });

  it('puts the start of a label above the middle of one', () => {
    const items = [item('New copy link'), item('Copy link')];
    expect(LABELS(searchPalette(items, 'copy'))).toEqual(['Copy link', 'New copy link']);
  });

  it('puts a label above an alias, even when the alias is listed first', () => {
    const items = [item('Sound on', 'copy'), item('Copy link')];
    expect(LABELS(searchPalette(items, 'copy'))).toEqual(['Copy link', 'Sound on']);
  });

  it('puts an alias above a query whose letters only appear in order', () => {
    const items = [item('Skip phase'), item('Sound on', 'sp')];
    expect(LABELS(searchPalette(items, 'sp'))).toEqual(['Sound on', 'Skip phase']);
  });

  it('still finds a command whose letters appear in order', () => {
    const items = [item('Skip phase'), item('Sound on')];
    expect(LABELS(searchPalette(items, 'sp'))).toEqual(['Skip phase']);
  });

  it('ignores case and repeated spaces', () => {
    expect(LABELS(searchPalette(list, '  COPY   LINK '))).toEqual(['Copy link']);
    expect(LABELS(searchPalette(list, 'MEMBERS'))).toEqual(['Who is here']);
  });

  it('needs every word to land somewhere', () => {
    expect(LABELS(searchPalette(list, 'link copy'))).toEqual(['Copy link']);
    expect(searchPalette(list, 'link nothing')).toEqual([]);
  });

  it('ranks a multi-word query by its weakest word', () => {
    const items = [item('Link settings', 'copy'), item('Copy link')];
    expect(LABELS(searchPalette(items, 'copy link'))).toEqual(['Copy link', 'Link settings']);
  });

  it('keeps equally matched commands in the order they were given', () => {
    const tied = [item('Phase dots'), item('Phase ring'), item('Phase bar')];
    expect(LABELS(searchPalette(tied, 'phase'))).toEqual(['Phase dots', 'Phase ring', 'Phase bar']);
  });

  it('leaves a greyed-out command in the list, because it still exists', () => {
    const items: Command[] = [
      { id: 'timer.reset', label: 'Reset timer', aliases: '', enabled: false },
      { id: 'room.copyLink', label: 'Copy link', aliases: '', enabled: true },
    ];
    expect(LABELS(searchPalette(items, 'timer'))).toEqual(['Reset timer']);
  });

  it('drops what does not match at all', () => {
    expect(searchPalette(list, 'zzz')).toEqual([]);
    expect(searchPalette([], 'anything')).toEqual([]);
  });
});

describe('buildCommands', () => {
  it('lists every command whatever the access, so nothing has to be looked for', () => {
    const none = buildCommands(t, {
      inRoom: false,
      canControlTimer: false,
      isHost: false,
      hasMusic: false,
      hasMedia: false,
      canControlMusic: false,
      timerRunning: false,
      musicPlaying: false,
      soundOn: false,
      isDark: false,
      isEnglish: false,
    });
    expect(none.map((command) => command.id)).toEqual(
      buildCommands(t, access()).map((command) => command.id),
    );
  });

  it('greys the timer for someone who may not touch it, and not for anyone else', () => {
    expect(enabled('timer.toggle', { canControlTimer: false })).toBe(false);
    expect(enabled('timer.reset', { canControlTimer: false })).toBe(false);
    expect(enabled('timer.skip', { canControlTimer: false })).toBe(false);
    expect(enabled('view.sound', { canControlTimer: false })).toBe(true);
    expect(enabled('timer.toggle')).toBe(true);
  });

  it('keeps the settings to the host', () => {
    expect(enabled('room.settings', { isHost: false })).toBe(false);
    expect(enabled('room.settings')).toBe(true);
  });

  it('offers the transport only once something is loaded', () => {
    expect(enabled('media.toggle', { hasMedia: false })).toBe(false);
    expect(enabled('media.toggle', { canControlMusic: false })).toBe(false);
    expect(enabled('media.toggle')).toBe(true);
  });

  it('names the timer command after what it will do', () => {
    const label = (over?: Partial<CommandAccess>): string | undefined =>
      buildCommands(t, access(over)).find((command) => command.id === 'timer.toggle')?.label;
    expect(label()).toBe('timer.start');
    expect(label({ timerRunning: true })).toBe('timer.pause');
  });
});
