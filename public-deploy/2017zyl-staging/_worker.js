// Custom Worker for patrick-reports (CF Workers + Assets mode).
// 07-04 EXTEND: 加上 /api/ticker + /api/jobs 两个 endpoint (从 agent-tasks.jsonl 派生)
//               用于 mission-control.html 的 LIVE mode
// 07-06 EXTEND: 加 /api/design endpoint (从 state/html-design-library.json 派生)
//               用于 design-library-dashboard + mission-control stat card
// 07-09 EXTEND: 加 /api/salon endpoint (LLM-driven 3-round philosophy debate)
//               用于 philosophy-salon 圆桌辩论 — 接收 topic + persona payloads,
//               调 Claude API 生成 3 轮对话,返回 JSON
export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    let path = url.pathname;

    // === CORS preflight (POST /api/salon) ===
    if (request.method === "OPTIONS" && path.startsWith("/api/")) {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
        },
      });
    }

    // === API routes (07-04 + 07-06 + 07-09 NEW) ===
    if (path === "/api/ticker" || path === "/api/jobs" || path === "/api/design") {
      return handleApi(path, url, env, request);
    }

    // === POST /api/salon — Grad 2: 1-shot LLM JSON output (legacy) ===
    if (path === "/api/salon" && request.method === "POST") {
      return handleSalonApi(request, env);
    }

    // === POST /api/salon/agent — Grad 3: multi-turn multi-agent debate ===
    if (path === "/api/salon/agent" && request.method === "POST") {
      return handleSalonAgentApi(request, env);
    }

    // === /api/llm-salon/* — Mirror local proxy at 127.0.0.1:9876 (07-12 NEW) ===
    // Lets /llm-salon/ page reach the API same-origin instead of trying to call localhost.
    if (path.startsWith("/api/llm-salon")) {
      return handleLlmSalonApi(request, env);
    }

    // === POST /api/feedback — daily-reports chip → email (07-14 NEW) ===
    // Sends chip score (+ optional text from modal) to patrick.l.zeng@outlook.com
    // via the Cloudflare Email Service REST API.
    // Required env secrets: CF_API_TOKEN (Account level, Email Sending:Edit + Email Sending:Read).
    // Required zone setup: `wrangler email sending enable 2017zyl.xyz` (one-shot terminal).
    if (path === "/api/feedback" && request.method === "POST") {
      return handleFeedbackApi(request, env);
    }

    const archiveRepair = await repairDailyReportArchivePath(path, url, env, request);
    if (archiveRepair) return archiveRepair;

    // /<name>.html → /<name>  (308 Permanent Redirect)
    if (path.endsWith('.html') && path !== '/index.html') {
      return Response.redirect(new URL(path.slice(0, -5), url).toString(), 308);
    }
    // 路径无 .html → 尝试加 .html 找 ASSETS (如 /day_recommend → day_recommend.html)
    let resp = await env.ASSETS.fetch(request);
    if (resp.status === 404) {
      const tryHtml = path.endsWith('/') ? path + 'index.html' : path + '.html';
      const tryReq = new Request(new URL(tryHtml, url).toString(), request);
      const tryResp = await env.ASSETS.fetch(tryReq);
      if (tryResp.ok) {
        // 重定向到 .html 版本 (保持 URL 干净)
        return Response.redirect(new URL(tryHtml, url).toString(), 308);
      }
    }
    return resp;
  },
};

async function repairDailyReportArchivePath(path, url, env, request) {
  if (!path.startsWith("/daily-reports/")) return null;

  const original = await env.ASSETS.fetch(request);
  if (original.ok) return null;

  const suffix = path.slice("/daily-reports/".length);
  const candidates = [];

  if (suffix.startsWith("daily-reports/")) {
    candidates.push("/" + suffix);
  }
  candidates.push("/" + suffix);

  for (const candidate of candidates) {
    if (!candidate || candidate === path) continue;
    const candidateUrl = new URL(candidate, url);
    const candidateReq = new Request(candidateUrl.toString(), request);
    const candidateResp = await env.ASSETS.fetch(candidateReq);
    if (candidateResp.ok) {
      const cleanPath = candidate.endsWith("/index.html")
        ? candidate.slice(0, -"index.html".length)
        : candidate;

      return Response.redirect(new URL(cleanPath || "/", url).toString(), 308);
    }
  }

  return null;
}


