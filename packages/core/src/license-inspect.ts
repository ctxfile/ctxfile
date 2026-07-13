// A durable subscription credential (activated once, exchanged for a short-lived
// license by Pro at startup) is opaque to core — it carries no expiry of its own.
// Core only recognizes the prefix and structural shape; Pro verifies and refreshes it.
const CREDENTIAL_PREFIX = "ctxsub_";

// Structural sanity check for an activation token (a license key or a subscription
// credential). Core cannot verify the Ed25519 signature (that needs Pro's embedded
// public key), but it can reject garbage and report expiry so `activate` gives
// immediate feedback rather than a silent-until-startup failure.
export function inspectLicenseKey(key: string, now = new Date()): { ok: boolean; detail: string } {
  const trimmed = key.trim();
  if (trimmed.startsWith(CREDENTIAL_PREFIX)) {
    const body = trimmed.slice(CREDENTIAL_PREFIX.length).split(".");
    if (body.length !== 2 || !body[0] || !body[1]) {
      return { ok: false, detail: "malformed subscription credential" };
    }
    return { ok: true, detail: "subscription credential (license auto-refreshes while your plan is active)" };
  }
  const parts = trimmed.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, detail: "malformed key (expected <payload>.<signature>)" };
  }
  let payload: { tier?: string; expiresAt?: string; features?: unknown };
  try {
    payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return { ok: false, detail: "malformed key (payload is not valid base64url JSON)" };
  }
  const expires = payload.expiresAt ? new Date(payload.expiresAt) : null;
  if (!expires || Number.isNaN(expires.getTime())) {
    return { ok: false, detail: "malformed key (missing/invalid expiresAt)" };
  }
  if (expires < now) {
    return { ok: false, detail: `key expired ${payload.expiresAt}` };
  }
  const features = Array.isArray(payload.features) ? payload.features.join(", ") : "none";
  return { ok: true, detail: `tier=${payload.tier ?? "?"} features=[${features}] expires=${payload.expiresAt}` };
}
