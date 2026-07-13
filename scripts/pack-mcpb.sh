#!/usr/bin/env bash
# Builds a self-contained .mcpb bundle (core dist + production node_modules).
# Note: better-sqlite3 is a native module, so the bundle is specific to the
# OS/arch it was packed on.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
core="$root/packages/core"
staging="$root/.mcpb-staging"

rm -rf "$staging"
mkdir -p "$staging"

# Build the dashboard SPA into packages/core/ui-dist so the bundle ships it.
(cd "$root" && npm run build -w @ctxfile/dashboard >/dev/null)

cp -R "$core/dist" "$staging/dist"
cp -R "$core/ui-dist" "$staging/ui-dist"
# The behavior pack (canonical.md) is a runtime asset: `ctxfile init` / --print
# resolve ../behaviors/canonical.md relative to dist. Without it the bundle's
# behavior features break.
cp -R "$core/behaviors" "$staging/behaviors"
cp "$core/manifest.json" "$core/package.json" "$core/LICENSE" "$core/README.md" "$staging/"

# Fail loudly if a load-bearing asset is missing rather than shipping a broken bundle.
for required in "dist/cli.js" "ui-dist/index.html" "behaviors/canonical.md"; do
  if [ ! -e "$staging/$required" ]; then
    echo "pack-mcpb: missing required asset '$required'; refusing to pack" >&2
    exit 1
  fi
done

(cd "$staging" && npm install --omit=dev --no-audit --no-fund >/dev/null)

npx -y @anthropic-ai/mcpb pack "$staging" "$root/ctxfile.mcpb"
rm -rf "$staging"
echo "Packed: $root/ctxfile.mcpb"
