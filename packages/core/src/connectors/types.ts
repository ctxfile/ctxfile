import type { ResolvedConfig } from "../config.js";
import type { TokenBudget } from "../engine/tokens.js";
import type { ContextObject } from "../engine/types.js";

export interface SnapshotInput {
  config: ResolvedConfig;
  budget: TokenBudget;
}

export interface Connector {
  name: string;
  isEnabled(config: ResolvedConfig): boolean;
  snapshot(input: SnapshotInput): Promise<Partial<ContextObject>>;
}

export interface Summarizer {
  name: string;
  isEnabled(config: ResolvedConfig): boolean;
  summarize(ctx: ContextObject, config: ResolvedConfig): Promise<string | null>;
}
