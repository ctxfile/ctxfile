import { describe, expect, it } from "vitest";
import { isDeniedPath, redactContent } from "../src/redact.js";

describe("isDeniedPath", () => {
  it.each([
    ".env",
    ".env.local",
    "config/.env.production",
    "certs/server.pem",
    "secrets/signing.key",
    ".ssh/id_rsa",
    ".ssh/id_rsa.pub",
    ".ssh/id_ecdsa",
    ".ssh/id_dsa",
    "AuthKey_ABC123.p8",
    "server.ppk",
    "keystore.p12",
    "cert.pfx",
    ".npmrc",
    ".netrc",
    "aws/credentials.json",
    "android/release.keystore",
  ])("denies %s", (p) => {
    expect(isDeniedPath(p)).toBe(true);
  });

  it.each(["src/index.ts", "README.md", "package.json", "src/environment.ts", "docs/keys-to-success.md"])(
    "allows %s",
    (p) => {
      expect(isDeniedPath(p)).toBe(false);
    }
  );
});

describe("redactContent", () => {
  it("leaves clean text untouched", () => {
    const input = "const x = 1;\nfunction add(a, b) { return a + b; }";
    const result = redactContent(input);
    expect(result.text).toBe(input);
    expect(result.redactions).toBe(0);
  });

  it("redacts AWS access key ids", () => {
    const result = redactContent("key = AKIAIOSFODNN7EXAMPLE");
    expect(result.text).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(result.text).toContain("[REDACTED:");
    expect(result.redactions).toBe(1);
  });

  it("redacts GitHub tokens", () => {
    const result = redactContent("token: ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(result.text).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(result.redactions).toBe(1);
  });

  it("redacts sk- style API keys", () => {
    const result = redactContent("ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrst");
    expect(result.text).not.toContain("sk-ant-api03");
    expect(result.redactions).toBeGreaterThanOrEqual(1);
  });

  it("redacts Notion tokens", () => {
    const result = redactContent("ntn_abcdefghijklmnopqrstuvwx and secret_ABCDEFGHIJKLMNOPQRSTUVWX");
    expect(result.text).not.toContain("ntn_abcdefghijklmnopqrstuvwx");
    expect(result.text).not.toContain("secret_ABCDEFGHIJKLMNOPQRSTUVWX");
    expect(result.redactions).toBe(2);
  });

  it("redacts Slack tokens", () => {
    const result = redactContent("slack: xoxb-123456789012-abcdefghij");
    expect(result.text).not.toContain("xoxb-");
    expect(result.redactions).toBe(1);
  });

  it("redacts private key blocks", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\nmore\n-----END RSA PRIVATE KEY-----";
    const result = redactContent(`prefix\n${pem}\nsuffix`);
    expect(result.text).not.toContain("MIIEpAIBAAKCAQEA");
    expect(result.text).toContain("prefix");
    expect(result.text).toContain("suffix");
    expect(result.redactions).toBe(1);
  });

  it("redacts JWTs", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const result = redactContent(`Bearer ${jwt}`);
    expect(result.text).not.toContain(jwt);
    expect(result.redactions).toBe(1);
  });

  it("redacts generic quoted assignments to key/token/password", () => {
    const result = redactContent(`const config = { apiKey: "supersecretvalue123", password = 'hunter2hunter2' };`);
    expect(result.text).not.toContain("supersecretvalue123");
    expect(result.text).not.toContain("hunter2hunter2");
    expect(result.redactions).toBe(2);
  });

  it("counts multiple redactions across kinds", () => {
    const result = redactContent("AKIAIOSFODNN7EXAMPLE then ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(result.redactions).toBe(2);
  });
});
