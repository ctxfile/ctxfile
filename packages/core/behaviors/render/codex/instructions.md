# ctxfile behaviors for Codex

Add this to your Codex instructions (global `~/.codex/AGENTS.md` or per-project AGENTS.md).

# ctxfile behaviors (v1)

You have access to the ctxfile MCP tools (`get_context`, `save_session`, `continue_thread`, `list_threads`, `ingest_context`). These behaviors make context capture automatic. The user consented to ambient capture when they installed this; your side of that bargain is the visibility rule (B4).

## B1 — Session start

At the start of work, call `get_context`. If a thread matches this project or the user's request, load it with `continue_thread` and briefly acknowledge what you now know, in one line, e.g. "Resuming Q3 campaign: last session ended mid-refactor of the export module." Do not recite the whole digest back.

## B2 — Checkpoint on significance, not on time

Call `save_session` with `trigger: "auto"` when ANY of these happens:

- a task or subtask completes;
- a decision with rationale is made;
- the user says anything implying an ending: "thanks", "that's all", "see you", "gtg", switching topics;
- roughly 30+ minutes of substantive work have passed since the last checkpoint;
- the user mentions switching tools, models, or machines.

Do NOT checkpoint trivial exchanges, single question-answer turns, or unchanged state. Include `thread` when the work has a name; include what changed since the last checkpoint, not the whole history.

If the tool answers `stored: false` (debounced, paused, or a private thread), accept it silently and move on. Never retry an automatic checkpoint, and never argue with a pause.

## B3 — Handoff detection

If the user implies someone or something else will continue ("hand this off", "my teammate will pick this up", "I'll continue on my phone"), produce a FULL handoff digest with `handoff: true` and all six sections: state (done / in progress / not started), key_decisions with the rationale, ordered open_items with blockers named, gotchas, artifacts (each with a one-line role), and suggested_first_prompt for whoever resumes. If validation rejects it, fix exactly the listed fields and call once more.

## B4 — Visibility (non-negotiable)

Every automatic save must be announced in the conversation in one short line:

    ✓ Checkpointed to ctxfile (thread: Q3 campaign)

Never save silently. If you saved without a thread, say so: "✓ Checkpointed to ctxfile". This single line is the whole announcement; do not elaborate unless asked.

## B5 — Thread hygiene

A new project or a clearly distinct workstream gets a new thread name; do not append unrelated work to an existing thread. When genuinely uncertain which thread applies, ask the user once, briefly, and remember the answer for the rest of the session.

## B6 — The CLI (harnesses with a shell)

If you can run shell commands, the `ctxfile` CLI is available for the admin actions the MCP tools deliberately do not expose. Run these ONLY when the user explicitly asks, never on your own initiative, and state the command you ran:

- "stop auto-saving" / "pause ctxfile" → `ctxfile pause` (resume with `ctxfile resume`)
- "make this thread private" → `ctxfile threads` to find the id, then `ctxfile threads private <id>` (`--off` reverses it)
- "what has been captured?" → `ctxfile ingest list`; "delete that one" → `ctxfile ingest rm <id>`
- "what threads do I have here?" → `ctxfile threads`
- "export context for the repo / CI" → `ctxfile export`
- "sync now" → `ctxfile sync` (works only if the user's vault passphrase env var is already set; if the command reports it is missing, tell the user to run it themselves — NEVER ask for, echo, or handle the passphrase)

Never run `ctxfile vault create|join` or `ctxfile activate` yourself; those are the user's own setup steps. On hosted surfaces without a shell, the five MCP tools are the whole interface.

## Manual override

All of this coexists with explicit requests: "save this session", "pick up my X thread", and "hand this off" always work and take priority. Explicit user requests are `trigger: "manual"` (the default) and are never debounced.
