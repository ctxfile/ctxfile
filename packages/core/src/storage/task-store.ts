import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { redactContent } from "../redact.js";
import type { SyncEntry } from "../sync/client.js";
import type { TaskSyncPayload } from "../sync/payload.js";
import {
  applyAgentAction,
  applyHumanAction,
  createTaskRecord,
  isOpenState,
  MAX_OPEN_TASKS_PER_PROJECT,
  MAX_OPEN_TASKS_PER_THREAD,
  normalizeTask,
  parseTaskRecord,
  type AgentContext,
  type HumanAction,
  type HumanContext,
  type PostTaskInput,
  type TaskActor,
  type TaskRecord,
  type TaskTransition,
  type UpdateTaskInput,
} from "../tasks.js";

/**
 * Persistence for cross-agent tasks, in the same SQLite file as threads and
 * sessions (one connection, one WAL). Each task is one row: indexed columns
 * for the queries, plus the full record as JSON (the exact shape that syncs).
 *
 * Every state change runs inside BEGIN IMMEDIATE, so two agents in two
 * processes on one machine (say Claude Code and Cursor, both on stdio) can
 * never both win a claim. Across devices, the relay arbitrates with
 * compare-and-set at sync time: `synced_version` is the relay version this
 * row last agreed with.
 */

export type TaskPostResult = { ok: true; task: TaskRecord } | { ok: false; error: string };

interface TaskRow {
  root: string;
  task_id: string;
  doc: string;
  synced_version: number | null;
  updated_at: number;
}

const textEncoder = new TextEncoder();

function redact(text: string): string {
  return redactContent(text).text;
}

export function redactPostInput(input: PostTaskInput): PostTaskInput {
  return {
    ...input,
    thread: redact(input.thread),
    title: redact(input.title),
    instructions: redact(input.instructions),
    input_artifacts: input.input_artifacts.map((a) => ({ ref: redact(a.ref), role: redact(a.role) })),
  };
}

export function redactUpdateInput(input: UpdateTaskInput): UpdateTaskInput {
  return {
    ...input,
    reason: input.reason ? redact(input.reason) : undefined,
    result: input.result
      ? {
          summary: redact(input.result.summary),
          artifacts: input.result.artifacts.map((a) => ({ ref: redact(a.ref), role: redact(a.role) })),
        }
      : undefined,
    effect: input.effect
      ? { capability: input.effect.capability, summary: redact(input.effect.summary), details: redact(input.effect.details) }
      : undefined,
  };
}

/** The global kill switch (`ctxfile tasks off`): a small state file beside
    behavior.json, read by every door before any task tool runs. */
export interface TasksSwitchState {
  off: boolean;
  at?: string;
}

function switchPath(cacheDir: string): string {
  return path.join(cacheDir, "tasks.json");
}

export function readTasksSwitch(cacheDir: string): TasksSwitchState {
  try {
    const parsed = JSON.parse(readFileSync(switchPath(cacheDir), "utf8")) as Partial<TasksSwitchState>;
    return { off: parsed.off === true, at: typeof parsed.at === "string" ? parsed.at : undefined };
  } catch {
    return { off: false };
  }
}

