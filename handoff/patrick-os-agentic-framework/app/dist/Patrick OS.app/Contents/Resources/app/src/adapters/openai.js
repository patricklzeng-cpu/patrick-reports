// OpenAI adapter — SIMULATED.
// Honestly labeled in /api/adapters. Used for planning, review, and judgment
// steps. Real implementation would call api.openai.com or run an MCP tool
// bridge; for the desktop build we generate structured mock plans and reviews.

import { AgentAdapter } from "../domain/adapter-contract.js";
import crypto from "node:crypto";

const SIMULATION_NOTICE =
  "OpenAI adapter is simulated in this build. " +
  "Real implementation would POST to api.openai.com /v1/chat/completions " +
  "with structured output or route through the Tool Gateway. " +
  "Plans / reviews here are deterministic mocks seeded by missionId.";

export class OpenAIAdapter extends AgentAdapter {
  constructor() {
    super();
    this.id = "openai";
    this.displayName = "OpenAI / ChatGPT (simulated)";
    this._runs = new Map();
  }

  async probe() {
    return {
      adapterId: this.id,
      status: "healthy",
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      version: "sim-1.0.0",
      capabilities: ["planning", "review", "synthesis", "judgment"],
      message: SIMULATION_NOTICE,
    };
  }

  async capabilities() {
    return [
      {
        id: "openai.planning",
        title: "Structured planning",
        inputSchemaVersion: "1.0.0",
        outputSchemaVersion: "1.0.0",
        supportsStreaming: true,
        supportsCancellation: true,
        locality: "cloud",
        risk: "low",
      },
      {
        id: "openai.review",
        title: "Acceptance review",
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
      buffer: null,
    };
    this._runs.set(runId, run);

    // Schedule completion on next tick so caller can subscribe to events first.
    setImmediate(() => {
      this._emit(run, "task.started", { runId, taskId: input.taskId });
      if (/plan/i.test(input.objective)) {
        this._plan(run);
      } else if (/review/i.test(input.objective)) {
        this._review(run);
      } else if (/synthesis|conflict/i.test(input.objective)) {
        this._synthesize(run);
      } else {
        this._default(run);
      }
      this._emit(run, "task.completed", { runId, taskId: input.taskId });
      run.status = "queued"; // sentinel: done — projection reads events
    });

    return {
      runId,
      adapterId: this.id,
      status: "running",
      startedAt: run.startedAt,
    };
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
    const run = this._runs.get(runId);
    if (!run) return [];
    return run.artifacts || [];
  }

  async getUsage() {
    return { inputTokens: 1200, outputTokens: 480, costUsd: 0.0, wallTimeMs: 0 };
  }

  // ---- internal helpers ----

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

  _plan(run) {
    const input = run.input;
    this._emit(run, "plan.proposed", {
      planSummary: `Structured plan for: ${input.objective}`,
      acceptanceChecks: input.acceptanceChecks,
      tasks: [
        { id: "t-1", title: "Discover workspace", role: "hermes", dependencies: [] },
        { id: "t-2", title: "Schedule parallel build DAG", role: "open-swarm", dependencies: ["t-1"] },
        { id: "t-3", title: "Build Web target", role: "pi", dependencies: ["t-2"] },
        { id: "t-4", title: "Build iPad target", role: "pi", dependencies: ["t-2"] },
        { id: "t-5", title: "Build visionOS target", role: "pi", dependencies: ["t-2"] },
        { id: "t-6", title: "Integrate & translate", role: "hermes", dependencies: ["t-3", "t-4", "t-5"] },
        { id: "t-7", title: "Final acceptance review", role: "openai", dependencies: ["t-6"] },
      ],
    });
    run.artifacts = [
      {
        id: crypto.randomUUID(),
        name: "plan.json",
        uri: "(simulated)",
        checksum: "(simulated)",
        mimeType: "application/json",
        version: 1,
      },
    ];
  }

  _review(run) {
    this._emit(run, "review.started", { runId: run.runId });
    for (const ac of run.input.acceptanceChecks || []) {
      this._emit(run, "acceptance.passed", { statement: ac });
    }
  }

  _synthesize(run) {
    this._emit(run, "task.log", { message: "Synthesizing… (simulated)" });
    run.artifacts = [
      {
        id: crypto.randomUUID(),
        name: "synthesis.md",
        uri: "(simulated)",
        checksum: "(simulated)",
        mimeType: "text/markdown",
        version: 1,
      },
    ];
  }

  _default(run) {
    this._emit(run, "task.log", { message: `OpenAI mock handling: ${run.input.objective}` });
  }
}