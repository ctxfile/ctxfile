#!/usr/bin/env bash
# The ctxfile release checklist (CLAUDE.md, "Release checklist") as one
# script, for the maintainer's own machine. It runs top to bottom, checks
# before it acts, and asks before every step that publishes, deploys, or
# cannot be undone. Nothing secret is printed or written to disk.
#
#   bash scripts/release.sh            # the whole release
#   bash scripts/release.sh --verify   # only the live checks at the end
#
# Needs, already logged in: npm (publish rights on ctxfile and @ctxfile/relay),
# flyctl (ctxfile-relay app), wrangler (Cloudflare Pages project "ctxfile"),
# mcp-publisher (holds the ctxfile.dev DNS key). Optional: gh, for the GitHub
# release that carries the Claude Desktop .mcpb (Apple Silicon Macs only).

set -euo pipefail

FLY_APP="ctxfile-relay"
PAGES_PROJECT="ctxfile"
RELAY_URL="https://ctxfile-relay.fly.dev"
SITE_URL="https://ctxfile.dev"
IDENTITY="ctxfile <hello@ctxfile.dev>"

cd "$(git rev-parse --show-toplevel)"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  ok: %s\n' "$*"; }
die() { printf '\n  STOP: %s\n' "$*" >&2; exit 1; }
confirm() {
  local answer
  read -r -p "  $1 [y/N] " answer </dev/tty
  [[ "$answer" == "y" || "$answer" == "Y" || "$answer" == "yes" ]]
}
json_field() { node -e "process.stdout.write(String(require('./$1')$2))"; }

core_version="$(json_field packages/core/package.json .version)"
relay_version="$(json_field packages/relay/package.json .version)"

verify_live() {
  say "Verify live (never assume)"
  local npm_core npm_relay health
  npm_core="$(npm view ctxfile version 2>/dev/null || echo '?')"
  npm_relay="$(npm view @ctxfile/relay version 2>/dev/null || echo '?')"
  [[ "$npm_core" == "$core_version" ]] && ok "npm ctxfile@$npm_core" || echo "  npm shows ctxfile@$npm_core, expected $core_version"
  [[ "$npm_relay" == "$relay_version" ]] && ok "npm @ctxfile/relay@$npm_relay" || echo "  npm shows @ctxfile/relay@$npm_relay, expected $relay_version"
  health="$(curl -fsS "$RELAY_URL/healthz" || echo '{}')"
  echo "  relay /healthz: $health"
  [[ "$health" == *"\"version\":\"$relay_version\""* ]] && ok "relay serves $relay_version" || echo "  relay is not on $relay_version yet"
  [[ "$health" == *'"key_source":"secret"'* ]] && ok "relay master key comes from the Fly secret" || echo "  WARNING: relay key_source is not \"secret\""
  for page in /docs/tasks /docs/clients /setup.md /security; do
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL$page")"
    [[ "$code" == "200" ]] && ok "$SITE_URL$page 200" || echo "  $SITE_URL$page answered $code"
  done
}

if [[ "${1:-}" == "--verify" ]]; then
  verify_live
  exit 0
fi

