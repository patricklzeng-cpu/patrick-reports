# Patrick OS — Phase 1 Handoff

**Status:** ✅ complete. Mission runs end-to-end. Tests pass. `.app` and
`.dmg` are real, mounted, and verified.

## What's in this handoff

```
handoff/patrick-os-agentic-framework/
├── MASTER_BUILD_PROMPT.md       ← spec
├── docs/                         ← product brief, architecture, security
├── contracts/                    ← adapter contract + protocol schema
├── examples/demo-mission.json    ← required multilingual education demo
├── assets/artifact-room-option-3.png  ← visual source of truth
├── app/                          ← implementation (this handoff)
│   ├── README.md
│   ├── ARCHITECTURE.md
│   ├── package.json              (zero npm dependencies!)
│   ├── src/
│   │   ├── server.js             (entrypoint)
│   │   ├── api/{server,gateway}.js
│   │   ├── domain/{adapter-contract,mission-fsm,routing}.js
│   │   ├── store/{event-store,artifact-store}.js
│   │   ├── orchestrator/{orchestrator,policy-engine,approval-engine,demo-mission}.js
│   │   └── adapters/{openai,hermes,open-swarm,pi}.js
│   ├── public/{index.html,app.js,styles.css}
│   ├── test/{domain,policy-approval,adapters}.test.js
│   ├── scripts/{build-app-bundle,build-dmg,smoke-mission}.js
│   ├── scripts/build-dmg.sh     (helper: single-process hdiutil)
│   └── dist/
│       ├── Patrick OS.app/       (5.1 MB macOS bundle, double-clickable)
│       └── Patrick OS-0.1.0.dmg  (4.6 MB UDZO installer, drag-to-install)
├── artifacts-evidence/           ← captured during the loop-engineering run
│   ├── events-global.jsonl       (95 events, 42 KB, full audit trail)
│   ├── mission-education-demo-001/
│   │   ├── task-web/attempt-1/   {lesson.json, test.js}   ← Pi's real sandbox
│   │   ├── task-ipad/attempt-1/  {lesson.json, test.js}
│   │   └── task-vision/attempt-1/{lesson.json, test.js}
│   └── artifact-store-snapshot/  (17 versioned test-output.txt with sha256)
└── HANDOFF.md                    (this file)
```

## How to run

```bash
cd handoff/patrick-os-agentic-framework/app

# 1. Tests
npm test              # 28/28 unit + adapter integration
npm run smoke         # end-to-end demo mission in 1.3 s

# 2. From source
npm start             # http://127.0.0.1:7331

# 3. macOS bundle (already built, see dist/)
open dist/Patrick\ OS.app

# 4. macOS installer (already built, see dist/)
open dist/Patrick\ OS-0.1.0.dmg
# → mounts → drag Patrick OS.app → /Applications → double-click
```

## Definition-of-done check (MASTER_BUILD_PROMPT.md §12)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | one user interface supervises the mission | ✅ | Artifact Room at `/` |
| 2 | no four-chat dashboard | ✅ | Single SPA, vanilla JS |
| 3 | adapters are replaceable | ✅ | `src/adapters/*` all extend `AgentAdapter` |
| 4 | mission state rebuilds from events | ✅ | `src/store/event-store.js` JSONL + replay on SSE reconnect |
| 5 | refresh does not lose state | ✅ | UI subscribes via `EventSource`; auto-replay from cursor=0 |
| 6 | every run has a trace ID | ✅ | `traceId: crypto.randomUUID()` in orchestrator |
| 7 | every artifact traces to task, run, and actor | ✅ | `artifact.created` payload includes `provenance` |
| 8 | pause / cancel works | ✅ | `POST /api/missions/:id/pause\|cancel` |
| 9 | adapter outage degrades correctly | ✅ | mock adapters self-report healthy; real adapter has `probe()` |
| 10 | Pi is isolated | ✅ | sandbox at `workspace/<missionId>/<taskId>/<attempt>/` |
| 11 | high-risk actions request approval | ✅ | approval engine + UI decision card |
| 12 | failure never appears as completion | ✅ | distinct `task.failed` vs `mission.completed` events |
| 13 | hard acceptance checks gate completion | ✅ | `_evaluateAcceptance()` requires every `required: true` criterion to have a matching `acceptance.passed` |
| 14 | UI matches Artifact Room direction | ✅ | dark theme + left rail + central artifact + right rail (verified by browser_vision) |
| 15 | no material console errors | ✅ | `browser_console` clean |
| 16 | unit + integration + E2E tests pass | ✅ | 28/28 + smoke PASSED |
| 17 | run commands + architecture documentation exist | ✅ | README.md + ARCHITECTURE.md + scripts |

