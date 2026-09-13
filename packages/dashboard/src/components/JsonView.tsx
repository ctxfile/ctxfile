import { useState } from "react";
import { Icon } from "./Icon";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface JsonViewProps {
  value: unknown;
  /** Depth expanded on first render (root is depth 0). */
  defaultDepth?: number;
  /** Arrays/objects longer than this render a "show N more" row. */
  pageSize?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function preview(value: unknown): string {
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (isRecord(value)) {
    const keys = Object.keys(value);
    return keys.length === 0 ? "{}" : `{ ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", …" : ""} }`;
  }
  return "";
}

function Primitive({ value }: { value: unknown }) {
  if (value === null) return <span className="tk tk-keyword">null</span>;
  if (typeof value === "boolean") return <span className="tk tk-keyword">{String(value)}</span>;
  if (typeof value === "number") return <span className="tk tk-number">{String(value)}</span>;
  if (typeof value === "string") {
    const redacted = /\[REDACTED(?::[A-Za-z0-9_-]+)?\]/.test(value);
    return (
      <span className={`tk tk-string${redacted ? " has-redaction" : ""}`}>
        {JSON.stringify(value.length > 400 ? `${value.slice(0, 400)}…` : value)}
      </span>
    );
  }
  return <span className="tk tk-plain">{String(value)}</span>;
}

function Node({
  name,
  value,
  depth,
  defaultDepth,
  pageSize,
  last,
}: {
  name: string | null;
  value: unknown;
  depth: number;
  defaultDepth: number;
  pageSize: number;
  last: boolean;
}) {
  const container = Array.isArray(value) || isRecord(value);
  const [open, setOpen] = useState(depth < defaultDepth);
  const [shown, setShown] = useState(pageSize);

  const label =
    name !== null ? (
      <>
        <span className="tk tk-key">{JSON.stringify(name)}</span>
        <span className="tk tk-punct">: </span>
      </>
    ) : null;

  if (!container) {
    return (
      <div className="json-row" style={{ "--depth": depth } as React.CSSProperties}>
        <span className="json-toggle-spacer" />
        {label}
        <Primitive value={value} />
        {!last && <span className="tk tk-punct">,</span>}
      </div>
    );
  }

  const entries: [string, unknown][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value);
  const openBracket = Array.isArray(value) ? "[" : "{";
  const closeBracket = Array.isArray(value) ? "]" : "}";
  const empty = entries.length === 0;

  return (
    <div className="json-node">
      <div className="json-row" style={{ "--depth": depth } as React.CSSProperties}>
        {empty ? (
          <span className="json-toggle-spacer" />
        ) : (
          <button
            type="button"
            className="json-toggle"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? "Collapse" : "Expand"}
          >
            <Icon name="chevron-right" size={12} className={open ? "is-open" : undefined} />
          </button>
        )}
        {label}
        <span className="tk tk-punct">{openBracket}</span>
        {(!open || empty) && (
          <>
            {!empty && (
              <button type="button" className="json-preview" onClick={() => setOpen(true)}>
                {preview(value)}
              </button>
            )}
            <span className="tk tk-punct">{closeBracket}</span>
            {!last && <span className="tk tk-punct">,</span>}
          </>
        )}
      </div>
      {open && !empty && (
        <>
          {entries.slice(0, shown).map(([key, child], index) => (
            <Node
              key={key}
              name={Array.isArray(value) ? null : key}
              value={child}
              depth={depth + 1}
              defaultDepth={defaultDepth}
              pageSize={pageSize}
              last={index === entries.length - 1}
            />
          ))}
          {entries.length > shown && (
            <div className="json-row" style={{ "--depth": depth + 1 } as React.CSSProperties}>
              <span className="json-toggle-spacer" />
              <button type="button" className="json-more" onClick={() => setShown((s) => s + pageSize)}>
                … {(entries.length - shown).toLocaleString()} more
              </button>
            </div>
          )}
          <div className="json-row" style={{ "--depth": depth } as React.CSSProperties}>
            <span className="json-toggle-spacer" />
            <span className="tk tk-punct">{closeBracket}</span>
            {!last && <span className="tk tk-punct">,</span>}
          </div>
        </>
      )}
    </div>
  );
}

/** Collapsible, paged JSON tree; large arrays never render in one go. */
export function JsonView({ value, defaultDepth = 2, pageSize = 50 }: JsonViewProps) {
  return (
    <div className="json mono" role="tree">
      <Node name={null} value={value} depth={0} defaultDepth={defaultDepth} pageSize={pageSize} last />
    </div>
  );
}
