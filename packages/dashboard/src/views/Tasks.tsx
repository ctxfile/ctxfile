import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, ServerGoneError } from "../lib/api";
import { formatDateTime, formatRelative, formatUntil } from "../lib/format";
import { useNow } from "../lib/hooks";
import {
  SIDE_EFFECT_CAPABILITIES,
  type TaskCapability,
  type TaskList,
  type TaskListState,
  type TaskState,
  type TaskView,
} from "../lib/types";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { useToast } from "../components/Toast";

/** `ctxfile ui` and the MCP server are separate processes sharing one SQLite
    file, so there is no event to listen for: the view polls while it is open. */
export const TASK_POLL_MS = 10_000;
const FINISHED_SHOWN = 50;
const GENERIC_ERROR = "Something went wrong. Please try again.";

export const CAPABILITY_LABEL: Record<TaskCapability, string> = {
  "read:thread": "Read this thread's sessions and handoffs",
  "read:files": "Read files in this project",
  "draft:content": "Write drafts that stay on your machine",
  "write:code": "Change code and push it",
  "send:message": "Send messages (email, chat, DMs)",
  "publish:external": "Publish outside ctxfile",
  "spend:money": "Spend money",
};

const STATE_TONE: Record<TaskState, string> = {
  proposed: "chip-warn",
  pending: "chip-accent",
  claimed: "chip-accent",
  awaiting_approval: "chip-warn",
  completed: "chip-ok",
  failed: "chip-err",
  rejected: "chip-dim",
  canceled: "chip-dim",
};

const isSideEffect = (cap: TaskCapability): boolean => SIDE_EFFECT_CAPABILITIES.includes(cap);

/** Server-authored 4xx text is written for people; anything else collapses
    to a generic line so raw exceptions never reach the page. */
function friendlyError(err: unknown, onServerGone: () => void): string {
  if (err instanceof ServerGoneError) {
    onServerGone();
    return "The ctxfile server stopped responding.";
  }
  if (err instanceof ApiError && err.status === 503) return "Tasks are unavailable in this run (the local store is off).";
  if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 401) return err.message;
  return GENERIC_ERROR;
}

function fromLabel(task: TaskView): string {
  return task.origin === "human" ? "you" : task.from;
}

function forLabel(task: TaskView): string {
  return task.assignee === "any" ? "any agent" : task.assignee;
}

function authorLabel(task: TaskView): string {
  return task.origin === "human" ? `you (via ${task.posted_by.door})` : `${task.from}, an agent`;
}

/** Waiting on you first: effects before proposals, newest first within each. */
function byUrgency(a: TaskView, b: TaskView): number {
  const effect = Number(b.state === "awaiting_approval") - Number(a.state === "awaiting_approval");
  return effect !== 0 ? effect : Date.parse(b.created_at) - Date.parse(a.created_at);
}

type Confirm =
  | { kind: "reject" | "cancel"; task: TaskView }
  | { kind: "freeze" | "unfreeze"; thread: string; open: number }
  | { kind: "turn-on" };

export interface TasksProps {
  onServerGone: () => void;
}

/** Free (core): the human side of cross-agent tasks. Agents post work for
    each other on a thread; nothing an agent posts counts as approved, and no
    side effect happens, until the person says yes here (or on the CLI). */
