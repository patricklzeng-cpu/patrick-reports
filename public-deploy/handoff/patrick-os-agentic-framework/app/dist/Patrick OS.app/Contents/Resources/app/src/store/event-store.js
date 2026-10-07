// Event Store — append-only JSONL on disk, in-memory ring of subscribers
// for live SSE delivery. The Event Store is the single source of truth;
// every projection rebuilds from it.

import { promises as fs } from "node:fs";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import crypto from "node:crypto";

export class EventStore {
  /**
   * @param {string} dataDir - directory to persist JSONL file
   * @param {string=} missionId - mission scope (one file per mission)
   */
  constructor(dataDir, missionId) {
    this.dataDir = dataDir;
    this.missionId = missionId || "global";
    this.filePath = path.join(dataDir, `events-${this.missionId}.jsonl`);
    this.events = []; // ordered
    this.subscribers = new Set();
    this._ready = this._load();
  }

  async _load() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      const stream = createReadStream(this.filePath, { encoding: "utf8" });
      const rl = createInterface({ input: stream, crlfDelay: Infinity });
      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const evt = JSON.parse(trimmed);
          this.events.push(evt);
        } catch (err) {
          // Bad line — keep file integrity but skip bad records (audit via stderr).
          process.stderr.write(`[event-store] skipping bad JSONL line: ${err.message}\n`);
        }
      }
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  async ready() {
    return this._ready;
  }

  /**
   * Append a new event to the store. The Event Store always owns the global
   * sequence. Adapter-local sequence numbers are retained as providerSequence
   * evidence so SSE cursors never drop later events with smaller local values.
   * @param {Partial<import("./adapter-contract.js").AgentEvent>} partial
   * @returns {Promise<import("./adapter-contract.js").AgentEvent>}
   */
  async append(partial) {
    await this._ready;
    const lastSeq = this.events.length
      ? this.events[this.events.length - 1].sequence
      : -1;
    const providerSequence = Number.isInteger(partial.sequence) ? partial.sequence : undefined;
    const evt = {
      id: partial.id || crypto.randomUUID(),
      schemaVersion: partial.schemaVersion || "1.0.0",
      sequence: lastSeq + 1,
      timestamp: partial.timestamp || new Date().toISOString(),
      missionId: partial.missionId,
      taskId: partial.taskId,
      runId: partial.runId,
      traceId: partial.traceId || crypto.randomUUID(),
      source: partial.source || "patrick",
      type: partial.type,
      severity: partial.severity || "info",
      payload: {
        ...(partial.payload || {}),
        ...(providerSequence !== undefined ? { providerSequence } : {}),
      },
    };
    this.events.push(evt);
    await fs.appendFile(this.filePath, JSON.stringify(evt) + "\n", "utf8");
    for (const sub of this.subscribers) {
      try {
        sub(evt);
      } catch (err) {
        process.stderr.write(`[event-store] subscriber error: ${err.message}\n`);
      }
    }
    return evt;
  }

  /**
   * All events for this mission, in order. Already-paginated by sequence.
   * @returns {import("./adapter-contract.js").AgentEvent[]}
   */
  list(afterSequence = 0) {
    return this.events.filter((e) => e.sequence >= afterSequence);
  }

  size() {
    return this.events.length;
  }

  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}
