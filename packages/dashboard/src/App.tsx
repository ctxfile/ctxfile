import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, ServerGoneError } from "./lib/api";
import { useLocalStorage, useSnapshotRun } from "./lib/hooks";
import { getToken } from "./lib/token";
import type { DashboardState } from "./lib/types";
import { VIEWS, hashForView, isLocked, viewFromHash, type ViewId } from "./lib/views";
import { CommandPalette, type PaletteCommand } from "./components/CommandPalette";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BrandMark, Icon } from "./components/Icon";
import { Sheet } from "./components/Sheet";
import { Sidebar } from "./components/Sidebar";
import { ToastProvider } from "./components/Toast";
import { TopBar } from "./components/TopBar";
import { Overview } from "./views/Overview";
import { ContextExplorer } from "./views/ContextExplorer";
import { GitPanel } from "./views/GitPanel";
import { Sessions } from "./views/Sessions";
import { Memory } from "./views/Memory";
import { Playbooks } from "./views/Playbooks";
import { Consult } from "./views/Consult";
import { Settings } from "./views/Settings";

type Theme = "dark" | "light";

const isTheme = (v: string): v is Theme => v === "dark" || v === "light";
const isBool = (v: string): v is "true" | "false" => v === "true" || v === "false";

function applyTheme(theme: Theme): void {
  document.documentElement.dataset["theme"] = theme;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
  );
}

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Command palette" },
  { keys: ["R"], label: "Run a snapshot" },
  { keys: ["1", "…", "8"], label: "Switch views" },
  { keys: ["/"], label: "Focus the filter in the current view" },
  { keys: ["["], label: "Collapse or expand the sidebar" },
  { keys: ["?"], label: "This help" },
  { keys: ["Esc"], label: "Close dialogs" },
];

