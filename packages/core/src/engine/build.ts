import type { ResolvedConfig } from "../config.js";
import type { Connector, Summarizer } from "../connectors/types.js";
import { VERSION } from "../version.js";
import { estimateTokens, TokenBudget } from "./tokens.js";
import type { BuildEvent, ConnectorStatus, ContextObject, ContextScope } from "./types.js";

function emptyContext(config: ResolvedConfig): ContextObject {
  return {
    meta: {
      name: "ctxfile",
      version: VERSION,
      generatedAt: new Date().toISOString(),
      root: config.root,
      tokenBudget: config.tokenBudget,
      tokensUsed: 0,
      connectors: [],
    },
    plan: null,
    keyFiles: [],
    gitState: null,
    notionPages: [],
    sessionSummary: null,
  };
}

function mergePartial(ctx: ContextObject, partial: Partial<ContextObject>): void {
  if (partial.plan !== undefined && partial.plan !== null) ctx.plan = partial.plan;
  if (partial.keyFiles) ctx.keyFiles.push(...partial.keyFiles);
  if (partial.gitState !== undefined && partial.gitState !== null) ctx.gitState = partial.gitState;
  if (partial.notionPages) ctx.notionPages.push(...partial.notionPages);
  if (partial.sessions && partial.sessions.length > 0) {
    ctx.sessions = [...(ctx.sessions ?? []), ...partial.sessions];
  }
  if (partial.sessionSummary !== undefined && partial.sessionSummary !== null) {
    ctx.sessionSummary = partial.sessionSummary;
  }
}

export async function buildContext(
  config: ResolvedConfig,
  connectors: Connector[],
  summarizer: Summarizer | null,
  scope: ContextScope = "full",
  onEvent?: (event: BuildEvent) => void
): Promise<ContextObject> {
  // Listener bugs must never break a snapshot build.
  const emit = (event: BuildEvent): void => {
    try {
      onEvent?.(event);
    } catch {
      /* ignore */
    }
  };
  const ctx = emptyContext(config);
  const budget = new TokenBudget(config.tokenBudget);

  const runs = connectors.map(async (connector): Promise<ConnectorStatus & { partial?: Partial<ContextObject> }> => {
    const started = Date.now();
    emit({ type: "connector:start", name: connector.name });
    if (!connector.isEnabled(config)) {
      const status: ConnectorStatus = { name: connector.name, status: "skipped", durationMs: Date.now() - started };
      emit({ type: "connector:done", connector: status });
      return status;
    }
    try {
      const partial = await connector.snapshot({ config, budget });
      const status: ConnectorStatus = { name: connector.name, status: "ok", durationMs: Date.now() - started };
      emit({ type: "connector:done", connector: status });
      return { ...status, partial };
    } catch (error) {
      const status: ConnectorStatus = {
        name: connector.name,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started,
      };
      emit({ type: "connector:done", connector: status });
      return status;
    }
  });

  for (const result of await Promise.all(runs)) {
    const { partial, ...status } = result;
    ctx.meta.connectors.push(status);
    if (partial) mergePartial(ctx, partial);
  }

  if (summarizer) {
    const started = Date.now();
    emit({ type: "connector:start", name: summarizer.name });
    if (!summarizer.isEnabled(config)) {
      const status: ConnectorStatus = { name: summarizer.name, status: "skipped", durationMs: 0 };
      ctx.meta.connectors.push(status);
      emit({ type: "connector:done", connector: status });
    } else {
      try {
        ctx.sessionSummary = await summarizer.summarize(ctx, config);
        const status: ConnectorStatus = { name: summarizer.name, status: "ok", durationMs: Date.now() - started };
        ctx.meta.connectors.push(status);
        emit({ type: "connector:done", connector: status });
      } catch (error) {
        const status: ConnectorStatus = {
          name: summarizer.name,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - started,
        };
        ctx.meta.connectors.push(status);
        emit({ type: "connector:done", connector: status });
      }
    }
  }

  ctx.meta.tokensUsed = estimateTokens(JSON.stringify(ctx));
  emit({ type: "tokens", tokensUsed: ctx.meta.tokensUsed, tokenBudget: config.tokenBudget });
  emit({ type: "done", generatedAt: ctx.meta.generatedAt });
  return filterScope(ctx, scope);
}

export function filterScope(ctx: ContextObject, scope: ContextScope): ContextObject {
  if (scope === "full") return ctx;
  return {
    meta: ctx.meta,
    plan: scope === "plan" ? ctx.plan : null,
    keyFiles: scope === "files" ? ctx.keyFiles : [],
    gitState: scope === "git" ? ctx.gitState : null,
    notionPages: scope === "files" ? ctx.notionPages : [],
    sessionSummary: null,
  };
}
