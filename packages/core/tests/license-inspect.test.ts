import { describe, expect, it } from "vitest";
import { inspectLicenseKey } from "../src/license-inspect.js";

function makeKey(payload: object): string {
  return `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.c2ln`;
}

const NOW = new Date("2026-07-09T00:00:00.000Z");

describe("inspectLicenseKey", () => {
  it("accepts a well-formed unexpired key and reports its details", () => {
    const key = makeKey({ tier: "pro", features: ["memory", "consult"], expiresAt: "2027-01-01T00:00:00.000Z" });
    const result = inspectLicenseKey(key, NOW);
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("tier=pro");
    expect(result.detail).toContain("memory, consult");
  });

  it.each(["", "onlyonepart", "a.b.c"])("rejects malformed key %j", (bad) => {
    expect(inspectLicenseKey(bad, NOW).ok).toBe(false);
  });

  it("rejects a payload that isn't valid base64url JSON", () => {
    expect(inspectLicenseKey("!!!notbase64!!!.sig", NOW).ok).toBe(false);
  });

  it("rejects a key with a missing or invalid expiresAt", () => {
    expect(inspectLicenseKey(makeKey({ tier: "pro" }), NOW).ok).toBe(false);
    expect(inspectLicenseKey(makeKey({ expiresAt: "not-a-date" }), NOW).ok).toBe(false);
  });

  it("rejects an already-expired key", () => {
    const key = makeKey({ tier: "pro", features: [], expiresAt: "2026-01-01T00:00:00.000Z" });
    const result = inspectLicenseKey(key, NOW);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("expired");
  });

  it("accepts a subscription credential without requiring an expiry", () => {
    const cred = `ctxsub_${Buffer.from(JSON.stringify({ subscriptionId: "sub_1" })).toString("base64url")}.c2ln`;
    const result = inspectLicenseKey(cred, NOW);
    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/credential/i);
  });

  it("rejects a malformed subscription credential", () => {
    expect(inspectLicenseKey("ctxsub_onlyonepart", NOW).ok).toBe(false);
    expect(inspectLicenseKey("ctxsub_.sig", NOW).ok).toBe(false);
  });
});
