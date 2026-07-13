import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { createOllamaSummarizer } from "../src/connectors/ollama.js";
import type { FetchLike } from "../src/connectors/notion.js";
import type { ContextObject } from "../src/engine/types.js";

const dir = mkdtempSync(path.join(os.tmpdir(), "cb-ollama-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function configWith(summarize: boolean, model?: string) {
  writeFileSync(
    path.join(dir, ".ctxfile.json"),
    JSON.stringify({ ollama: { summarize, ...(model ? { model } : {}) } })
  );
  return loadConfig({ root: dir, env: {} });
}

const sampleContext: ContextObject = {
  meta: {
    name: "ctxfile",
    version: "0.1.0",
    generatedAt: "2026-07-09T00:00:00.000Z",
    root: dir,
    tokenBudget: 50_000,
    tokensUsed: 10,
    connectors: [],
  },
  plan: "Ship phase 1",
  keyFiles: [{ path: "src/index.ts", tokens: 5, truncated: false, redactions: 0, content: "export {}" }],
  gitState: null,
  notionPages: [],
  sessionSummary: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("createOllamaSummarizer", () => {
  it("is disabled unless summarize is configured", () => {
    const summarizer = createOllamaSummarizer();
    expect(summarizer.isEnabled(configWith(false))).toBe(false);
    expect(summarizer.isEnabled(configWith(true))).toBe(true);
  });

  it("returns null gracefully when ollama is unreachable", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("ECONNREFUSED");
    };
    const summarizer = createOllamaSummarizer({ fetchImpl });
    const result = await summarizer.summarize(sampleContext, configWith(true));
    expect(result).toBeNull();
  });

  it("falls back to the first available model when none configured", async () => {
    const calls: { url: string; body?: string }[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url: String(url), body: init?.body ? String(init.body) : undefined });
      if (String(url).endsWith("/api/tags")) {
        return jsonResponse({ models: [{ name: "qwen3:4b" }, { name: "llama3:8b" }] });
      }
      return jsonResponse({ response: " A tidy summary. " });
    };
    const summarizer = createOllamaSummarizer({ fetchImpl });
    const result = await summarizer.summarize(sampleContext, configWith(true));
    expect(result).toBe("A tidy summary.");
    const generateCall = calls.find((c) => c.url.endsWith("/api/generate"));
    expect(generateCall).toBeDefined();
    const payload = JSON.parse(generateCall!.body!);
    expect(payload.model).toBe("qwen3:4b");
    expect(payload.stream).toBe(false);
    expect(payload.prompt).toContain("Ship phase 1");
  });

  it("uses the configured model when present", async () => {
    const fetchImpl: FetchLike = async (url, init) => {
      if (String(url).endsWith("/api/tags")) return jsonResponse({ models: [{ name: "other" }] });
      const payload = JSON.parse(String(init!.body));
      expect(payload.model).toBe("my-model:latest");
      return jsonResponse({ response: "ok" });
    };
    const summarizer = createOllamaSummarizer({ fetchImpl });
    const result = await summarizer.summarize(sampleContext, configWith(true, "my-model:latest"));
    expect(result).toBe("ok");
  });

  it("returns null when no models are installed", async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (String(url).endsWith("/api/tags")) return jsonResponse({ models: [] });
      throw new Error("should not generate");
    };
    const summarizer = createOllamaSummarizer({ fetchImpl });
    const result = await summarizer.summarize(sampleContext, configWith(true));
    expect(result).toBeNull();
  });
});
