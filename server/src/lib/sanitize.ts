// Control characters except \t \n \r.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
// Zero-width and bidi-override characters (spoofing / layout attacks).
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

export interface CleanTextOptions {
  /** Chat keeps single newlines (3+ collapse to 2); nicknames/tasks collapse everything. */
  keepNewlines?: boolean;
}

export function cleanText(input: string, max: number, options: CleanTextOptions = {}): string {
  let text = input.normalize('NFC').replace(CONTROL_CHARS, '').replace(INVISIBLE, '');
  if (options.keepNewlines) {
    text = text
      .replace(/\r\n?/g, '\n')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n{3,}/g, '\n\n');
  } else {
    text = text.replace(/\s+/g, ' ');
  }
  return text.trim().slice(0, max).trim();
}
