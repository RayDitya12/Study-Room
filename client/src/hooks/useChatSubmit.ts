import { useCallback } from 'react';
import { useRoomStore } from '../stores/roomStore';
import { useT } from '../i18n/useT';
import { readCommand } from '../lib/chatCommands';
import type { RoomActions } from './useRoomConnection';

/**
 * What the chat box sends: a plain message goes to the room, a command goes to
 * the player and is answered in the thread. Nothing is invented here that the
 * server has not agreed to — the request line only appears once the room has
 * taken the link.
 */
export function useChatSubmit(actions: RoomActions): (text: string) => Promise<void> {
  const t = useT();

  return useCallback(
    async (text: string) => {
      const room = useRoomStore.getState();
      if (!text.startsWith('/')) return actions.sendChat(text);

      const nicknameOf = (userId: string): string =>
        room.members.find((m) => m.userId === userId)?.nickname ?? t('chat.someone');
      const result = readCommand(text, room.media, nicknameOf);
      const notice = room.notice;
      for (const line of result.lines) notice(line.key, line.params);

      if (result.action === 'request' && result.url) {
        const error = await actions.requestSong(result.url);
        // Only a link the room refused needs saying here; a track that started
        // or waited is announced by the server's own event.
        if (error === 'INVALID_MEDIA_URL') notice('chat.cmdBadLink');
        return;
      }
      if (result.action === 'player' && result.mediaAction) {
        return actions.mediaAction(result.mediaAction);
      }
      if (result.action === 'loop') return actions.setMediaLoop(Boolean(result.loop));
      return undefined;
    },
    [actions, t],
  );
}
