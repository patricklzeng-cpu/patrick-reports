import { lookup } from "node:dns/promises";
import net from "node:net";

const MAX_HTML_BYTES = 1_000_000;
const MAX_REDIRECTS = 4;

export function findPublicUrl(text = "") {
  const match = String(text).match(/(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s，。！？]*)?/i);
  if (!match) return null;
  const raw = match[0].replace(/[),.;!?，。！？]+$/u, "");
  return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
}

export async function inspectWebsiteFromCommand(text, options = {}) {
  const target = findPublicUrl(text);
  if (!target) return null;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const lookupImpl = options.lookupImpl || lookup;
  let current = target;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicHttpUrl(current, lookupImpl);
    const response = await fetchImpl(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "PatrickOS-WebInspector/0.1 (+local read-only inspection)",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`redirect ${response.status} did not include a location`);
      current = new URL(location, current);
      continue;
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error(`expected HTML but received ${contentType || "an unknown content type"}`);
    }
    const html = await readLimitedText(response, MAX_HTML_BYTES);
    return inspectHtml(html, {
      requestedUrl: target.href,
      finalUrl: current.href,
      status: response.status,
      contentType,
    });
  }
  throw new Error(`more than ${MAX_REDIRECTS} redirects`);
}

export function inspectHtml(html, context = {}) {
  const title = firstText(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const description = attributeFromMeta(html, "description", "content");
  const lang = firstAttribute(html, /<html\b[^>]*>/i, "lang");
  const viewport = attributeFromMeta(html, "viewport", "content");
  const h1Count = countMatches(html, /<h1\b/gi);
  const h2Count = countMatches(html, /<h2\b/gi);
  const linkCount = countMatches(html, /<a\b/gi);
  const imageTags = html.match(/<img\b[^>]*>/gi) || [];
  const imagesWithAlt = imageTags.filter((tag) => /\balt\s*=\s*(?:"[^"]*"|'[^']*')/i.test(tag)).length;
  const scriptCount = countMatches(html, /<script\b/gi);
  const externalBlankLinks = (html.match(/<a\b[^>]*target\s*=\s*["']_blank["'][^>]*>/gi) || []);
  const unsafeBlankLinks = externalBlankLinks.filter((tag) => !/\brel\s*=\s*["'][^"']*noopener/i.test(tag)).length;
  const simulatedDemo = /\.onsubmit\s*=|addEventListener\s*\(\s*["']submit/i.test(html)
    && countMatches(html, /setTimeout\s*\(/g) >= 2
    && !/<form\b[^>]*\baction\s*=/i.test(html);

  const report = {
    requestedUrl: context.requestedUrl || context.finalUrl || "",
    finalUrl: context.finalUrl || context.requestedUrl || "",
    status: context.status ?? 200,
    contentType: context.contentType || "text/html",
    title,
    description,
    lang,
    viewport,
    h1Count,
    h2Count,
    linkCount,
    imageCount: imageTags.length,
    imagesWithAlt,
    scriptCount,
    unsafeBlankLinks,
    simulatedDemo,
  };
  return { ...report, ...buildWebsiteFeedback(report) };
}

export function buildWebsiteFeedback(report) {
  const findings = [];
  const recommendations = [];

  if (report.status >= 200 && report.status < 300) findings.push(`站点可访问：HTTP ${report.status}，最终地址 ${report.finalUrl}`);
  else findings.push(`站点返回 HTTP ${report.status}，需要先检查部署或路由。`);
  findings.push(report.title ? `页面标题清晰：${report.title}` : "页面缺少 title。 ");
  if (report.lang) findings.push(`已声明页面语言 ${report.lang}，并包含 ${report.h1Count} 个 H1、${report.linkCount} 个链接。`);
  if (report.simulatedDemo) {
    findings.push("当前命令交互是前端定时动画与预设输出，尚未连接真实 Agent 任务后端；这也是用户会感觉“有变化、没反馈”的直接原因。");
    recommendations.push("把 RUN 表单接到真实任务 API，并让页面消费 SSE/WebSocket 事件及最终 Result，而不是用 setTimeout 推进阶段。");
  }
  if (!report.description) recommendations.push("补充 meta description，明确 OpenSwarm 的价值与目标用户，改善搜索摘要和分享预览。");
  if (!report.viewport) recommendations.push("补充 viewport meta，保证移动端布局按设备宽度渲染。");
  if (report.h1Count !== 1) recommendations.push(`调整为且仅保留一个 H1；当前检测到 ${report.h1Count} 个。`);
  if (report.imageCount > 0 && report.imagesWithAlt < report.imageCount) {
    recommendations.push(`为图片补齐替代文本；当前 ${report.imagesWithAlt}/${report.imageCount} 张图片声明了 alt。`);
  }
  if (report.unsafeBlankLinks > 0) recommendations.push(`为 ${report.unsafeBlankLinks} 个新窗口链接添加 rel="noopener noreferrer"。`);
  if (!recommendations.length) recommendations.push("结构性检查未发现明显阻塞项；下一步应做真实浏览器交互、性能与可访问性审计。");

  return {
    findings,
    recommendations,
    summary: report.simulatedDemo
      ? "视觉入口已经成立，但核心交互仍是演示动画；优先把命令、执行事件和最终答案接成真实闭环。"
      : "站点已完成一次真实的网络与 HTML 结构检查，结果和改进项如下。",
  };
}

async function assertPublicHttpUrl(url, lookupImpl) {
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("only http and https URLs are supported");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) throw new Error("local network destinations are blocked");
  const addresses = net.isIP(hostname)
    ? [{ address: hostname }]
    : await lookupImpl(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("private or reserved network destinations are blocked");
  }
}

export function isPrivateAddress(address) {
  const normalized = String(address).toLowerCase().replace(/^::ffff:/, "");
  if (net.isIPv4(normalized)) {
    const [a, b] = normalized.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168);
  }
  if (net.isIPv6(normalized)) {
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc")
      || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9")
      || normalized.startsWith("fea") || normalized.startsWith("feb");
  }
  return true;
}

async function readLimitedText(response, limit) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > limit) throw new Error(`HTML is larger than ${limit} bytes`);
  if (!response.body?.getReader) return (await response.text()).slice(0, limit);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > limit) {
      await reader.cancel();
      throw new Error(`HTML is larger than ${limit} bytes`);
    }
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}

function firstText(html, pattern) {
  const value = html.match(pattern)?.[1] || "";
  return decodeEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function firstAttribute(html, tagPattern, name) {
  const tag = html.match(tagPattern)?.[0] || "";
  return attribute(tag, name);
}

function attributeFromMeta(html, nameValue, attributeName) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const tag = tags.find((candidate) => new RegExp(`\\b(?:name|property)\\s*=\\s*["']${nameValue}["']`, "i").test(candidate));
  return tag ? attribute(tag, attributeName) : "";
}

function attribute(tag, name) {
  return decodeEntities(tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, "i"))?.slice(1).find(Boolean) || "");
}

function countMatches(value, pattern) {
  return (value.match(pattern) || []).length;
}

function decodeEntities(value) {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'");
}
