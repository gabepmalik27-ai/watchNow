/** Where /login sends a user after signing in when no valid ?next= is given. */
export const DEFAULT_AFTER_LOGIN = "/for-you";

/**
 * Returns `raw` only if it is a same-origin path ("/rate?x=1"), otherwise the
 * fallback. Rejects "//evil.com" and "/\evil.com", which browsers treat as
 * protocol-relative URLs, so ?next= can't become an open redirect.
 */
export function safeNext(raw: string | null | undefined, fallback = DEFAULT_AFTER_LOGIN): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  return raw;
}
