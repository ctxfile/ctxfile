/**
 * Canonical JSON for signing and hashing (RFC 8785 / JCS shape): object keys
 * sorted by UTF-16 code units at every depth, no whitespace, strings and
 * numbers serialized exactly as ECMAScript JSON.stringify does. Two parties
 * that hold the same value always produce the same bytes, so a signature or
 * content hash never depends on key order or nesting.
 *
 * Only plain JSON values are accepted. Non-finite numbers, undefined inside
 * arrays, functions, symbols, and bigints throw instead of silently changing
 * what gets signed.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new Error("canonicalJson: non-finite numbers cannot be canonicalized");
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value
          .map((item) => {
            if (item === undefined) throw new Error("canonicalJson: undefined is not a JSON value");
            return canonicalJson(item);
          })
          .join(",")}]`;
      }
      const record = value as Record<string, unknown>;
      // Keys whose value is undefined are omitted, as JSON.stringify does.
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
    }
    default:
      throw new Error(`canonicalJson: ${typeof value} is not a JSON value`);
  }
}
