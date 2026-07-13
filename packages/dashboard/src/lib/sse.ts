import { ApiError, ServerGoneError, authHeaders } from "./api";

/**
 * SSE over fetch: EventSource can't send an Authorization header, so we read
 * the response body stream and parse `event:`/`data:` frames ourselves.
 */

export interface SseEvent {
  event: string;
  data: string;
}

export interface SseParserState {
  buffer: string;
}

export function createSseParserState(): SseParserState {
  return { buffer: "" };
}

/**
 * Feed a raw chunk into the parser; returns every complete frame it closed.
 * Partial frames stay buffered in `state` until the next chunk. Comment-only
 * frames (`:ok`) produce nothing.
 */
export function parseSseChunk(state: SseParserState, chunk: string): SseEvent[] {
  state.buffer += chunk.replace(/\r\n/g, "\n");
  const events: SseEvent[] = [];
  let boundary = state.buffer.indexOf("\n\n");
  while (boundary !== -1) {
    const frame = state.buffer.slice(0, boundary);
    state.buffer = state.buffer.slice(boundary + 2);
    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) eventName = line.slice("event:".length).trim();
      else if (line.startsWith("data:")) {
        const value = line.slice("data:".length);
        dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
      }
    }
    if (dataLines.length > 0 || eventName !== "message") {
      events.push({ event: eventName, data: dataLines.join("\n") });
    }
    boundary = state.buffer.indexOf("\n\n");
  }
  return events;
}

export interface StreamSseOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  onEvent: (event: SseEvent) => void;
}

/** Opens an authenticated SSE stream and dispatches frames until it closes. */
export async function streamSse(path: string, options: StreamSseOptions): Promise<void> {
  const { method = "GET", body, signal, onEvent } = options;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: authHeaders(body !== undefined ? { "Content-Type": "application/json" } : undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ServerGoneError();
  }
  if (!res.ok) {
    let parsed: { error?: unknown; feature?: unknown } = {};
    try {
      parsed = (await res.json()) as { error?: unknown; feature?: unknown };
    } catch {
      // non-JSON error body
    }
    throw new ApiError(
      res.status,
      typeof parsed.error === "string" ? parsed.error : `stream failed (${res.status})`,
      typeof parsed.feature === "string" ? parsed.feature : undefined
    );
  }
  const reader = res.body?.getReader();
  if (!reader) throw new ServerGoneError();
  const decoder = new TextDecoder();
  const state = createSseParserState();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const event of parseSseChunk(state, decoder.decode(value, { stream: true }))) {
      onEvent(event);
    }
  }
}

/** Parse an SSE frame's JSON payload; returns null on malformed data. */
export function parseJsonData<T>(event: SseEvent): T | null {
  try {
    return JSON.parse(event.data) as T;
  } catch {
    return null;
  }
}
