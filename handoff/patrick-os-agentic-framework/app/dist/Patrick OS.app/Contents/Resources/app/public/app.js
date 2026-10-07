const MISSION_ID = "mission-education-demo-001";

const state = {
  mission: null,
  events: [],
  eventIds: new Set(),
  artifacts: [],
  acceptance: { passed: new Set(), failed: new Set() },
  workers: {
    web: { state: "queued", label: "Web (Chrome)" },
    ipad: { state: "queued", label: "iPad (Safari)" },
    vision: { state: "queued", label: "visionOS (Simulator)" },
  },
  checkpoints: [],
  approvals: [],
  activeCheckpoint: 0,
  checkpointWasSelected: false,
  crashSince: null,
  paused: false,
  toastTimer: null,
  activeView: "missions",
  activeCommandId: null,
};

document.addEventListener("DOMContentLoaded", async () => {
  bindInteractions();
  switchWorkspaceView(location.hash.slice(1) || "missions");
  refreshIcons();
  startClock();
  await Promise.all([refreshMission(), refreshApprovals()]);
  subscribeStream();
  setInterval(refreshApprovals, 3000);
});

function bindInteractions() {
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      switchWorkspaceView(link.dataset.nav || "missions");
    });
  });

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => selectTab(button.dataset.tab));
  });

  document.querySelectorAll(".tool-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tool-button").forEach((item) => item.classList.toggle("active", item === button));
      const preview = document.getElementById("preview-body");
      preview.classList.toggle("tablet-mode", button.dataset.device === "tablet");
      preview.classList.toggle("code-mode", button.dataset.device === "code");
    });
  });

  document.querySelectorAll(".lang").forEach((button) => {
    button.addEventListener("click", () => {
      const lang = button.dataset.lang;
      document.querySelectorAll(".lang").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll(".lesson-h2, .lesson-desc").forEach((element) => {
        element.hidden = !element.classList.contains(lang);
      });
      showToast(lang === "zh" ? "已切换到中文课程" : "Lesson switched to English");
    });
  });

  document.getElementById("lesson-theme").addEventListener("click", () => {
    document.getElementById("preview-body").classList.toggle("night");
  });

  document.getElementById("start-lesson").addEventListener("click", () => {
    showToast("Spatial lesson launched in preview mode");
  });

  document.getElementById("pause-btn").addEventListener("click", togglePause);
  document.getElementById("mission-composer").addEventListener("submit", submitCommand);
  document.getElementById("composer-input").addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      event.currentTarget.focus();
    }
  });

  document.getElementById("rail-prev").addEventListener("click", () => stepCheckpoint(-1));
  document.getElementById("rail-next").addEventListener("click", () => stepCheckpoint(1));
  document.getElementById("view-changes").addEventListener("click", () => selectTab("changes"));

  document.querySelectorAll(".decision-button").forEach((button) => {
    button.addEventListener("click", () => handleDecision(button.dataset.choice));
  });
  document.getElementById("dialog-accept").addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("translation-dialog").close();
    resolveApproval("accept-safer-wording");
  });

  document.getElementById("adapter-health").addEventListener("click", inspectAdapters);
  document.getElementById("privacy-status").addEventListener("click", () => {
    showToast("Policy active: workspace-only writes, localhost-only network, explicit high-risk approval");
  });
  document.getElementById("open-project-mission").addEventListener("click", () => switchWorkspaceView("missions"));
}

function refreshIcons() {
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true" } });
}

function startClock() {
  const tick = () => {
    const now = new Date();
    const china = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).format(now);
    document.getElementById("now").textContent = `${china} CST`;
    updateElapsed();
  };
  tick();
  setInterval(tick, 1000);
}

