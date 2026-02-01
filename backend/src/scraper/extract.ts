import * as cheerio from 'cheerio';
import { toAbsoluteUrl } from './normalize.js';

export type Extracted = { type: 'image' | 'video'; mediaUrl: string };

export function extractMedia(html: string, pageUrl: string): Extracted[] {
  const $ = cheerio.load(html);

  const out: Extracted[] = [];

  // images: img[src], source[srcset], meta og:image
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src');
    const abs = src ? toAbsoluteUrl(pageUrl, src) : null;
    if (abs) out.push({ type: 'image', mediaUrl: abs });
  });

  $('source[srcset]').each((_, el) => {
    const srcset = $(el).attr('srcset');
    if (!srcset) return;
    const first = srcset.split(',')[0]?.trim().split(' ')[0];
    const abs = first ? toAbsoluteUrl(pageUrl, first) : null;
    if (abs) out.push({ type: 'image', mediaUrl: abs });
  });

  $('meta[property="og:image"], meta[name="og:image"]').each((_, el) => {
    const content = $(el).attr('content');
    const abs = content ? toAbsoluteUrl(pageUrl, content) : null;
    if (abs) out.push({ type: 'image', mediaUrl: abs });
  });

  // videos: video[src], source[type^=video], meta og:video
  $('video[src]').each((_, el) => {
    const src = $(el).attr('src');
    const abs = src ? toAbsoluteUrl(pageUrl, src) : null;
    if (abs) out.push({ type: 'video', mediaUrl: abs });
  });

  $('source[src][type]').each((_, el) => {
    const type = ($(el).attr('type') ?? '').toLowerCase();
    if (!type.startsWith('video/')) return;
    const src = $(el).attr('src');
    const abs = src ? toAbsoluteUrl(pageUrl, src) : null;
    if (abs) out.push({ type: 'video', mediaUrl: abs });
  });

  $('meta[property="og:video"], meta[name="og:video"]').each((_, el) => {
    const content = $(el).attr('content');
    const abs = content ? toAbsoluteUrl(pageUrl, content) : null;
    if (abs) out.push({ type: 'video', mediaUrl: abs });
  });

  // dedupe
  const seen = new Set<string>();
  return out.filter((x) => {
    const key = `${x.type}|${x.mediaUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
