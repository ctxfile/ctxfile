import { readFileSync } from "node:fs";
import path from "node:path";
import { loadOrCreateApprovalKey } from "./approval-keys.js";
import { loadConfig, type ResolvedConfig } from "./config.js";
import { IngestStore } from "./storage/ingest-store.js";
import { readTasksSwitch, writeTasksSwitch } from "./storage/task-store.js";
import { addPushTarget, listPushTargets, removePushTarget, testPushTarget, type PushTargetKind } from "./sync/push-targets.js";
import { loadVaultConfig, type VaultConfig } from "./sync/vault.js";
import {
  A2A_TASK_STATE,
  formatTaskErrors,
  isOpenState,
  isSideEffect,
  isTaskApproved,
  postTaskSchema,
  provenanceLine,
  renderTaskForAgent,
  sanitizeTaskText,
  TASK_CAPABILITIES,
  type HumanAction,
  type HumanContext,
  type TaskCapability,
  type TaskRecord,
} from "./tasks.js";

/**
 * `ctxfile tasks ...`: the human side of cross-agent tasks. Lists and detail
 * go to stdout; status lines go to stderr. Never the MCP path.
 *
 * Anything that widens what agents may do (approving a task or an effect,
 * posting a task as yourself, unfreezing, turning tasks back on) asks for a
 * yes on an interactive terminal. An agent's shell tool is not a terminal,
 * so an agent cannot approve its own work through this CLI.
 */

export const TASKS_USAGE = `tasks (cross-agent tasks: agents leave work for each other; you approve):
  (no subcommand)   List open tasks for this project [--all] [--thread <title>]
  show <id>         Show one task in full, as the assignee will see it
  post              Post a task as yourself (approved at once; asks to confirm)
                    --thread <t> --title <t> --to <client|any> [--cap <c>]... [--days <n>]
                    task text from --text <t>, --file <path>, or stdin
  approve <id>      Approve an agent's proposal [--grant <cap,cap>] (asks to confirm)
  reject <id>       Reject a task [--reason <r>]
  cancel <id>       Cancel a task [--reason <r>]
  approve-effect <id>  Approve the exact side effect a task is waiting on (asks to confirm)
  deny-effect <id>  Deny it [--reason <r>]
  freeze <thread>   Cancel a thread's open tasks and block new ones ('--off' lifts it)
  off | on          Turn every task tool off, or back on
  status            Show whether tasks are on, and counts
  target add        (Sync) Wake an agent when a task is approved for it (asks to confirm):
                    --kind webhook --url <https-url> [--to <client|any>] [--name <n>]
                      prints a whsec_ signing secret once (Standard Webhooks)
                    --kind claude-code-routine --url <routine fire URL> --token-env <VAR> [--to claude-code]
  target list | rm <id> | test <id>
`;

interface TaskArgs {
  root?: string;
  configPath?: string;
  all: boolean;
  off: boolean;
  thread?: string;
  title?: string;
  to?: string;
  caps: string[];
  grant?: string[];
  days?: number;
  text?: string;
  file?: string;
  reason?: string;
  kind?: string;
  url?: string;
  name?: string;
  tokenEnv?: string;
  positional: string[];
}

function value(argv: string[], i: number, flag: string): string {
  const v = argv[i];
  if (v === undefined || v.startsWith("--")) throw new Error(`${flag} requires an argument`);
  return v;
}

export function parseTaskArgs(argv: string[]): TaskArgs {
  const args: TaskArgs = { all: false, off: false, caps: [], positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    switch (arg) {
      case "--root":
        args.root = value(argv, ++i, arg);
        break;
      case "--config":
        args.configPath = value(argv, ++i, arg);
        break;
      case "--all":
        args.all = true;
        break;
      case "--off":
        args.off = true;
        break;
      case "--thread":
        args.thread = value(argv, ++i, arg);
        break;
      case "--title":
        args.title = value(argv, ++i, arg);
        break;
      case "--to":
        args.to = value(argv, ++i, arg);
        break;
      case "--cap":
        args.caps.push(value(argv, ++i, arg));
        break;
      case "--grant":
        args.grant = value(argv, ++i, arg)
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        break;
      case "--days": {
        const days = Number(value(argv, ++i, arg));
        if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error("--days must be an integer from 1 to 30");
        args.days = days;
        break;
      }
      case "--text":
        args.text = value(argv, ++i, arg);
        break;
      case "--file":
        args.file = value(argv, ++i, arg);
        break;
      case "--reason":
        args.reason = value(argv, ++i, arg);
        break;
      case "--kind":
        args.kind = value(argv, ++i, arg);
        break;
      case "--url":
        args.url = value(argv, ++i, arg);
        break;
      case "--name":
        args.name = value(argv, ++i, arg);
        break;
      case "--token-env":
        args.tokenEnv = value(argv, ++i, arg);
        break;
      default:
        if (arg.startsWith("--")) throw new Error(`unknown option "${arg}" (see 'ctxfile --help')`);
        args.positional.push(arg);
    }
  }
  return args;
}

