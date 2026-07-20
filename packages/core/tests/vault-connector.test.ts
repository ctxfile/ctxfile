import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { createVaultConnectors } from "../src/connectors/vault.js";
import type { SnapshotHints } from "../src/connectors/types.js";
import { estimateTokens, TokenBudget } from "../src/engine/tokens.js";
import type { VaultNote } from "../src/engine/types.js";

describe("vault connector", () => {
  let root: string;
  let vault: string;

  const note = (rel: string, body: string, mtime?: Date): void => {
    const abs = path.join(vault, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body);
    if (mtime) utimesSync(abs, mtime, mtime);
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "cb-vault-root-"));
    vault = mkdtempSync(path.join(os.tmpdir(), "cb-vault-"));
    mkdirSync(path.join(vault, ".obsidian"));
    writeFileSync(path.join(vault, ".obsidian", "app.json"), "{}");
    mkdirSync(path.join(vault, "Templates"));
    writeFileSync(path.join(vault, "Templates", "daily.md"), "template body");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  });

  function connectorsFor(extra: Record<string, unknown> = {}) {
    writeFileSync(path.join(root, ".ctxfile.json"), JSON.stringify({ vaults: [{ path: vault, name: "test", ...extra }] }));
    const config = loadConfig({ root, env: {} });
    return { config, connectors: createVaultConnectors(config) };
  }

  async function snapshot(hints?: SnapshotHints, budgetTokens = 50_000, extra: Record<string, unknown> = {}) {
    const { config, connectors } = connectorsFor(extra);
    expect(connectors).toHaveLength(1);
    const partial = await connectors[0]!.snapshot({ config, budget: new TokenBudget(budgetTokens), hints });
    return (partial.notes ?? []) as VaultNote[];
  }

  it("creates no connectors when no vaults are configured", () => {
    const config = loadConfig({ root, env: {} });
    expect(createVaultConnectors(config)).toEqual([]);
  });

  it("names the connector vault:<name> and collects notes with provenance", async () => {
    const { connectors } = connectorsFor();
    expect(connectors[0]!.name).toBe("vault:test");
    note("Projects/launch.md", "---\ntitle: Launch\ntags: [go]\n---\nLaunch content");
    const notes = await snapshot();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ source: "obsidian", vault: "test", path: "Projects/launch.md", title: "Launch", tags: ["go"] });
    expect(notes[0]!.content).toContain("Launch content");
    expect(notes[0]!.content).not.toContain("title: Launch");
  });

  it("never surfaces .obsidian, Templates (case-insensitive), excluded or denied files", async () => {
    note("keep.md", "kept");
    note("Archive/old.md", "archived");
    note("credentials.md", "SECRET");
    const notes = await snapshot(undefined, 50_000, { exclude: ["Archive/**"] });
    expect(notes.map((n) => n.path)).toEqual(["keep.md"]);
  });

  it("never follows symlinks out of the vault", async () => {
    const outside = mkdtempSync(path.join(os.tmpdir(), "cb-vault-outside-"));
    writeFileSync(path.join(outside, "secret.md"), "SECRETLEAK");
    symlinkSync(path.join(outside, "secret.md"), path.join(vault, "link.md"));
    symlinkSync(outside, path.join(vault, "linkdir"));
    note("real.md", "real");
    const notes = await snapshot();
    expect(JSON.stringify(notes)).not.toContain("SECRETLEAK");
  });

  it("redacts secrets in content, title, and tags", async () => {
    note("leak.md", '---\ntitle: "token ghp_abcdefghijklmnopqrstuvwxyz0123456789"\n---\napi_key = "supersecret123"');
    const notes = await snapshot();
    expect(JSON.stringify(notes)).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(JSON.stringify(notes)).not.toContain("supersecret123");
    expect(notes[0]!.redactions).toBeGreaterThanOrEqual(1);
  });

  it("selects an old pinned note even in a large recency-crowded vault (cap regression)", async () => {
    const old = new Date("2020-01-01T00:00:00Z");
    note("charter.md", "---\nctxfile: pin\n---\nProject charter", old);
    for (let i = 0; i < 320; i += 1) note(`recent/n${i}.md`, `filler ${i}`);
    const notes = await snapshot(undefined, 2_000);
    expect(notes[0]!.path).toBe("charter.md");
    expect(notes[0]!.pinned).toBe(true);
  });

  it("boosts thread-relevant notes above recent noise", async () => {
    const old = new Date("2021-01-01T00:00:00Z");
    note("campaign.md", "---\ntags: [campaign]\n---\nQ3 campaign notes", old);
    note("noise.md", "unrelated but newer");
    const notes = await snapshot({ threadTitleTokens: ["campaign"] }, 50_000);
    expect(notes[0]!.path).toBe("campaign.md");
  });

  it("respects the token budget", async () => {
    note("a.md", "x".repeat(4000));
    note("b.md", "y".repeat(4000));
    const notes = await snapshot(undefined, 1_100);
    expect(notes.length).toBe(1);
  });

  it("skips an oversized note (>512KB) before ever reading its content", async () => {
    note("keep.md", "kept, small");
    note("huge.md", "x".repeat(524_289)); // MAX_FILE_BYTES (512 * 1024 = 524288) + 1
    const notes = await snapshot();
    expect(notes.map((n) => n.path)).toEqual(["keep.md"]);
    expect(JSON.stringify(notes)).not.toContain("huge");
  });

  it("throws on a missing vault dir and returns ok+empty for an empty vault", async () => {
    const { config, connectors } = connectorsFor();
    rmSync(vault, { recursive: true, force: true });
    await expect(connectors[0]!.snapshot({ config, budget: new TokenBudget(1000) })).rejects.toThrow();
    vault = mkdtempSync(path.join(os.tmpdir(), "cb-vault-"));
    const notes = await snapshot();
    expect(notes).toEqual([]);
  });

  it("attaches one-hop stubs with redacted first lines, skipping already-selected targets", async () => {
    note("hub.md", "---\nctxfile: pin\n---\nSee [[Detail]] and [[hub2]]");
    note("hub2.md", "---\nctxfile: pin\n---\nAlso selected");
    note("Detail.md", "First line of detail.\n" + "x".repeat(5000));
    // hub(7)+hub2(4)=11 tokens fit as full notes; Detail's full-note cost
    // (~1256, dominated by its 5000-char body) never fits under this budget,
    // but its stub cost (title 2 + capped firstLine 6 = 8) always does — pins
    // Detail as a stub-only note (spec §4.5) with a wide, non-knife-edge
    // budget window (~[19, 1266]) instead of one exact integer.
    const notes = await snapshot(undefined, 1_000);
    const hub = notes.find((n) => n.path === "hub.md")!;
    expect(hub.links).toEqual([{ title: "Detail", firstLine: "First line of detail." }]);
  });

  it("dedups stubs by resolved target within a note", async () => {
    note("hub.md", "---\nctxfile: pin\n---\n[[Detail]] and [[Detail.md]]");
    note("Detail.md", "First line of detail.\n" + "x".repeat(5000));
    const notes = await snapshot(undefined, 1_000);
    const hub = notes.find((n) => n.path === "hub.md")!;
    expect(hub.links).toHaveLength(1);
  });

  it("never resolves stubs into excluded notes and caps the first line", async () => {
    note("hub.md", "---\nctxfile: pin\n---\n[[Secret]] [[Long]]");
    note("Archive/Secret.md", "hidden");
    note("Long.md", "z".repeat(5000));
    // Budget excludes Long.md (~1250 tokens) as a full note but leaves room
    // for its capped stub (title 1 + firstLine 200 = 201 tokens).
    const notes = await snapshot(undefined, 1_000, { exclude: ["Archive/**"] });
    const hub = notes.find((n) => n.path === "hub.md")!;
    const titles = hub.links.map((l) => l.title);
    expect(titles).not.toContain("Secret");
    const long = hub.links.find((l) => l.title === "Long");
    expect(long).toBeDefined();
    expect(estimateTokens(long!.firstLine)).toBeLessThanOrEqual(200);
  });

  it("promotes wikilink-adjacent notes above fresher unlinked ones (tier 1.5)", async () => {
    const old = new Date("2020-06-01T00:00:00Z");
    note("hub.md", "---\nctxfile: pin\n---\nSee [[Ancient]]", new Date("2026-01-01T00:00:00Z"));
    note("Ancient.md", "old but linked", old);
    note("fresh.md", "new but unlinked");
    const notes = await snapshot(undefined, 50_000);
    const order = notes.map((n) => n.path);
    expect(order.indexOf("Ancient.md")).toBeLessThan(order.indexOf("fresh.md"));
  });
});
