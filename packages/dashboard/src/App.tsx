import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, ServerGoneError } from "./lib/api";
import { getToken } from "./lib/token";
import type { DashboardState } from "./lib/types";
import { VIEWS, type ViewId } from "./lib/views";
import { CommandPalette, type PaletteCommand } from "./components/CommandPalette";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Rail } from "./components/Rail";
import { TopBar } from "./components/TopBar";
import { Overview } from "./views/Overview";
import { ContextExplorer } from "./views/ContextExplorer";
import { GitPanel } from "./views/GitPanel";
import { Sessions } from "./views/Sessions";
import { Memory } from "./views/Memory";
import { Consult } from "./views/Consult";
import { Settings } from "./views/Settings";

type Theme = "dark" | "light";

function readTheme(): Theme {
  return localStorage.getItem("cb-theme") === "light" ? "light" : "dark";
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset["theme"] = theme;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
  );
}

export function App() {
  const [view, setView] = useState<ViewId>("overview");
  const [state, setState] = useState<DashboardState | null>(null);
  const [serverGone, setServerGone] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("cb-theme", theme);
  }, [theme]);

  const reportServerGone = useCallback(() => setServerGone(true), []);

  const loadState = useCallback((): void => {
    api
      .state()
      .then((data) => {
        setState(data);
        setServerGone(false);
        setUnauthorized(false);
      })
      .catch((err: unknown) => {
        if (err instanceof ServerGoneError) setServerGone(true);
        else if (err instanceof ApiError && err.status === 401) setUnauthorized(true);
      });
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  // Server-gone overlay auto-retries every 3s until /state answers again.
  useEffect(() => {
    if (!serverGone) return;
    const timer = setInterval(loadState, 3000);
    return () => clearInterval(timer);
  }, [serverGone, loadState]);

  const triggerRefresh = useCallback((): void => {
    if (viewRef.current === "overview") {
      setRefreshSignal((s) => s + 1);
    } else {
      api.snapshot().catch((err: unknown) => {
        if (err instanceof ServerGoneError) setServerGone(true);
      });
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        triggerRefresh();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [triggerRefresh]);

  if (getToken() === null || unauthorized) {
    return (
      <div className="fullscreen-state">
        <div className="fullscreen-card">
          <h1>ctxfile</h1>
          <p>
            Open the dashboard via the URL printed by <code>ctxfile ui</code>; it carries
            the one-time access token this page needs.
          </p>
        </div>
      </div>
    );
  }

  const features = state?.license.features ?? {
    sessions: false,
    memory: false,
    consult: false,
    voice: false,
  };

  const paletteCommands: PaletteCommand[] = [
    ...VIEWS.map((v) => ({
      id: `view-${v.id}`,
      label: `Go to ${v.label}`,
      hint: v.pro === true ? "pro" : undefined,
      run: () => setView(v.id),
    })),
    { id: "refresh", label: "Run snapshot", hint: "R", run: triggerRefresh },
    {
      id: "theme",
      label: `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
      run: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    },
  ];

  return (
    <div className="app">
      <TopBar
        state={state}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <div className="app-body">
        <Rail
          active={view}
          features={features}
          onNavigate={setView}
          version={state?.version ?? null}
        />
        <main className="main">
          <ErrorBoundary resetKey={view}>
            {view === "overview" &&
              (state !== null ? (
                <Overview state={state} onStateChanged={loadState} refreshSignal={refreshSignal} />
              ) : (
                <div className="loading">Connecting…</div>
              ))}
            {view === "context" && <ContextExplorer onServerGone={reportServerGone} />}
            {view === "git" && <GitPanel onServerGone={reportServerGone} />}
            {view === "sessions" && (
              <Sessions features={features} onServerGone={reportServerGone} />
            )}
            {view === "memory" && <Memory features={features} onServerGone={reportServerGone} />}
            {view === "consult" && (
              <Consult
                features={features}
                providers={state?.config.consult.providers ?? []}
                onServerGone={reportServerGone}
              />
            )}
            {view === "settings" &&
              (state !== null ? (
                <Settings state={state} onServerGone={reportServerGone} />
              ) : (
                <div className="loading">Connecting…</div>
              ))}
          </ErrorBoundary>
        </main>
      </div>

      {paletteOpen && (
        <CommandPalette commands={paletteCommands} onClose={() => setPaletteOpen(false)} />
      )}

      {serverGone && (
        <div className="fullscreen-state overlay" role="alert">
          <div className="fullscreen-card">
            <h1>Server unreachable</h1>
            <p>
              The local <code>ctxfile ui</code> process isn&apos;t answering. Retrying every
              few seconds. Restart it if this persists.
            </p>
            <div className="loading-dot" aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}
