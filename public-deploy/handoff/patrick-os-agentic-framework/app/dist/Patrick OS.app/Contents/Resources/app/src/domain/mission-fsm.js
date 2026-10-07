// Mission finite-state machine. The single owner of mission state is the
// Patrick Orchestrator; no adapter may mark a mission complete on its own.
//
// States: draft -> planning -> awaiting_approval -> queued -> running
//         -> blocked -> reviewing -> completed | failed | cancelled

import { MISSION_STATUSES } from "./adapter-contract.js";

export const MISSION_TRANSITIONS = Object.freeze({
  draft: new Set(["planning", "cancelled"]),
  planning: new Set(["awaiting_approval", "queued", "failed", "cancelled"]),
  awaiting_approval: new Set(["queued", "cancelled", "failed"]),
  queued: new Set(["running", "cancelled", "failed"]),
  running: new Set(["blocked", "reviewing", "completed", "failed", "cancelled"]),
  blocked: new Set(["running", "failed", "cancelled"]),
  reviewing: new Set(["completed", "failed", "running"]),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
});

export function canTransition(from, to) {
  if (!MISSION_STATUSES.includes(from)) return false;
  if (!MISSION_STATUSES.includes(to)) return false;
  const allowed = MISSION_TRANSITIONS[from];
  return allowed ? allowed.has(to) : false;
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(
      `Illegal mission transition: ${from} -> ${to}. ` +
        `Allowed: [${[...MISSION_TRANSITIONS[from]].join(", ") || "(terminal)"}]`
    );
  }
}

export function isTerminal(state) {
  return state === "completed" || state === "failed" || state === "cancelled";
}

export function isActive(state) {
  return !isTerminal(state);
}