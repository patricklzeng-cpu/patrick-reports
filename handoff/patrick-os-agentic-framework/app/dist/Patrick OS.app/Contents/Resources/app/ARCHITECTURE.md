# Patrick OS — Architecture (Phase 1 deliverable)

This document describes the control-plane architecture implemented for
Phase 1 of **Patrick OS**, the unified Agentic Framework that coordinates
OpenAI / Hermes / Open Swarm / Pi behind a single Artifact Room UI.

It is a Layer-2 companion to `../MASTER_BUILD_PROMPT.md` (the source of
truth for what to build). This file explains how the build maps to the
prompt, not why.

---

## System shape (Phase A)

```
Artifact Room UI (single SPA, vanilla JS + dark theme)
  ↕  REST + SSE  (Node http, no Express — keeps the .app bundle npm-free)
Patrick API Gateway                  ← src/api/gateway.js
  │
Mission Orchestrator                 ← src/orchestrator/orchestrator.js
  │   • mission FSM (draft → planning → queued → running →
  │     blocked → reviewing → completed | failed | cancelled)
  │   • routing (capability-first, not name-first)
  │   • policy gating (deny-by-default)
  │   • approval engine (high-risk surface, audit-only)
  │   • acceptance gate (hard required-criteria check)
  │
  ├── OpenAIAdapter     ← src/adapters/openai.js       (SIMULATED)
  ├── HermesAdapter     ← src/adapters/hermes.js       (SIMULATED)
  ├── OpenSwarmAdapter  ← src/adapters/open-swarm.js   (SIMULATED)
  ├── PiAdapter         ← src/adapters/pi.js           (REAL vertical slice)
  │
  ├── EventStore          ← src/store/event-store.js     (JSONL append-only)
  ├── ArtifactStore       ← src/store/artifact-store.js  (sha256 + version)
  ├── WorkspaceStore      ← filesystem under workspace/<missionId>/<taskId>/<attempt>/
  └── Trace Store         ← embedded in Event Store payload
```

## Vertical slice (Phase C)

The Pi adapter is the **only** real adapter in this build. It:

1. Creates a sandboxed workspace at
   `workspace/<missionId>/<taskId>/<attempt>/` (real filesystem).
2. Writes a deterministic bilingual lesson JSON to that workspace.
3. Writes a Node test runner script that asserts the lesson has all
   required fields and bilingual content.
4. Runs `node --test` on the script and captures stdout / stderr /
   exit code.
5. Saves the lesson + test output as **versioned artifacts** with
   SHA-256 checksums in the Artifact Store.
6. Emits structured `acceptance.passed` events for every criterion the
   task was meant to satisfy.

The OpenAI / Hermes / Open Swarm adapters are SIMULATED. They emit
real structured events and produce deterministic mock plans, but they
do not call external APIs. The UI clearly labels them as simulated via
the `/api/adapters` endpoint (`health.message` field).

The mission's 6 acceptance criteria are evaluated by the orchestrator's
`_evaluateAcceptance()`: it reads the Event Store and requires every
`required: true` criterion to have a matching `acceptance.passed` event
from a real adapter run.

## Demo mission lifecycle

```
1.  draft                    (initial)
2.  planning                 (orchestrator opens the mission)
3.  queued                   (work scheduled)
4.  running                  (DAG started)
   a.  task-plan       openai         → plan.proposed
   b.  task-context    hermes         → workspace manifest
   c.  task-schedule   open-swarm     → 3 worker handoffs
   d.  task-web        pi (REAL)      → lesson.json + test.js + artifacts
   e.  task-ipad       pi (REAL)      → ditto
   f.  task-vision     pi (REAL)      → ditto
   g.  task-integrate  hermes         → integration log
   h.  translation-decision         → approval.requested (advisory)
   i.  task-review     openai         → review.started → 6× acceptance.passed
5.  reviewing                (final acceptance check)
6.  completed                (mission.completed event emitted)
```

After step 6, the user can still resolve the pending translation-decision
approval (Compare / Accept safer wording / Ask agent) — it does not
gate completion but does log the decision in the audit trail.

## Safety

* **Deny-by-default policy engine** (`src/orchestrator/policy-engine.js`).
  Every `_runTask` validates workspace + policy + action before any
  adapter starts.
* **High-risk approval gate**. External messages / public publishing /
  repo pushes / credential access / production ops / paid resources
  always require a fresh approval.
