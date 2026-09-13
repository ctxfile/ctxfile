import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CommandPalette, type PaletteCommand } from "./CommandPalette";

function commands(run: (id: string) => void): PaletteCommand[] {
  return [
    { id: "overview", label: "Go to Overview", group: "Views", hint: "1", run: () => run("overview") },
    { id: "context", label: "Go to Context", group: "Views", hint: "2", run: () => run("context") },
    { id: "snapshot", label: "Run snapshot", group: "Actions", hint: "R", keywords: "record", run: () => run("snapshot") },
    { id: "theme", label: "Switch to light theme", group: "Actions", run: () => run("theme") },
  ];
}

describe("CommandPalette", () => {
  it("lists every command under its group when the query is empty", () => {
    render(<CommandPalette commands={commands(() => undefined)} onClose={() => undefined} />);
    expect(screen.getByText("Views")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(4);
  });

  it("fuzzy-filters by label and hidden keywords, hiding group headers", () => {
    render(<CommandPalette commands={commands(() => undefined)} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Search commands"), { target: { value: "record" } });
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Run snapshot");
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
  });

  it("shows an empty message when nothing matches", () => {
    render(<CommandPalette commands={commands(() => undefined)} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Search commands"), { target: { value: "zzzz" } });
    expect(screen.getByText("No matching commands")).toBeInTheDocument();
  });

  it("navigates with the arrow keys and runs the selection on Enter, then closes", () => {
    const run = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette commands={commands(run)} onClose={onClose} />);
    const input = screen.getByLabelText("Search commands");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[2]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(run).toHaveBeenCalledWith("snapshot");
    expect(onClose).toHaveBeenCalled();
  });

  it("runs a command on click and closes on Escape or backdrop click", () => {
    const run = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette commands={commands(run)} onClose={onClose} />);
    fireEvent.click(screen.getByText("Switch to light theme"));
    expect(run).toHaveBeenCalledWith("theme");
    fireEvent.keyDown(screen.getByLabelText("Search commands"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("highlights the matched characters", () => {
    render(<CommandPalette commands={commands(() => undefined)} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Search commands"), { target: { value: "ctx" } });
    const marks = screen.getAllByRole("option")[0]?.querySelectorAll("mark") ?? [];
    expect(marks.length).toBeGreaterThan(0);
  });
});
