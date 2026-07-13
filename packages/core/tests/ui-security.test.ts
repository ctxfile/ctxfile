import { describe, expect, it } from "vitest";
import { generateToken, hostAllowed, tokenMatches } from "../src/ui/security.js";

describe("ui security primitives", () => {
  it("generateToken returns unique 43-char base64url strings", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url, no padding
  });

  it("tokenMatches accepts only the exact token", () => {
    const t = generateToken();
    expect(tokenMatches(t, t)).toBe(true);
    expect(tokenMatches(t, t + "x")).toBe(false);
    expect(tokenMatches(t, t.slice(0, -1))).toBe(false);
    expect(tokenMatches(t, "")).toBe(false);
    expect(tokenMatches(t, null)).toBe(false);
    expect(tokenMatches(t, undefined)).toBe(false);
  });

  it("hostAllowed accepts only 127.0.0.1/localhost with the exact port", () => {
    expect(hostAllowed("127.0.0.1:4747", 4747)).toBe(true);
    expect(hostAllowed("localhost:4747", 4747)).toBe(true);
    expect(hostAllowed("localhost:4748", 4747)).toBe(false);
    expect(hostAllowed("evil.example:4747", 4747)).toBe(false);
    expect(hostAllowed("127.0.0.1.evil.example:4747", 4747)).toBe(false);
    expect(hostAllowed(undefined, 4747)).toBe(false);
    expect(hostAllowed("127.0.0.1", 4747)).toBe(false); // no port → reject
  });
});
