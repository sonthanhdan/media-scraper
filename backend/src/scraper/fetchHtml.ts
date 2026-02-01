import { request } from 'undici';
import { env } from '../env.js';

export async function fetchHtml(url: string): Promise<string> {
  const res = await request(url, {
    method: 'GET',
    headers: {
      'user-agent': 'media-scraper/1.0',
      'accept': 'text/html,application/xhtml+xml'
    },
    headersTimeout: env.FETCH_TIMEOUT_MS,
    bodyTimeout: env.FETCH_TIMEOUT_MS,
  });

  const contentType = String(res.headers['content-type'] ?? '');
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    // Still parse if it's html-ish, otherwise skip
  }

  // Limit size to protect memory (1GB RAM)
  const MAX_CHARS = 1_000_000; // ~1MB in UTF-8 for ASCII-heavy HTML
  const text = await res.body.text();
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
}
