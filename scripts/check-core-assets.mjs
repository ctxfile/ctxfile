// Guards `npm publish` of the core package: the dashboard SPA (ui-dist) is
// gitignored and built, and the behavior pack is a runtime asset — both are in
// package.json "files" and MUST exist in the tarball or install-time features
// (`ctxfile ui`, `ctxfile init`) silently break. Run from the repo root by the
// core package's `prepack`.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const core = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "packages", "core");
const required = ["ui-dist/index.html", "behaviors/canonical.md", "dist/cli.js", "dist/index.js"];

const missing = required.filter((rel) => !existsSync(path.join(core, rel)));
if (missing.length > 0) {
  console.error(`check-core-assets: missing required published asset(s): ${missing.join(", ")}`);
  console.error("Build them first: npm run build -w ctxfile && npm run build -w @ctxfile/dashboard");
  process.exit(1);
}
console.error("check-core-assets: ui-dist, behaviors, and dist present.");
