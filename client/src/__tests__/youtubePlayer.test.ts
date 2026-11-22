import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createYouTubePlayer } from '../lib/youtubePlayer';

/**
 * The iframe API leaves a destroyed instance answering every question off a
 * null player, so the real bug this file pins is a method call that arrives
 * after `destroy()` and takes the page down with the ErrorBoundary.
 */
class FakeInstance {
  dead = false;
  calls: string[] = [];

  destroy(): void {
    this.dead = true;
    this.calls.push('destroy');
  }

  private log(name: string): void {
    if (this.dead) throw new TypeError("Cannot read properties of null (reading 'src')");
    this.calls.push(name);
  }

  cueVideoById(): void {
    this.log('cue');
  }

  loadVideoById(): void {
    this.log('load');
  }

  playVideo(): void {
    this.log('play');
  }

  pauseVideo(): void {
    this.log('pause');
  }

  seekTo(): void {
    this.log('seek');
  }

  getCurrentTime(): number {
    this.log('time');
    return 12;
  }

  getDuration(): number {
    this.log('duration');
    return 240;
  }

  getPlayerState(): number {
    this.log('state');
    return 1;
  }

  setVolume(): void {
    this.log('volume');
  }

  mute(): void {
    this.log('mute');
  }

  unMute(): void {
    this.log('unMute');
  }
}

const instances: FakeInstance[] = [];

const mountPlayer = (): HTMLElement => {
  const children: unknown[] = [];
  return {
    children,
    style: { cssText: '' },
    appendChild: (child: unknown): void => void children.push(child),
    get firstChild(): unknown {
      return children[0] ?? null;
    },
    removeChild: (): void => void children.shift(),
  } as unknown as HTMLElement;
};

const ready = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeEach(() => {
  instances.length = 0;
  vi.stubGlobal('window', {
    location: { origin: 'http://localhost:5173' },
    YT: {
      Player: function Player(this: unknown, _host: unknown, options: {
        events: { onReady: () => void };
      }) {
        const instance = new FakeInstance();
        instances.push(instance);
        setTimeout(() => options.events.onReady(), 0);
        return instance;
      },
    },
  });
  vi.stubGlobal('document', { createElement: () => ({ style: { cssText: '' } }) });
});

describe('the YouTube adapter', () => {
  it('talks to the player while it is alive', async () => {
    const player = await createYouTubePlayer(mountPlayer());
    await ready();
    player.pause();
    player.play();
    expect(instances[0]?.calls).toEqual(['pause', 'play']);
  });

  it('goes silent after destroy instead of touching the dead instance', async () => {
    const element = mountPlayer();
    const player = await createYouTubePlayer(element);
    await ready();
    player.destroy();
    expect(element.children).toHaveLength(0);

    expect(() => player.pause()).not.toThrow();
    expect(() => player.play()).not.toThrow();
    expect(() => player.seekTo(30)).not.toThrow();
    expect(() => player.setVolume(40)).not.toThrow();
    expect(player.getCurrentTimeMs()).toBe(0);
    expect(player.getDurationMs()).toBe(0);
    expect(player.getState()).toBe('unstarted');
    expect(instances[0]?.calls).toEqual(['destroy']);
  });
});
