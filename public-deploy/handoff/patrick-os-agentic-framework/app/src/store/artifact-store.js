// Artifact Store — versioned artifacts with sha256 checksum. Each artifact
// traces to missionId / taskId / runId / actor + version. Immutable on disk.

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export class ArtifactStore {
  /**
   * @param {string} rootDir
   */
  constructor(rootDir) {
    this.rootDir = rootDir;
  }

  async ensureReady() {
    await fs.mkdir(this.rootDir, { recursive: true });
  }

  /**
   * Persist a new artifact version. Returns an ArtifactRef.
   * @param {{
   *   missionId: string,
   *   taskId: string,
   *   runId: string,
   *   name: string,
   *   content: string|Buffer,
   *   mimeType?: string,
   *   actor: string,
   * }} spec
   */
  async write(spec) {
    await this.ensureReady();
    const version = (await this._latestVersion(spec.missionId, spec.name)) + 1;
    const buf = Buffer.isBuffer(spec.content) ? spec.content : Buffer.from(spec.content, "utf8");
    const checksum = crypto.createHash("sha256").update(buf).digest("hex");
    const safeName = spec.name.replace(/[^A-Za-z0-9._-]/g, "_");
    const dir = path.join(this.rootDir, spec.missionId, safeName);
    await fs.mkdir(dir, { recursive: true });
    const filename = `v${version}.${this._ext(spec.mimeType)}`;
    const fullPath = path.join(dir, filename);
    await fs.writeFile(fullPath, buf);
    const ref = {
      id: crypto.randomUUID(),
      name: spec.name,
      uri: fullPath,
      checksum,
      mimeType: spec.mimeType || "text/plain",
      version,
      provenance: {
        missionId: spec.missionId,
        taskId: spec.taskId,
        runId: spec.runId,
        actor: spec.actor,
        savedAt: new Date().toISOString(),
      },
    };
    // Write sidecar metadata so a future read can reproduce the ref.
    await fs.writeFile(
      path.join(dir, `v${version}.meta.json`),
      JSON.stringify(ref, null, 2)
    );
    return ref;
  }

  async read(ref) {
    return fs.readFile(ref.uri, "utf8");
  }

  async _latestVersion(missionId, name) {
    try {
      const safeName = name.replace(/[^A-Za-z0-9._-]/g, "_");
      const dir = path.join(this.rootDir, missionId, safeName);
      const files = await fs.readdir(dir);
      const versions = files
        .filter((f) => /^v\d+\./.test(f))
        .map((f) => parseInt(f.slice(1).split(".")[0], 10))
        .filter((n) => Number.isFinite(n));
      return versions.length ? Math.max(...versions) : 0;
    } catch (err) {
      if (err.code === "ENOENT") return 0;
      throw err;
    }
  }

  _ext(mimeType) {
    if (!mimeType) return "txt";
    const map = {
      "text/plain": "txt",
      "text/html": "html",
      "text/markdown": "md",
      "application/json": "json",
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/svg+xml": "svg",
      "application/octet-stream": "bin",
    };
    return map[mimeType] || mimeType.split("/").pop() || "bin";
  }
}