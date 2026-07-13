# CLAUDE.md

Guidance for AI coding agents working in this repository.

## Project

**ctxfile** — a local-first MCP server (stdio + Streamable HTTP, MCP spec 2025-11-25, SDK v1.x) that snapshots a project's working state into a structured `ContextObject`, with cross-provider threads and an end-to-end encrypted Sync vault. Open-core monorepo:

- `packages/core` — `ctxfile` (Apache-2.0, published to npm). MCP server (stdio + `ctxfile serve`), snapshot engine, file/git/Notion/Ollama connectors, SQLite cache, redaction, ingest/threads/handoff schema, Sync crypto + client, the Behavior Layer (`ctxfile init`), local dashboard (`ctxfile ui`), opt-in telemetry.
- `packages/pro` — `@ctxfile/pro` (commercial, **private — never publish or make public**). Ed25519 offline licensing, session connectors for 8 agents (Claude Code, Cursor, Codex, OpenCode, Gemini, Aider, OpenClaw, Hermes; global-history fallback is opt-in), AES-256-GCM encrypted memory, multi-provider consult, whisper.cpp voice.
- `packages/relay` — `@ctxfile/relay` (Apache-2.0, self-hostable). Sync relay + Team/Enterprise hub: encrypted vaults, bearer-token auth, Standard-mode `/mcp`, thread-scoped handoff grants, Ed25519 org federation, append-only audit, Docker + Fly.
- `packages/dashboard` + `packages/ui-kit` — the local instrument UI served by `ctxfile ui` (private, not published).
- `apps/web` — the ctxfile.dev marketing site and docs (Next.js).

Core never imports Pro. Pro plugs in through `packages/core/src/plugin.ts` (`ProModule`, dynamic import) and self-gates on the license. The relay depends on core but is otherwise standalone.

## Hard rules

- **The MCP stdio server must never write to stdout** except the JSON-RPC transport — all diagnostics use `console.error`. (Human CLI subcommands like `--help`, `--version`, `ctxfile export --stdout`, and `ctxfile threads` do print to stdout intentionally; that is their output channel, not the MCP path.)
- **Privacy default:** zero network calls unless explicitly configured (Notion token+pageIds, `ollama.summarize`, `consult.providers`, `telemetry.enabled`). Telemetry is opt-in only.
- Everything ingested (files, Notion, session transcripts) passes `redactContent()`; denied paths (`.env*`, keys, credentials) are never read.
- Core is read-only over user data. Pro writes ONLY to its own encrypted store under `~/.ctxfile/` — memory content is AES-256-GCM encrypted, key in the OS keychain, provenance recorded on every entry.
- Session connectors are best-effort: read a COPY, readonly, tolerate unknown formats, degrade to connector `error` status — never crash a snapshot.
- Runtime SDK imports only in `packages/core/src/server.ts` and `cli.ts` (type-only imports allowed in `plugin.ts`) and, in the relay, only `packages/relay/src/mcp.ts` (`http.ts` re-exports the transport from it to stay SDK-free); Pro touches the SDK only via the `server` instance handed to `registerTools`.
- The license **private key** lives in `~/.ctxfile/keys/` (signing script falls back to the pre-rebrand `~/.infinityedge/keys/`) and must never enter the repo; only the public key (`packages/pro/src/publicKey.ts`) is embedded.
- Brand as **ctxfile**, never personal names.
- TypeScript strict, no `any`. Run `npm run lint && npm run typecheck && npm test` (workspace root) before completing any task.
- Keep `CLAUDE.md` and `AGENTS.md` identical — update both together.

## Commands (run from repo root)

- `npm run build` / `npm test` / `npm run typecheck` / `npm run lint` — all workspaces
- `npm run mcpb:pack` — builds `ctxfile.mcpb` from `packages/core` (copies dist + ui-dist + behaviors; asserts them present)
- `npm run behaviors:render` — regenerate the per-harness behavior files from `behaviors/canonical.md`
- Local run: `node packages/core/dist/cli.js --root <dir>` (stdio); `ctxfile serve` (HTTP, Pro); `ctxfile ui` (dashboard)
- Sync vault: `ctxfile vault create|join|recover|status`, `ctxfile sync` (passphrase via `CTXFILE_VAULT_PASSPHRASE`, recovery code via `CTXFILE_VAULT_RECOVERY_CODE`; never on argv)
- Relay/hub: `node packages/relay/dist/cli.js start` (or `ctxfile-relay ...`); config via `CTXFILE_RELAY_*` env
- License ops: `node scripts/license/sign-license.mjs <customerId> [tier] [days]`, `ctxfile activate <key>`
- Inspect: `npx @modelcontextprotocol/inspector node packages/core/dist/cli.js`
