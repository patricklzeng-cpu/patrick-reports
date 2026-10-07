// Build a macOS .dmg installer for Patrick OS from the .app bundle.
//
// We delegate the actual hdiutil orchestration to scripts/build-dmg.sh
// (single bash process) because Node child_process under macOS sandbox
// triggers a kernel-level "Only one image can be created at a time"
// guard that prevents hdiutil create from running twice in quick
// succession.
//
// Output: dist/Patrick OS-0.1.0.dmg
//
// Usage: `npm run build:dmg`  (must run after `npm run build:app`)

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(APP_DIR, "dist");
const APP_BUNDLE = path.join(DIST_DIR, "Patrick OS.app");
const STAGING_DIR = path.join(DIST_DIR, "dmg-staging");
const BUILD_SH = path.join(__dirname, "build-dmg.sh");
const DMG_FINAL = path.join(DIST_DIR, "Patrick OS-0.1.0.dmg");

async function rmrf(p) {
  await fs.rm(p, { recursive: true, force: true });
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

async function main() {
  if (process.platform !== "darwin") {
    console.error("[build:dmg] this build script only runs on macOS.");
    console.error("            current platform: " + process.platform);
    process.exit(1);
  }

  try {
    await fs.access(APP_BUNDLE);
  } catch (err) {
    console.error(`[build:dmg] ${APP_BUNDLE} not found. Run 'npm run build:app' first.`);
    process.exit(2);
  }

  // Pre-compute payload size by copying .app into staging dir, then measuring.
  console.log("[build:dmg] staging .app to compute size");
  await rmrf(STAGING_DIR);
  await fs.mkdir(STAGING_DIR, { recursive: true });
  await fs.cp(APP_BUNDLE, path.join(STAGING_DIR, "Patrick OS.app"), { recursive: true });
  await fs.symlink("/Applications", path.join(STAGING_DIR, "Applications"));

  const payloadSize = await getDirSize(STAGING_DIR);
  console.log(`[build:dmg] payload size: ${(payloadSize / 1024 / 1024).toFixed(1)} MB`);

  // Cleanup the staging dir; build-dmg.sh will recreate it.
  await rmrf(STAGING_DIR);

  console.log("[build:dmg] invoking build-dmg.sh");
  execSync(`bash "${BUILD_SH}" "${DIST_DIR}" ${payloadSize}`, {
    stdio: "inherit",
  });

  const stat = await fs.stat(DMG_FINAL);
  console.log(`[build:dmg] built: ${DMG_FINAL} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`[build:dmg] mount with: open "${DMG_FINAL}"`);
  console.log(`[build:dmg] then drag "Patrick OS.app" into Applications.`);
  console.log(`[build:dmg] (or run: open -a "${DMG_FINAL}")`);

  // Final cleanup.
  await rmrf(STAGING_DIR);
}

main().catch((err) => {
  console.error("[build:dmg] fatal:", err.stack);
  process.exit(99);
});