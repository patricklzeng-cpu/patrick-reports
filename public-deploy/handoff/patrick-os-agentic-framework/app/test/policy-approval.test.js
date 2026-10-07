// Unit tests for Policy Engine + Approval Engine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePolicy, PolicyViolation } from "../src/orchestrator/policy-engine.js";
import { ApprovalEngine } from "../src/orchestrator/approval-engine.js";
import { EventStore } from "../src/store/event-store.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const baseWorkspace = {
  root: "/Users/me/project/workspace/m1",
  allowedPaths: ["/Users/me/project/workspace/m1/"],
  deniedPaths: ["/etc", "/System", "/var", "/private/etc", "/private/var"],
  availableTools: ["node"],
  allowedCommands: ["node --test"],
  networkDestinations: ["localhost"],
  memoryReferences: [],
  dataClassification: "internal",
};

const basePolicy = {
  approvalProfile: "default",
  maxCostUsd: 5.0,
  maxConcurrency: 4,
  allowNetwork: false,
  allowWrites: true,
  allowExternalSideEffects: false,
};

test("Policy accepts a normal in-workspace write", () => {
  const r = validatePolicy(baseWorkspace, basePolicy, {
    writesInside: baseWorkspace.root,
    touchedPaths: [baseWorkspace.root],
    timeoutMs: 30_000,
    networkCall: null,
  });
  assert.equal(r.ok, true);
});

test("Policy rejects network call when allowNetwork=false", () => {
  assert.throws(
    () => validatePolicy(baseWorkspace, basePolicy, {
      writesInside: baseWorkspace.root,
      networkCall: { destinations: ["api.openai.com"] },
    }),
    /network call requested/
  );
});

test("Policy rejects write outside workspace root", () => {
  assert.throws(
    () => validatePolicy(baseWorkspace, basePolicy, {
      writesInside: "/etc/passwd",
      touchedPaths: ["/etc/passwd"],
      timeoutMs: 30_000,
      networkCall: null,
    }),
    /outside workspace root/
  );
});

test("Policy rejects cost > maxCostUsd", () => {
  assert.throws(
    () => validatePolicy(baseWorkspace, basePolicy, {
      writesInside: baseWorkspace.root,
      timeoutMs: 30_000,
      estimatedCostUsd: 10.0,
      networkCall: null,
    }),
    /cost/
  );
});

test("Policy rejects high-risk action without approvalProfile", () => {
  assert.throws(
    () => validatePolicy(baseWorkspace, { ...basePolicy, approvalProfile: "auto-approve" }, {
      writesInside: baseWorkspace.root,
      action: "repo-push",
      timeoutMs: 30_000,
      networkCall: null,
    }),
    /explicit approvalProfile/
  );
});

test("PolicyViolation carries violations list", () => {
  try {
    validatePolicy(baseWorkspace, basePolicy, {
      writesInside: "/etc/passwd",
      touchedPaths: ["/etc/passwd"],
      networkCall: null,
    });
    assert.fail("expected PolicyViolation");
  } catch (err) {
    assert.ok(err instanceof PolicyViolation);
    assert.ok(Array.isArray(err.violations));
    assert.ok(err.violations.length > 0);
  }
});

test("ApprovalEngine creates pending requests and resolves them", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ap-test-"));
  const store = new EventStore(dataDir, "global");
  await store.ready();
  const engine = new ApprovalEngine(store);
  const r1 = await engine.request({
    missionId: "m1",
    action: "test",
    reason: "test",
    command: "x",
    destination: "y",
    dataShared: "z",
    affectedPaths: [],
    risk: "low",
    rollback: "none",
    scope: "once",
  });
  assert.equal(r1.status, "pending");
  assert.equal(engine.pending().length, 1);
  const resolved = await engine.resolve(r1.id, "approve", "looks good");
  assert.equal(resolved.status, "approved");
  assert.equal(resolved.note, "looks good");
  assert.equal(engine.pending().length, 0);
});

test("ApprovalEngine rejects unknown approval id", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ap-test-"));
  const store = new EventStore(dataDir, "global");
  await store.ready();
  const engine = new ApprovalEngine(store);
  await assert.rejects(() => engine.resolve("does-not-exist", "approve"));
});

test("ApprovalEngine cannot resolve same approval twice", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ap-test-"));
  const store = new EventStore(dataDir, "global");
  await store.ready();
  const engine = new ApprovalEngine(store);
  const r1 = await engine.request({
    missionId: "m1", action: "test", reason: "x", command: "x", destination: "y",
    dataShared: "z", affectedPaths: [], risk: "low", rollback: "none", scope: "once",
  });
  await engine.resolve(r1.id, "approve");
  await assert.rejects(() => engine.resolve(r1.id, "reject"), /already/);
});