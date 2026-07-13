## What

<!-- One or two sentences: the behavior change, not the diff. -->

## Why

<!-- The problem this solves. Link the issue if there is one. -->

## Tests

<!-- What you added/changed in tests/. "No tests" needs a reason. -->

## Checklist

- [ ] `npm run lint && npm run typecheck && npm run build && npm test` passes locally
- [ ] No new network calls in the default path
- [ ] stdout stays JSON-RPC-only in the MCP server path (diagnostics on stderr)
- [ ] User-facing behavior changes are reflected in `apps/web/app/docs/`
