import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** `ctxfile init` vault discovery (spec §7): the project root itself, its
    direct children, then the parent directory. First hit wins. */
export function detectVaultNear(root: string): string | null {
  const isVault = (dir: string): boolean => {
    try {
      return statSync(path.join(dir, ".obsidian")).isDirectory();
    } catch {
      return false;
    }
  };
  if (isVault(root)) return root;
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const child = path.join(root, entry.name);
      if (isVault(child)) return child;
    }
  } catch {
    // unreadable root: fall through to the parent check
  }
  const parent = path.dirname(root);
  if (parent !== root && isVault(parent)) return parent;
  return null;
}

/** PARA-aware defaults (PRD §2.2.2): Projects/Areas in, Resources opt-in,
    Archive off — expressed as excludes so a non-PARA vault stays whole. */
export function paraDefaultExcludes(vaultPath: string): string[] {
  const para = ["Projects", "Areas", "Resources", "Archive"];
  if (!para.some((f) => existsSync(path.join(vaultPath, f)))) return [];
  const excludes: string[] = [];
  if (existsSync(path.join(vaultPath, "Resources"))) excludes.push("Resources/**");
  if (existsSync(path.join(vaultPath, "Archive"))) excludes.push("Archive/**");
  return excludes;
}

/** Paths under $HOME are stored ~-relative so a committed config never leaks
    a username. */
export function tildeRelative(p: string): string {
  const home = os.homedir();
  if (p === home) return "~";
  if (p.startsWith(home + path.sep)) {
    return `~/${path.relative(home, p).split(path.sep).join("/")}`;
  }
  return p;
}

export type AppendVaultResult = "written" | "exists" | "unparseable";

/** Read-modify-write with an atomic rename; refuses to touch a config it
    cannot parse or one that already has vaults (spec §7). */
export function appendVaultToConfig(configPath: string, vaultPath: string, excludes: string[]): AppendVaultResult {
  let parsed: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(configPath, "utf8"));
    } catch {
      return "unparseable";
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return "unparseable";
    parsed = { ...(raw as Record<string, unknown>) };
  }
  if (parsed.vaults !== undefined) return "exists";
  const entry: Record<string, unknown> = { path: tildeRelative(vaultPath) };
  if (excludes.length > 0) entry.exclude = excludes;
  parsed.vaults = [entry];
  const tmp = `${configPath}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(parsed, null, 2)}\n`);
  renameSync(tmp, configPath);
  return "written";
}
