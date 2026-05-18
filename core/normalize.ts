/**
 * Convert mf2 dash-form property name to camelCase.
 * "bookmark-of" → "bookmarkOf", "in-reply-to" → "inReplyTo".
 */
export function normalizePropertyName(key: string): string {
  return key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Read a property from a Micropub ?q=source response, tolerating both
 * dash-form (mf2 standard) and camelCase (Indiekit/some plugin variants).
 */
export function readProp<T = unknown[]>(
  source: Record<string, unknown>,
  key: string,
): T | undefined {
  const dash = source[key];
  if (dash !== undefined) return dash as T;
  const camel = source[normalizePropertyName(key)];
  return camel as T | undefined;
}