// === POST /api/salon/agent implementation (07-09 NEW, Grad 3) ===
// Multi-turn multi-agent philosophy debate.
// Each persona = 1 independent LLM agent with its own system prompt and history.
// Server runs a 4-round dialogue loop:
//   Round 0: 1 moderator LLM call (Socrates preferred) opens the discussion.
//   Round 1: 6 persona LLM calls in parallel (Promise.all), each sees Round 0 + the topic.
//   Round 2: 5 persona LLM calls in parallel (moderator excluded), each sees Rounds 0+1 + their own Round 1.
//   Round 3: 1 moderator summary + 1 closing speaker LLM call.
//
// Frontend POSTs {topic, persona_ids?: [...]} (default = top 6 scored by quick local heuristic).
// Returns the full structured debate JSON.
async function handleSalonAgentApi(request, env) {
  const cors = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  };

  let body;
  try { body = await request.json(); } catch (e) {
    return new Response(JSON.stringify({ error: `invalid JSON body: ${e.message}` }), { status: 400, headers: cors });
  }
  const topic = (body.topic || "").trim();
  let personaIds = Array.isArray(body.persona_ids) ? body.persona_ids.slice(0, 6) : null;
  if (!topic) return new Response(JSON.stringify({ error: "topic is required" }), { status: 400, headers: cors });
  if (personaIds && (personaIds.length < 2 || personaIds.length > 6)) {
    return new Response(JSON.stringify({ error: "persona_ids length must be 2-6" }), { status: 400, headers: cors });
  }

  const apiKey = env.MINIMAX_TOKEN || env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "no LLM key" }), { status: 500, headers: cors });
  const isMinimax = apiKey.startsWith("sk-cp-") || !!env.MINIMAX_TOKEN;
  const apiUrl = isMinimax ? "https://api.minimax.io/anthropic/v1/messages" : "https://api.anthropic.com/v1/messages";
  const authHeaders = isMinimax ? { "authorization": `Bearer ${apiKey}` } : { "x-api-key": apiKey };

  // Load agent profiles from ASSETS
  let allProfiles = [];
  try {
    const r = await env.ASSETS.fetch(new URL("/philosophy-salon/agent-profiles.json", new URL(request.url)));
    if (!r.ok) throw new Error(`ASSETS ${r.status}`);
    allProfiles = await r.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: `cannot load agent-profiles.json: ${e.message}` }), { status: 502, headers: cors });
  }
  const byId = new Map(allProfiles.map(p => [p.id, p]));

  // Pick panel
  let panel = [];
  if (personaIds) {
    panel = personaIds.map(id => byId.get(id)).filter(Boolean);
  }
  if (panel.length < 3) {
    // Default: top 6 of a curated "famous philosophers" starter set
    const defaultIds = ["socrates", "plato", "aristotle", "confucius", "laozi", "kant"];
    panel = defaultIds.map(id => byId.get(id)).filter(Boolean);
  }
  if (panel.length < 3) {
    return new Response(JSON.stringify({ error: "not enough agents available" }), { status: 500, headers: cors });
  }
  // Moderator: prefer Socrates, else first panelist
  let moderator = panel.find(p => p.id === "socrates") || panel[0];
  let speakers = panel.filter(p => p.id !== moderator.id);

  // === One LLM call helper ===
  async function llmCall(systemPrompt, userMsg, maxTokens = 350) {
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", ...authHeaders },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "(no body)");
      throw new Error(`llm ${resp.status}: ${errText.slice(0, 300)}`);
    }
    const data = await resp.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
    return text;
  }

  // === Round 0: moderator opens ===
  // Moderator system prompt: a tight 3-line system for the moderator role
  const modSystemPrompt = `你是一位 2500 年哲学史的资深主持人。你的工作是简短地为圆桌辩论定调:提出核心张力、设定讨论边界、并明确 3-4 位需要被追问的发言者。不要总结、不要讲大道理,只点燃话题。

风格:开场白应像一位召集学者聚会的长者,具体而克制,150-250 字。`;
  const modUser = `议题:"${topic}"\n圆桌 panel(${panel.length} 位,按以下顺序):${panel.map(p => `${p.id}(${(p.identity || '').split('(')[0].trim()})`).join('、')}\n请生成一段开场白,1 段,150-250 字。`;

  let modText;
  try {
    modText = await llmCall(modSystemPrompt, modUser, 400);
  } catch (e) {
    return new Response(JSON.stringify({ error: `round 0 (moderator) failed: ${e.message}` }), { status: 502, headers: cors });
  }

  // === Round 1: 6 personas respond in parallel ===
  // Each agent's user msg = topic + Round 0 moderator text
  const round1UserFor = (p) => `议题:"${topic}"\n\n主持人开场:\n${modText}\n\n请发表你自己的第一轮立场(1-3 段,150-300 字,中文优先)。记住你是 ${p.id},请用你自己的声音。`;

  // === Round 2: 5 personas respond to Round 1 in parallel ===
  // Each agent's user msg = topic + Round 0 + Round 1 (all 6) + their own Round 1
  const round2UserFor = (p, r1All, r1Mine) => {
    const others = r1All.filter(s => s.id !== p.id);
    const r1Block = others.map(s => `【${s.name}】\n${s.text}`).join("\n\n");
    return `议题:"${topic}"\n\n你上轮说:\n${r1Mine.text}\n\n其他人上轮说:\n${r1Block}\n\n现在请回应(反驳/追问/补充)上面至少一位发言者。1-3 段,150-300 字,中文优先,语气你自己的。`;
  };

  // === Round 3: moderator summary + closing speaker ===
  const closingSpeaker = speakers[0];  // first non-moderator

  // === Run the loop ===
  // Round 1: parallel calls
  let r1Results;
  try {
    r1Results = await Promise.all(speakers.map(async (p) => {
      try {
        const text = await llmCall(p.voice_system_prompt, round1UserFor(p), 350);
        return { id: p.id, name: p.identity.split('(')[0].trim(), text, error: null };
      } catch (e) {
        return { id: p.id, name: p.identity.split('(')[0].trim(), text: `(本轮失败: ${e.message.slice(0, 80)})`, error: e.message };
      }
    }));
  } catch (e) {
    return new Response(JSON.stringify({ error: `round 1 parallel failed: ${e.message}` }), { status: 502, headers: cors });
  }

  // Round 2: parallel calls (skip moderator)
  let r2Results;
  try {
    r2Results = await Promise.all(speakers.map(async (p) => {
      const r1Mine = r1Results.find(s => s.id === p.id);
      if (!r1Mine || r1Mine.error) {
        return { id: p.id, name: p.identity.split('(')[0].trim(), text: `(跳过: Round 1 失败)`, error: r1Mine ? r1Mine.error : 'no r1' };
      }
      try {
        const text = await llmCall(p.voice_system_prompt, round2UserFor(p, r1Results, r1Mine), 350);
        return { id: p.id, name: p.identity.split('(')[0].trim(), text, error: null };
      } catch (e) {
        return { id: p.id, name: p.identity.split('(')[0].trim(), text: `(本轮失败: ${e.message.slice(0, 80)})`, error: e.message };
      }
    }));
  } catch (e) {
    return new Response(JSON.stringify({ error: `round 2 parallel failed: ${e.message}` }), { status: 502, headers: cors });
  }

  // Round 3: moderator summary + closing speaker
  const r1Block = r1Results.map(s => `【${s.name}】\n${s.text}`).join("\n\n");
  const r2Block = r2Results.map(s => `【${s.name}】\n${s.text}`).join("\n\n");
  const r3SummaryUser = `议题:"${topic}"\n\n第 1 轮发言:\n${r1Block}\n\n第 2 轮发言:\n${r2Block}\n\n现在请做 1 段总结,200-350 字,指出最尖锐的分歧(指明 1-2 位具体人物名字)+ 共识范围 + 仍有待回答的问题。`;

  const r3ClosingUser = `议题:"${topic}"\n\n前两轮你已经说了:\n${r1Results.find(s => s.id === closingSpeaker.id)?.text || ''}\n\n其他人也回应了。请做收束性的终辩发言(1 段,150-300 字),用你自己的声音,说说你现在认为什么是最重要且最被忽视的。`;

  let modSummary, closingText;
  try {
    [modSummary, closingText] = await Promise.all([
      llmCall(modSystemPrompt, r3SummaryUser, 450),
      llmCall(closingSpeaker.voice_system_prompt, r3ClosingUser, 350),
    ]);
  } catch (e) {
    return new Response(JSON.stringify({ error: `round 3 failed: ${e.message}` }), { status: 502, headers: cors });
  }

  // Build the debate script in front-end's expected shape
  const rounds = [
    {
      title: "第 0 轮 · 主持人开场",
      speeches: [{ type: "moderator", speaker_idx: 0, text: modText }],
    },
    {
      title: "第 1 轮 · 立场陈述",
      speeches: r1Results.map((r, i) => ({
        type: "speech",
        speaker_idx: i + 1,  // +1 because moderator is 0
        text: r.text,
        // Embed speaker info for the front-end post-processor
        speaker: { id: r.id, name_zh: r.name, name_en: r.name },
        // No quote; just free text
      })),
    },
    {
      title: "第 2 轮 · 交叉质询",
      speeches: r2Results.map((r, i) => ({
        type: "speech",
        speaker_idx: i + 1,
        text: r.text,
        speaker: { id: r.id, name_zh: r.name, name_en: r.name },
      })),
    },
    {
      title: "第 3 轮 · 总结与终辩",
      speeches: [
        { type: "moderator_close", speaker_idx: 0, text: modSummary, speaker: { id: moderator.id, name_zh: moderator.identity.split('(')[0].trim() } },
        { type: "final", speaker_idx: panel.findIndex(p => p.id === closingSpeaker.id), text: closingText, speaker: { id: closingSpeaker.id, name_zh: closingSpeaker.identity.split('(')[0].trim() }, is_closing: true },
      ],
    },
  ];

  return new Response(JSON.stringify({
    rounds,
    panel: panel.map(p => ({ id: p.id, name_zh: p.identity.split('(')[0].trim() })),
    moderator: { id: moderator.id, name_zh: moderator.identity.split('(')[0].trim() },
    model: "claude-sonnet-4-5",
    provider: isMinimax ? "minimax (Anthropic-compatible)" : "anthropic",
    grad: 3,
    fetched_at: new Date().toISOString(),
  }), { headers: cors });
}


