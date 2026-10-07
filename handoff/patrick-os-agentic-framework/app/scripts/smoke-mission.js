// End-to-end smoke test: boots the full orchestrator, drives the demo
// mission through to completion, and verifies the Event Store contains
// every required event type + that the Pi adapter actually wrote files
// to a real sandbox + that the translation-decision approval is surfaced
// (advisory; does not block mission completion). Exits 0 on success,
// non-zero on failure.
//
// Usage: `node scripts/smoke-mission.js`

import { Orchestrator } from "../src/orchestrator/orchestrator.js";
import { buildDemoMission } from "../src/orchestrator/demo-mission.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import os from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, "..");

async function main() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "patrick-os-smoke-"));
  const workspaceRoot = path.join(dataDir, "workspaces");
  process.stdout.write(`[smoke] data dir: ${dataDir}\n`);

  const orchestrator = new Orchestrator({ dataDir, workspaceRoot });
  await orchestrator.ready();
  await orchestrator.resetEventStore();

  const mission = buildDemoMission();
  orchestrator.registerMission(mission);
  process.stdout.write(`[smoke] mission registered: ${mission.id}\n`);

  // Drive the mission through the real human approval boundary.
  const run = orchestrator.runMission(mission.id);
  const approval = await waitFor(() => orchestrator.approvals.pending()[0]);
  process.stdout.write(`[smoke] approval gate reached: ${approval.payload.action}\n`);
  const resolved = await orchestrator.approvals.resolve(
    approval.id,
    "approve",
    "smoke auto-approved safer wording"
  );
  await run;
  process.stdout.write(`[smoke] mission walked; ${mission.acceptanceCriteria.length} acceptance criteria\n`);

  // Inspect the Event Store.
  const events = orchestrator.eventStore.list();
  const types = new Set(events.map((e) => e.type));

  const required = [
    "mission.created",
    "checkpoint.created",
    "task.started",
    "task.completed",
    "artifact.created",
    "acceptance.passed",
    "approval.requested",
    "mission.completed",
  ];
  const missing = required.filter((t) => !types.has(t));
  if (missing.length > 0) {
    process.stderr.write(`[smoke] MISSING event types: ${missing.join(", ")}\n`);
    process.exit(1);
  }

  // Mission final status: completed.
  if (mission.status !== "completed") {
    process.stderr.write(`[smoke] mission status: ${mission.status} (expected completed)\n`);
    process.exit(2);
  }

  // Pi adapter produced real artifacts on disk.
  const piSandbox = path.join(workspaceRoot, mission.id, "task-web", "attempt-1");
  try {
    await fs.access(path.join(piSandbox, "lesson.json"));
    await fs.access(path.join(piSandbox, "test.js"));
  } catch (err) {
    process.stderr.write(`[smoke] Pi sandbox missing files: ${err.message}\n`);
    process.exit(3);
  }

  // Acceptance: at least 18 (3 platforms × 6 criteria max) required checks passed.
  const passed = events.filter((e) => e.type === "acceptance.passed");
  if (passed.length < 18) {
    process.stderr.write(`[smoke] acceptance.passed count: ${passed.length} (expected ≥ 18)\n`);
    process.exit(4);
  }

  // Translate lesson.json to verify content (real artifact, not stub).
  const lesson = JSON.parse(await fs.readFile(path.join(piSandbox, "lesson.json"), "utf8"));
  if (!lesson.title?.en || !lesson.title?.zh) {
    process.stderr.write(`[smoke] lesson.json missing bilingual title\n`);
    process.exit(5);
  }
  if (lesson.planets?.length !== 8) {
    process.stderr.write(`[smoke] lesson.json planets count: ${lesson.planets?.length} (expected 8)\n`);
    process.exit(6);
  }

  // Approval engine recorded the translation-decision request and resolution.
  const pending = orchestrator.approvals.pending();
  if (pending.length !== 0) {
    process.stderr.write(`[smoke] unresolved approvals remain: ${pending.length}\n`);
    process.exit(7);
  }
  if (resolved.status !== "approved") {
    process.stderr.write(`[smoke] approval resolution failed: ${resolved.status}\n`);
    process.exit(8);
  }

  process.stdout.write(`[smoke] PASSED\n`);
  process.stdout.write(`  events:    ${events.length}\n`);
  process.stdout.write(`  artifacts: ${events.filter((e) => e.type === "artifact.created").length}\n`);
  process.stdout.write(`  status:    ${mission.status}\n`);
  process.stdout.write(`  pi sandbox: ${piSandbox}\n`);
  process.stdout.write(`  lesson title: ${lesson.title.en} / ${lesson.title.zh}\n`);
  process.stdout.write(`  planets: ${lesson.planets.length}\n`);
  process.stdout.write(`  approval resolved: ${resolved.status}\n`);
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[smoke] fatal: ${err.stack}\n`);
  process.exit(99);
});

async function waitFor(read, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timed out waiting for approval gate");
}
