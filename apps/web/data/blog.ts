export interface BlogPost {
  slug: string;
  title: string;
  /** Standfirst. Rendered as the lede above the body, and the default meta description. */
  excerpt: string;
  /**
   * Full article in the markdown subset `ArticleBody` renders: `##`/`###`
   * headings, paragraphs, `-` and `1.` lists, `~~~` fenced code, `**bold**`,
   * backtick code spans and `[label](href)`.
   *
   * Bodies use `~~~` rather than backtick fences because they live in template
   * literals, where every backtick would need escaping.
   */
  body: string;
  category: string;
  /** ISO date. Drives both the visible byline and the Article schema. */
  date: string;
  readTime: string;
  /** SEO overrides. Fall back to `title` / `excerpt` when omitted. */
  metaTitle?: string;
  metaDescription?: string;
  /** Target query for this post. Editorial reference only, never rendered. */
  primaryKeyword?: string;
  /**
   * Questions the post answers, emitted as FAQPage structured data so search
   * and answer engines can quote them. Keep each answer self-contained; the
   * body should cover the same ground in prose.
   */
  faq?: { q: string; a: string }[];
}

/**
 * Every claim in these posts is checked against the shipped source, not the
 * roadmap. The five MCP tools are the ones `packages/core/src/server.ts`
 * actually registers; the relay's extra `search`/`fetch` pair is the ChatGPT
 * connector contract in `packages/relay/src/mcp.ts`; the vault ranking is the
 * tier order in `connectors/vault.ts`. The honest boundaries (reduced
 * reconstruction rather than perfect memory, no prompt-injection defence) are
 * repeated in the posts on purpose — overclaiming to a skeptical developer
 * audience costs more than it wins.
 */
