import { describe, expect, it } from "vitest";
import {
  formatAge,
  formatCompact,
  formatDayLabel,
  formatDuration,
  formatRelative,
  initials,
  percent,
  splitPath,
  truncateMiddle,
} from "./format";

describe("format helpers", () => {
  it("formatAge scales units", () => {
    expect(formatAge(5_000)).toBe("5s ago");
    expect(formatAge(120_000)).toBe("2m ago");
    expect(formatAge(7_200_000)).toBe("2h ago");
    expect(formatAge(172_800_000)).toBe("2d ago");
  });

  it("formatRelative handles bad input and the future", () => {
    const now = Date.UTC(2026, 0, 1, 12);
    expect(formatRelative(null)).toBe("unknown");
    expect(formatRelative("not a date")).toBe("unknown");
    expect(formatRelative(now + 5000, now)).toBe("just now");
    expect(formatRelative(now - 90_000, now)).toBe("2m ago");
  });

  it("formatCompact", () => {
    expect(formatCompact(950)).toBe("950");
    expect(formatCompact(1_500)).toBe("1.5k");
    expect(formatCompact(18_432)).toBe("18.4k");
    expect(formatCompact(1_250_000)).toBe("1.25M");
    expect(formatCompact(Number.NaN)).toBe("–");
  });

  it("formatDuration", () => {
    expect(formatDuration(12)).toBe("12ms");
    expect(formatDuration(1_400)).toBe("1.4s");
    expect(formatDuration(12_400)).toBe("12s");
    expect(formatDuration(125_000)).toBe("2m 05s");
  });

  it("formatDayLabel", () => {
    const now = new Date(2026, 5, 15, 10);
    expect(formatDayLabel(new Date(2026, 5, 15, 2).getTime(), now)).toBe("Today");
    expect(formatDayLabel(new Date(2026, 5, 14, 23).getTime(), now)).toBe("Yesterday");
    expect(formatDayLabel("garbage", now)).toBe("Unknown date");
  });

  it("truncateMiddle and splitPath", () => {
    expect(truncateMiddle("short")).toBe("short");
    const long = "a".repeat(30) + "/" + "b".repeat(30);
    expect(truncateMiddle(long, 21)).toHaveLength(21);
    expect(splitPath("src/lib/x.ts")).toEqual({ dir: "src/lib/", base: "x.ts" });
    expect(splitPath("x.ts")).toEqual({ dir: "", base: "x.ts" });
  });

  it("initials and percent", () => {
    expect(initials("claude-code")).toBe("CC");
    expect(initials("cursor")).toBe("C");
    expect(initials("")).toBe("?");
    expect(percent(1, 4)).toBe(25);
    expect(percent(5, 0)).toBe(0);
    expect(percent(9, 4)).toBe(100);
  });
});