// === POST /api/salon implementation (07-09 NEW, Grad 2 legacy) ===
// LLM-driven 3-round philosophy debate.
// Frontend POSTs {topic, personas:[{id, name_zh, name_en, era, tradition, school,
//   core_theses[], counter_patterns[], quotes:[{zh, en, source_zh, source_en}]}],
// worker calls Claude API to generate moderator opening + 6 opening positions
// + 5 cross-examinations + closing summary + final word. Returns JSON.
async function handleSalonApi(request, env) {
  const cors = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  };

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: `invalid JSON body: ${e.message}` }), {
      status: 400, headers: cors,
    });
  }
  const topic = (body.topic || "").trim();
  const personas = Array.isArray(body.personas) ? body.personas : [];
  if (!topic) {
    return new Response(JSON.stringify({ error: "topic is required" }), {
      status: 400, headers: cors,
    });
  }
  if (personas.length < 2 || personas.length > 8) {
    return new Response(JSON.stringify({ error: "personas length must be 2-8" }), {
      status: 400, headers: cors,
    });
  }

  // Check secret
  const apiKey = env.MINIMAX_TOKEN || env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "MINIMAX_TOKEN not configured", env_keys: Object.keys(env || {}) }), {
      status: 500, headers: cors,
    });
  }

  // Use minimax (Anthropic-compatible) endpoint if token looks like OAuth bearer
  // (sk-cp-...); otherwise default to api.anthropic.com
  const isMinimax = apiKey.startsWith("sk-cp-") || !!env.MINIMAX_TOKEN;
  const apiUrl = isMinimax
    ? "https://api.minimax.io/anthropic/v1/messages"
    : "https://api.anthropic.com/v1/messages";
  const authHeaders = isMinimax
    ? { "authorization": `Bearer ${apiKey}` }
    : { "x-api-key": apiKey };

  // Build the prompt
  const personasBlock = personas.map((p, i) => {
    const theses = (p.core_theses || []).slice(0, 5).join(" / ");
    const counter = (p.counter_patterns || []).slice(0, 3).join(" / ");
    const sampleQuote = (p.quotes && p.quotes[0]) ? `${p.quotes[0].zh} — ${p.quotes[0].source_zh}` : "(无 quote 样本)";
    // CRITICAL: bind idx to persona name explicitly so model doesn't swap them
    return `【persona_idx=${i}】 姓名: ${p.name_zh} (${p.name_en})
    朝代/学派: ${p.era} · ${p.tradition} / ${p.school}
    核心立场: ${theses || "(无)"}
    常见反驳: ${counter || "(无)"}
    代表语录: ${sampleQuote}`;
  }).join("\n\n");

  const systemPrompt = `你是一位 2500 年哲学史的圆桌辩论主持人。任务:组织以下 ${personas.length} 位思想家就用户提出的议题进行 **3 轮对话**(实际是 4 轮包括 0 轮主持人开场 + 3 轮发言)。

## 关键约束 (FAIL = 无效输出):
1. **persona_idx 是绝对身份**:每个发言的 speaker_idx 必须填对应该说话的人的下标。绝不允许混淆 — 0 号位的人说 0 号位的立场,绝不能用 0 号位的 quote 套到 1 号位的 thesis 上。
2. **每段 quote 必须从该 speaker_idx 对应 persona 的 quotes 列表中选一条真实的 quote**,把 quote_zh / quote_en / source_zh / source_en 都填上(若 quotes 列表为空,方可生成符合该人物风格的 quote 并在 source 字段标注 [合成语录])。
3. **不要把 quote 错配人物**。如果 persona_idx=0 是苏格拉底,他的 quote 必须是苏格拉底的 quote,不能是康德的。
4. **counter 字段(Round 2)必须真有锋芒**,不是客套,要能引发实际辩论。

## 输出 Schema (严格 JSON,不要任何 markdown 包裹):
{
  "rounds": [
    {
      "title": "第 0 轮 · 主持人开场",
      "speeches": [
        { "type": "moderator", "speaker_idx": <int>, "text": "<string>" }
      ]
    },
    {
      "title": "第 1 轮 · 立场陈述",
      "speeches": [
        { "type": "speech", "speaker_idx": <int>, "thesis": "<string 1 句,直接陈述自己的核心立场,不'回应他人'>", "quote_zh": "<从该 persona quotes 选>", "quote_en": "<英译>", "source_zh": "<出处>", "source_en": "<英译出处>" }
      ]
    },
    {
      "title": "第 2 轮 · 交叉质询",
      "speeches": [
        { "type": "speech", "speaker_idx": <int>, "target_idx": <int 不同人!>, "counter": "<真锋芒的反方论调>", "thesis": "<自己的立场重申/延伸>", "quote_zh": "<从该 speaker quotes 选>", "quote_en": "<英译>", "source_zh": "<出处>", "source_en": "<英译出处>" }
      ]
    },
    {
      "title": "第 3 轮 · 总结与终辩",
      "speeches": [
        { "type": "moderator_close", "speaker_idx": <int 同 0 轮主持人>, "text": "<总结前 3 轮,指出最尖锐分歧 + 共识范围,引用 1-2 位具体 speaker 名字>" },
        { "type": "final", "speaker_idx": <int 不同于主持人>, "thesis": "<收束立场>", "quote_zh": "<从该 persona quotes 选>", "quote_en": "<英译>", "source_zh": "<出处>", "source_en": "<英译出处>" }
      ]
    }
  ]
}

## Round 数量 + speech 数量:
- Round 0: 1 个 moderator speech。
- Round 1: ${personas.length} 个 speech,每人 1 个。
- Round 2: ${personas.length - 1} 个 speech,主持人除外。target_idx 不能 speaker_idx == target_idx。
- Round 3: 1 个 moderator_close + 1 个 final。

## 风格要求:
- 中文表达自然有锋芒,不要 AI 八股。
- 反方发言 (counter) 必须有锋芒,要能引发实际辩论,不能是客套。
- 整段输出一次成型,不要解释,不要 markdown 包裹,只输出 JSON。`;

  const userPrompt = `议题: "${topic}"

圆桌 panel (${personas.length} 位,按以下顺序):
${personasBlock}

请生成 3 轮辩论 JSON。`;

  // Call Claude API (or minimax Anthropic-compatible endpoint)
  let apiResp;
  try {
    apiResp = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        ...authHeaders,
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `anthropic fetch failed: ${e.message}` }), {
      status: 502, headers: cors,
    });
  }

  if (!apiResp.ok) {
    const errText = await apiResp.text().catch(() => "(no body)");
    return new Response(JSON.stringify({ error: `anthropic ${apiResp.status}: ${errText.slice(0, 500)}` }), {
      status: apiResp.status, headers: cors,
    });
  }

  const apiData = await apiResp.json();
  // Extract text from content blocks
  const text = (apiData.content || [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");
  if (!text) {
    return new Response(JSON.stringify({ error: "anthropic returned no text" }), {
      status: 502, headers: cors,
    });
  }

  // Parse Claude's JSON response — strip any markdown fencing
  let debateScript;
  try {
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```[a-z]*\s*\n?/i, "").replace(/```\s*$/, "");
    }
    debateScript = JSON.parse(cleaned);
  } catch (e) {
    return new Response(JSON.stringify({
      error: `LLM did not return valid JSON: ${e.message}`,
      raw: text.slice(0, 2000),
    }), {
      status: 502, headers: cors,
    });
  }

  // Map speaker_idx back to persona id + augment with front-end fields
  try {
    for (const round of (debateScript.rounds || [])) {
      for (const sp of (round.speeches || [])) {
        if (typeof sp.speaker_idx === "number" && personas[sp.speaker_idx]) {
          sp.speaker = personas[sp.speaker_idx];
        }
        if (typeof sp.target_idx === "number" && personas[sp.target_idx]) {
          sp.target = personas[sp.target_idx];
        }
        // Normalize quote shape: front-end expects {zh, en, source_zh, source_en}
        if (sp.quote_zh) {
          sp.quote = {
            zh: sp.quote_zh,
            en: sp.quote_en || "",
            source_zh: sp.source_zh || "",
            source_en: sp.source_en || "",
            tags: [],
          };
        }
        if (sp.is_closing === undefined && sp.type === "final") sp.is_closing = true;
      }
    }
  } catch (e) {
    // non-fatal
  }

  return new Response(JSON.stringify({
    rounds: debateScript.rounds || [],
    model: "claude-sonnet-4-5",
    provider: isMinimax ? "minimax (Anthropic-compatible)" : "anthropic",
    fetched_at: new Date().toISOString(),
  }), { headers: cors });
}


