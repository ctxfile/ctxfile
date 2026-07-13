import { rmSync } from "node:fs";
import { defineConfig } from "tsup";

rmSync("dist", { recursive: true, force: true });

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: false,
    target: "node20",
  },
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    dts: false,
    sourcemap: true,
    clean: false,
    target: "node20",
    banner: { js: "#!/usr/bin/env node" },
  },
]);
