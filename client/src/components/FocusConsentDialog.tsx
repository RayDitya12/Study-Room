import { useT } from '../i18n/useT';
import { Button } from './Button';
import { Dialog } from './Dialog';

export interface FocusConsentDialogProps {
  open: boolean;
  onEnable: () => void;
  onDecline: () => void;
}

/**
 * Asked once per room, per device, when the host turns on focus tracking.
 * Both answers are final for that room and neither costs anything: the point
 * of the dialog is that tracking is a choice, not a rule.
 */
export function FocusConsentDialog({ open, onEnable, onDecline }: FocusConsentDialogProps) {
  const t = useT();
  if (!open) return null;

  return (
    <Dialog open title={t('focus.consentTitle')} onClose={onDecline}>
      <div className="space-y-4">
        <p className="text-sm text-subtext0">{t('focus.consentBody')}</p>
        <ul className="list-disc space-y-1 pl-5 text-xs text-overlay0">
          <li>{t('focus.consentSees')}</li>
          <li>{t('focus.consentNeverSees')}</li>
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onDecline}>
            {t('focus.decline')}
          </Button>
          <Button onClick={onEnable}>{t('focus.enable')}</Button>
        </div>
      </div>
    </Dialog>
  );
}
