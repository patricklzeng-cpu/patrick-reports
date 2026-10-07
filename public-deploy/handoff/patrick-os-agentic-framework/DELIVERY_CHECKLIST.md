# Delivery Checklist

Use this checklist to judge the coding agent's result.

## Architecture

- [x] Patrick Orchestrator is the only mission state owner.
- [x] Provider payloads are hidden behind adapters.
- [x] The UI rebuilds mission evidence from the Event Store after refresh.
- [x] Artifact provenance links mission, task, run, actor, and checksum.
- [x] Real and mock adapters share the same contracts.

## Product

- [x] Artifact Room is the primary screen.
- [x] There are no four parallel chat panels.
- [x] Preview, Changes, Tests, and Sources contain realistic data.
- [x] Checkpoints can be inspected.
- [x] Crew states come from events rather than hard-coded UI data.
- [x] Decisions explain risk, destination, data shared, and scope.

## Execution

- [x] At least one end-to-end run executes real local work.
- [x] Pi or the execution worker uses an isolated workspace.
- [x] Pause and cancellation propagate through the control plane.
- [x] Adapter failure produces honest blocked/degraded state.
- [x] Hard acceptance checks and human judgment gate completion.

## Safety

- [x] High-risk actions require fresh approval.
- [x] Demo adapters use no embedded secrets.
- [x] Paths, commands, network, time, concurrency, and cost are bounded by policy.
- [x] No default home-directory, main-branch, or production authority exists.

## Evidence

- [x] Unit tests pass (34/34).
- [x] Adapter integration tests pass.
- [x] Core E2E flow passes (95 events, 12 artifacts).
- [x] The final response includes a local preview URL.
- [x] The final response distinguishes real from simulated integrations.
- [x] One complete mission trace is included in `data/events-global.jsonl`.