// === /api/ticker + /api/jobs implementation ===
async function handleApi(path, url, env, request) {
  const cors = {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  };
  // Read jsonl via ASSETS binding
  let text;
  try {
    const r = await env.ASSETS.fetch(new URL("/agent-tasks/agent-tasks.jsonl", url));
    if (!r.ok) throw new Error(`ASSETS fetch ${r.status}`);
    text = await r.text();
  } catch (e) {
    return new Response(JSON.stringify({ error: `cannot read jsonl: ${e.message}` }), {
      status: 502,
      headers: cors,
    });
  }

  if (path === "/api/ticker") {
    const sinceParam = url.searchParams.get("since");
    const since = sinceParam ? new Date(sinceParam).getTime() : 0;
    const events = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      const t = new Date(row.started_at).getTime();
      if (t <= since) continue;
      const isErr = row.status !== "done" || (row.error && row.error.length > 0);
      let msg = "";
      if (row.metrics) {
        const parts = [];
        for (const [k, v] of Object.entries(row.metrics)) {
          if (typeof v === "number" && v > 0) parts.push(`${k}=${v}`);
        }
        if (parts.length) msg = parts.join(" · ");
      }
      if (row.error) {
        const errShort = String(row.error).split("\n")[0].slice(0, 80);
        msg = msg ? `${msg} · ${errShort}` : errShort;
      }
      if (!msg) msg = `${row.status} · ${row.latency_ms}ms`;
      events.push({ t: row.started_at, src: row.task_name, st: isErr ? "error" : "ok", msg });
    }
    events.sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime());
    return new Response(JSON.stringify({ events, fetched_at: new Date().toISOString() }), { headers: cors });
  }

  if (path === "/api/jobs") {
    const byName = new Map();
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      const cur = byName.get(row.task_name) || {
        task_name: row.task_name,
        runs: 0,
        errors: 0,
        last_run_at: null,
        last_status: null,
      };
      cur.runs += 1;
      if (row.status !== "done" || (row.error && row.error.length > 0)) cur.errors += 1;
      if (!cur.last_run_at || row.started_at > cur.last_run_at) {
        cur.last_run_at = row.started_at;
        cur.last_status = row.status;
      }
      byName.set(row.task_name, cur);
    }
    const jobs = Array.from(byName.values()).sort(
      (a, b) => new Date(b.last_run_at).getTime() - new Date(a.last_run_at).getTime(),
    );
    return new Response(
      JSON.stringify({
        jobs,
        source: "agent-tasks.jsonl",
        note: "subset of full cron registry — only publish-tasks captured here",
        fetched_at: new Date().toISOString(),
      }),
      { headers: cors },
    );
  }

  // === /api/design implementation (07-06 NEW) ===
  // Reads state/html-design-library.json from ASSETS, computes aggregate stats + lists fails.
  if (path === "/api/design") {
    let designText;
    try {
      const r = await env.ASSETS.fetch(new URL("/state/html-design-library.json", url));
      if (!r.ok) throw new Error(`ASSETS fetch ${r.status}`);
      designText = await r.text();
    } catch (e) {
      return new Response(JSON.stringify({ error: `cannot read design state: ${e.message}` }), {
        status: 502,
        headers: cors,
      });
    }
    let state;
    try { state = JSON.parse(designText); } catch (e) {
      return new Response(JSON.stringify({ error: `design state parse: ${e.message}` }), {
        status: 502,
        headers: cors,
      });
    }
    const sites = state.sites || {};
    const stats = { pass: 0, shell: 0, wall: 0, tld: 0, network: 0, fail: 0 };
    const fails = [];
    const networkBlocked = [];
    for (const [name, s] of Object.entries(sites)) {
      const st = s.status || "UNKNOWN";
      if (st === "PASS") stats.pass++;
      else if (st === "PASS-SHELL") stats.shell++;
      else if (st === "CF-WALL" || st === "VERCEL-CHECKPOINT") stats.wall++;
      else if (st === "TLD-BLOCKED") stats.tld++;
      else if (st === "NETWORK-BLOCKED") { stats.network++; networkBlocked.push({ name, url: s.url }); }
      else { stats.fail++; fails.push({ name, url: s.url, code: s.http_code, note: s.cf_wall ? "CF wall" : s.vercel_checkpoint ? "Vercel" : "" }); }
    }
    return new Response(
      JSON.stringify({
        last_sweep: state.last_sweep,
        total: Object.keys(sites).length,
        stats,
        fails,
        network_blocked: networkBlocked,
        source: "state/html-design-library.json",
        fetched_at: new Date().toISOString(),
      }),
      { headers: cors },
    );
  }
}// === LLM Salon API (07-12 NEW) ===
// Mirrors the local Python proxy at 127.0.0.1:9876 (see ~/.llm-salon/scripts/llm-salon-proxy.py)
// so the deployed /llm-salon/ page can reach the API via same-origin /api/llm-salon/*.
// Falls back gracefully when secrets missing. Backends:
//   - openrouter (env.OPENROUTER_API_KEY) — for free OpenRouter models
//   - minimax    (env.MINIMAX_TOKEN)      — for paid MiniMax vendor-direct
// Dispatch: model_id prefix → backend (matches local proxy).
// Required env secrets: OPENROUTER_API_KEY, MINIMAX_TOKEN.

