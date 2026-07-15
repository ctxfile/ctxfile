import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Configuration",
  description: "Every field of .ctxfile.json, defaults, and environment variables.",
};

export default function Configuration() {
  return (
    <>
      <h1>Configuration</h1>
      <p className="lede">
        ctxfile works with zero configuration. To tune it, put a <code>.ctxfile.json</code> at your
        project root. Every field is optional; unknown fields are rejected.
      </p>

      <h2>Full example</h2>
      <pre>
        <code>{`{
  "tokenBudget": 50000,
  "maxFileTokens": 4000,
  "cacheDir": "~/.ctxfile",
  "cacheMaxAgeMs": 30000,
  "include": ["src/**", "docs/plan.md"],
  "exclude": ["fixtures/", "*.snap"],
  "notion": {
    "pageIds": ["1a2b3c4d-…"]
  },
  "ollama": {
    "baseUrl": "http://localhost:11434",
    "model": "qwen3:4b",
    "summarize": false
  },
  "consult": {
    "providers": [
      {
        "type": "anthropic",
        "model": "claude-sonnet-5",
        "apiKeyEnv": "ANTHROPIC_API_KEY"
      },
      {
        "type": "openai-compatible",
        "model": "gpt-5.2",
        "baseUrl": "https://api.openai.com/v1",
        "apiKeyEnv": "OPENAI_API_KEY"
      },
      {
        "type": "openrouter",
        "model": "google/gemini-2.5-pro",
        "apiKeyEnv": "OPENROUTER_API_KEY"
      },
      { "type": "ollama", "model": "qwen3:4b" }
    ]
  },
  "voice": {
    "whisperPath": "/opt/homebrew/bin/whisper-cli",
    "modelPath": "~/models/ggml-base.en.bin",
    "audioDir": "~/voice-notes"
  },
  "export": {
    "profile": "repo-safe",
    "include": ["plan", "gitState", "keyFiles"]
  },
  "telemetry": { "enabled": false }
}`}</code>
      </pre>

      <h2>Fields</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Default</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>tokenBudget</td>
              <td>50000</td>
              <td>Total token budget for the whole snapshot. Files are greedily fitted to it.</td>
            </tr>
            <tr>
              <td>maxFileTokens</td>
              <td>4000</td>
              <td>Per-file cap. Larger files get head+tail truncation.</td>
            </tr>
            <tr>
              <td>cacheDir</td>
              <td>~/.ctxfile</td>
              <td>Where the local SQLite snapshot cache lives.</td>
            </tr>
            <tr>
              <td>cacheMaxAgeMs</td>
              <td>30000</td>
              <td>A cached snapshot younger than this is served without rebuilding.</td>
            </tr>
            <tr>
              <td>include</td>
              <td>[]</td>
              <td>Allowlist patterns for the file connector. Empty means rank-based selection.</td>
            </tr>
            <tr>
              <td>exclude</td>
              <td>[]</td>
              <td>Extra gitignore-style excludes, on top of .gitignore and denied paths.</td>
            </tr>
            <tr>
              <td>notion.pageIds</td>
              <td>[]</td>
              <td>
                Explicit Notion page IDs to ingest. Only active when <code>NOTION_TOKEN</code> is also set.
              </td>
            </tr>
            <tr>
              <td>ollama.baseUrl</td>
              <td>http://localhost:11434</td>
              <td>Your local Ollama endpoint.</td>
            </tr>
            <tr>
              <td>ollama.model</td>
              <td>None</td>
              <td>Model used for the session summary.</td>
            </tr>
            <tr>
              <td>ollama.summarize</td>
              <td>false</td>
              <td>Opt-in switch for the local summarizer.</td>
            </tr>
            <tr>
              <td>consult.providers</td>
              <td>[]</td>
              <td>
                Providers for the Pro consult tool. Each entry: <code>type</code> (<code>anthropic</code> |{" "}
                <code>openai-compatible</code> | <code>openrouter</code> | <code>ollama</code>), <code>model</code>,{" "}
                <code>baseUrl</code>, <code>apiKeyEnv</code>: the <em>name</em> of the env var holding the key,
                never the key itself. The <code>openrouter</code> type defaults <code>baseUrl</code> to
                OpenRouter&apos;s API and <code>apiKeyEnv</code> to <code>OPENROUTER_API_KEY</code>, so one key
                unlocks hundreds of models; just pick a <code>model</code> slug.
              </td>
            </tr>
            <tr>
              <td>voice.whisperPath</td>
              <td>None</td>
              <td>Path to your whisper.cpp binary (Pro voice notes).</td>
            </tr>
            <tr>
              <td>voice.modelPath</td>
              <td>None</td>
              <td>Path to the whisper model file.</td>
            </tr>
            <tr>
              <td>voice.audioDir</td>
              <td>None</td>
              <td>Extra directory (besides root) that transcription may read audio from.</td>
            </tr>
            <tr>
              <td>telemetry.enabled</td>
              <td>false</td>
              <td>Opt-in anonymous install ping. Off by default, stays off until you set it.</td>
            </tr>
            <tr>
              <td>export.profile</td>
              <td>repo-safe</td>
              <td>
                Default profile for <code>ctxfile export</code>: <code>repo-safe</code> | <code>full</code> |{" "}
                <code>custom</code>. See <Link href="/docs/export">Cloud agents</Link>.
              </td>
            </tr>
            <tr>
              <td>export.include</td>
              <td>None</td>
              <td>
                Section allowlist used by the <code>custom</code> profile: <code>plan</code>,{" "}
                <code>gitState</code>, <code>keyFiles</code>, <code>keyFileContent</code>,{" "}
                <code>notionPages</code>, <code>sessions</code>, <code>sessionSummary</code>.
              </td>
            </tr>
            <tr>
              <td>serve.tokens</td>
              <td>[]</td>
              <td>
                Reserved for the upcoming <code>ctxfile serve</code>: named tokens (<code>name</code>,{" "}
                <code>tokenEnv</code>, <code>scopes</code>). Validated today, used by nothing yet; tokens are
                env-var <em>names</em>, never literal secrets.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Environment variables</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Variable</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>NOTION_TOKEN</td>
              <td>
                Notion integration token. The Notion connector activates only when this is set <em>and</em>{" "}
                <code>notion.pageIds</code> is non-empty.
              </td>
            </tr>
            <tr>
              <td>OLLAMA_BASE_URL</td>
              <td>
                Overrides <code>ollama.baseUrl</code>.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Secrets never live in config. <code>apiKeyEnv</code> naming is deliberate. See{" "}
        <Link href="/docs/privacy">Privacy</Link> for what each opt-in actually enables.
      </p>

      <h2>CLI flags</h2>
      <pre>
        <code>{`ctxfile --root <dir>       # project root (default: cwd)
ctxfile --config <path>    # explicit config file
ctxfile ui                 # local dashboard on 127.0.0.1
ctxfile export             # write .ctxfile/context.{json,md}
ctxfile hooks install      # pre-commit export refresh
ctxfile activate <key>     # activate a Pro license
ctxfile --version`}</code>
      </pre>
      <p>
        Every command and flag, including <code>export --profile/--stdout</code> and <code>ui --port</code>, is
        documented on the <Link href="/docs/cli">CLI reference</Link>.
      </p>
    </>
  );
}
