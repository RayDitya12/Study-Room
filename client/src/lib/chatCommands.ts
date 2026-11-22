import { mediaMachine, parseYouTubeVideoId } from '@studyroom/shared';
import type { MediaState } from '@studyroom/shared';
import { formatTrack } from './format';
import type { MediaAction } from '../hooks/useRoomConnection';
import type { TranslationKey } from '../i18n/en';

/**
 * The music bot lives in the chat box: what you type there is either a message
 * for the room or a command for the player, and a command is answered in the
 * thread it was typed in rather than by a toast.
 */

export interface CommandLine {
  key: TranslationKey;
  params?: Record<string, string>;
}

export interface CommandResult {
  /** False means the text was an ordinary message, so it goes to the server. */
  handled: boolean;
  lines: CommandLine[];
  action: 'none' | 'request' | 'player' | 'loop';
  /** For `request`: the link as typed. */
  url?: string;
  /** For `player`: which room command to send. */
  mediaAction?: MediaAction;
  /** For `loop`: the new choice. */
  loop?: boolean;
}

const USAGE: CommandLine = { key: 'chat.cmdHelp' };

function loopChoice(word: string | undefined): boolean | null {
  const value = (word ?? '').toLowerCase();
  if (value === 'on' || value === 'true') return true;
  if (value === 'off' || value === 'false') return false;
  return null;
}

/**
 * Reads one line of chat. Nothing here sends anything: the caller performs the
 * action it returns, because only the caller knows whether the server took it.
 * `nicknameOf` turns a requester's id into the name the room knows them by.
 */
export function readCommand(
  text: string,
  media: MediaState | null,
  nicknameOf: (userId: string) => string,
): CommandResult {
  if (!text.startsWith('/')) return { handled: false, lines: [], action: 'none' };
  const [rawName, ...rest] = text.slice(1).trim().split(/\s+/);
  const name = (rawName ?? '').toLowerCase();
  const argument = rest.join(' ').trim();

  if (name === 'play') {
    if (!argument) return { handled: true, lines: [{ key: 'chat.cmdNoLink' }, USAGE], action: 'none' };
    const videoId = parseYouTubeVideoId(argument);
    if (!videoId) return { handled: true, lines: [{ key: 'chat.cmdBadLink' }], action: 'none' };
    // Checked against what this browser already knows, so a repeated link never
    // costs a round trip. The server makes the same check before it queues.
    if (media && mediaMachine.isRequested(media, videoId)) {
      return {
        handled: true,
        lines: [{ key: 'chat.cmdDuplicate', params: { track: formatTrack(videoId) } }],
        action: 'none',
      };
    }
    return { handled: true, lines: [], action: 'request', url: argument };
  }

  if (name === 'queue') {
    const waiting = media?.queue ?? [];
    if (waiting.length === 0) {
      return { handled: true, lines: [{ key: 'chat.cmdQueueEmpty' }], action: 'none' };
    }
    return {
      handled: true,
      lines: waiting.map((track, index) => ({
        key: 'chat.cmdQueueRow' as TranslationKey,
        params: {
          position: String(index + 1),
          track: formatTrack(track.videoId),
          name: nicknameOf(track.by),
        },
      })),
      action: 'none',
    };
  }

  const player: Record<string, MediaAction> = {
    skip: 'skip',
    pause: 'pause',
    resume: 'play',
    clear: 'clear',
  };
  if (name in player) {
    return { handled: true, lines: [], action: 'player', mediaAction: player[name] };
  }

  if (name === 'loop') {
    const choice = loopChoice(argument);
    if (choice === null) return { handled: true, lines: [{ key: 'chat.cmdLoopUsage' }], action: 'none' };
    return { handled: true, lines: [], action: 'loop', loop: choice };
  }

  return { handled: true, lines: [{ key: 'chat.cmdUnknown', params: { cmd: name } }, USAGE], action: 'none' };
}
