/**
 * WCAG 2.1 contrast, pure and DOM-free so it runs in the plain client Vitest
 * (no jsdom). `#rgb` / `#rrggbb` in, ratio out.
 */

function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) throw new Error(`bad hex: ${hex}`);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Relative luminance per WCAG (linearised sRGB). */
export function relativeLuminance(hex: string): number {
  const [r8, g8, b8] = parseHex(hex);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r8 / 255) + 0.7152 * lin(g8 / 255) + 0.0722 * lin(b8 / 255);
}

/** Contrast ratio between two colours, 1..21, order-independent. */
export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
