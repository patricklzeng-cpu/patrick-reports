const FRESH_CACHE_SECONDS = 15 * 60;
const STALE_CACHE_SECONDS = 6 * 60 * 60;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_XML_BYTES = 2 * 1024 * 1024;
const MAX_JSON_BYTES = 512 * 1024;
const MAX_ITEMS = 100;
const CACHE_VERSION = "v2";

const PUBLIC_CACHE_CONTROL =
  `public, max-age=300, s-maxage=${FRESH_CACHE_SECONDS}, stale-while-revalidate=${STALE_CACHE_SECONDS}`;

const OFFICIAL_FEEDS = Object.freeze([
  { id: "openai", source: "OpenAI News", url: "https://openai.com/news/rss.xml", defaultCategory: "models" },
  { id: "deepmind", source: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml", defaultCategory: "models" },
  { id: "google-ai", source: "Google AI", url: "https://blog.google/innovation-and-ai/rss/", defaultCategory: "models", keywords: ["AI", "Gemini", "model", "agent", "robot", "TPU", "research"] },
  { id: "apple-ml", source: "Apple ML Research", url: "https://machinelearning.apple.com/rss.xml", defaultCategory: "models" },
  { id: "microsoft-research", source: "Microsoft Research", url: "https://www.microsoft.com/en-us/research/feed/", defaultCategory: "science" },
  { id: "amazon-science", source: "Amazon Science", url: "https://www.amazon.science/index.rss", defaultCategory: "science" },
  { id: "nvidia", source: "NVIDIA Newsroom", url: "https://nvidianews.nvidia.com/rss.xml", defaultCategory: "infra", keywords: ["AI", "agent", "GPU", "Rubin", "robot", "model", "inference"] },
  { id: "amd", source: "AMD Newsroom", url: "https://ir.amd.com/news-events/press-releases/rss", defaultCategory: "infra", keywords: ["AI", "accelerator", "Instinct", "Helios", "ROCm", "inference"] },
  { id: "meta", source: "Meta Newsroom", url: "https://about.fb.com/feed/", defaultCategory: "models", keywords: ["AI", "Meta AI", "Llama", "Muse", "model", "robot"] },
  { id: "github", source: "GitHub Changelog", url: "https://github.blog/changelog/feed/", defaultCategory: "agents", keywords: ["Copilot", "agent", "MCP", "model", "AI", "coding"] },
  { id: "nist", source: "NIST IT", url: "https://www.nist.gov/news-events/information%20technology/rss.xml", defaultCategory: "safety", keywords: ["AI", "artificial intelligence", "CAISI", "AITE", "TEVV", "agent"] },
  { id: "eu", source: "EU Digital Strategy", url: "https://digital-strategy.ec.europa.eu/en/rss.xml", defaultCategory: "safety", keywords: ["AI Act", "artificial intelligence", "AI Office", "GPAI", "algorithm"] },
]);

const ARXIV_FEED_URL =
  "https://export.arxiv.org/api/query?search_query=cat%3Acs.AI%20OR%20cat%3Acs.CL%20OR%20cat%3Acs.CV%20OR%20cat%3Acs.RO%20OR%20cat%3Acs.LG&start=0&max_results=50&sortBy=submittedDate&sortOrder=descending";

const GITHUB_RELEASE_FEEDS = Object.freeze([
  { id: "transformers", source: "Transformers", url: "https://github.com/huggingface/transformers/releases.atom", category: "open" },
  { id: "vllm", source: "vLLM", url: "https://github.com/vllm-project/vllm/releases.atom", category: "infra" },
  { id: "cosmos", source: "NVIDIA Cosmos", url: "https://github.com/NVIDIA/cosmos/releases.atom", category: "worlds" },
  { id: "gr00t", source: "Isaac GR00T", url: "https://github.com/NVIDIA/Isaac-GR00T/releases.atom", category: "robotics" },
  { id: "llama-models", source: "Llama Models", url: "https://github.com/meta-llama/llama-models/releases.atom", category: "open" },
]);

const HF_MODELS_URL = "https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=10";

const ALLOWED_UPSTREAM_URLS = new Set([
  ...OFFICIAL_FEEDS.map((feed) => feed.url),
  ARXIV_FEED_URL,
  ...GITHUB_RELEASE_FEEDS.map((feed) => feed.url),
  HF_MODELS_URL,
]);

const ALLOWED_UPSTREAM_HOSTS = new Set(
  [...ALLOWED_UPSTREAM_URLS].map((value) => new URL(value).hostname),
);

const HIGH_SIGNAL_TERMS = Object.freeze([
  "agent", "reasoning", "world model", "robot", "robotics", "vla", "vision-language-action",
  "multimodal", "computer use", "tool use", "coding", "code", "scientific", "science",
  "interpretability", "alignment", "safety", "inference", "training", "mixture of experts",
  "open-weight", "foundation model", "video generation", "simulation", "spatial", "autonomous",
]);

const JSON_HEADERS = Object.freeze({
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": PUBLIC_CACHE_CONTROL,
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
});

function jsonResponse(body, extraHeaders = {}, status = 200) {
  return new Response(body, {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : "Unavailable";
  return cleanText(message).slice(0, 160) || "Unavailable";
}

function decodeEntities(input) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(input)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (all, value) => decodeCodePoint(all, Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (all, value) => decodeCodePoint(all, Number.parseInt(value, 16)))
    .replace(/&([a-z]+);/gi, (all, name) => named[name.toLowerCase()] ?? all);
}

function decodeCodePoint(fallback, value) {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
    return fallback;
  }
  return String.fromCodePoint(value);
}

function cleanText(input = "") {
  return decodeEntities(input)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tagValue(block, names) {
  for (const name of names) {
    const escapedName = escapeRegExp(name);
    const match = block.match(new RegExp(`<${escapedName}[^>]*>([\\s\\S]*?)<\\/${escapedName}>`, "i"));
    if (match?.[1]) return cleanText(match[1]);
  }
  return "";
}

function linkValue(block) {
  const rssLink = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1];
  if (rssLink && /^\s*(?:<!\[CDATA\[)?https?:/i.test(rssLink)) return cleanText(rssLink);

  const links = [...block.matchAll(/<link\b([^>]*)>/gi)]
    .map((match) => {
      const attributes = match[1];
      const href = attributes.match(/\bhref=["']([^"']+)["']/i)?.[1] ?? "";
      const rel = attributes.match(/\brel=["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? "";
      return { href: decodeEntities(href), rel };
    })
    .filter((link) => isHttpUrl(link.href));

  const alternate = links.find((link) => link.rel.split(/\s+/).includes("alternate"));
  const fallback = links.find((link) => !link.rel || link.rel === "alternate");
  return alternate?.href ?? fallback?.href ?? "";
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

function stableId(source, value) {
  let hash = 2166136261;
  const input = `${source}:${value}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${source}-${(hash >>> 0).toString(36)}`;
}

function normalizeDate(input) {
  if (!input) return null;
  const timestamp = Date.parse(input);
  const earliest = Date.UTC(2000, 0, 1);
  const latest = Date.now() + 7 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(timestamp) || timestamp < earliest || timestamp > latest) return null;
  return new Date(timestamp).toISOString();
}

function matchesKeyword(text, keyword) {
  if (/^[a-z0-9-]{1,4}$/i.test(keyword)) {
    return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(text);
  }
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function classify(text, fallback) {
  const value = text.toLowerCase();
  if (/safety|security|cyber|alignment|interpret|watermark|regulat|govern|ai act|red.?team|jailbreak/.test(value)) return "safety";
  if (/robot|robotics|humanoid|vision.language.action|\bvla\b|embodied|autonomous driv|robotaxi|manipulat/.test(value)) return "robotics";
  if (/world model|simulation|simulator|spatial intelligence|3d world|video generat|digital twin/.test(value)) return "worlds";
  if (/chip|gpu|tpu|accelerator|inference|training system|mlperf|throughput|memory|rocm|cuda/.test(value)) return "infra";
  if (/science|scientific|biology|protein|chemistry|weather|material|mathemat|theorem|medicine|genomic/.test(value)) return "science";
  if (/open.weight|open source|hugging face|weights|apache 2|mit license/.test(value)) return "open";
  if (/agent|coding|computer use|tool use|automation|copilot|terminal|software engineering/.test(value)) return "agents";
  return fallback;
}

function signalScore(text) {
  const lower = text.toLowerCase();
  return HIGH_SIGNAL_TERMS.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0);
}

function isAllowedRedirect(url) {
  return url.protocol === "https:"
    && !url.username
    && !url.password
    && (!url.port || url.port === "443")
    && ALLOWED_UPSTREAM_HOSTS.has(url.hostname);
}

async function fetchAllowlisted(url, accept) {
  if (!ALLOWED_UPSTREAM_URLS.has(url)) throw new Error("Blocked non-allowlisted upstream");

  let current = new URL(url);
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  for (let redirects = 0; redirects <= 2; redirects += 1) {
    const response = await fetch(current.toString(), {
      headers: { Accept: accept, "User-Agent": "AI-Frontier-Radar/1.0 (+https://2017zyl.xyz/)" },
      redirect: "manual",
      signal,
    });

    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("Location");
    if (!location || redirects === 2) throw new Error(`Unsafe or excessive redirect (${response.status})`);
    const next = new URL(location, current);
    if (!isAllowedRedirect(next)) throw new Error("Blocked redirect outside upstream allowlist");
    current = next;
  }

  throw new Error("Excessive redirects");
}

async function readTextBounded(response, maxBytes) {
  const contentLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`Upstream body exceeds ${maxBytes} bytes`);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel("body limit exceeded");
        } catch {
          // The size error below is the actionable result.
        }
        throw new Error(`Upstream body exceeds ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

async function fetchText(url, accept, maxBytes = MAX_XML_BYTES) {
  const response = await fetchAllowlisted(url, accept);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return readTextBounded(response, maxBytes);
}

function healthFailure(id, source, started, error) {
  return {
    items: [],
    health: {
      id,
      source,
      ok: false,
      itemCount: 0,
      latencyMs: Date.now() - started,
      message: safeErrorMessage(error),
    },
  };
}

async function fetchFeed(feed) {
  const started = Date.now();
  try {
    const xml = await fetchText(feed.url, "application/rss+xml, application/atom+xml, text/xml;q=0.9, */*;q=0.5");
    if (!/<(?:rss|feed|rdf:RDF)\b/i.test(xml)) throw new Error("Not a machine-readable feed");

    const items = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)]
      .slice(0, 30)
      .map((match) => {
        const block = match[0];
        const title = tagValue(block, ["title"]);
        const itemUrl = linkValue(block) || tagValue(block, ["guid", "id"]);
        const publishedAt = normalizeDate(tagValue(block, ["pubDate", "published", "updated", "dc:date"]));
        const summary = tagValue(block, ["description", "summary", "content:encoded", "content"]).slice(0, 280);
        if (!title || !isHttpUrl(itemUrl) || !publishedAt) return null;

        const combined = `${title} ${summary}`;
        if (feed.keywords && !feed.keywords.some((term) => matchesKeyword(combined, term))) return null;
        return {
          id: stableId(feed.id, itemUrl),
          title,
          url: itemUrl,
          publishedAt,
          sourceId: feed.id,
          source: feed.source,
          category: classify(combined, feed.defaultCategory),
          kind: "news",
          summary,
          signalScore: signalScore(combined),
        };
      })
      .filter(Boolean)
      .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
      .slice(0, 5);

    return {
      items,
      health: {
        id: feed.id,
        source: feed.source,
        ok: items.length > 0,
        itemCount: items.length,
        latencyMs: Date.now() - started,
        message: items.length ? undefined : "Feed reachable but no matching dated entries parsed",
      },
    };
  } catch (error) {
    return healthFailure(feed.id, feed.source, started, error);
  }
}

async function fetchArxiv() {
  const id = "arxiv";
  const source = "arXiv frontier query";
  const started = Date.now();
  try {
    const xml = await fetchText(ARXIV_FEED_URL, "application/atom+xml, text/xml;q=0.9");
    const items = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)]
      .slice(0, 50)
      .map((match) => {
        const block = match[0];
        const title = tagValue(block, ["title"]);
        const itemUrl = linkValue(block) || tagValue(block, ["id"]);
        const summary = tagValue(block, ["summary"]).slice(0, 360);
        const publishedAt = normalizeDate(tagValue(block, ["published", "updated"]));
        const authors = [...block.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi)]
          .slice(0, 4)
          .map((author) => cleanText(author[1]))
          .filter(Boolean)
          .join(", ");
        if (!title || !isHttpUrl(itemUrl) || !publishedAt) return null;

        const combined = `${title} ${summary}`;
        return {
          id: stableId(id, itemUrl),
          title,
          url: itemUrl.replace(/^http:/i, "https:"),
          publishedAt,
          sourceId: id,
          source,
          category: classify(combined, "models"),
          kind: "paper",
          summary,
          authors,
          signalScore: signalScore(combined),
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.signalScore - left.signalScore || Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
      .slice(0, 18);

    return {
      items,
      health: {
        id,
        source,
        ok: items.length > 0,
        itemCount: items.length,
        latencyMs: Date.now() - started,
        message: items.length ? undefined : "No dated entries parsed",
      },
    };
  } catch (error) {
    return healthFailure(id, source, started, error);
  }
}

async function fetchGitHubRelease(feed) {
  const xml = await fetchText(feed.url, "application/atom+xml, text/xml;q=0.9");
  return [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)]
    .slice(0, 3)
    .map((match) => {
      const block = match[0];
      const title = tagValue(block, ["title"]);
      const itemUrl = linkValue(block);
      const publishedAt = normalizeDate(tagValue(block, ["updated", "published"]));
      if (!title || !isHttpUrl(itemUrl) || !publishedAt) return null;
      return {
        id: stableId("github-releases", itemUrl),
        title: `${feed.source} · ${title}`,
        url: itemUrl,
        publishedAt,
        sourceId: "github-releases",
        source: feed.source,
        category: feed.category,
        kind: "release",
        signalScore: /\b(?:rc|beta|alpha|pre)\b/i.test(title) ? 1 : 2,
      };
    })
    .filter(Boolean);
}

async function fetchGitHub() {
  const id = "github-releases";
  const source = "GitHub official releases";
  const started = Date.now();
  try {
    const results = await Promise.allSettled(GITHUB_RELEASE_FEEDS.map(fetchGitHubRelease));
    const items = results
      .filter((result) => result.status === "fulfilled")
      .flatMap((result) => result.value)
      .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
      .slice(0, 12);
    const failedCount = results.filter((result) => result.status === "rejected").length;
    return {
      items,
      health: {
        id,
        source,
        ok: items.length > 0,
        itemCount: items.length,
        latencyMs: Date.now() - started,
        message: failedCount
          ? `${failedCount}/${results.length} repositories unavailable`
          : items.length ? undefined : "No dated releases parsed",
      },
    };
  } catch (error) {
    return healthFailure(id, source, started, error);
  }
}

function safeHuggingFaceUrl(modelId) {
  if (typeof modelId !== "string" || !modelId || modelId.length > 300) return null;
  const path = modelId.split("/").map((part) => encodeURIComponent(part)).join("/");
  return path ? `https://huggingface.co/${path}` : null;
}

async function fetchHuggingFace() {
  const id = "hf-models";
  const source = "Hugging Face model API";
  const started = Date.now();
  try {
    const response = await fetchAllowlisted(HF_MODELS_URL, "application/json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await readTextBounded(response, MAX_JSON_BYTES);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Unexpected API response");

    const formatter = new Intl.NumberFormat("en", { notation: "compact" });
    const items = parsed.slice(0, 10).map((model) => {
      if (!model || typeof model !== "object") return null;
      const itemUrl = safeHuggingFaceUrl(model.id);
      const modelDate = typeof model.lastModified === "string"
        ? model.lastModified
        : typeof model.createdAt === "string" ? model.createdAt : "";
      const publishedAt = normalizeDate(modelDate);
      if (!itemUrl || !publishedAt) return null;
      const downloads = Number.isFinite(Number(model.downloads)) ? Number(model.downloads) : 0;
      const likes = Number.isFinite(Number(model.likes)) ? Number(model.likes) : 0;
      return {
        id: stableId(id, model.id),
        title: cleanText(model.id).slice(0, 300),
        url: itemUrl,
        publishedAt,
        sourceId: id,
        source,
        category: "open",
        kind: "model",
        metrics: `${formatter.format(downloads)} downloads · ${likes} likes`,
        signalScore: 1,
      };
    }).filter(Boolean);

    return {
      items,
      health: {
        id,
        source,
        ok: items.length > 0,
        itemCount: items.length,
        latencyMs: Date.now() - started,
        message: items.length ? undefined : "No dated models returned",
      },
    };
  } catch (error) {
    return healthFailure(id, source, started, error);
  }
}

function deduplicateItems(items) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  const output = [];
  for (const item of items) {
    const titleKey = item.title.toLowerCase();
    if (seenUrls.has(item.url) || seenTitles.has(titleKey)) continue;
    seenUrls.add(item.url);
    seenTitles.add(titleKey);
    output.push(item);
    if (output.length >= MAX_ITEMS) break;
  }
  return output;
}

async function collectRadarData() {
  const settled = await Promise.all([
    ...OFFICIAL_FEEDS.map(fetchFeed),
    fetchArxiv(),
    fetchGitHub(),
    fetchHuggingFace(),
  ]);

  const items = deduplicateItems(
    settled
      .flatMap((result) => result.items)
      .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt)),
  );
  const health = settled.map((result) => result.health);
  const live = health.filter((source) => source.ok).length;
  const degraded = health.length - live;
  const payload = {
    generatedAt: new Date().toISOString(),
    status: degraded === 0 ? "healthy" : live > 0 ? "degraded" : "unavailable",
    refreshPolicy: "Edge cache target: 15 minutes; stale data may be served while official sources refresh.",
    coverage: { configured: health.length, live, degraded, items: items.length },
    items,
    health,
  };

  return { body: JSON.stringify(payload), cacheable: live > 0, status: payload.status };
}

function getDefaultCache() {
  try {
    return globalThis.caches?.default ?? null;
  } catch {
    return null;
  }
}

function cacheKeys(request) {
  const freshUrl = new URL(request.url);
  freshUrl.search = "";
  freshUrl.hash = "";
  freshUrl.pathname = `/.internal-cache/ai-frontier-live-${CACHE_VERSION}-fresh`;

  const staleUrl = new URL(freshUrl);
  staleUrl.pathname = `/.internal-cache/ai-frontier-live-${CACHE_VERSION}-stale`;
  return {
    fresh: new Request(freshUrl.toString(), { method: "GET" }),
    stale: new Request(staleUrl.toString(), { method: "GET" }),
  };
}

function cachedResponse(response, cacheState) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(JSON_HEADERS)) headers.set(key, value);
  headers.set("X-AI-Radar-Cache", cacheState);
  if (cacheState === "STALE") headers.set("Warning", '110 - "Response is stale while official sources refresh"');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function putRadarCache(cache, keys, body) {
  const fresh = new Response(body, {
    headers: {
      "Cache-Control": `public, max-age=${FRESH_CACHE_SECONDS}`,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
  const stale = new Response(body, {
    headers: {
      "Cache-Control": `public, max-age=${STALE_CACHE_SECONDS}`,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
  await Promise.all([cache.put(keys.fresh, fresh), cache.put(keys.stale, stale)]);
}

function schedule(context, promise) {
  const tracked = promise.catch((error) => {
    console.error(JSON.stringify({ message: "AI frontier cache refresh failed", error: safeErrorMessage(error) }));
  });
  if (context && typeof context.waitUntil === "function") {
    context.waitUntil(tracked);
    return null;
  }
  return tracked;
}

async function refreshAndCache(cache, keys) {
  const result = await collectRadarData();
  if (result.cacheable) await putRadarCache(cache, keys, result.body);
}

export async function handleAiFrontierLive(request, _env, context) {
  if (request.method !== "GET") {
    return jsonResponse(JSON.stringify({ error: "Method not allowed" }), { Allow: "GET" }, 405);
  }

  const cache = getDefaultCache();
  const keys = cacheKeys(request);
  if (cache) {
    const fresh = await cache.match(keys.fresh);
    if (fresh) return cachedResponse(fresh, "HIT");

    const stale = await cache.match(keys.stale);
    if (stale) {
      const pending = schedule(context, refreshAndCache(cache, keys));
      if (pending) await pending;
      return cachedResponse(stale, "STALE");
    }
  }

  const result = await collectRadarData();
  if (cache && result.cacheable) {
    const pending = schedule(context, putRadarCache(cache, keys, result.body));
    if (pending) await pending;
  }

  return jsonResponse(result.body, {
    "X-AI-Radar-Cache": cache ? "MISS" : "BYPASS",
    "X-AI-Radar-Status": result.status,
  });
}
