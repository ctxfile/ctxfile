/**
 * The launch URL carries the API token in the fragment (#token=...) so it never
 * hits server logs. We capture it into module memory (never localStorage) and
 * immediately strip the fragment from the address bar.
 */

let token: string | null = null;

export interface TokenLocation {
  hash: string;
  pathname: string;
  search: string;
}

export interface TokenHistory {
  replaceState(data: unknown, unused: string, url?: string): void;
}

export function captureToken(
  loc: TokenLocation = window.location,
  hist: TokenHistory = window.history
): string | null {
  const match = /[#&]token=([^&]*)/.exec(loc.hash);
  const raw = match?.[1];
  if (raw !== undefined && raw.length > 0) {
    try {
      token = decodeURIComponent(raw);
    } catch {
      token = raw;
    }
    hist.replaceState(null, "", loc.pathname + loc.search);
  }
  return token;
}

export function getToken(): string | null {
  return token;
}

export function resetTokenForTests(): void {
  token = null;
}
