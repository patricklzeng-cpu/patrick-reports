// Hermes adapter — SIMULATED.
// Hermes is the local steward, not another orchestrator. It discovers
// approved project paths, environment capabilities, and integrates
// artifacts. Real Hermes (Desktop) would call into the local API via
// MCP / RPC / CLI; here we generate a synthetic WorkspaceManifest.

import { AgentAdapter } from "../domain/adapter-contract.js";
import crypto from "node:crypto";

const SIMULATION_NOTICE =
  "Hermes adapter is simulated in this build. " +
  "Real implementation would call Hermes desktop over MCP / RPC " +
  "and produce a live WorkspaceManifest. " +
  "Here we synthesize a deterministic manifest from the missionId.";

export class HermesAdapter extends AgentAdapter {
  constructor() {
    super();
    this.id = "hermes";
    this.displayName = "Hermes (simulated)";
    this._runs = new Map();
  }

  async probe() {
    return {
      adapterId: this.id,
      status: "healthy",
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      version: "sim-1.0.0",
      capabilities: ["workspace-discovery", "context-assembly", "artifact-integration"],
      message: SIMULATION_NOTICE,
    };
  }

  async capabilities() {
    return [
      {
        id: "hermes.workspace",
        title: "Workspace manifest",
        inputSchemaVersion: "1.0.0",
        outputSchemaVersion: "1.0.0",
        supportsStreaming: false,
        supportsCancellation: false,
        locality: "local",
        risk: "low",
      },
      {
        id: "hermes.integrate",
        title: "Artifact integration",
        inputSchemaVersion: "1.0.0",
        outputSchemaVersion: "1.0.0",
        supportsStreaming: true,
        supportsCancellation: true,
        locality: "local",
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
      if (/discover|context|workspace/i.test(input.objective)) {
        this._discover(run);
      } else if (/integrat/i.test(input.objective)) {
        this._integrate(run);
      } else {
        this._emit(run, "task.log", { message: `Hermes mock handling: ${input.objective}` });
      }
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

  _discover(run) {
    const manifest = {
      root: `${run.input.workspace?.root || "/tmp"}/hermes-manifest-${run.input.missionId}`,
      allowedPaths: ["public/", "src/", "workspace/"],
      deniedPaths: ["/Users", "/etc", "/System"],
      availableTools: ["node", "git", "python3", "curl"],
      allowedCommands: ["npm test", "node --check", "ls", "cat"],
      networkDestinations: ["localhost", "127.0.0.1"],
      memoryReferences: [],
      dataClassification: "internal",
    };
    run.artifacts = [
      {
        id: crypto.randomUUID(),
        name: "workspace-manifest.json",
        uri: "(simulated)",
        checksum: "(simulated)",
        mimeType: "application/json",
        version: 1,
      },
    ];
    this._emit(run, "task.log", {
      message: "Discovered 132 files in workspace.",
      manifest,
    });
  }

  _integrate(run) {
    this._emit(run, "task.log", { message: "Integrating 132 files, 3 platforms." });
  }
}