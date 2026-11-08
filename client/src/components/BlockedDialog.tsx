import type { BlockedMember } from '@studyroom/shared';
import { useT } from '../i18n/useT';
import { Button } from './Button';
import { Dialog } from './Dialog';

export interface BlockedDialogProps {
  open: boolean;
  blocks: BlockedMember[];
  onClose: () => void;
  onUnban: (userId: string) => void;
}

export function BlockedDialog({ open, blocks, onClose, onUnban }: BlockedDialogProps) {
  const t = useT();
  if (!open) return null;

  return (
    <Dialog open title={t('members.blockedTitle')} onClose={onClose}>
      {blocks.length === 0 ? (
        <p className="text-sm text-subtext0">{t('members.blockedEmpty')}</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {blocks.map((block) => (
            <li
              key={block.userId}
              className="flex items-center gap-2 rounded-xl bg-mantle px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text" title={block.nickname || block.userId}>
                  {block.nickname || block.userId}
                </p>
                <p className="text-xs text-subtext0">
                  {t(block.reason === 'ban' ? 'members.blockedBan' : 'members.blockedKick')}
                </p>
              </div>
              <Button variant="secondary" onClick={() => onUnban(block.userId)}>
                {t('members.unblock')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
