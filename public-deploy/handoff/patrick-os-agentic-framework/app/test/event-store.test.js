import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventStore } from "../src/store/event-store.js";

test("event store persists ordered facts and supports cursors", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patrick-events-"));
  const store = new EventStore(root, "mission-test");
  await store.ready();
  const first = await store.append({ missionId: "mission-test", type: "mission.created", payload: {} });
  const second = await store.append({ missionId: "mission-test", type: "checkpoint.created", payload: { name: "Plan" } });
  assert.equal(first.sequence, 0);
  assert.equal(second.sequence, 1);
  assert.deepEqual(store.list(1).map((event) => event.type), ["checkpoint.created"]);

  const replay = new EventStore(root, "mission-test");
  await replay.ready();
  assert.deepEqual(replay.list().map((event) => event.type), ["mission.created", "checkpoint.created"]);
});

test("event store converts adapter-local sequence numbers into monotonic global cursors", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patrick-provider-seq-"));
  const store = new EventStore(root, "mission-test");
  await store.ready();
  const first = await store.append({ missionId: "mission-test", type: "task.started", source: "openai", sequence: 0, payload: {} });
  const second = await store.append({ missionId: "mission-test", type: "task.started", source: "hermes", sequence: 0, payload: {} });
  const third = await store.append({ missionId: "mission-test", type: "task.completed", source: "hermes", sequence: 2, payload: {} });

  assert.deepEqual([first.sequence, second.sequence, third.sequence], [0, 1, 2]);
  assert.deepEqual([first.payload.providerSequence, second.payload.providerSequence, third.payload.providerSequence], [0, 0, 2]);
  assert.equal(store.list(2)[0].type, "task.completed");
});
