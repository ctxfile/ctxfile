import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  autoCaptureBlocked,
  BEHAVIOR_BLOCK_BEGIN,
  BEHAVIOR_BLOCK_END,
  clearBehaviorState,
  detectHarnesses,
  installBehavior,
  loadCanonicalBehaviors,
  renderAllBehaviors,
  uninstallBehavior,
  writeBehaviorState,
} from "../src/behavior.js";
import { loadConfig } from "../src/config.js";
import { createServer } from "../src/server.js";
import { IngestStore } from "../src/storage/ingest-store.js";

describe("behavior pack (renders + install)", () => {
  it("renders all five harness formats from the canonical spec, with B1-B5 intact", () => {
    const canonical = loadCanonicalBehaviors();
    for (const marker of ["B1", "B2", "B3", "B4", "B5", "B6", "✓ Checkpointed to ctxfile", 'trigger: "auto"', "Never save silently", "NEVER ask for, echo, or handle the passphrase"]) {
      expect(canonical).toContain(marker);
    }
    const renders = renderAllBehaviors(canonical);
    expect(renders.map((r) => r.harness)).toEqual(["claude-code", "cursor", "agents-md", "codex", "generic"]);
    for (const render of renders) {
      expect(render.content).toContain("Checkpoint on significance");
    }
    expect(renders[0]?.content.startsWith("---\nname: ctxfile\n")).toBe(true);
    expect(renders[1]?.content).toContain("alwaysApply: true");
  });

  it("committed renders match the renderer (drift guard for scripts/render-behaviors.mjs)", () => {
    const renderRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "behaviors", "render");
    for (const render of renderAllBehaviors()) {
      const committed = readFileSync(path.join(renderRoot, render.relativePath), "utf8");
      // Compare content, not line endings: git may check these out as CRLF on
      // Windows. The published files are pinned to LF via .gitattributes.
      expect(committed.replace(/\r\n/g, "\n")).toBe(render.content.replace(/\r\n/g, "\n"));
    }
  });

  it("installs per harness: whole files for skills/rules, a managed block for AGENTS.md", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "cb-behave-"));
    try {
      const claude = installBehavior("claude-code", dir);
      expect(claude.action).toBe("created");
      expect(readFileSync(path.join(dir, ".claude", "skills", "ctxfile", "SKILL.md"), "utf8")).toContain("name: ctxfile");

      writeFileSync(path.join(dir, "AGENTS.md"), "# Existing instructions\n\nKeep me.\n");
      installBehavior("agents-md", dir);
      const first = readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      expect(first).toContain("Keep me.");
      expect(first).toContain(BEHAVIOR_BLOCK_BEGIN);
      installBehavior("agents-md", dir); // idempotent re-install
      const second = readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      expect(second.split(BEHAVIOR_BLOCK_BEGIN)).toHaveLength(2);
      expect(second.split(BEHAVIOR_BLOCK_END)).toHaveLength(2);

      const detected = detectHarnesses(dir, dir);
      expect(detected.map((d) => d.harness)).toContain("claude-code");
      expect(detected.map((d) => d.harness)).toContain("agents-md");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("auto-capture guardrails (pause, private, debounce)", () => {
  let dir: string;
  let cacheDir: string;
  let client: Client;
  let store: IngestStore;

  async function autoSave(thread: string, summary: string, extra: Record<string, unknown> = {}) {
    return client.callTool({
      name: "save_session",
      arguments: { summary, thread, trigger: "auto", ...extra },
    });
  }

  beforeAll(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-guard-"));
    cacheDir = path.join(dir, "cache");
    writeFileSync(path.join(dir, "README.md"), "# Fixture");
    // Hermetic cacheDir + a 5-minute debounce window via project config.
    writeFileSync(path.join(dir, ".ctxfile.json"), JSON.stringify({ cacheDir, behavior: { debounceMinutes: 5 } }));
    // Auto-capture is off until consent is recorded; these guardrail tests
    // model a post-'ctxfile init' install where the user opted in.
    writeBehaviorState(cacheDir, { autoCapture: true, paused: false, consentAt: new Date().toISOString() });
    execFileSync("git", ["init", "-b", "main"], { cwd: dir, stdio: "pipe" });

    const config = loadConfig({ root: dir, env: {} });
    store = new IngestStore(path.join(dir, "ingest.db"));
    const server = createServer(config, { cache: null, ingest: store });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "skill-agent", version: "0.0.0" });
    await client.connect(clientTransport);
  });

  afterAll(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("announces automatic checkpoints with the B4 line and stamps trigger provenance", async () => {
    const result = await autoSave("Q3 campaign", "Finished the brief.", { session_id: "auto-1" });
    expect(result.isError ?? false).toBe(false);
    expect((result.content as { text: string }[])[0]?.text).toContain("✓ Checkpointed to ctxfile (thread: Q3 campaign)");
    expect(result.structuredContent).toMatchObject({ stored: true });
    const record = store.list(dir)[0];
    expect(record?.trigger).toBe("auto");
    const { ingestToSessionDigest } = await import("../src/ingest.js");
    expect(ingestToSessionDigest(record as NonNullable<typeof record>).digest).toContain("auto checkpoint");
  });

  it("debounces an unchanged checkpoint inside the window, accepts changed content", async () => {
    const repeat = await autoSave("Q3 campaign", "Finished the brief.", { session_id: "auto-2" });
    expect(repeat.isError ?? false).toBe(false);
    expect(repeat.structuredContent).toMatchObject({ stored: false });
    expect((repeat.content as { text: string }[])[0]?.text).toContain("debounced");
    expect(store.list(dir)).toHaveLength(1); // nothing new stored

    const changed = await autoSave("Q3 campaign", "Finished the brief AND drafted the social copy.", { session_id: "auto-3" });
    expect(changed.structuredContent).toMatchObject({ stored: true });
    expect(store.list(dir)).toHaveLength(2);

    // A handoff is never debounced.
    const handoff = await autoSave("Q3 campaign", "Finished the brief AND drafted the social copy.", {
      session_id: "auto-4",
      handoff: true,
      state: "Brief done; copy drafted; launch not started.",
      key_decisions: ["launch Sep 3 because the venue is free"],
      open_items: ["book the venue"],
      gotchas: ["legal must approve the tagline"],
      artifacts: [{ ref: "brief.md", role: "the campaign brief" }],
      suggested_first_prompt: "Book the venue, then confirm legal sign-off.",
    });
    expect(handoff.structuredContent).toMatchObject({ stored: true, handoff: true });
  });

  it("manual saves are never debounced", async () => {
    const manual = await client.callTool({
      name: "save_session",
      arguments: { summary: "Finished the brief AND drafted the social copy.", thread: "Q3 campaign", session_id: "manual-1" },
    });
    expect(manual.structuredContent).toMatchObject({ stored: true });
  });

  it("private threads refuse auto-capture but accept manual saves", async () => {
    const threadId = store.listThreads(dir).find((t) => t.title === "Q3 campaign")?.id as number;
    expect(store.setThreadPrivate(dir, threadId, true)).toBe(true);
    const refused = await autoSave("Q3 campaign", "Something new entirely.", { session_id: "auto-5" });
    expect(refused.structuredContent).toMatchObject({ stored: false });
    expect((refused.content as { text: string }[])[0]?.text).toContain("private");
    const manual = await client.callTool({
      name: "save_session",
      arguments: { summary: "Something new entirely.", thread: "Q3 campaign", session_id: "manual-2" },
    });
    expect(manual.structuredContent).toMatchObject({ stored: true });
    store.setThreadPrivate(dir, threadId, false);
  });

  it("pause refuses every auto checkpoint until resume", async () => {
    writeBehaviorState(cacheDir, { autoCapture: true, paused: true });
    const refused = await autoSave("Q3 campaign", "Work while paused.", { session_id: "auto-6" });
    expect(refused.structuredContent).toMatchObject({ stored: false });
    expect((refused.content as { text: string }[])[0]?.text).toContain("paused");
    writeBehaviorState(cacheDir, { autoCapture: true, paused: false });
    const accepted = await autoSave("Q3 campaign", "Work after resume.", { session_id: "auto-7" });
    expect(accepted.structuredContent).toMatchObject({ stored: true });
  });
});