export function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  const [view, setViewState] = useState<ViewId>(() => viewFromHash(window.location.hash));
  const [state, setState] = useState<DashboardState | null>(null);
  const [serverGone, setServerGone] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useLocalStorage<Theme>("cb-theme", "dark", isTheme);
  const [collapsedStored, setCollapsedStored] = useLocalStorage<"true" | "false">("cb-sidebar", "false", isBool);
  const collapsed = collapsedStored === "true";
  const [contextPath, setContextPath] = useState<string | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Hash routing: refresh and back/forward keep the view.
  const setView = useCallback((next: ViewId): void => {
    setViewState(next);
    if (window.location.hash !== hashForView(next)) {
      window.history.pushState(null, "", hashForView(next));
    }
  }, []);

  useEffect(() => {
    const onHash = (): void => setViewState(viewFromHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    if (window.location.hash === "") window.history.replaceState(null, "", hashForView(view));
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial hash only
  }, []);

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

  const { run, trigger: runSnapshot } = useSnapshotRun({ onDone: loadState, onServerGone: reportServerGone });

  const toggleTheme = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), [setTheme]);
  const toggleCollapsed = useCallback(() => setCollapsedStored((c) => (c === "true" ? "false" : "true")), [setCollapsedStored]);

  const features = state?.license.features ?? {
    sessions: false,
    memory: false,
    consult: false,
    voice: false,
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (paletteOpen || helpOpen) return;
      const key = event.key;
      if (key === "r" || key === "R") {
        event.preventDefault();
        runSnapshot();
      } else if (key === "?") {
        event.preventDefault();
        setHelpOpen(true);
      } else if (key === "[") {
        event.preventDefault();
        toggleCollapsed();
      } else if (/^[1-8]$/.test(key)) {
        const target = VIEWS.find((v) => v.shortcut === key);
        if (target !== undefined) {
          event.preventDefault();
          setView(target.id);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [runSnapshot, setView, toggleCollapsed, paletteOpen, helpOpen]);

  if (getToken() === null || unauthorized) {
    return (
      <div className="fullscreen-state">
        <div className="fullscreen-card">
          <BrandMark size={40} />
          <h1>Open through the launch URL</h1>
          <p>
            The dashboard needs the one-time access token that <code>ctxfile ui</code> prints. Open the URL it printed; a bare address is
            refused on purpose.
          </p>
          <pre className="fullscreen-cmd mono">$ ctxfile ui</pre>
        </div>
      </div>
    );
  }

  const tierLabel = !state?.license.active
    ? "Core"
    : state.license.licenseInfo?.tier !== null && state.license.licenseInfo?.tier !== undefined
      ? state.license.licenseInfo.tier.charAt(0).toUpperCase() + state.license.licenseInfo.tier.slice(1)
      : "Pro";

  const paletteCommands: PaletteCommand[] = [
    ...VIEWS.map((v) => ({
      id: `view-${v.id}`,
      label: `Go to ${v.label}`,
      hint: isLocked(v, features) ? "pro" : v.shortcut,
      group: "Views",
      icon: v.id,
      keywords: v.description,
      run: () => setView(v.id),
    })),
    { id: "refresh", label: "Run snapshot", hint: "R", group: "Actions", icon: "play" as const, keywords: "record refresh capture", run: runSnapshot },
    {
      id: "theme",
      label: `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
      group: "Actions",
      icon: theme === "dark" ? ("sun" as const) : ("moon" as const),
      keywords: "appearance colour mode",
      run: toggleTheme,
    },
    {
      id: "sidebar",
      label: collapsed ? "Expand sidebar" : "Collapse sidebar",
      hint: "[",
      group: "Actions",
      icon: "sidebar" as const,
      run: toggleCollapsed,
    },
    { id: "help", label: "Keyboard shortcuts", hint: "?", group: "Actions", icon: "command" as const, run: () => setHelpOpen(true) },
  ];

  const openContext = (path?: string): void => {
    setContextPath(path ?? null);
    setView("context");
  };

  return (
    <div className={`app${collapsed ? " sidebar-collapsed" : ""}`}>
      <div className="app-glow" aria-hidden="true" />
      <Sidebar
        active={view}
        features={features}
        onNavigate={setView}
        version={state?.version ?? null}
        tier={tierLabel}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <div className="app-main">
        <TopBar
          state={state}
          view={view}
          theme={theme}
          run={run}
          onRunSnapshot={runSnapshot}
          onToggleTheme={toggleTheme}
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenSidebar={() => setMobileNavOpen(true)}
        />
        <main className="main" key={view}>
          <ErrorBoundary resetKey={view}>
            {view === "overview" &&
              (state !== null ? (
                <Overview state={state} run={run} onRunSnapshot={runSnapshot} onOpenContext={openContext} />
              ) : (
                <ConnectingView />
              ))}
            {view === "context" && <ContextExplorer onServerGone={reportServerGone} initialPath={contextPath} />}
            {view === "git" && <GitPanel onServerGone={reportServerGone} refreshKey={run.completedRuns} />}
            {view === "sessions" && <Sessions features={features} onServerGone={reportServerGone} />}
            {view === "memory" && <Memory features={features} onServerGone={reportServerGone} />}
            {view === "playbooks" && <Playbooks features={features} onServerGone={reportServerGone} />}
            {view === "consult" && (
              <Consult features={features} providers={state?.config.consult.providers ?? []} onServerGone={reportServerGone} />
            )}
            {view === "settings" && (state !== null ? <Settings state={state} onServerGone={reportServerGone} /> : <ConnectingView />)}
          </ErrorBoundary>
        </main>
      </div>

      {paletteOpen && <CommandPalette commands={paletteCommands} onClose={() => setPaletteOpen(false)} />}

      {helpOpen && (
        <Sheet title="Keyboard shortcuts" onClose={() => setHelpOpen(false)} size="md">
          <ul className="shortcut-list">
            {SHORTCUTS.map((s) => (
              <li key={s.label}>
                <span className="shortcut-keys">
                  {s.keys.map((k, i) => (k === "…" ? <span key={i} className="shortcut-ellipsis">…</span> : <kbd key={i}>{k}</kbd>))}
                </span>
                <span>{s.label}</span>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {serverGone && (
        <div className="fullscreen-state overlay" role="alert">
          <div className="fullscreen-card">
            <span className="led led-error fullscreen-led" aria-hidden="true" />
            <h1>Server unreachable</h1>
            <p>
              The local <code>ctxfile ui</code> process isn&apos;t answering. Retrying every few seconds; restart it if this persists.
            </p>
            <div className="loading-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectingView() {
  return (
    <div className="view">
      <div className="connecting">
        <Icon name="refresh" size={16} className="spin" />
        Connecting to ctxfile…
      </div>
    </div>
  );
}
