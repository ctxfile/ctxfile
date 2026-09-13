import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CodeBlock } from "./CodeBlock";

describe("CodeBlock", () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it("detects the language from the title path and renders numbered, coloured lines", () => {
    render(<CodeBlock code={'const a = "b";\nlet c = 1;'} language="src/x.ts" title="src/x.ts" />);
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("2 lines")).toBeInTheDocument();
    expect(screen.getByText('"b"')).toHaveClass("tk-string");
    expect(document.querySelectorAll(".code-ln")).toHaveLength(2);
  });

  it("copies the full source and confirms", async () => {
    render(<CodeBlock code="hello" language="text" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello");
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy code" })).toHaveAttribute("data-tip", "Copied"));
  });

  it("toggles line wrapping", () => {
    render(<CodeBlock code="x" language="ts" />);
    const toggle = screen.getByRole("button", { name: "Enable line wrap" });
    fireEvent.click(toggle);
    expect(document.querySelector(".code")).toHaveClass("code-wrap");
    expect(screen.getByRole("button", { name: "Disable line wrap" })).toHaveAttribute("aria-pressed", "true");
  });

  it("collapses long code behind an expand button", () => {
    const code = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
    render(<CodeBlock code={code} language="text" collapseAfter={10} />);
    expect(screen.queryByText("line 20")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Show all 30 lines"));
    expect(screen.getByText("line 20")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Show less"));
    expect(screen.queryByText("line 20")).not.toBeInTheDocument();
  });

  it("hides the toolbar in bare mode", () => {
    render(<CodeBlock code="x" language="ts" bare />);
    expect(screen.queryByRole("button", { name: "Copy code" })).not.toBeInTheDocument();
  });
});
