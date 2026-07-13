import { describe, expect, it } from "vitest";
import { createSseParserState, parseSseChunk } from "./sse";

describe("parseSseChunk", () => {
  it("parses multiple frames arriving in one chunk", () => {
    const state = createSseParserState();
    const events = parseSseChunk(
      state,
      'event: connector:start\ndata: {"name":"files"}\n\nevent: tokens\ndata: {"tokensUsed":10,"tokenBudget":100}\n\n'
    );
    expect(events).toEqual([
      { event: "connector:start", data: '{"name":"files"}' },
      { event: "tokens", data: '{"tokensUsed":10,"tokenBudget":100}' },
    ]);
    expect(state.buffer).toBe("");
  });

  it("buffers a frame split across chunks and emits it once complete", () => {
    const state = createSseParserState();
    expect(parseSseChunk(state, "event: done\nda")).toEqual([]);
    expect(state.buffer).not.toBe("");
    const events = parseSseChunk(state, 'ta: {"generatedAt":"2026-07-10"}\n\n');
    expect(events).toEqual([{ event: "done", data: '{"generatedAt":"2026-07-10"}' }]);
    expect(state.buffer).toBe("");
  });

  it("ignores comment-only frames like the :ok handshake", () => {
    const state = createSseParserState();
    const events = parseSseChunk(state, ':ok\n\nevent: error\ndata: {"message":"boom"}\n\n');
    expect(events).toEqual([{ event: "error", data: '{"message":"boom"}' }]);
  });

  it("joins multi-line data and strips a single leading space after the colon", () => {
    const state = createSseParserState();
    const events = parseSseChunk(state, "event: note\ndata: line one\ndata: line two\n\n");
    expect(events).toEqual([{ event: "note", data: "line one\nline two" }]);
  });

  it("handles CRLF line endings", () => {
    const state = createSseParserState();
    const events = parseSseChunk(state, "event: done\r\ndata: {}\r\n\r\n");
    expect(events).toEqual([{ event: "done", data: "{}" }]);
  });
});