function updateElapsed() {
  if (!state.mission?.startedAt) return;
  const elapsed = Math.max(0, Date.now() - new Date(state.mission.startedAt).getTime());
  const hours = Math.floor(elapsed / 3_600_000);
  const minutes = Math.floor((elapsed % 3_600_000) / 60_000);
  const seconds = Math.floor((elapsed % 60_000) / 1000);
  document.getElementById("mission-elapsed").textContent = [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

async function refreshMission() {
  try {
    const response = await fetch(`/api/missions/${MISSION_ID}`);
    if (!response.ok) throw new Error(`mission request failed (${response.status})`);
    const { mission } = await response.json();
    state.mission = mission;
    document.getElementById("mission-title").textContent = mission.title;
    document.getElementById("mission-objective").textContent = mission.objective;
    document.getElementById("total-count").textContent = mission.acceptanceCriteria.length;
    document.getElementById("mission-started").textContent = mission.startedAt
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(mission.startedAt)) + " CST"
      : "Waiting";
    state.paused = mission.status === "blocked" && mission.blockedReason === "user paused";
    renderPauseButton();
    renderAll();
  } catch (error) {
    showToast("Mission API is reconnecting");
  }
}

async function refreshApprovals() {
  try {
    const response = await fetch("/api/approvals");
    if (!response.ok) return;
    const { approvals } = await response.json();
    state.approvals = approvals;
    renderApprovals();
    renderApprovalHistory();
    renderToday();
  } catch {
    // SSE and the periodic refresh will recover without disrupting the room.
  }
}

function subscribeStream() {
  const source = new EventSource(`/api/missions/${MISSION_ID}/stream`);
  source.addEventListener("evt", (message) => applyEvent(JSON.parse(message.data)));
  source.onerror = () => {
    document.getElementById("health-pill").textContent = "Reconnecting event stream";
  };
  source.onopen = () => {
    document.getElementById("health-pill").textContent = "All systems nominal";
  };
}

function applyEvent(event) {
  if (state.eventIds.has(event.id)) return;
  state.eventIds.add(event.id);
  state.events.push(event);
  state.events.sort((a, b) => a.sequence - b.sequence);

  if (event.type === "acceptance.passed") state.acceptance.passed.add(event.payload.statement);
  if (event.type === "acceptance.failed") state.acceptance.failed.add(event.payload.statement);
  if (event.type === "artifact.created") upsertArtifact(event.payload, event);
  if (event.type === "checkpoint.created") upsertCheckpoint(event);
  if (event.type === "task.failed") state.crashSince = event.timestamp;
  if (event.type === "task.completed" && event.source === "pi") updateWorker(event.taskId, "passed");
  if ((event.type === "task.started" || event.type === "task.log") && event.source === "pi") updateWorker(event.taskId, "running");
  if (event.type === "command.received") state.activeCommandId = event.payload.commandId;
  if (["mission.created", "mission.completed", "mission.cancelled", "task.blocked", "task.progress"].includes(event.type)) refreshMission();
  if (["approval.requested", "approval.resolved"].includes(event.type)) refreshApprovals();
  renderAll();
}

function upsertArtifact(payload, event) {
  const key = payload.artifactId || `${event.taskId}:${payload.name}:${payload.version || 1}`;
  if (state.artifacts.some((artifact) => artifact.key === key)) return;
  state.artifacts.push({ ...payload, key, taskId: event.taskId, actor: event.source, timestamp: event.timestamp });
}

function upsertCheckpoint(event) {
  const name = event.payload.name;
  if (state.checkpoints.some((checkpoint) => checkpoint.name === name)) return;
  state.checkpoints.push({
    name,
    order: event.payload.sequence,
    sequence: event.sequence,
    taskId: event.taskId,
    timestamp: event.timestamp,
  });
  state.checkpoints.sort((a, b) => a.order - b.order);
  if (!state.checkpointWasSelected) state.activeCheckpoint = state.checkpoints.length - 1;
}

function updateWorker(taskId = "", nextState) {
  const match = taskId.match(/task-(web|ipad|vision)/);
  if (!match) return;
  state.workers[match[1]].state = nextState;
}

function renderAll() {
  renderAcceptance();
  renderEvidence();
  renderCrew();
  renderTimeline();
  renderCrashSince();
  renderTrace();
  renderToday();
  renderProjects();
  renderMemory();
  renderApprovalHistory();
  refreshIcons();
}

function derivedAcceptance() {
  const statements = new Set(state.acceptance.passed);
  const criteria = state.mission?.acceptanceCriteria || [];
  const byId = Object.fromEntries(criteria.map((criterion) => [criterion.id, criterion.statement]));
  if (state.workers.web.state === "passed" && byId["ac-web"]) statements.add(byId["ac-web"]);
  if (state.workers.ipad.state === "passed" && byId["ac-ipad"]) statements.add(byId["ac-ipad"]);
  if (state.workers.vision.state === "passed" && byId["ac-vision"]) statements.add(byId["ac-vision"]);
  if (Object.values(state.workers).every((worker) => worker.state === "passed") && byId["ac-tests"]) statements.add(byId["ac-tests"]);
  return statements;
}

function renderAcceptance() {
  const criteria = state.mission?.acceptanceCriteria || [];
  const passedStatements = derivedAcceptance();
  const evidencePassed = criteria.filter((criterion) => passedStatements.has(criterion.statement)).length;
  const waitingOnMeaningDecision = state.mission?.status === "blocked"
    && state.mission?.blockedReason === "Human translation decision required";
  // Match the product contract: platform builds may have emitted evidence,
  // but bilingual meaning and final review remain visibly unaccepted until
  // Patrick resolves the human judgment gate.
  const passed = waitingOnMeaningDecision ? Math.min(evidencePassed, 4) : evidencePassed;
  document.getElementById("passed-count").textContent = passed;
  document.getElementById("total-count").textContent = criteria.length || 6;
  const root = document.getElementById("acceptance-progress");
  root.innerHTML = "";
  for (let index = 0; index < (criteria.length || 6); index += 1) {
    const item = document.createElement("span");
    item.classList.toggle("passed", index < passed);
    root.appendChild(item);
  }
}

function renderEvidence() {
  const artifactEvents = state.artifacts.length;
  const passedWorkers = Object.values(state.workers).filter((worker) => worker.state === "passed").length;
  document.getElementById("changes-badge").textContent = artifactEvents;
  document.getElementById("tests-badge").textContent = passedWorkers * 3;
  renderChanges();
  renderTests();
  renderSources();
}

function renderChanges() {
  const root = document.getElementById("changes-list");
  root.innerHTML = "";
  const artifacts = [...state.artifacts].reverse();
  if (!artifacts.length) {
    root.innerHTML = '<article class="list-card"><div class="row1"><span class="name">Waiting for the first versioned artifact</span><span class="pill">queued</span></div><div class="meta">Pi will write inside an isolated mission workspace.</div></article>';
    return;
  }
  artifacts.slice(0, 8).forEach((artifact) => {
    const card = document.createElement("article");
    card.className = "list-card";
    card.innerHTML = `<div class="row1"><span class="name">${escapeHtml(artifact.name || "artifact")}</span><span class="pill ok">v${artifact.version || 1}</span></div><div class="meta"><code>${escapeHtml(artifact.taskId || "mission")}</code> · ${escapeHtml(artifact.actor || "patrick")} · sha256 ${(artifact.checksum || "pending").slice(0, 14)}</div>`;
    root.appendChild(card);
  });
}

function renderTests() {
  const root = document.getElementById("tests-list");
  root.innerHTML = "";
  const criteria = state.mission?.acceptanceCriteria || [];
  const passed = derivedAcceptance();
  const waitingOnMeaningDecision = state.mission?.status === "blocked"
    && state.mission?.blockedReason === "Human translation decision required";
  criteria.forEach((criterion) => {
    const failed = state.acceptance.failed.has(criterion.statement);
    const heldForReview = waitingOnMeaningDecision && ["ac-bilingual", "ac-sources"].includes(criterion.id);
    const status = failed ? "failed" : passed.has(criterion.statement) && !heldForReview ? "passed" : "pending";
    const card = document.createElement("article");
    card.className = "list-card";
    card.innerHTML = `<div class="row1"><span class="name">${escapeHtml(criterion.statement)}</span><span class="pill ${status === "passed" ? "ok" : status === "failed" ? "err" : ""}">${status}</span></div><div class="meta">${criterion.required ? "Hard gate" : "Optional"} · evidence retained in the mission trace</div>`;
    root.appendChild(card);
  });
}

function renderSources() {
  const root = document.getElementById("sources-list");
  if (root.childElementCount) return;
  const sources = [
    ["NASA Solar System Exploration", "Planet facts and educational reference", "https://science.nasa.gov/solar-system/"],
    ["IAU Planetary Nomenclature", "Canonical naming and translation review", "https://planetarynames.wr.usgs.gov/"],
    ["Patrick OS mission contract", "Acceptance criteria, adapter trace, and artifact provenance", "#missions"],
  ];
  sources.forEach(([name, note, url]) => {
    const card = document.createElement("article");
    card.className = "list-card";
    card.innerHTML = `<div class="row1"><span class="name">${escapeHtml(name)}</span><span class="pill">source</span></div><div class="meta">${escapeHtml(note)}</div><div class="meta"><a href="${escapeHtml(url)}" ${url.startsWith("http") ? 'target="_blank" rel="noopener"' : ""}>${escapeHtml(url)}</a></div>`;
    root.appendChild(card);
  });
}

function renderCrew() {
  const latest = (source, types = null) => [...state.events].reverse().find((event) => event.source === source && (!types || types.includes(event.type)));
  const openai = latest("openai");
  const hermes = latest("hermes");
  const swarm = latest("open-swarm");
  const pi = latest("pi", ["task.started", "task.log", "task.completed", "task.failed"]);
  const root = document.getElementById("crew-list");
  root.innerHTML = "";

  root.appendChild(crewCard({
    kind: "openai", icon: "sparkles", name: "ChatGPT", role: "Planning & final review",
    status: agentStatus(openai), time: eventTime(openai),
    summary: openai?.type === "task.completed" ? "Structured plan complete. Final review waits behind the approval gate." : "Building the mission plan and review contract.",
    signal: openai?.type === "task.completed" ? "Plan validated" : "Planning",
    handoff: "Handoff to Hermes",
  }));
  root.appendChild(crewCard({
    kind: "hermes", icon: "database", name: "Hermes", role: "Local context steward",
    status: agentStatus(hermes), time: eventTime(hermes),
    summary: hermes?.payload?.message || hermes?.payload?.summary || "Indexing approved files, tools, artifacts, and translations.",
    signal: hermes?.type === "task.completed" ? "Workspace integrated" : "Local-only context",
    handoff: "Handoff to Open Swarm",
  }));
  root.appendChild(crewCard({
    kind: "swarm", icon: "workflow", name: "Open Swarm", role: "Parallel routing",
    status: Object.values(state.workers).some((worker) => worker.state === "running") ? "Running" : agentStatus(swarm),
    time: eventTime(swarm), summary: "Three isolated platform workstreams share one approved DAG.",
    extra: workerList(), handoff: "View workstreams",
  }));
  root.appendChild(crewCard({
    kind: "pi", icon: "box", name: "Pi Workers", role: "Build & QA",
    status: Object.values(state.workers).every((worker) => worker.state === "passed") ? "Completed" : pi ? "Building" : "Queued",
    time: eventTime(pi), summary: `${state.artifacts.length || 0} versioned artifacts · isolated workspaces`,
    signal: Object.values(state.workers).every((worker) => worker.state === "passed") ? "All platform checks passed" : "Real local execution",
    handoff: "Logs & results",
  }));
  refreshIcons();
}

function crewCard({ kind, icon, name, role, status, time, summary, signal, handoff, extra = "" }) {
  const card = document.createElement("article");
  card.className = `crew-card ${kind}`;
  card.innerHTML = `<div class="crew-head"><span class="crew-icon ${kind}"><i data-lucide="${icon}"></i></span><span class="crew-name">${escapeHtml(name)}<small>${escapeHtml(role)}</small></span><time class="crew-time">${escapeHtml(time)}</time></div><div class="crew-status"><span class="lbl">Status</span><span class="val">${escapeHtml(status)}</span></div><ul class="crew-bullets"><li>${escapeHtml(summary)}</li></ul>${signal ? `<div class="crew-check">${escapeHtml(signal)}</div>` : ""}${extra}<div class="crew-handoff">${escapeHtml(handoff)} →</div>`;
  return card;
}

function workerList() {
  return `<ul class="worker-list">${Object.values(state.workers).map((worker) => `<li><span><span class="dot ${worker.state}"></span>${escapeHtml(worker.label)}</span><span>${worker.state === "passed" ? "Complete" : worker.state === "running" ? "Building" : "Queued"}</span></li>`).join("")}</ul>`;
}

function agentStatus(event) {
  if (!event) return "Idle";
  if (["task.completed", "memory.updated", "artifact.created"].includes(event.type)) return "Completed";
  if (event.type === "task.failed") return "Blocked";
  return "In progress";
}

function eventTime(event) {
  return event ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(event.timestamp)) : "—";
}

