/**
 * Helpers for detecting and parsing application/x-www-form-urlencoded bodies.
 */

export type FormBodyObject = Record<string, string | string[]>;

/** Parse a form-urlencoded string into a plain object. Repeated keys → arrays. */
export function parseFormUrlEncoded(body: string): FormBodyObject | null {
  if (!body || typeof body !== 'string') return null;
  const trimmed = body.trim();
  if (!trimmed || !trimmed.includes('=')) return null;

  try {
    // Reject obvious JSON so we don't treat `{...}` as form data
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        JSON.parse(trimmed);
        return null;
      } catch {
        // not JSON — continue as form
      }
    }

    const params = new URLSearchParams(trimmed);
    const result: FormBodyObject = {};
    let count = 0;

    for (const key of params.keys()) {
      if (Object.prototype.hasOwnProperty.call(result, key)) continue;
      const values = params.getAll(key);
      if (values.length === 0) continue;
      result[key] = values.length === 1 ? values[0] : values;
      count += 1;
    }

    return count > 0 ? result : null;
  } catch {
    return null;
  }
}

export function hasFormUrlEncodedContentType(
  headers: Record<string, string> | undefined | null
): boolean {
  if (!headers) return false;
  const contentType =
    headers['content-type'] ||
    headers['Content-Type'] ||
    Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ||
    '';
  return contentType.toLowerCase().includes('application/x-www-form-urlencoded');
}

/**
 * True when headers say form-urlencoded, or body looks/parses as form data
 * and is not valid JSON.
 */
export function isFormUrlEncodedBody(
  body: unknown,
  headers?: Record<string, string> | null
): boolean {
  if (typeof body !== 'string' || !body.trim()) return false;

  if (hasFormUrlEncodedContentType(headers)) {
    return parseFormUrlEncoded(body) !== null || body.includes('=');
  }

  try {
    JSON.parse(body);
    return false;
  } catch {
    return parseFormUrlEncoded(body) !== null;
  }
}