say "0. Preconditions"
[[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || die "check out main first (the PR must be merged)"
git fetch origin main --quiet
[[ -z "$(git status --porcelain)" ]] || die "working tree is not clean"
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || die "local main differs from origin/main; git pull first"
who="$(git config user.name) <$(git config user.email)>"
[[ "$who" == "$IDENTITY" ]] || die "git identity is '$who'; this repo releases only as $IDENTITY"
for tool in npm node curl openssl flyctl npx mcp-publisher; do
  command -v "$tool" >/dev/null || die "$tool is not installed"
done
npm whoami >/dev/null 2>&1 || die "not logged in to npm (npm login)"
flyctl auth whoami >/dev/null 2>&1 || die "not logged in to Fly (flyctl auth login)"
ok "on main, clean, identity $IDENTITY, tools present"

say "1. Versions move together"
check_eq() { [[ "$2" == "$3" ]] || die "$1 is $2, expected $3"; ok "$1 $2"; }
check_eq "packages/core/src/version.ts" "$(sed -n 's/.*VERSION = "\(.*\)".*/\1/p' packages/core/src/version.ts)" "$core_version"
check_eq "server.json version" "$(json_field server.json .version)" "$core_version"
check_eq "server.json packages[0].version" "$(json_field server.json '.packages[0].version')" "$core_version"
check_eq "plugins/ctxfile plugin.json" "$(json_field plugins/ctxfile/.claude-plugin/plugin.json .version)" "$core_version"
check_eq "packages/core/manifest.json" "$(json_field packages/core/manifest.json .version)" "$core_version"
check_eq "packages/relay/src/version.ts" "$(sed -n 's/.*VERSION = "\(.*\)".*/\1/p' packages/relay/src/version.ts)" "$relay_version"
echo "  relay depends on ctxfile $(json_field packages/relay/package.json ".dependencies.ctxfile")"

say "2. Gate: lint, typecheck, build, test, site build"
npm ci
npm run build
npm run typecheck
npm run lint
npm test
npm --prefix apps/web run build
ok "gate passed"

say "3. Publish to npm (core first: the relay builds against the published core)"
if [[ "$(npm view "ctxfile@$core_version" version 2>/dev/null || true)" == "$core_version" ]]; then
  ok "ctxfile@$core_version is already on npm"
elif confirm "Publish ctxfile@$core_version to npm?"; then
  (cd packages/core && npm publish --access public)
fi
if [[ "$(npm view "@ctxfile/relay@$relay_version" version 2>/dev/null || true)" == "$relay_version" ]]; then
  ok "@ctxfile/relay@$relay_version is already on npm"
elif confirm "Publish @ctxfile/relay@$relay_version to npm?"; then
  (cd packages/relay && npm publish --access public)
fi

say "4. Relay: master key secret, then deploy"
if flyctl secrets list -a "$FLY_APP" 2>/dev/null | grep -q CTXFILE_RELAY_MASTER_KEY; then
  ok "CTXFILE_RELAY_MASTER_KEY is set on $FLY_APP"
else
  echo "  The new relay refuses to start without CTXFILE_RELAY_MASTER_KEY."
  echo "  This generates a fresh key straight into Fly's secret store; it is never shown or saved here."
  echo "  Fly keeps it; if it is ever lost, Standard vaults must re-enroll their keys from a device."
  if confirm "Set a new CTXFILE_RELAY_MASTER_KEY on $FLY_APP now?"; then
    # Through stdin, so the key never appears in a process list.
    printf 'CTXFILE_RELAY_MASTER_KEY=%s\n' "$(openssl rand -base64 32)" | flyctl secrets import --stage -a "$FLY_APP" >/dev/null
    ok "secret staged (it takes effect with the deploy below)"
  else
    die "the relay cannot be deployed without the secret"
  fi
fi
if confirm "Deploy the relay ($relay_version) to Fly?"; then
  flyctl deploy . --config packages/relay/fly.toml --dockerfile packages/relay/Dockerfile -a "$FLY_APP"
  echo "  Wraps still under the old key file, if any:"
  flyctl ssh console -a "$FLY_APP" -C "node /app/packages/relay/dist/cli.js keyring status"
  if confirm "Move every wrap onto the new key (keyring rewrap)?"; then
    flyctl ssh console -a "$FLY_APP" -C "node /app/packages/relay/dist/cli.js keyring rewrap"
    if confirm "Delete the old relay-master.key from the volume (keyring retire-file; refuses if anything still needs it)?"; then
      flyctl ssh console -a "$FLY_APP" -C "node /app/packages/relay/dist/cli.js keyring retire-file" || true
    fi
  fi
fi

say "5. Site and docs"
if confirm "Deploy apps/web/out to Cloudflare Pages ($PAGES_PROJECT, main)?"; then
  npx wrangler pages deploy apps/web/out --project-name "$PAGES_PROJECT" --branch main
fi

say "6. MCP Registry"
if confirm "Publish dev.ctxfile/ctxfile $core_version to the MCP Registry?"; then
  mcp-publisher login dns
  mcp-publisher publish
fi

say "7. Tag and GitHub release"
tag="v$core_version"
if git rev-parse "$tag" >/dev/null 2>&1; then
  ok "tag $tag exists"
elif confirm "Create and push tag $tag (as $IDENTITY)?"; then
  git tag -a "$tag" -m "ctxfile $core_version, relay $relay_version"
  git push origin "$tag"
fi
if command -v gh >/dev/null && [[ "$(uname -sm)" == "Darwin arm64" ]]; then
  if confirm "Build the Claude Desktop .mcpb and attach it to a GitHub release $tag?"; then
    npm run mcpb:pack
    gh release create "$tag" ctxfile-macos-arm64.mcpb --title "ctxfile $core_version" --notes "See https://ctxfile.dev/changelog" || \
      gh release upload "$tag" ctxfile-macos-arm64.mcpb --clobber
  fi
else
  echo "  Skipped the .mcpb release (needs gh on an Apple Silicon Mac)."
fi

verify_live

say "Done. Last step from the checklist: add the dated Notion update (ask Claude; no secrets in Notion)."