export interface TasksCliDeps {
  /** Vault config override (tests); defaults to ~/.ctxfile/vault.json. */
  vault?: VaultConfig | null;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  /** Asks a yes/no question on an interactive terminal; throws when there is none. */
  confirm?: (question: string) => Promise<boolean>;
  /** Reads the task text from stdin when neither --text nor --file is given. */
  readStdin?: () => string;
  now?: () => number;
  out?: (text: string) => void;
}

/** Interactive-only yes/no. Not a TTY means a script or an agent's shell. */
export async function confirmOnTerminal(question: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new Error(
      "this needs an interactive terminal: approvals are for people, not scripts or agents. Use the dashboard ('ctxfile ui') or run it yourself."
    );
  }
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function describeForHuman(task: TaskRecord, now: number): string {
  const lines = [
    `${task.task_id}  ${task.state} (A2A ${A2A_TASK_STATE[task.state]})${isTaskApproved(task, now) ? "  approved" : task.origin === "agent" ? "  NOT approved" : ""}`,
    `  title:    ${sanitizeTaskText(task.title)}`,
    `  thread:   ${task.thread}`,
    `  for:      ${task.assignee}`,
    `  ${provenanceLine(task, now)}`,
    `  asks for: ${task.capabilities.join(", ") || "nothing"}`,
    `  expires:  ${iso(task.expires_at)}`,
  ];
  if (task.approval) lines.push(`  granted:  ${task.approval.granted.join(", ") || "read-only work"}${task.approval.key_id ? `  (signed, key ${task.approval.key_id})` : ""}`);
  if (task.lease) lines.push(`  claimed:  by ${task.lease.harness} until ${iso(task.lease.expires_at)}`);
  if (task.pending_effect) {
    lines.push(
      `  WAITING ON YOU: ${task.pending_effect.capability} · ${sanitizeTaskText(task.pending_effect.summary)}`,
      ...sanitizeTaskText(task.pending_effect.details)
        .split("\n")
        .map((l) => `    | ${l}`)
    );
  }
  if (task.result) lines.push(`  result:   ${sanitizeTaskText(task.result.summary)}`);
  if (task.reason) lines.push(`  reason:   ${sanitizeTaskText(task.reason)}`);
  return lines.join("\n");
}

function parseCaps(raw: string[], flag: string): TaskCapability[] {
  const caps: TaskCapability[] = [];
  for (const cap of raw) {
    if (!(TASK_CAPABILITIES as readonly string[]).includes(cap)) {
      throw new Error(`${flag} "${cap}" is not a capability; use one of ${TASK_CAPABILITIES.join(", ")}`);
    }
    caps.push(cap as TaskCapability);
  }
  return caps;
}

function openStore(config: ResolvedConfig): IngestStore {
  return new IngestStore(path.join(config.cacheDir, "ingest.db"));
}

