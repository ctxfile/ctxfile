export {
  loadConfig,
  type ConsultProviderSpec,
  type LoadConfigOptions,
  type ResolvedConfig,
  type ServeTokenSpec,
} from "./config.js";
export {
  buildExportEnvelope,
  renderExportMarkdown,
  EXPORT_PROFILES,
  EXPORT_SCHEMA_VERSION,
  EXPORT_SECTIONS,
  type BuildExportOptions,
  type ExportEnvelope,
  type ExportProfile,
  type ExportSection,
  type ExportedContext,
  type ExportedKeyFile,
} from "./export.js";
export { fileConnector } from "./connectors/file.js";
export { gitConnector } from "./connectors/git.js";
export { createNotionConnector, type FetchLike, type NotionConnectorOptions } from "./connectors/notion.js";
export { createOllamaSummarizer, type OllamaSummarizerOptions } from "./connectors/ollama.js";
export type { Connector, SnapshotInput, Summarizer } from "./connectors/types.js";
export { buildContext, filterScope } from "./engine/build.js";
export { createSnapshotService, type SnapshotService } from "./engine/service.js";
export { estimateTokens, TokenBudget, truncateToTokens } from "./engine/tokens.js";
export type {
  BuildEvent,
  ConnectorStatus,
  ContextMeta,
  ContextObject,
  ContextScope,
  GitCommit,
  GitState,
  KeyFile,
  NotionPage,
  SessionDigest,
} from "./engine/types.js";
export {
  autoCaptureBlocked,
  BEHAVIOR_HARNESSES,
  clearBehaviorState,
  detectHarnesses,
  installBehavior,
  loadCanonicalBehaviors,
  readBehaviorState,
  renderAllBehaviors,
  renderBehavior,
  uninstallBehavior,
  writeBehaviorState,
  type BehaviorHarness,
  type BehaviorState,
  type RenderedBehavior,
  type UninstallResult,
} from "./behavior.js";
export { inspectLicenseKey } from "./license-inspect.js";
export {
  loadProModule,
  type ProLicenseInfo,
  type ProMemoryEntry,
  type ProModule,
  type ProUiApi,
  type ProUiFeatures,
} from "./plugin.js";
export {
  formatIngestErrors,
  inferHarnessFromClientName,
  INGEST_SCHEMA_VERSION,
  ingestInputSchema,
  ingestSessionId,
  ingestSessionSchema,
  ingestSourceSchema,
  ingestToSessionDigest,
  mergeIngestedSessions,
  renderThreadResume,
  resolveThread,
  saveSessionSchema,
  scoreThreadMatch,
  type IngestArtifact,
  type IngestDoor,
  type IngestedSession,
  type IngestInput,
  type SaveSessionInput,
  type ThreadResolution,
  type ThreadSummary,
} from "./ingest.js";
export { IngestStore, type IngestResult } from "./storage/ingest-store.js";
export {
  SyncClient,
  type LocalBlobSource,
  type RelayStore,
  type SyncBlobMeta,
  type SyncEntry,
  type SyncResult,
} from "./sync/client.js";
export {
  decryptBlob,
  deriveBlobId,
  deriveMasterKey,
  encryptBlob,
  fromBase64,
  generateRecoveryCode,
  generateSalt,
  MASTER_KEY_BYTES,
  normalizeRecoveryCode,
  toBase64,
  unwrapMasterKey,
  wrapMasterKey,
  zeroKey,
  type KdfParams,
} from "./sync/crypto.js";
export { HttpRelayStore, type HttpRelayStoreOptions } from "./sync/http-relay.js";
export {
  buildVaultView,
  parseSyncPayload,
  sessionPayloadToIngestedSession,
  type SessionSyncPayload,
  type SyncPayload,
  type ThreadSyncPayload,
  type VaultView,
} from "./sync/payload.js";
export {
  assertPassphraseStrength,
  createVault,
  DEFAULT_VAULT_CONFIG_PATH,
  fetchVaultMeta,
  joinVault,
  loadVaultConfig,
  MIN_PASSPHRASE_LENGTH,
  openVaultSync,
  recoverVault,
  saveVaultConfig,
  unlockVault,
  type CreateVaultOptions,
  type JoinVaultOptions,
  type RecoverVaultOptions,
  type VaultConfig,
  type VaultMeta,
} from "./sync/vault.js";
export { isDeniedPath, redactContent } from "./redact.js";
export { createServer, type ServerOptions } from "./server.js";
export { SnapshotCache } from "./storage/cache.js";
export { VERSION } from "./version.js";
