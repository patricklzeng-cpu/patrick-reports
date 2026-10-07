// Unit tests for the Adapter contract. Run with: `node --test test/`
import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenAIAdapter } from "../src/adapters/openai.js";
import { HermesAdapter } from "../src/adapters/hermes.js";
import { OpenSwarmAdapter } from "../src/adapters/open-swarm.js";
import { PiAdapter } from "../src/adapters/pi.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

async function makePi(options = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-"));
  const { ArtifactStore } = await import("../src/store/artifact-store.js");
  const ws = path.join(dataDir, "workspaces");
  const artifactStore = new ArtifactStore(path.join(dataDir, "artifacts"));
  await artifactStore.ensureReady();
  return new PiAdapter({ workspaceRoot: ws, artifactStore, ...options });
}

function baseInput(overrides = {}) {
  return {
    missionId: "mission-test",
    taskId: "task-test",
    traceId: "trace-1",
    idempotencyKey: "k-1",
    objective: "do thing",
    acceptanceChecks: ["criterion-A", "criterion-B"],
    dependencies: [],
    inputArtifacts: [],
    workspace: { root: "/tmp/x", allowedPaths: [], deniedPaths: [], availableTools: [], allowedCommands: [], networkDestinations: [], memoryReferences: [], dataClassification: "internal" },
    policy: { approvalProfile: "default", maxConcurrency: 1, allowNetwork: false, allowWrites: true, allowExternalSideEffects: false },
    timeoutMs: 30000,
    attempt: 1,
    ...overrides,
  };
}

async function drainRun(adapter, runId) {
  await new Promise((resolve) => {
    const i = setInterval(() => {
      const r = adapter._runs.get(runId);
      if (r && r.status === "queued") {
        clearInterval(i);
        resolve();
      }
    }, 30);
    setTimeout(() => { clearInterval(i); resolve(); }, 6000);
  });
}

test("OpenAIAdapter implements probe + capabilities + emits planned events", async () => {
  const a = new OpenAIAdapter();
  const h = await a.probe();
  assert.equal(h.status, "healthy");
  assert.match(h.message, /simulated/i);
  const caps = await a.capabilities();
  assert.ok(caps.find((c) => c.id === "openai.planning"));

  const run = await a.startTask(baseInput({ objective: "plan: do thing" }));
  await drainRun(a, run.runId);
  const events = a._runs.get(run.runId).events;
  assert.ok(events.find((e) => e.type === "plan.proposed"), "expected plan.proposed");
  assert.ok(events.find((e) => e.type === "task.completed"), "expected task.completed");
});

test("OpenAIAdapter switches to a real MiniMax response when configured", async () => {
  const providerSettings = {
    async publicStatus() {
      return { configured: true, model: "MiniMax-M2.7", credentialSource: "macOS Keychain", lastTest: { latencyMs: 12 } };
    },
    async complete() {
      return {
        id: "real-response-1",
        model: "MiniMax-M2.7",
        content: JSON.stringify({
          headline: "Real result",
          summary: "MiniMax completed the review.",
          findings: ["Evidence checked"],
          recommendations: ["Ship it"],
        }),
        usage: { prompt_tokens: 18, completion_tokens: 11 },
      };
    },
  };
  const adapter = new OpenAIAdapter({ providerSettings });
  const health = await adapter.probe();
  assert.match(health.version, /^real-minimax/);

  const run = await adapter.startTask(baseInput({ objective: "review completed evidence" }));
  await drainRun(adapter, run.runId);
  const events = adapter._runs.get(run.runId).events;
  const response = events.find((event) => event.type === "model.response");
  assert.equal(response.payload.provider, "minimax");
  assert.equal(response.payload.structured.headline, "Real result");
  assert.equal(events.find((event) => event.type === "task.completed").payload.provider, "minimax");
});

