import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_ENDPOINT = "https://api.minimax.io/v1/chat/completions";
const DEFAULT_MODEL = "MiniMax-M2.7";
const KEYCHAIN_SERVICE = "xyz.2017zyl.patrick-os.minimax";
const KEYCHAIN_ACCOUNT = "api";

export class ProviderSettings {
  constructor(dataDir, options = {}) {
    this.filePath = path.join(dataDir, "provider-settings.json");
    this.credentials = options.credentials || new KeychainCredentialStore();
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.env = options.env || process.env;
    this.config = { provider: "minimax", endpoint: DEFAULT_ENDPOINT, model: DEFAULT_MODEL };
    this.lastTest = null;
    this._ready = this._load();
  }

  async ready() {
    await this._ready;
  }

  async publicStatus() {
    await this.ready();
    const envConfigured = Boolean(this.env.MINIMAX_API_KEY);
    const keychainConfigured = envConfigured ? false : await this.credentials.has(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    return {
      provider: "minimax",
      endpoint: this.config.endpoint,
      model: this.config.model,
      configured: envConfigured || keychainConfigured,
      credentialSource: envConfigured ? "environment" : keychainConfigured ? "macOS Keychain" : null,
      lastTest: this.lastTest,
    };
  }

  async save({ apiKey, endpoint, model }) {
    await this.ready();
    const nextEndpoint = validateEndpoint(endpoint || this.config.endpoint);
    const nextModel = validateModel(model || this.config.model);
    if (apiKey) await this.credentials.set(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, String(apiKey).trim());
    this.config = { provider: "minimax", endpoint: nextEndpoint, model: nextModel };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.config, null, 2) + "\n", { mode: 0o600 });
    await fs.chmod(this.filePath, 0o600);
    return this.publicStatus();
  }

  async forget() {
    await this.credentials.delete(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    this.lastTest = null;
    return this.publicStatus();
  }

  async testConnection() {
    const started = Date.now();
    try {
      const response = await this.complete([
        { role: "system", content: "You are a connection diagnostic. Follow the user's exact response format." },
        { role: "user", content: "Reply with PATRICK_OK only." },
      ], { maxCompletionTokens: 32, temperature: 0.1 });
      const ok = response.content.includes("PATRICK_OK");
      this.lastTest = {
        ok,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        model: response.model,
        message: ok ? "MiniMax responded successfully" : "MiniMax responded with an unexpected diagnostic value",
      };
    } catch (error) {
      this.lastTest = {
        ok: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        message: safeProviderError(error),
      };
    }
    return { ...(await this.publicStatus()), lastTest: this.lastTest };
  }

  async complete(messages, options = {}) {
    await this.ready();
    const key = this.env.MINIMAX_API_KEY || await this.credentials.get(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    if (!key) throw new Error("MiniMax API key is not configured");
    const response = await this.fetchImpl(this.config.endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(options.timeoutMs || 45_000),
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: false,
        max_completion_tokens: options.maxCompletionTokens || 1600,
        temperature: options.temperature ?? 0.4,
        top_p: options.topP ?? 0.95,
      }),
    });
    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error(`MiniMax returned a non-JSON response (HTTP ${response.status})`);
    }
    if (!response.ok || body?.base_resp?.status_code) {
      const providerMessage = body?.base_resp?.status_msg || body?.error?.message || `HTTP ${response.status}`;
      throw new Error(`MiniMax request failed: ${providerMessage}`);
    }
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("MiniMax returned an empty response");
    return {
      content: content.trim(),
      reasoning: body?.choices?.[0]?.message?.reasoning_content || "",
      model: body.model || this.config.model,
      usage: body.usage || {},
      id: body.id || null,
    };
  }

  // Internal-only credential handoff for a local child process such as Pi.
  // The value is never returned by the HTTP API or written to an event.
  async getSecretForLocalWorker() {
    await this.ready();
    return this.env.MINIMAX_API_KEY || await this.credentials.get(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
  }

  async _load() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, "utf8"));
      this.config = {
        provider: "minimax",
        endpoint: validateEndpoint(parsed.endpoint || DEFAULT_ENDPOINT),
        model: validateModel(parsed.model || DEFAULT_MODEL),
      };
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
  }
}

export class KeychainCredentialStore {
  constructor(options = {}) {
    this.run = options.run || runSecurity;
    this.runInteractive = options.runInteractive || runSecurityInteractive;
  }

  async has(service, account) {
    return Boolean(await this.get(service, account));
  }

  async get(service, account) {
    const result = await this.run(["find-generic-password", "-a", account, "-s", service, "-w"]);
    return result.code === 0 ? result.stdout.trim() : "";
  }

  async set(service, account, secret) {
    const normalized = String(secret || "").trim();
    if (!normalized) throw new Error("API key cannot be empty");
    if (/[\r\n\0]/.test(normalized)) throw new Error("API key contains unsupported control characters");
    // `security add-generic-password ... -w` does not read the password from
    // stdin; it silently creates an empty item. Interactive mode lets us keep
    // the credential out of the process argument list while still supplying
    // an explicit value to the macOS Keychain command parser.
    const command = [
      "add-generic-password",
      "-a", quoteSecurityArgument(account),
      "-s", quoteSecurityArgument(service),
      "-U",
      "-w", quoteSecurityArgument(normalized),
    ].join(" ");
    const result = await this.runInteractive(command);
    if (result.code !== 0) throw new Error("Could not save the API key to macOS Keychain");
    const stored = await this.get(service, account);
    if (!stored || stored !== normalized) throw new Error("macOS Keychain did not retain the API key");
  }

  async delete(service, account) {
    const result = await this.run(["delete-generic-password", "-a", account, "-s", service]);
    if (result.code !== 0 && !/could not be found/i.test(result.stderr)) {
      throw new Error("Could not remove the API key from macOS Keychain");
    }
  }
}

function runSecurity(args, stdin = null) {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/security", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(stdin || "");
  });
}

function runSecurityInteractive(command) {
  return runSecurity(["-i"], `${command}\n`);
}

function quoteSecurityArgument(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function validateEndpoint(value) {
  const url = new URL(String(value));
  if (url.protocol !== "https:" || url.hostname !== "api.minimax.io" || url.pathname !== "/v1/chat/completions") {
    throw new Error("MiniMax endpoint must be https://api.minimax.io/v1/chat/completions");
  }
  return url.href.replace(/\/$/, "");
}

function validateModel(value) {
  const allowed = new Set(["MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M2.5", "MiniMax-M2.5-highspeed", "MiniMax-M2.1"]);
  if (!allowed.has(String(value))) throw new Error("Unsupported MiniMax model");
  return String(value);
}

function safeProviderError(error) {
  const message = String(error?.message || "MiniMax connection failed");
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 240);
}
