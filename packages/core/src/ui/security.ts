import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Per-server-start bearer token for the local UI API. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Constant-time token comparison; hashing first equalizes lengths so timingSafeEqual never throws. */
export function tokenMatches(expected: string, provided: string | null | undefined): boolean {
  if (!provided) return false;
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(provided).digest();
  return timingSafeEqual(a, b);
}

/**
 * DNS-rebinding defense: a malicious page at attacker.com can point its own
 * DNS at 127.0.0.1 and bypass CORS entirely — the Host header is the tell.
 */
export function hostAllowed(hostHeader: string | undefined, port: number): boolean {
  return hostHeader === `127.0.0.1:${port}` || hostHeader === `localhost:${port}`;
}
