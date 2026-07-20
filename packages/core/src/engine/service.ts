import type { ResolvedConfig } from "../config.js";
import { tokenizeTitle } from "../connectors/vault-frontmatter.js";
import type { Connector, SnapshotHints, Summarizer } from "../connectors/types.js";
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
  const staticFingerprint = JSON.stringify({
    tokenBudget: config.tokenBudget,
    maxFileTokens: config.maxFileTokens,
    include: config.include,
    exclude: config.exclude,
    notionPageIds: config.notion.pageIds,
    ollama: config.ollama.summarize ? config.ollama.model : null,
    connectors: connectors.map((c) => c.name),
    vaults: config.vaults,
  });

  /** Thread-relevance hints (spec §5): titles+tags of the 5 most-recently-
      active non-private threads. Tags are empty until a write path ships;
      titles carry the signal today. Never fails a snapshot. Arrays are
      sorted so a same-set reorder of threads (no actual relevance change)
      does not change the fingerprint — selection is set-based, not
      order-sensitive. */
  function computeHints(): SnapshotHints | undefined {
    if (!ingest) return undefined;
    try {
      const threads = ingest
        .listThreads(config.root)
        .filter((t) => !t.private)
        .slice(0, 5);
      const threadTags = [...new Set(threads.flatMap((t) => t.tags.map((tag) => tag.toLowerCase())))].sort();
      const threadTitleTokens = [...new Set(threads.flatMap((t) => tokenizeTitle(t.title)))].sort();
      if (threadTags.length === 0 && threadTitleTokens.length === 0) return undefined;
      return { threadTags, threadTitleTokens };
    } catch {
      return undefined;
    }
  }

  /** Hints participate in cache identity: a thread change must re-rank notes,
      not serve the stale selection (panel finding). But when no vaults are
      configured nothing ever consumes hints, so gate them out entirely —
      otherwise thread churn alone (with zero snapshot-visible effect) still
      invalidates every cached snapshot. Keeping the same `{ staticFingerprint,
      hints }` shape (hints: null) means downstream prefix matching (see
      `latestCached`) only ever has to reason about one string shape. */
  function fingerprintFor(hints: SnapshotHints | undefined): string {
    const effectiveHints = config.vaults.length === 0 ? null : hints ?? null;
    return JSON.stringify({ staticFingerprint, hints: effectiveHints });
  }

  async function rebuildWith(hints: SnapshotHints | undefined, onEvent?: (event: BuildEvent) => void): Promise<ContextObject> {
    let ctx = await buildContext(config, connectors, summarizer, "full", onEvent, hints);
    if (ingest) {
      try {
        const merged = mergeIngestedSessions(ctx.sessions, ingest.list(config.root));
        if (merged !== undefined) ctx = { ...ctx, sessions: merged };
      } catch {
        // A broken ingest store must never fail a snapshot.
      }
    }
    cache?.save(config.root, ctx, fingerprintFor(hints));
    return ctx;
  }

  async function rebuild(onEvent?: (event: BuildEvent) => void): Promise<ContextObject> {
    return rebuildWith(computeHints(), onEvent);
  }

  return {
    rebuild,
    async getContext(scope: ContextScope = "full"): Promise<ContextObject> {
      // Compute hints once and reuse for both the lookup and a possible
      // rebuild — computeHints() re-queries the ingest store, so doing it
      // twice per miss was a redundant query on every cache miss.
      const hints = computeHints();
      const cached = cache?.latest(config.root, config.cacheMaxAgeMs, fingerprintFor(hints));
      if (cached) return filterScope(cached, scope);
      return filterScope(await rebuildWith(hints), scope);
    },
    getCached(scope: ContextScope = "full"): ContextObject | null {
      const cached = cache?.latest(config.root, config.cacheMaxAgeMs, fingerprintFor(computeHints()));
      return cached ? filterScope(cached, scope) : null;
    },
    latestCached(): ContextObject | null {
      if (!cache) return null;
      // "Any age, latest snapshot" (dashboard /state) must survive thread
      // churn even though the exact fingerprint (which folds in hints)
      // changes on every ingest. Match on the static-config prefix only, so
      // any hints variant of the current config still resolves.
      const fpPrefix = `{"staticFingerprint":${JSON.stringify(staticFingerprint)}`;
      return cache.latestByPrefix(config.root, Number.POSITIVE_INFINITY, fpPrefix);
    },
    recentSnapshots(limit = 20): { createdAt: number; tokensUsed: number }[] {
      return cache?.recent(config.root, limit) ?? [];
    },
  };
}
