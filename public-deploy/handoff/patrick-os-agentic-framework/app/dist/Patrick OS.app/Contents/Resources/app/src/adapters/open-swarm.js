// Open Swarm adapter — SIMULATED.
// Open Swarm receives an approved DAG + concurrency budget + retry policy
// and returns assignments. Real Open Swarm is at openswarm.dev; here we
// just fan tasks out in priority order.

import { AgentAdapter } from "../domain/adapter-contract.js";
import crypto from "node:crypto";

const SIMULATION_NOTICE =
  "Open Swarm adapter is simulated in this build. " +
  "Real implementation would POST to openswarm.dev /v1/runs with the DAG " +
  "and stream worker assignments back. Here we deterministically assign " +
  "tasks to mock workers in dependency order.";

export class OpenSwarmAdapter extends AgentAdapter {
  constructor() {
    super();
    this.id = "open-swarm";
    this.displayName = "Open Swarm (simulated)";
    this._runs = new Map();
  }

  async probe() {
    return {
      adapterId: this.id,
      status: "healthy",
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      version: "sim-1.0.0",
      capabilities: ["dag-scheduling", "parallel-dispatch", "worker-assign"],
      message: SIMULATION_NOTICE,
    };
  }

  async capabilities() {
    return [
      {
        id: "open-swarm.dag",
        title: "DAG scheduling",
        inputSchemaVersion: "1.0.0",
        outputSchemaVersion: "1.0.0",
        supportsStreaming: true,
        supportsCancellation: true,
        locality: "cloud",
        risk: "low",
      },
    ];
  }

  async startTask(input) {
    const runId = crypto.randomUUID();
    const run = {
      runId,
      adapterId: this.id,
      status: "running",
      startedAt: new Date().toISOString(),
      input,
      events: [],
      artifacts: [],
    };
    this._runs.set(runId, run);

    setImmediate(() => {
      this._emit(run, "task.started", { runId });
      const dag = input.payload?.dag || input.objective;
      this._emit(run, "task.log", { message: `DAG accepted: ${typeof dag === "string" ? dag : "(in-payload)"}` });
      this._emit(run, "task.log", {
        message: "Dispatching 3 worker streams across the fleet.",
      });
      this._emit(run, "handoff.started", { worker: "w-1", role: "pi", capability: "web" });
      this._emit(run, "handoff.started", { worker: "w-2", role: "pi", capability: "ipad" });
      this._emit(run, "handoff.started", { worker: "w-3", role: "pi", capability: "visionos" });
      this._emit(run, "handoff.completed", { worker: "w-1" });
      this._emit(run, "handoff.completed", { worker: "w-2" });
      this._emit(run, "handoff.completed", { worker: "w-3" });
      this._emit(run, "task.completed", { runId });
      run.status = "queued";
    });

    return { runId, adapterId: this.id, status: "running", startedAt: run.startedAt };
  }

  async *streamEvents(runId, afterSequence = 0) {
    const run = this._runs.get(runId);
    if (!run) throw new Error(`run ${runId} not found`);
    for (const evt of run.events) {
      if (evt.sequence >= afterSequence) yield evt;
    }
  }

  async cancelTask(runId, reason) {
    const run = this._runs.get(runId);
    if (run) {
      this._emit(run, "task.failed", { runId, reason });
      run.status = "queued";
    }
  }

  async collectArtifacts(runId) {
    return this._runs.get(runId)?.artifacts || [];
  }

  async getUsage() {
    return { wallTimeMs: 0 };
  }

  _emit(run, type, payload, severity = "info") {
    const evt = {
      id: crypto.randomUUID(),
      schemaVersion: "1.0.0",
      sequence: run.events.length,
      timestamp: new Date().toISOString(),
      missionId: run.input.missionId,
      taskId: run.input.taskId,
      runId: run.runId,
      traceId: run.input.traceId,
      source: this.id,
      type,
      severity,
      payload,
    };
    run.events.push(evt);
    return evt;
  }
}