/**
 * The colour palette as data, so contrast can be asserted without a browser.
 * These values MIRROR `src/index.css` exactly: the CSS is what renders, this
 * module is what the contrast test reads. When you change one, change the other
 * and re-run `npm run test -w client`.
 *
 * The official Catppuccin steps (base/mantle/text/subtext/…) are kept verbatim.
 * Everything below them is a *semantic* token added on top: `muted` and the
 * `*Text` variants exist so text can meet WCAG 4.5:1 on the two card colours
 * without editing an official palette value — Latte simply maps the semantic
 * token onto a darker step, Mocha onto the light accent it already has.
 */

export interface FlavorTokens {
  base: string;
  mantle: string;
  crust: string;
  surface0: string;
  surface1: string;
  surface2: string;
  overlay0: string;
  text: string;
  subtext0: string;
  subtext1: string;
  // official accents (fills, strokes, dots, borders)
  mauve: string;
  green: string;
  blue: string;
  red: string;
  yellow: string;
  teal: string;
  lavender: string;
  // semantic text colours (>= 4.5:1 on mantle + base)
  muted: string;
  accentText: string;
  successText: string;
  infoText: string;
  warningText: string;
  dangerText: string;
  focusText: string;
  // solid chip backgrounds that the `*Text` colours sit on
  accentSoft: string;
  successSoft: string;
  infoSoft: string;
  warningSoft: string;
  dangerSoft: string;
  focusSoft: string;
}

export const MOCHA: FlavorTokens = {
  base: '#1e1e2e',
  mantle: '#181825',
  crust: '#11111b',
  surface0: '#313244',
  surface1: '#45475a',
  surface2: '#585b70',
  overlay0: '#6c7086',
  text: '#cdd6f4',
  subtext0: '#a6adc8',
  subtext1: '#bac2de',
  mauve: '#cba6f7',
  green: '#a6e3a1',
  blue: '#89b4fa',
  red: '#f38ba8',
  yellow: '#f9e2af',
  teal: '#94e2d5',
  lavender: '#b4befe',
  muted: '#bac2de',
  accentText: '#cba6f7',
  successText: '#a6e3a1',
  infoText: '#89b4fa',
  warningText: '#f9e2af',
  dangerText: '#f38ba8',
  focusText: '#94e2d5',
  accentSoft: '#33284a',
  successSoft: '#263a2b',
  infoSoft: '#26314a',
  warningSoft: '#3d3726',
  dangerSoft: '#3a2531',
  focusSoft: '#223a3a',
};

export const LATTE: FlavorTokens = {
  base: '#eff1f5',
  mantle: '#e6e9ef',
  crust: '#dcdfe5',
  surface0: '#ccd0da',
  surface1: '#bcc0cc',
  surface2: '#acb0be',
  overlay0: '#9ca0b0',
  text: '#4c4f69',
  subtext0: '#6c6f85',
  subtext1: '#5c5f77',
  mauve: '#8839ef',
  green: '#40a02b',
  blue: '#1e66f5',
  red: '#d20f39',
  yellow: '#df8e1d',
  teal: '#179299',
  lavender: '#7287fd',
  muted: '#5c5f77',
  accentText: '#6d2fcf',
  successText: '#216015',
  infoText: '#184ab8',
  warningText: '#6f4b00',
  dangerText: '#b30035',
  focusText: '#085c60',
  accentSoft: '#e3d9f6',
  successSoft: '#d5e8cf',
  infoSoft: '#d6e0fb',
  warningSoft: '#f2e4c8',
  dangerSoft: '#f6d9e0',
  focusSoft: '#cfe5e6',
};

export const FLAVORS: Record<'mocha' | 'latte', FlavorTokens> = {
  mocha: MOCHA,
  latte: LATTE,
};
