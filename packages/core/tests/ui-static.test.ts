import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, type ResolvedConfig } from "../src/config.js";
import type { SnapshotService } from "../src/engine/service.js";
import type { ContextObject } from "../src/engine/types.js";
import { generateToken } from "../src/ui/security.js";
import { createUiServer, listenOnAvailablePort } from "../src/ui/server.js";

/** Node's fetch typings return Promise<unknown> for res.json(); tests assert known shapes. */
async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

// minimal stub — static serving never touches the service
const emptyService: SnapshotService = {
  getContext: async () => ({}) as ContextObject,
  rebuild: async () => ({}) as ContextObject,
  getCached: () => null,
  latestCached: () => null,
  recentSnapshots: () => [],
};

describe("ui static serving", () => {
  let dir: string;
  let staticDir: string;
  let config: ResolvedConfig;
  let server: Server;
  let port: number;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-static-"));
    staticDir = path.join(dir, "ui-dist");
    mkdirSync(path.join(staticDir, "assets"), { recursive: true });
    writeFileSync(path.join(staticDir, "index.html"), "<!doctype html><title>cb</title>");
    writeFileSync(path.join(staticDir, "assets", "app.js"), "console.log(1)");
    writeFileSync(path.join(dir, "outside.txt"), "SECRET-OUTSIDE");
    config = loadConfig({ root: dir });
    server = createUiServer({ config, service: emptyService, pro: null, proActive: false, token: generateToken(), staticDir });
    port = await listenOnAvailablePort(server, 0);
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });

  const get = (p: string) => fetch(`http://127.0.0.1:${port}${p}`);

  it("serves index.html with CSP and nosniff, without any auth token", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toContain("<!doctype html>");
  });

  it("serves assets with correct content type and falls back to index.html for SPA routes", async () => {
    const js = await get("/assets/app.js");
    expect(js.headers.get("content-type")).toContain("text/javascript");
    const spa = await get("/memory");
    expect(spa.status).toBe(200);
    expect(await spa.text()).toContain("<!doctype html>");
  });

  it("blocks path traversal out of staticDir", async () => {
    for (const p of ["/../outside.txt", "/..%2foutside.txt", "/assets/../../outside.txt"]) {
      const res = await get(p);
      expect(res.status, p).not.toBe(200);
      expect(await res.text()).not.toContain("SECRET-OUTSIDE");
    }
  });

  it("blocks a symlink inside staticDir that escapes to a file outside it", async () => {
    const outsideSecret = path.join(dir, "outside-secret.txt");
    writeFileSync(outsideSecret, "SECRET-SYMLINK-TARGET");
    const linkPath = path.join(staticDir, "leak.txt");
    try {
      symlinkSync(outsideSecret, linkPath);
    } catch {
      // Symlink creation can fail without elevated privileges (e.g. Windows without dev mode).
      return;
    }
    const res = await get("/leak.txt");
    expect(res.status).not.toBe(200);
    expect(await res.text()).not.toContain("SECRET-SYMLINK-TARGET");
  });

  it("blocks double-encoded traversal sequences", async () => {
    for (const p of ["/%252e%252e/outside.txt", "/..%255c..%255coutside.txt"]) {
      const res = await get(p);
      expect(res.status, p).not.toBe(200);
      expect(await res.text()).not.toContain("SECRET-OUTSIDE");
    }
  });

  it("blocks backslash traversal sequences", async () => {
    const res = await get("/%5c..%5c..%5coutside.txt");
    expect(res.status).not.toBe(200);
    expect(await res.text()).not.toContain("SECRET-OUTSIDE");
  });

  it("404s with a helpful message when staticDir is not configured", async () => {
    await new Promise((resolve) => server.close(resolve));
    server = createUiServer({ config, service: emptyService, pro: null, proActive: false, token: generateToken() });
    port = await listenOnAvailablePort(server, 0);
    const res = await get("/");
    expect(res.status).toBe(404);
    expect((await readJson<{ error: string }>(res)).error).toContain("dashboard assets not built");
  });
});
