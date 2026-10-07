// Minimal HTTP server — vanilla Node, no Express. We want zero npm deps
// so the macOS .app bundle boots with the system Node only.

import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, "..", "..", "public");

/**
 * Build a tiny router. Methods + exact paths or paths with :params.
 */
function buildApp(routes) {
  return {
    async handle(method, pathname, handler) {
      // Lazy-bind: store on the app object so gateway.js can attach routes.
      this._routes = this._routes || [];
      this._routes.push({ method, pathname, handler });
    },
    async serve(req, res) {
      const url = new URL(req.url, "http://127.0.0.1");
      const pathname = url.pathname;
      const routeList = this._routes || routes || [];
      // API routes first.
      for (const r of routeList) {
        if (r.method !== req.method) continue;
        const params = matchPath(r.pathname, pathname);
        if (params) {
          try {
            req.params = params;
            req.query = Object.fromEntries(url.searchParams.entries());
            const out = await r.handler(req, res);
            // If the handler owns a streaming response (SSE), it has already
            // sent headers but intentionally keeps the socket open.
            if (res.headersSent || res.writableEnded) return;
            const status = out && out.error ? 400 : 200;
            res.writeHead(status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(out));
            return;
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
            return;
          }
        }
      }
      // Static files fallback.
      await serveStatic(req, res, pathname);
    },
  };
}

function matchPath(routePath, requestPath) {
  const routeParts = routePath.split("/").filter(Boolean);
  const requestParts = requestPath.split("/").filter(Boolean);
  if (routeParts.length !== requestParts.length) return null;
  const params = {};
  for (let i = 0; i < routeParts.length; i++) {
    if (routeParts[i].startsWith(":")) {
      params[routeParts[i].slice(1)] = decodeURIComponent(requestParts[i]);
    } else if (routeParts[i] !== requestParts[i]) {
      return null;
    }
  }
  return params;
}

async function serveStatic(req, res, pathname) {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    return res.end("Method Not Allowed");
  }
  let rel = pathname === "/" ? "/index.html" : pathname;
  const fullPath = path.join(PUBLIC_DIR, rel);
  // Path traversal guard.
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("forbidden");
  }
  try {
    const data = await fs.readFile(fullPath);
    const type = contentType(fullPath);
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    });
    res.end(data);
  } catch (err) {
    if (err.code === "ENOENT") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not Found");
    }
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Server Error");
  }
}

function contentType(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".json")) return "application/json; charset=utf-8";
  if (p.endsWith(".svg")) return "image/svg+xml";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

export function startServer({ port, orchestrator, attachGateway }) {
  const app = buildApp();
  attachGateway(app, orchestrator);

  const server = createServer((req, res) => app.serve(req, res));

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      process.stdout.write(`[patrick-os] listening on http://127.0.0.1:${addr.port}\n`);
      resolve({ server, port: addr.port });
    });
  });
}
