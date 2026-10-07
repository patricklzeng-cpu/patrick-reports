// Build a macOS .app bundle for Patrick OS.
//
// What this produces:
//   dist/Patrick OS.app/         ← double-clickable native bundle
//     ├── Contents/
//     │   ├── Info.plist
//     │   ├── MacOS/
//     │   │   ├── Patrick OS       (compiled launcher, no shebang)
//         │   └── Patrick OS.command (Terminal-friendly launcher w/ logs)
//     │   └── Resources/
//     │       └── app/             (the actual Node app — src/, public/, package.json)
//
// After building, double-click `Patrick OS.app` and the app launches
// the server in Terminal.app so the user can see the live log and
// Ctrl-C cleanly.
//
// This script does NOT depend on any npm package; it writes files directly.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(APP_DIR, "dist");
const APP_NAME = "Patrick OS.app";
const BUNDLE = path.join(DIST_DIR, APP_NAME);
const CONTENTS = path.join(BUNDLE, "Contents");
const MACOS_DIR = path.join(CONTENTS, "MacOS");
const RESOURCES_DIR = path.join(CONTENTS, "Resources");
const PAYLOAD_DIR = path.join(RESOURCES_DIR, "app");

async function rmrf(p) {
  await fs.rm(p, { recursive: true, force: true });
}

async function copyDir(src, dest, excludes = []) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    if (excludes.some((x) => e.name === x || e.name.startsWith(x))) continue;
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      await copyDir(s, d, excludes);
    } else if (e.isFile()) {
      await fs.copyFile(s, d);
    }
  }
}

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Patrick OS</string>
  <key>CFBundleDisplayName</key>
  <string>Patrick OS</string>
  <key>CFBundleIdentifier</key>
  <string>local.patrickos.desktop</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleSignature</key>
  <string>????</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSRequiresAquaSystemAppearance</key>
  <false/>
  <key>CFBundleDocumentTypes</key>
  <array/>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.developer-tools</string>
  <key>CFBundleExecutable</key>
  <string>Patrick OS</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>NSAppleScriptEnabled</key>
  <false/>
</dict>
</plist>
`;

// Compiled launcher: native Mach-O shell that opens Terminal.app and runs the .command.
// Easiest path: use a tiny shell script + chmod +x. macOS allows unsigned executable
// shells inside .app bundles as long as Info.plist points at them.
const LAUNCHER_SH = `#!/bin/bash
# Patrick OS launcher — runs when the user double-clicks Patrick OS.app.
# Forwards to the .command launcher so the user sees live logs.
DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$DIR/Patrick OS.command"
`;

const COMMAND_SH = `#!/bin/bash
# Patrick OS — terminal launcher.
# Use this if you want to start Patrick OS from the terminal directly.

# Find the .app bundle this script lives in.
SELF="$0"
while [ -h "$SELF" ]; do
  DIR="$(cd -P "$(dirname "$SELF")" && pwd)"
  SELF="$(readlink "$SELF")"
  [[ "$SELF" != /* ]] && SELF="$DIR/$SELF"
done
DIR="$(cd -P "$(dirname "$SELF")" && pwd)"
APP_DIR="$DIR"
PAYLOAD="$APP_DIR/../Resources/app"
if [ ! -d "$PAYLOAD" ]; then
  PAYLOAD="$APP_DIR/Resources/app"
fi
if [ ! -d "$PAYLOAD" ]; then
  echo "[Patrick OS] could not locate Resources/app inside the bundle."
  echo "  expected: $APP_DIR/../Resources/app"
  exit 1
fi

cd "$PAYLOAD" || exit 1

PORT="\${PORT:-7331}"

echo "=========================================="
echo "  Patrick OS v0.1.0 — Agentic Framework"
echo "=========================================="
echo "  payload: $PAYLOAD"
echo "  port:    http://127.0.0.1:$PORT"
echo ""
echo "  Press Ctrl-C to stop."
echo ""

# Pick the user's preferred Node. Prefer Homebrew, then ~/.local, then PATH.
NODE_BIN="\${NODE_BIN:-}"
if [ -z "$NODE_BIN" ]; then
  if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
  elif [ -x "/opt/homebrew/bin/node" ]; then
    NODE_BIN="/opt/homebrew/bin/node"
  elif [ -x "/usr/local/bin/node" ]; then
    NODE_BIN="/usr/local/bin/node"
  else
    echo "[Patrick OS] node not found in PATH. Install Node 18+ from https://nodejs.org/"
    read -p "Press Enter to close."
    exit 1
  fi
fi

echo "  using node: $NODE_BIN ($($NODE_BIN --version))"
echo ""

# Open browser after a short delay so the server has time to boot.
(sleep 2 && open "http://127.0.0.1:$PORT") >/dev/null 2>&1 &

exec "$NODE_BIN" src/server.js
`;

async function main() {
  console.log("[build:app] cleaning dist/");
  await rmrf(BUNDLE);

  console.log("[build:app] creating bundle layout");
  await fs.mkdir(MACOS_DIR, { recursive: true });
  await fs.mkdir(PAYLOAD_DIR, { recursive: true });

  console.log("[build:app] writing Info.plist");
  await fs.writeFile(path.join(CONTENTS, "Info.plist"), INFO_PLIST, "utf8");

  console.log("[build:app] writing launchers");
  await fs.writeFile(path.join(MACOS_DIR, "Patrick OS"), LAUNCHER_SH, "utf8");
  await fs.chmod(path.join(MACOS_DIR, "Patrick OS"), 0o755);
  await fs.writeFile(path.join(MACOS_DIR, "Patrick OS.command"), COMMAND_SH, "utf8");
  await fs.chmod(path.join(MACOS_DIR, "Patrick OS.command"), 0o755);

  console.log("[build:app] copying payload (src/, public/, package.json, scripts/, test/)");
  // Exclude data/ + workspace/ + dist/ + node_modules/ + .DS_Store
  await copyDir(APP_DIR, PAYLOAD_DIR, [
    "node_modules",
    ".DS_Store",
    "dist",
    "data",
    "workspace",
    ".git",
    "test",
    ".v9-progress.json",
    ".wrangler",
    ".wrangler.bak-152316",
    ".deploy-trigger",
    ".deploy-trigger-2",
    ".deploy-trigger-3",
    ".deploy-trigger-4",
    ".daily-summary-state.json",
  ]);

  // Verify the bundle by listing its contents.
  const stat = await fs.stat(PAYLOAD_DIR);
  console.log(`[build:app] payload size: ${(await getDirSize(PAYLOAD_DIR) / 1024).toFixed(1)} KB`);
  console.log(`[build:app] bundle:    ${BUNDLE}`);
  console.log(`[build:app] open with: open "${BUNDLE}"`);
  console.log("[build:app] done.");
}

async function getDirSize(p) {
  let total = 0;
  const entries = await fs.readdir(p, { withFileTypes: true });
  for (const e of entries) {
    const sub = path.join(p, e.name);
    if (e.isDirectory()) total += await getDirSize(sub);
    else if (e.isFile()) {
      const st = await fs.stat(sub);
      total += st.size;
    }
  }
  return total;
}

main().catch((err) => {
  console.error("[build:app] fatal:", err.stack);
  process.exit(1);
});