const LLM_SALON_FREE_MODELS = [
  { id: "openai/gpt-oss-120b:free", provider: "OpenAI", short: "GPT-OSS 120B", ctx: 131072, tier: "free",
    blurb: "OpenAI's open-weight 120B. Only OpenRouter free model that returned a real answer in the 2026-07-09 curation test." },
];
const LLM_SALON_PAID_MODELS = [
  { id: "MiniMax/MiniMax-M2",     provider: "MiniMax", backend: "minimax", short: "MiniMax M2",     ctx: 200000, tier: "paid", blurb: "MiniMax M2 flagship. Reasoning + Chinese strong." },
  { id: "MiniMax/MiniMax-M2.7",   provider: "MiniMax", backend: "minimax", short: "MiniMax M2.7",   ctx: 200000, tier: "paid", blurb: "MiniMax M2.7 (mid-2026). Balanced cost/quality." },
  { id: "MiniMax/MiniMax-M3",     provider: "MiniMax", backend: "minimax", short: "MiniMax M3",     ctx: 200000, tier: "paid", blurb: "MiniMax M3 (2026 Q3). Latest gen, top of MiniMax tier." },
  { id: "MiniMax/MiniMax-M2.5",   provider: "MiniMax", backend: "minimax", short: "MiniMax M2.5",   ctx: 200000, tier: "paid", blurb: "MiniMax M2.5. Stable, fast, decent quality." },
  { id: "MiniMax/MiniMax-M2.1",   provider: "MiniMax", backend: "minimax", short: "MiniMax M2.1",   ctx: 128000, tier: "paid", blurb: "MiniMax M2.1. Older, cheapest. Good fallback." },
];