export async function runTasks(argv: string[], deps: TasksCliDeps = {}): Promise<void> {
  const sub = argv[0] && !argv[0].startsWith("--") ? argv[0] : "list";
  const args = parseTaskArgs(argv[0] === sub ? argv.slice(1) : argv);
  const config = loadConfig({ root: args.root, configPath: args.configPath });
  const now = (deps.now ?? Date.now)();
  const out = deps.out ?? ((text: string) => void process.stdout.write(`${text}\n`));
  const confirm = deps.confirm ?? confirmOnTerminal;

  if (sub === "target") {
    await runTarget(args, deps, confirm, out);
    return;
  }

  if (sub === "off" || sub === "on") {
    if (sub === "on" && !(await confirm("Turn cross-agent tasks back on for every agent?"))) {
      console.error("ctxfile: tasks stay off");
      return;
    }
    writeTasksSwitch(config.cacheDir, { off: sub === "off", at: iso(now) });
    console.error(sub === "off" ? "ctxfile: tasks are OFF everywhere ('ctxfile tasks on' turns them back on)" : "ctxfile: tasks are on");
    return;
  }

  const store = openStore(config);
  try {
    const human = (via: HumanContext["via"]): HumanContext => {
      const key = loadOrCreateApprovalKey(config.cacheDir);
      return { now, via, signer: { key_id: key.keyId, public_key: key.publicKey, sign: key.sign } };
    };
    const requireTask = (): TaskRecord => {
      const id = args.positional[0];
      if (!id) throw new Error(`tasks ${sub} requires a task id (see 'ctxfile tasks')`);
      const task = store.tasks.get(config.root, id, now);
      if (!task) throw new Error(`no task ${id} in this project`);
      return task;
    };
    const decide = (task: TaskRecord, action: HumanAction, done: string): void => {
      const result = store.tasks.humanAction(config.root, task.task_id, action, human("cli"));
      if (!result.ok) throw new Error(result.error);
      console.error(`ctxfile: ${done} (${result.task.task_id} is now ${result.task.state})`);
    };

    switch (sub) {
      case "list": {
        const switchState = readTasksSwitch(config.cacheDir);
        if (switchState.off) console.error("ctxfile: tasks are OFF ('ctxfile tasks on' to re-enable)");
        const tasks = store.tasks
          .list(config.root, now)
          .filter((t) => args.all || isOpenState(t.state))
          .filter((t) => !args.thread || t.thread.toLowerCase() === args.thread.toLowerCase());
        if (tasks.length === 0) {
          console.error(args.all ? "ctxfile: no tasks for this project" : "ctxfile: no open tasks for this project (--all shows finished ones)");
          return;
        }
        for (const task of tasks) out(describeForHuman(task, now));
        return;
      }
      case "show": {
        const task = requireTask();
        out(describeForHuman(task, now));
        out("");
        out("What the assignee sees:");
        out(renderTaskForAgent(task, now));
        out("");
        out("History:");
        for (const h of task.history) out(`  ${iso(h.at)}  ${h.action} -> ${h.state}  (${h.actor})`);
        return;
      }
      case "post": {
        let text = args.text;
        if (text === undefined && args.file) text = readFileSync(args.file, "utf8");
        if (text === undefined) text = (deps.readStdin ?? (() => readFileSync(0, "utf8")))();
        const parsed = postTaskSchema.safeParse({
          thread: args.thread,
          title: args.title,
          instructions: text,
          assignee: args.to,
          capabilities: args.caps.length > 0 ? parseCaps(args.caps, "--cap") : undefined,
          expires_in_days: args.days,
        });
        if (!parsed.success) throw new Error(formatTaskErrors(parsed.error, "tasks post"));
        const sideEffects = parsed.data.capabilities.filter(isSideEffect);
        const ok = await confirm(
          `Post "${parsed.data.title}" for ${parsed.data.assignee} on thread "${parsed.data.thread}" as you (approved at once)?` +
            (sideEffects.length > 0 ? ` Side effects (${sideEffects.join(", ")}) will still ask you per effect.` : "")
        );
        if (!ok) {
          console.error("ctxfile: not posted");
          return;
        }
        const result = store.tasks.post(
          config.root,
          parsed.data,
          { kind: "human", harness: null, door: "cli", client: null, token: null },
          { now, defaultTtlDays: config.tasks.defaultTtlDays }
        );
        if (!result.ok) throw new Error(result.error);
        // Sign it too, so a relay can verify it came from this device before
        // waking an agent for it (push trusts signatures, not origin labels).
        const signed = store.tasks.humanAction(config.root, result.task.task_id, { kind: "approve" }, human("cli"));
        if (!signed.ok) throw new Error(signed.error);
        console.error(`ctxfile: posted ${result.task.task_id} for ${result.task.assignee} on thread "${result.task.thread}"`);
        return;
      }
      case "approve": {
        const task = requireTask();
        const requested = task.capabilities;
        const granted = args.grant ? parseCaps(args.grant, "--grant") : requested.filter((c) => !isSideEffect(c));
        out(describeForHuman(task, now));
        out("");
        out("Task text (written by an agent):");
        out(sanitizeTaskText(task.instructions));
        out("");
        if (!(await confirm(`Approve ${task.task_id} and grant ${granted.join(", ") || "read-only work"}?`))) {
          console.error("ctxfile: not approved");
          return;
        }
        decide(task, { kind: "approve", granted }, "approved and signed with this device's approval key");
        return;
      }
      case "reject":
        decide(requireTask(), { kind: "reject", reason: args.reason }, "rejected");
        return;
      case "cancel":
        decide(requireTask(), { kind: "cancel", reason: args.reason }, "canceled");
        return;
      case "approve-effect": {
        const task = requireTask();
        if (!task.pending_effect) throw new Error(`${task.task_id} is not waiting on an effect`);
        out(describeForHuman(task, now));
        if (!(await confirm(`Approve exactly this ${task.pending_effect.capability} effect, once?`))) {
          console.error("ctxfile: not approved");
          return;
        }
        decide(task, { kind: "approve_effect" }, "effect approved");
        return;
      }
      case "deny-effect":
        decide(requireTask(), { kind: "deny_effect", reason: args.reason }, "effect denied");
        return;
      case "freeze": {
        const thread = args.positional.join(" ").trim();
        if (!thread) throw new Error("tasks freeze requires a thread title");
        if (args.off && !(await confirm(`Allow tasks on thread "${thread}" again?`))) {
          console.error("ctxfile: thread stays frozen");
          return;
        }
        const canceled = store.tasks.freezeThread(config.root, thread, !args.off, human("cli"));
        if (canceled === null) throw new Error(`no thread "${thread}" in this project`);
        console.error(
          args.off
            ? `ctxfile: thread "${thread}" accepts tasks again`
            : `ctxfile: thread "${thread}" frozen for tasks; ${canceled} open task${canceled === 1 ? "" : "s"} canceled`
        );
        return;
      }
      case "status": {
        const counts = store.tasks.counts(config.root, now);
        out(`tasks: ${readTasksSwitch(config.cacheDir).off ? "OFF" : "on"}  ·  proposals: ${config.tasks.proposals}`);
        out(`open: ${counts.open}  ·  unapproved proposals: ${counts.proposals}  ·  waiting on your yes: ${counts.awaitingApproval}`);
        return;
      }
      default:
        throw new Error(`unknown tasks subcommand "${sub}" (see 'ctxfile --help')`);
    }
  } finally {
    store.close();
  }
}

