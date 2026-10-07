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

    this.adapters = {
      openai: new OpenAIAdapter(),
      hermes: new HermesAdapter(),
      "open-swarm": new OpenSwarmAdapter(),
      pi: new PiAdapter({
        workspaceRoot: this.workspaceRoot,
        artifactStore: this.artifactStore,
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
    return this._ready;
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
    await this.eventStore.append({
      missionId: mission.id,
      taskId: commandId,
      type: "command.started",
      source: "patrick",
      severity: "info",
      payload: { commandId, text, route: ["openai", "hermes", "open-swarm", "pi", "openai"] },
    });

    const tasks = [
      {
        id: `${commandId}-plan`,
        title: "Plan user refinement",
        role: "openai",
        dependencies: [],
        objective: `plan refinement: ${text}`,
        acceptanceChecks: [],
      },
      {
        id: `${commandId}-context`,
        title: "Discover local context for refinement",
        role: "hermes",
        dependencies: [`${commandId}-plan`],
        objective: `find approved local context for: ${text}`,
        acceptanceChecks: [],
      },
      {
        id: `${commandId}-schedule`,
        title: "Schedule refinement DAG",
        role: "open-swarm",
        dependencies: [`${commandId}-context`],
        objective: `coordinate refinement work: ${text}`,
        acceptanceChecks: [],
      },
      {
        id: `${commandId}-execute`,
        title: "Implement and test refinement",
        role: "pi",
        dependencies: [`${commandId}-schedule`],
        objective: `execute refinement in isolated workspace: ${text}`,
        acceptanceChecks: [],
      },
      {
        id: `${commandId}-review`,
        title: "Review refinement evidence",
        role: "openai",
        dependencies: [`${commandId}-execute`],
        objective: `review completed refinement against user intent: ${text}`,
        acceptanceChecks: [],
      },
    ];

    for (const task of tasks) await this._runTask(mission, task);

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
        summary: "Planned, grounded, scheduled, executed in Pi, and reviewed.",
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
        timeoutMs: 30_000,
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
      timeoutMs: 30_000,
      attempt: 1,
    };

    await this.eventStore.append({
      missionId: mission.id,
      taskId: task.id,
      traceId,
      type: "adapter.dispatched",
      source: "patrick",
      severity: "info",
      payload: { adapter: adapterId, risk },
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
      }, 60_000);
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
