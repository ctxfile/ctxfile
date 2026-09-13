import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { JsonView } from "./JsonView";

describe("JsonView", () => {
  it("renders primitives with syntax classes", () => {
    render(<JsonView value={{ a: 1, b: "x", c: true, d: null }} />);
    expect(screen.getByText("1")).toHaveClass("tk-number");
    expect(screen.getByText('"x"')).toHaveClass("tk-string");
    expect(screen.getByText("true")).toHaveClass("tk-keyword");
    expect(screen.getByText("null")).toHaveClass("tk-keyword");
  });

  it("collapses beyond the default depth and expands on click", () => {
    render(<JsonView value={{ outer: { inner: { deep: 42 } } }} defaultDepth={1} />);
    expect(screen.queryByText("42")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("{ inner }"));
    expect(screen.queryByText("42")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("{ deep }"));
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("pages long arrays instead of rendering them whole", () => {
    const value = Array.from({ length: 120 }, (_, i) => i);
    render(<JsonView value={value} pageSize={50} />);
    expect(screen.getByText("… 70 more")).toBeInTheDocument();
    expect(screen.queryByText("60")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("… 70 more"));
    expect(screen.getByText("60")).toBeInTheDocument();
    expect(screen.getByText("… 20 more")).toBeInTheDocument();
  });

  it("renders empty containers inline", () => {
    render(<JsonView value={{ list: [], obj: {} }} />);
    expect(screen.getAllByText("[")).toHaveLength(1);
    expect(screen.getAllByText("]")).toHaveLength(1);
  });

  it("flags redacted strings", () => {
    render(<JsonView value={{ token: "[REDACTED:api-key]" }} />);
    expect(screen.getByText('"[REDACTED:api-key]"')).toHaveClass("has-redaction");
  });
});
