import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusPill } from "./StatusPill";
import { ConnectorRow } from "./ConnectorRow";

describe("StatusPill", () => {
  it.each([
    ["ok", "ok"],
    ["skipped", "skipped"],
    ["error", "error"],
    ["running", "running"],
    ["locked", "pro"],
  ] as const)("renders the %s state with its default label", (status, label) => {
    render(<StatusPill status={status} />);
    const pill = screen.getByText(label);
    expect(pill).toHaveClass(`pill-${status}`);
    expect(pill).toHaveAttribute("data-status", status);
  });

  it("prefers an explicit label over the default", () => {
    render(<StatusPill status="ok" label="active" />);
    expect(screen.getByText("active")).toHaveClass("pill-ok");
  });
});

describe("ConnectorRow", () => {
  it("renders an ok connector with its duration", () => {
    render(<ConnectorRow name="files" status="ok" durationMs={128} />);
    expect(screen.getByText("files")).toBeInTheDocument();
    expect(screen.getByText("128ms")).toBeInTheDocument();
    expect(screen.getByText("ok")).toHaveClass("pill-ok");
  });

  it("shows the connector error string when in the error state", () => {
    render(<ConnectorRow name="notion" status="error" durationMs={12} error="401 unauthorized" />);
    expect(screen.getByText("401 unauthorized")).toBeInTheDocument();
    expect(screen.getByText("error")).toHaveClass("pill-error");
  });

  it("hides the error string for non-error states", () => {
    render(<ConnectorRow name="git" status="skipped" error="stale error" />);
    expect(screen.queryByText("stale error")).not.toBeInTheDocument();
    expect(screen.getByText("skipped")).toHaveClass("pill-skipped");
  });

  it("renders a running connector without a duration", () => {
    render(<ConnectorRow name="files" status="running" />);
    expect(screen.getByText("running")).toHaveClass("pill-running");
    expect(screen.queryByText(/ms$/)).not.toBeInTheDocument();
  });
});
