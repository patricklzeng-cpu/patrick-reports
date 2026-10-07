// Routing rules — given a task, decide which adapter handles it.
// "Route by capability, data sensitivity, locality, duration, parallelism,
//  cost, latency, and availability — not by a hard-coded agent name."
// (MASTER_BUILD_PROMPT.md §7)

const ROUTING_TABLE = [
  {
    adapter: "openai",
    match: (t) => /plan|review|synthesis|reasoning|conflict|judg/i.test(`${t.title} ${t.role}`),
    risk: "low",
  },
  {
    adapter: "hermes",
    match: (t) => /discover|context|workspace|integrate|local|memory/i.test(`${t.title} ${t.role}`),
    risk: "low",
  },
  {
    adapter: "open-swarm",
    match: (t) => /schedule|dispatch|fan[- ]?out|parallel|DAG|coordinate/i.test(`${t.title} ${t.role}`),
    risk: "low",
  },
  {
    adapter: "pi",
    match: (t) => /build|test|run|execute|implement|ship/i.test(`${t.title} ${t.role}`),
    risk: "medium",
  },
];

export function pickAdapter(task) {
  for (const rule of ROUTING_TABLE) {
    if (rule.match(task)) return { adapterId: rule.adapter, risk: rule.risk };
  }
  // Default: Pi (it can do anything, but be conservative — go through OpenAI
  // for tasks that don't match an obvious pattern).
  return { adapterId: task.role || "pi", risk: "medium" };
}

export function approvalRequired(risk, policy) {
  // High-risk actions always require a fresh approval.
  if (risk === "high") return true;
  // External side-effects always require approval regardless of risk label.
  if (policy && policy.allowExternalSideEffects) return true;
  return false;
}