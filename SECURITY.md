# Security Policy

## Threat model

ctxfile reads sensitive codebases and feeds them to LLM clients. The three risks we design against:

1. **Exfiltration of code/secrets.** Mitigations: zero network calls in the default path; Notion and Ollama are explicit opt-ins; denied-path rules (`.env*`, `*.pem`, `*.key`, `id_rsa*`, `.npmrc`, `.netrc`, credential files, keystores) are never read; symlinks are never followed out of the configured root; a redaction pass scrubs known secret formats (AWS keys, GitHub/Notion/Slack tokens, `sk-` API keys, private-key blocks, JWTs, quoted `password=`/`api_key=` assignments) from every file, git commit message/diff, Notion page/title, and stored memory entry before it enters a snapshot. Telemetry is **opt-in only** (default off): when explicitly enabled it sends an anonymous weekly ping of a random install UUID, version, and OS platform name — never code, paths, or content.
2. **Prompt injection via context payloads.** A file or Notion page can contain "ignore previous instructions…". ctxfile labels snapshot content as untrusted data in the `get_context` tool description and the `load-context` prompt, but it cannot control what a downstream agent does. Treat snapshots as data, not instructions, and review what your agent executes.
3. **Mis-scoped file access.** The server reads only inside the single configured `--root` directory, honors `.gitignore` plus configured excludes, and is strictly read-only everywhere (filesystem, git, Notion).

Known limitations:

- Redaction is pattern-based and cannot catch every secret format. Do not point ctxfile at directories containing material you would not paste into your LLM client.
- The `.mcpb` bundle includes a platform-specific native SQLite module; verify the published SHA-256 before installing.

## Supported versions

The latest published minor release receives security fixes. Older versions: please upgrade.

## Reporting a vulnerability

- **Email:** [security@ctxfile.dev](mailto:security@ctxfile.dev)
- Or use GitHub's [private vulnerability reporting](https://github.com/ctxfile/ctxfile/security/advisories/new) on this repository.

Please do not open public issues for security reports. You should receive a response within 72 hours. Redaction-gap reports (a secret shape that survives the scrubbing pass) count as security reports and are especially appreciated.
