// Approval Engine — tracks every approval request, enforces high-risk
// gating, exposes them through the API. Approvals are append-only audit
// records; once resolved they cannot be reopened.

import crypto from "node:crypto";

export class ApprovalEngine {
  /**
   * @param {import("../store/event-store.js").EventStore} store
   */
  constructor(store) {
    this.store = store;
    this.requests = new Map(); // id -> {id, status, payload, decision, createdAt, resolvedAt}
    this.waiters = new Map();
  }

  /**
   * @param {Object} payload
   * @param {string} payload.action
   * @param {string} payload.reason
   * @param {string} payload.command
   * @param {string} payload.destination
   * @param {string} payload.dataShared
   * @param {string[]} payload.affectedPaths
   * @param {"low"|"medium"|"high"} payload.risk
   * @param {string} payload.rollback
   * @param {"once"|"current-mission"} payload.scope
   * @returns {Promise<{id: string, status: "pending"}>}
   */
  async request(payload) {
    const id = crypto.randomUUID();
    const req = {
      id,
      status: "pending",
      payload: {
        ...payload,
        expiry: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      decision: null,
    };
    this.requests.set(id, req);
    await this.store.append({
      missionId: payload.missionId || "unknown",
      type: "approval.requested",
      severity: payload.risk === "high" ? "warning" : "info",
      source: "patrick",
      payload: {
        approvalId: id,
        ...payload,
      },
    });
    return { id, status: "pending" };
  }

  waitForDecision(id, timeoutMs = 15 * 60 * 1000) {
    const current = this.requests.get(id);
    if (!current) return Promise.reject(new Error(`approval ${id} not found`));
    if (current.status !== "pending") return Promise.resolve(current);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id);
        reject(new Error(`approval ${id} expired`));
      }, timeoutMs);
      timer.unref?.();
      this.waiters.set(id, { resolve, timer });
    });
  }

  /**
   * @param {string} id
   * @param {"approve"|"reject"} decision
   * @param {string=} note
   */
  async resolve(id, decision, note = "") {
    const req = this.requests.get(id);
    if (!req) throw new Error(`approval ${id} not found`);
    if (req.status !== "pending") throw new Error(`approval ${id} already ${req.status}`);
    req.status = decision === "approve" ? "approved" : "rejected";
    req.decision = decision;
    req.note = note;
    req.resolvedAt = new Date().toISOString();
    await this.store.append({
      missionId: req.payload.missionId || "unknown",
      type: "approval.resolved",
      severity: req.status === "approved" ? "info" : "warning",
      source: "user",
      payload: { approvalId: id, decision, note },
    });
    const waiter = this.waiters.get(id);
    if (waiter) {
      clearTimeout(waiter.timer);
      this.waiters.delete(id);
      waiter.resolve(req);
    }
    return req;
  }

  list() {
    return [...this.requests.values()];
  }

  pending() {
    return [...this.requests.values()].filter((r) => r.status === "pending");
  }

  get(id) {
    return this.requests.get(id) || null;
  }
}