const LLM_SALON_BACKENDS = {
  openrouter: { url: "https://openrouter.ai/api/v1", path: "/chat/completions" },
  minimax:    { url: "https://api.minimax.io/v1",   path: "/chat/completions" },
};

// === Per-request key resolution (Cloudflare Workers reads secrets via env, not globals) ===
function llmSalonKey(env, backend) {
  if (backend === "openrouter") return (env && env.OPENROUTER_API_KEY) || "";
  if (backend === "minimax")    return (env && (env.MINIMAX_TOKEN || env.MINIMAX_API_KEY)) || "";
  return "";
}

function llmSalonBackendFor(model) {
  if (model.endsWith(":free")) return "openrouter";
  if (model.startsWith("MiniMax/")) return "minimax";
  return "openrouter";
}

async function llmSalonCall(model, messages, opts = {}) {
  const env = opts.env || {};
  const maxTokens = Math.max(opts.maxTokens || 800, model.startsWith("MiniMax/") ? 2500 : 800);
  const temperature = opts.temperature ?? 0.8;
  const backend = llmSalonBackendFor(model);
  const cfg = LLM_SALON_BACKENDS[backend];
  const key = llmSalonKey(env, backend);
  if (!key) {
    return { ok: false, text: null, error: `backend '${backend}' key not configured`, model, latency_ms: 0 };
  }
  // Strip vendor prefix when sending to native endpoints; OpenRouter keeps full slug.
  // e.g. "MiniMax/MiniMax-M2" → "MiniMax-M2" for MiniMax native API.
  const upstreamModel = (backend === "openrouter")
    ? model
    : (model.includes("/") ? model.split("/").slice(1).join("/") : model);
  const body = JSON.stringify({
    model: upstreamModel,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: false,
  });
  const headers = {
    "authorization": `Bearer ${key}`,
    "content-type": "application/json",
  };
  if (backend === "openrouter") {
    headers["http-referer"] = "https://2017zyl.xyz/llm-salon/";
    headers["x-title"] = "LLM Salon";
  }
  const t0 = Date.now();
  try {
    const resp = await fetch(cfg.url + cfg.path, { method: "POST", headers, body });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      return { ok: false, text: null, error: `HTTP ${resp.status}: ${errBody.slice(0, 200)}`, model, latency_ms: Date.now() - t0 };
    }
    const data = await resp.json();
    const msg = (data.choices && data.choices[0] && data.choices[0].message) || {};
    let text = msg.content || msg.reasoning;
    if (!text && Array.isArray(msg.reasoning_details) && msg.reasoning_details[0]) {
      text = msg.reasoning_details[0].text || "";
    }
    if (!text) text = "[empty response — model returned no content]";
    // MiniMax models wrap answer in <think>...</think> — strip reasoning block for user-facing view.
    if (backend === "minimax" && text.includes("</think>")) {
      text = text.split("</think>")[1].trim();
      if (!text) text = "[MiniMax returned only reasoning, no final answer]";
    }
    return { ok: true, text, model, latency_ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, text: null, error: `${e.name || "Error"}: ${e.message || e}`, model, latency_ms: Date.now() - t0 };
  }
}

