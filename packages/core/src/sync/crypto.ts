import _sodium from "libsodium-wrappers-sumo";

/**
 * The Sync lockbox (M2 of the sync integration plan). Everything here runs on
 * the user's device: passphrase -> master key via Argon2id, then per-blob
 * XChaCha20-Poly1305 with the blob id as additional authenticated data, so a
 * ciphertext cannot be replayed into a different slot. The relay only ever
 * stores what this module outputs.
 *
 * This lives in the OPEN core deliberately (PRD §4.2: encryption is
 * architecture, not a tier): auditable client-side crypto is the trust story;
 * the paid part is the hosted vault, enforced server-side.
 */

let sodiumReady: Promise<typeof _sodium> | null = null;

async function sodium(): Promise<typeof _sodium> {
  if (!sodiumReady) sodiumReady = _sodium.ready.then(() => _sodium);
  return sodiumReady;
}

/** Blob envelope magic: "CXB" + format version 1. */
const MAGIC = new Uint8Array([0x43, 0x58, 0x42, 0x31]);

export interface KdfParams {
  /** Argon2id opsLimit; default interactive (client-side, per libsodium guidance). */
  opsLimit?: number;
  /** Argon2id memLimit in bytes; default interactive (64 MiB). */
  memLimit?: number;
}

export const MASTER_KEY_BYTES = 32;

export async function generateSalt(): Promise<Uint8Array> {
  const s = await sodium();
  return s.randombytes_buf(s.crypto_pwhash_SALTBYTES);
}

/** Passphrase -> 32-byte master key (Argon2id13). Store the salt and params
    beside the vault metadata; they are not secret. */
export async function deriveMasterKey(passphrase: string, salt: Uint8Array, params: KdfParams = {}): Promise<Uint8Array> {
  const s = await sodium();
  if (salt.length !== s.crypto_pwhash_SALTBYTES) {
    throw new Error(`salt must be ${s.crypto_pwhash_SALTBYTES} bytes`);
  }
  return s.crypto_pwhash(
    MASTER_KEY_BYTES,
    passphrase,
    salt,
    params.opsLimit ?? s.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    params.memLimit ?? s.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    s.crypto_pwhash_ALG_ARGON2ID13
  );
}

/** Encrypts one blob: MAGIC || 24-byte nonce || AEAD ciphertext.
    `aad` binds the ciphertext to its slot (use the blob id). */
export async function encryptBlob(key: Uint8Array, plaintext: Uint8Array, aad: string): Promise<Uint8Array> {
  const s = await sodium();
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = s.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, aad, null, nonce, key);
  const out = new Uint8Array(MAGIC.length + nonce.length + ciphertext.length);
  out.set(MAGIC, 0);
  out.set(nonce, MAGIC.length);
  out.set(ciphertext, MAGIC.length + nonce.length);
  return out;
}

/** Reverses encryptBlob. Throws on tampering, a wrong key, or a wrong aad. */
export async function decryptBlob(key: Uint8Array, blob: Uint8Array, aad: string): Promise<Uint8Array> {
  const s = await sodium();
  const nonceBytes = s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
  if (blob.length < MAGIC.length + nonceBytes + s.crypto_aead_xchacha20poly1305_ietf_ABYTES) {
    throw new Error("not a ctxfile sync blob: too short");
  }
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (blob[i] !== MAGIC[i]) throw new Error("not a ctxfile sync blob: bad magic");
  }
  const nonce = blob.subarray(MAGIC.length, MAGIC.length + nonceBytes);
  const ciphertext = blob.subarray(MAGIC.length + nonceBytes);
  return s.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext, aad, nonce, key);
}

/** Human recovery code (Bitwarden model): 40 symbols in 8 groups of 5, from a
    Crockford-ish alphabet without lookalikes (~196 bits of entropy). */
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const RECOVERY_SYMBOLS = 40;

export async function generateRecoveryCode(): Promise<string> {
  const s = await sodium();
  const n = RECOVERY_ALPHABET.length;
  // Reject the biased tail so every symbol is uniform (256 % 30 != 0).
  const limit = 256 - (256 % n);
  const symbols: string[] = [];
  while (symbols.length < RECOVERY_SYMBOLS) {
    const batch = s.randombytes_buf(RECOVERY_SYMBOLS);
    for (let i = 0; i < batch.length && symbols.length < RECOVERY_SYMBOLS; i += 1) {
      const b = batch[i] as number;
      if (b >= limit) continue;
      symbols.push(RECOVERY_ALPHABET[b % n] as string);
    }
  }
  let code = "";
  for (let i = 0; i < symbols.length; i += 1) {
    code += symbols[i];
    if ((i + 1) % 5 === 0 && i !== symbols.length - 1) code += "-";
  }
  return code;
}

/** Canonical form of a recovery code for use as a wrapping secret, so a user
    may retype it with any casing or dashing and still unwrap. Wrap and unwrap
    MUST both pass the code through this. */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

const KEY_WRAP_AAD = "ctxfile-master-key-wrap";

/** Wraps the master key under a secondary secret (the recovery code), so a
    vault stays recoverable when the passphrase is lost. The wrapped copy is
    safe to store beside the vault. */
export async function wrapMasterKey(masterKey: Uint8Array, wrappingSecret: string, salt: Uint8Array, params: KdfParams = {}): Promise<Uint8Array> {
  const wrappingKey = await deriveMasterKey(wrappingSecret, salt, params);
  try {
    return await encryptBlob(wrappingKey, masterKey, KEY_WRAP_AAD);
  } finally {
    await zeroKey(wrappingKey);
  }
}

export async function unwrapMasterKey(wrapped: Uint8Array, wrappingSecret: string, salt: Uint8Array, params: KdfParams = {}): Promise<Uint8Array> {
  const wrappingKey = await deriveMasterKey(wrappingSecret, salt, params);
  try {
    return await decryptBlob(wrappingKey, wrapped, KEY_WRAP_AAD);
  } finally {
    await zeroKey(wrappingKey);
  }
}

/** Best-effort scrub of key material once done with it. */
export async function zeroKey(key: Uint8Array): Promise<void> {
  const s = await sodium();
  s.memzero(key);
}

/** Opaque, stable blob id: a keyed hash of the natural id, so the relay
    learns nothing from ids (harness names, session ids stay private). */
export async function deriveBlobId(key: Uint8Array, naturalId: string): Promise<string> {
  const s = await sodium();
  return s.to_hex(s.crypto_generichash(16, naturalId, key));
}

export async function toBase64(bytes: Uint8Array): Promise<string> {
  const s = await sodium();
  return s.to_base64(bytes, s.base64_variants.URLSAFE_NO_PADDING);
}

export async function fromBase64(text: string): Promise<Uint8Array> {
  const s = await sodium();
  return s.from_base64(text, s.base64_variants.URLSAFE_NO_PADDING);
}
