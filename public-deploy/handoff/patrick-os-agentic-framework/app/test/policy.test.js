import test from "node:test";
import assert from "node:assert/strict";
import { validatePolicy, PolicyViolation } from "../src/orchestrator/policy-engine.js";

const workspace = {
  root: "/tmp/patrick-os/workspace/mission-1",
  allowedPaths: ["/tmp/patrick-os/workspace/mission-1"],
  deniedPaths: ["/etc", "/System"],
  networkDestinations: ["localhost"],
};

test("policy accepts a bounded local task", () => {
  assert.deepEqual(validatePolicy(workspace, {
    allowWrites: true,
    allowNetwork: false,
    maxCostUsd: 2,
    approvalProfile: "explicit",
  }, {
    writesInside: "/tmp/patrick-os/workspace/mission-1/task-a",
    touchedPaths: ["/tmp/patrick-os/workspace/mission-1/task-a"],
    estimatedCostUsd: 0,
  }), { ok: true });
});

test("policy blocks denied paths and unapproved network", () => {
  assert.throws(() => validatePolicy(workspace, {
    allowWrites: true,
    allowNetwork: false,
    approvalProfile: "explicit",
  }, {
    writesInside: "/tmp/patrick-os/workspace/mission-1/task-a",
    touchedPaths: ["/etc/passwd"],
    networkCall: { destinations: ["api.example.com"] },
  }), PolicyViolation);
});

