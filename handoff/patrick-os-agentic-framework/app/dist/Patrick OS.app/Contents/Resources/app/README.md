# Patrick OS — Agentic Framework (macOS Desktop Build)

Patrick OS is one task control plane that coordinates four agents
(**OpenAI / Hermes / Open Swarm / Pi**) behind a single Artifact Room UI.
It ships as a native-feeling macOS `.app` bundle (and a `.dmg`
installer) that boots a local HTTP server, opens the Artifact Room in the
default browser, and runs the multilingual-education demo mission end-to-end.

This folder (`handoff/patrick-os-agentic-framework/app/`) is the
**Phase 1 deliverable** that implements the spec in
`handoff/patrick-os-agentic-framework/{MASTER_BUILD_PROMPT.md,
docs/, contracts/, examples/, assets/}`. The handoff package is the
specification; this folder is the implementation.

## TL;DR

```bash
cd handoff/patrick-os-agentic-framework/app

# Run from source
npm start
# → opens http://127.0.0.1:7331 with the Artifact Room

# Run the tests
npm test            # 28 / 28 pass
npm run smoke       # end-to-end demo mission

# Build the macOS bundle + installer
npm run build:app    # → dist/Patrick OS.app          (5.1 MB)
npm run build:dmg    # → dist/Patrick OS-0.1.0.dmg     (4.6 MB)

# Install
open dist/Patrick\ OS-0.1.0.dmg     # mounts → drag Patrick OS.app → Applications
open ~/Applications/Patrick\ OS.app  # double-click → server in Terminal.app → browser
```

## Non-negotiable product sentence

> Do not build four agent chat panels. Build an artifact-centered task
> operating system with an event log as its source of truth, approvals as
> its safety boundary, and replaceable adapters for every execution
> provider.

## What ships in this build

| Layer | Status | Notes |
|---|---|---|
| Event Store (JSONL, append-only) | ✅ real | `src/store/event-store.js` |
| Mission state machine (`draft→planning→…→completed`) | ✅ real | `src/domain/mission-fsm.js` |
| Adapter contract (TypeScript-style, ported to JS) | ✅ real | `src/domain/adapter-contract.js` |
| Mock OpenAI adapter (simulated) | 🟡 mock | `src/adapters/openai.js` — clearly labeled in `/api/adapters` |
| Mock Hermes adapter (simulated) | 🟡 mock | `src/adapters/hermes.js` — clearly labeled |
| Mock Open Swarm adapter (simulated) | 🟡 mock | `src/adapters/open-swarm.js` — clearly labeled |
| **Pi adapter (isolated, real)** | ✅ real | `src/adapters/pi.js` — actually creates files, runs a test, saves the artifact |
| API Gateway (REST + SSE) | ✅ real | `src/api/gateway.js` |
| Approval Engine | ✅ real | `src/orchestrator/approval-engine.js` |
| Artifact Store (sha256 + versioning) | ✅ real | `src/store/artifact-store.js` |
| Policy Engine (deny-by-default) | ✅ real | `src/orchestrator/policy-engine.js` |
| Artifact Room UI (single SPA) | ✅ real | `public/index.html` + `app.js` + `styles.css` |
| Mission timeline + crew relay + decisions rail | ✅ real | `public/app.js` |
| Projects / Memory / Approvals feedback views | ✅ event-backed | Reorganize the append-only mission trace |
| Live System Trace | ✅ real | Shows ChatGPT → Hermes → Open Swarm → Pi → Patrick handoffs |
| Mission rebuilds from events after refresh | ✅ real | SSE replays from `?after=0` |
| macOS `.app` bundle (double-clickable) | ✅ real | `npm run build:app` → `dist/Patrick OS.app` |
| `.dmg` installer (hdiutil-based, no extra deps) | ✅ real | `npm run build:dmg` → `dist/Patrick OS-0.1.0.dmg` |

The Pi adapter is the **one real vertical slice** required by
`MASTER_BUILD_PROMPT.md` §10 Phase C: it actually creates a file inside
`workspace/<missionId>/<taskId>/<attempt>/`, runs a Node test against
it, and saves the diff + test output as a versioned artifact.

## Architecture overview

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full responsibility
map and event-flow diagram. In one paragraph:

```
Artifact Room UI (single page, vanilla JS)
    ↕  REST + SSE
Patrick API Gateway
    ↓
Mission Orchestrator (state machine, approvals, routing)
    ↓
Adapters:  openai / hermes / open-swarm / pi  (all share AgentAdapter contract)
    ↓
Event Store  ←  source of truth (append-only JSONL)
    +  Artifact Store  +  Workspace Store  +  Trace Store
```

## Quick start (from source)

```bash
cd handoff/patrick-os-agentic-framework/app
npm start             # boots the server on http://127.0.0.1:7331
open http://127.0.0.1:7331    # macOS: opens the Artifact Room
```

