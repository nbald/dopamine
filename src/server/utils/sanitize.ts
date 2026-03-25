const MAX_NAME = 200;
const MAX_CONTENT = 10 * 1024 * 1024; // 10MB for notes
const MAX_URL = 2048;

export function sanitizeName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().slice(0, MAX_NAME);
  if (!trimmed) return null;
  // Remove control characters
  return trimmed.replace(/[\x00-\x1f\x7f]/g, '');
}

export function sanitizeContent(content: unknown): string | null {
  if (typeof content !== 'string') return null;
  return content.slice(0, MAX_CONTENT);
}

export function sanitizeUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim().slice(0, MAX_URL);
  // Block javascript: and data: URIs
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return null;
  return trimmed;
}

export function sanitizePath(p: unknown): string | null {
  if (typeof p !== 'string') return null;
  // Block null bytes
  if (p.includes('\0')) return null;
  return p.trim();
}
