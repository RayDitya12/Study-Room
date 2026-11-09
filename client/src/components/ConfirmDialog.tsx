import { Button } from './Button';
import { Dialog } from './Dialog';
import { useT } from '../i18n/useT';

/** A single pending question. The caller decides what confirming does. */
export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  danger: boolean;
  onConfirm: () => void;
}

export interface ConfirmDialogProps {
  request: ConfirmRequest | null;
  onCancel: () => void;
}

export function ConfirmDialog({ request, onCancel }: ConfirmDialogProps) {
  const t = useT();
  if (!request) return null;

  return (
    <Dialog open title={request.title} onClose={onCancel}>
      <p className="text-sm text-subtext0">{request.body}</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t('confirm.cancel')}
        </Button>
        <Button
          variant={request.danger ? 'danger' : 'primary'}
          onClick={() => {
            request.onConfirm();
            onCancel();
          }}
        >
          {request.confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
