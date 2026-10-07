# Master Build Prompt

You are the Principal Engineer, Agent Systems Architect, and senior product engineer responsible for implementing **Patrick OS** in the target repository.

Patrick OS is one task control plane coordinating:

- OpenAI/ChatGPT
- Hermes
- Open Swarm
- Pi Coding Agent

The user must interact with one product surface. Do not iframe native apps and do not create four parallel chat columns. Integrate capabilities through replaceable adapters, a shared task protocol, a durable event stream, explicit approval gates, and a versioned artifact store.

The selected interface is **Artifact Room**, shown in `assets/artifact-room-option-3.png`.

## 1. Discover before changing

Before implementation:

1. Read every applicable `AGENTS.md`, the root README, package manifests, and architecture documents.
2. Inspect existing Agentic OS, Mission Control, dashboard, Hermes, swarm, Pi, MCP, task, log, memory, approval, and artifact implementations.
3. Run the existing app and relevant tests.
4. Preserve all user changes and existing experiments.
5. Prefer existing components and conventions over a rewrite.
6. Probe actual integration surfaces before assuming them: `--help`, `--version`, health endpoints, MCP `tools/list`, RPC, SDK, JSON, and JSONL modes.
7. Report `Current State`, `Reusable Components`, `Missing Pieces`, and `Implementation Plan`, then continue unless a genuinely blocking permission or architectural choice is required.

## 2. Single control-plane rule

Patrick Orchestrator is the only owner of mission state.

- OpenAI: intent, structured planning, difficult judgment, conflict resolution, and final review.
- Hermes: local context, memory references, environment discovery, and artifact integration.
- Open Swarm: dependency-aware scheduling and parallel worker allocation.
- Pi: isolated project execution, code changes, builds, and tests.

No adapter may independently mark a mission complete. Patrick Orchestrator may complete it only after required acceptance checks pass.

## 3. Required system shape

```text
Artifact Room UI
       |
Patrick API Gateway
       |
Mission Orchestrator
       |
       +-- OpenAIAdapter
       +-- HermesAdapter
       +-- OpenSwarmAdapter
       +-- PiAdapter
       |
       +-- Event Store
       +-- Artifact Store
       +-- Approval Engine
       +-- Policy Engine
       +-- Memory Index
       +-- Trace and Usage Store
```

UI code must depend only on Patrick APIs and shared schemas. Provider-specific payloads stop at adapter boundaries.

## 4. Build the Artifact Room

Match the supplied visual target while respecting the repository's existing design system.

### Left navigation

- Today
- Missions
- Projects
- Memory
- Approvals
- Patrick OS identity
- local privacy state
- system health

### Central room

- mission title and objective
- acceptance progress
- pause, resume, and cancel
- natural-language command/refinement composer
- Preview, Changes, Tests, and Sources tabs
- live artifact preview
- branch, commit, and test evidence
- checkpoint scrubber: Plan, Context, Parallel Build, Integration, Review
- checkpoint inspection with actor, change, artifact version, and timestamp

The artifact is the visual center. Agent activity is supporting evidence.

### Crew and Decisions

Show the four capabilities as one relay with responsibility, current state, heartbeat, latest output, next handoff, duration, and usage when available.

Show only decisions that require human judgment. Every approval must explain action, reason, command/tool, destination, data shared, risk, reversibility, and scope.

## 5. Shared protocol

Use `contracts/agentic-protocol.schema.json` and `contracts/adapter-contract.ts` as the starting contract. Adapt them to the repository language without weakening these guarantees:

- versioned schemas
- durable ordered events
- idempotency keys
- trace IDs
- task/run/artifact provenance
- resumable event cursors
- structured errors
- bounded retries
- explicit cancellation

Mission states:

`draft -> planning -> awaiting_approval -> queued -> running -> blocked -> reviewing -> completed|failed|cancelled`

## 6. Adapter requirements

Every adapter implements:

- health probe
- capability discovery
- task start
- event streaming
- cancellation
- artifact collection
- usage reporting when possible
- timeout
- structured error mapping
- redacted logging
- mock implementation
- integration test

### OpenAIAdapter

Use the current supported OpenAI agent/API surface available in the target environment. Keep model selection configurable. Planning and reviews must use structured output. Tool requests must pass through Patrick's Tool Gateway and Policy Engine.

If implementing a ChatGPT surface, expose narrow Patrick tools through an MCP server and render a compact task/artifact widget. It must use the same Mission API and must not create a second state store.

Do not attempt to control or iframe the ChatGPT native app.

### HermesAdapter

Hermes is the local steward, not another orchestrator. It discovers approved project paths, environment capabilities, relevant files, local services, and memory references. It produces a `WorkspaceManifest` and integrates artifacts.

Integration priority: supported HTTP/MCP/RPC -> structured JSON CLI -> JSONL wrapper -> text parsing as last resort.

Never assume unrestricted or `--yolo` operation. Do not expose the full home directory.

### OpenSwarmAdapter

