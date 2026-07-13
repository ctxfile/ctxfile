import path from "node:path";
import type { ResolvedConfig } from "./config.js";
import { fileConnector } from "./connectors/file.js";
import { gitConnector } from "./connectors/git.js";
import { createNotionConnector } from "./connectors/notion.js";
import { createOllamaSummarizer } from "./connectors/ollama.js";
import type { Connector, Summarizer } from "./connectors/types.js";
import { createSnapshotService, type SnapshotService } from "./engine/service.js";
import type { ProModule } from "./plugin.js";
import { SnapshotCache } from "./storage/cache.js";
import { IngestStore } from "./storage/ingest-store.js";

export interface RuntimeOptions {
  /** Pass null to disable snapshot caching (e.g. in tests). */
  cache?: SnapshotCache | null;
  connectors?: Connector[];
  summarizer?: Summarizer | null;
  /** Commercial Pro module, loaded via loadProModule(). */
  pro?: ProModule | null;
  /** Store for agent-reported sessions; pass null to disable (tests). */
  ingest?: IngestStore | null;
}

export interface Runtime {
  connectors: Connector[];
  summarizer: Summarizer | null;
  cache: SnapshotCache | null;
  ingest: IngestStore | null;
  service: SnapshotService;
  pro: ProModule | null;
  proActive: boolean;
}

export function createRuntime(config: ResolvedConfig, options: RuntimeOptions = {}): Runtime {
  const pro = options.pro ?? null;
  pro?.init?.(config);
  const proActive = pro !== null && pro.licenseStatus() === null;
  if (pro && !proActive) {
    console.error(`ctxfile: pro module "${pro.name}" inactive: ${pro.licenseStatus()}`);
  }
  const connectors = options.connectors ?? [
    fileConnector,
    gitConnector,
    createNotionConnector(),
    ...(proActive ? (pro.connectors ?? []) : []),
  ];
  const summarizer = options.summarizer === undefined ? createOllamaSummarizer() : options.summarizer;
  const cache =
    options.cache === undefined ? new SnapshotCache(path.join(config.cacheDir, "cache.db")) : options.cache;
  // Follows the cache switch: cache: null (tests) implies no ingest store
  // either, so hermetic runs never touch ~/.ctxfile.
  const ingest =
    options.ingest !== undefined
      ? options.ingest
      : options.cache === null
        ? null
        : new IngestStore(path.join(config.cacheDir, "ingest.db"));
  const service = createSnapshotService(config, { cache, connectors, summarizer, ingest });
  return { connectors, summarizer, cache, ingest, service, pro, proActive };
}
