import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Orchestrator } from "../src/orchestrator/orchestrator.js";
import { buildDemoMission } from "../src/orchestrator/demo-mission.js";

test("demo mission blocks for approval then completes with real Pi artifacts", { timeout: 20_000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patrick-orchestrator-"));
  const orchestrator = new Orchestrator({
    dataDir: path.join(root, "data"),
    workspaceRoot: path.join(root, "workspace"),
    providerSettings: {
      async ready() {},
      async publicStatus() { return { configured: false, model: "MiniMax-M2.7" }; },
    },
  });
  await orchestrator.ready();
  const mission = buildDemoMission();
  orchestrator.registerMission(mission);

  const run = orchestrator.runMission(mission.id);
  const approval = await waitFor(() => orchestrator.approvals.pending()[0]);
  assert.equal(mission.status, "blocked");
  assert.equal(approval.payload.risk, "high");
  await orchestrator.approvals.resolve(approval.id, "approve", "test approved safer wording");
  await run;

  assert.equal(mission.status, "completed");
  const events = orchestrator.eventStore.list();
  assert.equal(events.some((event) => event.type === "approval.requested"), true);
  assert.equal(events.some((event) => event.type === "approval.resolved"), true);
  assert.equal(events.filter((event) => event.type === "checkpoint.created").length, 5);
  assert.equal(events.some((event) => event.type === "mission.completed"), true);
  const realArtifacts = events.filter((event) => event.type === "artifact.created" && event.payload.uri);
  assert.ok(realArtifacts.length >= 6, `expected at least 6 real artifacts, got ${realArtifacts.length}`);
});

async function waitFor(read, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timed out waiting for condition");
}
