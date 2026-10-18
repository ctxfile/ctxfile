import { verifyTaskApproval } from "../approval-keys.js";
import {
  A2A_TASK_STATE,
  isOpenState,
  isSideEffect,
  isTaskApproved,
  provenanceLine,
  sanitizeTaskText,
  taskContentHash,
  type TaskActor,
  type TaskCapability,
  type TaskRecord,
  type TaskState,
} from "../tasks.js";

/**
 * The dashboard's view of a task: everything a person needs to decide on it,
 * with every agent-written string passed through sanitizeTaskText (control
 * characters and bidi overrides stripped) and every time as ISO 8601. The
 * dashboard renders these strings as plain text only, never as Markdown.
 */

export interface TaskViewArtifact {
  ref: string;
  role: string;
}

export interface TaskViewApproval {
  by: "dashboard" | "cli";
  at: string;
  granted: TaskCapability[];
  expires_at: string;
  /** The approval carries a valid Ed25519 signature from a device key. */
  signed: boolean;
  key_id: string | null;
  /** Still matches the task's content and has not expired. */
  current: boolean;
}

export interface TaskViewEffect {
  capability: TaskCapability;
  summary: string;
  /** The exact effect (recipients and body, the diff, the amount). */
  details: string;
  requested_at: string;
  /** What an effect decision binds to; the dashboard echoes it back. */
  effect_hash: string;
}

export interface TaskViewDecision {
  capability: TaskCapability;
  summary: string;
  decision: "approved" | "denied";
  by: "dashboard" | "cli";
  at: string;
}

export interface TaskView {
  task_id: string;
  thread: string;
  title: string;
  instructions: string;
  input_artifacts: TaskViewArtifact[];
  /** A harness id, or "any". */
  assignee: string;
  capabilities: TaskCapability[];
  /** The requested capabilities that reach outside ctxfile (each use asks per effect). */
  side_effects: TaskCapability[];
  state: TaskState;
  a2a_state: string;
  open: boolean;
  origin: "agent" | "human";
  /** "user" for a human-posted task, else the posting agent's harness. */
  from: string;
  /** Who posted it: harness, door, advertised client, and token NAME (never a value). */
  posted_by: TaskActor;
  /** The same provenance sentence the assignee sees. */
  provenance: string;
  approved: boolean;
  /** An effect awaits a decision, or an agent's proposal awaits approval. */
  waiting_on_you: boolean;
  /** Agent-posted AND reads private data AND can send or publish: the
      prompt-injection exfiltration shape. The dashboard warns about it. */
  trifecta: boolean;
  /** What an approval binds to; the dashboard echoes it back on approve. */
  content_hash: string;
  approval: TaskViewApproval | null;
  pending_effect: TaskViewEffect | null;
  effect_decisions: TaskViewDecision[];
  lease: { harness: string; expires_at: string } | null;
  result: { summary: string; artifacts: TaskViewArtifact[]; at: string } | null;
  reason: string | null;
  thread_frozen: boolean;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

const PRIVATE_READS: readonly TaskCapability[] = ["read:thread", "read:files"];
const EXFILTRATION: readonly TaskCapability[] = ["send:message", "publish:external"];

/** Private data + untrusted (agent-written) input + an exfiltration channel. */
export function isTrifecta(task: Pick<TaskRecord, "origin" | "capabilities">): boolean {
  return (
    task.origin === "agent" &&
    task.capabilities.some((c) => PRIVATE_READS.includes(c)) &&
    task.capabilities.some((c) => EXFILTRATION.includes(c))
  );
}

export function isWaitingOnYou(task: TaskRecord, now: number): boolean {
  if (task.deleted) return false;
  return task.state === "awaiting_approval" || (isOpenState(task.state) && !isTaskApproved(task, now));
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function clean(text: string): string {
  return sanitizeTaskText(text);
}

function artifacts(list: TaskViewArtifact[]): TaskViewArtifact[] {
  return list.map((a) => ({ ref: clean(a.ref), role: clean(a.role) }));
}

export function taskView(task: TaskRecord, now: number, threadFrozen: boolean): TaskView {
  const approved = isTaskApproved(task, now);
  const approval = task.approval;
  const effect = task.pending_effect;
  return {
    task_id: task.task_id,
    thread: clean(task.thread),
    title: clean(task.title),
    instructions: clean(task.instructions),
    input_artifacts: artifacts(task.input_artifacts),
    assignee: task.assignee,
    capabilities: task.capabilities,
    side_effects: task.capabilities.filter(isSideEffect),
    state: task.state,
    a2a_state: A2A_TASK_STATE[task.state],
    open: isOpenState(task.state),
    origin: task.origin,
    from: task.origin === "human" ? "user" : (task.posted_by.harness ?? "unknown agent"),
    posted_by: {
      kind: task.posted_by.kind,
      harness: task.posted_by.harness,
      door: task.posted_by.door,
      client: task.posted_by.client,
      token: task.posted_by.token,
    },
    provenance: provenanceLine(task, now),
    approved,
    waiting_on_you: isWaitingOnYou(task, now),
    trifecta: isTrifecta(task),
    content_hash: taskContentHash(task),
    approval: approval
      ? {
          by: approval.by,
          at: iso(approval.at),
          granted: approval.granted,
          expires_at: iso(approval.expires_at),
          signed: verifyTaskApproval(task, null),
          key_id: approval.key_id,
          current: task.origin === "agent" ? approved : true,
        }
      : null,
    pending_effect: effect
      ? {
          capability: effect.capability,
          summary: clean(effect.summary),
          details: clean(effect.details),
          requested_at: iso(effect.requested_at),
          effect_hash: effect.effect_hash,
        }
      : null,
    effect_decisions: task.effect_decisions.map((d) => ({
      capability: d.capability,
      summary: clean(d.summary),
      decision: d.decision,
      by: d.by,
      at: iso(d.at),
    })),
    lease: task.lease ? { harness: task.lease.harness, expires_at: iso(task.lease.expires_at) } : null,
    result: task.result ? { summary: clean(task.result.summary), artifacts: artifacts(task.result.artifacts), at: iso(task.result.at) } : null,
    reason: task.reason !== null ? clean(task.reason) : null,
    thread_frozen: threadFrozen,
    expires_at: iso(task.expires_at),
    created_at: iso(task.created_at),
    updated_at: iso(task.updated_at),
  };
}
