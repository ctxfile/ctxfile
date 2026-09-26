"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Scripted replay of what `ingest_memory` does: two assistants export what
 * they know, duplicates merge, the instruction waits for approval, and the
 * active entries reach every agent through get_context. Reuses the playbook
 * demo's styles; the behavior shown mirrors packages/core/src/memory.ts.
 */

type Phase = "idle" | "exporting" | "merging" | "review" | "served";

const EXPORTS = [
  { tool: "ChatGPT", count: "3 entries", entries: ["instruction · “Never add attribution lines to commits”", "preference · concise, critical feedback", "career · runs a fintech backend team"] },
  { tool: "Grok", count: "2 entries", entries: ["preference · Concise, critical feedback.", "project · ctxfile: local-first MCP server, v0.6"] },
];

const ACTIVE = [
  { text: "Concise, critical feedback", meta: "preference · chatgpt, grok" },
  { text: "Runs a fintech backend team", meta: "career · chatgpt" },
  { text: "ctxfile: local-first MCP server, v0.6", meta: "project · grok" },
];

const CLIENTS = ["Claude Code", "Cursor", "Codex", "claude.ai"];

const STEPS: Array<[number, Phase]> = [
  [200, "exporting"],
  [1500, "merging"],
  [3000, "review"],
  [4400, "served"],
];

export function MemoryImportDemo() {
  const [phase, setPhase] = useState<Phase>("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const play = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("served");
      return;
    }
    setPhase("idle");
    for (const [at, next] of STEPS) {
      timers.current.push(setTimeout(() => setPhase(next), at));
    }
  }, []);

  useEffect(() => {
    play();
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, [play]);

  const at = ["idle", "exporting", "merging", "review", "served"].indexOf(phase);

  return (
    <figure
      className="pbdemo"
      data-phase={phase}
      aria-label="Animated diagram: ChatGPT and Grok export their memory, a duplicate merges, the instruction waits for approval, and active entries are served to every connected agent"
    >
      <div className="pbdemo-bar">
        <span className="pbdemo-title">ingest_memory · scope “global”</span>
        <button type="button" className="pbdemo-replay" onClick={play}>
          ↻ replay
        </button>
      </div>
      <div className="pbdemo-stage">
        <div className="pbdemo-col pbdemo-sessions">
          <div className="pbdemo-label">What each assistant knows</div>
          {EXPORTS.map((e, i) => (
            <div className="pbdemo-session" key={e.tool} data-on={at >= 1} style={{ transitionDelay: `${i * 140}ms` }}>
              <span className="pbdemo-session-tool">{e.tool}</span>
              <span className="pbdemo-session-turns">{e.count}</span>
              {e.entries.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ))}
        </div>

        <div className="pbdemo-flow" aria-hidden="true">
          <span className="pbdemo-wire" data-on={at >= 2} />
          <span className="pbdemo-model" data-on={at >= 2}>
            {at >= 3 ? "5 in, 4 stored" : at >= 2 ? "validating…" : "waiting"}
            <small>1 duplicate merged · redacted · local</small>
          </span>
          <span className="pbdemo-wire" data-on={at >= 3} />
        </div>

        <div className="pbdemo-col pbdemo-out">
          <div className="pbdemo-label">Your memory</div>
          <div className="pbdemo-card" data-on={at >= 3}>
            <div className="pbdemo-card-title">Waiting for your approval</div>
            <p className="pbdemo-card-prompt">
              <span className="pbdemo-slot">instruction</span> <span>Never add attribution lines to commits</span>
            </p>
            <div className="pbdemo-card-meta">verbatim · origin stored · no agent sees it until you approve</div>
          </div>
          <div className="pbdemo-card" data-on={at >= 3}>
            <div className="pbdemo-card-title">Active</div>
            {ACTIVE.map((a) => (
              <p className="pbdemo-card-prompt" key={a.text}>
                <span>{a.text}</span>
                <br />
                <small className="pbdemo-card-meta">{a.meta}</small>
              </p>
            ))}
          </div>
          <div className="pbdemo-label pbdemo-label-served" data-on={at >= 4}>
            In get_context for
          </div>
          <div className="pbdemo-clients">
            {CLIENTS.map((c, i) => (
              <span key={c} className="pbdemo-client" data-on={at >= 4} style={{ transitionDelay: `${i * 110}ms` }}>
                <span className="pbdemo-dot" />
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="pbdemo-caption">
        Two assistants, one memory. The same preference from both merges into one entry with both sources; the
        instruction waits for you; everything else reaches every agent on its next get_context.
      </figcaption>
    </figure>
  );
}