function renderTimeline() {
  const root = document.getElementById("timeline-points");
  root.innerHTML = "";
  const canonicalNames = ["Plan", "Context", "Parallel Build", "Integration", "Review"];
  const checkpoints = canonicalNames.map((name, index) => {
    const observed = state.checkpoints.find((checkpoint) => checkpoint.name === name);
    return observed || { name, order: index + 1, pending: true };
  });
  state.activeCheckpoint = Math.max(0, Math.min(state.activeCheckpoint, checkpoints.length - 1));
  checkpoints.forEach((checkpoint, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `timeline-point ${index === state.activeCheckpoint ? "active" : ""} ${index < state.activeCheckpoint ? "passed" : ""}`;
    const time = checkpoint.timestamp ? eventTime({ timestamp: checkpoint.timestamp }) : ["20:31", "20:31", "20:32", "20:38", "21:41"][index];
    button.innerHTML = `<span class="pt-time">${time}</span><span class="pip"></span><span class="pt-label">${escapeHtml(checkpoint.name)}</span>`;
    button.addEventListener("click", () => {
      state.activeCheckpoint = index;
      state.checkpointWasSelected = true;
      renderTimeline();
    });
    root.appendChild(button);
  });
  const active = checkpoints[state.activeCheckpoint];
  document.getElementById("cp-name").textContent = active?.name || "Plan";
  document.getElementById("cp-meta").textContent = active?.timestamp ? `  ${eventTime({ timestamp: active.timestamp })} CST` : "  awaiting event";
}

