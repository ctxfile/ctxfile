import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * The relay's key-wrapping seam (§3 of the sync plan, §4.1 BYOK of the
 * Enterprise PRD). Standard-mode vaults enroll their data key here; the relay
 * stores only the wrap and unwraps in memory for the lifetime of a request.
 *
 * KeyProvider is deliberately the entire cloud-KMS surface we need: the GCP
 * KMS implementation (hosted) and customer-KMS implementations (BYOK: AWS
 * KMS / Azure Key Vault) implement these same two methods against a CMK the
 * customer can revoke — revocation is crypto-shredding by construction.
 */
export interface KeyProvider {
  name: string;
  wrap(dataKey: Uint8Array): string;
  unwrap(wrapped: string): Uint8Array;
}

/** Self-hosted default: AES-256-GCM under a master key generated once into
    the data directory. Protect that file like a private key; on a hosted
    relay this provider is replaced by real KMS, never used. */
export class LocalKeyProvider implements KeyProvider {
  readonly name = "local-keyring";
  private readonly masterKey: Buffer;

  constructor(dataDir: string) {
    const keyPath = path.join(dataDir, "relay-master.key");
    if (!existsSync(keyPath)) {
      writeFileSync(keyPath, randomBytes(32));
      chmodSync(keyPath, 0o600);
      console.error(`ctxfile-relay: generated keyring master key at ${keyPath} (mode 600; back it up)`);
    }
    this.masterKey = readFileSync(keyPath);
    if (this.masterKey.length !== 32) {
      throw new Error(`${keyPath} must be exactly 32 bytes`);
    }
  }

  wrap(dataKey: Uint8Array): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.masterKey, iv);
    const ciphertext = Buffer.concat([cipher.update(dataKey), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
  }

  unwrap(wrapped: string): Uint8Array {
    const raw = Buffer.from(wrapped, "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.masterKey, iv);
    decipher.setAuthTag(tag);
    return new Uint8Array(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
  }
}
