import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { captureToken, resetTokenForTests } from "../lib/token";
import { CrossingTools } from "./Overview";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  captureToken({ hash: "#token=t", pathname: "/", search: "" }, { replaceState: vi.fn() });
});

afterEach(() => {
  resetTokenForTests();
  vi.unstubAllGlobals();
});

describe("Work crossing tools card", () => {
  it("shows the four 30-day gate counters", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          cross_vendor_threads_30d: 3,
          handoffs_saved_30d: 7,
          handoffs_resumed_cross_vendor_30d: 4,
          resumes_with_prompt_30d: 5,
        })
      )
    );
    render(<CrossingTools />);
    const card = await screen.findByRole("region", { name: "Work crossing tools (30 days)" });
    const fact = (label: string) => within(card).getByText(label).parentElement;
    expect(fact("Cross-vendor threads")).toHaveTextContent("3");
    expect(fact("Handoffs saved")).toHaveTextContent("7");
    expect(fact("Picked up by another tool")).toHaveTextContent("4");
    expect(fact("Resumes with first prompt")).toHaveTextContent("5");
  });

  it("stays hidden when the local store is off", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503, { error: "off" }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<CrossingTools />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/internal/handoff-stats", expect.anything()));
    expect(container).toBeEmptyDOMElement();
  });
});