The demo mission `mission-education-demo-001` boots automatically on
server start. The UI subscribes to the SSE event stream so refreshing the
browser does not lose state — the Event Store rebuilds everything.

## Quick start (macOS `.app` / `.dmg`)

```bash
cd handoff/patrick-os-agentic-framework/app
npm run build:app    # produces dist/Patrick OS.app
npm run build:dmg    # produces dist/Patrick OS-0.1.0.dmg
open dist/Patrick\ OS-0.1.0.dmg            # mounts → drag Patrick OS.app to /Applications
open ~/Applications/Patrick\ OS.app      # double-click → server in Terminal.app → browser
```

The `.app` bundle contains the full Node app under
`Contents/Resources/app/`. The `Patrick OS.command` launcher finds the
user's Node (`command -v node`, falling back to `/opt/homebrew/bin/node`,
`/usr/local/bin/node`), opens the Artifact Room in the default browser
after a 2 s delay so the server has time to boot, and runs the server
in Terminal.app so the user can see live logs and Ctrl-C cleanly.

The `.dmg` is built with the built-in macOS `hdiutil` (no brew, no
node-appdmg). It is a compressed UDZO read-only HFS+ image; mounting
it shows `Patrick OS.app` and an `Applications` symlink for drag-to-install UX.

## Tests

```bash
npm test           # unit + adapter integration (28 / 28 pass)
npm run smoke      # end-to-end: launch demo mission → wait for completion → verify events + artifacts
```

## Honest labels

OpenAI / Hermes / Open Swarm adapters are **simulated**. The Pi adapter
is **real** — it actually creates files, runs tests, and saves
artifacts. The UI clearly labels simulated capabilities so nothing is
misleading about what ran.

## Seeing how every system works

Send any refinement from the mission composer. Patrick OS immediately opens
the **System trace** tab and shows each handoff, adapter mode, task event,
artifact, memory write, and completion record. The same facts are reorganized
under:

- **Projects** — workspace, artifacts, checks, command history, and status.
- **Memory** — Hermes working-memory writes linked to command evidence.
- **Approvals** — risk, destination, data shared, affected paths, rollback,
  scope, and decision status.

## Definition of done (from MASTER_BUILD_PROMPT.md §12)

- ✅ one user interface supervises the mission (Artifact Room)
- ✅ no four-chat dashboard
- ✅ adapters are replaceable (all share `AgentAdapter` contract)
- ✅ mission state rebuilds from events (Event Store JSONL)
- ✅ refresh does not lose state (SSE replay)
- ✅ every run has a trace ID (uuid per adapter invocation)
- ✅ every artifact traces to task, run, and actor (`artifact.created` payload)
- ✅ pause / cancel works (`POST /api/missions/:id/{pause,cancel}`)
- ✅ adapter outage degrades correctly (mock adapters self-report; real adapter has health probe)
- ✅ Pi is isolated (sandbox per `<missionId>/<taskId>/<attempt>`)
- ✅ high-risk actions request approval (approval engine + UI decision card)
- ✅ failure never appears as completion (`task.failed` vs `mission.completed` distinct)
- ✅ hard acceptance checks gate completion (`_evaluateAcceptance()` reads Event Store)
- ✅ UI visually matches the selected Artifact Room direction (vanilla CSS dark theme, left nav / central artifact / right rail)
- ✅ no material console errors (verified by browser snapshot)
- ✅ unit, integration, and core E2E tests pass (`npm test` + `npm run smoke`)
- ✅ run commands + architecture documentation exist (this file + `ARCHITECTURE.md`)

## Known limitations (Phase 2 work)

* OpenAI / Hermes / Open Swarm adapters are SIMULATED — real adapters
  would call `api.openai.com` / Hermes desktop / `openswarm.dev`
  respectively. Replace the `startTask` body of each adapter to wire
  real provider calls; the contract is stable.
* Open Swarm's DAG runs tasks serially (3 Pi workers one after another).
  Real Open Swarm would fan them out in parallel; orchestrator's
  `_runTask` is already async-friendly, so the change is a one-line
  swap from `for` to `Promise.all`.
* Approval engine is audit-only. Approval IDs flow into the Event
  Store; the user resolves them via the UI. A future revision could
  integrate Twilio / email / iMessage to push approval prompts to
  Patrick's phone.
* Event Store is per-process in-memory + JSONL file. For multi-host
  production, swap to PostgreSQL append-only table behind the same
  interface (`src/store/event-store.js`).
* The `.app` bundle embeds a Node script that depends on the user's
  system Node 18+. The launcher falls back to `/opt/homebrew/bin/node`
  and `/usr/local/bin/node`. A future revision could embed a
  self-contained Node binary (~50 MB) for fully offline portability.
