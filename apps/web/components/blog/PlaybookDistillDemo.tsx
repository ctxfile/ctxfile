"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Scripted replay of what `distill_playbook` does: saved sessions go in, one
 * reusable prompt with placeholders comes out, and the result is served to
 * every connected client as a native MCP prompt. The shape mirrors the real
 * product (the playbook fixture is the one shipped in the dashboard demo).
 */

type Phase = "idle" | "reading" | "distilling" | "written" | "served";

const SESSIONS = [
  { tool: "Claude Code", turns: 42, digest: "Verified provider webhooks: replay window, timing-safe compare, idempotent claim by event id." },
  { tool: "Cursor", turns: 18, digest: "Wrote the negative-path tests first: bad signature, stale timestamp, duplicate delivery." },
  { tool: "ChatGPT", turns: 9, digest: "Checked the provider's signing scheme docs; the SDK pins an older scheme." },
];

const PROMPT: Array<string | { slot: string }> = [
  "Given ",
  { slot: "provider" },
  " and its signing scheme, implement verification with a replay window, a timing-safe compare, and an idempotent event store keyed by ",
  { slot: "event id" },
  ". Write the negative-path tests first: bad signature, stale timestamp, duplicate delivery. Only then wire the side effect.",
];

const CLIENTS = ["Claude Code", "Cursor", "Codex", "Gemini CLI"];

const STEPS: Array<[number, Phase]> = [
  [200, "reading"],
  [1500, "distilling"],
  [3100, "written"],
  [4300, "served"],
];

export function PlaybookDistillDemo() {
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

  const rank = (p: Phase): number => ["idle", "reading", "distilling", "written", "served"].indexOf(p);
  const at = rank(phase);

  return (
    <figure className="pbdemo" data-phase={phase} aria-label="Animated diagram: three saved sessions are distilled into one playbook, which is then served to every connected agent">
      <div className="pbdemo-bar">
        <span className="pbdemo-title">distill_playbook · thread “checkout webhooks”</span>
        <button type="button" className="pbdemo-replay" onClick={play}>
          ↻ replay
        </button>
      </div>
      <div className="pbdemo-stage">
        <div className="pbdemo-col pbdemo-sessions">
          <div className="pbdemo-label">Saved sessions</div>
          {SESSIONS.map((s, i) => (
            <div className="pbdemo-session" key={s.tool} data-on={at >= 1} style={{ transitionDelay: `${i * 140}ms` }}>
              <span className="pbdemo-session-tool">{s.tool}</span>
              <span className="pbdemo-session-turns">{s.turns} turns</span>
              <p>{s.digest}</p>
            </div>
          ))}
        </div>

        <div className="pbdemo-flow" aria-hidden="true">
          <span className="pbdemo-wire" data-on={at >= 2} />
          <span className="pbdemo-model" data-on={at >= 2}>
            {at >= 3 ? "distilled" : at >= 2 ? "distilling…" : "waiting"}
            <small>ollama · qwen3:8b · local</small>
          </span>
          <span className="pbdemo-wire" data-on={at >= 3} />
        </div>

        <div className="pbdemo-col pbdemo-out">
          <div className="pbdemo-label">Playbook</div>
          <div className="pbdemo-card" data-on={at >= 3}>
            <div className="pbdemo-card-title">Verify a provider webhook end to end</div>
            <p className="pbdemo-card-prompt">
              {PROMPT.map((part, i) =>
                typeof part === "string" ? (
                  <span key={i}>{part}</span>
                ) : (
                  <span key={i} className="pbdemo-slot">
                    {part.slot}
                  </span>
                )
              )}
            </p>
            <div className="pbdemo-card-meta">distilled from 3 sessions · AES-256-GCM at rest · provenance kept</div>
          </div>
          <div className="pbdemo-label pbdemo-label-served" data-on={at >= 4}>
            Served as an MCP prompt to
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
        Sessions in, one reusable prompt out. The placeholders are the parts that change next time; everything else is the method you already proved.
      </figcaption>
    </figure>
  );
}
