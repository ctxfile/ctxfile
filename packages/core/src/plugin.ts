// Seam through which the commercial Pro package plugs into the core server.
// Core never depends on Pro at build time; only a type-erased dynamic import.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ResolvedConfig } from "./config.js";
import type { Connector } from "./connectors/types.js";

export interface ProUiFeatures {
  sessions: boolean;
  memory: boolean;
  consult: boolean;
  voice: boolean;
}

export interface ProMemoryEntry {
  id: string;
  agentId: string;
  content: string;
  createdAt: string;
  /** Human-readable provenance: which tool/session wrote this entry. */
  provenance: string;
}

export interface ProLicenseInfo {
  /** License tier from the verified payload; null when unlicensed. */
  tier: string | null;
  /** ISO expiry timestamp from the verified payload; null when unlicensed. */
  expiresAt: string | null;
  customerId?: string | null;
}

export interface ProUiApi {
  features(): ProUiFeatures;
  /** Display metadata from the verified license payload — never the key itself. */
  licenseInfo?(): ProLicenseInfo;
  listMemory(): Promise<ProMemoryEntry[]>;
  forgetMemory(id: string): Promise<boolean>;
  /** Streams consult progress via onEvent; resolves when complete. */
  consult?(question: string, onEvent: (event: { type: string; data: unknown }) => void): Promise<void>;
}

export interface ProModule {
  name: string;
  connectors?: Connector[];
  /**
   * Handed the resolved config by createRuntime() before any tools or UI are
   * used — the `ui` surface needs it on paths where registerTools never runs
   * (the `ctxfile ui` command has no MCP server).
   */
  init?(config: ResolvedConfig): void;
  registerTools?(server: McpServer, config: ResolvedConfig): void;
  /** null when licensed and active; otherwise a human-readable reason Pro is inactive. */
  licenseStatus(): string | null;
  /** Optional UI delegation surface consumed by the local dashboard server. */
  ui?: ProUiApi;
}

const PRO_PACKAGE = "@ctxfile/pro";

export async function loadProModule(): Promise<ProModule | null> {
  try {
    const mod = (await import(PRO_PACKAGE)) as { createProModule?: () => ProModule };
    if (typeof mod.createProModule !== "function") return null;
    return mod.createProModule();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") {
      // Pro simply isn't installed — expected for free-tier users, stay silent.
      return null;
    }
    // Pro IS installed but failed to load (broken native dep, syntax error,
    // corrupt install). Surface it so the user isn't silently downgraded.
    console.error(
      `ctxfile: pro module present but failed to load: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}
