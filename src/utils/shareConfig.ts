export interface LocalShareConfig {
  name?: string;
  forwardUrl?: string;
  forwardEnabled?: boolean;
}

function toBase64Url(value: string): string {
  const utf8 = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Array.from(binary)
    .map((ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`)
    .join('');
  return decodeURIComponent(bytes);
}

/** Encode local share settings into a single query-safe string. */
export function encodeShareConfig(config: LocalShareConfig): string {
  const payload: LocalShareConfig = {};
  if (config.name?.trim()) payload.name = config.name.trim();
  if (config.forwardUrl?.trim()) payload.forwardUrl = config.forwardUrl.trim();
  if (config.forwardEnabled) payload.forwardEnabled = true;
  return toBase64Url(JSON.stringify(payload));
}

/** Decode `c` query param. Returns null if missing/invalid. */
export function decodeShareConfig(encoded: string | null | undefined): LocalShareConfig | null {
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(encoded));
    if (!parsed || typeof parsed !== 'object') return null;
    const result: LocalShareConfig = {};
    if (typeof parsed.name === 'string' && parsed.name.trim()) {
      result.name = parsed.name.trim();
    }
    if (typeof parsed.forwardUrl === 'string' && parsed.forwardUrl.trim()) {
      result.forwardUrl = parsed.forwardUrl.trim();
    }
    if (parsed.forwardEnabled === true) {
      result.forwardEnabled = true;
    }
    return result;
  } catch {
    return null;
  }
}

export function buildShareUrl(
  origin: string,
  webhookId: string,
  config: LocalShareConfig
): string {
  const encoded = encodeShareConfig(config);
  const params = new URLSearchParams();
  // Only add param when there is something useful to share
  if (encoded && encoded !== encodeShareConfig({})) {
    params.set('c', encoded);
  }
  const qs = params.toString();
  return `${origin}/v/${webhookId}${qs ? `?${qs}` : ''}`;
}
