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

# The manifest travels inside the bundle, so it has to describe THIS artifact
# rather than the repo's intentions. Both corrections apply to the staged copy
# only, leaving the checked-in manifest alone:
#
#   - version is stamped from package.json. It is otherwise a hand-maintained
#     copy of the version and it silently sat at 0.3.1 through the 0.4.0
#     release.
#   - compatibility.platforms is narrowed to the platform we are packing on.
#     better-sqlite3 is a compiled native module, so a bundle built here only
#     runs here; advertising win32 lets Claude Desktop install a bundle on
#     Windows that can never start.
STAGING="$staging" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const staging = process.env.STAGING;
const manifestPath = path.join(staging, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const { version } = JSON.parse(fs.readFileSync(path.join(staging, "package.json"), "utf8"));
manifest.version = version;
manifest.compatibility = { ...manifest.compatibility, platforms: [process.platform] };
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
NODE

(cd "$staging" && npm install --omit=dev --no-audit --no-fund >/dev/null)

# Name the artifact for the platform it can actually run on, so a release page
# holding several of these stays unambiguous. Deliberately NOT versioned: a
# stable filename is what makes
# releases/latest/download/ctxfile-macos-arm64.mcpb a permanent download link,
# so the website never needs editing at release time. The version lives in the
# manifest inside the bundle.
os_label="$(node -p "({darwin:'macos',win32:'windows',linux:'linux'})[process.platform] ?? process.platform")"
artifact="$root/ctxfile-$os_label-$(node -p 'process.arch').mcpb"

npx -y @anthropic-ai/mcpb pack "$staging" "$artifact"
rm -rf "$staging"
echo "Packed: $artifact"
