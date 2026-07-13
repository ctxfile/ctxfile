import { describe, expect, it } from "vitest";
import { estimateTokens, TokenBudget, truncateToTokens } from "../src/engine/tokens.js";

describe("estimateTokens", () => {
  it("returns 0 for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("estimates ~4 chars per token, rounding up", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});

describe("truncateToTokens", () => {
  it("returns text unchanged when within budget", () => {
    const result = truncateToTokens("short text", 100);
    expect(result.text).toBe("short text");
    expect(result.truncated).toBe(false);
  });

  it("truncates over-budget text keeping head and tail with a marker", () => {
    const head = "HEAD".repeat(500);
    const tail = "TAIL".repeat(500);
    const text = head + "MIDDLE".repeat(2000) + tail;
    const result = truncateToTokens(text, 100);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("[...truncated...]");
    expect(result.text.startsWith("HEAD")).toBe(true);
    expect(result.text.endsWith("TAIL")).toBe(true);
    expect(estimateTokens(result.text)).toBeLessThanOrEqual(100);
  });
});

describe("TokenBudget", () => {
  it("tracks used and remaining tokens", () => {
    const budget = new TokenBudget(100);
    expect(budget.remaining()).toBe(100);
    expect(budget.take(30)).toBe(true);
    expect(budget.used()).toBe(30);
    expect(budget.remaining()).toBe(70);
  });

  it("refuses a take that would exceed the budget without consuming", () => {
    const budget = new TokenBudget(50);
    expect(budget.take(40)).toBe(true);
    expect(budget.take(20)).toBe(false);
    expect(budget.used()).toBe(40);
    expect(budget.take(10)).toBe(true);
    expect(budget.remaining()).toBe(0);
  });
});
