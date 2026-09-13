import { describe, expect, it } from "vitest";
import { fuzzyMatch, fuzzyRank } from "./fuzzy";

describe("fuzzyMatch", () => {
  it("matches subsequences and returns indices", () => {
    const m = fuzzyMatch("gtc", "Go to Context");
    expect(m).not.toBeNull();
    expect(m!.indices).toEqual([0, 3, 6]);
  });

  it("returns null when characters are missing", () => {
    expect(fuzzyMatch("xyz", "Go to Context")).toBeNull();
  });

  it("matches everything on an empty query", () => {
    expect(fuzzyMatch("   ", "anything")).toEqual({ score: 0, indices: [] });
  });

  it("prefers contiguous and word-start matches", () => {
    const contiguous = fuzzyMatch("con", "Go to Context")!;
    const scattered = fuzzyMatch("con", "Cursor on Node")!;
    expect(contiguous.score).toBeGreaterThan(scattered.score);
  });
});

describe("fuzzyRank", () => {
  const items = ["Go to Overview", "Go to Context", "Run snapshot", "Switch to light theme"];
  it("orders by score and drops non-matches", () => {
    const ranked = fuzzyRank("snap", items, (s) => s);
    expect(ranked).toEqual(["Run snapshot"]);
  });
  it("returns all items untouched for an empty query", () => {
    expect(fuzzyRank("", items, (s) => s)).toEqual(items);
  });
  it("ranks the word-start match first", () => {
    const ranked = fuzzyRank("th", items, (s) => s);
    expect(ranked[0]).toBe("Switch to light theme");
  });
});