/** `ctxfile tasks target ...`: push targets on the vault's relay (Sync). */
async function runTarget(
  args: TaskArgs,
  deps: TasksCliDeps,
  confirm: (question: string) => Promise<boolean>,
  out: (text: string) => void
): Promise<void> {
  const action = args.positional[0];
  const vault = deps.vault === undefined ? loadVaultConfig() : deps.vault;
  if (!vault) throw new Error("push needs a Sync vault; run 'ctxfile vault create' or 'ctxfile vault join' first");
  if (vault.mode !== "standard") throw new Error("push needs a standard vault: a strict vault's relay cannot read a task to decide whether to wake anyone");
  const fetchImpl = deps.fetchImpl ?? fetch;
  switch (action) {
    case "add": {
      const kind = args.kind as PushTargetKind | undefined;
      if (kind !== "webhook" && kind !== "claude-code-routine") throw new Error('target add requires --kind webhook or --kind claude-code-routine');
      if (!args.url) throw new Error("target add requires --url");
      let token: string | undefined;
      if (kind === "claude-code-routine") {
        if (!args.tokenEnv) throw new Error("a routine target needs --token-env <VAR>, the env var holding the routine's API token (never put it on the command line)");
        token = (deps.env ?? process.env)[args.tokenEnv]?.trim();
        if (!token) throw new Error(`env var ${args.tokenEnv} is empty`);
      }
      const assignee = args.to ?? (kind === "claude-code-routine" ? "claude-code" : "any");
      if (!(await confirm(`Let the relay wake ${args.url} when a task for ${assignee} is approved?`))) {
        console.error("ctxfile: no target added");
        return;
      }
      const { target, secret } = await addPushTarget(vault, { kind, url: args.url, name: args.name, assignee, token }, fetchImpl);
      console.error(`ctxfile: push target ${target.id} added (${target.kind}, wakes for ${target.assignee})`);
      if (secret) {
        console.error("  Signing secret (shown once; verify the webhook-signature header with it):");
        out(secret);
      }
      return;
    }
    case "list": {
      const targets = await listPushTargets(vault, fetchImpl);
      if (targets.length === 0) {
        console.error("ctxfile: no push targets ('ctxfile tasks target add ...')");
        return;
      }
      for (const t of targets) {
        out(`${t.id}  ${t.kind}  "${t.name}"  for ${t.assignee}  ${t.url}  last: ${t.last_status ?? "never"}`);
      }
      return;
    }
    case "rm": {
      const id = args.positional[1];
      if (!id) throw new Error("target rm requires a target id");
      console.error((await removePushTarget(vault, id, fetchImpl)) ? `ctxfile: target ${id} removed` : `ctxfile: no target ${id}`);
      return;
    }
    case "test": {
      const id = args.positional[1];
      if (!id) throw new Error("target test requires a target id");
      const result = await testPushTarget(vault, id, fetchImpl);
      console.error(result.ok ? `ctxfile: test delivered (HTTP ${result.status})` : `ctxfile: test failed: ${result.error ?? `HTTP ${result.status}`}`);
      return;
    }
    default:
      throw new Error('tasks target requires "add", "list", "rm <id>", or "test <id>"');
  }
}
