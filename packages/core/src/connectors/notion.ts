import { truncateToTokens } from "../engine/tokens.js";
import { redactContent } from "../redact.js";
import type { NotionPage } from "../engine/types.js";
import type { Connector, SnapshotInput } from "./types.js";

// Cap each page so a huge Notion doc can't dominate the snapshot's token budget.
const PAGE_MAX_TOKENS = 4_000;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface NotionConnectorOptions {
  fetchImpl?: FetchLike;
  /** Minimum ms between requests. Notion allows ~3 req/s per connection. */
  minIntervalMs?: number;
}

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";
const MAX_RETRIES = 3;
const MAX_DEPTH = 4;

interface RichTextItem {
  plain_text?: string;
}

interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

interface BlockChildrenResponse {
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
}

interface NotionPageResponse {
  id: string;
  last_edited_time: string;
  properties: Record<string, { type: string; title?: RichTextItem[] }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function richTextToString(items: unknown): string {
  if (!Array.isArray(items)) return "";
  return (items as RichTextItem[]).map((item) => item.plain_text ?? "").join("");
}

function blockToText(block: NotionBlock): string {
  const data = block[block.type] as Record<string, unknown> | undefined;
  const text = richTextToString(data?.["rich_text"]);
  switch (block.type) {
    case "heading_1":
      return `# ${text}`;
    case "heading_2":
      return `## ${text}`;
    case "heading_3":
      return `### ${text}`;
    case "bulleted_list_item":
      return `- ${text}`;
    case "numbered_list_item":
      return `1. ${text}`;
    case "to_do":
      return `[${data?.["checked"] ? "x" : " "}] ${text}`;
    case "quote":
      return `> ${text}`;
    case "code": {
      const language = typeof data?.["language"] === "string" ? data["language"] : "";
      return `\`\`\`${language}\n${text}\n\`\`\``;
    }
    case "divider":
      return "---";
    default:
      return text;
  }
}

class NotionClient {
  private lastRequestAt = 0;

  constructor(
    private readonly token: string,
    private readonly fetchImpl: FetchLike,
    private readonly minIntervalMs: number
  ) {}

  private async request(url: string, attempt = 0): Promise<unknown> {
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();

    const response = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Notion-Version": NOTION_VERSION,
      },
    });

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "1");
      await sleep(Math.max(0, retryAfter * 1000));
      return this.request(url, attempt + 1);
    }
    if (!response.ok) {
      throw new Error(`notion API ${response.status} for ${url.replace(NOTION_API, "")}`);
    }
    return response.json();
  }

  async getPage(pageId: string): Promise<NotionPageResponse> {
    return (await this.request(`${NOTION_API}/pages/${pageId}`)) as NotionPageResponse;
  }

  async getBlockText(blockId: string, depth: number, indent: string): Promise<string[]> {
    const lines: string[] = [];
    let cursor: string | null = null;
    do {
      const url =
        `${NOTION_API}/blocks/${blockId}/children?page_size=100` +
        (cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : "");
      const page = (await this.request(url)) as BlockChildrenResponse;
      for (const block of page.results) {
        const text = blockToText(block);
        if (text.trim().length > 0) lines.push(indent + text);
        if (block.has_children && depth < MAX_DEPTH) {
          lines.push(...(await this.getBlockText(block.id, depth + 1, indent + "  ")));
        }
      }
      cursor = page.has_more ? page.next_cursor : null;
    } while (cursor);
    return lines;
  }
}

function extractTitle(page: NotionPageResponse): string {
  for (const property of Object.values(page.properties ?? {})) {
    if (property.type === "title") {
      const title = richTextToString(property.title);
      if (title) return title;
    }
  }
  return "Untitled";
}

export function createNotionConnector(options: NotionConnectorOptions = {}): Connector {
  const fetchImpl = options.fetchImpl ?? ((url, init) => globalThis.fetch(url, init));
  const minIntervalMs = options.minIntervalMs ?? 334;

  return {
    name: "notion",

    isEnabled(config): boolean {
      return config.notion.token !== null && config.notion.pageIds.length > 0;
    },

    async snapshot({ config }: SnapshotInput) {
      const token = config.notion.token;
      if (!token) return { notionPages: [] };
      const client = new NotionClient(token, fetchImpl, minIntervalMs);

      const notionPages: NotionPage[] = [];
      for (const pageId of config.notion.pageIds) {
        // Per-page isolation: one bad/inaccessible page must not zero out the
        // rest of the connector's results.
        try {
          const page = await client.getPage(pageId);
          const lines = await client.getBlockText(pageId, 0, "");
          const { text } = redactContent(truncateToTokens(lines.join("\n"), PAGE_MAX_TOKENS).text);
          notionPages.push({
            id: page.id,
            // Titles are ingested content too — redact them.
            title: redactContent(extractTitle(page)).text,
            lastEditedTime: page.last_edited_time,
            content: text,
          });
        } catch (error) {
          console.error(
            `ctxfile: notion page ${pageId} skipped: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      return { notionPages };
    },
  };
}