describe("auto-capture consent default", () => {
  it("is off on a fresh install (no behavior.json) and on only after consent", () => {
    const fresh = mkdtempSync(path.join(os.tmpdir(), "cb-consent-"));
    try {
      // Fail-closed: a brand-new project must not auto-capture before init.
      expect(autoCaptureBlocked(fresh).blocked).toBe(true);
      writeBehaviorState(fresh, { autoCapture: true, paused: false });
      expect(autoCaptureBlocked(fresh).blocked).toBe(false);
      // An explicit opt-out also blocks.
      writeBehaviorState(fresh, { autoCapture: false, paused: false });
      expect(autoCaptureBlocked(fresh).blocked).toBe(true);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});

describe("behavior uninstall (reverse of init)", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "cb-uninstall-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("round-trips the claude-code skill: install then uninstall removes only our dir", () => {
    const skill = path.join(root, ".claude", "skills", "ctxfile", "SKILL.md");
    installBehavior("claude-code", root);
    expect(existsSync(skill)).toBe(true);
    const r = uninstallBehavior("claude-code", root);
    expect(r.action).toBe("removed");
    expect(existsSync(skill)).toBe(false);
    expect(existsSync(path.join(root, ".claude", "skills", "ctxfile"))).toBe(false);
    // We never delete the parent .claude/skills tree.
    expect(existsSync(path.join(root, ".claude", "skills"))).toBe(true);
  });

  it("round-trips the cursor rule, leaving sibling rules untouched", () => {
    const sibling = path.join(root, ".cursor", "rules", "my-own.mdc");
    installBehavior("cursor", root);
    writeFileSync(sibling, "my own cursor rule");
    const r = uninstallBehavior("cursor", root);
    expect(r.action).toBe("removed");
    expect(existsSync(path.join(root, ".cursor", "rules", "ctxfile.mdc"))).toBe(false);
    expect(readFileSync(sibling, "utf8")).toBe("my own cursor rule"); // untouched
  });

  it("strips only the AGENTS.md managed block, preserving surrounding content", () => {
    const agents = path.join(root, "AGENTS.md");
    writeFileSync(agents, "# My project rules\n\nKeep this line.\n");
    installBehavior("agents-md", root);
    const withBlock = readFileSync(agents, "utf8");
    expect(withBlock).toContain(BEHAVIOR_BLOCK_BEGIN);
    expect(withBlock).toContain("Keep this line.");

    const r = uninstallBehavior("agents-md", root);
    expect(r.action).toBe("stripped");
    const after = readFileSync(agents, "utf8");
    expect(after).not.toContain(BEHAVIOR_BLOCK_BEGIN);
    expect(after).not.toContain(BEHAVIOR_BLOCK_END);
    expect(after).toContain("# My project rules");
    expect(after).toContain("Keep this line.");
  });

  it("removes an AGENTS.md we authored entirely (block was the whole file)", () => {
    installBehavior("agents-md", root); // no prior AGENTS.md -> file is just our block
    expect(existsSync(path.join(root, "AGENTS.md"))).toBe(true);
    const r = uninstallBehavior("agents-md", root);
    expect(r.action).toBe("removed");
    expect(existsSync(path.join(root, "AGENTS.md"))).toBe(false);
  });

  it("reports 'absent' when nothing is installed and never throws", () => {
    for (const h of ["claude-code", "cursor", "agents-md"] as const) {
      expect(uninstallBehavior(h, root).action).toBe("absent");
    }
  });

  it("clearBehaviorState returns the install to fail-closed and reports presence", () => {
    expect(clearBehaviorState(root)).toBe(false); // nothing to clear yet
    writeBehaviorState(root, { autoCapture: true, paused: false });
    expect(autoCaptureBlocked(root).blocked).toBe(false);
    expect(clearBehaviorState(root)).toBe(true);
    expect(autoCaptureBlocked(root).blocked).toBe(true); // back to fail-closed
  });
});
