import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ErrorCode } from '@studyroom/shared';
import { ApiError, createRoom } from '../lib/api';
import { getClientId, getNickname, setNickname, setRoomSession } from '../lib/session';
import { useT } from '../i18n/useT';
import { Button } from './Button';

const inputClass =
  'w-full rounded-xl border border-surface1 bg-mantle px-3 py-2 text-sm text-text placeholder:text-subtext0 focus:border-mauve focus:outline-none';

export function CreateRoomForm() {
  const t = useT();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNicknameState] = useState(getNickname());
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 1) {
      setError(t('home.invalidName'));
      return;
    }
    if (nickname.trim().length < 2 || nickname.trim().length > 20) {
      setError(t('home.invalidNickname'));
      return;
    }
    if (password.length > 0 && password.length < 4) {
      setError(t('errors.INVALID_INPUT'));
      return;
    }
    setSubmitting(true);
    try {
      const { code } = await createRoom({
        name: name.trim(),
        password: password.length > 0 ? password : undefined,
        clientId: getClientId(),
      });
      setNickname(nickname.trim());
      setRoomSession({
        code,
        nickname: nickname.trim(),
        password: password.length > 0 ? password : undefined,
      });
      navigate(`/r/${code}`);
    } catch (err) {
      const errCode: ErrorCode = err instanceof ApiError ? err.code : 'INTERNAL';
      setError(t(`errors.${errCode}` as const));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm text-subtext0">
        {t('home.roomName')}
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder={t('home.roomNamePlaceholder')}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-subtext0">
        {t('home.password')}
        <input
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          maxLength={64}
          placeholder={t('home.passwordPlaceholder')}
          autoComplete="off"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-subtext0">
        {t('home.nickname')}
        <input
          className={inputClass}
          value={nickname}
          onChange={(e) => setNicknameState(e.target.value)}
          maxLength={20}
          placeholder={t('home.nicknamePlaceholder')}
          required
        />
      </label>
      {error && <p className="text-sm text-red" role="alert">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? '…' : t('home.create')}
      </Button>
    </form>
  );
}
