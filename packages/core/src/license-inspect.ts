// Structural sanity check for a license key. Core cannot verify the Ed25519
// signature (that needs Pro's embedded public key), but it can reject garbage
// and report expiry so `activate` gives immediate feedback rather than a
// silent-until-startup failure.
export function inspectLicenseKey(key: string, now = new Date()): { ok: boolean; detail: string } {
  const parts = key.trim().split(".");
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