// === handleLlmSalonApi — mirrors 127.0.0.1:9876 proxy endpoints ===
async function handleLlmSalonApi(request, env) {
  const cors = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/llm-salon/, "");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  // ── /health — backend key status + model counts ──
  if (path === "/health" || path === "" || path === "/") {
    const orKey = env.OPENROUTER_API_KEY || "";
    const mxKey = env.MINIMAX_TOKEN || env.MINIMAX_API_KEY || "";
    return new Response(JSON.stringify({
      ok: true,
      free_models: LLM_SALON_FREE_MODELS.length,
      paid_models: LLM_SALON_PAID_MODELS.length,
      backends: {
        openrouter: { configured: !!orKey, preview: orKey ? `${orKey.slice(0,6)}...${orKey.slice(-4)}` : "" },
        minimax:    { configured: !!mxKey, preview: mxKey ? `${mxKey.slice(0,6)}...${mxKey.slice(-4)}` : "" },
      },
      served_from: "cf-worker",
    }), { headers: cors });
  }

  // ── /v1/models — free tier ──
  if (path === "/v1/models" && request.method === "GET") {
    return new Response(JSON.stringify({ object: "list", data: LLM_SALON_FREE_MODELS }), { headers: cors });
  }

  // ── /v1/models/paid — paid tier ──
  if (path === "/v1/models/paid" && request.method === "GET") {
    return new Response(JSON.stringify({ object: "list", data: LLM_SALON_PAID_MODELS }), { headers: cors });
  }

  // ── /v1/chat — single chat (kept for parity, page uses batch) ──
  if (path === "/v1/chat" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch (e) {
      return new Response(JSON.stringify({ error: `invalid JSON: ${e.message}` }), { status: 400, headers: cors });
    }
    const model = body.model;
    const messages = body.messages || [];
    if (!model || !messages.length) {
      return new Response(JSON.stringify({ error: "model + messages required" }), { status: 400, headers: cors });
    }
    const result = await llmSalonCall(model, messages, { maxTokens: body.max_tokens, temperature: body.temperature, env });
    return new Response(JSON.stringify({ ok: true, ...result }), { headers: cors });
  }

  // ── /v1/chat/batch — N models parallel ──
  if (path === "/v1/chat/batch" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch (e) {
      return new Response(JSON.stringify({ error: `invalid JSON: ${e.message}` }), { status: 400, headers: cors });
    }
    let models;
    if (Array.isArray(body.models) && body.models.length) {
      models = body.models;
    } else {
      // Default: free + paid (matches local proxy)
      models = [...LLM_SALON_FREE_MODELS.map(m => m.id), ...LLM_SALON_PAID_MODELS.map(m => m.id)];
    }
    const messages = body.messages || [];
    const maxTokens = body.max_tokens || 800;
    const temperature = body.temperature ?? 0.8;
    const systemPrompt = body.system || "";
    const userMessage = messages[messages.length - 1]?.content || body.question || "";
    if (!userMessage) {
      return new Response(JSON.stringify({ error: "messages or question required" }), { status: 400, headers: cors });
    }
    // Always build a non-empty messages array. Page sends `question` field; we materialize
    // it into [{role:"user", content:question}]. If caller provided messages, use those.
    const baseMessages = messages.length
      ? messages
      : [{ role: "user", content: userMessage }];
    const fullMessages = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...baseMessages]
      : baseMessages;
    const settled = await Promise.allSettled(
      models.map(m => llmSalonCall(m, fullMessages, { maxTokens, temperature, env }))
    );
    const results = settled.map((s, i) => s.status === "fulfilled"
      ? s.value
      : { ok: false, text: null, error: `${s.reason}`, model: models[i], latency_ms: 0 });
    return new Response(JSON.stringify({
      ok: true,
      question: userMessage,
      system: systemPrompt,
      count: results.length,
      results,
    }), { headers: cors });
  }

  // ── /v1/chat/diss — 2 models 3 rounds ──
  if (path === "/v1/chat/diss" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch (e) {
      return new Response(JSON.stringify({ error: `invalid JSON: ${e.message}` }), { status: 400, headers: cors });
    }
    const modelA = body.model_a || body.modelA;
    const modelB = body.model_b || body.modelB;
    const topic = body.topic || body.question || "";
    if (!modelA || !modelB || !topic) {
      return new Response(JSON.stringify({ error: "model_a, model_b, topic required" }), { status: 400, headers: cors });
    }
    const sysPrompt = body.system || "You are participating in a 3-round debate. Be sharp, opinionated, and concise (3-5 sentences per reply).";
    const round1 = [
      { role: "system", content: sysPrompt + "\n\nRound 1: State your position on the topic." },
      { role: "user", content: topic },
    ];
    const r1 = await Promise.all([
      llmSalonCall(modelA, round1, { env }),
      llmSalonCall(modelB, round1, { env }),
    ]);
    const textA1 = r1[0].text || "";
    const textB1 = r1[1].text || "";
    const round2A = [
      { role: "system", content: sysPrompt + `\n\nRound 2 (rebuttal): The other model said: "${textB1.slice(0, 800)}". Push back in 3-5 sentences.` },
      { role: "user", content: topic },
    ];
    const round2B = [
      { role: "system", content: sysPrompt + `\n\nRound 2 (rebuttal): The other model said: "${textA1.slice(0, 800)}". Push back in 3-5 sentences.` },
      { role: "user", content: topic },
    ];
    const r2 = await Promise.all([llmSalonCall(modelA, round2A, { env }), llmSalonCall(modelB, round2B, { env })]);
    const textA2 = r2[0].text || "";
    const textB2 = r2[1].text || "";
    const round3A = [
      { role: "system", content: sysPrompt + `\n\nRound 3 (closing): Opponent said: "${textB2.slice(0, 800)}". Final 3-5 sentences.` },
      { role: "user", content: topic },
    ];
    const round3B = [
      { role: "system", content: sysPrompt + `\n\nRound 3 (closing): Opponent said: "${textA2.slice(0, 800)}". Final 3-5 sentences.` },
      { role: "user", content: topic },
    ];
    const r3 = await Promise.all([llmSalonCall(modelA, round3A, { env }), llmSalonCall(modelB, round3B, { env })]);
    return new Response(JSON.stringify({
      ok: true,
      topic,
      model_a: modelA,
      model_b: modelB,
      rounds: [
        { round: 1, a: { text: textA1, ...r1[0] }, b: { text: textB1, ...r1[1] } },
        { round: 2, a: { text: textA2, ...r2[0] }, b: { text: textB2, ...r2[1] } },
        { round: 3, a: { text: r3[0].text, ...r3[0] }, b: { text: r3[1].text, ...r3[1] } },
      ],
    }), { headers: cors });
  }

  return new Response(JSON.stringify({ error: `unknown LLM salon path: ${path}` }), { status: 404, headers: cors });
}

