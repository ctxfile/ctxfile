import { rmSync } from "node:fs";
import { defineConfig } from "tsup";

// tsup runs array configs concurrently, so a clean:true inside either entry
// races with the other's writes. Clean once, deterministically, at load time.
rmSync("dist", { recursive: true, force: true });

// Split per entry: the library keeps dual ESM/CJS output, but the CLI is
// ESM-only — a CJS cli.cjs can't host import.meta.url and was never runnable.
export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: false, // cleaned above
    target: "node20",
  },
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: false, // cleaned above
    target: "node20",
    banner: { js: "#!/usr/bin/env node" },
  },
]);
