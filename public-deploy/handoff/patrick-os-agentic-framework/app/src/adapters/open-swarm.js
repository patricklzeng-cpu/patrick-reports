// Open Swarm adapter — hybrid. Explicit long missions use the installed
// desktop app's localhost API; ordinary demo tasks remain deterministic.
// Open Swarm receives an approved DAG + concurrency budget + retry policy
// and returns assignments. Real Open Swarm is at openswarm.dev; here we
// just fan tasks out in priority order.

import { AgentAdapter } from "../domain/adapter-contract.js";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const SIMULATION_NOTICE =
  "Open Swarm adapter is simulated in this build. " +
  "Real implementation would POST to openswarm.dev /v1/runs with the DAG " +
  "and stream worker assignments back. Here we deterministically assign " +
  "tasks to mock workers in dependency order.";

export class OpenSwarmAdapter extends AgentAdapter {
  constructor(options = {}) {
    super();
    this.id = "open-swarm";
    this.baseUrl = options.baseUrl || "http://127.0.0.1:8324";
    this.tokenPath = options.tokenPath || path.join(os.homedir(), "Library", "Application Support", "openswarm", "data", "auth.token");
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.displayName = "Open Swarm (real local API for long missions)";
    this._runs = new Map();
  }

  async probe() {
    const started = Date.now();
    const ready = await this._health();
    return {
      adapterId: this.id,
      status: ready ? "healthy" : "degraded",
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      version: ready ? "real-local-api-ready-1.0.0" : "blocked-local-api-1.0.0",
      capabilities: ["dag-scheduling", "parallel-dispatch", "worker-assign"],
      message: ready
        ? `OpenSwarm localhost API is reachable at ${this.baseUrl}; long missions create a real scheduler session.`
        : `OpenSwarm localhost API is not reachable at ${this.baseUrl}. Open the desktop app before a long mission.`,
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

    setImmediate(async () => {
      this._emit(run, "task.started", { runId });
      try {
        if (input.executionMode === "long") await this._runReal(run);
        else this._runSimulation(run);
        this._emit(run, "task.completed", {
          runId,
          provider: input.executionMode === "long" ? "openswarm-local-api" : "simulation",
          sessionId: run.sessionId || null,
        });
      } catch (error) {
        this._emit(run, "task.failed", {
          runId,
          provider: "openswarm-local-api",
          sessionId: run.sessionId || null,
          reason: String(error.message || "OpenSwarm failed").slice(0, 800),
        }, "error");
      } finally {
        run.status = "queued";
      }
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
      if (run.sessionId) {
        try { await this._request(`/api/agents/sessions/${run.sessionId}/stop`, { method: "POST" }); } catch {}
      }
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

  _runSimulation(run) {
    const dag = run.input.payload?.dag || run.input.objective;
    this._emit(run, "task.log", { message: `DAG accepted: ${typeof dag === "string" ? dag : "(in-payload)"}` });
    this._emit(run, "task.log", { message: "Dispatching 3 simulated worker streams across the fleet." });
    this._emit(run, "handoff.started", { worker: "w-1", role: "pi", capability: "web", real: false });
    this._emit(run, "handoff.started", { worker: "w-2", role: "pi", capability: "ipad", real: false });
    this._emit(run, "handoff.started", { worker: "w-3", role: "pi", capability: "visionos", real: false });
    this._emit(run, "handoff.completed", { worker: "w-1", real: false });
    this._emit(run, "handoff.completed", { worker: "w-2", real: false });
    this._emit(run, "handoff.completed", { worker: "w-3", real: false });
  }

  async _runReal(run) {
    if (!(await this._health())) throw new Error("OpenSwarm desktop backend is offline on 127.0.0.1:8324");
    const models = await this._request("/api/agents/models");
    const model = models?.models?.minimax?.[0]?.value || "custom/minimax/MiniMax-M2.7-highspeed";
    const started = Date.now();
    const launch = await this._request("/api/agents/launch", {
      method: "POST",
      body: JSON.stringify({
        name: `Patrick OS scheduler · ${run.input.taskId}`,
        provider: "custom",
        model,
        mode: "agent",
        system_prompt: [
          "You are the OpenSwarm scheduling stage inside Patrick OS.",
          "Do not edit files or use tools. Return a concise three-worker DAG as plain text.",
          "Workers must be named web, ipad, and vision. State dependencies and acceptance evidence.",
        ].join("\n"),
        allowed_tools: [],
        max_turns: 1,
        target_directory: run.input.workspace?.root || null,
      }),
    });
    run.sessionId = launch.session_id;
    this._emit(run, "swarm.session", {
      real: true,
      sessionId: run.sessionId,
      model,
      status: "launched",
    });
    await this._request(`/api/agents/sessions/${run.sessionId}/message`, {
      method: "POST",
      body: JSON.stringify({ prompt: `Schedule this long mission into three parallel Pi workstreams:\n${run.input.objective}` }),
    });

    let session = null;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await delay(1000);
      session = await this._request(`/api/agents/sessions/${run.sessionId}`);
      const assistant = (session.messages || []).findLast?.((message) => message.role === "assistant")
        || [...(session.messages || [])].reverse().find((message) => message.role === "assistant");
      if (assistant) {
        const response = String(assistant.content || "").trim();
        this._emit(run, "agent.response", {
          provider: "openswarm-local-api",
          real: true,
          sessionId: run.sessionId,
          model,
          durationMs: Date.now() - started,
          summary: response.slice(0, 6000),
        });
        for (const capability of ["web", "ipad", "visionos"]) {
          this._emit(run, "handoff.started", { worker: capability, role: "pi", capability, real: true, sessionId: run.sessionId });
        }
        return;
      }
      if (["error", "stopped"].includes(session.status)) {
        const system = [...(session.messages || [])].reverse().find((message) => message.role === "system");
        throw new Error(String(system?.content || `OpenSwarm session ${session.status}`));
      }
    }
    throw new Error("OpenSwarm scheduler timed out after 90 seconds");
  }

  async _health() {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/health/check`, { signal: AbortSignal.timeout(1500) });
      if (!response.ok) return false;
      const token = await fs.readFile(this.tokenPath, "utf8");
      return token.trim().length >= 16;
    } catch {
      return false;
    }
  }

  async _request(endpoint, options = {}) {
    const token = (await fs.readFile(this.tokenPath, "utf8")).trim();
    if (!token) throw new Error("OpenSwarm local auth token is unavailable");
    const response = await this.fetchImpl(`${this.baseUrl}${endpoint}`, {
      ...options,
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`OpenSwarm API ${response.status}: ${text.slice(0, 500)}`);
    try { return JSON.parse(text); } catch { return { text }; }
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
