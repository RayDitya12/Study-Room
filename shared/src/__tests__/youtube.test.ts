import { describe, expect, it } from 'vitest';
import { parseYouTubeVideoId } from '../youtube';

const ID = 'dQw4w9WgXcQ';

describe('parseYouTubeVideoId', () => {
  it('accepts the shapes people actually paste', () => {
    const valid: string[] = [
      ID,
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}`,
      `http://www.youtube.com/watch?v=${ID}`,
      `www.youtube.com/watch?v=${ID}`,
      `youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}`,
      `https://www.youtube-nocookie.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `youtu.be/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `https://www.youtube.com/v/${ID}`,
      `https://www.youtube.com/watch?v=${ID}&t=30s`,
      `https://www.youtube.com/watch?v=${ID}&list=PL1234567890`,
      `  https://www.youtube.com/watch?v=${ID}  `,
    ];
    for (const input of valid) expect(parseYouTubeVideoId(input)).toBe(ID);
  });

  it('keeps ids that contain - and _', () => {
    expect(parseYouTubeVideoId('https://youtu.be/a_-b-cdEfGh')).toBe('a_-b-cdEfGh');
  });

  it('rejects playlist-only links and every other path', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/playlist?list=PL1234567890')).toBeNull();
    expect(parseYouTubeVideoId('https://www.youtube.com/watch?feature=share')).toBeNull();
    expect(parseYouTubeVideoId('https://www.youtube.com/feed/trending')).toBeNull();
    expect(parseYouTubeVideoId('https://www.youtube.com/embed/')).toBeNull();
  });

  it('rejects wrong, look-alike and userinfo-hidden hosts', () => {
    expect(parseYouTubeVideoId('https://vimeo.com/12345')).toBeNull();
    expect(parseYouTubeVideoId('https://evilyoutube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeVideoId('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeVideoId('https://youtube.com@evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeVideoId('https://notyoutube.com/ID')).toBeNull();
  });

  it('rejects non-http schemes instead of normalising them', () => {
    expect(parseYouTubeVideoId('javascript:alert(1)')).toBeNull();
    expect(parseYouTubeVideoId('data:text/html,<iframe src=//youtube.com/embed/dQw4w9WgXcQ>')).toBeNull();
    expect(parseYouTubeVideoId('file:///C:/videos/dQw4w9WgXcQ.mp4')).toBeNull();
    expect(parseYouTubeVideoId('ftp://youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('rejects ids of the wrong length and empty input', () => {
    expect(parseYouTubeVideoId('dQw4w9WgXc')).toBeNull(); // 10
    expect(parseYouTubeVideoId('dQw4w9WgXcQa')).toBeNull(); // 12
    expect(parseYouTubeVideoId('')).toBeNull();
    expect(parseYouTubeVideoId('   ')).toBeNull();
    expect(parseYouTubeVideoId('https://youtu.be/')).toBeNull();
  });

  it('returns the id only, never a URL', () => {
    const result = parseYouTubeVideoId(`https://www.youtube.com/watch?v=${ID}&t=30s`);
    expect(result).not.toContain('/');
    expect(result).not.toContain('youtube');
  });
});
