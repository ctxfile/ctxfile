import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { createNotionConnector, type FetchLike } from "../src/connectors/notion.js";
import { TokenBudget } from "../src/engine/tokens.js";

const dir = mkdtempSync(path.join(os.tmpdir(), "cb-notion-"));
writeFileSync(path.join(dir, ".ctxfile.json"), JSON.stringify({ notion: { pageIds: ["page1"] } }));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const configWithToken = () => loadConfig({ root: dir, env: { NOTION_TOKEN: "ntn_testtoken" } });

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function richText(text: string) {
  return [{ type: "text", plain_text: text }];
}

const pageBody = {
  id: "page1",
  last_edited_time: "2026-07-01T00:00:00.000Z",
  properties: {
    Name: { type: "title", title: richText("My Project Notes") },
  },
};

describe("createNotionConnector", () => {
  it("is disabled without a token", () => {
    const config = loadConfig({ root: dir, env: {} });
    const connector = createNotionConnector();
    expect(connector.isEnabled(config)).toBe(false);
  });

  it("is enabled with token and pageIds", () => {
    const connector = createNotionConnector();
    expect(connector.isEnabled(configWithToken())).toBe(true);
  });

  it("fetches page title and block content with correct headers", async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      seen.push({ url: String(url), headers: Object.fromEntries(new Headers(init?.headers).entries()) });
      if (String(url).includes("/pages/")) return jsonResponse(pageBody);
      return jsonResponse({
        results: [
          { id: "b1", type: "heading_1", has_children: false, heading_1: { rich_text: richText("Title") } },
          { id: "b2", type: "paragraph", has_children: false, paragraph: { rich_text: richText("Hello world") } },
          { id: "b3", type: "to_do", has_children: false, to_do: { rich_text: richText("Ship it"), checked: true } },
        ],
        has_more: false,
        next_cursor: null,
      });
    };
    const connector = createNotionConnector({ fetchImpl, minIntervalMs: 0 });
    const result = await connector.snapshot({ config: configWithToken(), budget: new TokenBudget(50_000) });

    expect(result.notionPages).toHaveLength(1);
    const page = result.notionPages![0]!;
    expect(page.title).toBe("My Project Notes");
    expect(page.lastEditedTime).toBe("2026-07-01T00:00:00.000Z");
    expect(page.content).toContain("# Title");
    expect(page.content).toContain("Hello world");
    expect(page.content).toContain("[x] Ship it");

    for (const request of seen) {
      expect(request.headers["authorization"]).toBe("Bearer ntn_testtoken");
      expect(request.headers["notion-version"]).toBe("2026-03-11");
    }
  });

  it("paginates block children via next_cursor", async () => {
    let blockCalls = 0;
    const fetchImpl: FetchLike = async (url) => {
      if (String(url).includes("/pages/")) return jsonResponse(pageBody);
      blockCalls += 1;
      if (!String(url).includes("start_cursor")) {
        return jsonResponse({
          results: [{ id: "b1", type: "paragraph", has_children: false, paragraph: { rich_text: richText("page one") } }],
          has_more: true,
          next_cursor: "cursor2",
        });
      }
      return jsonResponse({
        results: [{ id: "b2", type: "paragraph", has_children: false, paragraph: { rich_text: richText("page two") } }],
        has_more: false,
        next_cursor: null,
      });
    };
    const connector = createNotionConnector({ fetchImpl, minIntervalMs: 0 });
    const result = await connector.snapshot({ config: configWithToken(), budget: new TokenBudget(50_000) });
    expect(blockCalls).toBe(2);
    expect(result.notionPages![0]!.content).toContain("page one");
    expect(result.notionPages![0]!.content).toContain("page two");
  });

  it("recurses into blocks with children", async () => {
    const fetchImpl: FetchLike = async (url) => {
      const u = String(url);
      if (u.includes("/pages/")) return jsonResponse(pageBody);
      if (u.includes("/blocks/parentblock/")) {
        return jsonResponse({
          results: [{ id: "child1", type: "paragraph", has_children: false, paragraph: { rich_text: richText("nested text") } }],
          has_more: false,
          next_cursor: null,
        });
      }
      return jsonResponse({
        results: [
          { id: "parentblock", type: "toggle", has_children: true, toggle: { rich_text: richText("Toggle head") } },
        ],
        has_more: false,
        next_cursor: null,
      });
    };
    const connector = createNotionConnector({ fetchImpl, minIntervalMs: 0 });
    const result = await connector.snapshot({ config: configWithToken(), budget: new TokenBudget(50_000) });
    expect(result.notionPages![0]!.content).toContain("Toggle head");
    expect(result.notionPages![0]!.content).toContain("nested text");
  });

  it("retries on 429 honoring Retry-After", async () => {
    let pageCalls = 0;
    const fetchImpl: FetchLike = async (url) => {
      if (String(url).includes("/pages/")) {
        pageCalls += 1;
        if (pageCalls === 1) {
          return jsonResponse({ code: "public_api_request_rate_limit" }, 429, { "retry-after": "0" });
        }
        return jsonResponse(pageBody);
      }
      return jsonResponse({ results: [], has_more: false, next_cursor: null });
    };
    const connector = createNotionConnector({ fetchImpl, minIntervalMs: 0 });
    const result = await connector.snapshot({ config: configWithToken(), budget: new TokenBudget(50_000) });
    expect(pageCalls).toBe(2);
    expect(result.notionPages![0]!.title).toBe("My Project Notes");
  });

  it("redacts secrets found in page content", async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (String(url).includes("/pages/")) return jsonResponse(pageBody);
      return jsonResponse({
        results: [
          {
            id: "b1",
            type: "paragraph",
            has_children: false,
            paragraph: { rich_text: richText("deploy key ghp_abcdefghijklmnopqrstuvwxyz0123456789") },
          },
        ],
        has_more: false,
        next_cursor: null,
      });
    };
    const connector = createNotionConnector({ fetchImpl, minIntervalMs: 0 });
    const result = await connector.snapshot({ config: configWithToken(), budget: new TokenBudget(50_000) });
    expect(result.notionPages![0]!.content).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(result.notionPages![0]!.content).toContain("[REDACTED:");
  });

  it("redacts secrets in page titles", async () => {
    const secretTitlePage = {
      ...pageBody,
      properties: {
        Name: { type: "title", title: [{ type: "text", plain_text: "prod ghp_abcdefghijklmnopqrstuvwxyz0123456789" }] },
      },
    };
    const fetchImpl: FetchLike = async (url) => {
      if (String(url).includes("/pages/")) return jsonResponse(secretTitlePage);
      return jsonResponse({ results: [], has_more: false, next_cursor: null });
    };
    const connector = createNotionConnector({ fetchImpl, minIntervalMs: 0 });
    const result = await connector.snapshot({ config: configWithToken(), budget: new TokenBudget(50_000) });
    expect(result.notionPages![0]!.title).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(result.notionPages![0]!.title).toContain("[REDACTED:");
  });

  it("isolates a failing page without losing the others", async () => {
    const twoPageConfig = () => {
      writeFileSync(path.join(dir, ".ctxfile.json"), JSON.stringify({ notion: { pageIds: ["bad", "page1"] } }));
      return loadConfig({ root: dir, env: { NOTION_TOKEN: "ntn_testtoken" } });
    };
    const fetchImpl: FetchLike = async (url) => {
      const u = String(url);
      if (u.includes("/pages/bad")) return jsonResponse({ message: "not found" }, 404);
      if (u.includes("/pages/")) return jsonResponse(pageBody);
      return jsonResponse({ results: [], has_more: false, next_cursor: null });
    };
    const connector = createNotionConnector({ fetchImpl, minIntervalMs: 0 });
    const result = await connector.snapshot({ config: twoPageConfig(), budget: new TokenBudget(50_000) });
    expect(result.notionPages).toHaveLength(1);
    expect(result.notionPages![0]!.title).toBe("My Project Notes");
  });
});