export function Tasks({ onServerGone }: TasksProps) {
  const [data, setData] = useState<TaskList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [finishedOpen, setFinishedOpen] = useState(false);
  const [approving, setApproving] = useState<TaskView | null>(null);
  const [effecting, setEffecting] = useState<TaskView | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const now = useNow();
  const seq = useRef(0);

  const scope: TaskListState = finishedOpen ? "all" : "open";

  const load = useCallback((): void => {
    const id = ++seq.current;
    api
      .tasks(scope)
      .then((next) => {
        if (id !== seq.current) return; // a newer request already answered
        setData(next);
        setError(null);
        setUnavailable(false);
      })
      .catch((err: unknown) => {
        if (id !== seq.current) return;
        if (err instanceof ApiError && err.status === 503) setUnavailable(true);
        else setError(friendlyError(err, onServerGone));
      });
  }, [scope, onServerGone]);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") load();
    }, TASK_POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  /** Runs one decision, toasts its outcome, closes any sheet, and reloads
      either way (a 409 means the task moved on; the reload shows how). */
  const act = (run: () => Promise<string>): void => {
    setBusy(true);
    run()
      .then((done) => toast(done, "ok"))
      .catch((err: unknown) => toast(friendlyError(err, onServerGone), "err"))
      .finally(() => {
        setBusy(false);
        setApproving(null);
        setEffecting(null);
        setConfirm(null);
        load();
      });
  };

  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const waiting = useMemo(() => tasks.filter((t) => t.open && t.waiting_on_you).sort(byUrgency), [tasks]);
  const open = useMemo(() => tasks.filter((t) => t.open && !t.waiting_on_you), [tasks]);
  const finished = useMemo(() => tasks.filter((t) => !t.open).slice(0, FINISHED_SHOWN), [tasks]);

  const threads = useMemo(() => {
    const byKey = new Map<string, { title: string; open: number; frozen: boolean }>();
    for (const task of tasks) {
      if (!task.open) continue;
      const key = task.thread.toLowerCase();
      const entry = byKey.get(key) ?? { title: task.thread, open: 0, frozen: task.thread_frozen };
      entry.open += 1;
      byKey.set(key, entry);
    }
    for (const title of data?.frozen_threads ?? []) {
      const key = title.toLowerCase();
      const entry = byKey.get(key) ?? { title, open: 0, frozen: true };
      entry.frozen = true;
      byKey.set(key, entry);
    }
    return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [tasks, data]);

  const off = data?.off ?? false;

  const toggleSwitch = (): void => {
    // Off is the safe direction and takes one click; back on asks first.
    if (off) setConfirm({ kind: "turn-on" });
    else act(() => api.setTasksOff(true).then(() => "Tasks are off for every agent"));
  };

  const cardActions = (task: TaskView): ReactNode => {
    if (!task.open) return null;
    return (
      <>
        {task.pending_effect !== null && (
          <button
            type="button"
            className="btn btn-small btn-primary"
            onClick={() => setEffecting(task)}
            aria-label={`Review effect: ${task.title}`}
          >
            <Icon name="shield" size={12} />
            Review effect
          </button>
        )}
        {!task.approved && (
          <button
            type="button"
            className={`btn btn-small${task.pending_effect === null ? " btn-primary" : ""}`}
            onClick={() => setApproving(task)}
            aria-label={`Review and approve: ${task.title}`}
          >
            <Icon name="check" size={12} />
            Review and approve
          </button>
        )}
        {task.approved ? (
          <button
            type="button"
            className="btn btn-small btn-quiet"
            onClick={() => setConfirm({ kind: "cancel", task })}
            aria-label={`Cancel: ${task.title}`}
          >
            <Icon name="close" size={12} />
            Cancel
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-small btn-quiet"
            onClick={() => setConfirm({ kind: "reject", task })}
            aria-label={`Reject: ${task.title}`}
          >
            <Icon name="trash" size={12} />
            Reject
          </button>
        )}
      </>
    );
  };

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>Tasks</h1>
          <p className="view-sub">
            Work your agents leave for each other on a thread. Nothing an agent posts runs as approved, and nothing is sent,
            published, pushed or paid, until you say yes here.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            role="switch"
            aria-checked={!off}
            aria-label="Tasks for every agent"
            className={`task-switch${off ? " is-off" : ""}`}
            onClick={toggleSwitch}
            disabled={data === null || busy}
          >
            <span className="task-switch-track" aria-hidden="true">
              <span className="task-switch-thumb" />
            </span>
            <span className="task-switch-label">{off ? "Tasks off" : "Tasks on"}</span>
          </button>
        </div>
      </header>

      {error !== null && (
        <div className="banner banner-err" role="alert">
          <Icon name="alert" size={15} />
          <span>{error}</span>
        </div>
      )}

      {off && (
        <div className="banner banner-warn" role="status">
          <Icon name="stop" size={15} />
          <span>
            Tasks are off. Every agent&apos;s task tools refuse until you turn them back on; nothing here changes in the
            meantime.
          </span>
        </div>
      )}

      {unavailable && (
        <EmptyState icon="tasks" title="Task store is off" body="This run has no local store, so cross-agent tasks are unavailable." />
      )}

      {data === null && !unavailable && error === null && <div className="skeleton task-skeleton" aria-label="Loading tasks" />}

      {data !== null && !unavailable && (
        <>
          <p className="task-mode">
            <Icon name="info" size={12} />
            {data.proposals === "require_approval"
              ? "Agents cannot start a proposal until you approve it here or with 'ctxfile tasks approve'."
              : "Agents may start a proposal after asking you in chat; approving it here makes that yes durable and signed."}
          </p>

          <section className="task-section" aria-labelledby="tasks-waiting">
            <h2 id="tasks-waiting" className="section-heading">
              Waiting on you <span className="task-count num">{waiting.length}</span>
            </h2>
            {waiting.length === 0 ? (
              <EmptyState
                compact
                icon="check"
                title="Nothing waits on you"
                body="Proposals from agents and effects they want to perform (send, publish, push, pay) appear here."
              />
            ) : (
              <ul className="task-list">
                {waiting.map((task) => (
                  <TaskCard key={task.task_id} task={task} now={now} actions={cardActions(task)} />
                ))}
              </ul>
            )}
          </section>

          <section className="task-section" aria-labelledby="tasks-open">
            <h2 id="tasks-open" className="section-heading">
              Open <span className="task-count num">{open.length}</span>
            </h2>
            {open.length === 0 ? (
              <p className="task-none">No other open tasks.</p>
            ) : (
              <ul className="task-list">
                {open.map((task) => (
                  <TaskCard key={task.task_id} task={task} now={now} actions={cardActions(task)} />
                ))}
              </ul>
            )}
          </section>

          {threads.length > 0 && (
            <section className="panel task-threads" aria-label="Threads with tasks">
              <h3 className="panel-title">Threads</h3>
              <ul className="task-thread-list">
                {threads.map((thread) => (
                  <li key={thread.title} className="task-thread">
                    <span className="task-thread-title">{thread.title}</span>
                    <span className="task-thread-meta num">{thread.open} open</span>
                    {thread.frozen && <span className="chip chip-warn">frozen</span>}
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={busy}
                      onClick={() => setConfirm({ kind: thread.frozen ? "unfreeze" : "freeze", thread: thread.title, open: thread.open })}
                      aria-label={`${thread.frozen ? "Unfreeze tasks on" : "Freeze tasks on"} ${thread.title}`}
                    >
                      <Icon name={thread.frozen ? "play" : "stop"} size={12} />
                      {thread.frozen ? "Unfreeze" : "Freeze tasks"}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="task-section" aria-label="Finished tasks">
            <button
              type="button"
              className="task-finished-toggle section-heading"
              aria-expanded={finishedOpen}
              onClick={() => setFinishedOpen((v) => !v)}
            >
              <Icon name={finishedOpen ? "chevron-down" : "chevron-right"} size={14} />
              Finished <span className="task-count num">{data.counts.finished}</span>
            </button>
            {finishedOpen &&
              (finished.length === 0 ? (
                <p className="task-none">{data.counts.finished === 0 ? "Nothing finished yet." : "Loading…"}</p>
              ) : (
                <ul className="task-list">
                  {finished.map((task) => (
                    <TaskCard key={task.task_id} task={task} now={now} actions={null} />
                  ))}
                </ul>
              ))}
          </section>
        </>
      )}

      {approving !== null && (
        <ApproveSheet
          task={approving}
          busy={busy}
          onClose={() => setApproving(null)}
          onApprove={(granted) =>
            act(() =>
              api
                .approveTask(approving.task_id, granted, approving.content_hash)
                .then(() => `Approved and signed: ${forLabel(approving)} can start`)
            )
          }
        />
      )}

      {effecting !== null && effecting.pending_effect !== null && (
        <EffectSheet
          task={effecting}
          busy={busy}
          onClose={() => setEffecting(null)}
          onDecide={(decision, reason) => {
            const hash = effecting.pending_effect?.effect_hash ?? "";
            act(() =>
              api
                .decideEffect(effecting.task_id, decision, hash, reason)
                .then(() => (decision === "approve" ? "Effect approved, once" : "Effect denied: the agent will not perform it"))
            );
          }}
        />
      )}

      {confirm !== null && (
        <ConfirmSheet
          confirm={confirm}
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={(reason) => {
            switch (confirm.kind) {
              case "reject":
                act(() => api.rejectTask(confirm.task.task_id, reason).then(() => "Rejected: the agent will not start it"));
                return;
              case "cancel":
                act(() => api.cancelTask(confirm.task.task_id, reason).then(() => "Canceled"));
                return;
              case "freeze":
                act(() =>
                  api
                    .freezeThread(confirm.thread, true)
                    .then((r) => `Thread frozen: ${r.canceled} open task${r.canceled === 1 ? "" : "s"} canceled, new ones blocked`)
                );
                return;
              case "unfreeze":
                act(() => api.freezeThread(confirm.thread, false).then(() => "The thread accepts tasks again"));
                return;
              case "turn-on":
                act(() => api.setTasksOff(false).then(() => "Tasks are on"));
                return;
            }
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ card */

function TaskCard({ task, now, actions }: { task: TaskView; now: number; actions: ReactNode }) {
  const [showText, setShowText] = useState(false);
  return (
    <li className={`task-card${task.waiting_on_you ? " is-waiting" : ""}`}>
      <div className="task-card-head">
        <h3 className="task-title">{task.title}</h3>
        <span className="task-chips">
          <span className={`chip ${STATE_TONE[task.state]}`}>{task.state.replace("_", " ")}</span>
          {task.open && !task.approved && <span className="chip chip-warn">not approved</span>}
          {task.trifecta && task.open && (
            <span className="chip chip-err" title="Reads private data and can send or publish: review the text closely">
              <Icon name="alert" size={11} />
              reads + sends
            </span>
          )}
        </span>
      </div>

      <dl className="task-facts">
        <div>
          <dt>From</dt>
          <dd>{fromLabel(task)}</dd>
        </div>
        <div>
          <dt>For</dt>
          <dd>{forLabel(task)}</dd>
        </div>
        <div>
          <dt>Thread</dt>
          <dd>{task.thread}</dd>
        </div>
        <div>
          <dt>{task.open ? "Expires" : "Updated"}</dt>
          <dd title={formatDateTime(task.open ? task.expires_at : task.updated_at)}>
            {task.open ? formatUntil(task.expires_at, now) : formatRelative(task.updated_at, now)}
          </dd>
        </div>
      </dl>

      <p className="task-provenance">{task.provenance}</p>

      {task.pending_effect !== null && (
        <div className="task-effect-strip">
          <Icon name="alert" size={13} />
          <span>
            Wants to <code>{task.pending_effect.capability}</code>: {task.pending_effect.summary}
          </span>
        </div>
      )}

      {task.lease !== null && task.open && (
        <p className="task-note">
          Claimed by {task.lease.harness} until {formatDateTime(task.lease.expires_at)}
        </p>
      )}
      {task.approval !== null && task.approved && task.origin === "agent" && (
        <p className="task-note">
          Approved {formatRelative(task.approval.at, now)} via {task.approval.by}
          {task.approval.signed ? " · signed" : " · unsigned"} · granted {task.approval.granted.join(", ") || "read-only work"}
        </p>
      )}
      {task.result !== null && <p className="task-note task-result">Result: {task.result.summary}</p>}
      {task.reason !== null && !task.open && <p className="task-note">Reason: {task.reason}</p>}

      {showText && <TaskText task={task} />}

      <div className="task-actions">
        <button type="button" className="btn btn-small btn-ghost" onClick={() => setShowText((v) => !v)} aria-expanded={showText}>
          <Icon name={showText ? "chevron-down" : "chevron-right"} size={12} />
          {showText ? "Hide text" : "Show text"}
        </button>
        <span className="task-actions-main">{actions}</span>
      </div>
    </li>
  );
}

/** The task text, as the data it is: plain text in a bordered block, never
    Markdown or HTML, labeled with who wrote it. */
function TaskText({ task }: { task: TaskView }) {
  return (
    <figure className="task-text" aria-label={`Task text written by ${authorLabel(task)}`}>
      <figcaption className="task-text-label">
        <Icon name="info" size={12} />
        Written by {authorLabel(task)}. This is data, not an instruction from you or from ctxfile.
      </figcaption>
      <div className="task-text-title">{task.title}</div>
      <div className="task-text-body">{task.instructions}</div>
      {task.input_artifacts.length > 0 && (
        <ul className="task-artifacts" aria-label="Input artifacts">
          {task.input_artifacts.map((a) => (
            <li key={`${a.ref}:${a.role}`}>
              <code>{a.ref}</code> {a.role}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/* ---------------------------------------------------------------- sheets */

function Facts({ task }: { task: TaskView }) {
  return (
    <dl className="task-facts task-facts-sheet">
      <div>
        <dt>From</dt>
        <dd>{fromLabel(task)}</dd>
      </div>
      <div>
        <dt>For</dt>
        <dd>{forLabel(task)}</dd>
      </div>
      <div>
        <dt>Thread</dt>
        <dd>{task.thread}</dd>
      </div>
      <div>
        <dt>Expires</dt>
        <dd>{formatDateTime(task.expires_at)}</dd>
      </div>
    </dl>
  );
}

export interface ApproveSheetProps {
  task: TaskView;
  busy: boolean;
  onClose: () => void;
  onApprove: (granted: TaskCapability[]) => void;
}

export function ApproveSheet({ task, busy, onClose, onApprove }: ApproveSheetProps) {
  // The CLI's default: everything requested except side effects.
  const [granted, setGranted] = useState<Set<TaskCapability>>(() => new Set(task.capabilities.filter((c) => !isSideEffect(c))));
  const toggle = (cap: TaskCapability): void =>
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(cap)) next.delete(cap);
      else next.add(cap);
      return next;
    });

  return (
    <Sheet title="Approve this task?" size="md" onClose={onClose}>
      <div className="task-sheet">
        <Facts task={task} />
        {task.trifecta && (
          <div className="banner banner-warn" role="alert">
            <Icon name="alert" size={15} />
            <span>
              <strong>Reads your data, then sends it out.</strong> An agent wrote this task, it asks to read private data, and it
              can send or publish outside ctxfile. That combination is how a prompt injection leaks data. Approve only if you trust
              every word below; each send or publish still asks you first.
            </span>
          </div>
        )}
        <TaskText task={task} />
        <fieldset className="task-caps">
          <legend>Capabilities to grant</legend>
          {task.capabilities.length === 0 && <p className="task-none">This task asks for nothing beyond read-only work and drafts.</p>}
          {task.capabilities.map((cap) => (
            <label key={cap} className="task-cap">
              <input type="checkbox" checked={granted.has(cap)} onChange={() => toggle(cap)} />
              <span className="task-cap-text">
                <code>{cap}</code>
                <span>{CAPABILITY_LABEL[cap]}</span>
                {isSideEffect(cap) && (
                  <span className="task-cap-note">Side effect: even if granted, each use still asks you, per effect.</span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
        <p className="sheet-body task-sign-note">
          <Icon name="key" size={12} />
          Signed with this device&apos;s approval key. Any change to the task voids the approval.
        </p>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>
            Not now
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => onApprove(task.capabilities.filter((c) => granted.has(c)))}
          >
            <Icon name="check" size={14} />
            Approve and sign
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export interface EffectSheetProps {
  task: TaskView;
  busy: boolean;
  onClose: () => void;
  onDecide: (decision: "approve" | "deny", reason: string) => void;
}

export function EffectSheet({ task, busy, onClose, onDecide }: EffectSheetProps) {
  const [reason, setReason] = useState("");
  const effect = task.pending_effect;
  if (effect === null) return null;
  const by = task.lease?.harness ?? forLabel(task);
  return (
    <Sheet title="Approve this effect?" size="md" onClose={onClose}>
      <div className="task-sheet">
        <dl className="task-facts task-facts-sheet">
          <div>
            <dt>Task</dt>
            <dd>{task.title}</dd>
          </div>
          <div>
            <dt>Asked by</dt>
            <dd>{by}</dd>
          </div>
          <div>
            <dt>Capability</dt>
            <dd>
              <code>{effect.capability}</code>
            </dd>
          </div>
          <div>
            <dt>Asked</dt>
            <dd>{formatDateTime(effect.requested_at)}</dd>
          </div>
        </dl>
        <p className="task-effect-summary">{effect.summary}</p>
        <figure className="task-effect" aria-label="Exactly what will happen">
          <figcaption className="task-text-label">
            <Icon name="info" size={12} />
            Exactly what will happen, as written by {by}, an agent.
          </figcaption>
          <pre className="task-effect-details">{effect.details}</pre>
        </figure>
        <p className="sheet-body">Approving allows exactly this, once. Anything different asks you again.</p>
        <label className="task-reason">
          <span>Reason if you deny (optional; the agent sees it)</span>
          <input className="input" value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
        </label>
        <div className="sheet-actions">
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => onDecide("deny", reason)}>
            <Icon name="close" size={14} />
            Deny
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onDecide("approve", reason)}>
            <Icon name="check" size={14} />
            Approve once
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function ConfirmSheet({
  confirm,
  busy,
  onClose,
  onConfirm,
}: {
  confirm: Confirm;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  let title: string;
  let body: string;
  let quote: string | null = null;
  let label: string;
  let danger = true;
  let withReason = false;
  switch (confirm.kind) {
    case "reject":
      title = "Reject this task?";
      body = "The agent will not start it, and it moves to Finished. The agent sees your reason.";
      quote = confirm.task.title;
      label = "Reject";
      withReason = true;
      break;
    case "cancel":
      title = "Cancel this task?";
      body = "Whoever holds it is told to stop, and it moves to Finished. The agent sees your reason.";
      quote = confirm.task.title;
      label = "Cancel task";
      withReason = true;
      break;
    case "freeze":
      title = "Freeze tasks on this thread?";
      body = `${confirm.open} open task${confirm.open === 1 ? " is" : "s are"} canceled, and no agent can post or claim tasks on it until you unfreeze it.`;
      quote = confirm.thread;
      label = "Freeze tasks";
      break;
    case "unfreeze":
      title = "Allow tasks on this thread again?";
      body = "Agents can post and claim tasks on it again. Their proposals still wait for you.";
      quote = confirm.thread;
      label = "Unfreeze";
      danger = false;
      break;
    case "turn-on":
      title = "Turn tasks back on?";
      body = "Every agent's task tools work again. Proposals still wait for you, and every side effect still asks first.";
      label = "Turn tasks on";
      danger = false;
      break;
  }
  return (
    <Sheet title={title} tone={danger ? "danger" : "neutral"} onClose={onClose}>
      <p className="sheet-body">{body}</p>
      {quote !== null && <blockquote className="sheet-quote">{quote}</blockquote>}
      {withReason && (
        <label className="task-reason">
          <span>Reason (optional)</span>
          <input className="input" value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
        </label>
      )}
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onClose}>
          Back
        </button>
        <button type="button" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={busy} onClick={() => onConfirm(reason)}>
          <Icon name={danger ? "alert" : "check"} size={14} />
          {label}
        </button>
      </div>
    </Sheet>
  );
}
