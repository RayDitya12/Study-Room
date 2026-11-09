import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROOM_CODE_LENGTH } from '@studyroom/shared';
import { useT } from '../i18n/useT';
import { Button } from '../components/Button';
import { CreateRoomForm } from '../components/CreateRoomForm';
import { LanguageToggle } from '../components/LanguageToggle';
import { ThemeToggle } from '../components/ThemeToggle';
import { SoundToggle } from '../components/SoundToggle';
import { SoundDisplayPopover } from '../components/SoundDisplayPopover';

const inputClass =
  'w-full rounded-xl border border-surface1 bg-mantle px-3 py-2 text-sm text-text placeholder:text-subtext0 focus:border-mauve focus:outline-none';

export function Home() {
  const t = useT();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState('');

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== ROOM_CODE_LENGTH) {
      setJoinError(t('home.invalidCode'));
      return;
    }
    navigate(`/r/${code}`);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col px-4">
      <header className="flex items-center justify-between py-4">
        <h1 className="text-lg font-semibold tracking-tight">
          <span className="text-mauve">●</span> {t('app.title')}
        </h1>
        <div className="flex items-center gap-1">
          <LanguageToggle />
          <ThemeToggle />
          <SoundDisplayPopover />
          <SoundToggle />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 py-10">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-text">{t('app.tagline')}</h2>
        </div>
        <div className="grid w-full gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-surface1 bg-mantle p-6">
            <h3 className="text-[1rem] font-semibold text-text">{t('home.createTitle')}</h3>
            <p className="mb-4 mt-1 text-sm text-subtext0">{t('home.createDescription')}</p>
            <CreateRoomForm />
          </section>
          <section className="rounded-2xl border border-surface1 bg-mantle p-6">
            <h3 className="text-[1rem] font-semibold text-text">{t('home.joinTitle')}</h3>
            <p className="mb-4 mt-1 text-sm text-subtext0">{t('home.joinDescription')}</p>
            <form onSubmit={onJoin} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm text-subtext0">
                {t('home.code')}
                <input
                  className={`${inputClass} font-mono uppercase tracking-[0.3em]`}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase().slice(0, ROOM_CODE_LENGTH));
                    setJoinError('');
                  }}
                  placeholder="ABC234"
                  inputMode="text"
                  autoComplete="off"
                  required
                />
              </label>
              {joinError && <p className="text-sm text-red" role="alert">{joinError}</p>}
              <Button type="submit" variant="secondary">
                {t('home.join')}
              </Button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
