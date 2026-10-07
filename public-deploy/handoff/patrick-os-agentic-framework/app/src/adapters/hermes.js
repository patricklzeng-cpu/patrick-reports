// Hermes adapter — hybrid. Standard/demo tasks keep the deterministic
// projection; explicit long missions invoke the installed Hermes CLI.
// Hermes is the local steward, not another orchestrator. It discovers
// approved project paths, environment capabilities, and integrates
// artifacts. Real Hermes (Desktop) would call into the local API via
// MCP / RPC / CLI; here we generate a synthetic WorkspaceManifest.

import { AgentAdapter } from "../domain/adapter-contract.js";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const SIMULATION_NOTICE =
  "Hermes adapter is simulated in this build. " +
  "Real implementation would call Hermes desktop over MCP / RPC " +
  "and produce a live WorkspaceManifest. " +
  "Here we synthesize a deterministic manifest from the missionId.";

export class HermesAdapter extends AgentAdapter {
  constructor(options = {}) {
    super();
    this.id = "hermes";
    this.cliPath = options.cliPath || "/Users/zl/.local/bin/hermes";
    this.displayName = "Hermes (real CLI for long missions)";
    this._runs = new Map();
  }

  async probe() {
    const ready = await executableExists(this.cliPath);
    return {
      adapterId: this.id,
      status: ready ? "healthy" : "degraded",
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      version: ready ? "real-cli-ready-1.0.0" : "sim-1.0.0",
      capabilities: ["workspace-discovery", "context-assembly", "artifact-integration"],
      message: ready
        ? `Hermes CLI is available at ${this.cliPath}; explicit long missions use a real one-shot agent run.`
        : SIMULATION_NOTICE,
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

    setImmediate(async () => {
      this._emit(run, "task.started", { runId });
      try {
        if (input.executionMode === "long") {
          await this._runReal(run);
        } else if (/discover|context|workspace/i.test(input.objective)) {
          this._discover(run);
        } else if (/integrat/i.test(input.objective)) {
          this._integrate(run);
        } else {
          this._emit(run, "task.log", { message: `Hermes mock handling: ${input.objective}` });
        }
        this._emit(run, "task.completed", {
          runId,
          provider: input.executionMode === "long" ? "hermes-cli" : "simulation",
        });
      } catch (error) {
        this._emit(run, "task.failed", {
          runId,
          provider: "hermes-cli",
          reason: String(error.message || "Hermes CLI failed").slice(0, 600),
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

  async _runReal(run) {
    if (!(await executableExists(this.cliPath))) throw new Error(`Hermes CLI not found at ${this.cliPath}`);
    const cwd = run.input.workspace?.root || process.cwd();
    await fs.mkdir(cwd, { recursive: true });
    const started = Date.now();
    this._emit(run, "task.log", { message: `Hermes CLI started in ${cwd}`, real: true });
    const prompt = [
      "You are the Hermes local-context stage inside Patrick OS.",
      "This is an evidence-only, read-only task. Do not modify files, run destructive commands, or contact people.",
      "Inspect only the approved current workspace when useful.",
      "Return a concise context report with: relevant paths, constraints, risks, and recommended handoff to workers.",
      `Task: ${run.input.objective}`,
    ].join("\n");
    const result = await runProcess(this.cliPath, ["--safe-mode", "--oneshot", prompt], {
      cwd,
      timeoutMs: 120_000,
    });
    if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `Hermes exited ${result.exitCode}`);
    const response = result.stdout.trim();
    if (!response) throw new Error("Hermes returned an empty response");
    run.realResponse = response;
    this._emit(run, "agent.response", {
      provider: "hermes-cli",
      real: true,
      durationMs: Date.now() - started,
      summary: response.slice(0, 6000),
    });
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

async function executableExists(filePath) {
  try {
    await fs.access(filePath, fs.constants?.X_OK);
    return true;
  } catch {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

function runProcess(command, args, { cwd, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: path.resolve(cwd),
      env: { ...process.env },
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => resolve({ exitCode: 1, stdout, stderr: `${stderr}\n${error.message}` }));
    child.on("close", (exitCode) => resolve({ exitCode: exitCode ?? 1, stdout, stderr }));
  });
}
