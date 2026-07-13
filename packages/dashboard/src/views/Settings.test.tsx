import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DashboardState, LicenseState } from "../lib/types";
import { Settings } from "./Settings";

const DAY_MS = 86_400_000;

function makeState(license: Partial<LicenseState> = {}): DashboardState {
  return {
    version: "0.0.0-test",
    root: "/tmp/fixture",
    license: {
      installed: false,
      active: false,
      status: null,
      features: { sessions: false, memory: false, consult: false, voice: false },
      licenseInfo: null,
      ...license,
    },
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
    latest: null,
    recent: [],
  };
}

function activePro(licenseInfo: LicenseState["licenseInfo"]): Partial<LicenseState> {
  return {
    installed: true,
    active: true,
    features: { sessions: true, memory: true, consult: true, voice: true },
    licenseInfo,
  };
}

describe("Settings license card", () => {
  it("shows the payload tier and a non-warning expiry line when far from expiry", () => {
    const expiresAt = new Date(Date.now() + 90 * DAY_MS).toISOString();
    render(
      <Settings
        state={makeState(activePro({ tier: "team", expiresAt, customerId: "cust-1" }))}
        onServerGone={() => {}}
      />
    );
    expect(screen.getByText("Team")).toBeInTheDocument();
    const line = screen.getByText(/^expires .+ · \d+ days left$/);
    expect(line).toHaveClass("license-expiry");
    expect(line).not.toHaveClass("license-expiry-warn");
  });

  it("renders the expiry line amber when under 30 days remain", () => {
    const expiresAt = new Date(Date.now() + 10 * DAY_MS).toISOString();
    render(
      <Settings
        state={makeState(activePro({ tier: "pro", expiresAt, customerId: null }))}
        onServerGone={() => {}}
      />
    );
    expect(screen.getByText("Pro")).toBeInTheDocument();
    const line = screen.getByText(/^expires .+ · \d+ days left$/);
    expect(line).toHaveClass("license-expiry-warn");
  });

  it("marks an already-expired license amber with an expired label", () => {
    const expiresAt = new Date(Date.now() - 3 * DAY_MS).toISOString();
    render(
      <Settings state={makeState(activePro({ tier: "pro", expiresAt }))} onServerGone={() => {}} />
    );
    const line = screen.getByText(/^expired .+$/);
    expect(line).toHaveClass("license-expiry-warn");
  });

  it("falls back to the Pro tier label and no expiry line when licenseInfo is absent", () => {
    render(<Settings state={makeState(activePro(null))} onServerGone={() => {}} />);
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.queryByText(/expires /)).toBeNull();
    expect(screen.queryByText(/expired /)).toBeNull();
  });

  it("shows Core (free) and no expiry line when no license is active", () => {
    render(<Settings state={makeState()} onServerGone={() => {}} />);
    expect(screen.getByText("Core (free)")).toBeInTheDocument();
    expect(screen.queryByText(/expires /)).toBeNull();
  });
});