function stepCheckpoint(direction) {
  const total = state.checkpoints.length || 5;
  state.activeCheckpoint = Math.max(0, Math.min(total - 1, state.activeCheckpoint + direction));
  state.checkpointWasSelected = true;
  renderTimeline();
}

function renderCrashSince() {
  const started = state.mission?.startedAt ? new Date(state.mission.startedAt).getTime() : Date.now();
  const end = state.crashSince ? new Date(state.crashSince).getTime() : Date.now();
  document.getElementById("mission-crash-min").textContent = Math.max(0, Math.floor((end - started) / 60_000));
}

function renderApprovals() {
  const pending = state.approvals.find((approval) => approval.status === "pending");
  const card = document.getElementById("decision-card");
  document.getElementById("nav-approval-count").textContent = pending ? "1" : "0";
  if (!pending) {
    card.classList.add("resolved");
    card.querySelector(".decision-title").textContent = "Decision resolved";
    document.getElementById("decision-action").textContent = "Mission is clear to continue";
    document.getElementById("decision-sub").textContent = "The approval is recorded in the append-only trace.";
    document.getElementById("decision-footer-status").textContent = "Decision recorded";
    document.getElementById("decision-footer-due").textContent = "Reversible from checkpoint";
    return;
  }
  card.classList.remove("resolved");
  card.querySelector(".decision-title").textContent = "Your decision required";
  document.getElementById("decision-action").textContent = pending.payload.action || "Resolve mission decision";
  document.getElementById("decision-sub").textContent = pending.payload.reason || "Choose how to proceed.";
  document.getElementById("decision-footer-status").textContent = "Waiting for your decision";
  document.getElementById("decision-footer-due").innerHTML = 'Due in <b id="due-min">18</b>m';
}

