import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { IDLE_RUN, type LiveRun } from "../lib/hooks";
import type { DashboardState } from "../lib/types";
import { TopBar } from "./TopBar";

function state(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    version: "0.4.1",
    root: "/Users/dev/projects/ctxfile",
    license: { installed: false, active: false, status: null, features: { sessions: false, memory: false, consult: false, voice: false }, licenseInfo: null },
    config: {
      tokenBudget: 50_000,
      maxFileTokens: 2_000,
      cacheMaxAgeMs: 60_000,
      include: [],
      exclude: [],
      notion: { configured: false, pageCount: 0 },
      ollama: { summarize: false, model: null, baseUrl: "http://127.0.0.1:11434" },
      consult: { providers: [] },
      voice: { configured: false },
      telemetry: { enabled: false },
    },
    latest: { generatedAt: new Date(Date.now() - 30_000).toISOString(), tokensUsed: 10, tokenBudget: 50_000, connectors: [] },
    recent: [],
    ...overrides,
  };
}

function renderBar(run: LiveRun = IDLE_RUN, s: DashboardState | null = state()) {
  const props = {
    state: s,
    view: "overview" as const,
    theme: "dark" as const,
    run,
    onRunSnapshot: vi.fn(),
    onToggleTheme: vi.fn(),
    onOpenPalette: vi.fn(),
    onOpenSidebar: vi.fn(),
  };
  render(<TopBar {...props} />);
  return props;
}

describe("TopBar", () => {
  it("shows the project name, the view, and a fresh snapshot status", () => {
    renderBar();
    expect(screen.getByText("ctxfile")).toHaveClass("crumb-project");
    expect(screen.getByText("Overview")).toHaveClass("crumb-view");
    expect(screen.getByRole("status")).toHaveClass("status-fresh");
    expect(screen.getByRole("status")).toHaveTextContent(/snapshot \d+s ago/);
  });

  it("flags a stale snapshot", () => {
    renderBar(IDLE_RUN, state({ latest: { generatedAt: new Date(Date.now() - 600_000).toISOString(), tokensUsed: 1, tokenBudget: 1, connectors: [] } }));
    expect(screen.getByRole("status")).toHaveClass("status-stale");
  });

  it("reports recording with the active connectors and disables the run button", () => {
    const props = renderBar({ ...IDLE_RUN, running: true, startedAt: Date.now(), connectors: { file: { status: "running" }, git: { status: "ok" } } });
    expect(screen.getByRole("status")).toHaveClass("status-running");
    expect(screen.getByRole("status")).toHaveTextContent("recording · file");
    const run = screen.getByRole("button", { name: "Run snapshot" });
    expect(run).toBeDisabled();
    fireEvent.click(run);
    expect(props.onRunSnapshot).not.toHaveBeenCalled();
  });

  it("wires the run, palette, theme and menu buttons", () => {
    const props = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Run snapshot" }));
    fireEvent.click(screen.getByRole("button", { name: "Open command palette" }));
    fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(props.onRunSnapshot).toHaveBeenCalledTimes(1);
    expect(props.onOpenPalette).toHaveBeenCalledTimes(1);
    expect(props.onToggleTheme).toHaveBeenCalledTimes(1);
    expect(props.onOpenSidebar).toHaveBeenCalledTimes(1);
  });

  it("shows connecting and no-snapshot states without a server payload", () => {
    renderBar(IDLE_RUN, null);
    expect(screen.getByText("connecting…")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("no snapshot yet");
  });
});