// === POST /api/feedback handler — daily-reports chip → Outlook (07-14 NEW) ===
// Accepts JSON: { score: 'off'|'okay'|'great', text?: string, lang?: 'zh-CN'|'en',
//                   from?: string, url?: string, ua?: string }
// Sends via Cloudflare Email Service REST API to patrick.l.zeng@outlook.com.
// Auth (env secret): CF_API_TOKEN (Account-level, Email Sending:Edit + Zones:Read).
// Zone: must run `wrangler email sending enable 2017zyl.xyz` on Patrick's terminal
// (one-shot) before sends will deliver.
//
// PITFALL-guards encoded:
//   - spam guard: score must be one of 3; reject everything else with 400
//   - text length limit: 1000 chars max (server-side cap)
//   - UA already capped client-side via `navigator.userAgent.slice(0,240)`
//   - URL capped server-side to 240 chars (defense vs header log poisoning)
//   - never logs full payload (contains PII feel); only score + masked-from + ts
async function handleFeedbackApi(request, env) {
  const cors = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  };

  if (!env.CF_API_TOKEN) {
    return new Response(JSON.stringify({
      error: "CF_API_TOKEN not configured. Add via: wrangler secret put CF_API_TOKEN",
    }), { status: 503, headers: cors });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: cors,
    });
  }

  const score = String(body.score || "");
  const text  = String(body.text  || "");
  const lang  = String(body.lang  || "zh-CN");
  const url   = String(body.url   || "").slice(0, 240);
  const ua    = String(body.ua    || "").slice(0, 240);
  const from  = String(body.from  || "").slice(0, 80);

  if (!["off", "okay", "great"].includes(score)) {
    return new Response(JSON.stringify({ error: "Invalid score; must be off|okay|great" }), {
      status: 400, headers: cors,
    });
  }
  if (text.length > 1000) {
    return new Response(JSON.stringify({ error: "Text exceeds 1000 chars" }), {
      status: 400, headers: cors,
    });
  }

  // Compose email body
  const scoreLabel = score === "off" ? "偏了" : score === "okay" ? "还行" : "很对味";
  const ts = new Date().toISOString();
  const subject = `[daily-reports] ${scoreLabel}${text ? " + 备注" : ""} · ${ts.slice(0,10)}`;

  const textBody = [
    `Signal: ${scoreLabel} (${score})`,
    `Lang:   ${lang}`,
    `URL:    ${url || "(no referrer)"}`,
    `From:   ${from || "(anonymous)"}`,
    `UA:     ${ua || "(unknown)"}`,
    `Time:   ${ts}`,
    "",
    "--- 备注 ---",
    text || "(无)",
  ].join("\n");

  const htmlBody = `
    <div style="font-family: -apple-system, 'Inter', sans-serif; max-width: 560px; padding: 18px; border: 1px solid #e5e7eb; border-radius: 12px;">
      <div style="font-size: 11px; color: #6b7280; letter-spacing: .12em;">DAILY-REPORTS FEEDBACK SIGNAL</div>
      <h2 style="margin: 8px 0 16px; font-size: 22px;">
        ${scoreLabel} <span style="font-size: 13px; color: #6b7280;">(${score})</span>
      </h2>
      <table style="font-size: 13px; color: #374151; width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 4px 8px; color: #9ca3af;">Lang</td><td style="padding: 4px 8px;">${escapeHtml(lang)}</td></tr>
        <tr><td style="padding: 4px 8px; color: #9ca3af;">URL</td><td style="padding: 4px 8px; word-break: break-all;">${escapeHtml(url) || '<em style="color:#9ca3af">(no referrer)</em>'}</td></tr>
        <tr><td style="padding: 4px 8px; color: #9ca3af;">From</td><td style="padding: 4px 8px;">${escapeHtml(from) || '<em style="color:#9ca3af">(anonymous)</em>'}</td></tr>
        <tr><td style="padding: 4px 8px; color: #9ca3af;">UA</td><td style="padding: 4px 8px; word-break: break-all; color:#9ca3af;">${escapeHtml(ua) || '<em style="color:#9ca3af">(unknown)</em>'}</td></tr>
        <tr><td style="padding: 4px 8px; color: #9ca3af;">Time</td><td style="padding: 4px 8px;">${ts}</td></tr>
      </table>
      <div style="margin-top: 16px; padding: 12px; background: #f9fafb; border-radius: 8px; font-size: 14px; color: #111827;">
        ${text ? escapeHtml(text).replace(/\n/g, "<br>") : '<em style="color:#9ca3af">无备注</em>'}
      </div>
    </div>`;

  // Call Cloudflare Email Service REST API (Email Sending)
  // API: POST /client/v4/accounts/{account_id}/email/sending/send
  // Account ID is hardcoded below — same as in /api/salon etc.
  const accountId = "973acd5a421519e1a390fe9cd75de28a";
  const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`;

  let resp;
  try {
    resp = await fetch(cfUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { address: "feedback@2017zyl.xyz", name: "Patrick Daily-Reports" },
        to:   [{ email: "patrick.l.zeng@outlook.com" }],
        subject,
        text: textBody,
        html: htmlBody,
        headers: {
          "Reply-To": from ? `patrick.l.zeng@gmail.com` : "noreply@2017zyl.xyz",
        },
      }),
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: "Email service unreachable", detail: String(e),
    }), { status: 502, headers: cors });
  }

  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return new Response(JSON.stringify({
      error: "Cloudflare Email Service rejected the send",
      status: resp.status,
      cf_errors: result.errors || [],
    }), { status: 502, headers: cors });
  }

  return new Response(JSON.stringify({
    ok: true,
    delivered: result.delivered || [],
    queued: result.queued || [],
    ts,
  }), { status: 200, headers: cors });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
