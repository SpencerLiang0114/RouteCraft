const FALLBACK = "/saved";
const BASE = "http://routecraft.invalid";

/**
 * Returns a same-origin app path for `raw`, otherwise "/saved".
 * Browsers read "\" as "/" and drop tabs/newlines, so "/\evil.com" and "/\t/evil.com"
 * are protocol-relative URLs to another host even though they start with a single "/".
 * Dot segments normalize "/.//evil.com" to the pathname "//evil.com", which the router would
 * also navigate to off-site, so the normalized path is what gets checked and returned.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("..")) {
    return FALLBACK;
  }
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) {
    return FALLBACK;
  }
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return FALLBACK;
  }
  if (url.origin !== BASE || url.pathname.startsWith("//")) {
    return FALLBACK;
  }
  return url.pathname + url.search + url.hash;
}
