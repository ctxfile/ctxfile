# ctxfile

**Give any AI agent your project's full working state in one call — without your code ever leaving your machine.**

ctxfile is a local-first [MCP](https://modelcontextprotocol.io) server that snapshots a project's working state — plan documents, key files, git state, and optionally Notion pages and a local-LLM summary — into one structured context object, served over stdio to Claude Code, Cursor, Claude Desktop, or any MCP client.

## 30-second install

**Claude Code**

```bash
claude mcp add ctxfile -- npx -y ctxfile
```

**Cursor** — add to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "ctxfile": {
      "command": "npx",
      "args": ["-y", "ctxfile"]
    }
  }
}
```

Or click: [Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=ctxfile&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImN0eGZpbGUiXX0=)

**Claude Desktop** — download `ctxfile.mcpb` from the releases page and drag it into Settings → Extensions, or add the JSON above to `claude_desktop_config.json`.

## What you get

| Surface | What it returns |
|---|---|
| `context://current` resource | Full `ContextObject` (JSON) |
| `context://plan` resource | Just the plan document |
| `context://git` resource | Just the git state |
| `get_context` tool | Same data, model-pullable, with optional `scope`: `full` \| `plan` \| `files` \| `git` |
| `save_session` tool | The agent summarizes *this* conversation and stores it, optionally on a named **thread**; `handoff: true` enforces a complete takeover package ([threads & handoff](https://ctxfile.dev/docs/threads)) |
| `continue_thread` tool | Merged, chronological, provenance-labeled history of a thread — resume work started on any other agent |
| `list_threads` tool | The user's threads with session counts and last-active times |
| `ingest_context` tool | Enveloped bulk door, same schema family — universal session capture for harnesses without a parser ([schema + prompt snippets](https://ctxfile.dev/docs/ingest)) |
| `load-context` prompt | Injects the snapshot into the conversation |
| `ctx-save` / `ctx-continue` prompts | One-tap save/resume on clients that surface MCP prompts |

The `ContextObject`:

```jsonc
{
  "meta": { "version": "0.1.0", "root": "...", "tokenBudget": 50000, "tokensUsed": 12345, "connectors": [...] },
  "plan": "# The Plan ...",            // from PLAN.md / TODO.md / docs/plan*.md
  "keyFiles": [{ "path": "src/index.ts", "tokens": 812, "truncated": false, "redactions": 0, "content": "..." }],
  "gitState": { "branch": "main", "staged": [], "modified": [], "untracked": [], "commits": [...], "diffSummary": "..." },
  "notionPages": [],                    // opt-in
  "sessionSummary": null                // opt-in (local Ollama)
}
```

Files are selected by rank (plan docs → README → manifests → entry points → recently modified), `.gitignore`-aware, capped per-file, and greedily fitted to a token budget.

With an active [Pro](https://ctxfile.dev/pricing) license the server also registers `remember` / `recall` / `forget` (AES-256-GCM encrypted cross-session memory, key in the OS keychain), `consult` (ask several providers the same question over live context), and `transcribe_voice` (local whisper.cpp) — each gated on its licensed feature, and the snapshot gains `sessions`: redacted digests of your recent sessions from **Claude Code, Cursor, Codex CLI, OpenCode, Gemini CLI, Aider, OpenClaw, and Hermes Agent**, so an agent in one tool picks up where an agent in another left off. Licensing is an Ed25519-signed key verified offline (`ctxfile activate <key>`); no phone-home, ever.

On any *other* harness (or when a parser breaks), the free fallback is `ingest_context`: paste a short prompt, the agent digests its own session and pushes it in — strict schema, redacted, provenance-stamped `reported_by: agent`, reviewable via `ctxfile ingest list` / `rm <id>`. Parsers win on conflicts. The prompt is the adapter, so every MCP-speaking harness is supported, including ones that don't exist yet.

**Threads** make that portable across providers: save a session to a named thread ("Q3 campaign") from one agent, and `continue_thread` hands the merged, provenance-labeled history to the next one — different harness, different model provider, cold start. When the user hands work to another agent or person, `handoff: true` makes validation require the full takeover package (state, decisions with rationale, ordered open items, gotchas, artifacts with roles, a suggested first prompt), so any agent produces the same artifact. Pro also gets `ctxfile serve`: the same five tools over Streamable HTTP with scoped bearer tokens — the local door of the [Sync & roaming](https://ctxfile.dev/docs/sync) lane.

## Cloud agents: `ctxfile export`

Agents that don't run on your machine (hosted coding agents, CI bots) read a static artifact instead of MCP:

```bash
ctxfile export             # writes .ctxfile/context.json + context.md (repo-safe profile)
ctxfile export --stdout    # pipe the JSON envelope anywhere
ctxfile hooks install      # pre-commit: refresh + stage the artifact on every commit
```

The default **repo-safe** profile ships plan, git state, and a key-file manifest only — no file bodies, Notion content, or session digests (those need an explicit `--profile full`, which warns loudly). Every profile re-runs secret redaction, and your absolute local path never appears in an export. The versioned file format is a public spec: [the .ctxfile convention](https://ctxfile.dev/convention).

## Local dashboard

```bash
ctxfile ui
```

A cockpit bound to `127.0.0.1` (token-gated URL, strict CSP, never network-exposed): run snapshots and watch connectors live, browse the captured context, inspect git state, manage Pro memory, and activate licenses. Press `R` to snapshot, `⌘K` for the command palette.

## Privacy

**Nothing leaves your machine by default.**

- The default path (files + git) makes **zero network calls**.
- Secret-looking content (AWS keys, GitHub/Notion/Slack tokens, private keys, JWTs, quoted `password=`/`api_key=` assignments) is **redacted** before it enters the snapshot; `.env*`, key files, and credential files are **never read at all**.
- The Notion connector activates only when you set `NOTION_TOKEN` **and** list page IDs in config.
- Summarization activates only when you set `ollama.summarize: true`, and it talks to your **local** Ollama.
- **No telemetry by default.** An anonymous weekly ping (random install UUID, version, OS platform name — never code, paths, or content) exists solely to count active installs, and only runs if you explicitly set `telemetry.enabled: true`.

## Configuration

Optional `.ctxfile.json` in your project root:

```jsonc
{
  "tokenBudget": 50000,        // total token budget for the snapshot
  "maxFileTokens": 4000,       // per-file cap (head+tail truncation beyond it)
  "exclude": ["fixtures/"],    // extra gitignore-style excludes
  "cacheMaxAgeMs": 30000,      // serve a cached snapshot younger than this
  "notion": { "pageIds": ["<page-id>"] },   // requires NOTION_TOKEN env var
  "ollama": { "summarize": true, "model": "qwen3:4b" },  // OLLAMA_BASE_URL overrides endpoint
  "export": { "profile": "repo-safe" },     // default profile for `ctxfile export`
  "telemetry": { "enabled": false }  // opt-in anonymous weekly install ping; off by default
}
```

CLI:

```
ctxfile [--root <dir>] [--config <path>]   # the MCP server (stdio)
ctxfile serve [--port <n>] [--host <h>]    # the HTTP door (Pro): same tools over Streamable HTTP
ctxfile ui [--port <n>] [--no-open]        # local dashboard on 127.0.0.1
ctxfile export [--profile <p>] [--stdout]  # write the .ctxfile convention artifact
ctxfile hooks install|uninstall            # managed pre-commit export refresh
ctxfile ingest list|rm <id>                # review agent-reported sessions
ctxfile threads                            # list threads (durable, resumable work identities)
ctxfile vault create|join|status           # encrypted Sync vault on a relay (passphrase via env)
ctxfile sync                               # push/pull sessions + threads through the vault
ctxfile activate <license-key>             # store + verify a Pro license (offline)
ctxfile --version | --help
```

Sync is client-side encrypted (Argon2id key derivation, XChaCha20-Poly1305 per blob, opaque blob ids): the relay — hosted at sync.ctxfile.dev, or self-hosted from the open-source [`@ctxfile/relay`](https://ctxfile.dev/docs/sync) — stores ciphertext only. Standard-mode vaults let chat surfaces save and resume threads through the relay's MCP endpoint; Strict-mode vaults trade that roaming for true end-to-end encryption.

Full reference: [ctxfile.dev/docs](https://ctxfile.dev/docs) (CLI, MCP surface, configuration, connectors, dashboard, privacy).

## Supported clients

| Client | Status |
|---|---|
| Claude Code | ✅ tested |
| Cursor | ✅ (2 core tools, 7 with full Pro — far under the 40-tool cap) |
| Claude Desktop | ✅ via `.mcpb` or JSON config |
| Cline / Windsurf / custom SDK clients | ✅ generic stdio MCP |

## Security notes

- Content from files and Notion is **untrusted data**. The tool description and prompt explicitly tell models not to follow instructions embedded in it, but downstream agents vary — see [SECURITY.md](https://github.com/ctxfile/ctxfile/blob/main/SECURITY.md).
- File access is scoped to the single configured root; the server never writes to your repo, Notion, or git state.
- Verify with the MCP Inspector: `npx @modelcontextprotocol/inspector npx -y ctxfile` (use Inspector ≥ 0.14.1).

## Development

```bash
npm install
npm run build      # tsup → dist/
npm test           # vitest
npm run typecheck && npm run lint
npm run mcpb:pack  # build ctxfile.mcpb (platform-specific: bundles native sqlite)
```

Architecture: `src/server.ts` is the only module that imports the MCP SDK (spec-churn isolation); connectors in `src/connectors/` are independently failable — a broken connector degrades to an `error` entry in `meta.connectors`, never a crashed snapshot.

## License

[Apache-2.0](LICENSE). "ctxfile" and the ctxfile logo are trademarks of ctxfile; the Apache-2.0 license covers the code, not the name.
