import type { RelayDb } from "./store.js";

/**
 * Operator-only gate metrics (Phase 0), aggregated from the audit log the
 * relay already keeps. Counts across all vaults; never titles or content.
 * Answers one question: does work actually cross between AI tools?
 */

export interface RelayGateStats {
  days: number;
  vaults_with_cross_vendor_threads: number;
  cross_vendor_threads: number;
  handoffs_saved: number;
  cross_vendor_handoff_resumes: number;
  resumes_with_prompt: number;
}

const DAY_MS = 86_400_000;

function parse(detail: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(detail);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function relayGateStats(db: RelayDb, days = 30, now = Date.now()): RelayGateStats {
  const rows = db.auditSince(now - days * DAY_MS, ["mcp.save_session", "mcp.continue_thread"]);
  const harnessesByThread = new Map<string, Set<string>>();
  let handoffsSaved = 0;
  let crossVendorResumes = 0;
  let resumesWithPrompt = 0;
  for (const row of rows) {
    const detail = parse(row.detail);
    const thread = typeof detail.thread === "string" ? detail.thread.toLowerCase() : null;
    const harness = typeof detail.harness === "string" ? detail.harness : null;
    if (thread && harness && !harness.startsWith("custom:unknown")) {
      const key = `${row.vault_id ?? "-"}\u0000${thread}`;
      const set = harnessesByThread.get(key) ?? new Set<string>();
      set.add(harness);
      harnessesByThread.set(key, set);
    }
    if (row.action === "mcp.save_session" && detail.handoff === true) handoffsSaved += 1;
    if (row.action === "mcp.continue_thread") {
      const handoffHarness = typeof detail.handoff_harness === "string" ? detail.handoff_harness : null;
      const handoffAt = typeof detail.handoff_at === "number" ? detail.handoff_at : null;
      if (handoffHarness && harness && handoffHarness !== harness && handoffAt !== null && row.ts - handoffAt <= 7 * DAY_MS) {
        crossVendorResumes += 1;
      }
      if (detail.had_prompt === true) resumesWithPrompt += 1;
    }
  }
  const crossVendorKeys = [...harnessesByThread.entries()].filter(([, set]) => set.size >= 2).map(([key]) => key);
  const vaults = new Set(crossVendorKeys.map((key) => key.split("\u0000")[0]));
  return {
    days,
    vaults_with_cross_vendor_threads: vaults.size,
    cross_vendor_threads: crossVendorKeys.length,
    handoffs_saved: handoffsSaved,
    cross_vendor_handoff_resumes: crossVendorResumes,
    resumes_with_prompt: resumesWithPrompt,
  };
}
