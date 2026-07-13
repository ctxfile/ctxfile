import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { storeLicenseKey } from "../src/license-store.js";

function makeKey(expiresAt: string): string {
  const payload = Buffer.from(JSON.stringify({ tier: "pro", features: ["memory"], expiresAt })).toString("base64url");
  return `${payload}.fakesignature`;
}

describe("storeLicenseKey", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(path.join(os.tmpdir(), "cb-home-"));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it("writes a structurally valid key to ~/.ctxfile/license.key with mode 600", () => {
    const key = makeKey("2999-01-01T00:00:00.000Z");
    const { filePath, detail } = storeLicenseKey(key, home);
    expect(filePath).toBe(path.join(home, ".ctxfile", "license.key"));
    expect(readFileSync(filePath, "utf8")).toBe(key + "\n");
    expect(detail).toContain("tier=pro");
    if (process.platform !== "win32") {
      expect(statSync(filePath).mode & 0o777).toBe(0o600);
    }
  });

  it("throws on malformed or expired keys without writing", () => {
    expect(() => storeLicenseKey("garbage", home)).toThrow(/refusing to store/);
    expect(() => storeLicenseKey(makeKey("2000-01-01T00:00:00.000Z"), home)).toThrow(/expired/);
  });
});
