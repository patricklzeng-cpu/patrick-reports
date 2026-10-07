// Server entrypoint. Boots the orchestrator, attaches the API gateway,
// and serves the Artifact Room UI on http://127.0.0.1:7331.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./api/server.js";
import { attachGateway } from "./api/gateway.js";
import { Orchestrator } from "./orchestrator/orchestrator.js";
import { buildDemoMission } from "./orchestrator/demo-mission.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || "7331", 10);
const DATA_DIR = process.env.PATRICK_DATA_DIR
  ? path.resolve(process.env.PATRICK_DATA_DIR)
  : path.resolve(__dirname, "..", "..", "data");
const WORKSPACE_ROOT = process.env.PATRICK_WORKSPACE_DIR
  ? path.resolve(process.env.PATRICK_WORKSPACE_DIR)
  : path.resolve(__dirname, "..", "..", "workspace");

async function main() {
  const orchestrator = new Orchestrator({ dataDir: DATA_DIR, workspaceRoot: WORKSPACE_ROOT });
  await orchestrator.ready();

  // Wipe any stale Event Store from a previous (failed) run. The Event
  // Store survives across restarts in production, but during early-stage
  // development we want each boot to start clean so the UI demo is
  // reproducible. Toggle this off for production-grade resumability.
  orchestrator.resetEventStore();
  process.stdout.write(`[patrick-os] event store reset (clean slate)\n`);

  // Single startServer call wires gateway + server in one go.
  const { server, port } = await startServer({
    port: PORT,
    orchestrator,
    attachGateway,
  });

  // Register demo mission. Status starts at "draft"; runMission walks the FSM.
  const mission = buildDemoMission();
  orchestrator.registerMission(mission);
  process.stdout.write(`[patrick-os] demo mission registered: ${mission.id}\n`);

  // Auto-launch the demo mission (fire-and-forget; UI subscribes via SSE).
  // Use a 500ms delay so the UI has time to subscribe before events start.
  setTimeout(() => {
    orchestrator.runMission(mission.id).catch((err) => {
      process.stderr.write(`[patrick-os] mission error: ${err.stack}\n`);
    });
  }, 500);

  // Graceful shutdown.
  const shutdown = () => {
    process.stdout.write(`\n[patrick-os] shutting down…\n`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  process.stderr.write(`[patrick-os] fatal: ${err.stack}\n`);
  process.exit(1);
});
