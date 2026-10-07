import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Orchestrator } from "../src/orchestrator/orchestrator.js";
import { buildDemoMission } from "../src/orchestrator/demo-mission.js";

test("a user command produces an observable four-system relay and real Pi artifact", { timeout: 20_000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patrick-command-"));
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

  const accepted = await orchestrator.enqueueCommand(mission.id, "Clarify the orbit translation");
  await waitFor(() => orchestrator.eventStore.list().find((event) =>
    event.type === "command.completed" && event.payload.commandId === accepted.commandId
  ));

  const events = orchestrator.eventStore.list().filter((event) =>
    event.taskId === accepted.commandId
      || String(event.taskId || "").startsWith(`${accepted.commandId}-`)
      || event.payload?.commandId === accepted.commandId
  );
  const relay = events
    .filter((event) => event.type === "task.started")
    .map((event) => event.source);

  assert.deepEqual(relay, ["openai", "hermes", "open-swarm", "pi", "openai"]);
  assert.equal(events.some((event) => event.type === "memory.updated" && event.source === "hermes"), true);
  assert.equal(events.some((event) => event.type === "artifact.created" && event.source === "pi" && event.payload.uri), true);
  const result = events.find((event) => event.type === "command.result");
  assert.equal(result?.source, "patrick");
  assert.equal(result?.payload.kind, "execution-summary");
  assert.match(result?.payload.summary, /五段执行链/);
  assert.equal(events.some((event) => event.type === "command.completed"), true);
});

test("a MiniMax failure is surfaced instead of replaced by a generic result", { timeout: 20_000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patrick-command-failure-"));
  const providerSettings = {
    async ready() {},
    async publicStatus() { return { configured: true, model: "MiniMax-M2.7" }; },
    async complete() { throw new Error("MiniMax request failed: invalid API key"); },
  };
  const orchestrator = new Orchestrator({
    dataDir: path.join(root, "data"),
    workspaceRoot: path.join(root, "workspace"),
    providerSettings,
  });
  await orchestrator.ready();
  const mission = buildDemoMission();
  orchestrator.registerMission(mission);

  const accepted = await orchestrator.enqueueCommand(mission.id, "你是谁");
  await waitFor(() => orchestrator.eventStore.list().find((event) =>
    event.type === "command.completed" && event.payload.commandId === accepted.commandId
  ));
  const result = orchestrator.eventStore.list().find((event) =>
    event.type === "command.result" && event.payload.commandId === accepted.commandId
  );
  assert.equal(result.payload.kind, "provider-error");
  assert.match(result.payload.summary, /invalid API key/);
  assert.doesNotMatch(result.payload.summary, /五段执行链已完成/);
});

async function waitFor(read, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timed out waiting for command pipeline");
}
