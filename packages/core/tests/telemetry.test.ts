import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { sendPingIfDue, type FetchLike } from "../src/telemetry.js";

describe("telemetry ping", () => {
  let dir: string;
  let stateFilePath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-telemetry-"));
    stateFilePath = path.join(dir, "telemetry.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function configWith(telemetry?: { enabled: boolean; endpoint?: string }) {
    if (telemetry) writeFileSync(path.join(dir, ".ctxfile.json"), JSON.stringify({ telemetry }));
    return loadConfig({ root: dir, env: {} });
  }

  it("is off by default and sends nothing", async () => {
    let called = false;
    const fetchImpl: FetchLike = async () => {
      called = true;
      return new Response("{}");
    };
    const sent = await sendPingIfDue(configWith(), { fetchImpl, stateFilePath });
    expect(sent).toBe(false);
    expect(called).toBe(false);
  });

  it("sends only the anonymous payload when enabled", async () => {
    let payload: Record<string, unknown> | null = null;
    let url = "";
    const fetchImpl: FetchLike = async (u, init) => {
      url = String(u);
      payload = JSON.parse(String(init?.body));
      return new Response("{}");
    };
    const config = configWith({ enabled: true, endpoint: "https://ping.example.com/v1/ping" });
    const sent = await sendPingIfDue(config, { fetchImpl, stateFilePath });

    expect(sent).toBe(true);
    expect(url).toBe("https://ping.example.com/v1/ping");
    expect(Object.keys(payload!).sort()).toEqual(["installId", "os", "version"]);
    expect(payload!.installId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(payload)).not.toContain(dir);
  });

  it("pings at most once per week with a stable install id", async () => {
    const bodies: string[] = [];
    const fetchImpl: FetchLike = async (_u, init) => {
      bodies.push(String(init?.body));
      return new Response("{}");
    };
    const config = configWith({ enabled: true });
    const first = await sendPingIfDue(config, { fetchImpl, stateFilePath, now: new Date("2026-07-01T00:00:00Z") });
    const second = await sendPingIfDue(config, { fetchImpl, stateFilePath, now: new Date("2026-07-03T00:00:00Z") });
    const third = await sendPingIfDue(config, { fetchImpl, stateFilePath, now: new Date("2026-07-09T00:00:00Z") });

    expect([first, second, third]).toEqual([true, false, true]);
    expect(bodies).toHaveLength(2);
    const id1 = (JSON.parse(bodies[0]!) as { installId: string }).installId;
    const id2 = (JSON.parse(bodies[1]!) as { installId: string }).installId;
    expect(id1).toBe(id2);
    expect(readFileSync(stateFilePath, "utf8")).toContain(id1);
  });

  it("swallows network failures", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("offline");
    };
    const sent = await sendPingIfDue(configWith({ enabled: true }), { fetchImpl, stateFilePath });
    expect(sent).toBe(false);
  });
});