async function togglePause() {
  const endpoint = state.paused ? "resume" : "pause";
  const response = await fetch(`/api/missions/${MISSION_ID}/${endpoint}`, {
    method: "POST",
    headers: { "X-Idempotency-Key": crypto.randomUUID() },
  });
  if (!response.ok) return showToast(`Could not ${endpoint} mission`);
  state.paused = !state.paused;
  renderPauseButton();
  showToast(state.paused ? "Mission paused at a safe boundary" : "Mission resumed");
}

function renderPauseButton() {
  const button = document.getElementById("pause-btn");
  button.innerHTML = state.paused ? '<i data-lucide="play-circle"></i><span>Resume mission</span>' : '<i data-lucide="pause-circle"></i><span>Pause mission</span>';
  refreshIcons();
}

async function submitCommand(event) {
  event.preventDefault();
  const input = document.getElementById("composer-input");
  const text = input.value.trim();
  if (!text) return;
  input.disabled = true;
  const response = await fetch(`/api/missions/${MISSION_ID}/commands`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ kind: "user.refine", text }),
  });
  input.disabled = false;
  if (response.ok) {
    const result = await response.json();
    state.activeCommandId = result.commandId || state.activeCommandId;
    input.value = "";
    selectTab("trace");
    showToast("Command accepted · opening the live system trace");
  } else {
    showToast("Refinement could not be added");
  }
}

