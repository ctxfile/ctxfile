const CHARS_PER_TOKEN = 4;
const TRUNCATION_MARKER = "\n[...truncated...]\n";

export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function truncateToTokens(
  text: string,
  maxTokens: number
): { text: string; truncated: boolean } {
  if (estimateTokens(text) <= maxTokens) {
    return { text, truncated: false };
  }
  const maxChars = maxTokens * CHARS_PER_TOKEN - TRUNCATION_MARKER.length;
  if (maxChars <= 0) {
    return { text: "", truncated: true };
  }
  const headChars = Math.floor(maxChars * 0.6);
  const tailChars = maxChars - headChars;
  const head = text.slice(0, headChars);
  const tail = tailChars > 0 ? text.slice(-tailChars) : "";
  return { text: head + TRUNCATION_MARKER + tail, truncated: true };
}

export class TokenBudget {
  private consumed = 0;

  constructor(private readonly total: number) {}

  used(): number {
    return this.consumed;
  }

  remaining(): number {
    return Math.max(0, this.total - this.consumed);
  }

  take(tokens: number): boolean {
    if (tokens > this.remaining()) return false;
    this.consumed += tokens;
    return true;
  }
}
