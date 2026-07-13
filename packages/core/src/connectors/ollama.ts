import type { ResolvedConfig } from "../config.js";
import { truncateToTokens } from "../engine/tokens.js";
import type { ContextObject } from "../engine/types.js";
import type { FetchLike } from "./notion.js";
import type { Summarizer } from "./types.js";

export interface OllamaSummarizerOptions {
  fetchImpl?: FetchLike;
  healthTimeoutMs?: number;
}

const PROMPT_DIGEST_TOKENS = 6_000;

interface TagsResponse {
  models?: { name: string }[];
}

interface GenerateResponse {
  response?: string;
}

function buildPrompt(ctx: ContextObject): string {
  const parts: string[] = [
    "You are summarizing the working state of a software project for a developer resuming work.",
    "Write a concise summary (max 200 words): what the project is, current plan status, git state, and notable files.",
    "",
  ];
  if (ctx.plan) parts.push(`## Plan\n${ctx.plan}`);
  if (ctx.gitState) {
    parts.push(
      `## Git\nbranch: ${ctx.gitState.branch}\nmodified: ${ctx.gitState.modified.join(", ") || "none"}\n` +
        `recent commits:\n${ctx.gitState.commits.map((c) => `- ${c.message}`).join("\n")}`
    );
  }
  if (ctx.keyFiles.length > 0) {
    parts.push(`## Files\n${ctx.keyFiles.map((f) => f.path).join("\n")}`);
  }
  const digest = parts.join("\n\n");
  return truncateToTokens(digest, PROMPT_DIGEST_TOKENS).text;
}

export function createOllamaSummarizer(options: OllamaSummarizerOptions = {}): Summarizer {
  const fetchImpl = options.fetchImpl ?? ((url, init) => globalThis.fetch(url, init));
  const healthTimeoutMs = options.healthTimeoutMs ?? 2_000;

  return {
    name: "ollama",

    isEnabled(config): boolean {
      return config.ollama.summarize;
    },

    async summarize(ctx: ContextObject, config: ResolvedConfig): Promise<string | null> {
      const baseUrl = config.ollama.baseUrl.replace(/\/$/, "");

      let model = config.ollama.model;
      try {
        const tagsResponse = await fetchImpl(`${baseUrl}/api/tags`, {
          signal: AbortSignal.timeout(healthTimeoutMs),
        });
        if (!tagsResponse.ok) return null;
        const tags = (await tagsResponse.json()) as TagsResponse;
        if (!model) {
          model = tags.models?.[0]?.name ?? null;
        }
      } catch {
        // Ollama not running — summarization is best-effort, skip quietly.
        return null;
      }
      if (!model) return null;

      const generateResponse = await fetchImpl(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, prompt: buildPrompt(ctx), stream: false }),
      });
      if (!generateResponse.ok) {
        throw new Error(`ollama generate failed with status ${generateResponse.status}`);
      }
      const data = (await generateResponse.json()) as GenerateResponse;
      const summary = data.response?.trim();
      return summary && summary.length > 0 ? summary : null;
    },
  };
}
