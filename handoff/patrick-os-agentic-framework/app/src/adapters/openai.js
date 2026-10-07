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
  constructor(options = {}) {
    super();
    this.id = "openai";
    this.displayName = "OpenAI / ChatGPT (simulated)";
    this.providerSettings = options.providerSettings || null;
    this._runs = new Map();
  }

  async probe() {
    const provider = this.providerSettings ? await this.providerSettings.publicStatus() : null;
    const real = Boolean(provider?.configured);
    this.displayName = real ? `MiniMax ${provider.model} (real)` : "OpenAI / ChatGPT (simulated)";
    return {
      adapterId: this.id,
      status: "healthy",
      checkedAt: new Date().toISOString(),
      latencyMs: provider?.lastTest?.latencyMs || 0,
      version: real ? "real-minimax-1.0.0" : "sim-1.0.0",
      capabilities: ["planning", "review", "synthesis", "judgment"],
      message: real
        ? `MiniMax is configured through ${provider.credentialSource}; model ${provider.model}.`
        : SIMULATION_NOTICE,
      provider: real ? "minimax" : "simulation",
      model: real ? provider.model : null,
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
    const provider = this.providerSettings ? await this.providerSettings.publicStatus() : null;
    run.realProvider = Boolean(provider?.configured);

    // Schedule completion on next tick so caller can subscribe to events first.
    setImmediate(async () => {
      this._emit(run, "task.started", { runId, taskId: input.taskId });
      try {
        if (run.realProvider) {
          await this._runMiniMax(run);
        } else if (/plan/i.test(input.objective)) {
          this._plan(run);
        } else if (/review/i.test(input.objective)) {
          this._review(run);
        } else if (/synthesis|conflict/i.test(input.objective)) {
          this._synthesize(run);
        } else {
          this._default(run);
        }
        this._emit(run, "task.completed", {
          runId,
          taskId: input.taskId,
          provider: run.realProvider ? "minimax" : "simulation",
          model: run.providerResponse?.model || null,
        });
      } catch (error) {
        this._emit(run, "task.failed", {
          runId,
          taskId: input.taskId,
          provider: "minimax",
          reason: String(error.message || "MiniMax request failed").slice(0, 240),
        }, "error");
      } finally {
        run.status = "queued"; // sentinel: done — projection reads events
      }
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
    const latest = [...this._runs.values()].reverse().find((run) => run.providerResponse?.usage);
    if (!latest) return { inputTokens: 1200, outputTokens: 480, costUsd: 0.0, wallTimeMs: 0 };
    return {
      inputTokens: latest.providerResponse.usage.prompt_tokens || 0,
      outputTokens: latest.providerResponse.usage.completion_tokens || 0,
      costUsd: null,
      wallTimeMs: 0,
    };
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

  async _runMiniMax(run) {
    const response = await this.providerSettings.complete([
      {
        role: "system",
        content: [
          "You are the real reasoning and review layer inside Patrick OS.",
          "Answer in the user's language. Be candid, specific, and evidence-led.",
          "Return only valid JSON with this shape:",
          '{"headline":"...","summary":"...","findings":["..."],"recommendations":["..."]}',
          "Use 3-6 findings and 2-5 recommendations. Never claim that simulated adapters performed real work.",
        ].join("\n"),
      },
      { role: "user", content: run.input.objective },
    ], { maxCompletionTokens: 1800, temperature: 0.35 });
    run.providerResponse = response;
    const structured = parseStructuredResult(response.content);
    run.modelResult = structured;
    this._emit(run, "model.response", {
      provider: "minimax",
      model: response.model,
      responseId: response.id,
      content: response.content,
      structured,
      usage: response.usage,
    });
    if (/plan/i.test(run.input.objective)) {
      this._emit(run, "plan.proposed", {
        provider: "minimax",
        model: response.model,
        planSummary: structured?.summary || response.content,
        findings: structured?.findings || [],
        recommendations: structured?.recommendations || [],
      });
    } else if (/review/i.test(run.input.objective)) {
      this._emit(run, "review.completed", {
        provider: "minimax",
        model: response.model,
        result: structured,
      });
    }
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

function parseStructuredResult(content) {
  const text = String(content || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const candidates = [text];
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(text.slice(objectStart, objectEnd + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || typeof parsed !== "object") continue;
      return {
        headline: String(parsed.headline || "MiniMax analysis"),
        summary: String(parsed.summary || ""),
        findings: Array.isArray(parsed.findings) ? parsed.findings.map(String).slice(0, 8) : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String).slice(0, 8) : [],
      };
    } catch {
      // Some compatible models wrap JSON in commentary. Try the next
      // candidate, then preserve the plain response rather than discarding it.
    }
  }
  const paragraphs = text.split(/\n{2,}|\n[-*]\s+/).map((item) => item.trim()).filter(Boolean);
  return {
    headline: "MiniMax response",
    summary: text.slice(0, 6000),
    findings: paragraphs.slice(0, 6),
    recommendations: [],
  };
}
