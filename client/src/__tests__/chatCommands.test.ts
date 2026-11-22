import { describe, expect, it } from 'vitest';
import { mediaMachine, type MediaState } from '@studyroom/shared';
import { readCommand } from '../lib/chatCommands';

const LINK = 'https://youtu.be/dQw4w9WgXcQ';
const OTHER = 'https://youtu.be/oHg5SJYRHA0';

const silent = (): MediaState => mediaMachine.createInitialMedia(5_000);
const playing = (): MediaState => mediaMachine.enqueue(silent(), 'dQw4w9WgXcQ', 'u1', 5_000);
const queued = (): MediaState => mediaMachine.enqueue(playing(), 'oHg5SJYRHA0', 'u2', 5_000);

const nicknameOf = (userId: string): string => (userId === 'u2' ? 'Budi' : userId);
const keys = (text: string, media: MediaState | null = silent()): string[] =>
  readCommand(text, media, nicknameOf).lines.map((line) => line.key);

describe('readCommand', () => {
  it('leaves an ordinary message alone', () => {
    for (const text of ['hello', '  hello', 'a /play b']) {
      const result = readCommand(text, silent(), nicknameOf);
      expect(result.handled).toBe(false);
      expect(result.action).toBe('none');
    }
  });

  it('sends a good link to the room as a request', () => {
    expect(readCommand('/play ' + LINK, silent(), nicknameOf)).toMatchObject({
      handled: true,
      action: 'request',
      url: LINK,
      lines: [],
    });
  });

  it('answers a command that has nothing to ask for', () => {
    expect(keys('/play')).toEqual(['chat.cmdNoLink', 'chat.cmdHelp']);
    expect(keys('/play https://vimeo.com/1')).toEqual(['chat.cmdBadLink']);
  });

  it('refuses to ask for a song the room already has, before the server does', () => {
    expect(keys('/play ' + LINK, playing())).toEqual(['chat.cmdDuplicate']);
    expect(keys('/play ' + OTHER, queued())).toEqual(['chat.cmdDuplicate']);
    // A finished song may be asked for again; it is not in the room any more.
    expect(readCommand('/play ' + LINK, silent(), nicknameOf).action).toBe('request');
  });

  it('lists what is waiting, with the names the room knows', () => {
    const result = readCommand('/queue', queued(), nicknameOf);
    expect(result.lines).toEqual([
      {
        key: 'chat.cmdQueueRow',
        params: { position: '1', track: 'youtu.be/oHg5SJYRHA0', name: 'Budi' },
      },
    ]);
    expect(keys('/queue')).toEqual(['chat.cmdQueueEmpty']);
  });

  it('maps the transport commands onto the room events', () => {
    const player = (text: string): unknown => readCommand(text, queued(), nicknameOf).mediaAction;
    expect(player('/skip')).toBe('skip');
    expect(player('/pause')).toBe('pause');
    expect(player('/resume')).toBe('play');
    expect(player('/clear')).toBe('clear');
    expect(player('/SKIP')).toBe('skip');
  });

  it('reads the loop choice, and asks when it cannot', () => {
    expect(readCommand('/loop on', queued(), nicknameOf)).toMatchObject({ action: 'loop', loop: true });
    expect(readCommand('/loop OFF', queued(), nicknameOf)).toMatchObject({
      action: 'loop',
      loop: false,
    });
    expect(keys('/loop')).toEqual(['chat.cmdLoopUsage']);
    expect(keys('/loop sideways')).toEqual(['chat.cmdLoopUsage']);
  });

  it('says a command does not exist instead of mailing it to the room', () => {
    const result = readCommand('/volume 11', silent(), nicknameOf);
    expect(result.handled).toBe(true);
    expect(result.lines[0]).toEqual({ key: 'chat.cmdUnknown', params: { cmd: 'volume' } });
  });
});