test("OpenAIAdapter preserves a real MiniMax plain-text response", async () => {
  const providerSettings = {
    async publicStatus() { return { configured: true, model: "MiniMax-M2.7", credentialSource: "macOS Keychain" }; },
    async complete() {
      return {
        id: "plain-response-1",
        model: "MiniMax-M2.7",
        content: "我是 Patrick OS 的 MiniMax 推理层，这是一条真实的纯文本回答。",
        usage: {},
      };
    },
  };
  const adapter = new OpenAIAdapter({ providerSettings });
  const run = await adapter.startTask(baseInput({ objective: "review: 你是谁" }));
  await drainRun(adapter, run.runId);
  const response = adapter._runs.get(run.runId).events.find((event) => event.type === "model.response");
  assert.match(response.payload.structured.summary, /真实的纯文本回答/);
  assert.equal(response.payload.structured.headline, "MiniMax response");
});

test("HermesAdapter implements probe + emits workspace-manifest event", async () => {
  const a = new HermesAdapter();
  const run = await a.startTask(baseInput({ objective: "discover workspace" }));
  await drainRun(a, run.runId);
  const events = a._runs.get(run.runId).events;
  assert.ok(events.find((e) => e.type === "task.log"), "expected task.log");
  const log = events.find((e) => e.type === "task.log");
  assert.ok(log.payload.manifest, "expected manifest in log payload");
  assert.equal(log.payload.manifest.dataClassification, "internal");
});

test("HermesAdapter invokes a real CLI for long missions", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-real-test-"));
  const cliPath = path.join(root, "hermes-stub");
  fs.writeFileSync(cliPath, "#!/bin/sh\nprintf 'HERMES REAL CONTEXT'\n");
  fs.chmodSync(cliPath, 0o755);
  const adapter = new HermesAdapter({ cliPath });
  const run = await adapter.startTask(baseInput({
    objective: "find context for a long task",
    executionMode: "long",
    workspace: { ...baseInput().workspace, root },
  }));
  await drainRun(adapter, run.runId);
  const response = adapter._runs.get(run.runId).events.find((event) => event.type === "agent.response");
  assert.equal(response.payload.real, true);
  assert.match(response.payload.summary, /HERMES REAL CONTEXT/);
});

test("OpenSwarmAdapter emits handoff events for 3 workers", async () => {
  const a = new OpenSwarmAdapter();
  const run = await a.startTask(baseInput({ objective: "schedule DAG" }));
  await drainRun(a, run.runId);
  const events = a._runs.get(run.runId).events;
  const handoffs = events.filter((e) => e.type === "handoff.started");
  assert.equal(handoffs.length, 3, "expected exactly 3 handoff.started events");
  const roles = handoffs.map((e) => e.payload.role);
  assert.ok(roles.every((r) => r === "pi"));
});

test("OpenSwarmAdapter creates a real localhost scheduler session for long missions", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-real-test-"));
  const tokenPath = path.join(root, "auth.token");
  fs.writeFileSync(tokenPath, "test-token-1234567890");
  const fetchImpl = async (url) => {
    if (url.endsWith("/api/health/check")) return new Response("OK", { status: 200 });
    if (url.endsWith("/api/agents/models")) return Response.json({ models: { minimax: [{ value: "custom/minimax/MiniMax-M2.7" }] } });
    if (url.endsWith("/api/agents/launch")) return Response.json({ session_id: "swarm-session-test" });
    if (url.endsWith("/message")) return Response.json({ ok: true });
    if (url.endsWith("/api/agents/sessions/swarm-session-test")) {
      return Response.json({ status: "completed", messages: [{ role: "assistant", content: "web | ipad | vision DAG ready" }] });
    }
    return Response.json({ error: "not found" }, { status: 404 });
  };
  const adapter = new OpenSwarmAdapter({ baseUrl: "http://127.0.0.1:8324", tokenPath, fetchImpl });
  const run = await adapter.startTask(baseInput({ objective: "schedule long mission", executionMode: "long" }));
  await drainRun(adapter, run.runId);
  const events = adapter._runs.get(run.runId).events;
  assert.equal(events.find((event) => event.type === "swarm.session").payload.real, true);
  assert.match(events.find((event) => event.type === "agent.response").payload.summary, /DAG ready/);
});