function switchWorkspaceView(name) {
  const target = document.getElementById(`view-${name}`) ? name : "missions";
  state.activeView = target;
  document.querySelectorAll(".workspace-view").forEach((view) => {
    view.hidden = view.id !== `view-${target}`;
    view.classList.toggle("active", !view.hidden);
  });
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.nav === target));
  const titles = {
    today: "Today",
    missions: "Artifact Room",
    projects: "Projects",
    memory: "Memory",
    approvals: "Approvals",
  };
  document.getElementById("room-title").textContent = titles[target];
  document.getElementById("pause-btn").hidden = target !== "missions";
  history.replaceState(null, "", `#${target}`);
  if (target === "projects") renderProjects();
  if (target === "memory") renderMemory();
  if (target === "approvals") renderApprovalHistory();
  if (target === "today") renderToday();
  refreshIcons();
}

function renderTrace() {
  const root = document.getElementById("trace-list");
  if (!root) return;
  const traceTypes = new Set([
    "command.received", "command.started", "command.completed", "command.failed",
    "adapter.dispatched", "task.queued", "task.started", "task.progress", "task.log", "task.completed", "task.failed", "task.blocked",
    "artifact.created", "memory.updated", "approval.requested", "approval.resolved",
  ]);
  const allTraceEvents = state.events.filter((event) => traceTypes.has(event.type));
  const latestCommand = [...state.events].reverse().find((event) => event.type === "command.received");
  const commandId = state.activeCommandId || latestCommand?.payload?.commandId || null;
  const scopedEvents = commandId
    ? allTraceEvents.filter((event) => belongsToCommand(event, commandId))
    : allTraceEvents;
  document.getElementById("trace-badge").textContent = scopedEvents.length;

  document.querySelectorAll("[data-trace-agent]").forEach((node) => {
    const actor = node.dataset.traceAgent;
    const actorEvents = scopedEvents.filter((event) => event.source === actor);
    const completed = actorEvents.some((event) => ["task.completed", "artifact.created", "memory.updated", "command.completed"].includes(event.type));
    const started = actorEvents.some((event) => ["task.queued", "task.started", "command.started"].includes(event.type));
    node.classList.toggle("completed", completed);
    node.classList.toggle("running", started && !completed);
  });

  root.innerHTML = "";
  if (!scopedEvents.length) {
    root.innerHTML = '<div class="empty-state">Send a refinement above. The complete ChatGPT → Hermes → Open Swarm → Pi relay will appear here live.</div>';
    return;
  }
  [...scopedEvents].reverse().slice(0, 60).forEach((event) => {
    const row = document.createElement("article");
    row.className = "trace-row";
    const actor = event.source || "patrick";
    row.innerHTML = `<span class="trace-actor ${escapeHtml(actor)}">${escapeHtml(actorLabel(actor))}</span><span class="trace-type">${escapeHtml(event.type)}</span><span class="trace-copy"><strong>${escapeHtml(eventTitle(event))}</strong><small>${escapeHtml(eventDetail(event))}</small></span><time>${escapeHtml(eventTime(event))}</time>`;
    root.appendChild(row);
  });
}

function belongsToCommand(event, commandId) {
  return event.taskId === commandId
    || String(event.taskId || "").startsWith(`${commandId}-`)
    || event.payload?.commandId === commandId;
}

function actorLabel(actor) {
  return ({ openai: "ChatGPT", hermes: "Hermes", "open-swarm": "Swarm", pi: "Pi · real", user: "You", patrick: "Patrick" })[actor] || actor;
}

function eventTitle(event) {
  const payload = event.payload || {};
  if (event.type === "command.received") return "Instruction received";
  if (event.type === "command.started") return "Patrick routed the work";
  if (event.type === "command.completed") return "Instruction completed";
  if (event.type === "command.failed") return "Instruction failed";
  if (event.type === "adapter.dispatched") return `Dispatched to ${actorLabel(payload.adapter || "adapter")}`;
  if (event.type === "memory.updated") return "Working memory updated";
  if (event.type === "artifact.created") return `Artifact: ${payload.name || payload.artifactId || "versioned output"}`;
  if (event.type === "approval.requested") return `Approval requested: ${payload.action || "decision"}`;
  if (event.type === "approval.resolved") return `Approval ${payload.decision || "resolved"}`;
  return payload.task || payload.title || event.type.replaceAll(".", " ");
}