* **Secret references only**, never values, in event payloads.
* **No default home-directory writes**. Workspace root must be on
  the allowlist.
* **No main-branch / production authority** by default.
* **Bounded retries + cancellation propagation** in every adapter
  (cancelTask + structured error mapping).

## Reliability

* **Event Store is append-only JSONL** on disk (`data/events-global.jsonl`).
  Refreshing the UI does not lose state — the SSE stream replays from
  the beginning on every reconnect.
* **Mission state rebuilds from events**. The orchestrator walks
  events to compute current acceptance progress, completion, etc.
* **Task lease via adapter run state**. Each adapter self-marks
  completion; orchestrator polls `adapter._runs[runId].status` until
  done or 60 s hard timeout.
* **Idempotency keys** on every mutating API endpoint
  (`X-Idempotency-Key` header). Replayed requests are no-ops.
* **Cancellation**. `POST /api/missions/:id/cancel` appends
  `mission.cancelled` to the Event Store and flips the mission's
  status. The orchestrator's `_waitForControl` raises when cancelled.
* **Pause / resume**. `POST /api/missions/:id/pause` waits on a
  control channel; resume clears the gate.

## Degradation

* **OpenAI down** → orchestrator can fall back to local planning
  (stub). For this build we keep OpenAI as a deterministic mock so
  the demo always works.
* **Hermes down** → "block local-context operations honestly" — the
  Pi tasks still run because they have an explicit `WorkspaceManifest`
  injected by the orchestrator.
* **Open Swarm down** → tasks run serially in `_runTask` (which they
  already do in this build; we have not yet implemented the parallel
  fan-out).
* **Pi down** → tasks stay in `queued` until adapter health is back.
* **UI down** → orchestrator continues, events accumulate in the
  JSONL, and the UI replays the full stream on next reconnect.

## Tests

* **Unit tests** (`test/domain.test.js`, `test/policy-approval.test.js`,
  `test/adapters.test.js`) — 28 / 28 PASS, run via Node built-in test
  runner (`npm test`).
* **Smoke test** (`scripts/smoke-mission.js`) — drives the full demo
  mission through completion, asserts ≥ 18 acceptance events, 12
  artifacts, 6 checkpoints, 1 mission.completed, 1 approval.requested,
  and verifies Pi actually wrote `lesson.json` + `test.js` to a real
  sandbox with the expected bilingual content.

## Files

| Path | Purpose |
|---|---|
| `src/server.js` | Server entrypoint. Boots orchestrator, attaches gateway, registers demo mission, auto-launches. |
| `src/api/server.js` | Minimal HTTP server (no Express). |
| `src/api/gateway.js` | REST + SSE endpoints with idempotency. |
| `src/domain/adapter-contract.js` | JSDoc-typed AgentAdapter contract + event-type enums. |
| `src/domain/mission-fsm.js` | FSM transitions + assertions. |
| `src/domain/routing.js` | Capability-first task routing. |
| `src/store/event-store.js` | Append-only JSONL event store + SSE subscribers. |
| `src/store/artifact-store.js` | Versioned artifacts with sha256. |
| `src/orchestrator/orchestrator.js` | Mission state machine + adapter dispatch + acceptance. |
| `src/orchestrator/policy-engine.js` | Deny-by-default validation. |
| `src/orchestrator/approval-engine.js` | Audit-only approval requests + resolution. |
| `src/orchestrator/demo-mission.js` | The `examples/demo-mission.json` equivalent in JS. |
| `src/adapters/openai.js` | SIMULATED OpenAI adapter. |
| `src/adapters/hermes.js` | SIMULATED Hermes adapter. |
| `src/adapters/open-swarm.js` | SIMULATED Open Swarm adapter. |
| `src/adapters/pi.js` | REAL Pi adapter (the vertical slice). |
| `public/index.html` | Artifact Room UI (single page, vanilla JS). |
| `public/styles.css` | Dark-theme design system. |
| `public/app.js` | SSE subscriber + UI controller. |
| `scripts/build-app-bundle.js` | Builds `dist/Patrick OS.app`. |
| `scripts/build-dmg.js` | Builds `dist/Patrick OS-0.1.0.dmg`. |
| `scripts/build-dmg.sh` | Helper: hdiutil orchestration (single bash process). |
| `scripts/smoke-mission.js` | End-to-end smoke test. |
| `test/*.test.js` | Unit + integration tests. |