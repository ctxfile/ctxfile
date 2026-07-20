import { describe, expect, it } from "vitest";
import { extractWikilinks, WikilinkResolver } from "../src/connectors/wikilinks.js";

describe("extractWikilinks", () => {
  it("handles plain, alias, heading, block, and embed forms", () => {
    const content = "See [[Roadmap]] and [[Roadmap|the plan]] plus [[Specs#api]] and [[Specs^b1]] and ![[Diagram]].";
    expect(extractWikilinks(content)).toEqual(["Roadmap", "Specs", "Diagram"]);
  });

  it("keeps path-qualified targets and skips empties", () => {
    expect(extractWikilinks("[[Projects/Launch]] [[ ]]")).toEqual(["Projects/Launch"]);
  });

  it("does not swallow nested or unterminated brackets", () => {
    expect(extractWikilinks("[[a [[b]] and [[c]]")).toEqual(["b", "c"]);
  });
});

describe("WikilinkResolver", () => {
  const resolver = new WikilinkResolver(["Projects/Launch.md", "Areas/Launch.md", "Roadmap.md"]);

  it("resolves a unique basename case-insensitively", () => {
    expect(resolver.resolve("roadmap")).toBe("Roadmap.md");
  });

  it("returns null for ambiguous basenames and dangling links", () => {
    expect(resolver.resolve("Launch")).toBeNull();
    expect(resolver.resolve("Nowhere")).toBeNull();
  });

  it("disambiguates via a path-qualified target", () => {
    expect(resolver.resolve("Projects/Launch")).toBe("Projects/Launch.md");
    expect(resolver.resolve("projects/launch.md")).toBe("Projects/Launch.md");
  });
});
