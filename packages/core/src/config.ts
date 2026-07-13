import { existsSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { EXPORT_PROFILES, EXPORT_SECTIONS, type ExportProfile, type ExportSection } from "./export.js";

/** Scopes for the HTTP door: what a bearer token may do on a connection. */
export const SERVE_SCOPES = ["read:context", "write:sessions"] as const;
export type ServeScope = (typeof SERVE_SCOPES)[number];

export const DEFAULT_SERVE_PORT = 4949;

const fileConfigSchema = z
  .object({
    tokenBudget: z.number().int().positive().optional(),
    maxFileTokens: z.number().int().positive().optional(),
    cacheDir: z.string().optional(),
    cacheMaxAgeMs: z.number().int().nonnegative().optional(),
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
    notion: z
      .object({
        pageIds: z.array(z.string()).optional(),
      })
      .optional(),
    ollama: z
      .object({
        baseUrl: z.string().url().optional(),
        model: z.string().optional(),
        summarize: z.boolean().optional(),
      })
      .optional(),
    telemetry: z
      .object({
        enabled: z.boolean().optional(),
        endpoint: z.string().url().optional(),
      })
      .optional(),
    voice: z
      .object({
        whisperPath: z.string().optional(),
        modelPath: z.string().optional(),
        /** Extra directory (besides root) that transcribe_voice may read audio from. */
        audioDir: z.string().optional(),
      })
      .optional(),
    consult: z
      .object({
        providers: z
          .array(
            z.object({
              type: z.enum(["anthropic", "openai-compatible", "ollama"]),
              model: z.string().optional(),
              baseUrl: z.string().optional(),
              apiKeyEnv: z.string().optional(),
            })
          )
          .optional(),
      })
      .optional(),
    export: z
      .object({
        profile: z.enum(EXPORT_PROFILES).optional(),
        /** Section allowlist applied by the "custom" profile. */
        include: z.array(z.enum(EXPORT_SECTIONS)).optional(),
      })
      .optional(),
    // Behavior layer (auto-checkpoint guardrails).
    behavior: z
      .object({
        /** Auto checkpoints on the same thread inside this window are
            rejected unless the content hash differs or handoff is true. */
        debounceMinutes: z.number().int().min(0).max(240).optional(),
      })
      .optional(),
    // `ctxfile serve` (the HTTP door): loopback-only by default; tokens are
    // named env vars, never literal secrets in the config file.
    serve: z
      .object({
        port: z.number().int().min(1).max(65_535).optional(),
        host: z.string().min(1).optional(),
        tokens: z
          .array(
            z.object({
              name: z.string().min(1),
              tokenEnv: z.string().min(1),
              scopes: z.array(z.enum(SERVE_SCOPES)).optional(),
            })
          )
          .optional(),
      })
      .optional(),
  })
  .strict();

export interface ConsultProviderSpec {
  type: "anthropic" | "openai-compatible" | "ollama";
  model?: string;
  baseUrl?: string;
  /** Name of the env var holding the API key — never the key itself. */
  apiKeyEnv?: string;
}

export interface ServeTokenSpec {
  name: string;
  /** Name of the env var holding the bearer token — never the token itself. */
  tokenEnv: string;
  scopes: ServeScope[];
}

export interface ResolvedConfig {
  root: string;
  tokenBudget: number;
  maxFileTokens: number;
  cacheDir: string;
  cacheMaxAgeMs: number;
  include: string[];
  exclude: string[];
  notion: { token: string | null; pageIds: string[] };
  ollama: { baseUrl: string; model: string | null; summarize: boolean };
  voice: { whisperPath: string | null; modelPath: string | null; audioDir: string | null };
  consult: { providers: ConsultProviderSpec[] };
  telemetry: { enabled: boolean; endpoint: string };
  export: { profile: ExportProfile; include: ExportSection[] | null };
  behavior: { debounceMinutes: number };
  /** The HTTP door (`ctxfile serve`): loopback default, bearer tokens by env var. */
  serve: { port: number; host: string; tokens: ServeTokenSpec[] };
}

export interface LoadConfigOptions {
  root?: string;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
}

export function loadConfig(opts: LoadConfigOptions = {}): ResolvedConfig {
  const env = opts.env ?? process.env;
  const root = path.resolve(opts.root ?? process.cwd());

  let rootStat;
  try {
    rootStat = statSync(root);
  } catch {
    throw new Error(`root "${root}" is not a directory`);
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`root "${root}" is not a directory`);
  }

  const configPath = opts.configPath ?? path.join(root, ".ctxfile.json");
  let fileConfig: z.infer<typeof fileConfigSchema> = {};
  if (existsSync(configPath)) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(configPath, "utf8"));
    } catch (error) {
      throw new Error(
        `failed to parse ${path.basename(configPath) === ".ctxfile.json" ? ".ctxfile.json" : configPath}: ${
          error instanceof Error ? error.message : String(error)
        } (.ctxfile.json must be valid JSON)`
      );
    }
    const parsed = fileConfigSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`invalid .ctxfile.json: ${parsed.error.message}`);
    }
    fileConfig = parsed.data;
  }

  const notionToken = env.NOTION_TOKEN?.trim() || null;
  const pageIds = notionToken ? (fileConfig.notion?.pageIds ?? []) : [];

  return {
    root,
    tokenBudget: fileConfig.tokenBudget ?? 50_000,
    maxFileTokens: fileConfig.maxFileTokens ?? 4_000,
    cacheDir: fileConfig.cacheDir ?? path.join(os.homedir(), ".ctxfile"),
    cacheMaxAgeMs: fileConfig.cacheMaxAgeMs ?? 30_000,
    include: fileConfig.include ?? [],
    exclude: fileConfig.exclude ?? [],
    notion: { token: notionToken, pageIds },
    ollama: {
      baseUrl: env.OLLAMA_BASE_URL?.trim() || fileConfig.ollama?.baseUrl || "http://localhost:11434",
      model: fileConfig.ollama?.model ?? null,
      summarize: fileConfig.ollama?.summarize ?? false,
    },
    voice: {
      whisperPath: fileConfig.voice?.whisperPath ?? null,
      modelPath: fileConfig.voice?.modelPath ?? null,
      audioDir: fileConfig.voice?.audioDir ? path.resolve(fileConfig.voice.audioDir) : null,
    },
    consult: { providers: fileConfig.consult?.providers ?? [] },
    telemetry: {
      // OPT-IN ONLY: no ping unless the user explicitly enables it.
      enabled: fileConfig.telemetry?.enabled ?? false,
      endpoint: fileConfig.telemetry?.endpoint ?? "https://ping.ctxfile.dev/v1/ping",
    },
    export: {
      profile: fileConfig.export?.profile ?? "repo-safe",
      include: fileConfig.export?.include ?? null,
    },
    behavior: {
      debounceMinutes: fileConfig.behavior?.debounceMinutes ?? 5,
    },
    serve: {
      port: fileConfig.serve?.port ?? DEFAULT_SERVE_PORT,
      host: fileConfig.serve?.host ?? "127.0.0.1",
      tokens: (fileConfig.serve?.tokens ?? []).map((t) => ({
        name: t.name,
        tokenEnv: t.tokenEnv,
        // Default is full access; restrict to ["read:context"] for read-only.
        scopes: t.scopes ?? [...SERVE_SCOPES],
      })),
    },
  };
}
