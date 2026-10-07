# Architecture

## Responsibility map

| Component | Owns | Must not own |
|---|---|---|
| Patrick Orchestrator | Mission state machine, policies, acceptance, completion | Provider-specific execution |
| OpenAI Adapter | Planning, reasoning, review, synthesis | Local process control or final mission state |
| Hermes Adapter | Local context, memory references, environment, integration | Parallel workforce scheduling |
| Open Swarm Adapter | DAG scheduling, assignment, concurrency, retry recommendation | Mission objective or final acceptance |
| Pi Adapter | Isolated project execution and evidence | Global workspace access or production authority |
| Event Store | Ordered durable facts | Provider business logic |
| Artifact Store | Versioned outputs and provenance | Mission state transitions |
| Approval Engine | Human decisions and scope | Execution itself |

## Command flow

```text
User command
  -> API validates command and idempotency key
  -> Orchestrator evaluates policy and mission state
  -> Router selects capability
  -> Adapter translates common TaskSpec to provider request
  -> Provider emits adapter-normalized events
  -> Event Store appends events
  -> Projection updates mission read model
  -> SSE publishes event cursor to UI
  -> Artifact Room updates preview, crew, timeline, or decision
```

## Completion flow

```text
Worker reports success
  -> artifacts collected
  -> mechanical checks run
  -> review requested
  -> required approvals resolved
  -> acceptance projection evaluated
  -> Orchestrator emits mission.completed OR acceptance.failed
```

Worker self-report is never sufficient for completion.

## Storage boundaries

- Event Store: append-only mission facts.
- Read Model: derived current state, rebuildable.
- Artifact Store: immutable versions plus checksums.
- Secret Store: references only; never copied into events.
- Trace Store: timings, adapter calls, usage, redacted errors.
- Workspace Store: isolated run directories and worktrees.

## API surface

Minimum endpoints:

- `POST /api/missions`
- `GET /api/missions/:id`
- `POST /api/missions/:id/commands`
- `GET /api/missions/:id/events?after=`
- `GET /api/missions/:id/stream`
- `POST /api/missions/:id/pause`
- `POST /api/missions/:id/resume`
- `POST /api/missions/:id/cancel`
- `GET /api/missions/:id/artifacts`
- `GET /api/artifacts/:id`
- `GET /api/approvals`
- `POST /api/approvals/:id/resolve`
- `GET /api/adapters`
- `GET /api/health`

Mutating endpoints require idempotency keys.

## Recommended first vertical slice

Use one safe local repository and one Pi or process adapter. Generate a tiny file change, run one test, save its output as an artifact, emit the full event sequence, review it, and render it in Artifact Room. This proves the boundaries before connecting every provider.

