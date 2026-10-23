# Set up ctxfile (instructions for an AI agent)

You are an AI agent and the user asked you to set up ctxfile for them. ctxfile is a local-first MCP server: it gives every AI tool the user works with the same project context, threads, memory, and tasks. Follow these steps in order. Ask the user before anything marked **ask**.

## 1. Check Node.js

Run `node --version`. ctxfile needs Node.js 20 or newer on macOS and Linux, and Node.js 22 or newer on Windows. If Node is missing or older, stop and tell the user to install the current LTS from https://nodejs.org (do not install it yourself).

## 2. Install ctxfile

```sh
npm install -g ctxfile
ctxfile --version
```

If `npm install -g` fails with a permissions error, tell the user; do not use `sudo` without asking.

## 3. See which AI tools are on this machine

Run this from the project the user wants ctxfile to serve:

```sh
ctxfile connect
```

It lists every MCP client ctxfile knows how to configure and marks the ones it found here.

## 4. Connect them

**Ask** the user which tools to connect (or whether to connect all of the ones found). Then run one of:

```sh
ctxfile connect --all                 # every client found on this machine
ctxfile connect cursor claude-code    # just these
ctxfile connect cursor --project      # a project-level config, safe to commit
ctxfile connect --dry-run --all       # show what would change, write nothing
```

What it does, so you can explain it:

- Clients with their own command (Claude Code, Codex CLI, Gemini CLI, VS Code, Copilot CLI, Amp, Hermes, OpenClaw) are configured through that command.
- JSON configs (Cursor, Windsurf, Zed, Cline, Claude Desktop, OpenCode, Warp, Kiro, Junie, Visual Studio) are merged: only the `ctxfile` entry is added, every other server is kept, and the previous file is saved as `<file>.ctxfile-backup`.
- Goose, LM Studio, JetBrains AI Assistant, and Mistral Vibe get a one-click install link or the exact snippet to paste; nothing is written for them.
- A config with comments, or one that already has a different `ctxfile` entry, is left untouched and the exact snippet is printed for the user to paste.
- Each client gets the project the way it can use it: a `${workspaceFolder}` placeholder where the client expands it, `.` where it starts servers in the project, and this project's absolute path for desktop apps that do neither.

To see the exact config, command, or one-click install link for one client without changing anything: `ctxfile connect --print <client>`.

## 5. Restart and verify

Tell the user to restart each connected tool (or reload its MCP servers). Then, inside any connected tool, call the ctxfile `get_context` tool. A JSON context object for the project means it works. `ctxfile ui` opens the local dashboard, whose **Connected agents** card lists every tool that has connected.

## 6. Optional, ask first

- **Automatic checkpoints:** `ctxfile init` asks the user for consent, then installs a small skill that teaches agents when to save session digests. Only the user can answer its prompt.
- **Web chat apps** (ChatGPT, Claude.ai, Grok, Perplexity) cannot run a local server; they connect through the encrypted Sync relay. Point the user to https://ctxfile.dev/docs/webchat.

## Rules while you do this

- Never edit a client's config by hand when `ctxfile connect` can do it; it keeps backups and never removes other servers.
- Never put tokens, passphrases, or recovery codes on the command line or in a config file; ctxfile reads secrets from environment variables.
- ctxfile makes no network calls unless the user configures one (Notion, Sync, Ollama summaries, opt-in telemetry).

Full docs: https://ctxfile.dev/docs/clients
