// Mission Orchestrator — the single owner of mission state.
// State machine, routing, policy checks, adapter dispatch, approval flow,
// acceptance, and completion. NO ADAPTER may mark a mission complete.

import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { EventStore } from "../store/event-store.js";
import { ArtifactStore } from "../store/artifact-store.js";
import { ApprovalEngine } from "./approval-engine.js";
import { validatePolicy } from "./policy-engine.js";
import { pickAdapter, approvalRequired } from "../domain/routing.js";
import { canTransition, isTerminal } from "../domain/mission-fsm.js";
import { OpenAIAdapter } from "../adapters/openai.js";
import { HermesAdapter } from "../adapters/hermes.js";
import { OpenSwarmAdapter } from "../adapters/open-swarm.js";
import { PiAdapter } from "../adapters/pi.js";
import { inspectWebsiteFromCommand } from "./web-inspector.js";
import { ProviderSettings } from "../providers/provider-settings.js";

export class Orchestrator {
  /**
   * @param {Object} opts
   * @param {string} opts.dataDir
   * @param {string} opts.workspaceRoot
   */
  constructor(opts) {
    this.dataDir = opts.dataDir;
    this.workspaceRoot = opts.workspaceRoot;
    this.eventStore = new EventStore(this.dataDir, "global");
    this.artifactStore = new ArtifactStore(path.join(this.dataDir, "artifacts"));
    this.approvals = new ApprovalEngine(this.eventStore);
    this.providerSettings = opts.providerSettings || new ProviderSettings(this.dataDir);

    this.adapters = {
      openai: new OpenAIAdapter({ providerSettings: this.providerSettings }),
      hermes: new HermesAdapter(),
      "open-swarm": new OpenSwarmAdapter(),
      pi: new PiAdapter({
        workspaceRoot: this.workspaceRoot,
        artifactStore: this.artifactStore,
        providerSettings: this.providerSettings,
      }),
    };

    this.missions = new Map(); // id -> mission record
    this.runs = new Map(); // runId -> { missionId, taskId, adapterId, events buffer }
    this.controls = new Map(); // missionId -> pause/cancel coordination
    this.commandQueue = Promise.resolve(); // serialize user refinements for a readable trace

    // Replay from disk so a refresh / restart doesn't lose state.
    this._ready = this._loadFromDisk();
  }

  async ready() {
    await Promise.all([this._ready, this.providerSettings.ready()]);
  }

