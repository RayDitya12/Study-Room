/**
 * Turns anything a user might paste into the 11-character video id, and only
 * ever that. The id is the sole YouTube value that reaches the database, the
 * socket, or an iframe, so nothing here may return a URL.
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Exact hostnames only; `youtube.com.evil.com` must not match. */
const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
]);

/** Path prefixes that carry the id as the next segment. */
const SEGMENT_PATHS = new Set(['embed', 'shorts', 'live', 'v']);

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function toId(value: string | null | undefined): string | null {
  return value !== null && value !== undefined && VIDEO_ID.test(value) ? value : null;
}

export function parseYouTubeVideoId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (VIDEO_ID.test(raw)) return raw;

  // A missing scheme is treated as https; any other scheme is rejected outright.
  if (SCHEME.test(raw) && !/^https?:/i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(SCHEME.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!ALLOWED_HOSTS.has(url.hostname)) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  if (url.hostname === 'youtu.be') return toId(segments[0]);
  const head = segments[0]?.toLowerCase();
  if (head === 'watch') return toId(url.searchParams.get('v'));
  if (head !== undefined && SEGMENT_PATHS.has(head)) return toId(segments[1]);
  return null;
}
