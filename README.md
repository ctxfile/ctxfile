<p align="center">
  <img src="apps/web/public/brand/logo-mark-256.png" alt="ctxfile" width="96" height="96" />
</p>

<h1 align="center">ctxfile</h1>

<p align="center"><strong>One context, every agent, all local.</strong></p>

<p align="center">
  <a href="https://github.com/ctxfile/ctxfile/actions/workflows/ci.yml"><img src="https://github.com/ctxfile/ctxfile/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/ctxfile"><img src="https://img.shields.io/npm/v/ctxfile" alt="npm" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0" /></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-2025--11--25-black" alt="MCP" /></a>
  <a href="https://github.com/ctxfile/ctxfile/stargazers"><img src="https://img.shields.io/github/stars/ctxfile/ctxfile?style=social" alt="GitHub stars" /></a>
</p>

<p align="center">
  <a href="https://ctxfile.dev">Website</a> ·
  <a href="https://ctxfile.dev/docs">Docs</a> ·
  <a href="#30-second-quickstart">Quickstart</a> ·
  <a href="https://ctxfile.dev/convention">The .ctxfile convention</a> ·
  <a href="https://ctxfile.dev/security">Security</a>
</p>

---

You work with more than one AI agent. Claude Code in the terminal, Cursor in the editor, a chat tab for thinking. Each one starts cold, because your working state (the plan, the key files, the git state, what you decided an hour ago) lives in your head and in scrollback.

**ctxfile** is a local-first [MCP](https://modelcontextprotocol.io) server that snapshots your project's working state into one structured context object, and hands it to any MCP agent in a single call. Save a session in one agent, continue it in another. Nothing leaves your machine.

```
you → ctxfile → the same context, in every agent
```

## 30-second quickstart

**Claude Code**

```bash
claude mcp add ctxfile -- npx -y ctxfile
```

**Cursor** (`.cursor/mcp.json` in your project, or `~/.cursor/mcp.json` globally)

```json
{
  "mcpServers": {
    "ctxfile": { "command": "npx", "args": ["-y", "ctxfile"] }
  }
}
```

**Claude Desktop**: download `ctxfile.mcpb` from [releases](https://github.com/ctxfile/ctxfile/releases) and drag it into Settings → Extensions.

**Any other MCP client**: it is a standard stdio server. `npx -y ctxfile` is the whole command.

Then, in your agent: *"load my context"* (or call `get_context`). Requires Node ≥ 20 (≥ 22 on Windows).

## Private by default

This is the part we care about most, so it goes first:

- The default path makes **zero network calls**. Files and git only.
- Secret-looking content (cloud keys, tokens, private keys, JWTs, `password=` assignments) is **redacted before it enters the snapshot**. `.env*`, key files, and credential files are never read at all.
- Core is **read-only** over your project. It never writes to your repo, your git state, or anything else.
- **No telemetry by default.** An anonymous weekly install ping exists, and it is opt-in only.
- Network connectors (Notion, local Ollama summarization, Sync) activate only when you explicitly configure them.

The full model, including what Pro and Sync add and what they can never see, is documented at [ctxfile.dev/security](https://ctxfile.dev/security).

## What it does

| | |
|---|---|
| **Snapshot** | `get_context` returns one structured `ContextObject`: plan docs, ranked key files fitted to a token budget, git state, optional Notion pages and local-LLM summary. |
| **Save and resume** | `save_session` stores an agent-written summary of the current conversation. `continue_thread` hands the merged, provenance-labeled history to the next agent. Different harness, different provider, cold start: it picks up where you left off. |
| **Threads** | Durable identities for a piece of work ("Q3 campaign"), spanning agents and machines. `handoff: true` enforces a complete takeover package: state, decisions with rationale, ordered open items, gotchas. |
| **Universal ingest** | `ingest_context` is the schema-enforced door for any harness without a native parser. The prompt is the adapter, so every MCP-speaking agent is supported, including ones that do not exist yet. |
| **Cloud agents** | `ctxfile export` writes a static, repo-safe artifact for agents that never touch your machine (hosted coding agents, CI). The format is an open spec: [the .ctxfile convention](https://ctxfile.dev/convention). |
| **Dashboard** | `ctxfile ui`: a local cockpit on 127.0.0.1. Run snapshots, watch connectors, browse context, inspect git state. |
| **Sync (optional)** | An end-to-end encrypted vault through a relay you can self-host. Argon2id key derivation, XChaCha20-Poly1305 per blob. The relay stores ciphertext only. |

## The monorepo

| Package | What | License |
|---|---|---|
| [`packages/core`](packages/core) | `ctxfile` on npm: the MCP server, snapshot engine, threads, ingest, export, Sync client, dashboard host | Apache-2.0 |
| [`packages/relay`](packages/relay) | `@ctxfile/relay` on npm: the self-hostable Sync relay and team hub (encrypted vaults, `/mcp` endpoint, federation, audit log). One Docker image | Apache-2.0 |
| [`packages/dashboard`](packages/dashboard) + [`packages/ui-kit`](packages/ui-kit) | The local instrument UI served by `ctxfile ui` | Apache-2.0 |
| [`apps/web`](apps/web) | [ctxfile.dev](https://ctxfile.dev): site and docs | Apache-2.0 |

## Open core, honestly

Everything in this repo is Apache-2.0 and works standalone, forever. The paid [Pro](https://ctxfile.dev/pricing) add-on (a separate, closed package) adds session connectors that read your recent sessions from **Claude Code, Cursor, Codex CLI, OpenCode, Gemini CLI, Aider, OpenClaw, and Hermes Agent**, plus encrypted cross-session memory, multi-provider consult, and local voice capture. Licensing is an Ed25519-signed key verified **offline**. No phone-home, ever. Pro funds the open-source work.

## Contributing

We want your issues, your PRs, and your weird harness reports. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Every ingested format, every MCP client quirk, every redaction gap you find makes the whole thing better.

- **Bugs and features**: [issues](https://github.com/ctxfile/ctxfile/issues)
- **Questions and show-and-tell**: [discussions](https://github.com/ctxfile/ctxfile/discussions)
- **Security reports**: [SECURITY.md](SECURITY.md) (please do not open public issues for vulnerabilities)

```bash
git clone https://github.com/ctxfile/ctxfile.git && cd ctxfile
npm install
npm run build && npm test    # the whole gate: lint, typecheck, tests
```

## Star history

If ctxfile saves you a cold start, [a star](https://github.com/ctxfile/ctxfile) is how other people find it.

<a href="https://star-history.com/#ctxfile/ctxfile&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=ctxfile/ctxfile&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=ctxfile/ctxfile&type=Date" />
    <img alt="Star history chart" src="https://api.star-history.com/svg?repos=ctxfile/ctxfile&type=Date" />
  </picture>
</a>

## License

[Apache-2.0](LICENSE). "ctxfile" and the ctxfile logo are trademarks of ctxfile; the license covers the code, not the name.
