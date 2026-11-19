import { useEffect, useState } from 'react';
import { pingServer } from '../lib/api';

/** How long a visitor waits in silence before being told the server is waking. */
const GRACE_MS = 3_000;
const RETRY_MS = 1_500;
/** Long enough for a cold container, short enough not to keep a dead tab polling. */
const GIVE_UP_MS = 45_000;

export interface ServerWake {
  /** The server has not answered, and it has taken long enough to be worth saying. */
  waking: boolean;
  /** Epoch ms of the last successful probe, so callers can retry what they asked it for. */
  healthyAt: number;
}

/**
 * A cold-start guard, not a monitor: it asks `/health` until the server answers
 * and then stops. A sleeping host rejects the request outright, so one attempt
 * cannot tell "still asleep" from "broken" — the retry is the whole point.
 */
export function useServerWake(): ServerWake {
  const [state, setState] = useState<ServerWake>({ waking: false, healthyAt: 0 });

  useEffect(() => {
    let stopped = false;
    let slow: ReturnType<typeof setTimeout> | undefined;

    const probe = async (): Promise<void> => {
      const deadline = Date.now() + GIVE_UP_MS;
      slow = setTimeout(() => {
        if (!stopped) setState((prev) => ({ ...prev, waking: true }));
      }, GRACE_MS);
      while (Date.now() < deadline) {
        if (await pingServer()) {
          clearTimeout(slow);
          if (!stopped) setState({ waking: false, healthyAt: Date.now() });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
      }
      clearTimeout(slow);
      // Silence beats a promise the app cannot keep.
      if (!stopped) setState((prev) => ({ ...prev, waking: false }));
    };

    void probe();
    return () => {
      stopped = true;
      clearTimeout(slow);
    };
  }, []);

  return state;
}
