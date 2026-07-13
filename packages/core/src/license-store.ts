import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectLicenseKey } from "./license-inspect.js";

/** Validates structurally and persists a license key. Signature verification happens at server start. */
export function storeLicenseKey(key: string, homedir = os.homedir()): { filePath: string; detail: string } {
  const inspection = inspectLicenseKey(key);
  if (!inspection.ok) {
    throw new Error(`refusing to store license: ${inspection.detail}`);
  }
  const filePath = path.join(homedir, ".ctxfile", "license.key");
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, key.trim() + "\n", { mode: 0o600 });
  chmodSync(filePath, 0o600);
  return { filePath, detail: inspection.detail };
}
