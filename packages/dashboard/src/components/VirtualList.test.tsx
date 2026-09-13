import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { VirtualList } from "./VirtualList";

const items = Array.from({ length: 1000 }, (_, i) => `row-${i}`);

describe("VirtualList", () => {
  it("renders everything below the threshold", () => {
    render(
      <VirtualList items={items.slice(0, 20)} rowHeight={30} itemKey={(s) => s} renderRow={(s) => <span>{s}</span>} threshold={50} />
    );
    expect(screen.getAllByText(/row-/)).toHaveLength(20);
  });

  it("windows large lists to the visible slice and reacts to scroll", () => {
    render(
      <VirtualList
        items={items}
        rowHeight={30}
        overscan={2}
        itemKey={(s) => s}
        renderRow={(s) => <span>{s}</span>}
        threshold={50}
        ariaLabel="rows"
      />
    );
    const rendered = screen.getAllByText(/row-/);
    expect(rendered.length).toBeLessThan(60);
    expect(screen.getByText("row-0")).toBeInTheDocument();
    expect(screen.queryByText("row-500")).not.toBeInTheDocument();

    const list = screen.getByRole("list", { name: "rows" });
    expect(list).toHaveAttribute("aria-rowcount", "1000");
    Object.defineProperty(list, "scrollTop", { value: 500 * 30, configurable: true });
    fireEvent.scroll(list);
    expect(screen.getByText("row-500")).toBeInTheDocument();
    expect(screen.queryByText("row-0")).not.toBeInTheDocument();
  });
});
