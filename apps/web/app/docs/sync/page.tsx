import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How to use the same project context in ChatGPT, Claude, and Grok",
  description:
    "Sync carries your local ctxfile context to the web chat apps and your phone through an encrypted vault: how roaming works across ChatGPT, Claude and Grok, Standard vs Strict encryption stated honestly, and the self-hosted relay.",
};

export default function SyncDocs() {
  return (
    <>
      <h1>Sync &amp; roaming</h1>
      <p className="lede">
        ctxfile is <strong>local-first, everywhere you work</strong>. Local-first means your machine is the
        source of truth, the product is fully functional offline and free, and nothing leaves without explicit
        intent; that does not change. Sync is the additive layer: an encrypted vault that extends the same
        context to your phone, the web, and any MCP-capable chat app.
      </p>

      <div className="callout">
        <p>
          Status: everything on this page is built and tested. Threads and both save doors are free core; the
          client-side crypto (Argon2id, per-blob XChaCha20-Poly1305, opaque blob ids) and the sync engine
          (last-write-wins with tombstones) live in the open core; the relay itself ships in the repo as{" "}
          <code>@ctxfile/relay</code> with a Docker image, so you can run the whole roaming loop on your own
          machine today. The hosted vault at <code>sync.ctxfile.dev</code> is that same relay, deployed; the
          OAuth handshake hosted chat apps require is the one remaining deploy-time item.
        </p>
      </div>

      <h2>The roaming flow</h2>
      <ol>
        <li>
          <strong>Once:</strong> create a Sync vault, set a passphrase, and add{" "}
          <code>https://sync.ctxfile.dev/mcp</code> as a connector in Claude, ChatGPT, or Grok. The OAuth flow
          runs in the chat app; the connector is then available in every conversation on that account, phone
          included.
        </li>
        <li>
          <strong>In ChatGPT on your phone:</strong> &ldquo;Save this session to ctxfile, thread Q3
          campaign.&rdquo; The agent calls <code>save_session</code>; the relay validates, encrypts, stores,
          and stamps provenance (<code>harness: chatgpt</code>).
        </li>
        <li>
          <strong>In Claude, minutes or days later:</strong> &ldquo;Pick up my Q3 campaign thread.&rdquo;{" "}
          <code>continue_thread</code> returns the merged, provenance-tagged history; the first answer already
          knows the project.
        </li>
        <li>
          <strong>At your desk:</strong> local ctxfile pulls the vault; phone sessions appear in your local
          snapshot; local sessions push up. One thread, every provider, both directions.
        </li>
      </ol>
      <p>
        <Link href="/docs/memory">Imported memory</Link> travels the same way. Global memory (about you) rides
        every vault this machine syncs; project memory rides its project&apos;s vault. A chat surface can export
        its memory into the vault with <code>ingest_memory</code>; you approve pending instructions on your own
        device and the approval syncs back. Handoff grants and federation never see memory.
      </p>
      <p>
        <Link href="/docs/tasks">Tasks</Link> travel too. Grok can leave a task for ChatGPT on a thread; you
        approve it on your own machine, and ChatGPT finds it in its inbox. Details below, under{" "}
        <a href="#tasks">Tasks through the vault</a>.
      </p>
      <p>
        Remote MCP connectors are supported today by Claude (all tiers), ChatGPT (paid tiers, remote servers
        only, OAuth required), Grok (paid), Perplexity (Pro), and Mistral Le Chat. Nothing in this flow is
        speculative; it is the standard remote-connector pattern applied to context.
      </p>

      <h2>Encryption, stated honestly</h2>
      <p>
        The crux is where the MCP client runs. If it runs on hardware you control (Claude Code on your laptop,
        a self-hosted agent), it can decrypt locally. If it runs on someone else&apos;s servers (chatgpt.com,
        claude.ai), tool results must reach their edge as plaintext to feed the model. Pure zero-knowledge
        serving of hosted chat apps is impossible, and we will not pretend otherwise. So: two modes, chosen per
        vault.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Mode</th>
              <th>How it works</th>
              <th>The trade</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Standard (default)</td>
              <td>
                Everything is encrypted on your device before upload (XChaCha20-Poly1305; keys derived from
                your passphrase via Argon2id). Storage holds ciphertext only. For a request from an authorized
                client, a worker decrypts in memory, answers over TLS, and discards; plaintext is never
                persisted, never logged, and keys live in a KMS, never in the datastore.
              </td>
              <td>
                Encrypted at rest and in transit, zero plaintext persistence. <strong>Not zero-knowledge</strong>;
                the honest label, used everywhere.
              </td>
            </tr>
            <tr>
              <td>Strict</td>
              <td>
                True end-to-end: the relay stores ciphertext it can never decrypt. Only devices holding the
                passphrase-derived key can read.
              </td>
              <td>
                Works between your own ctxfile installs. Cannot serve chatgpt.com or claude.ai, because those
                clients cannot decrypt. You trade roaming for zero-knowledge.
              </td>
            </tr>
            <tr>
              <td>Self-hosted relay</td>
              <td>
                The relay ships as a Docker image (it is the same build as the Team hub). Run it on your own
                VPS or tailnet.
              </td>
              <td>
                Roaming still works, and the momentary plaintext happens on hardware you control. The relay is
                open source, so all of the above is verifiable rather than promised.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        One rule of thumb: <strong>Strict follows your hardware; Standard follows you everywhere.</strong> Key
        recovery is passphrase plus a printed recovery code; a Strict vault cannot be reset by us, and vault
        deletion destroys its keys (crypto-shredding).
      </p>

      <h2>Auth and tokens</h2>
      <p>
        Today, and on the local HTTP door, the relay authenticates each client with a bearer token scoped to{" "}
        <code>read:context write:sessions</code> (plus <code>read:tasks write:tasks</code> for the task tools)
        for one vault, revocable and visible in the append-only audit view. Hosted Sync adds OAuth 2.1 with dynamic client registration on top of that scope model (ChatGPT
        rejects anything less); that layer ships with the hosted deployment. The scopes are the same either way:
        see <Link href="/docs/mcp">MCP surface</Link>.
      </p>

      <h2>The local HTTP door today (Pro)</h2>
      <pre>{`ctxfile serve --port 4949            # Streamable HTTP on 127.0.0.1
# .ctxfile.json
{
  "serve": {
    "port": 4949,
    "host": "127.0.0.1",
    "tokens": [
      { "name": "tablet", "tokenEnv": "CTXFILE_TABLET_TOKEN", "scopes": ["read:context"] }
    ]
  }
}`}</pre>
      <p>
        Same engine, same nine tools, over HTTP. Loopback-only by default; binding beyond loopback requires
        bearer tokens (values live in env vars, never in the config file), and each MCP session is bound to
        the token that opened it. This is the same door the relay is built from. Pricing:{" "}
        <Link href="/pricing#sync">Sync is $6/month, or $15 bundled with Pro</Link>.
      </p>

      <h2>Run the whole loop yourself, today</h2>
      <pre>{`# 1. Start a relay (self-hosted hub; all state in one folder)
ctxfile-relay start --data-dir ~/ctxfile-relay

# 2. Create your encrypted vault and push this project
export CTXFILE_VAULT_PASSPHRASE="a long passphrase"
ctxfile vault create --relay http://127.0.0.1:5959 --name me --mode standard
ctxfile sync

# 3. Point any MCP client at the vault (this is what a chat app does)
#    URL:    http://127.0.0.1:5959/mcp
#    Header: Authorization: Bearer <token from ~/.ctxfile/vault.json>

# 4. A second machine joins with the token + passphrase, then syncs
ctxfile vault join --relay http://<relay-host>:5959 --token <vault-token>
ctxfile sync

# 5. Lost the passphrase? Reset it with the printed recovery code (needs a
#    device token: run where you have vault.json, or set CTXFILE_VAULT_TOKEN)
export CTXFILE_VAULT_RECOVERY_CODE="ABCDE-FGHJK-..."   # the code shown at create
export CTXFILE_VAULT_PASSPHRASE="a new long passphrase"
ctxfile vault recover   # unwraps with the code, re-wraps, prints a fresh code`}</pre>
      <p>
        Standard mode serves the ctxfile tools from the vault (the nine core tools plus <code>search</code> and{" "}
        <code>fetch</code>); Strict mode makes step 3 refuse by design while step 4 keeps working. Handoff grants (<code>ctxfile-relay grants issue</code>), org-to-org federation
        (<code>ctxfile-relay federation issue/redeem</code>), and the append-only audit trail
        (<code>ctxfile-relay audit tail|export</code>) are documented in the relay package README.
      </p>

      <h2 id="tasks">Tasks through the vault</h2>
      <p>
        Tasks sync as their own encrypted record kind, like sessions and memory. Their state cannot converge by
        last-write-wins, because two devices must never both win a claim, so every task push is a
        compare-and-set: the device sends <code>If-Match: &quot;&lt;version&gt;&quot;</code> naming the relay
        version it last agreed with, or <code>If-None-Match: *</code> for a new task, and the relay answers{" "}
        <code>409</code> when its copy has moved on. The first device to push a claim wins. The losing device
        takes the relay&apos;s version, and <code>ctxfile sync</code> reports how many task changes lost a race.
      </p>
      <ul>
        <li>
          <strong>Chat apps.</strong> On Standard vaults the relay&apos;s <code>/mcp</code> serves{" "}
          <code>post_task</code>, <code>list_tasks</code>, and <code>update_task</code>, so ChatGPT, Claude.ai,
          Grok, and Perplexity can post and pick up tasks. Strict vaults refuse them, since the relay holds no
          key. Thread-scoped handoff grants do not get task tools yet (Team tier, later).
        </li>
        <li>
          <strong>Approver keys.</strong> Approvals are signed on your device with its approval key.{" "}
          <code>ctxfile sync</code> enrolls that key&apos;s public half with the vault. The private half never
          leaves the device.
        </li>
        <li>
          <strong>Push.</strong> The relay is always on, so it can wake an agent the moment a task is approved
          for it: a Claude Code Routine or a signed webhook (n8n, Zapier, Make, Hermes, OpenClaw). It only does
          so for a task whose approval verifies against an enrolled key, and the payload carries a summary,
          never the task text. See <Link href="/docs/tasks#push">Push</Link>.
        </li>
        <li>
          <strong>Older devices.</strong> Devices on ctxfile 0.7 or later remember blobs of a kind they do not
          understand and stop downloading them on every sync. Older devices ignore task blobs, but download
          them again on every sync until they upgrade.
        </li>
      </ul>

      <h2>What the relay operator can count</h2>
      <p>
        The relay&apos;s append-only audit log records each MCP call with the client that made it. For{" "}
        <code>continue_thread</code>, that includes which client resumed the thread, so the operator of the
        hosted relay can count how often work saved in one vendor&apos;s app is picked up in another&apos;s.{" "}
        <code>ctxfile-relay stats</code> prints those counts in aggregate across vaults. Counts only: no thread
        titles, no content. On a relay you run yourself, you are the operator.
      </p>

      <h2>What never changes</h2>
      <ul>
        <li>Free and Pro make zero network calls by default; Sync is opt-in and loudly labeled.</li>
        <li>Sync pushes respect the same redaction profiles as everything else.</li>
        <li>Everything served carries provenance labels; ingested content stays quarantined as untrusted data.</li>
        <li>Your machine remains the source of truth; the vault is a replica, not a home.</li>
      </ul>
    </>
  );
}
