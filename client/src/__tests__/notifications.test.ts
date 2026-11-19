import { describe, expect, it } from 'vitest';
import {
  canAskForPermission,
  permissionStateOf,
  phaseMessage,
  shouldNotifyPhase,
  type PermissionState,
  type PhaseSight,
} from '../lib/notifications';
import type { Translate } from '../i18n';

/** Keys with their params inlined, so a test reads as which sentence was picked. */
const t: Translate = (key, params) => {
  const words = Object.entries(params ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .join(' ');
  return words ? `${key}(${words})` : String(key);
};

const sight = (over: Partial<PhaseSight> = {}): PhaseSight => ({
  from: 'focus',
  to: 'break',
  enabled: true,
  hidden: true,
  permission: 'granted',
  ...over,
});

describe('shouldNotifyPhase', () => {
  it('says so when every part of it holds', () => {
    expect(shouldNotifyPhase(sight())).toBe(true);
  });

  it('stays quiet for anyone who did not ask', () => {
    expect(shouldNotifyPhase(sight({ enabled: false }))).toBe(false);
  });

  it('stays quiet while the tab is on screen, where the chime is enough', () => {
    expect(shouldNotifyPhase(sight({ hidden: false }))).toBe(false);
  });

  for (const permission of ['ask', 'denied', 'unsupported'] as PermissionState[]) {
    it(`stays quiet until the browser answers with more than ${permission}`, () => {
      expect(shouldNotifyPhase(sight({ permission }))).toBe(false);
    });
  }

  it('does not announce the phase a room was already in when it loaded', () => {
    expect(shouldNotifyPhase(sight({ from: null }))).toBe(false);
  });

  it('ignores an update that left the phase where it was', () => {
    expect(shouldNotifyPhase(sight({ to: 'focus' }))).toBe(false);
  });

  it('counts the long break as the change it is', () => {
    expect(shouldNotifyPhase(sight({ from: 'focus', to: 'longBreak' }))).toBe(true);
  });
});

describe('permissionStateOf', () => {
  it('maps what the browser reports', () => {
    expect(permissionStateOf({ permission: 'granted' })).toBe('granted');
    expect(permissionStateOf({ permission: 'denied' })).toBe('denied');
    expect(permissionStateOf({ permission: 'default' })).toBe('ask');
  });

  it('treats anything it does not recognise as still unanswered', () => {
    expect(permissionStateOf({ permission: 'whatever' })).toBe('ask');
  });

  it('calls a missing Notification object unsupported rather than crashing', () => {
    expect(permissionStateOf(null)).toBe('unsupported');
    expect(permissionStateOf(undefined)).toBe('unsupported');
  });
});

describe('canAskForPermission', () => {
  it('asks only when the question has never been put', () => {
    expect(canAskForPermission('ask')).toBe(true);
    expect(canAskForPermission('granted')).toBe(false);
    expect(canAskForPermission('denied')).toBe(false);
    expect(canAskForPermission('unsupported')).toBe(false);
  });
});

describe('phaseMessage', () => {
  it('names the phase that started and the one coming after it', () => {
    expect(phaseMessage(t, 'break', { phase: 'focus', durationMs: 25 * 60_000 })).toEqual({
      title: 'notify.started(phase=timer.break)',
      body: 'timer.next(phase=timer.focus duration=25:00)',
    });
  });

  it('shows a long break as the length it actually is', () => {
    expect(phaseMessage(t, 'longBreak', { phase: 'focus', durationMs: 15 * 60_000 }).title).toBe(
      'notify.started(phase=timer.longBreak)',
    );
  });
});