  /**
   * Wipe in-memory + on-disk state. Use for dev-mode clean slate.
   */
  async resetEventStore() {
    await this.eventStore._ready;
    this.eventStore.events = [];
    this.eventStore.subscribers.clear();
    const { unlink } = await import("node:fs/promises");
    try {
      await unlink(this.eventStore.filePath);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    // Wipe the mission record so runMission() can re-walk the FSM cleanly.
    for (const m of this.missions.values()) {
      m.status = "draft";
      m.startedAt = null;
      m.completedAt = null;
      m.updatedAt = new Date().toISOString();
    }
  }

  async _loadFromDisk() {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(this.workspaceRoot, { recursive: true });
    await this.artifactStore.ensureReady();
    await this.eventStore.ready();
  }

  registerMission(missionRecord) {
    this.missions.set(missionRecord.id, missionRecord);
    if (!this.controls.has(missionRecord.id)) {
      this.controls.set(missionRecord.id, { paused: false, cancelled: false, waiters: [] });
    }
  }

  getMission(id) {
    return this.missions.get(id) || null;
  }

  listMissions() {
    return [...this.missions.values()];
  }

  async emitGlobal(evt) {
    return this.eventStore.append(evt);
  }

  async pauseMission(id) {
    const mission = this.getMission(id);
    if (!mission) throw new Error(`mission ${id} not found`);
    const control = this.controls.get(id);
    control.paused = true;
    if (mission.status === "running") {
      await this._transition(mission, "blocked", { blockedReason: "user paused" });
    }
    await this.eventStore.append({
      missionId: id,
      type: "task.blocked",
      source: "user",
      severity: "warning",
      payload: { reason: "Mission paused by Patrick", resumable: true },
    });
    return mission;
  }

  async resumeMission(id) {
    const mission = this.getMission(id);
    if (!mission) throw new Error(`mission ${id} not found`);
    const control = this.controls.get(id);
    control.paused = false;
    if (mission.status === "blocked") {
      await this._transition(mission, "running", { blockedReason: null });
    }
    for (const resolve of control.waiters.splice(0)) resolve();
    await this.eventStore.append({
      missionId: id,
      type: "task.progress",
      source: "user",
      severity: "info",
      payload: { message: "Mission resumed", progress: null },
    });
    return mission;
  }

  async cancelMission(id) {
    const mission = this.getMission(id);
    if (!mission) throw new Error(`mission ${id} not found`);
    const control = this.controls.get(id);
    control.cancelled = true;
    control.paused = false;
    for (const resolve of control.waiters.splice(0)) resolve();
    if (!isTerminal(mission.status) && canTransition(mission.status, "cancelled")) {
      await this._transition(mission, "cancelled", { reason: "user cancelled" });
    }
    await this.eventStore.append({
      missionId: id,
      type: "mission.cancelled",
      source: "user",
      severity: "warning",
      payload: { reason: "user cancelled" },
    });
    return mission;
  }

  async _waitForControl(mission) {
    const control = this.controls.get(mission.id);
    if (!control) return;
    if (control.cancelled) throw new Error("mission cancelled");
    if (control.paused) {
      await new Promise((resolve) => control.waiters.push(resolve));
      if (control.cancelled) throw new Error("mission cancelled");
    }
  }

  /**
   * Drive a mission through its life. The orchestrator walks the planned
   * task DAG dependency-by-dependency and runs each task through its
   * routed adapter, collecting events into the Event Store.
   * @param {string} missionId
   */
  async runMission(missionId) {
    const mission = this.missions.get(missionId);
    if (!mission) throw new Error(`mission ${missionId} not found`);

    // Mission FSM: draft -> planning -> queued -> running -> reviewing -> completed.
    // Ensure the mission is in `running` before proceeding, regardless of
    // whether we just reset it (smoke tests) or picked up mid-mission.
    if (mission.status === "draft") {
      await this._transition(mission, "planning", { at: new Date().toISOString() });
    }
    if (mission.status === "planning") {
      await this._transition(mission, "queued", { at: new Date().toISOString() });
    }
    if (mission.status === "queued") {
      await this._transition(mission, "running", { at: new Date().toISOString() });
    }
    if (mission.status === "blocked") {
      await this._transition(mission, "running", { at: new Date().toISOString() });
    }
    if (!["running", "reviewing"].includes(mission.status)) {
      throw new Error(`cannot runMission from state ${mission.status}`);
    }
    await this.eventStore.append({
      missionId,
      type: "mission.created",
      source: "patrick",
      severity: "info",
      payload: { title: mission.title, objective: mission.objective },
    });

    await this._waitForControl(mission);

    // Phase 1: Planning via OpenAI.
    await this._runTask(mission, {
      id: "task-plan",
      title: "Create structured plan and review rubric",
      role: "openai",
      dependencies: [],
      objective: `plan: ${mission.objective}`,
      acceptanceChecks: mission.acceptanceCriteria.map((c) => c.statement),
    });

    // Checkpoint: Plan
    await this.eventStore.append({
      missionId,
      type: "checkpoint.created",
      source: "patrick",
      severity: "info",
      payload: { name: "Plan", sequence: 1 },
    });

    await this._waitForControl(mission);

    // Phase 2: Hermes context discovery.
    await this._runTask(mission, {
      id: "task-context",
      title: "Discover project, assets, tools, and approved paths",
      role: "hermes",
      dependencies: ["task-plan"],
      objective: "discover workspace context",
      acceptanceChecks: ["workspace manifest returned"],
    });

    // Checkpoint: Context
    await this.eventStore.append({
      missionId,
      type: "checkpoint.created",
      source: "patrick",
      severity: "info",
      payload: { name: "Context", sequence: 2 },
    });

    await this._waitForControl(mission);

    // Phase 3: Open Swarm DAG dispatch.
    await this._runTask(mission, {
      id: "task-schedule",
      title: "Create and schedule platform DAG",
      role: "open-swarm",
      dependencies: ["task-context"],
      objective: "schedule DAG across Web, iPad, visionOS",
      acceptanceChecks: ["3 worker streams assigned"],
    });

    // Checkpoint: Parallel build
    await this.eventStore.append({
      missionId,
      type: "checkpoint.created",
      source: "patrick",
      severity: "info",
      payload: { name: "Parallel Build", sequence: 3 },
    });

    // Phase 4: Three real Pi workers (the actual vertical slice), dispatched
    // in parallel after Open Swarm has established the task DAG.
    const platformMap = {
      "task-web": ["ac-web", "ac-sources"],
      "task-ipad": ["ac-ipad", "ac-sources"],
      "task-vision": ["ac-vision", "ac-sources"],
    };
    const allChecks = (ids) =>
      mission.acceptanceCriteria.filter((c) => ids.includes(c.id)).map((c) => c.statement);
    const sharedChecks = allChecks(["ac-tests", "ac-bilingual"]);
    const targets = [
      { id: "task-web", title: "Build and test Web lesson", platform: "web" },
      { id: "task-ipad", title: "Build and test iPad lesson", platform: "ipad" },
      { id: "task-vision", title: "Build and test visionOS lesson", platform: "visionos" },
    ];
    await Promise.all(
      targets.map((target) =>
        this._runTask(mission, {
          ...target,
          role: "pi",
          dependencies: ["task-schedule"],
          objective: `build & test lesson on ${target.platform}`,
          acceptanceChecks: [...sharedChecks, ...allChecks(platformMap[target.id] || [])],
        })
      )
    );

    // Checkpoint: Integration
    await this.eventStore.append({
      missionId,
      type: "checkpoint.created",
      source: "patrick",
      severity: "info",
      payload: { name: "Integration", sequence: 4 },
    });

    // Phase 5: Hermes integrates artifacts.
    await this._runTask(mission, {
      id: "task-integrate",
      title: "Integrate platform artifacts and translation evidence",
      role: "hermes",
      dependencies: ["task-web", "task-ipad", "task-vision"],
      objective: "integrate artifacts across platforms",
      acceptanceChecks: ["all 3 platforms integrated"],
    });

    await this._waitForControl(mission);

    // Phase 6: Translation-meaning conflict. Meaning-changing content is a
    // hard human gate: the review phase cannot start until the user resolves
    // the ambiguity in the decision panel.
    await this._requestTranslationDecision(mission);

    // Phase 7: Final review via OpenAI.
    await this._transition(mission, "reviewing", { at: new Date().toISOString() });
    await this._runTask(mission, {
      id: "task-review",
      title: "Review artifacts against all hard acceptance gates",
      role: "openai",
      dependencies: ["task-integrate"],
      objective: `review: ${mission.title}`,
      acceptanceChecks: mission.acceptanceCriteria.map((c) => c.statement),
    });

    // Checkpoint: Review
    await this.eventStore.append({
      missionId,
      type: "checkpoint.created",
      source: "patrick",
      severity: "info",
      payload: { name: "Review", sequence: 5 },
    });

    // Acceptance — hard gate. Mission only completes if every required check is satisfied.
    const allPassed = await this._evaluateAcceptance(mission);
    if (!allPassed) {
      await this._transition(mission, "failed", {
        at: new Date().toISOString(),
        reason: "required acceptance checks did not pass",
      });
      await this.eventStore.append({
        missionId,
        type: "mission.cancelled",
        source: "patrick",
        severity: "error",
        payload: { reason: "acceptance.failed" },
      });
      return;
    }

    await this._transition(mission, "completed", {
      at: new Date().toISOString(),
    });
    await this.eventStore.append({
      missionId,
      type: "mission.completed",
      source: "patrick",
      severity: "info",
      payload: { acceptedAt: new Date().toISOString() },
    });
  }

  async enqueueCommand(missionId, text) {
    const mission = this.getMission(missionId);
    if (!mission) throw new Error(`mission ${missionId} not found`);
    const commandId = `command-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    await this.eventStore.append({
      missionId,
      taskId: commandId,
      type: "command.received",
      source: "user",
      severity: "info",
      payload: { commandId, text, kind: "user.refine" },
    });

    const execute = () => this._processCommand(mission, text, commandId);
    this.commandQueue = this.commandQueue.then(execute, execute).catch(async (error) => {
      await this.eventStore.append({
        missionId,
        taskId: commandId,
        type: "command.failed",
        source: "patrick",
        severity: "error",
        payload: { commandId, text, error: error.message },
      });
    });

    return { accepted: true, commandId, command: text };
  }

  async _processCommand(mission, text, commandId) {
    const longMode = isLongTaskCommand(text);
    await this.eventStore.append({
      missionId: mission.id,
      taskId: commandId,
      type: "command.started",
      source: "patrick",
      severity: "info",
      payload: {
        commandId,
        text,
        executionMode: longMode ? "long" : "standard",
        route: longMode
          ? ["openai", "hermes", "open-swarm", "pi:web|pi:ipad|pi:vision", "hermes", "openai"]
          : ["openai", "hermes", "open-swarm", "pi", "openai"],
      },
    });

    const tasks = [
      {
        id: `${commandId}-plan`,
        title: "Plan user refinement",
        role: "openai",
        dependencies: [],
        objective: `plan refinement: ${text}`,
        acceptanceChecks: [],
        executionMode: longMode ? "long" : "standard",
      },
      {
        id: `${commandId}-context`,
        title: "Discover local context for refinement",
        role: "hermes",
        dependencies: [`${commandId}-plan`],
        objective: `find approved local context for: ${text}`,
        acceptanceChecks: [],
        executionMode: longMode ? "long" : "standard",
      },
      {
        id: `${commandId}-schedule`,
        title: "Schedule refinement DAG",
        role: "open-swarm",
        dependencies: [`${commandId}-context`],
        objective: `coordinate refinement work: ${text}`,
        acceptanceChecks: [],
        executionMode: longMode ? "long" : "standard",
      },
      {
        id: `${commandId}-execute`,
        title: "Implement and test refinement",
        role: "pi",
        dependencies: [`${commandId}-schedule`],
        objective: `execute refinement in isolated workspace: ${text}`,
        acceptanceChecks: [],
        executionMode: longMode ? "long" : "standard",
      },
      {
        id: `${commandId}-review`,
        title: "Review refinement evidence",
        role: "openai",
        dependencies: [`${commandId}-execute`],
        objective: `review completed refinement against user intent: ${text}`,
        acceptanceChecks: [],
        executionMode: longMode ? "long" : "standard",
      },
    ];

    if (longMode) {
      for (const task of tasks.slice(0, 3)) await this._runTask(mission, task);
      const parallelTasks = [
        {
          id: `${commandId}-pi-web`, title: "Pi Web research worker", role: "pi", workerLabel: "web",
          dependencies: [`${commandId}-schedule`],
          objective: `Research requirements, architecture, and user-facing Web deliverables for: ${text}`,
          acceptanceChecks: [], executionMode: "long",
        },
        {
          id: `${commandId}-pi-ipad`, title: "Pi implementation worker", role: "pi", workerLabel: "ipad",
          dependencies: [`${commandId}-schedule`],
          objective: `Design the implementation plan, interfaces, and concrete file-level changes for: ${text}`,
          acceptanceChecks: [], executionMode: "long",
        },
        {
          id: `${commandId}-pi-vision`, title: "Pi QA and risk worker", role: "pi", workerLabel: "vision",
          dependencies: [`${commandId}-schedule`],
          objective: `Create acceptance checks, failure cases, security review, and verification evidence for: ${text}`,
          acceptanceChecks: [], executionMode: "long",
        },
      ];
      await this.eventStore.append({
        missionId: mission.id, taskId: commandId, type: "parallel.started", source: "patrick", severity: "info",
        payload: { commandId, workers: parallelTasks.map((task) => task.workerLabel), concurrency: 3, real: true },
      });
      const parallelStarted = Date.now();
      await Promise.all(parallelTasks.map((task) => this._runTask(mission, task)));
      await this.eventStore.append({
        missionId: mission.id, taskId: commandId, type: "parallel.completed", source: "patrick", severity: "info",
        payload: { commandId, workers: parallelTasks.map((task) => task.workerLabel), durationMs: Date.now() - parallelStarted, real: true },
      });
      await this._runTask(mission, {
        id: `${commandId}-integrate`, title: "Hermes integrates parallel evidence", role: "hermes",
        dependencies: parallelTasks.map((task) => task.id),
        objective: `integrate the three Pi worker artifacts and identify conflicts for: ${text}`,
        acceptanceChecks: [], executionMode: "long",
      });
      tasks[4].dependencies = [`${commandId}-integrate`];
    } else {
      for (const task of tasks.slice(0, 4)) await this._runTask(mission, task);
    }

    let inspection = null;
    try {
      inspection = await inspectWebsiteFromCommand(text);
      if (inspection) {
        await this.eventStore.append({
          missionId: mission.id,
          taskId: commandId,
          type: "research.completed",
          source: "patrick",
          severity: "info",
          payload: {
            commandId,
            real: true,
            method: "read-only HTTP + HTML inspection",
            ...inspection,
          },
        });
      }
    } catch (error) {
      inspection = { error: error.message };
    }

    const evidenceForReview = inspection && !inspection.error
      ? JSON.stringify({
          method: "real read-only HTTP and HTML inspection",
          status: inspection.status,
          finalUrl: inspection.finalUrl,
          title: inspection.title,
          lang: inspection.lang,
          h1Count: inspection.h1Count,
          linkCount: inspection.linkCount,
          simulatedDemo: inspection.simulatedDemo,
          structuralFindings: inspection.findings,
          structuralRecommendations: inspection.recommendations,
        })
      : inspection?.error ? `Website inspection error: ${inspection.error}` : "No URL inspection was requested.";
    const preReviewEvents = this.eventStore.list().filter((event) =>
      event.taskId === commandId || String(event.taskId || "").startsWith(`${commandId}-`)
    );
    const agentEvidence = preReviewEvents
      .filter((event) => event.type === "agent.response")
      .map((event) => ({
        source: event.source,
        worker: event.payload?.worker,
        real: event.payload?.real,
        summary: event.payload?.summary,
      }))
      .slice(-8);
    const executionFailures = preReviewEvents
      .filter((event) => event.type === "task.failed")
      .map((event) => ({ source: event.source, reason: event.payload?.reason || event.payload?.error }))
      .slice(-8);
    tasks[4].objective = [
      `review completed refinement against user intent: ${text}`,
      `Verified evidence: ${evidenceForReview}`,
      `Real agent evidence: ${JSON.stringify(agentEvidence)}`,
      `Execution failures: ${JSON.stringify(executionFailures)}`,
      "Produce the final user-facing answer. Separate verified evidence from inference.",
    ].join("\n");
    await this._runTask(mission, tasks[4]);

    const commandEvents = this.eventStore.list().filter((event) =>
      event.taskId === commandId || String(event.taskId || "").startsWith(`${commandId}-`)
    );
    const artifacts = commandEvents
      .filter((event) => event.type === "artifact.created")
      .map((event) => ({ name: event.payload.name, uri: event.payload.uri }))
      .filter((artifact) => artifact.name || artifact.uri);
    const modelEvent = [...commandEvents].reverse().find((event) =>
      event.type === "model.response" && event.payload?.provider === "minimax" && event.payload?.structured
    );
    const modelResult = modelEvent?.payload?.structured || null;
    const providerFailure = [...commandEvents].reverse().find((event) =>
      event.type === "task.failed" && event.source === "openai" && event.payload?.provider === "minimax"
    );
    const provider = await this.providerSettings.publicStatus();
    const hermesReal = commandEvents.some((event) =>
      event.type === "agent.response" && event.source === "hermes" && event.payload?.real
    );
    const swarmReal = commandEvents.some((event) =>
      event.type === "agent.response" && event.source === "open-swarm" && event.payload?.real
    );
    const piRealWorkers = new Set(commandEvents
      .filter((event) => event.type === "task.completed" && event.source === "pi" && event.payload?.runtime === "pi-cli")
      .map((event) => event.payload?.worker)
      .filter(Boolean));
    const parallelEvent = commandEvents.find((event) => event.type === "parallel.completed");
    const executionProof = longMode ? {
      executionMode: "long",
      hermes: hermesReal ? "real CLI" : "failed or unavailable",
      openSwarm: swarmReal ? "real local API" : "failed or unavailable",
      piWorkers: `${piRealWorkers.size}/3 real CLI`,
      parallelMs: parallelEvent?.payload?.durationMs ?? "not completed",
    } : {};
    const result = modelResult
      ? {
          commandId,
          kind: inspection && !inspection.error ? "ai-website-review" : "ai-response",
          headline: modelResult.headline,
          summary: modelResult.summary,
          findings: modelResult.findings,
          recommendations: modelResult.recommendations,
          evidence: inspection && !inspection.error ? {
            status: inspection.status,
            finalUrl: inspection.finalUrl,
            title: inspection.title,
            lang: inspection.lang,
            h1Count: inspection.h1Count,
            linkCount: inspection.linkCount,
            provider: "MiniMax",
            model: modelEvent.payload.model,
            ...executionProof,
          } : {
            provider: "MiniMax",
            model: modelEvent.payload.model,
            artifactCount: artifacts.length,
            ...executionProof,
          },
          artifacts,
          limitation: longMode
            ? `长任务证据：MiniMax 真实；Hermes ${hermesReal ? "真实 CLI" : "失败"}；OpenSwarm ${swarmReal ? "真实本地 API" : "失败"}；Pi ${piRealWorkers.size}/3 个真实 CLI worker。失败项保留在执行轨迹。`
            : "MiniMax 已真实完成规划与最终复核；网站证据来自只读检查。普通指令仍使用 Hermes/OpenSwarm 快速模拟层，Pi 为真实本地执行。",
        }
      : providerFailure
      ? {
          commandId,
          kind: "provider-error",
          headline: "MiniMax 调用失败",
          summary: providerFailure.payload.reason || "MiniMax 没有返回可用响应。",
          findings: [
            "本次没有生成 MiniMax 模型答案，以下状态不是智能结论。",
            "Hermes 与 Open Swarm 仍为模拟适配器；Pi 的本地产物不代表模型已经回答用户问题。",
          ],
          recommendations: [
            "回到 Settings 重新输入 API Key，并确认状态显示 CONNECTED · REAL 后再发送指令。",
          ],
          evidence: {
            provider: "MiniMax",
            model: provider.model,
            connection: "failed",
            artifactCount: artifacts.length,
          },
          artifacts,
          limitation: "错误已直接显示；Patrick OS 不再用固定执行摘要伪装成模型回答。",
        }
      : inspection && !inspection.error
      ? {
          commandId,
          kind: "website-inspection",
          headline: `${new URL(inspection.finalUrl).hostname} · 真实网站反馈`,
          summary: inspection.summary,
          findings: inspection.findings,
          recommendations: inspection.recommendations,
          evidence: {
            status: inspection.status,
            finalUrl: inspection.finalUrl,
            title: inspection.title,
            lang: inspection.lang,
            h1Count: inspection.h1Count,
            linkCount: inspection.linkCount,
          },
          artifacts,
          limitation: provider.configured
            ? "网站结构检查是真实的；MiniMax 本次没有返回可解析的最终结果，请在执行轨迹查看 provider error。"
            : "本次反馈来自真实网络与 HTML 结构检查；MiniMax 尚未配置，ChatGPT、Hermes、Open Swarm 仍为模拟适配器。",
        }
      : {
          commandId,
          kind: "execution-summary",
          headline: "任务已执行，但需要区分执行证据与智能结论",
          summary: inspection?.error
            ? `检测到网址，但真实检查失败：${inspection.error}`
            : provider.configured
              ? "五段执行链已完成，但 MiniMax 本次未返回可解析的最终答案。"
              : "五段执行链已完成，并保留了可追溯产物；MiniMax 尚未配置，模拟适配器不会生成模型级语义回答。",
          findings: [
            provider.configured ? "MiniMax 请求已派发；详细状态记录在执行轨迹。" : "规划与复核当前使用模拟适配器。",
            "Hermes 已写入工作记忆，Open Swarm 已记录调度过程。",
            `Pi 在隔离工作区真实执行并生成 ${artifacts.length} 个产物。`,
          ],
          recommendations: [provider.configured
            ? "检查 MiniMax 连接状态或模型返回格式后重试；Result 卡会自动承接成功输出。"
            : "在 Settings 中配置 MiniMax API；Result 卡会自动承接真实模型输出。"],
          evidence: { artifactCount: artifacts.length },
          artifacts,
          limitation: provider.configured
            ? "Pi 为真实本地执行器；MiniMax 已配置但本次未生成结构化结果；Hermes 与 Open Swarm 仍为模拟实现。"
            : "当前只有 Pi 是真实执行器；其余三个适配器为明确标注的模拟实现。",
        };

    await this.eventStore.append({
      missionId: mission.id,
      taskId: commandId,
      type: "command.result",
      source: "patrick",
      severity: "info",
      payload: result,
    });

    await this.eventStore.append({
      missionId: mission.id,
      taskId: commandId,
      type: "memory.updated",
      source: "hermes",
      severity: "info",
      payload: {
        commandId,
        kind: "working-memory",
        summary: text,
        evidence: "append-only mission trace",
      },
    });
    await this.eventStore.append({
      missionId: mission.id,
      taskId: commandId,
      type: "command.completed",
      source: "patrick",
      severity: "info",
      payload: {
        commandId,
        text,
        summary: result.summary,
      },
    });
  }

  async _runTask(mission, task) {
    await this._waitForControl(mission);
    const { adapterId, risk } = pickAdapter(task);
    const adapter = this.adapters[adapterId];
    if (!adapter) throw new Error(`no adapter registered for ${adapterId}`);

    const traceId = crypto.randomUUID();
    const idempotencyKey = `${mission.id}::${task.id}::${task.dependencies.join(",")}`;
    const isLongExecution = task.executionMode === "long";
    const taskTimeoutMs = isLongExecution ? 180_000 : 30_000;
    const settleTimeoutMs = isLongExecution ? 200_000 : 60_000;

    await this.eventStore.append({
      missionId: mission.id,
      taskId: task.id,
      traceId,
      type: "task.queued",
      source: "patrick",
      severity: "info",
      payload: { task: task.title, adapter: adapterId, risk },
    });

    // Policy gate. Workspace root is the project's own workspace/ subdir.
    // We deny /etc /System /var (system dirs) but allow /Users/<me>/<project>/workspace/.
    const workspace = {
      root: path.join(this.workspaceRoot, mission.id),
      allowedPaths: [
        `${mission.id}/`,
        path.join(this.workspaceRoot, mission.id) + path.sep,
      ],
      deniedPaths: ["/etc", "/System", "/private/etc", "/private/var/db", "/var/root", "/var/log"],
      availableTools: ["node"],
      allowedCommands: ["node --test", "node --check"],
      networkDestinations: ["localhost", "127.0.0.1"],
      memoryReferences: [],
      dataClassification: "internal",
    };
    const policy = {
      approvalProfile: "local-development-with-publish-approval",
      maxCostUsd: 5.0,
      maxConcurrency: 4,
      allowNetwork: false,
      allowWrites: true,
      allowExternalSideEffects: false,
    };
    try {
      validatePolicy(workspace, policy, {
        ...task,
        writesInside: workspace.root,
        touchedPaths: [workspace.root],
        timeoutMs: taskTimeoutMs,
        networkCall: null,
      });
    } catch (err) {
      await this.eventStore.append({
        missionId: mission.id,
        taskId: task.id,
        type: "task.blocked",
        severity: "error",
        source: "patrick",
        payload: { reason: err.message, violations: err.violations || [] },
      });
      throw err;
    }

    // High-risk approval gate.
    if (approvalRequired(risk, policy)) {
      await this.approvals.request({
        missionId: mission.id,
        action: task.role,
        reason: `task "${task.title}" is risk=${risk}`,
        command: "adapter.startTask",
        destination: adapterId,
        dataShared: `task objective (${task.objective})`,
        affectedPaths: [workspace.root],
        risk,
        rollback: "adapter.cancelTask",
        scope: "current-mission",
      });
    }

    const adapterInput = {
      missionId: mission.id,
      taskId: task.id,
      traceId,
      idempotencyKey,
      objective: task.objective,
      acceptanceChecks: task.acceptanceChecks || [],
      dependencies: task.dependencies || [],
      inputArtifacts: [],
      workspace,
      policy,
      timeoutMs: taskTimeoutMs,
      attempt: 1,
      executionMode: task.executionMode || "standard",
      workerLabel: task.workerLabel || null,
    };

    await this.eventStore.append({
      missionId: mission.id,
      taskId: task.id,
      traceId,
      type: "adapter.dispatched",
      source: "patrick",
      severity: "info",
      payload: {
        adapter: adapterId,
        risk,
        executionMode: task.executionMode || "standard",
        worker: task.workerLabel || null,
      },
    });

    const run = await adapter.startTask(adapterInput);

    // Drain events from the adapter into the Event Store until the run
    // settles. The adapter marks itself done by setting `status = "queued"`.
    const settled = new Promise((resolve) => {
      let lastSeen = -1;
      let timeoutId;
      const interval = setInterval(async () => {
        const events = [];
        for await (const evt of adapter.streamEvents(run.runId, lastSeen + 1)) {
          events.push(evt);
          lastSeen = evt.sequence;
          // Mirror to the orchestrator's Event Store.
          await this.eventStore.append({
            ...evt,
            missionId: mission.id,
            taskId: task.id,
          });
        }
        const r = this._adapterState(adapter, run.runId);
        if (r && r.status === "queued") {
          clearInterval(interval);
          clearTimeout(timeoutId);
          resolve();
        }
      }, 60);
      // Hard timeout fallback.
      timeoutId = setTimeout(() => {
        clearInterval(interval);
        resolve();
      }, settleTimeoutMs);
    });
    await settled;

    // Collect artifacts and emit artifact.created events.
    const artifacts = await adapter.collectArtifacts(run.runId);
    for (const art of artifacts) {
      if (art.uri && art.uri !== "(simulated)") {
        // Real artifact already saved by adapter; just emit a marker.
        await this.eventStore.append({
          missionId: mission.id,
          taskId: task.id,
          traceId,
          type: "artifact.created",
          source: adapterId,
          severity: "info",
          payload: { artifactId: art.id, name: art.name, version: art.version, checksum: art.checksum, uri: art.uri },
        });
      }
    }
  }

  _adapterState(adapter, runId) {
    return adapter._runs?.get(runId) || null;
  }

  async _transition(mission, to, extra = {}) {
    if (!canTransition(mission.status, to)) {
      throw new Error(`illegal transition ${mission.status} -> ${to}`);
    }
    mission.status = to;
    mission.updatedAt = new Date().toISOString();
    if (to === "running" && !mission.startedAt) mission.startedAt = mission.updatedAt;
    if (isTerminal(to)) mission.completedAt = mission.updatedAt;
    Object.assign(mission, extra);
  }

  async _requestTranslationDecision(mission) {
      await this._transition(mission, "blocked", {
        blockedReason: "Human translation decision required",
      });
      const pending = await this.approvals.request({
        missionId: mission.id,
        action: "Resolve meaning-changing translations",
        reason: "Two translations may change lesson meaning.",
        command: "decision.compare|accept-safer-wording|ask-agent",
        destination: "ui.decision-panel",
        dataShared: "translation diff (en/zh) for ambiguous lesson phrases",
        affectedPaths: ["workspace/*/lesson.json"],
        risk: "high",
        rollback: "rewind.to last approved checkpoint",
        scope: "current-mission",
      });
      const resolved = await this.approvals.waitForDecision(pending.id);
      if (resolved.status !== "approved") {
        await this._transition(mission, "failed", {
          blockedReason: null,
          failureReason: "Translation decision was rejected",
        });
        throw new Error("translation decision rejected");
      }
      await this._transition(mission, "running", { blockedReason: null });
  }

  async _evaluateAcceptance(mission) {
    // A real orchestrator inspects each acceptance.passed / acceptance.failed
    // event and gates on every `required` criterion. Here we rely on the
    // Event Store: every required check must have a matching acceptance.passed.
    const allEvents = this.eventStore.list();
    const passed = new Set(
      allEvents
        .filter((e) => e.type === "acceptance.passed" && e.missionId === mission.id)
        .map((e) => e.payload.statement)
    );
    const failed = new Set(
      allEvents
        .filter((e) => e.type === "acceptance.failed" && e.missionId === mission.id)
        .map((e) => e.payload.statement)
    );
    for (const ac of mission.acceptanceCriteria) {
      if (!ac.required) continue;
      if (failed.has(ac.statement)) return false;
      if (!passed.has(ac.statement)) return false;
    }
    return true;
  }
}

function isLongTaskCommand(text) {
  const normalized = String(text || "").trim().toLowerCase();
  return normalized.startsWith("长任务")
    || normalized.startsWith("/long")
    || normalized.startsWith("long mission");
}
