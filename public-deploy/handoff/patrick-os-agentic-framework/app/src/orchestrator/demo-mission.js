// Demo mission — ported from examples/demo-mission.json to a JS record.
// This is the mission that boots automatically on server start.

import crypto from "node:crypto";

export function buildDemoMission() {
  return {
    schemaVersion: "1.0.0",
    id: "mission-education-demo-001",
    title: "Launch the multilingual education demo",
    objective:
      "Deliver a classroom-ready bilingual education demo with validated content, reproducible sources, and working Web, iPad, and visionOS builds.",
    status: "draft",
    priority: "high",
    policyProfile: "local-development-with-publish-approval",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    acceptanceCriteria: [
      {
        id: "ac-web",
        statement: "Web demo loads and the primary lesson flow works.",
        required: true,
        status: "pending",
      },
      {
        id: "ac-ipad",
        statement: "iPad target builds and launches in the approved simulator.",
        required: true,
        status: "pending",
      },
      {
        id: "ac-vision",
        statement: "visionOS target builds and loads the lesson scene.",
        required: true,
        status: "pending",
      },
      {
        id: "ac-bilingual",
        statement: "English and Chinese lesson content preserve the same educational meaning.",
        required: true,
        status: "pending",
      },
      {
        id: "ac-tests",
        statement: "Required automated tests pass with zero critical failures.",
        required: true,
        status: "pending",
      },
      {
        id: "ac-sources",
        statement: "Claims and assets include reproducible source references.",
        required: true,
        status: "pending",
      },
    ],
    plannedTasks: [
      { id: "task-plan", role: "openai", title: "Create structured plan and review rubric" },
      { id: "task-context", role: "hermes", title: "Discover project, assets, tools, and approved paths", dependencies: ["task-plan"] },
      { id: "task-schedule", role: "open-swarm", title: "Create and schedule platform DAG", dependencies: ["task-context"] },
      { id: "task-web", role: "pi", title: "Build and test Web lesson", dependencies: ["task-schedule"] },
      { id: "task-ipad", role: "pi", title: "Build and test iPad lesson", dependencies: ["task-schedule"] },
      { id: "task-vision", role: "pi", title: "Build and test visionOS lesson", dependencies: ["task-schedule"] },
      { id: "task-integrate", role: "hermes", title: "Integrate platform artifacts and translation evidence", dependencies: ["task-web", "task-ipad", "task-vision"] },
      { id: "task-review", role: "openai", title: "Review artifacts against all hard acceptance gates", dependencies: ["task-integrate"] },
    ],
    requiredDecision: {
      action: "Resolve meaning-changing translations",
      risk: "high",
      choices: ["compare", "accept-safer-wording", "ask-agent"],
      default: "no-action",
    },
    checkpoints: ["Plan", "Context", "Parallel Build", "Integration", "Review"],
  };
}