// Policy Engine — deny-by-default. Path / command / network / time / cost
// budgets. Each adapter declares its policy at startTask; the engine
// validates it before any execution.

export class PolicyViolation extends Error {
  constructor(violations) {
    super(`policy violation: ${violations.join("; ")}`);
    this.violations = violations;
  }
}

const HIGH_RISK_ACTIONS = [
  "external-message",
  "publish-public",
  "repo-push",
  "permission-change",
  "read-credential",
  "write-outside-workspace",
  "delete-data",
  "prod-operation",
  "paid-resource",
];

export function validatePolicy(workspace, policy, task) {
  const violations = [];

  // 1. Workspace present?
  if (!workspace || !workspace.root) {
    violations.push("workspace.manifest missing root");
  } else {
    // 2. Denied paths — if any task-side path is on the deny list, fail.
    if (Array.isArray(task.touchedPaths)) {
      for (const p of task.touchedPaths) {
        if (workspace.deniedPaths.some((d) => p.startsWith(d))) {
          violations.push(`touched path "${p}" matches deniedPaths`);
        }
      }
    }
    // 3. Allowed paths — must be subset of allowedPaths (unless allowWrites=false).
    if (policy.allowWrites && task.writesInside && !task.writesInside.startsWith(workspace.root)) {
      violations.push(`write target "${task.writesInside}" outside workspace root`);
    }
  }

  // 4. Network policy.
  if (task.networkCall && !policy.allowNetwork) {
    violations.push("network call requested but policy.allowNetwork=false");
  }
  if (task.networkCall && workspace && Array.isArray(task.networkCall.destinations)) {
    const denied = task.networkCall.destinations.filter(
      (d) => !workspace.networkDestinations.includes(d)
    );
    if (denied.length > 0) {
      violations.push(`network destinations denied: ${denied.join(", ")}`);
    }
  }

  // 5. Cost / token / time bounds.
  if (policy.maxCostUsd != null && task.estimatedCostUsd != null) {
    if (task.estimatedCostUsd > policy.maxCostUsd) {
      violations.push(`cost ${task.estimatedCostUsd} > max ${policy.maxCostUsd}`);
    }
  }
  if (task.timeoutMs != null && policy.timeoutMs != null) {
    if (task.timeoutMs > policy.timeoutMs) {
      violations.push(`timeout ${task.timeoutMs} > policy ${policy.timeoutMs}`);
    }
  }

  // 6. High-risk action requires approval profile.
  if (task.action && HIGH_RISK_ACTIONS.includes(task.action)) {
    if (!policy.approvalProfile || policy.approvalProfile === "auto-approve") {
      violations.push(`action "${task.action}" requires explicit approvalProfile`);
    }
  }

  // 7. No default home directory writes.
  if (
    task.writesInside &&
    (task.writesInside === "/Users" ||
      task.writesInside.startsWith("/Users/") && !task.writesInside.includes("/workspace/"))
  ) {
    // Allowed only if explicitly listed in workspace.allowedPaths.
    if (!workspace || !workspace.allowedPaths.some((p) => task.writesInside.startsWith(p))) {
      violations.push(`write to home-directory tree "${task.writesInside}" not in allowedPaths`);
    }
  }

  if (violations.length > 0) {
    throw new PolicyViolation(violations);
  }
  return { ok: true };
}