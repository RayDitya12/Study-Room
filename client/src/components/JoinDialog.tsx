import { useEffect, useState } from 'react';
import { LIMITS } from '@studyroom/shared';
import { getNickname } from '../lib/session';
import { useT } from '../i18n/useT';
import { Button } from './Button';
import { Dialog } from './Dialog';

export interface JoinDialogProps {
  open: boolean;
  roomName: string;
  hasPassword: boolean;
  error: string | null;
  busy: boolean;
  onSubmit: (nickname: string, password?: string) => void;
}

export function JoinDialog({ open, roomName, hasPassword, error, busy, onSubmit }: JoinDialogProps) {
  const t = useT();
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNickname(getNickname());
      setPassword('');
      setLocalError(null);
    }
  }, [open]);

  const submit = (): void => {
    const trimmed = nickname.trim();
    if (trimmed.length < LIMITS.NICKNAME_MIN || trimmed.length > LIMITS.NICKNAME_MAX) {
      setLocalError(t('join.needNickname'));
      return;
    }
    setLocalError(null);
    onSubmit(trimmed, hasPassword && password ? password : undefined);
  };

  const message = localError ?? error;

  return (
    <Dialog open={open} title={t('join.title', { name: roomName })} onClose={() => undefined}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-sm text-subtext0">{t('join.nickname')}</span>
          <input
            autoFocus
            type="text"
            value={nickname}
            maxLength={LIMITS.NICKNAME_MAX}
            autoComplete="nickname"
            onChange={(e) => setNickname(e.target.value)}
            className="w-full rounded-xl border border-surface1 bg-mantle px-3 py-2 text-sm text-text focus:border-mauve focus:outline-none"
          />
        </label>

        {hasPassword ? (
          <label className="block space-y-1.5">
            <span className="text-sm text-subtext0">{t('join.password')}</span>
            <input
              type="password"
              value={password}
              maxLength={LIMITS.PASSWORD_MAX}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-surface1 bg-mantle px-3 py-2 text-sm text-text focus:border-mauve focus:outline-none"
            />
          </label>
        ) : null}

        {message ? (
          <p role="alert" className="text-sm text-red">
            {message}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>
            {t('join.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
