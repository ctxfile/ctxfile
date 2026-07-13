# Contributing to ctxfile

Thanks for being here. ctxfile gets better with every harness quirk, redaction gap, and workflow you report. This guide keeps the loop fast.

- Be kind. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Security issues go to [SECURITY.md](SECURITY.md), never to public issues.
- By contributing you agree your contributions are licensed under [Apache-2.0](LICENSE).

## Setup

```bash
git clone https://github.com/ctxfile/ctxfile.git && cd ctxfile
npm install
npm run build && npm test
```

Node ≥ 20 (≥ 22 on Windows) and the `git` binary are required. CI runs on Node 20/22/24 × macOS/Linux/Windows. The repo is npm workspaces: `packages/core` (the `ctxfile` npm package), `packages/relay` (`@ctxfile/relay`), `packages/dashboard` + `packages/ui-kit` (the local UI), `apps/web` (the site).

Run the full gate before opening a PR. It is the same gate CI runs:

```bash
npm run lint && npm run typecheck && npm run build && npm test
```

## What we especially want

- **Harness reports.** ctxfile talks to many MCP clients. If a client mangles a tool call, truncates a resource, or surfaces prompts oddly, that report is gold. Include client name + version and the smallest reproduction you can.
- **Redaction gaps.** If you find a secret shape that survives redaction, report it privately via [SECURITY.md](SECURITY.md) first.
- **Ingest formats.** `ingest_context` is the universal door. PRs that improve the schema docs or add prompt snippets for new harnesses are very welcome.
- **Windows + Linux reality checks.** CI covers them, but real-machine reports beat CI.

## Ground rules

These are architectural invariants. CI and review will hold the line on them:

1. **TDD.** Every change ships with tests (`tests/*.test.ts`, Vitest). No TODO tests, no empty test bodies.
2. **Strict TypeScript.** `npm run typecheck` and `npm run lint` must pass; `any` is banned.
3. **stdio discipline.** The MCP server never writes to stdout; it is reserved for JSON-RPC. Diagnostics go to stderr.
4. **Privacy is the product.** No new network calls in the default path; telemetry stays opt-in and anonymous (default off); anything read from disk must pass through the redaction layer. Denied paths (`.env*`, keys, credentials) are never read.
5. **Core is read-only** over user data.
6. **SDK isolation.** Runtime MCP SDK imports live only in `packages/core/src/server.ts`, `cli.ts`, and `packages/relay/src/mcp.ts`. Everything else stays SDK-free.
7. **Connectors are best-effort.** Throwing inside `snapshot()` must degrade to an `error` connector status, never a crashed snapshot.

## Pull requests

1. Fork, branch from `main`.
2. Run the full gate locally (see Setup).
3. Keep PRs focused; describe the behavior change and test coverage. Big rewrites need an issue first.
4. If you change user-facing behavior, update the relevant docs page in `apps/web/app/docs/`.
5. Titles follow conventional commits loosely (`fix(core): ...`, `feat(relay): ...`, `docs: ...`).

## Good first issues

Look for the [`good first issue`](https://github.com/ctxfile/ctxfile/labels/good%20first%20issue) label. If none are open, [`help wanted`](https://github.com/ctxfile/ctxfile/labels/help%20wanted) is the next stop.

## Questions

Open a [discussion](https://github.com/ctxfile/ctxfile/discussions). Show-and-tell posts (how you wired ctxfile into your workflow) are actively encouraged; they become docs.
