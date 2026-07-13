# CLAUDE.md

Guidance for AI coding agents and contributors working in this repository.

## Project

**ctxfile** — a local-first MCP server (stdio + Streamable HTTP, MCP spec 2025-11-25, SDK v1.x) that snapshots a project's working state into a structured `ContextObject`, with cross-provider threads and an end-to-end encrypted Sync vault. This is the open-source repo:

- `packages/core` — `ctxfile` (Apache-2.0, published to npm). MCP server (stdio + `ctxfile serve`), snapshot engine, file/git/Notion/Ollama connectors, SQLite cache, redaction, ingest/threads/handoff schema, Sync crypto + client, the Behavior Layer (`ctxfile init`), local dashboard (`ctxfile ui`), opt-in telemetry.
- `packages/relay` — `@ctxfile/relay` (Apache-2.0, self-hostable). Sync relay + Team/Enterprise hub: encrypted vaults, bearer-token auth, Standard-mode `/mcp`, thread-scoped handoff grants, Ed25519 org federation, append-only audit, Docker + Fly.
- `packages/dashboard` + `packages/ui-kit` — the local instrument UI served by `ctxfile ui`.
- `apps/web` — the ctxfile.dev marketing site and docs (Next.js).

ctxfile has a commercial **Pro** tier (session connectors, encrypted memory, multi-agent consult, voice) that is a **separate product in a separate private repository**. It plugs into core through the public `ProModule` seam in `packages/core/src/plugin.ts` (a dynamic import) — core never depends on Pro, and no Pro code lives here. You never need Pro to build, test, run, or contribute to anything in this repo.

## Hard rules

- **The MCP stdio server must never write to stdout** except the JSON-RPC transport — all diagnostics use `console.error`. (Human CLI subcommands like `--help`, `--version`, `ctxfile export --stdout`, and `ctxfile threads` do print to stdout intentionally; that is their output channel, not the MCP path.)
- **Privacy default:** zero network calls unless explicitly configured (Notion token+pageIds, `ollama.summarize`, `consult.providers`, `telemetry.enabled`). Telemetry is opt-in only.
- Everything ingested (files, Notion, session transcripts) passes `redactContent()`; denied paths (`.env*`, keys, credentials) are never read. Symlinks are never followed out of the configured root.
- Core is read-only over user data.
- Runtime SDK imports only in `packages/core/src/server.ts` and `cli.ts` (type-only imports allowed in `plugin.ts`) and, in the relay, only `packages/relay/src/mcp.ts` (`http.ts` re-exports the transport from it to stay SDK-free).
- Brand as **ctxfile**, never personal names.
- TypeScript strict, no `any`. Run `npm run lint && npm run typecheck && npm test` (workspace root) before completing any task or opening a PR.
- Keep `CLAUDE.md` and `AGENTS.md` identical — update both together.

See `CONTRIBUTING.md` for the contributor workflow.

## Commands (run from repo root)

- `npm run build` / `npm test` / `npm run typecheck` / `npm run lint` — all workspaces
- `npm run mcpb:pack` — builds `ctxfile.mcpb` from `packages/core` (copies dist + ui-dist + behaviors; asserts them present)
- `npm run behaviors:render` — regenerate the per-harness behavior files from `behaviors/canonical.md`
- Local run: `node packages/core/dist/cli.js --root <dir>` (stdio); `ctxfile ui` (dashboard)
- Sync vault: `ctxfile vault create|join|recover|status`, `ctxfile sync` (passphrase via `CTXFILE_VAULT_PASSPHRASE`, recovery code via `CTXFILE_VAULT_RECOVERY_CODE`; never on argv)
- Relay/hub: `node packages/relay/dist/cli.js start` (or `ctxfile-relay ...`); config via `CTXFILE_RELAY_*` env
- Inspect: `npx @modelcontextprotocol/inspector node packages/core/dist/cli.js`
