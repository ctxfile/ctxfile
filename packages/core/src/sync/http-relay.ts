import { Buffer } from "node:buffer";
import type { RelayStore, SyncBlobMeta } from "./client.js";

/**
 * RelayStore over HTTP: the client half of the relay's blob API. The wire
 * carries only opaque ids, versions, and base64 ciphertext; the bearer token
 * is the vault token minted at vault create/join.
 */

export interface HttpRelayStoreOptions {
  fetchImpl?: typeof fetch;
}

export class HttpRelayStore implements RelayStore {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(relayUrl: string, private readonly token: string, options: HttpRelayStoreOptions = {}) {
    this.base = relayUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.fetchImpl(`${this.base}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok && response.status !== 404) {
      const body = await response.text().catch(() => "");
      throw new Error(`relay ${init.method ?? "GET"} ${path} failed: ${response.status} ${body.slice(0, 200)}`);
    }
    return response;
  }

  async list(): Promise<SyncBlobMeta[]> {
    const response = await this.request("/v1/blobs");
    const body = (await response.json()) as { blobs: SyncBlobMeta[] };
    return body.blobs;
  }

  async get(id: string): Promise<{ meta: SyncBlobMeta; data: Uint8Array } | null> {
    const response = await this.request(`/v1/blobs/${id}`);
    if (response.status === 404) return null;
    const body = (await response.json()) as { meta: SyncBlobMeta; data_b64: string };
    // Node's base64 decoder is variant-lenient; the relay encodes standard.
    return { meta: body.meta, data: new Uint8Array(Buffer.from(body.data_b64, "base64")) };
  }

  async put(id: string, meta: SyncBlobMeta, data: Uint8Array): Promise<void> {
    await this.request(`/v1/blobs/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        version: meta.version,
        deleted: meta.deleted,
        data_b64: Buffer.from(data).toString("base64"),
      }),
    });
  }
}
