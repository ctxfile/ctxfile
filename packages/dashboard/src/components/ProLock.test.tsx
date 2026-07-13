import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProLock } from "./ProLock";

describe("ProLock", () => {
  it("renders the fixture preview, the gold PRO pill, and the pitch", () => {
    render(
      <ProLock feature="sessions" pitch="See your agent sessions.">
        <div>fixture content</div>
      </ProLock>
    );
    expect(screen.getByText("fixture content")).toBeInTheDocument();
    expect(screen.getByText("PRO")).toHaveClass("pro-pill");
    expect(screen.getByText("See your agent sessions.")).toBeInTheDocument();
  });

  it("marks the preview as decorative and non-interactive", () => {
    render(
      <ProLock feature="memory" pitch="Encrypted memory.">
        <button type="button">should not be reachable</button>
      </ProLock>
    );
    const preview = screen.getByTestId("pro-lock-preview");
    expect(preview).toHaveAttribute("aria-hidden", "true");
    expect(preview).toHaveClass("pro-lock-preview");
  });
});
