# Patrick OS — Agentic Framework Handoff

This package contains both the implementation brief and a runnable vertical
slice of a unified personal Agentic OS coordinating OpenAI/ChatGPT, Hermes,
Open Swarm, and Pi.

## Run the finished prototype

```bash
cd app
npm start
open http://127.0.0.1:7331
```

Or open `app/dist/Patrick OS-0.1.0.dmg` on macOS. The source requires Node.js
18 or newer and has no npm runtime dependencies.

## Give this package to a coding agent

1. Attach the entire folder or the ZIP archive.
2. Tell the agent: **Read `MASTER_BUILD_PROMPT.md` first, then execute it against the target repository.**
3. Also provide the target repository if it is not already in the agent's workspace.
4. Require the agent to preserve existing changes and prove one real end-to-end vertical slice before expanding scope.

## Reading order

1. `MASTER_BUILD_PROMPT.md` — authoritative execution prompt.
2. `docs/PRODUCT_BRIEF.md` — product behavior and selected Artifact Room UX.
3. `docs/ARCHITECTURE.md` — component boundaries and responsibility model.
4. `docs/SECURITY_AND_APPROVALS.md` — permission and isolation rules.
5. `contracts/adapter-contract.ts` — common adapter API.
6. `contracts/agentic-protocol.schema.json` — portable event and domain schema.
7. `examples/demo-mission.json` — required demonstration mission.
8. `assets/artifact-room-option-3.png` — selected visual target.

## Non-negotiable product sentence

> Do not build four agent chat panels. Build an artifact-centered task operating system with an event log as its source of truth, approvals as its safety boundary, and replaceable adapters for every execution provider.

## Implemented vertical slice

The included app proves this working vertical slice:

`goal -> plan -> task -> isolated Pi run -> artifact -> test -> review -> Artifact Room`

OpenAI, Hermes, and Open Swarm are currently honest simulated adapters. Pi is
the real local execution slice: it writes isolated project files, runs tests,
and records versioned artifact evidence.
