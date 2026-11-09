import { Component, type ErrorInfo, type ReactNode } from 'react';
import { makeTranslator } from '../i18n';
import { usePrefsStore } from '../stores/prefsStore';

interface State {
  error: Error | null;
}

/**
 * React drops the whole tree when a render throws, which leaves a white page
 * and the reason only in a console nobody has open. This keeps the message on
 * screen, because the message is what the bug report needs.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render(): ReactNode {
    const error = this.state.error;
    if (!error) return this.props.children;
    const t = makeTranslator(usePrefsStore.getState().lang);
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-4 px-4 py-10">
        <h1 className="text-lg font-semibold text-red">{t('crash.title')}</h1>
        <p className="text-sm text-subtext0">{t('crash.body')}</p>
        <p className="text-sm font-semibold text-text">{error.message}</p>
        <pre className="max-h-64 overflow-auto overscroll-contain rounded-xl bg-mantle p-3 text-xs text-subtext0">
          {error.stack ?? String(error)}
        </pre>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-surface0 px-4 py-2 text-sm text-text hover:bg-surface1"
          >
            {t('crash.retry')}
          </button>
          <a
            href="/"
            className="rounded-xl bg-surface0 px-4 py-2 text-sm text-text hover:bg-surface1"
          >
            {t('crash.home')}
          </a>
        </div>
      </div>
    );
  }
}