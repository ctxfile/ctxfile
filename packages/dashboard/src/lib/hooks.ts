import { useCallback, useEffect, useRef, useState } from "react";
import { api, ServerGoneError } from "./api";
import { parseJsonData, streamSse } from "./sse";
import type { BuildEvent, ConnectorStatus } from "./types";
import type { PillStatus } from "../components/StatusPill";

/* ------------------------------------------------------------ local storage */

export function useLocalStorage<T extends string>(key: string, fallback: T, valid: (v: string) => v is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null && valid(stored) ? stored : fallback;
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // storage unavailable; the value still applies for this session
    }
  }, [key, value]);
  return [value, setValue] as const;
}

/* ------------------------------------------------------------- media query */

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const onChange = (): void => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/* -------------------------------------------------------------------- clock */

/** Re-renders every `intervalMs` so relative timestamps stay honest. */
export function useNow(intervalMs = 10_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/* ------------------------------------------------------------- copy helper */

export function useCopy(resetMs = 1500): [copiedId: string | null, copy: (id: string, text: string) => void] {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = useCallback(
    (id: string, text: string): void => {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopiedId(id);
          if (timer.current !== null) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), resetMs);
        })
        .catch(() => {
          /* clipboard unavailable; text stays selectable */
        });
    },
    [resetMs]
  );
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    []
  );
  return [copiedId, copy];
}

/* --------------------------------------------------------- live snapshot run */

export interface LiveConnector {
  status: PillStatus;
  durationMs?: number;
  error?: string;
}

export interface LiveRun {
  running: boolean;
  /** Epoch ms when the current run started (for elapsed readouts). */
  startedAt: number | null;
  connectors: Record<string, LiveConnector>;
  tokensUsed: number | null;
  tokenBudget: number | null;
  error: string | null;
  /** Increments on every completed run so views can flash/refetch. */
  completedRuns: number;
}

export const IDLE_RUN: LiveRun = {
  running: false,
  startedAt: null,
  connectors: {},
  tokensUsed: null,
  tokenBudget: null,
  error: null,
  completedRuns: 0,
};

export interface SnapshotRunHandle {
  run: LiveRun;
  trigger: () => void;
}

/**
 * Owns the persistent /api/internal/events stream and the single-flight
 * snapshot trigger. Lives at the app level so every view (and the top bar)
 * sees the same live state and the `R` shortcut works everywhere.
 */
export function useSnapshotRun(options: { onDone: () => void; onServerGone: () => void }): SnapshotRunHandle {
  const [run, setRun] = useState<LiveRun>(IDLE_RUN);
  const runningRef = useRef(false);
  const onDoneRef = useRef(options.onDone);
  const onServerGoneRef = useRef(options.onServerGone);
  onDoneRef.current = options.onDone;
  onServerGoneRef.current = options.onServerGone;

  useEffect(() => {
    const controller = new AbortController();
    void streamSse("/api/internal/events", {
      signal: controller.signal,
      onEvent: (frame) => {
        const event = parseJsonData<BuildEvent>(frame);
        if (event === null) return;
        if (event.type === "connector:start") {
          runningRef.current = true;
          setRun((prev) => ({
            ...prev,
            running: true,
            startedAt: prev.running ? prev.startedAt : Date.now(),
            error: null,
            connectors: { ...prev.connectors, [event.name]: { status: "running" } },
          }));
        } else if (event.type === "connector:done") {
          const done: ConnectorStatus = event.connector;
          setRun((prev) => ({
            ...prev,
            connectors: {
              ...prev.connectors,
              [done.name]: {
                status: done.status,
                durationMs: done.durationMs,
                ...(done.error !== undefined ? { error: done.error } : {}),
              },
            },
          }));
        } else if (event.type === "tokens") {
          setRun((prev) => ({ ...prev, tokensUsed: event.tokensUsed, tokenBudget: event.tokenBudget }));
        } else if (event.type === "done") {
          runningRef.current = false;
          setRun((prev) => ({ ...prev, running: false, completedRuns: prev.completedRuns + 1 }));
          onDoneRef.current();
        } else if (event.type === "error") {
          runningRef.current = false;
          setRun((prev) => ({ ...prev, running: false, error: event.message }));
        }
      },
    }).catch(() => {
      // stream closed (server restart / tab sleep); the app-level ping handles server-gone
    });
    return () => controller.abort();
  }, []);

  const trigger = useCallback((): void => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRun((prev) => ({
      ...IDLE_RUN,
      completedRuns: prev.completedRuns,
      running: true,
      startedAt: Date.now(),
    }));
    api.snapshot().catch((err: unknown) => {
      runningRef.current = false;
      if (err instanceof ServerGoneError) onServerGoneRef.current();
      setRun((prev) => ({ ...prev, running: false, error: "failed to start snapshot" }));
    });
  }, []);

  return { run, trigger };
}