export const blogPosts: BlogPost[] = [
  {
    slug: "ai-playbooks-reusable-prompts-from-agent-sessions",
    title: "AI playbooks: turn your best agent sessions into reusable prompts",
    metaTitle: "AI Playbooks: Turn Your Best Agent Sessions into Reusable Prompts",
    metaDescription:
      "What an AI playbook is, why prompt libraries go stale, and how ctxfile distills reusable prompts from your own Claude Code, Cursor and ChatGPT sessions, encrypted locally and served to every agent as MCP prompts. Scales from one developer to a company.",
    excerpt:
      "Every good session with an AI agent leaves a method behind, and almost all of it evaporates when the tab closes. A playbook is that method, captured as a reusable prompt. Here is why they matter now, how ctxfile distills them from your own sessions, and how the idea scales from one developer to a whole company.",
    category: "Playbooks",
    date: "2026-09-13",
    readTime: "9 min read",
    primaryKeyword: "ai playbooks reusable prompts",
    faq: [
      {
        q: "What is an AI playbook?",
        a: "An AI playbook is a reusable prompt that captures a proven method: the order to check things in, the traps to avoid, and the framing that worked, with placeholders for the parts that change next time. Unlike a prompt library entry written by hand, a ctxfile playbook is distilled by a model from your own saved agent sessions, so it reflects what you actually did rather than what you meant to do.",
      },
      {
        q: "How does ctxfile create playbooks?",
        a: "Ask any connected agent to distill a playbook from a thread. The distill_playbook tool runs your saved sessions through the models you configured, a local Ollama model or a cloud provider, and writes candidate playbooks to an encrypted local library with provenance recording which model and which sessions produced each one.",
      },
      {
        q: "Do playbooks work across Claude Code, Cursor and other tools?",
        a: "Yes. Playbooks are served as native MCP prompts, so every MCP client connected to ctxfile lists them in its prompt picker. They also appear in the local dashboard with one-click copy for tools without a picker.",
      },
      {
        q: "Does distilling a playbook send my sessions to the cloud?",
        a: "Only if you choose a cloud provider. With a local Ollama model nothing leaves your machine. Either way, sessions are redacted before storage and the playbook library is encrypted at rest with AES-256-GCM, with the key in your OS keychain.",
      },
      {
        q: "Are playbooks a Pro feature?",
        a: "Yes. Playbooks compose session capture, the encrypted store and multi-provider consult, which are ctxfile Pro. The core context engine, threads, connectors and dashboard are free and Apache-2.0.",
      },
    ],
    body: `Think about the last time an AI agent session went really well. You checked things in the right order, you remembered the trap that bit you last quarter, you found the framing that made the model stop hedging. Then you closed the tab.

Where is that method now? In a scrollback nobody will read again, in a chat history one vendor owns, or in your head, degrading. Next week a teammate hits the same task and starts from a blank prompt. So do you, honestly.

That gap between what a session proved and what the next session gets to reuse is the problem playbooks solve.

## What a playbook is

A playbook is a reusable prompt that captures a method. Not a one-liner and not a transcript: the distilled shape of how a kind of task gets done well, with placeholders for the parts that change.

Here is one, produced from real sessions on a payments service:

~~~text
Given <provider> and its signing scheme, implement verification with a replay window,
a timing-safe compare, and an idempotent event store keyed by <event id>.
Write the negative-path tests first: bad signature, stale timestamp, duplicate delivery.
Only then wire the side effect.
~~~

Three things make it a playbook rather than a note:

- **It has slots.** \`<provider>\` and \`<event id>\` are the only parts that change next time. Everything else is the method.
- **It carries the gotchas.** The replay window, the timing-safe compare, tests before side effects. These were learned the hard way in the sessions it came from.
- **It has provenance.** Which model wrote it, from which sessions, when. You can trust it because you can trace it.

## Why this matters now

Three shifts in the AI industry make playbooks the missing layer rather than a nice-to-have.

**Agents are everywhere, and they do not share.** Most teams now use several: Claude Code in the terminal, Cursor in the editor, Codex for reviews, ChatGPT on the phone. Each has its own memory, and none of it travels. The method you refined in one is invisible to the rest.

**Prompt libraries go stale on contact.** The first response to this problem was the shared prompt doc. It works for a week. Prompts written by hand describe what someone intended, not what worked, and nobody updates them after the fourth time the underlying tool changes. Ask anyone who maintains one.

**The value moved from prompting to process.** Models are good enough now that the scarce thing is not clever wording, it is knowing the order of operations for a task in your codebase, your data, your compliance rules. That is process knowledge, and process knowledge is exactly what evaporates at the end of a session.

Playbooks capture process from evidence instead of from memory, and they are portable because they are served over an open protocol.

## How ctxfile builds them

ctxfile is a local MCP server that already snapshots your project's working state (plan, key files, git, session digests) for any agent to load. Playbooks are built on the sessions it already keeps.

::demo:playbook-distill::

The loop has four steps.

1. **Work normally.** Sessions accumulate through \`save_session\`, threads, and optionally full transcripts from the web chat apps.
2. **Ask for the distillation.** In any connected agent: "distill a playbook from the checkout webhooks thread." The \`distill_playbook\` tool runs those sessions through the models you configured under \`consult.providers\`. A local Ollama model means nothing leaves your machine. A cloud key is your explicit choice.
3. **Candidates land in the library.** Encrypted at rest with AES-256-GCM, key in your OS keychain, redacted before write like everything ctxfile stores, provenance on every entry.
4. **Reuse anywhere.** Playbooks show up in the dashboard with one-click copy, and they are served as native MCP prompts, so every client with a prompt picker lists them automatically. No copy-paste between tools.

## What it looks like

The Playbooks view in the ctxfile dashboard. Each card is one distilled prompt; the highlighted chips are the placeholders to fill in; the footer line is the provenance.

![The ctxfile dashboard Playbooks view: four distilled prompts as cards, each with placeholder chips, a copy button, and the model and sessions it came from](/blog/playbooks/playbooks-dark.jpg "Playbooks in the ctxfile dashboard. Every card records which model distilled it and from which sessions.")

The same view in the light theme. Long prompts clamp to a preview and expand in place; every card copies with one click:

![The Playbooks view in the light theme, four playbook cards with placeholder chips and provenance lines](/blog/playbooks/playbooks-light.jpg "Filter, expand, copy, or remove. Removal is permanent and behind a confirmation.")

You can explore this yourself without installing anything: the [live demo](/demo/#/playbooks) runs the real dashboard over a sample project, playbooks included.

## The first playbook ever distilled

It was not about code. It came from hours of university research for a student blocked by one grade. A local 8-billion-parameter model, running on a laptop, produced a general "educational pathway planning with constraints" prompt that preserved every hard-won detail: hidden mandatory fees, conditional credit transfers, checking the department page instead of aggregators, even the neutral tone the situation needed.

That method is now reusable for any student, in any chatbot, forever. Nobody wrote it by hand. That is the point: the library is generated from work you already did.

## How it scales

Playbooks start as a personal tool and become an organisational one without changing shape.

**One developer.** Your own methods, distilled from your own sessions, available in every tool you use. The prompt you refined in Claude Code on Monday is in Cursor's picker on Tuesday.

**A team.** Working state and playbooks live in the project, not in a vendor's account. Commit the context file and a teammate's fresh clone carries it. The shared writable context in ctxfile's Team tier adds per-agent write permissions and a full audit trail, so a playbook can be proposed by one agent, reviewed by a person, and promoted for everyone.

**A company.** This is where playbooks turn into something closer to operating procedures for agents. The incident postmortem format your best engineer follows. The onboarding path that works. The compliance checks that must run before a deploy. Distilled from the sessions where they were done right, served to every agent in the organisation, with provenance so you can audit what each agent was told to do. Federation extends the same model across organisation lines: shared, permissioned, encrypted context between companies whose agents collaborate.

The pattern is the same at every scale. Evidence in, method out, served over MCP, encrypted, traceable.

## Honest edges

- **Quality tracks the model.** A local 8B model produces genuinely usable playbooks; that is the tested floor. Frontier models via an API key produce sharper ones. You choose per provider.
- **Thin sessions make thin playbooks.** Distillation generalises what the sessions show. Rich saves, with decisions and gotchas, distill best.
- **The library is local in this release.** It is encrypted and it does not sync yet. Distill on the machine where you want the prompts.
- **A playbook is a starting point, not a guarantee.** It gives the next session the method. It does not make different models agree.

## Getting started

Playbooks are a [Pro](/docs/pro) feature; the context engine underneath is free. Install ctxfile and register it with your client:

~~~bash
claude mcp add ctxfile -- npx -y ctxfile
~~~

Work for a few sessions, save them as you go, then ask your agent:

~~~text
distill a playbook from the <thread name> thread
~~~

The result appears in the dashboard and in every connected client's prompt list. The [Playbooks docs](/docs/playbooks) cover the tools, the provider configuration, and the encryption details.
`,
  },
  {
    slug: "claude-code-memory-across-sessions",
    title: "How to give Claude Code memory across sessions",
    metaTitle: "Claude Code memory across sessions: what persists, what doesn't, and how to fix it",
    metaDescription:
      "Claude Code forgets your project between sessions. Here is exactly what survives (CLAUDE.md, auto-memory), what does not (plan, decisions, git state), and how a local context file gives every session the same starting point.",
    excerpt:
      "Every new Claude Code session starts from the files on disk and whatever you wrote in CLAUDE.md. The plan, the decisions, and where you stopped are gone. Here is what actually persists, what does not, and a local fix that works with Cursor and Codex too.",
    category: "Claude Code",
    date: "2026-09-13",
    readTime: "7 min read",
    primaryKeyword: "claude code memory across sessions",
    faq: [
      {
        q: "Does Claude Code remember previous sessions?",
        a: "Only three things persist: CLAUDE.md instruction files, the auto-memory notes Claude Code chooses to save, and past conversations you reopen with /resume. The current plan, the files you were in, what you decided, and your git state are rebuilt from scratch each session.",
      },
      {
        q: "Should I put project state in CLAUDE.md?",
        a: "No. CLAUDE.md is the right home for standing rules, and it drifts the moment you stop editing it. State changes daily and should be read from the project instead: that is what a context snapshot does.",
      },
      {
        q: "How do I give Claude Code memory that also works in Cursor?",
        a: "Use a local MCP server both tools can read. ctxfile snapshots the plan, ranked key files, git state and session digests into one object; Claude Code, Cursor, Codex and any other MCP client load the same one, so the memory is not locked inside a single tool.",
      },
    ],
    body: `You close the terminal on Friday with a plan half executed. On Monday, Claude Code opens fresh, reads your repository, and asks what you would like to work on. The plan, the three decisions you made on Thursday, the file you were in the middle of, the test that was failing: none of it is there.

This is not a bug. It is how the tool is built, and once you know exactly what persists and what does not, the fix is small.

## What Claude Code actually remembers

Three things survive between sessions, and only three.

**CLAUDE.md files.** The project-level and user-level instruction files are read at the start of every session. They are the right place for standing rules: how to run tests, which directories to leave alone, how you like commit messages. They are the wrong place for state, because you maintain them by hand and they drift the moment you stop editing them.

**The auto-memory file.** Claude Code can save short notes it decides are worth keeping. It is useful and it is also opaque: you do not control what lands there, it is specific to Claude Code, and Cursor or Codex will never read it.

**\`/resume\` and \`--continue\`.** You can reopen a previous conversation. That restores the transcript, which is the whole history including every dead end, and it only works inside Claude Code on the same machine.

Everything else is rebuilt from scratch: what the current task is, which files matter right now, what you decided and why, what the last session left open, and what your git tree looked like when you stopped.

## The three workarounds, and where each one stops

**Re-explaining by hand.** It works and it costs the first ten or fifteen minutes of every session. It also degrades, because you explain what you remember, and the part you forget is usually the constraint that caused the last bug.

**Stuffing state into CLAUDE.md.** People try this, and it turns the instructions file into a diary. The file grows, the instructions get buried, and the state is stale within a day because nothing updates it automatically.

**\`/compact\` before you stop.** Compaction summarises the current conversation so it fits in the context window. It does nothing for the next session, and the summary is lossy in ways you cannot inspect. Our post on [\`/compact\` versus \`/clear\`](/blog/claude-code-compact-vs-clear) covers when each is right.

All three share the same limit: they are inside one tool. The moment you open Cursor for a hard refactor, or Codex for a review, that tool starts from zero and Claude Code's memory does not travel.

## What a session actually needs on day two

Strip it down and a session needs a small, structured set of facts, not a transcript:

- The plan or spec, as it currently reads.
- The files that matter for this work, ranked, not the whole repository.
- Git state: branch, what is modified and uncommitted, recent commits.
- A digest of what the last session decided and left open.
- Notes that inform the work, if you keep them in something like Obsidian.

That is working state. It changes every day, it lives in the project, and it can be read from the project instead of remembered by a model.

## The fix: a context file the session loads

[ctxfile](/) is a local MCP server that snapshots exactly that set into one structured object and serves it to any MCP client. Claude Code calls \`get_context\` at the start of a session and starts already knowing the plan, the key files, the git state, and the last session's digest. Nothing leaves your machine; the default path makes zero network calls.

A snapshot takes about two seconds. This is a replay of a real run:

::demo:snapshot::

Install once and register it with Claude Code from your project directory:

~~~bash
claude mcp add ctxfile -- npx -y ctxfile
~~~

Then run the initialiser. It detects the tools you use and installs a small behaviour skill so your agent checkpoints on its own at natural stopping points, announced every time:

~~~bash
ctxfile init
~~~

From then on, a new session opens with the context already loaded. Ask it what you were working on and it answers from the snapshot, not from a summary you typed.

## What this looks like in practice

Friday, 6pm. You have been in Claude Code for two hours on a webhook handler. You reach a stopping point and the agent checkpoints: plan, files touched, three decisions, two open items.

Monday, 9am. New session. "Continue." Claude Code loads the context object and replies with the open items, the branch you are on, and the file you stopped in. No re-explaining.

This is the session history the new session reads, as the dashboard shows it:

![The ctxfile Sessions view with digests from Claude Code, Cursor, and Codex grouped by day, each listing decisions and open items](/blog/context/sessions.jpg "Friday's session, digested: what was implemented, what was decided, what is still open. Monday's session starts here.")

Git state travels the same way, so the new session knows what is staged, modified, and untracked without being told:

![The ctxfile Git view: staged, modified and untracked columns, a commit timeline, and a diff summary with insertion and deletion bars](/blog/context/git.jpg "Branch, uncommitted changes, recent commits, and the diff summary, captured at snapshot time.")

Tuesday. The refactor is gnarly and you would rather do it in Cursor. Cursor is an MCP client too, so it loads the same object and starts from the same facts. Wednesday, Codex reviews the diff with the same context. Three tools, one memory, and the memory is yours: it is a file in your repository, not a vendor's chat history.

## What persists, side by side

- **CLAUDE.md:** instructions you write. Persists. One tool reads it. You maintain it.
- **Auto-memory:** notes Claude Code chooses. Persists. One tool. You do not control it.
- **\`/resume\`:** the full transcript. Persists on one machine, one tool, including the noise.
- **ctxfile snapshot:** plan, ranked files, git state, session digests, notes. Rebuilt on every call from the project itself. Any MCP client. Committed to your repo if you want it to travel with a clone.

Keep CLAUDE.md. It is the right home for rules. Give the state its own home.

## An honest boundary

This reduces the reconstruction work at the start of every session. It does not give a model perfect recall, and it does not make Claude, Cursor's model, and Codex reach identical conclusions; they are different models. What changes is the starting point: all of them begin from the same facts about your project instead of from nothing. If you want to see the object a session receives before installing anything, the [live demo](/demo/) shows the real dashboard over a sample project.
`,
  },
  {
    slug: "share-context-between-claude-code-and-cursor",
    title: "How to Share Context Between Claude Code and Cursor",
    metaTitle: "How to Share Context Between Claude Code and Cursor (2026)",
    excerpt:
      "You explain the project to Claude Code in the terminal, then open Cursor and explain it again. Neither tool can read the other's memory. Here is why, what the common workarounds get wrong, and how to give both of them one shared context layer.",
    metaDescription:
      "Claude Code and Cursor keep separate context and cannot read each other. Here is how to connect both to one local, shared context layer so your plan, files and git state travel between them.",
    primaryKeyword: "share context between Claude Code and Cursor",
    faq: [
      {
        q: "Can Claude Code and Cursor share the same project context?",
        a: "Yes. Both are MCP clients, so both can read from one local MCP server. ctxfile reads the project directly and returns the same structured object (plan, ranked key files, git state, session digests) to whichever tool asks, with no copy-paste between them.",
      },
      {
        q: "Does symlinking CLAUDE.md and .cursor/rules solve it?",
        a: "Only partly. Symlinked files share instructions you wrote by hand. They do not share working state such as the current plan, uncommitted changes, or what the last session decided, because that state was never in those files.",
      },
      {
        q: "Does my code leave my machine when both tools share context?",
        a: "No. ctxfile makes zero network calls by default. Files matching denied patterns such as .env are never read, and secret-shaped strings are redacted before anything enters a snapshot. The core is Apache-2.0 so the claim can be checked.",
      },
    ],
    category: "Workflows",
    date: "2026-07-26",
    readTime: "8 min read",
    body: `You spend an hour with Claude Code in the terminal. It learns the architecture, the constraint you are working around, the three files that actually matter. Then you switch to Cursor for some inline editing, and it knows none of it. So you explain the project again.

This is not a bug in either tool. It is a structural gap, and it has a clean fix.

## Why neither tool can see the other

Claude Code and Cursor store their understanding of your project in different places, in different formats, for different lifetimes.

Claude Code reads a \`CLAUDE.md\` file at the start of each session, plus whatever it discovers by reading files during the conversation. Cursor reads \`.cursor/rules/*.mdc\` files and maintains its own workspace index. Neither format is readable by the other tool, and neither one contains the part that actually hurts to lose: the live working state. The plan you settled on forty minutes ago. The decision to not use the caching layer. The fact that you are three commits into a refactor with uncommitted changes.

That state lives in one place — the conversation you are about to close.

## The three workarounds, and how each one fails

**Re-pasting by hand.** It works, and it costs you the first ten or fifteen minutes of every context switch. It also degrades: you paste what you remember to paste, which is never the full picture, and the parts you forget are usually the parts that caused the last bug.

**Symlinking config files.** Point \`.cursor/rules/\` and your \`CLAUDE.md\` at one shared file and you have solved a real but small part of the problem. Instructions are now shared. Working state still is not, because working state was never in those files. The instructions also drift, because the formats are not actually interchangeable.

**Copying \`CLAUDE.md\` into Cursor's rules.** Same ceiling, plus a maintenance burden. Every edit now has to happen twice, and the day you forget is the day the two tools start disagreeing about your own project.

All three share one root problem: they synchronise **instructions you wrote by hand**, when the expensive thing to lose is **state read from the project itself**.

## The actual fix: both are MCP clients

Claude Code and Cursor are both [Model Context Protocol](https://modelcontextprotocol.io) clients. MCP is an open standard for connecting AI tools to external data sources, and its whole point is that any compliant client can talk to any compliant server.

So instead of syncing two config formats, point both tools at one server that reads your project directly and hands back the same structured object to whoever asks.

That is what ctxfile does. It runs locally, reads your repository, and exposes the result over MCP. Claude Code calls it. Cursor calls it. They get the same answer.

This is the object both tools receive. Switch the scope tabs to see how much travels for each kind of call:

::demo:payload::

## Setting it up

Install once. One global install serves every client on the machine.

~~~bash
npm install -g ctxfile
~~~

Then run the initialiser from your project directory. It detects the project and the harnesses you already use, offers to install the checkpoint skill, and writes nothing outside your machine.

~~~bash
ctxfile init
~~~

**Register it with Claude Code.** Run this from the project directory — that is what \`--root .\` points at.

~~~bash
claude mcp add ctxfile -- ctxfile --root .
~~~

**Register it with Cursor.** Add this to \`.cursor/mcp.json\` in the project, or \`~/.cursor/mcp.json\` to make it global.

~~~json
{
  "mcpServers": {
    "ctxfile": {
      "command": "ctxfile",
      "args": ["--root", "."]
    }
  }
}
~~~

That is the whole setup. Both tools now have five tools available to them: \`get_context\`, \`save_session\`, \`continue_thread\`, \`list_threads\` and \`ingest_context\`.

## The test that proves it works

Open Claude Code and ask it what you are working on. It calls \`get_context\` and answers from your actual project state rather than from a summary you wrote.

Do some work. When you reach a natural stopping point, let it checkpoint.

Now open Cursor and type **Continue.**

If it picks up where the terminal left off — same plan, same decisions, same open items — the layer is working. That handoff between two different vendors' tools, with no copy-paste in between, is the entire point.

## What actually travels

The context object is structured, not a blob of text:

- The current plan
- Ranked key files, chosen by relevance rather than dumped wholesale
- Git state, including the branch and what you have not committed
- Session digests from previous work
- Threads, which give a piece of work a durable identity across tools
- Notes from a connected Obsidian vault, if you have one
- Notion pages, if you have connected them

Everything carries provenance, so a downstream agent can tell what was read by a parser and what was reported by another agent.

The dashboard shows the same object the agents get, so you can check what will travel before either tool loads it:

![The ctxfile Context view: a tree of key files with token counts and redaction badges, git state, vault notes, and sessions from Claude Code, Cursor, and Codex, with a TypeScript file open in a syntax-coloured viewer](/blog/context/context-file.jpg "The Context view in the ctxfile dashboard. Every key file shows its token cost and redactions; the sessions group lists what Claude Code, Cursor, and Codex each did.")

You can click through this view in the [live demo](/demo/#/context) without installing anything.

## An honest boundary

This reduces reconstruction work. It does not give you perfect memory, and it does not make two different models behave identically. Claude and whatever powers your Cursor session will still reach different conclusions sometimes, because they are different models. What changes is that they start from the same facts instead of from nothing.

That is a smaller claim than "shared memory between your AI tools," and it is the one that survives contact with actual use.

## Where your code goes

Nowhere. The default path makes zero network calls — no account, no server, no telemetry. Files matching denied patterns such as \`.env\` and credential files are excluded before anything is read, and secret-shaped strings are redacted before they can enter a snapshot.

The core is Apache-2.0 and the source is public, so this is a claim you can check rather than one you have to take on faith.

To be equally clear about what it does not do: this is not a defence against prompt injection. The benefit is less unnecessary context exposure, not a security boundary.

## Get started

~~~bash
npm install -g ctxfile
ctxfile init
~~~

Then open a second agent and type **Continue.**

The [client setup docs](/docs/clients) cover Codex CLI, Gemini CLI, OpenCode, Aider, Claude Desktop and anything else that speaks MCP.`,
  },

  {
    slug: "claude-code-compact-vs-clear",
    title: "Claude Code /compact vs /clear, and How to Stop Losing Context Between Sessions",
    metaTitle: "Claude Code /compact vs /clear: A Practical Guide (2026)",
    excerpt:
      "Both commands manage the context window and they are not interchangeable. Here is what each one actually does, when to reach for which, and the gap neither of them closes.",
    metaDescription:
      "What /compact and /clear really do in Claude Code, when to use each, and how to keep your working state across sessions and across tools once the window resets.",
    primaryKeyword: "Claude Code /compact vs /clear",
    faq: [
      {
        q: "What is the difference between /compact and /clear in Claude Code?",
        a: "/compact replaces the conversation so far with a summary and keeps the session going; it is lossy and it costs tokens to produce. /clear empties the context window entirely and reloads your project instructions. Use /compact mid-task when the window is filling up, and /clear on a genuine task switch.",
      },
      {
        q: "Does CLAUDE.md survive /clear?",
        a: "Yes. CLAUDE.md is reloaded at the start of every session and after /clear. It holds instructions you maintain by hand; it does not hold working state such as what you decided last session or what is uncommitted right now.",
      },
      {
        q: "How do I keep working state across Claude Code sessions?",
        a: "Snapshot it from the project rather than from memory. ctxfile is a local MCP server that captures the plan, ranked key files, git state and session digests, and serves them to Claude Code or any other MCP client at the start of the next session.",
      },
    ],
    category: "Claude Code",
    date: "2026-07-26",
    readTime: "7 min read",
    body: `Long Claude Code sessions degrade. Answers get vaguer, the model forgets a decision you made an hour ago, and it starts re-reading files it already read. The two commands people reach for are \`/compact\` and \`/clear\`. They do very different things, and using the wrong one costs you either money or your working state.

## What is in the context window

Everything the model can currently see:

- The system prompt and your project instructions
- The full conversation so far
- Every file the agent has read
- Every tool call and its output
- Definitions for connected MCP servers and skills

That last one surprises people. Connect enough servers and a meaningful slice of the window is spent before you type anything.

## /compact: summarise and keep going

\`/compact\` replaces the conversation so far with a summary and continues in the same session. The thread of work survives; the verbatim history does not.

Use it when you are deep in one task and want to keep going. Two things worth knowing:

**Run it proactively.** If you wait for automatic compaction to trigger at the limit, the summary is produced under pressure and tends to be worse. Compacting at a natural pause — a passing test suite, a finished function — gives a cleaner summary because the work is at a coherent boundary.

**It is not free.** Producing the summary means processing the context you are compacting, so it bills against the full window. Compacting every few minutes is a good way to spend tokens achieving nothing.

**It is lossy.** The summary keeps what the summariser judged important. Details it dropped are gone, and you will not get a warning about which ones those were.

## /clear: wipe and start over

\`/clear\` empties the context window. No summary, no carry-over. The next message starts from a clean slate, with your project instructions reloaded.

Use it on a genuine task switch. If you have finished the auth refactor and you are moving to a CSS bug, the entire auth conversation is now noise that will cost you tokens and occasionally mislead the model. Clear it.

The mistake is using \`/clear\` when you meant \`/compact\`, mid-task. That does not reset the noise, it resets **you** — back to explaining the task from scratch.

### Choosing between them

- Still on the same task, window filling up → \`/compact\`
- Finished a task, moving to an unrelated one → \`/clear\`
- Answers going vague and you are not sure why → check what is consuming the window before doing either

## The gap neither command closes

Here is what both have in common: **when the session ends, the working state is gone.**

\`CLAUDE.md\` survives, and it is genuinely useful — it reloads at the start of every session and survives \`/clear\`. But look at what it is. It is a file you write and maintain by hand. It holds instructions and durable facts. It does not hold:

- What you decided in the last session, and why
- Which files you were actually working in
- What is uncommitted right now
- Which of the four possible approaches you already ruled out
- What the next step was going to be

So tomorrow morning, or the moment you switch to Cursor, you start explaining again. Not because the context window was mismanaged, but because that state was never written down anywhere durable.

## Closing it

The missing layer is a snapshot of working state that outlives the session and is readable by any tool.

ctxfile is a local MCP server that builds one. It reads the project directly — plan, ranked key files, git state, session digests, threads — and serves it to any MCP client that asks.

A snapshot takes about two seconds. This is a replay of a real run, in the same event format the dashboard streams:

::demo:snapshot::

~~~bash
npm install -g ctxfile
ctxfile init
~~~

Register it with Claude Code:

~~~bash
claude mcp add ctxfile -- ctxfile --root .
~~~

The workflow becomes:

1. Work as normal. Use \`/compact\` and \`/clear\` exactly as described above — this replaces neither.
2. At a natural stopping point, let the agent checkpoint the session.
3. Tomorrow, in a new session, ask it to load the project context. It calls \`get_context\` and starts with the plan, the decisions and the git state already in hand.
4. Or open a different tool entirely and type **Continue.**

What a checkpointed session looks like the next morning, in the dashboard:

![The ctxfile Sessions view: a session summary at the top, then digests from Claude Code, Cursor, and Codex grouped by day, each with turn count, duration, decisions, and open items](/blog/context/sessions.jpg "Session digests grouped by day. The decisions and open items survive /clear, the end of the session, and a switch to another tool.")

Because the snapshot is rebuilt on every call rather than hand-maintained, it does not drift the way a \`CLAUDE.md\` does. It reports the branch you are actually on, not the one you were on when you last remembered to edit the file.

## Keep the parts that work

None of this replaces \`CLAUDE.md\`. Keep it. Project conventions, architectural rules and "always run the linter before committing" belong in a file you control, and they should be instructions, not state.

The split worth internalising: **\`CLAUDE.md\` is for what you want to be true. A context snapshot is for what is currently true.** The first you write; the second gets read from the repository.

One honest boundary: this reduces the work of rebuilding context. It does not give the model perfect recall, and two different models given the same context will still sometimes reach different conclusions.

## Get started

~~~bash
npm install -g ctxfile
ctxfile init
~~~

Zero network calls by default, no account, Apache-2.0. See the [threads and handoff docs](/docs/threads) for carrying one piece of work across several sessions and tools.`,
  },

  {
    slug: "switch-cursor-to-claude-code-without-losing-context",
    title: "How to Switch from Cursor to Claude Code Without Losing Your Context",
    metaTitle: "Switch from Cursor to Claude Code Without Losing Context (2026)",
    excerpt:
      "The hard part of the migration is not learning the new tool. It is that everything Cursor knows about your project stays in Cursor. Here is what does not transfer, and how to carry it across.",
    metaDescription:
      "Moving from Cursor to Claude Code? Your rules, decisions and working state do not transfer automatically. Here is exactly what is lost and how to carry your context across.",
    primaryKeyword: "switch from Cursor to Claude Code",
    faq: [
      {
        q: "What do I lose when I switch from Cursor to Claude Code?",
        a: "Your .cursor/rules files (Claude Code reads CLAUDE.md instead), Cursor's workspace index, and everything in Cursor's chat history: the decisions, the ruled-out approaches, and where you had got to. The rules take twenty minutes to rewrite; the decisions are the expensive part.",
      },
      {
        q: "Can I use Cursor and Claude Code on the same project at the same time?",
        a: "Yes, and most people end up doing exactly that. Register both as MCP clients of one local ctxfile server and each one starts from the same plan, key files, git state and session digests, so moving between them costs nothing.",
      },
      {
        q: "Is switching reversible?",
        a: "When context belongs to the project rather than to a tool, yes. Nothing you built up is locked inside Claude Code, so going back to Cursor is a no-op.",
      },
    ],
    category: "Workflows",
    date: "2026-07-26",
    readTime: "7 min read",
    body: `Plenty of guides cover installing Claude Code and learning its commands. That part takes an afternoon. The part that actually stings is that months of accumulated project understanding live inside Cursor, and none of it comes with you.

This post is about that second part.

## What does not transfer

**Your rules files.** Cursor keeps project instructions in \`.cursor/rules/*.mdc\` (the older \`.cursorrules\` format is deprecated). Claude Code reads \`CLAUDE.md\`. Different formats, different conventions, no converter. Rewriting them by hand is tedious and — more importantly — lossy, because you will rewrite what you remember mattering.

**Your workspace index.** Cursor maintains its own index of your codebase. It does not travel and it has no equivalent to export.

**Everything expensive.** The decisions, the ruled-out approaches, the plan you converged on, the gotcha you hit last Tuesday. That lives in Cursor's chat history and in your head. There is no export button for it, and it is the only part that is genuinely hard to reconstruct.

A rules file you can rewrite in twenty minutes. Three weeks of "we tried that, it does not work because of the connection pooling" you cannot.

## The manual path, honestly assessed

You can do this by hand:

1. Open your \`.cursor/rules/*.mdc\` files and rewrite them as \`CLAUDE.md\`.
2. Scroll back through recent Cursor conversations and write down the decisions worth keeping.
3. Note where you had got to.
4. Paste all of it into a fresh Claude Code session.

This works. It takes an afternoon, it captures maybe two-thirds of what mattered, and you have to repeat it every time you switch back. Which you will, because most people end up using both.

## The portable path

The alternative is to stop treating context as something that belongs to a tool.

Both Cursor and Claude Code are MCP clients. Point them at one local server that reads the project directly, and the migration stops being a migration — it becomes two clients reading the same context.

Install it:

~~~bash
npm install -g ctxfile
ctxfile init
~~~

\`ctxfile init\` detects the project and the harnesses you already use. Run it before you switch, while Cursor is still your main tool.

**While still in Cursor**, register the server so it can start checkpointing your work. Add to \`.cursor/mcp.json\`:

~~~json
{
  "mcpServers": {
    "ctxfile": {
      "command": "ctxfile",
      "args": ["--root", "."]
    }
  }
}
~~~

Work as normal for a day. Let sessions get checkpointed at natural stopping points, so decisions and open items land in threads rather than only in Cursor's history.

**Then register Claude Code:**

~~~bash
claude mcp add ctxfile -- ctxfile --root .
~~~

Open it and type **Continue.**

It calls \`get_context\`, and starts with the plan, the ranked key files, the git state and the decisions from your Cursor sessions already loaded. You did not rewrite anything.

Sessions from Cursor, Claude Code, and Codex sit side by side in the dashboard, grouped by day. The tool you open next reads all of them:

![The ctxfile Sessions view showing digests from Claude Code, Cursor, and Codex on different days, with per-source filters and a session summary](/blog/context/sessions.jpg "Three tools, one session history. The filters at the top narrow to a single source; the summary at the top is what a fresh session reads first.")

## You probably want both anyway

The framing of "switching" is usually wrong. The two tools are good at different things: Cursor for inline edits and tight review loops, Claude Code for longer autonomous runs in the terminal. Most people who try to pick one end up using both.

That is only painful when context belongs to a tool. Once it belongs to the project, moving between them costs nothing, and you can keep whichever workflow suits the task in front of you.

It also means the decision is reversible. If Claude Code does not suit you, going back is a no-op, because nothing you built up got locked into it.

## What carries across

- The current plan
- Ranked key files, selected by relevance rather than dumped
- Git state, including uncommitted work
- Session digests from previous work in either tool
- Threads, which give a piece of work a durable identity across providers
- Notion pages and Obsidian notes, if connected

Each entry is tagged with its source, so an agent can tell what a parser read from what another agent reported.

Here is the shape of the object, scope by scope. The \`full\` scope is what a fresh Claude Code session asks for:

::demo:payload::

## The boundary worth stating

Carrying context across is not the same as making two models behave the same way. Different models reach different conclusions from identical inputs, and no amount of shared context changes that. What you avoid is the cold start — the twenty minutes of re-explanation before the new tool is useful.

## Where the data lives

On your machine. The default path makes zero network calls: no account, no upload, no telemetry. Denied paths such as \`.env\` files are excluded before ingestion, and secret-shaped text is redacted before it can enter a snapshot. The core is Apache-2.0, so you can read exactly what it does.

## Get started

~~~bash
npm install -g ctxfile
ctxfile init
~~~

Register both tools, then type **Continue** in whichever one you opened second. Setup for [every supported client](/docs/clients) — Codex CLI, Gemini CLI, OpenCode, Aider, Claude Desktop — is in the docs.`,
  },

  {
    slug: "connect-obsidian-vault-to-ai-agents",
    title: "Connect Your Obsidian Vault to Claude Code, Cursor, and Any AI Agent",
    metaTitle: "Connect Your Obsidian Vault to Claude Code and Cursor (Locally)",
    excerpt:
      "Your vault holds the reasoning behind your project. Your coding agent cannot see any of it. Here is how to give agents read-only access to the notes that matter right now, without uploading your vault anywhere.",
    metaDescription:
      "Give Claude Code, Cursor and any MCP agent read-only access to your Obsidian vault. Local, no sync, no upload: ranked note selection that puts the right notes in context.",
    primaryKeyword: "connect Obsidian to AI agent",
    faq: [
      {
        q: "Can Claude Code or Cursor read my Obsidian vault?",
        a: "Through ctxfile, yes, read-only. The vault connector reads any local folder of Markdown, ranks notes by pins, relevance to your recent threads, wikilink neighbours and recency, and includes the selected notes in the context object every MCP client loads.",
      },
      {
        q: "Is my vault uploaded anywhere?",
        a: "No. Notes are read from disk when a snapshot is built and never synced. They are excluded from repo-safe exports, pass through the same secret redaction as everything else, and the default path makes zero network calls.",
      },
      {
        q: "Do I need Obsidian installed?",
        a: "No. The connector reads plain Markdown files. ctxfile init looks for a nearby .obsidian directory to offer a vault automatically, but any folder of notes can be configured explicitly.",
      },
    ],
    category: "Connectors",
    date: "2026-07-26",
    readTime: "8 min read",
    body: `You keep a vault. The architecture decision from March is in there, with the reasoning. So is the meeting note explaining why the API is shaped the way it is, and the running list of things that broke.

Your coding agent cannot see any of it. So you re-explain, from memory, badly.

## The obvious approach does not work

The instinct is to give the agent the whole vault. Point it at the folder, let it read everything.

This fails for a boring reason: a vault of any size does not fit in a context window, and even when it does, filling the window with a thousand notes is close to useless. Ninety-nine percent of them are irrelevant to what you are doing right now, and they crowd out the code the agent actually needs to read.

Dumping everything and giving nothing produce surprisingly similar results.

The real problem is **selection**. Which handful of notes matter for the task in front of you, right now?

## How ctxfile picks notes

ctxfile ships a read-only Obsidian vault connector in the free core, as of v0.4.0. It reads any local folder of Markdown — you do not need Obsidian itself, just the files — and ranks notes into tiers:

1. **Pinned notes first.** Add \`ctxfile: pin\` to a note's frontmatter and it is always included. This is your override for the three notes that are always relevant.
2. **Notes relevant to what you are working on.** Relevance is scored against the tags and title tokens of your recent threads, so the selection shifts as your work does.
3. **One-hop wikilink neighbours.** If a selected note links to another with \`[[wikilinks]]\`, that neighbour gets a boost and a short preview. Your vault's own link structure is a signal about what belongs together.
4. **Everything else**, with relevance and then recency breaking ties.

Selection runs against a token budget, so the notes section stays proportionate instead of swallowing the snapshot.

It is also PARA-aware: if your vault uses that structure, Archive and Resources are off by default, because archived material is rarely what you need mid-task.

## Setup

~~~bash
npm install -g ctxfile
ctxfile init
~~~

\`ctxfile init\` looks for a nearby \`.obsidian/\` directory and offers to connect the vault it finds. Confirm, and the notes section starts appearing in your snapshots.

If your notes live somewhere non-standard, or you keep several vaults, configure them explicitly — see the [connectors documentation](/docs/connectors).

Then register whichever agent you use. Claude Code:

~~~bash
claude mcp add ctxfile -- ctxfile --root .
~~~

Cursor, in \`.cursor/mcp.json\`:

~~~json
{
  "mcpServers": {
    "ctxfile": {
      "command": "ctxfile",
      "args": ["--root", "."]
    }
  }
}
~~~

The same works for Codex CLI, Gemini CLI, OpenCode, Claude Desktop, and anything else speaking MCP.

## What the agent receives

Selected notes arrive as a \`notes[]\` section inside the context object, each stamped with provenance \`source: obsidian\`. The agent can tell a vault note from a source file from a git fact, which matters — a note is something you believed when you wrote it, not something read from the code today.

In practice: ask your agent why the sync layer is designed the way it is, and instead of guessing from the implementation, it answers from the note where you worked it out.

This is what a selected note looks like in the dashboard, rendered from the same object the agent receives:

![A vault note open in the ctxfile Context view: the note rendered as Markdown with its tags, a pinned badge, token count, and two linked notes previewed underneath](/blog/context/context-note.jpg "A pinned vault note inside the context, with its tags and one-hop wikilink previews. The agent sees this section stamped source: obsidian.")

Try it in the [live demo](/demo/#/context): the notes group sits between git state and sessions.

## The privacy rules, precisely

This is a read-only connector and the constraints are deliberately strict:

- **The vault is never synced or uploaded.** It is read from disk when a snapshot is built. That is all.
- **It is excluded from repo-safe exports.** When you export a context file to commit alongside your repository, vault notes are left out. Your private thinking does not end up in a pull request.
- **It passes through redaction.** Notes go through the same secret-scrubbing as everything else, so an API key pasted into a note does not travel into a snapshot.
- **Denied paths still apply.** Credential files are excluded before anything is read.

And the default path still makes zero network calls. Connecting a vault does not turn anything on.

## What this is not

ctxfile does not build a knowledge graph, run synthesis over your notes, or try to be a second brain. Obsidian is already good at that and replacing it is not interesting.

The division is deliberate. **Your vault stays in Obsidian. ctxfile makes the relevant part of it portable**, so your Claude Code session, your Codex session and your Cursor window can all load the same notes without you re-explaining. Nothing is written back; nothing is reorganised; your notes stay yours in the format you chose.

It also does not defend against prompt injection. A note containing hostile instructions is still a note containing hostile instructions. The benefit here is relevance and reduced exposure, not a security boundary.

## Get started

~~~bash
npm install -g ctxfile
ctxfile init
~~~

Free, Apache-2.0, local. Then ask your agent something only your notes know, and see whether it answers.`,
  },

  {
    slug: "build-local-first-mcp-server-typescript",
    title: "How to Build a Local-First MCP Server in TypeScript",
    metaTitle: "How to Build a Local-First MCP Server in TypeScript",
    excerpt:
      "Most MCP tutorials build a server that calls a remote API. This one builds a server that never leaves the machine, and covers the design rules that keep it that way.",
    metaDescription:
      "Build an MCP server in TypeScript that makes zero network calls: stdio transport, Zod-validated tools, secret redaction and deny-paths. With a working example you can run.",
    primaryKeyword: "build local-first MCP server TypeScript",
    faq: [
      {
        q: "What makes an MCP server local-first?",
        a: "It runs on the user's machine, talks to the client over stdio rather than a network port, reads data that is already on disk, and makes no outbound calls unless the user opts in. Deny-paths and secret redaction keep credentials out of anything the model sees.",
      },
      {
        q: "When should an MCP server use HTTP instead of stdio?",
        a: "Only when the client is not on the same machine: a browser-based chat product, a CI job, or a hosted agent. That changes the security model, so bind to loopback by default and require an explicit opt-in for anything wider.",
      },
      {
        q: "Is there a working example of a local-first MCP server?",
        a: "ctxfile is an Apache-2.0 local-first MCP server built on these rules. It snapshots a project's plan, key files, git state and session digests and serves them to any MCP client with zero network calls by default.",
      },
    ],
    category: "Engineering",
    date: "2026-07-26",
    readTime: "10 min read",
    body: `The Model Context Protocol is an open standard for connecting AI clients to data and tools. Most tutorials demonstrate it by wrapping a remote API — fetch the weather, query a SaaS product.

Local-first servers are a different and, for a lot of use cases, better shape. The data is already on the machine. There is no reason to send it anywhere, and several reasons not to. This post builds one and covers the design rules that keep it honest.

## The model in one paragraph

An MCP **server** exposes capabilities. A **client** — Claude Code, Cursor, Claude Desktop, Codex CLI, Gemini CLI — connects and uses them. Servers expose **tools** (things the model can call), **resources** (things it can read) and **prompts** (reusable templates). Because the protocol is a standard, one server works with every compliant client, today's and next year's.

## A minimal server

Start a project:

~~~bash
mkdir my-mcp-server && cd my-mcp-server
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node
~~~

Set \`"type": "module"\` in \`package.json\` — the SDK is ESM.

Now the server:

~~~typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import path from "node:path";

const server = new McpServer({ name: "my-server", version: "0.1.0" });
const ROOT = process.cwd();

server.registerTool(
  "read_project_file",
  {
    description: "Read a UTF-8 file from the project directory.",
    inputSchema: {
      relativePath: z.string().min(1).describe("Path relative to the project root"),
    },
  },
  async ({ relativePath }) => {
    // Resolve and confirm containment before touching the filesystem, so
    // "../../.ssh/id_rsa" cannot escape the root.
    const target = path.resolve(ROOT, relativePath);
    if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
      return { content: [{ type: "text", text: "Path is outside the project root." }] };
    }

    const body = await readFile(target, "utf8");
    return { content: [{ type: "text", text: body }] };
  }
);

await server.connect(new StdioServerTransport());
console.error("my-server running on stdio");
~~~

Compile it, then register it with a client:

~~~bash
claude mcp add my-server -- node /absolute/path/to/dist/index.js
~~~

### The one mistake that will cost you an afternoon

Look at that last line again:

~~~typescript
console.error("my-server running on stdio");
~~~

**Never \`console.log\` in a stdio MCP server.** stdout is the JSON-RPC transport. Anything you print there is injected into the protocol stream and corrupts it, and the failure mode is a client that mysteriously will not connect with no useful error.

Every diagnostic goes to stderr. This is the single most common way a first MCP server fails.

## Making it local-first

A server that reads local files but phones home is not local-first. Four rules make the difference.

### 1. Zero network calls on the default path

Not "we do not send anything sensitive" — no outbound requests at all unless the user has explicitly configured a feature that needs one. That makes the promise verifiable: someone can run your server behind a firewall, or watch it with a proxy, and confirm silence.

Anything that does need the network — a remote model, a sync service, telemetry — is opt-in, off by default, and loudly flagged.

### 2. Deny sensitive paths before reading

Do not read the file and then decide. Exclude by pattern first:

~~~typescript
const DENIED = [/(^|\\/)\\.env(\\..*)?$/, /(^|\\/)\\.git\\//, /id_rsa|\\.pem$|credentials?\\.json$/];

function isDenied(relativePath: string): boolean {
  return DENIED.some((pattern) => pattern.test(relativePath));
}
~~~

The ordering matters. A file you never opened cannot leak through an error message, a log line or a partially-built response.

### 3. Redact before returning

Deny-lists catch files with predictable names. They do not catch an API key pasted into a README. Run outbound content through a redaction pass:

~~~typescript
const SECRET_PATTERNS: RegExp[] = [
  /\\bsk-[A-Za-z0-9]{20,}\\b/g,              // common API key shape
  /\\bghp_[A-Za-z0-9]{36}\\b/g,              // GitHub token
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
];

function redact(text: string): string {
  return SECRET_PATTERNS.reduce((acc, p) => acc.replace(p, "[redacted]"), text);
}
~~~

This is defence in depth, not a guarantee. Say so in your README rather than implying it is airtight.

### 4. Keep tool schemas tight

Every tool schema is documentation the model reads. Loose schemas produce malformed calls and wasted turns:

~~~typescript
inputSchema: {
  scope: z.enum(["plan", "files", "git", "all"]).describe("Which slice to return"),
  maxTokens: z.number().int().min(100).max(50_000).default(8_000),
}
~~~

An enum eliminates a whole class of invalid input. Bounds stop a model from asking for a response that will not fit anywhere.

## When to move past stdio

stdio is right for a local server: the client spawns your process, no ports, no auth, nothing listening. Keep it unless you specifically need otherwise.

You need HTTP when the client is not on the machine — a browser-based chat product, a CI job, a hosted agent. That changes the security model completely. Now you need authentication, you are exposing a listening socket, and "local-first" only holds if the thing on the other end is still yours. If you go there, bind to loopback by default and require an explicit opt-in for anything wider.

## A worked example

[ctxfile](https://github.com/ctxfile/ctxfile) is an Apache-2.0 local-first MCP server built on these rules, and the source is public if you want to see them applied at more than tutorial scale. It snapshots a project's working state — plan, ranked key files, git state, session digests — and serves it to any MCP client through five tools: \`get_context\`, \`save_session\`, \`continue_thread\`, \`list_threads\` and \`ingest_context\`.

Things worth reading in it: the redaction pass and deny-path handling, the token-budgeted file selection (choosing which files matter is most of the difficulty), and the export path, which produces a repo-safe context file containing a manifest of key files rather than their contents.

What the rules above look like once they are running. Every number here comes from a local run; the redaction count is the deny-path and secret-scrubbing pass doing its job:

![The ctxfile dashboard Overview after a snapshot: a token budget gauge, connector timing bars for file, git, notion, ollama and sessions, counts for key files and redactions, a usage chart, and the heaviest files](/blog/context/overview.jpg "The Overview of a local-first server: connector timing, token budget against a 50k limit, redactions counted, and the files that cost the most.")

## Shipping it

Publish to npm so people can install it without cloning, then list it on the [MCP Registry](https://modelcontextprotocol.io) so clients can discover it.

Two things to get right in the README: the exact registration command for each client you support, and a plain statement of what your server does and does not send anywhere. For a local-first tool, that second one is the feature.

## Try one that already works

A snapshot run, replayed in the wire format the real server streams to its dashboard (connector:start, connector:done, tokens, done):

::demo:snapshot::

~~~bash
npm install -g ctxfile
ctxfile init
~~~

Zero network calls by default, Apache-2.0, and the [source](https://github.com/ctxfile/ctxfile) is there to read. The [live demo](/demo/) runs the dashboard over a sample project if you want to see the output before you build your own.`,
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}

/** Newest first — the order the index and the sitemap both present. */
export function getSortedPosts(): BlogPost[] {
  return [...blogPosts].sort((a, b) => b.date.localeCompare(a.date));
}
