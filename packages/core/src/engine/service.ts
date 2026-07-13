import type { ResolvedConfig } from "../config.js";
import type { Connector, Summarizer } from "../connectors/types.js";
import { mergeIngestedSessions } from "../ingest.js";
import type { SnapshotCache } from "../storage/cache.js";
import type { IngestStore } from "../storage/ingest-store.js";
import { buildContext, filterScope } from "./build.js";
import type { BuildEvent, ContextObject, ContextScope } from "./types.js";

export interface SnapshotService {
  getContext(scope?: ContextScope): Promise<ContextObject>;
  rebuild(onEvent?: (event: BuildEvent) => void): Promise<ContextObject>;
  /** Fresh cache hit only (cacheMaxAgeMs), scope-filtered; null means a rebuild is needed. */
  getCached(scope?: ContextScope): ContextObject | null;
  latestCached(): ContextObject | null;
  recentSnapshots(limit?: number): { createdAt: number; tokensUsed: number }[];
}

export function createSnapshotService(
  config: ResolvedConfig,
  deps: {
    cache: SnapshotCache | null;
    connectors: Connector[];
    summarizer: Summarizer | null;
    /** Agent-reported sessions merged into every snapshot (parser wins on id). */
    ingest?: IngestStore | null;
  }
): SnapshotService {
  const { cache, connectors, summarizer } = deps;
  const ingest = deps.ingest ?? null;
  // Config fields that change snapshot output — a change invalidates the cache.
  const configFingerprint = JSON.stringify({
    tokenBudget: config.tokenBudget,
    maxFileTokens: config.maxFileTokens,
    include: config.include,
    exclude: config.exclude,
    notionPageIds: config.notion.pageIds,
    ollama: config.ollama.summarize ? config.ollama.model : null,
    connectors: connectors.map((c) => c.name),
  });

  async function rebuild(onEvent?: (event: BuildEvent) => void): Promise<ContextObject> {
    let ctx = await buildContext(config, connectors, summarizer, "full", onEvent);
    if (ingest) {
      try {
        const merged = mergeIngestedSessions(ctx.sessions, ingest.list(config.root));
        if (merged !== undefined) ctx = { ...ctx, sessions: merged };
      } catch {
        // A broken ingest store must never fail a snapshot.
      }
    }
    cache?.save(config.root, ctx, configFingerprint);
    return ctx;
  }

  return {
    rebuild,
    async getContext(scope: ContextScope = "full"): Promise<ContextObject> {
      const cached = cache?.latest(config.root, config.cacheMaxAgeMs, configFingerprint);
      if (cached) return filterScope(cached, scope);
      return filterScope(await rebuild(), scope);
    },
    getCached(scope: ContextScope = "full"): ContextObject | null {
      const cached = cache?.latest(config.root, config.cacheMaxAgeMs, configFingerprint);
      return cached ? filterScope(cached, scope) : null;
    },
    latestCached(): ContextObject | null {
      return cache?.latest(config.root, Number.POSITIVE_INFINITY, configFingerprint) ?? null;
    },
    recentSnapshots(limit = 20): { createdAt: number; tokensUsed: number }[] {
      return cache?.recent(config.root, limit) ?? [];
    },
  };
}
