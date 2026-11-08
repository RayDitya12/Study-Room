import { useRoomStore } from '../stores/roomStore';
import { useT } from '../i18n/useT';

export function ConnectionBanner() {
  const t = useT();
  const connection = useRoomStore((s) => s.connection);
  if (connection === 'connected') return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-red/15 px-4 py-1.5 text-xs font-medium text-red"
    >
      <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-red" />
      {t('room.reconnecting')}
    </div>
  );
}
