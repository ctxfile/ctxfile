import type { Metadata } from "next";
import { CopyCommand } from "@/components/CopyCommand";

export const metadata: Metadata = {
  title: "Local models",
  description:
    "Run ctxfile with models on your own machine via Ollama: local summaries, local consult, and a fully local agent with OpenCode. Nothing leaves your computer.",
};

export default function LocalModelsPage() {
  return (
    <>
      <h1>Local models, all the way down.</h1>
      <p>
        ctxfile pairs with models running on your own machine through{" "}
        <a href="https://ollama.com" rel="noopener">Ollama</a>. There are two directions, and knowing which
        is which saves confusion:
      </p>
      <ul>
        <li>
          <strong>ctxfile calls the model</strong> (summaries, consult): plain HTTP to localhost. Works with
          ANY model, no tool support needed.
        </li>
        <li>
          <strong>The model drives ctxfile</strong> (a local agent calling MCP tools): the model needs
          tool-calling support and an agent harness such as OpenCode. Ollama is a model server, not an
          agent; <code>ollama run</code> alone cannot call tools.
        </li>
      </ul>

      <h2>Setup (macOS)</h2>
      <CopyCommand command="brew install ollama && brew services start ollama" />
      <p>Pull a model. Two good starting points:</p>
      <CopyCommand command="ollama pull gemma3:4b" />
      <CopyCommand command="ollama pull qwen3:8b" />
      <p>
        <code>gemma3:4b</code> is small and quick for summaries. <code>qwen3:8b</code> supports tool calling,
        which you need for agent use. Check any model&apos;s abilities with{" "}
        <code>ollama show &lt;model&gt;</code>; look for <code>tools</code> under capabilities. 16GB of RAM
        runs the 4B and 8B classes comfortably; 32GB handles 12B and up.
      </p>

      <h2>Local session summaries (free core)</h2>
      <p>In your project&apos;s <code>.ctxfile.json</code>:</p>
      <pre>
        <code>{`{
  "ollama": { "summarize": true, "model": "gemma3:4b" }
}`}</code>
      </pre>
      <p>
        Snapshots now include a working-session summary written by the local model. It appears in{" "}
        <code>get_context</code> and in exports under the <code>full</code> or <code>custom</code> profiles;
        the default <code>repo-safe</code> profile excludes it by design. If Ollama is not running, the
        connector skips quietly; nothing breaks.
      </p>

      <h2>Local consult (Pro)</h2>
      <p>Ask a second opinion from a local model, from inside any agent:</p>
      <pre>
        <code>{`{
  "consult": {
    "providers": [
      { "type": "ollama", "model": "qwen3:8b" }
    ]
  }
}`}</code>
      </pre>
      <p>
        The <code>consult</code> tool sends your question plus context to each configured provider and
        returns the answers side by side. An Ollama provider means the consult never leaves your machine,
        and costs nothing per call.
      </p>

      <h2>A fully local agent (OpenCode + Ollama)</h2>
      <p>
        Local brain, local harness, local context: OpenCode uses an Ollama model as the agent and loads
        ctxfile over MCP. In the project&apos;s <code>opencode.json</code>:
      </p>
      <pre>
        <code>{`{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama (local)",
      "options": { "baseURL": "http://localhost:11434/v1" },
      "models": { "qwen3:8b": { "name": "Qwen 3 8B (local)" } }
    }
  },
  "model": "ollama/qwen3:8b",
  "mcp": {
    "ctxfile": {
      "type": "local",
      "command": ["ctxfile", "--root", "."],
      "enabled": true
    }
  }
}`}</code>
      </pre>
      <p>Then:</p>
      <CopyCommand command='opencode run "Use the ctxfile get_context tool, then summarize this project&apos;s plan."' />
      <p>
        The model decides to call <code>get_context</code>, reads your working state, and answers from it.
        Zero bytes leave the machine.
      </p>

      <h2>Traps we hit so you do not have to</h2>
      <ul>
        <li>
          <strong>gemma3 cannot be the agent.</strong> It lacks tool support in Ollama; the call is rejected
          with &quot;does not support tools&quot;. It still works everywhere ctxfile calls the model
          (summarize, consult). Tool-capable picks: qwen3, llama3.1 and newer, mistral.
        </li>
        <li>
          <strong>Thinking models are slow to first token.</strong> qwen3 reasons before answering; under an
          agent&apos;s large tool prompt the first response can take minutes on laptop hardware. Prefix
          prompts with <code>/no_think</code> to skip reasoning, and expect the first call to be the slowest.
        </li>
        <li>
          <strong>Raise the context window for tool calls.</strong> OpenCode recommends an Ollama{" "}
          <code>num_ctx</code> of 16k or more; agents carry large tool schemas.
        </li>
        <li>
          <strong>Small models embellish.</strong> A 4B summary is useful but may guess at project names and
          details. Step up to 12B and beyond when accuracy matters more than speed.
        </li>
      </ul>
    </>
  );
}
