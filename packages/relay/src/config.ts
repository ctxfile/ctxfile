import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Relay configuration: environment first, flags override. Everything stateful
 * lives under one data directory so the whole hub is a single volume in
 * Docker and a single folder to back up when self-hosted.
 */

export interface RelayConfig {
  dataDir: string;
  host: string;
  port: number;
  /** How this hub introduces itself in federation grant documents. */
  orgId: string;
  /** "open": anyone reaching the relay may create a vault (self-host/local).
      "closed": vault creation disabled (hosted mode gates it on subscription
      via out-of-band provisioning). */
  registration: "open" | "closed";
}

export interface RelayConfigOverrides {
  dataDir?: string;
  host?: string;
  port?: number;
  orgId?: string;
  registration?: "open" | "closed";
}

export const DEFAULT_RELAY_PORT = 5959;

export function loadRelayConfig(overrides: RelayConfigOverrides = {}, env: NodeJS.ProcessEnv = process.env): RelayConfig {
  const dataDir = path.resolve(
    overrides.dataDir ?? env.CTXFILE_RELAY_DATA ?? path.join(os.homedir(), ".ctxfile-relay")
  );
  mkdirSync(dataDir, { recursive: true });
  const portRaw = overrides.port ?? (env.CTXFILE_RELAY_PORT ? Number(env.CTXFILE_RELAY_PORT) : DEFAULT_RELAY_PORT);
  if (!Number.isInteger(portRaw) || portRaw < 0 || portRaw > 65_535) {
    throw new Error("relay port must be an integer between 0 and 65535");
  }
  const registration = overrides.registration ?? (env.CTXFILE_RELAY_REGISTRATION === "closed" ? "closed" : "open");
  return {
    dataDir,
    host: overrides.host ?? env.CTXFILE_RELAY_HOST ?? "127.0.0.1",
    port: portRaw,
    orgId: overrides.orgId ?? env.CTXFILE_RELAY_ORG ?? "org-local",
    registration,
  };
}