function eventDetail(event) {
  const payload = event.payload || {};
  const mode = ["openai", "hermes", "open-swarm"].includes(event.source)
    ? "Simulated adapter"
    : event.source === "pi" ? "Real isolated local execution" : "Event Store fact";
  return payload.text || payload.message || payload.summary || payload.reason || payload.uri || `${mode} · ${event.taskId || "mission"}`;
}

function renderToday() {
  if (!document.getElementById("today-event-count")) return;
  const artifacts = state.events.filter((event) => event.type === "artifact.created");
  const commands = state.events.filter((event) => event.type === "command.received");
  const decisions = state.approvals.filter((approval) => approval.status !== "pending");
  document.getElementById("today-event-count").textContent = state.events.length;
  document.getElementById("today-artifact-count").textContent = artifacts.length;
  document.getElementById("today-command-count").textContent = commands.length;
  document.getElementById("today-approval-count").textContent = decisions.length;
  const root = document.getElementById("today-activity");
  const events = [...state.events].reverse().filter((event) => ["command.received", "command.completed", "artifact.created", "approval.requested", "approval.resolved", "memory.updated", "mission.completed"].includes(event.type)).slice(0, 10);
  root.innerHTML = events.length ? "" : '<div class="empty-state">Mission activity will appear here as the Event Store receives facts.</div>';
  events.forEach((event) => {
    const item = document.createElement("article");
    item.className = "activity-item";
    item.innerHTML = `<span class="activity-actor">${escapeHtml(actorLabel(event.source))}</span><span><strong>${escapeHtml(eventTitle(event))}</strong><p>${escapeHtml(eventDetail(event))}</p></span><time>${escapeHtml(eventTime(event))}</time>`;
    root.appendChild(item);
  });
}

function renderProjects() {
  const root = document.getElementById("project-command-history");
  if (!root) return;
  const artifacts = state.events.filter((event) => event.type === "artifact.created");
  const commands = state.events.filter((event) => event.type === "command.received");
  const lastEvent = state.events[state.events.length - 1];
  document.getElementById("project-state").textContent = state.mission?.status || "Loading";
  document.getElementById("project-artifacts").textContent = artifacts.length;
  document.getElementById("project-tests").textContent = derivedAcceptance().size;
  document.getElementById("project-commands").textContent = commands.length;
  document.getElementById("project-last-activity").textContent = lastEvent ? `Last event ${eventTime(lastEvent)} · ${eventTitle(lastEvent)}` : "Waiting for activity";
  root.innerHTML = commands.length ? "" : '<div class="empty-state">No refinements yet. Open the mission and send your first instruction.</div>';
  [...commands].reverse().forEach((event) => {
    const id = event.payload.commandId;
    const completed = state.events.some((candidate) => candidate.type === "command.completed" && candidate.payload.commandId === id);
    const failed = state.events.some((candidate) => candidate.type === "command.failed" && candidate.payload.commandId === id);
    const status = failed ? "failed" : completed ? "completed" : "running";
    const button = document.createElement("button");
    button.className = "command-item";
    button.type = "button";
    button.innerHTML = `<span class="memory-dot"><i data-lucide="terminal-square"></i></span><span><strong>${escapeHtml(event.payload.text)}</strong><p>${escapeHtml(id)}</p></span><span><span class="command-state ${status}">${status}</span><time>${escapeHtml(eventTime(event))}</time></span>`;
    button.addEventListener("click", () => {
      state.activeCommandId = id;
      switchWorkspaceView("missions");
      selectTab("trace");
      renderTrace();
    });
    root.appendChild(button);
  });
  refreshIcons();
}

