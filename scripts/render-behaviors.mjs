// Regenerates packages/core/behaviors/render/ from canonical.md via the
// package's own renderer (single source of truth; a core test fails when the
// committed renders drift from the renderer's output).
// Usage: npm run build -w ctxfile && node scripts/render-behaviors.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderAllBehaviors } from "../packages/core/dist/index.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "packages", "core", "behaviors", "render");
for (const rendered of renderAllBehaviors()) {
  const target = path.join(root, rendered.relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, rendered.content, "utf8");
  console.error(`rendered ${rendered.harness} -> ${path.relative(process.cwd(), target)}`);
}
