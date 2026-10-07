// Unit tests for Event Store + Mission FSM + Routing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventStore } from "../src/store/event-store.js";
import { canTransition, isTerminal, assertTransition } from "../src/domain/mission-fsm.js";
import { pickAdapter, approvalRequired } from "../src/domain/routing.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

test("EventStore appends + persists + reloads", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-test-"));
  const store = new EventStore(dataDir, "mission-x");
  await store.ready();
  await store.append({ missionId: "mission-x", type: "mission.created", source: "patrick", payload: { title: "x" } });
  await store.append({ missionId: "mission-x", type: "task.started", source: "pi", payload: {} });
  assert.equal(store.size(), 2);

  // Reload from disk to verify durability.
  const store2 = new EventStore(dataDir, "mission-x");
  await store2.ready();
  assert.equal(store2.size(), 2);
  assert.equal(store2.list()[0].sequence, 0);
  assert.equal(store2.list()[1].sequence, 1);
});

test("EventStore subscribers receive appended events in real time", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "es-sub-"));
  const store = new EventStore(dataDir, "mission-sub");
  await store.ready();
  const received = [];
  const unsub = store.subscribe((e) => received.push(e));
  await store.append({ missionId: "mission-sub", type: "x", source: "patrick" });
  await store.append({ missionId: "mission-sub", type: "y", source: "patrick" });
  unsub();
  await store.append({ missionId: "mission-sub", type: "z", source: "patrick" });
  assert.equal(received.length, 2, "subscriber should only see events before unsub");
  assert.equal(received[0].type, "x");
  assert.equal(received[1].type, "y");
});

test("Mission FSM allows draft → planning → queued → running → reviewing → completed", () => {
  assert.ok(canTransition("draft", "planning"));
  assert.ok(canTransition("planning", "queued"));
  assert.ok(canTransition("queued", "running"));
  assert.ok(canTransition("running", "reviewing"));
  assert.ok(canTransition("reviewing", "completed"));
});

test("Mission FSM blocks illegal transitions", () => {
  assert.equal(canTransition("draft", "running"), false);
  assert.equal(canTransition("draft", "completed"), false);
  assert.equal(canTransition("completed", "running"), false);
  assert.equal(canTransition("cancelled", "running"), false);
});

test("Mission FSM isTerminal recognises completion states", () => {
  assert.ok(isTerminal("completed"));
  assert.ok(isTerminal("failed"));
  assert.ok(isTerminal("cancelled"));
  assert.equal(isTerminal("running"), false);
  assert.equal(isTerminal("draft"), false);
});

test("assertTransition throws on illegal transitions", () => {
  assert.throws(() => assertTransition("draft", "completed"), /Illegal mission transition/);
});

test("Routing picks openai for plan/review tasks", () => {
  assert.equal(pickAdapter({ title: "Create plan", role: "openai" }).adapterId, "openai");
  assert.equal(pickAdapter({ title: "Review artifacts", role: "openai" }).adapterId, "openai");
});

test("Routing picks hermes for context/discovery tasks", () => {
  assert.equal(pickAdapter({ title: "Discover workspace", role: "hermes" }).adapterId, "hermes");
  assert.equal(pickAdapter({ title: "Local context integration", role: "hermes" }).adapterId, "hermes");
});

test("Routing picks open-swarm for schedule/parallel tasks", () => {
  assert.equal(pickAdapter({ title: "Schedule DAG", role: "open-swarm" }).adapterId, "open-swarm");
  assert.equal(pickAdapter({ title: "Fan-out parallel workers", role: "open-swarm" }).adapterId, "open-swarm");
});

test("Routing picks pi for build/test/run tasks", () => {
  assert.equal(pickAdapter({ title: "Build and test Web lesson", role: "pi" }).adapterId, "pi");
  assert.equal(pickAdapter({ title: "Implement feature X", role: "pi" }).adapterId, "pi");
});

test("approvalRequired returns true for high-risk actions", () => {
  assert.equal(approvalRequired("high", { allowExternalSideEffects: false }), true);
});

test("approvalRequired returns true for external side-effects regardless of risk label", () => {
  assert.equal(approvalRequired("low", { allowExternalSideEffects: true }), true);
});

test("approvalRequired returns false for low-risk, no-side-effect actions", () => {
  assert.equal(approvalRequired("low", { allowExternalSideEffects: false }), false);
});