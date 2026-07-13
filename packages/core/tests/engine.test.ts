import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig, type ResolvedConfig } from "../src/config.js";
import type { Connector, Summarizer } from "../src/connectors/types.js";
import { buildContext, filterScope } from "../src/engine/build.js";
import type { BuildEvent, ContextObject } from "../src/engine/types.js";

const dir = mkdtempSync(path.join(os.tmpdir(), "cb-engine-"));
const config = loadConfig({ root: dir, env: {} });

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const okConnector: Connector = {
  name: "ok",
  isEnabled: () => true,
  snapshot: async () => ({
    plan: "the plan",
    keyFiles: [{ path: "a.ts", tokens: 3, truncated: false, redactions: 0, content: "abc" }],
  }),
};

const failingConnector: Connector = {
  name: "boom",
  isEnabled: () => true,
  snapshot: async () => {
    throw new Error("connector exploded");
  },
};

const disabledConnector: Connector = {
  name: "off",
  isEnabled: () => false,
  snapshot: async () => ({ sessionSummary: "should never appear" }),
};

describe("buildContext", () => {
  it("merges successful connectors and isolates failures", async () => {
    const ctx = await buildContext(config, [okConnector, failingConnector, disabledConnector], null);
    expect(ctx.plan).toBe("the plan");
    expect(ctx.keyFiles).toHaveLength(1);
    expect(ctx.sessionSummary).toBeNull();

    const byName = Object.fromEntries(ctx.meta.connectors.map((c) => [c.name, c]));
    expect(byName.ok?.status).toBe("ok");
    expect(byName.boom?.status).toBe("error");
    expect(byName.boom?.error).toContain("connector exploded");
    expect(byName.off?.status).toBe("skipped");
    expect(ctx.meta.root).toBe(config.root);
    expect(ctx.meta.tokenBudget).toBe(config.tokenBudget);
  });

  it("runs the summarizer over the merged context when enabled", async () => {
    const summarizer: Summarizer = {
      name: "sum",
      isEnabled: () => true,
      summarize: async (ctx: ContextObject) => `summary of ${ctx.plan}`,
    };
    const ctx = await buildContext(config, [okConnector], summarizer);
    expect(ctx.sessionSummary).toBe("summary of the plan");
  });

  it("records a summarizer failure without crashing", async () => {
    const summarizer: Summarizer = {
      name: "sum",
      isEnabled: () => true,
      summarize: async () => {
        throw new Error("ollama down");
      },
    };
    const ctx = await buildContext(config, [okConnector], summarizer);
    expect(ctx.sessionSummary).toBeNull();
    const status = ctx.meta.connectors.find((c) => c.name === "sum");
    expect(status?.status).toBe("error");
  });

  it("skips a disabled summarizer", async () => {
    const summarizer: Summarizer = {
      name: "sum",
      isEnabled: (c: ResolvedConfig) => c.ollama.summarize,
      summarize: async () => "nope",
    };
    const ctx = await buildContext(config, [okConnector], summarizer);
    expect(ctx.sessionSummary).toBeNull();
  });
});

describe("filterScope", () => {
  it("keeps everything for full scope", async () => {
    const ctx = await buildContext(config, [okConnector], null);
    expect(filterScope(ctx, "full")).toEqual(ctx);
  });

  it("keeps only git section (plus meta) for git scope", async () => {
    const ctx = await buildContext(config, [okConnector], null);
    const filtered = filterScope(ctx, "git");
    expect(filtered.plan).toBeNull();
    expect(filtered.keyFiles).toEqual([]);
    expect(filtered.notionPages).toEqual([]);
    expect(filtered.meta).toEqual(ctx.meta);
  });

  it("keeps only plan for plan scope and files for files scope", async () => {
    const ctx = await buildContext(config, [okConnector], null);
    expect(filterScope(ctx, "plan").plan).toBe("the plan");
    expect(filterScope(ctx, "plan").keyFiles).toEqual([]);
    expect(filterScope(ctx, "files").keyFiles).toHaveLength(1);
    expect(filterScope(ctx, "files").plan).toBeNull();
  });

  it("carries session digests on full and excludes them from narrow scopes by design", async () => {
    const sessionConnector: Connector = {
      name: "sessions",
      isEnabled: () => true,
      snapshot: async () => ({
        sessions: [
          { source: "claude-code", sessionId: "s1", startedAt: null, lastActiveAt: null, turnCount: 3, digest: "d" },
        ],
      }),
    };
    const ctx = await buildContext(config, [okConnector, sessionConnector], null);
    // full working state includes sessions...
    expect(filterScope(ctx, "full").sessions).toHaveLength(1);
    // ...narrow scopes intentionally omit them (git scope = git only).
    expect(filterScope(ctx, "git").sessions).toBeUndefined();
    expect(filterScope(ctx, "files").sessions).toBeUndefined();
  });
});

describe("buildContext onEvent", () => {
  const stubConnector = (name: string): Connector => ({
    name,
    isEnabled: () => true,
    snapshot: async () => ({ plan: `plan from ${name}` }),
  });

  // Self-contained config factory — one temp dir for the whole describe block.
  const eventDir = mkdtempSync(path.join(os.tmpdir(), "cb-events-"));
  afterAll(() => rmSync(eventDir, { recursive: true, force: true }));
  const makeConfig = () => loadConfig({ root: eventDir });

  it("emits start/done per connector, then tokens, then done", async () => {
    const config = makeConfig();
    const events: BuildEvent[] = [];
    await buildContext(config, [stubConnector("a"), stubConnector("b")], null, "full", (e) => events.push(e));

    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === "connector:start")).toHaveLength(2);
    expect(types.filter((t) => t === "connector:done")).toHaveLength(2);
    expect(types.at(-2)).toBe("tokens");
    expect(types.at(-1)).toBe("done");
    const doneA = events.find((e) => e.type === "connector:done" && e.connector.name === "a");
    expect(doneA && doneA.type === "connector:done" ? doneA.connector.status : null).toBe("ok");
  });

  it("emits connector:done with status skipped/error and never throws from a bad listener", async () => {
    const config = makeConfig();
    const disabled: Connector = { name: "off", isEnabled: () => false, snapshot: async () => ({}) };
    const failing: Connector = {
      name: "boom",
      isEnabled: () => true,
      snapshot: async () => {
        throw new Error("kaput");
      },
    };
    const events: BuildEvent[] = [];
    const ctx = await buildContext(config, [disabled, failing], null, "full", (e) => {
      events.push(e);
      throw new Error("listener bug"); // must not break the build
    });
    expect(ctx.meta.connectors.map((c) => c.status).sort()).toEqual(["error", "skipped"]);
    const doneBoom = events.find((e) => e.type === "connector:done" && e.connector.name === "boom");
    expect(doneBoom && doneBoom.type === "connector:done" ? doneBoom.connector.error : null).toBe("kaput");
  });
});
