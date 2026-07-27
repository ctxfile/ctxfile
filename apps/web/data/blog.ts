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
    slug: "share-context-between-claude-code-and-cursor",
    title: "How to Share Context Between Claude Code and Cursor",
    metaTitle: "How to Share Context Between Claude Code and Cursor (2026)",
    excerpt:
      "You explain the project to Claude Code in the terminal, then open Cursor and explain it again. Neither tool can read the other's memory. Here is why, what the common workarounds get wrong, and how to give both of them one shared context layer.",
    metaDescription:
      "Claude Code and Cursor keep separate context and cannot read each other. Here is how to connect both to one local, shared context layer so your plan, files and git state travel between them.",
    primaryKeyword: "share context between Claude Code and Cursor",
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

## Shipping it

Publish to npm so people can install it without cloning, then list it on the [MCP Registry](https://modelcontextprotocol.io) so clients can discover it.

Two things to get right in the README: the exact registration command for each client you support, and a plain statement of what your server does and does not send anywhere. For a local-first tool, that second one is the feature.

## Try one that already works

~~~bash
npm install -g ctxfile
ctxfile init
~~~

Zero network calls by default, Apache-2.0, and the [source](https://github.com/ctxfile/ctxfile) is there to read.`,
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}

/** Newest first — the order the index and the sitemap both present. */
export function getSortedPosts(): BlogPost[] {
  return [...blogPosts].sort((a, b) => b.date.localeCompare(a.date));
}