Open Swarm receives an approved DAG, capabilities, dependencies, concurrency, budget, workspace references, and retry policy. It returns assignments and scheduling events. It may reschedule tasks but cannot change the mission objective, bypass approvals, or announce final completion.

If no stable API exists, isolate the real CLI/RPC behind the adapter facade and retain a mock implementation.

### PiAdapter

Each run executes inside:

`workspaces/{missionId}/{taskId}/{attempt}/`

For code, prefer a dedicated git worktree and task branch. Give Pi only the task spec, applicable `AGENTS.md`, acceptance checks, allowed paths/tools/commands, network policy, timeout, artifact references, and scoped credentials.

Pi must emit structured events, changed files, diff, commands, tests, artifacts, risks, and final status. It must not access the entire home directory, push main, operate production, or retry forever.

## 7. Routing

Route by capability, data sensitivity, locality, duration, parallelism, cost, latency, and availability—not by a hard-coded agent name.

Defaults:

- reasoning/research/product judgment -> OpenAI
- local discovery/context -> Hermes
- single-repository execution -> Hermes context, then Pi
- parallel execution -> approved plan, Open Swarm, multiple Pi workers
- cross-repository work -> Hermes discovery, Open Swarm, isolated Pi worktrees
- final quality review -> OpenAI
- local-private work -> Hermes plus approved local provider
- scheduled maintenance -> Hermes trigger, then Pi
- publishing/external writes -> approval, then adapter

## 8. Safety

Implement a deny-by-default policy engine using `docs/SECURITY_AND_APPROVALS.md`.

High-risk actions always require a fresh approval: external messages, public publishing, repository push, permission changes, credential access, home-directory writes, destructive actions, production operations, and paid resource creation.

Store secret references, never secret values. Redact logs. Enforce allowed paths, commands, network destinations, duration, concurrency, and spend.

## 9. Persistence and reliability

The Event Store is the source of truth. Refreshing the UI or restarting a process must not lose mission state.

Use the existing stack when possible. Otherwise prefer TypeScript, React/Next.js, SQLite for development behind a PostgreSQL-compatible repository boundary, SSE for one-way event streaming, and local filesystem artifact storage with database metadata.

Implement:

- idempotent commands
- durable task queue
- task lease and heartbeat
- stale-worker detection
- cancellation propagation
- retryable/non-retryable classification
- exponential backoff with limits
- partial artifact preservation
- crash recovery
- event cursor reconnect
- graceful degradation

Degradation behavior:

- OpenAI down -> local/manual planning
- Hermes down -> block local-context operations honestly
- Open Swarm down -> serial queue
- Pi down -> retain queued/blocked tasks
- UI down -> background run continues and events replay on return

## 10. Implementation order

### Phase A — Foundation

Domain model, schemas, Event Store, mission state machine, adapter interface, mock adapters, API, ADR.

### Phase B — Artifact Room

Selected UI, artifact preview, crew relay, decisions, checkpoint timeline, SSE, mock mission.

### Phase C — Real vertical slice

`goal -> mission -> task -> isolated Pi run -> file change -> test -> artifact -> review -> UI`

### Phase D — Hermes

Workspace discovery, manifest, environment health, local context, artifact integration.

### Phase E — Open Swarm

DAG, concurrency, dependencies, worker states, result aggregation.

### Phase F — OpenAI

Structured planning, revision, conflict resolution, review, final acceptance summary.

### Phase G — Hardening

Approvals, budgets, redaction, cancellation, recovery, traces, end-to-end tests.

Do not expand horizontally until Phase C proves the architecture.

## 11. Required demo

Implement `examples/demo-mission.json`: **Launch the multilingual education demo**.

The flow must show:

1. structured plan and six acceptance checks
2. Hermes workspace/material discovery
3. Open Swarm dispatching Web, iPad, and visionOS workstreams
4. isolated Pi workers
5. artifact integration and tests
6. Artifact Room preview
7. five checkpoints
8. a translation-meaning conflict requiring human judgment
9. final review
10. completion only after hard acceptance gates pass

Mocks must use exactly the same contracts as real adapters. Clearly label simulated capabilities. At least one Pi or safe local-command vertical slice must be real.

## 12. Definition of done

- one user interface supervises the mission
- no four-chat dashboard
- adapters are replaceable
- mission state rebuilds from events
- refresh does not lose state
- every run has a trace ID
- every artifact traces to task, run, and actor
- pause/cancel works
- adapter outage degrades correctly
- Pi is isolated
- high-risk actions request approval
- failure never appears as completion
- hard acceptance checks gate completion
- UI visually matches the selected Artifact Room direction
- no material console errors
- unit, integration, and core E2E tests pass
- run commands and architecture documentation exist

## 13. Final handoff

Return:

1. architecture summary
2. changed files
3. run instructions
4. test evidence
5. clickable local preview
6. real versus simulated integrations
7. unresolved risks
8. next phase
9. Artifact Room screenshot
10. one full mission trace from goal to artifact

Act autonomously inside scope. Do not fake success. Probe unknown interfaces. Preserve existing work. Ask only when a missing permission or decision would materially alter the architecture.