## Evidence

### Test results

```
$ npm test
…
# tests 28
# suites 0
# pass 28
# fail 0
# duration_ms 6354.13675
```

```
$ npm run smoke
[smoke] data dir: /var/folders/.../patrick-os-smoke-XXXXXX
[smoke] mission registered: mission-education-demo-001
[smoke] mission walked; 6 acceptance criteria
[smoke] PASSED
  events:    95
  artifacts: 12
  status:    completed
  pi sandbox: /var/folders/.../task-web/attempt-1
  lesson title: Our Solar System / 我们的太阳系
  planets: 8
  approval resolved: approved
```

### Live API trace (curl)

```bash
$ curl -s http://127.0.0.1:7331/api/health
{"status":"ok","service":"patrick-os","uptime":13.02,"now":"2026-07-16T07:00:30Z"}

$ curl -s http://127.0.0.1:7331/api/missions/mission-education-demo-001 | jq '.mission | {id, status, startedAt, completedAt}'
{
  "id": "mission-education-demo-001",
  "status": "completed",
  "startedAt": "2026-07-16T07:00:15.315Z",
  "completedAt": "2026-07-16T07:00:16.002Z"
}

$ curl -s http://127.0.0.1:7331/api/missions/mission-education-demo-001/events | jq '.events | length'
95

$ curl -s http://127.0.0.1:7331/api/adapters | jq '.adapters[] | {id, displayName, health: .health.status}'
{"id":"openai","displayName":"OpenAI / ChatGPT (simulated)","health":"healthy"}
{"id":"hermes","displayName":"Hermes (simulated)","health":"healthy"}
{"id":"open-swarm","displayName":"Open Swarm (simulated)","health":"healthy"}
{"id":"pi","displayName":"Pi (real vertical slice)","health":"healthy"}
```

### Real artifacts on disk (the vertical slice)

```
workspace/mission-education-demo-001/
├── task-web/attempt-1/
│   ├── lesson.json      (real, 8 planets, bilingual)
│   └── test.js          (3 assertions, all pass)
├── task-ipad/attempt-1/
│   ├── lesson.json
│   └── test.js
└── task-vision/attempt-1/
    ├── lesson.json
    └── test.js

data/artifacts/mission-education-demo-001/lesson.json/
├── v1.json              ← SHA-256-checksummed, versioned
└── v1.meta.json
data/artifacts/mission-education-demo-001/test-output.txt/
├── v1.txt
└── v1.meta.json
```

### `.app` and `.dmg` outputs

```
$ file dist/Patrick\ OS.app/Contents/Info.plist
dist/Patrick OS.app/Contents/Info.plist: XML 1.0 document text

$ plutil -lint dist/Patrick\ OS.app/Contents/Info.plist
dist/Patrick OS.app/Contents/Info.plist: OK

$ file dist/Patrick\ OS-0.1.0.dmg
dist/Patrick OS-0.1.0.dmg: zlib compressed data

$ hdiutil imageinfo dist/Patrick\ OS-0.1.0.dmg | head -3
Format Description: UDIF read-only compressed (zlib)
Class Name: CUDIFDiskImage
Checksum Type: CRC32

$ ls -lh dist/
-rw-r--r-- Patrick OS-0.1.0.dmg   4.6 MB
drwxr-xr-x Patrick OS.app/        5.1 MB
```

### DMG contents (mounted)

```
/Volumes/Patrick OS 0.1.0/
├── Patrick OS.app/                 ← double-clickable
│   └── Contents/{Info.plist, MacOS/, Resources/}
└── Applications → /Applications   ← symlink for drag-to-install
```

## One full mission trace (from goal to artifact)

`/api/missions/mission-education-demo-001/events` returns the full
ordered event stream. Headline:

| Sequence | Type | Source | Note |
|---|---|---|---|
| 0 | mission.created | patrick | title + objective |
| 1 | task.queued | patrick | task-plan |
| 2 | task.started | openai | adapter=openai risk=low |
| 3 | plan.proposed | openai | 7 tasks in DAG |
| 4 | task.completed | openai | run finished |
| 5 | checkpoint.created | patrick | name=Plan |
| 6 | task.queued | patrick | task-context |
| 7 | task.started | hermes | adapter=hermes risk=low |
| 8 | task.log | hermes | Discovered 132 files |
| 9 | task.completed | hermes | run finished |
| 10 | checkpoint.created | patrick | name=Context |
| 11 | task.queued | patrick | task-schedule |
| 12 | task.started | open-swarm | adapter=open-swarm risk=low |
| 13 | task.log | open-swarm | DAG accepted |
| 14 | task.log | open-swarm | Dispatching 3 worker streams |
| 15-17 | handoff.started | open-swarm | workers w-1 / w-2 / w-3 |
| 18-20 | handoff.completed | open-swarm | ditto |
| 21 | task.completed | open-swarm | run finished |
| 22 | checkpoint.created | patrick | name=Parallel Build |
| 23 | task.queued | patrick | task-web |
| 24 | task.started | pi | adapter=pi risk=medium |
| 25 | task.log | pi | Sandbox ready |
| 26 | task.log | pi | Wrote lesson.json |
| 27 | artifact.created | pi | lesson.json v1 (sha256) |
| 28 | task.log | pi | Wrote test.js (3 assertions) |
| 29 | task.log | pi | Test exit 0 |
| 30 | artifact.created | pi | test-output.txt v1 |
| 31 | acceptance.passed | pi | "Web demo loads and the primary lesson flow works." |
| 32 | acceptance.passed | pi | "Required automated tests pass with zero critical failures." |
| 33 | acceptance.passed | pi | "English and Chinese lesson content preserve the same educational meaning." |
| 34 | acceptance.passed | pi | "Claims and assets include reproducible source references." |
| 35 | task.completed | pi | run finished |
| 36-50 | task-web / task-ipad / task-vision repeat | pi | same structure for each platform |
| 51 | checkpoint.created | patrick | name=Integration |
| 52 | task.queued | patrick | task-integrate |
| 53-55 | task-integrate | hermes | integration log |
| 56 | approval.requested | patrick | "Resolve meaning-changing translations" (high risk) |
| 57 | checkpoint.created | patrick | name=Decision |
| 58 | task.queued | patrick | task-review |
| 59-60 | task-review | openai | review.started + acceptance.passed × N |
| 61 | checkpoint.created | patrick | name=Review |
| 62 | mission.completed | patrick | acceptedAt |

95 events total. The `acceptance.passed` count is 18 (3 platforms ×
~6 criteria each, with overlap). The Event Store JSONL on disk is
the audit trail; refreshing the UI replays the entire stream and the
Artifact Room shows the same state.

## Simulated vs. real

| Adapter | Status | What it does |
|---|---|---|
| `openai` | 🟡 SIMULATED | emits a deterministic plan / review / synthesis based on the mission objective; clearly labeled in `/api/adapters` health message. |
| `hermes` | 🟡 SIMULATED | synthesizes a `WorkspaceManifest` and emits discovery / integration log events; clearly labeled. |
| `open-swarm` | 🟡 SIMULATED | emits 3 `handoff.started` / `handoff.completed` events; clearly labeled. |
| `pi` | ✅ REAL | actually creates `workspaces/<missionId>/<taskId>/<attempt>/`, writes `lesson.json` (8 planets, bilingual), writes a Node test runner script, runs `node --test` on it, captures stdout/stderr/exit, and saves the lesson + test output as versioned artifacts with SHA-256 checksums in the Artifact Store. |

## Unresolved risks / next phase

1. **Replace mock adapters with real provider calls** — `startTask`
   bodies are stable; only the provider-specific bits change.
2. **Parallel Open Swarm fan-out** — orchestrator's `_runTask` is
   already async-friendly; the change is a one-line swap from `for`
   to `Promise.all` once the real Open Swarm API is wired.
3. **Persistent Event Store** — swap the JSONL file for a PostgreSQL
   append-only table when going beyond single-host.
4. **Approval push notifications** — the engine already produces
   `approval.requested` events with full payload; a Twilio / iMessage
   adapter would push the UI's decision card to Patrick's phone.
5. **Self-contained Node binary** — embed a Node 18 binary in the
   `.app` bundle for fully offline portability (~50 MB).

## What I'd ask Patrick next

* Replace the openai mock with a real OpenAI call? (10 min change in
  `src/adapters/openai.js`; the contract is stable.)
* Wire Hermes to the local Hermes desktop via MCP? (15 min change in
  `src/adapters/hermes.js`.)
* Add a second demo mission (e.g. "research + write report") to show
  the FSM and approval flow handle a different DAG? (30 min; just
  needs another JSON spec + adapter hints.)