function renderMemory() {
  const root = document.getElementById("memory-list");
  if (!root) return;
  const memories = state.events.filter((event) => event.type === "memory.updated");
  root.innerHTML = memories.length ? "" : '<div class="empty-state">Hermes writes working memory only after a command finishes with evidence.</div>';
  [...memories].reverse().forEach((event) => root.appendChild(memoryItem("brain-circuit", event.payload.summary, `${event.payload.evidence} · ${event.payload.commandId}`, eventTime(event))));

  const checkpointsRoot = document.getElementById("memory-checkpoints");
  checkpointsRoot.innerHTML = "";
  state.checkpoints.forEach((checkpoint) => checkpointsRoot.appendChild(memoryItem("milestone", checkpoint.name, `Event sequence ${checkpoint.sequence}`, eventTime({ timestamp: checkpoint.timestamp }))));
  state.approvals.filter((approval) => approval.status !== "pending").forEach((approval) => checkpointsRoot.appendChild(memoryItem("shield-check", approval.payload.action, `${approval.status} · ${approval.note || "decision recorded"}`, eventTime({ timestamp: approval.resolvedAt }))));
  if (!checkpointsRoot.childElementCount) checkpointsRoot.innerHTML = '<div class="empty-state">No durable checkpoints recorded yet.</div>';
  refreshIcons();
}

function memoryItem(icon, title, detail, time) {
  const item = document.createElement("article");
  item.className = "memory-item";
  item.innerHTML = `<span class="memory-dot"><i data-lucide="${icon}"></i></span><span><strong>${escapeHtml(title || "Recorded fact")}</strong><p>${escapeHtml(detail || "Event Store evidence")}</p></span><time>${escapeHtml(time || "—")}</time>`;
  return item;
}

function renderApprovalHistory() {
  const root = document.getElementById("approval-history");
  if (!root) return;
  root.innerHTML = state.approvals.length ? "" : '<div class="section-card empty-state">No approvals requested yet.</div>';
  [...state.approvals].reverse().forEach((approval) => {
    const payload = approval.payload || {};
    const record = document.createElement("article");
    record.className = "approval-record";
    record.innerHTML = `<header><strong>${escapeHtml(payload.action || "Approval request")}</strong><span class="approval-status ${escapeHtml(approval.status)}">${escapeHtml(approval.status)}</span></header><dl><dt>Risk</dt><dd>${escapeHtml(payload.risk || "unknown")}</dd><dt>Scope</dt><dd>${escapeHtml(payload.scope || "once")}</dd><dt>Destination</dt><dd>${escapeHtml(payload.destination || "local")}</dd><dt>Data shared</dt><dd>${escapeHtml(payload.dataShared || "none")}</dd><dt>Paths</dt><dd>${escapeHtml((payload.affectedPaths || []).join(", ") || "none")}</dd><dt>Rollback</dt><dd>${escapeHtml(payload.rollback || "not specified")}</dd></dl><footer><span>${escapeHtml(approval.note || payload.reason || "Awaiting decision")}</span><time>${escapeHtml(eventTime({ timestamp: approval.resolvedAt || approval.createdAt }))}</time></footer>`;
    root.appendChild(record);
  });
}

function selectTab(name) {
  document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("hidden", panel.id !== `tab-${name}`));
}

function handleDecision(choice) {
  if (choice === "compare") {
    document.getElementById("translation-dialog").showModal();
    refreshIcons();
    return;
  }
  resolveApproval(choice);
}

async function resolveApproval(choice) {
  const pending = state.approvals.find((approval) => approval.status === "pending");
  if (!pending) return showToast("No pending decision");
  if (choice === "ask-agent") {
    await fetch(`/api/missions/${MISSION_ID}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ kind: "user.refine", text: "Revise the Chinese orbit translation using the safer wording, then continue." }),
    });
  }
  const response = await fetch(`/api/approvals/${pending.id}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ decision: "approve", note: `user chose: ${choice}` }),
  });
  if (!response.ok) return showToast("Decision could not be recorded");
  document.querySelectorAll(".decision-button").forEach((button) => button.classList.toggle("submitted", button.dataset.choice === choice));
  showToast(choice === "ask-agent" ? "Agent revision requested and approved" : "Safer wording approved");
  await refreshApprovals();
}

async function inspectAdapters() {
  try {
    const response = await fetch("/api/adapters");
    const { adapters } = await response.json();
    const real = adapters.filter((adapter) => /real/i.test(adapter.health.version || "")).length;
    showToast(`${adapters.length} adapters online · ${real} real execution adapter · ${adapters.length - real} simulated`);
  } catch {
    showToast("Adapter health is temporarily unavailable");
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.querySelector("span").textContent = message;
  toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}
