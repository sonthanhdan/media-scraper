export function toAbsoluteUrl(base: string, maybeRelative: string): string | null {
  const s = (maybeRelative ?? '').trim();
  if (!s) return null;
  if (s.startsWith('data:')) return null;

  try {
    return new URL(s, base).toString();
  } catch {
    return null;
  }
}