export function writeTasksSwitch(cacheDir: string, state: TasksSwitchState): void {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(switchPath(cacheDir), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function tasksSwitchExists(cacheDir: string): boolean {
  return existsSync(switchPath(cacheDir));
}

export class TaskStore {
  constructor(
    private readonly db: Database.Database,
    private readonly ensureThread: (root: string, title: string, now: number) => { id: number; title: string }
  ) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        root TEXT NOT NULL,
        task_id TEXT NOT NULL,
        thread_title TEXT NOT NULL,
        state TEXT NOT NULL,
        assignee TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        synced_version INTEGER,
        doc TEXT NOT NULL,
        PRIMARY KEY (root, task_id)
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_root_state ON tasks (root, state, updated_at DESC);
    `);
    const threadColumns = new Set(
      (this.db.prepare("PRAGMA table_info(threads)").all() as { name: string }[]).map((c) => c.name)
    );
    if (!threadColumns.has("tasks_frozen")) {
      this.db.exec("ALTER TABLE threads ADD COLUMN tasks_frozen INTEGER NOT NULL DEFAULT 0");
    }
  }

  private readRow(root: string, taskId: string): TaskRow | undefined {
    return this.db.prepare("SELECT root, task_id, doc, synced_version, updated_at FROM tasks WHERE root = ? AND task_id = ?").get(root, taskId) as
      | TaskRow
      | undefined;
  }

  private write(root: string, task: TaskRecord): void {
    this.db
      .prepare(
        `INSERT INTO tasks (root, task_id, thread_title, state, assignee, updated_at, deleted, doc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (root, task_id) DO UPDATE SET thread_title = excluded.thread_title, state = excluded.state,
           assignee = excluded.assignee, updated_at = excluded.updated_at, deleted = excluded.deleted, doc = excluded.doc`
      )
      .run(root, task.task_id, task.thread, task.state, task.assignee, task.updated_at, task.deleted ? 1 : 0, JSON.stringify(task));
  }

  private parse(row: TaskRow): TaskRecord | null {
    try {
      return parseTaskRecord(JSON.parse(row.doc));
    } catch {
      return null;
    }
  }

  /** Whether new tasks are blocked on this thread (`ctxfile tasks freeze`). */
  isFrozen(root: string, threadTitle: string): boolean {
    const row = this.db
      .prepare("SELECT tasks_frozen FROM threads WHERE root = ? AND lower(title) = lower(?) AND deleted = 0")
      .get(root, threadTitle) as { tasks_frozen: number } | undefined;
    return row?.tasks_frozen === 1;
  }

  /** Posts a task (redacted at write, like every other ingested text). */
  post(root: string, input: PostTaskInput, postedBy: TaskActor, options: { now?: number; defaultTtlDays?: number } = {}): TaskPostResult {
    const now = options.now ?? Date.now();
    const clean = redactPostInput(input);
    return this.db.transaction((): TaskPostResult => {
      if (this.isFrozen(root, clean.thread)) {
        return { ok: false, error: `thread "${clean.thread}" is frozen for tasks; the user can unfreeze it with 'ctxfile tasks freeze <thread> --off'` };
      }
      const open = this.list(root, now).filter((t) => isOpenState(t.state));
      const onThread = open.filter((t) => t.thread.toLowerCase() === clean.thread.toLowerCase()).length;
      if (onThread >= MAX_OPEN_TASKS_PER_THREAD) {
        return { ok: false, error: `thread "${clean.thread}" already has ${onThread} open tasks (limit ${MAX_OPEN_TASKS_PER_THREAD}); finish or cancel some first` };
      }
      if (open.length >= MAX_OPEN_TASKS_PER_PROJECT) {
        return { ok: false, error: `this project already has ${open.length} open tasks (limit ${MAX_OPEN_TASKS_PER_PROJECT}); finish or cancel some first` };
      }
      const thread = this.ensureThread(root, clean.thread, now);
      const task = createTaskRecord({ ...clean, thread: thread.title }, { now, postedBy, defaultTtlDays: options.defaultTtlDays });
      this.write(root, task);
      this.touchThread(root, thread.id, now);
      return { ok: true, task };
    }).immediate();
  }

  private touchThread(root: string, threadId: number, now: number): void {
    this.db.prepare("UPDATE threads SET last_active = MAX(last_active, ?) WHERE root = ? AND id = ?").run(now, root, threadId);
  }

  /** One task, with lazy expiry applied (and persisted). */
  get(root: string, taskId: string, now = Date.now()): TaskRecord | null {
    const row = this.readRow(root, taskId);
    if (!row) return null;
    const task = this.parse(row);
    if (!task || task.deleted) return null;
    const normalized = normalizeTask(task, now);
    if (normalized !== task) this.write(root, normalized);
    return normalized;
  }

  /** Every live task for this project, newest first, lazily normalized. */
  list(root: string, now = Date.now()): TaskRecord[] {
    const rows = this.db
      .prepare("SELECT root, task_id, doc, synced_version, updated_at FROM tasks WHERE root = ? AND deleted = 0 ORDER BY updated_at DESC")
      .all(root) as TaskRow[];
    const out: TaskRecord[] = [];
    for (const row of rows) {
      const task = this.parse(row);
      if (!task || task.deleted) continue;
      const normalized = normalizeTask(task, now);
      if (normalized !== task) this.write(root, normalized);
      out.push(normalized);
    }
    return out;
  }

  /** An agent's update_task, atomic across processes. */
  agentAction(root: string, input: UpdateTaskInput, ctx: AgentContext): TaskTransition | { ok: false; code: "not_found"; error: string } {
    const clean = redactUpdateInput(input);
    return this.db.transaction(() => {
      const row = this.readRow(root, clean.task_id);
      const task = row ? this.parse(row) : null;
      if (!task || task.deleted) {
        return { ok: false as const, code: "not_found" as const, error: `no task ${clean.task_id} in this project; call list_tasks for valid ids` };
      }
      if (clean.action === "claim" && this.isFrozen(root, task.thread)) {
        return { ok: false as const, code: "forbidden" as const, error: `thread "${task.thread}" is frozen for tasks by the user` };
      }
      const result = applyAgentAction(task, clean, ctx);
      if (result.ok && result.task !== task) this.write(root, result.task);
      return result;
    }).immediate();
  }

  /** The dashboard's and CLI's approve / reject / cancel / effect decisions. */
  humanAction(root: string, taskId: string, action: HumanAction, ctx: HumanContext): TaskTransition | { ok: false; code: "not_found"; error: string } {
    const clean: HumanAction =
      action.kind === "reject" || action.kind === "cancel" || action.kind === "deny_effect"
        ? { ...action, reason: action.reason ? redact(action.reason) : undefined }
        : action;
    return this.db.transaction(() => {
      const row = this.readRow(root, taskId);
      const task = row ? this.parse(row) : null;
      if (!task || task.deleted) return { ok: false as const, code: "not_found" as const, error: `no task ${taskId} in this project` };
      const result = applyHumanAction(task, clean, ctx);
      if (result.ok && result.task !== task) this.write(root, result.task);
      return result;
    }).immediate();
  }

  /** Freezing a thread cancels its open tasks and blocks new posts and
      claims; unfreezing only lifts the block. Returns the canceled count, or
      null when the thread does not exist. */
  freezeThread(root: string, threadTitle: string, frozen: boolean, ctx: HumanContext): number | null {
    return this.db.transaction(() => {
      const thread = this.db
        .prepare("SELECT id, title FROM threads WHERE root = ? AND lower(title) = lower(?) AND deleted = 0")
        .get(root, threadTitle) as { id: number; title: string } | undefined;
      if (!thread) return null;
      // Advance last_active so the flag carries a newer clock and syncs.
      this.db
        .prepare("UPDATE threads SET tasks_frozen = ?, last_active = MAX(last_active + 1, ?) WHERE id = ?")
        .run(frozen ? 1 : 0, ctx.now, thread.id);
      if (!frozen) return 0;
      let canceled = 0;
      for (const task of this.list(root, ctx.now)) {
        if (task.thread.toLowerCase() !== thread.title.toLowerCase() || !isOpenState(task.state)) continue;
        const result = applyHumanAction(task, { kind: "cancel", reason: "thread frozen by the user" }, ctx);
        if (result.ok) {
          this.write(root, result.task);
          canceled += 1;
        }
      }
      return canceled;
    }).immediate();
  }

  // -------------------------------------------------------------------------
  // Sync: tasks ride the same encrypted blob mailbox as sessions, with one
  // difference. Sessions converge by last-write-wins; a task's state must not
  // (two devices could both "win" a claim). So each task push names the relay
  // version it was based on, the relay refuses a stale one with 409, and on
  // pull the relay's newer version always wins over local unpushed changes.
  // -------------------------------------------------------------------------

  exportSyncEntries(root: string): SyncEntry[] {
    const rows = this.db.prepare("SELECT root, task_id, doc, synced_version, updated_at FROM tasks WHERE root = ?").all(root) as TaskRow[];
    const entries: SyncEntry[] = [];
    for (const row of rows) {
      const task = this.parse(row);
      if (!task) continue;
      const payload: TaskSyncPayload = { kind: "task", ...task };
      entries.push({
        naturalId: `task:${task.task_id}`,
        version: task.updated_at,
        deleted: task.deleted,
        payload: textEncoder.encode(JSON.stringify(payload)),
        // A task never pushed must not exist on the relay yet (null).
        baseVersion: row.synced_version,
      });
    }
    return entries;
  }

  /** Records that the relay now holds exactly this version. */
  markSynced(root: string, taskId: string, version: number): void {
    this.db.prepare("UPDATE tasks SET synced_version = ? WHERE root = ? AND task_id = ?").run(version, root, taskId);
  }

  /** Applies a task payload from the relay. The relay is the arbiter: any
      version newer than the one this row last agreed with replaces it, even
      over local changes that were never pushed (they lost the race). Returns
      1 when local state changed. */
  applySyncPayload(root: string, payload: TaskSyncPayload): number {
    const task = parseTaskRecord(payload);
    if (!task) return 0;
    const row = this.readRow(root, task.task_id);
    const remoteVersion = task.updated_at;
    if (row) {
      const agreed = row.synced_version ?? -1;
      if (remoteVersion <= agreed) return 0;
      if (row.updated_at > agreed && row.updated_at !== remoteVersion) {
        console.error(`ctxfile sync: task ${task.task_id} changed on another device first; its version replaces the local one`);
      }
    }
    // Create the thread if this device has never seen it, but never bump an
    // existing thread's clock here: that would re-push the thread on the next
    // sync for no change at all.
    const threadExists = this.db
      .prepare("SELECT 1 FROM threads WHERE root = ? AND lower(title) = lower(?)")
      .get(root, task.thread);
    if (!threadExists) this.ensureThread(root, task.thread, task.created_at);
    this.write(root, task);
    this.markSynced(root, task.task_id, remoteVersion);
    return 1;
  }

  /** Counts for the dashboard and status lines. */
  counts(root: string, now = Date.now()): { open: number; proposals: number; awaitingApproval: number } {
    const tasks = this.list(root, now);
    return {
      open: tasks.filter((t) => isOpenState(t.state)).length,
      proposals: tasks.filter((t) => t.state === "proposed").length,
      awaitingApproval: tasks.filter((t) => t.state === "awaiting_approval").length,
    };
  }
}
