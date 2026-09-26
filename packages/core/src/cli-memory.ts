import { readFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.js";
import { formatIngestErrors, ingestInputSchema } from "./ingest.js";
import {
  describeMemoryImport,
  extractJsonPayload,
  formatMemoryErrors,
  memoryImportPrompt,
  memoryInputSchema,
  renderMemoryMarkdown,
  withMemoryDefaults,
  type MemoryRecord,
  type MemoryScope,
} from "./memory.js";
import { IngestStore } from "./storage/ingest-store.js";
import type { MemoryListScope } from "./storage/memory-store.js";

/**
 * `ctxfile memory ...` and `ctxfile ingest import`: the paste doors for chat
 * surfaces without MCP, plus review and export. Human output (prompt, list,
 * export) goes to stdout; status lines go to stderr. Never the MCP path.
 */

export const MEMORY_USAGE = `memory (imported memory: what assistants know about you, global or per project):
  prompt            Print the export prompt to paste into any assistant
                    [--scope global|project] [--paste] [--harness <id>]
  import            Import a pasted export (JSON or a reply containing a \`\`\`json block)
                    from stdin or --file <path> [--harness <id>]
  list              Show memories [--scope global|project|all] [--pending]
  approve <id>      Approve a pending instruction/identity entry (--all for every pending one)
  reject <id>       Reject a memory (it stays rejected on re-import)
  export            Print approved/active memory [--format md|json] [--scope global|project|all]

ingest import       Import a session digest (ingest_context JSON) from stdin or --file <path>
`;

interface MemoryArgs {
  root?: string;
  configPath?: string;
  scope?: MemoryListScope;
  pending: boolean;
  paste: boolean;
  all: boolean;
  file?: string;
  harness?: string;
  format: "md" | "json";
  positional: string[];
}

function value(argv: string[], i: number, flag: string): string {
  const v = argv[i];
  if (!v || v.startsWith("--")) throw new Error(`${flag} requires an argument`);
  return v;
}

export function parseMemoryArgs(argv: string[]): MemoryArgs {
  const args: MemoryArgs = { pending: false, paste: false, all: false, format: "md", positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    switch (arg) {
      case "--root":
        args.root = value(argv, ++i, arg);
        break;
      case "--config":
        args.configPath = value(argv, ++i, arg);
        break;
      case "--scope": {
        const v = value(argv, ++i, arg);
        if (v !== "global" && v !== "project" && v !== "all") throw new Error('--scope must be "global", "project", or "all"');
        args.scope = v;
        break;
      }
      case "--format": {
        const v = value(argv, ++i, arg);
        if (v !== "md" && v !== "json") throw new Error('--format must be "md" or "json"');
        args.format = v;
        break;
      }
      case "--file":
        args.file = value(argv, ++i, arg);
        break;
      case "--harness":
        args.harness = value(argv, ++i, arg);
        break;
      case "--pending":
        args.pending = true;
        break;
      case "--paste":
        args.paste = true;
        break;
      case "--all":
        args.all = true;
        break;
      default:
        if (arg.startsWith("--")) throw new Error(`unknown option "${arg}" (see --help)`);
        args.positional.push(arg);
    }
  }
  return args;
}

function readInput(file: string | undefined): string {
  if (file) return readFileSync(path.resolve(file), "utf8");
  if (process.stdin.isTTY) {
    throw new Error("pipe the export in (e.g. pbpaste | ctxfile memory import) or pass --file <path>");
  }
  return readFileSync(0, "utf8");
}

function parseId(raw: string | undefined, command: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new Error(`${command} requires a numeric id from 'ctxfile memory list'`);
  return id;
}

function formatRecord(r: MemoryRecord): string {
  const flags = [r.status === "pending" ? "[pending]" : null, r.verbatim ? "verbatim" : null, r.origin]
    .filter(Boolean)
    .join(" ");
  const text = r.text.replace(/\s+/g, " ");
  return `#${r.id}  ${r.scope.padEnd(7)}  ${r.category.padEnd(11)}  ${flags}  ${r.date ?? "unknown"}  ${text.length > 100 ? `${text.slice(0, 99)}…` : text}  (${r.sources.join(", ")})\n`;
}

function withStore<T>(args: MemoryArgs, fn: (store: IngestStore, root: string) => T): T {
  const config = loadConfig({ root: args.root, configPath: args.configPath });
  const store = new IngestStore(path.join(config.cacheDir, "ingest.db"));
  try {
    return fn(store, config.root);
  } finally {
    store.close();
  }
}

export function runMemory(argv: string[]): void {
  const sub = argv[0];
  const args = parseMemoryArgs(argv.slice(1));

  if (sub === "prompt") {
    const scope: MemoryScope = args.scope === "project" ? "project" : "global";
    const root = path.resolve(args.root ?? process.cwd());
    process.stdout.write(
      `${memoryImportPrompt({ scope, mode: args.paste ? "paste" : "mcp", harness: args.harness, projectName: path.basename(root) })}\n`
    );
    return;
  }

  if (sub === "import") {
    const raw = extractJsonPayload(readInput(args.file));
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("the export must be a JSON object");
    const parsed = memoryInputSchema.safeParse(withMemoryDefaults(raw as Record<string, unknown>, args.harness ?? "paste"));
    if (!parsed.success) throw new Error(formatMemoryErrors(parsed.error, "memory import"));
    withStore(args, (store, root) => {
      const result = store.memory.import(root, parsed.data);
      console.error(`ctxfile: ${describeMemoryImport(result, parsed.data.scope, parsed.data.complete, parsed.data.part, "human")}`);
    });
    return;
  }

  if (sub === "list" || sub === undefined) {
    withStore(args, (store, root) => {
      const records = store.memory.list(root, { scope: args.scope ?? "all", status: args.pending ? "pending" : "all" });
      if (records.length === 0) {
        console.error(
          args.pending
            ? "ctxfile: nothing awaits approval"
            : "ctxfile: no memories yet (run 'ctxfile memory prompt' and paste it into any assistant)"
        );
        return;
      }
      for (const record of records) process.stdout.write(formatRecord(record));
    });
    return;
  }

  if (sub === "approve") {
    withStore(args, (store, root) => {
      if (args.all) {
        const n = store.memory.approveAllPending(root);
        console.error(`ctxfile: approved ${n} pending memor${n === 1 ? "y" : "ies"}`);
        return;
      }
      const id = parseId(args.positional[0], "memory approve");
      console.error(
        store.memory.approve(root, id) ? `ctxfile: approved memory #${id}` : `ctxfile: no pending memory #${id} visible from this project`
      );
    });
    return;
  }

  if (sub === "reject" || sub === "rm") {
    withStore(args, (store, root) => {
      const id = parseId(args.positional[0], "memory reject");
      console.error(
        store.memory.reject(root, id)
          ? `ctxfile: rejected memory #${id} (re-imports of it stay rejected)`
          : `ctxfile: no memory #${id} visible from this project`
      );
    });
    return;
  }

  if (sub === "export") {
    withStore(args, (store, root) => {
      const scope = args.scope ?? "all";
      const records = store.memory.list(root, { scope, status: "active" });
      if (args.format === "json") {
        process.stdout.write(
          `${JSON.stringify({ ctxfile_memory_export: "1", generated_at: new Date().toISOString(), memories: records }, null, 2)}\n`
        );
        return;
      }
      process.stdout.write(
        renderMemoryMarkdown([
          { title: "Global (about me)", records: records.filter((r) => r.scope === "global") },
          { title: `Project: ${path.basename(root)}`, records: records.filter((r) => r.scope === "project") },
        ])
      );
    });
    return;
  }

  throw new Error('memory requires "prompt", "import", "list", "approve", "reject", or "export" (see --help)');
}

/** `ctxfile ingest import`: the paste door for session digests. */
export function runIngestImport(argv: string[]): void {
  const args = parseMemoryArgs(argv);
  const raw = extractJsonPayload(readInput(args.file));
  const parsed = ingestInputSchema.safeParse(raw);
  if (!parsed.success) throw new Error(formatIngestErrors(parsed.error, "ingest import"));
  withStore(args, (store, root) => {
    const result = store.ingest(root, parsed.data, Date.now(), "ingest_context");
    const thread = result.threadTitle ? ` to thread "${result.threadTitle}"` : "";
    console.error(`ctxfile: imported session ${result.sessionId} (rev ${result.revision}, ${result.action})${thread}`);
    if (result.directives) {
      console.error(`ctxfile: ${result.directives.pending} user directive(s) staged as pending instructions ('ctxfile memory list --pending')`);
    }
  });
}
