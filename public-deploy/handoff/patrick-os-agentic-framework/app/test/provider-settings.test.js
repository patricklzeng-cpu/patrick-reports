import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeychainCredentialStore, ProviderSettings } from "../src/providers/provider-settings.js";

class MemoryCredentials {
  constructor() { this.value = ""; }
  async has() { return Boolean(this.value); }
  async get() { return this.value; }
  async set(_service, _account, value) { this.value = value; }
  async delete() { this.value = ""; }
}

test("ProviderSettings keeps the API key out of disk and public status", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "patrick-provider-"));
  const credentials = new MemoryCredentials();
  const settings = new ProviderSettings(dataDir, { credentials, env: {} });
  await settings.save({
    apiKey: "secret-minimax-key",
    endpoint: "https://api.minimax.io/v1/chat/completions",
    model: "MiniMax-M2.7",
  });

  const status = await settings.publicStatus();
  const disk = await fs.readFile(path.join(dataDir, "provider-settings.json"), "utf8");
  assert.equal(status.configured, true);
  assert.equal(status.credentialSource, "macOS Keychain");
  assert.equal("apiKey" in status, false);
  assert.equal(disk.includes("secret-minimax-key"), false);
  assert.equal(disk.includes("apiKey"), false);
});

test("ProviderSettings verifies the official MiniMax endpoint without exposing the key", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "patrick-provider-"));
  const credentials = new MemoryCredentials();
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          id: "test-response",
          model: "MiniMax-M2.7",
          choices: [{ message: { content: "PATRICK_OK" } }],
          usage: { prompt_tokens: 9, completion_tokens: 2 },
        };
      },
    };
  };
  const settings = new ProviderSettings(dataDir, { credentials, fetchImpl, env: {} });
  await settings.save({ apiKey: "secret-minimax-key", model: "MiniMax-M2.7" });
  const status = await settings.testConnection();

  assert.equal(status.lastTest.ok, true);
  assert.equal(request.url, "https://api.minimax.io/v1/chat/completions");
  assert.equal(request.options.headers.authorization, "Bearer secret-minimax-key");
  assert.equal(JSON.stringify(status).includes("secret-minimax-key"), false);
});

test("KeychainCredentialStore rejects an existing item with an empty password", async () => {
  const store = new KeychainCredentialStore({
    run: async () => ({ code: 0, stdout: "\n", stderr: "" }),
  });
  assert.equal(await store.has("service", "account"), false);
});

test("KeychainCredentialStore writes through interactive mode and verifies the value", async () => {
  let stored = "";
  let command = "";
  const store = new KeychainCredentialStore({
    run: async (args) => args[0] === "find-generic-password"
      ? { code: stored ? 0 : 44, stdout: stored ? `${stored}\n` : "", stderr: "" }
      : { code: 0, stdout: "", stderr: "" },
    runInteractive: async (value) => {
      command = value;
      stored = "dummy-secret";
      return { code: 0, stdout: "", stderr: "" };
    },
  });
  await store.set("service", "account", "dummy-secret");
  assert.equal(await store.has("service", "account"), true);
  assert.match(command, /^add-generic-password /);
  assert.match(command, /-w "dummy-secret"$/);
});
