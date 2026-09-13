import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Segmented } from "./Segmented";

const OPTIONS = [
  { value: "full", label: "full" },
  { value: "plan", label: "plan", badge: 3 },
  { value: "git", label: "git" },
] as const;

describe("Segmented", () => {
  it("marks the selected tab and shows badges", () => {
    render(<Segmented options={OPTIONS} value="plan" onChange={() => undefined} ariaLabel="Scope" />);
    expect(screen.getByRole("tab", { name: /plan/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /full/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("3")).toHaveClass("segmented-badge");
  });

  it("changes on click and cycles with the arrow keys", () => {
    const onChange = vi.fn();
    render(<Segmented options={OPTIONS} value="full" onChange={onChange} ariaLabel="Scope" />);
    fireEvent.click(screen.getByRole("tab", { name: /git/ }));
    expect(onChange).toHaveBeenCalledWith("git");
    fireEvent.keyDown(screen.getByRole("tab", { name: /full/ }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("plan");
    fireEvent.keyDown(screen.getByRole("tab", { name: /full/ }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("git");
  });
});
