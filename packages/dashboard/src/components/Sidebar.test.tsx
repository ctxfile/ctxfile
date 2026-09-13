import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Sidebar } from "./Sidebar";

const FEATURES = { sessions: false, memory: true, consult: false, voice: false };

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const props = {
    active: "overview" as const,
    features: FEATURES,
    onNavigate: vi.fn(),
    version: "1.2.3",
    tier: "Core",
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    mobileOpen: false,
    onCloseMobile: vi.fn(),
    ...overrides,
  };
  render(<Sidebar {...props} />);
  return props;
}

describe("Sidebar", () => {
  it("renders every view grouped, marks the active one, and shows the version and tier", () => {
    renderSidebar();
    expect(screen.getByRole("button", { name: /overview/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("v1.2.3")).toBeInTheDocument();
    expect(screen.getByText("Core")).toHaveClass("tier-chip");
  });

  it("locks Pro views the license does not include, and not the ones it does", () => {
    renderSidebar();
    expect(screen.getByRole("button", { name: /sessions/i })).toHaveClass("is-locked");
    expect(screen.getByRole("button", { name: /consult/i })).toHaveClass("is-locked");
    expect(screen.getByRole("button", { name: /memory/i })).not.toHaveClass("is-locked");
    expect(screen.getByRole("button", { name: /playbooks/i })).not.toHaveClass("is-locked");
  });

  it("navigates and closes the mobile drawer on click", () => {
    const props = renderSidebar({ mobileOpen: true });
    fireEvent.click(screen.getByRole("button", { name: /^git/i }));
    expect(props.onNavigate).toHaveBeenCalledWith("git");
    expect(props.onCloseMobile).toHaveBeenCalled();
  });

  it("toggles collapse and exposes the collapsed state", () => {
    const props = renderSidebar({ collapsed: true });
    expect(screen.getByRole("navigation", { name: "Views" })).toHaveClass("is-collapsed");
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(props.onToggleCollapsed).toHaveBeenCalled();
  });
});
