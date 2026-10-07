// API Gateway — REST + SSE. Idempotency on mutating endpoints.
// Single source of UI truth is the orchestrator's Event Store.

import crypto from "node:crypto";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const seenIdempotencyKeys = new Set();

export function attachGateway(app, orchestrator) {
  // Health.
  app.handle("GET", "/api/health", async () => ({
    status: "ok",
    service: "patrick-os",
    uptime: process.uptime(),
    now: new Date().toISOString(),
  }));

  // List adapters + per-adapter health.
  app.handle("GET", "/api/adapters", async () => {
    const out = [];
    for (const [id, adapter] of Object.entries(orchestrator.adapters)) {
      out.push({
        id,
        displayName: adapter.displayName,
        health: await adapter.probe(),
        capabilities: await adapter.capabilities(),
      });
    }
    return { adapters: out };
  });

  // List missions.
  app.handle("GET", "/api/missions", async () => {
    return { missions: orchestrator.listMissions() };
  });

  // Get one mission.
  app.handle("GET", "/api/missions/:id", async (req) => {
    const m = orchestrator.getMission(req.params.id);
    if (!m) return { error: "not found", id: req.params.id };
    return { mission: m };
  });

  // Mission events (replayable from Event Store).
  app.handle("GET", "/api/missions/:id/events", async (req) => {
    const after = parseInt(req.query.after || "0", 10);
    const events = orchestrator.eventStore.list(after);
    return { events, cursor: events.length ? events[events.length - 1].sequence + 1 : 0 };
  });

  // Mission SSE stream — live updates as events are appended.
  app.handle("GET", "/api/missions/:id/stream", async (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    // Initial replay.
    const startAfter = parseInt(req.query.after || "0", 10);
    const replay = orchestrator.eventStore.list(startAfter);
    for (const evt of replay) {
      res.write(`event: evt\ndata: ${JSON.stringify(evt)}\n\n`);
    }
    // Subscribe to live.
    let lastSeq = replay.length ? replay[replay.length - 1].sequence : -1;
    const unsub = orchestrator.eventStore.subscribe((evt) => {
      if (evt.sequence > lastSeq) {
        lastSeq = evt.sequence;
        res.write(`event: evt\ndata: ${JSON.stringify(evt)}\n\n`);
      }
    });
    // Heartbeat every 25s to keep proxies happy.
    const hb = setInterval(() => res.write(`: ping ${Date.now()}\n\n`), 25_000);
    req.on("close", () => {
      clearInterval(hb);
      unsub();
    });
  });

  // Approvals.
  app.handle("GET", "/api/approvals", async () => {
    return { approvals: orchestrator.approvals.list() };
  });

  app.handle("POST", "/api/approvals/:id/resolve", async (req) => {
    const body = await readJson(req);
    const { decision, note } = body || {};
    if (decision !== "approve" && decision !== "reject") {
      return { error: "decision must be 'approve' or 'reject'" };
    }
    const idemKey = req.headers["x-idempotency-key"] || crypto.randomUUID();
    const result = await withIdempotency(idemKey, () =>
      orchestrator.approvals.resolve(req.params.id, decision, note || "")
    );
    return { approval: result };
  });

  app.handle("POST", "/api/missions/:id/commands", async (req) => {
    const body = await readJson(req);
    const text = String(body?.text || "").trim();
    if (!text) return { error: "command text is required" };
    const idemKey = req.headers["x-idempotency-key"] || crypto.randomUUID();
    return withIdempotency(idemKey, async () => {
      return orchestrator.enqueueCommand(req.params.id, text);
    });
  });

  // Pause / resume / cancel.
  app.handle("POST", "/api/missions/:id/pause", async (req) => {
    const idemKey = req.headers["x-idempotency-key"] || crypto.randomUUID();
    return withIdempotency(idemKey, async () => {
      const mission = await orchestrator.pauseMission(req.params.id);
      return { status: "paused", mission };
    });
  });

  app.handle("POST", "/api/missions/:id/cancel", async (req) => {
    const idemKey = req.headers["x-idempotency-key"] || crypto.randomUUID();
    return withIdempotency(idemKey, async () => {
      const mission = await orchestrator.cancelMission(req.params.id);
      return { status: "cancelled", mission };
    });
  });

  // Resume: re-run the mission from scratch using the Event Store as the
  // audit trail. This is a useful debug entry-point; in production a
  // resume would replay from the last checkpoint rather than re-run.
  app.handle("POST", "/api/missions/:id/resume", async (req) => {
    const idemKey = req.headers["x-idempotency-key"] || crypto.randomUUID();
    return withIdempotency(idemKey, async () => {
      const mission = await orchestrator.resumeMission(req.params.id);
      return { status: "resumed", mission };
    });
  });

  // Artifact fetch (raw bytes).
  app.handle("GET", "/api/artifacts/:id", async (req) => {
    // For the demo we just surface known ref URIs by walking events.
    const events = orchestrator.eventStore.list();
    const ref = events
      .flatMap((e) => (e.payload && e.payload.artifactId ? [e] : []))
      .find((e) => e.payload.artifactId === req.params.id);
    if (!ref) return { error: "artifact not found", id: req.params.id };
    return { artifact: ref.payload };
  });
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c.toString()));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function withIdempotency(key, fn) {
  if (seenIdempotencyKeys.has(key)) {
    return { ok: true, idempotent: true };
  }
  seenIdempotencyKeys.add(key);
  const out = await fn();
  return { ok: true, ...out };
}