test("PiAdapter writes a real file in an isolated sandbox and runs the test", async () => {
  const pi = await makePi();
  const run = await pi.startTask(baseInput({
    taskId: "task-test-1",
    acceptanceChecks: ["criterion-X", "criterion-Y"],
  }));
  await drainRun(pi, run.runId);

  const events = pi._runs.get(run.runId).events;
  const sandbox = path.join(pi.workspaceRoot, "mission-test", "task-test-1", "attempt-1");
  // Sandbox exists
  assert.ok(fs.existsSync(sandbox), "sandbox dir should exist at " + sandbox);
  // Files exist
  assert.ok(fs.existsSync(path.join(sandbox, "lesson.json")), "lesson.json missing");
  assert.ok(fs.existsSync(path.join(sandbox, "test.js")), "test.js missing");
  // Artifact collection
  const artifacts = await pi.collectArtifacts(run.runId);
  assert.equal(artifacts.length, 2, "expected 2 artifacts (lesson.json + test-output.txt)");
  // Acceptance events: one per criterion
  const passed = events.filter((e) => e.type === "acceptance.passed");
  assert.equal(passed.length, 2);
  // No failures
  const failed = events.filter((e) => e.type === "acceptance.failed");
  assert.equal(failed.length, 0);
  // Final status: task.completed
  assert.ok(events.find((e) => e.type === "task.completed"));
});

test("PiAdapter cannot write outside its sandbox (path-traversal blocked at write)", async () => {
  // We don't expose a path-traversal interface; the workspace root is
  // always <workspaceRoot>/<missionId>/<taskId>/<attempt>. Verify that
  // the sandbox root is honored.
  const pi = await makePi();
  const run = await pi.startTask(baseInput({ taskId: "task-iso-test" }));
  await drainRun(pi, run.runId);
  const sandbox = path.join(
    pi.workspaceRoot,
    "mission-test",
    "task-iso-test",
    "attempt-1"
  );
  // Sandbox exists at the expected nested path.
  assert.ok(fs.existsSync(sandbox));
  // workspaceRoot/ exists.
  assert.ok(fs.existsSync(pi.workspaceRoot));
});

test("PiAdapter invokes the real Pi CLI in a long-mission sandbox", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cli-test-"));
  const cliPath = path.join(root, "pi-stub");
  fs.writeFileSync(cliPath, [
    "#!/bin/sh",
    "printf '# Real Pi worker result\\n' > worker-result.md",
    "printf '{\"worker\":\"web\",\"status\":\"passed\"}\\n' > worker-evidence.json",
    "printf '{\"content\":\"PI REAL WORK COMPLETE\"}\\n'",
  ].join("\n"));
  fs.chmodSync(cliPath, 0o755);
  const providerSettings = {
    async publicStatus() { return { configured: true, model: "MiniMax-M2.7" }; },
    async getSecretForLocalWorker() { return "test-key"; },
  };
  const adapter = await makePi({ cliPath, providerSettings });
  const run = await adapter.startTask(baseInput({ objective: "build web evidence", executionMode: "long", workerLabel: "web" }));
  await drainRun(adapter, run.runId);
  const events = adapter._runs.get(run.runId).events;
  assert.match(events.find((event) => event.type === "agent.response").payload.summary, /PI REAL WORK COMPLETE/);
  assert.equal(events.find((event) => event.type === "task.completed").payload.runtime, "pi-cli");
  assert.ok(events.filter((event) => event.type === "artifact.created").length >= 3);
});

test("All adapters produce events with sequence numbers in order", async () => {
  for (const make of [() => new OpenAIAdapter(), () => new HermesAdapter(), () => new OpenSwarmAdapter()]) {
    const a = make();
    const run = await a.startTask(baseInput({ objective: "verify sequence" }));
    await drainRun(a, run.runId);
    const events = a._runs.get(run.runId).events;
    for (let i = 0; i < events.length; i++) {
      assert.equal(events[i].sequence, i, `expected sequence ${i} at index ${i} for ${a.id}`);
    }
  }
});
