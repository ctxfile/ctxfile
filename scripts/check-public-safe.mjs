// Publish-time guard: fails if any private artifact would enter an npm tarball.
// Wired into the `prepublishOnly` of the public packages (core, relay), so a
// stray `npm publish` cannot leak the commercial Pro sources, the founder
// runbook, the internal test plan, or any secret. Complements the git-remote
// pre-push guard (which covers the public repo split).
import { execFileSync } from "node:child_process";

const FORBIDDEN = [
  { re: /(^|\/)packages\/pro\//i, why: "commercial @ctxfile/pro sources" },
  { re: /(^|\/)FOUNDER-ACTIONS\.md$/i, why: "private founder runbook" },
  { re: /(^|\/)TESTING\.md$/i, why: "internal test plan" },
  { re: /(^|\/)\.env(\.|$)/i, why: "environment secrets" },
  { re: /\.(pem|key|p12|pfx|p8|ppk)$/i, why: "key material" },
  { re: /(^|\/)keys?\//i, why: "key directory" },
];

let raw;
try {
  // --ignore-scripts: we only need the file manifest, not to run prepack (whose
  // build output would otherwise pollute the JSON on stdout).
  raw = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
} catch (error) {
  console.error(`check-public-safe: could not compute pack contents: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

let entries;
try {
  entries = JSON.parse(raw);
} catch {
  console.error("check-public-safe: could not parse `npm pack --dry-run --json` output");
  process.exit(1);
}

const paths = entries.flatMap((e) => (e.files ?? []).map((f) => f.path));
const violations = [];
for (const p of paths) {
  for (const rule of FORBIDDEN) {
    if (rule.re.test(p)) violations.push(`${p} (${rule.why})`);
  }
}

if (violations.length > 0) {
  console.error("check-public-safe: REFUSING to publish — private files in the tarball:");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.error(`check-public-safe: ${paths.length} files, no private artifacts. OK to publish.`);
