import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../lib/contrast';
import { FLAVORS, type FlavorTokens } from '../theme/tokens';

const NORMAL = 4.5;
const LARGE_OR_UI = 3;

/**
 * Every (foreground, background) pair the interface renders *text* on. Normal
 * body text must reach 4.5:1; nothing on this list is a decorative value.
 * If a new token enters the UI as text, add its pair here — that is the point.
 *
 * `muted` is deliberately absent from `surface0`: a grey dark enough to clear
 * 4.5:1 on that chip is the text colour itself, so muted is only ever used on
 * the two card colours. Coloured accents have no such problem and so are held
 * to 4.5:1 everywhere they appear, chips included.
 */
const TEXT_PAIRS: [keyof FlavorTokens, keyof FlavorTokens][] = [
  ['text', 'mantle'],
  ['text', 'base'],
  ['text', 'surface0'],
  ['muted', 'mantle'],
  ['muted', 'base'],
  ['accentText', 'mantle'],
  ['accentText', 'base'],
  ['accentText', 'surface0'],
  ['successText', 'mantle'],
  ['successText', 'base'],
  ['successText', 'surface0'],
  ['infoText', 'mantle'],
  ['infoText', 'base'],
  ['infoText', 'surface0'],
  ['warningText', 'mantle'],
  ['warningText', 'base'],
  ['warningText', 'surface0'],
  ['dangerText', 'mantle'],
  ['dangerText', 'base'],
  ['dangerText', 'surface0'],
  ['focusText', 'mantle'],
  ['focusText', 'base'],
  ['focusText', 'surface0'],
  ['accentText', 'accentSoft'],
  ['successText', 'successSoft'],
  ['infoText', 'infoSoft'],
  ['warningText', 'warningSoft'],
  ['dangerText', 'dangerSoft'],
  ['focusText', 'focusSoft'],
];

/**
 * Fills used for meaningful non-text UI (status dots, the depletion ring).
 * These must reach 3:1 against the card they sit on, and each also carries a
 * non-colour cue, so 3:1 — not 4.5 — is the bar.
 */
const UI_PAIRS: [keyof FlavorTokens, keyof FlavorTokens][] = [
  ['successText', 'mantle'],
  ['infoText', 'mantle'],
  ['muted', 'mantle'],
  ['accentText', 'mantle'],
];

for (const [name, flavor] of Object.entries(FLAVORS)) {
  describe(`contrast: ${name}`, () => {
    it('every text pair reaches 4.5:1', () => {
      const failures = TEXT_PAIRS.map(
        ([fg, bg]) =>
          [
            `${name}.${fg} on ${bg}: ${contrastRatio(flavor[fg], flavor[bg]).toFixed(2)}`,
            contrastRatio(flavor[fg], flavor[bg]) >= NORMAL,
          ] as [string, boolean],
      )
        .filter(([, ok]) => !ok)
        .map(([line]) => line);
      expect(failures).toEqual([]);
    });

    it('meaningful UI fills reach 3:1 against the card', () => {
      const failures = UI_PAIRS.map(
        ([fg, bg]) =>
          [
            `${name}.${fg} on ${bg}: ${contrastRatio(flavor[fg], flavor[bg]).toFixed(2)}`,
            contrastRatio(flavor[fg], flavor[bg]) >= LARGE_OR_UI,
          ] as [string, boolean],
      )
        .filter(([, ok]) => !ok)
        .map(([line]) => line);
      expect(failures).toEqual([]);
    });
  });
}

describe('contrast: ratio maths', () => {
  it('black on white is 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });
  it('a colour against itself is 1', () => {
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
  });
  it('is order independent', () => {
    expect(contrastRatio('#40a02b', '#e6e9ef')).toBeCloseTo(
      contrastRatio('#e6e9ef', '#40a02b'),
      5,
    );
  });
});
