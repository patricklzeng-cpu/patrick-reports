#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const requestedRoot = process.argv[2];
if (!requestedRoot) {
  console.error("usage: scan-pages-release.mjs <release-directory>");
  process.exit(64);
}

const root = fs.realpathSync(requestedRoot);
const rootPrefix = `${root}${path.sep}`;
const findings = [];
let regularFiles = 0;
let compressedFiles = 0;

const patterns = [
  ["private workstation path", /(?:\/Users\/(?!you\/)[A-Za-z0-9._-]+\/|\/home\/(?!user\/)[A-Za-z0-9._-]+\/|[A-Za-z]:\\[Uu]sers\\(?!user\\))/],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["AWS access key", /(?:^|[^A-Za-z0-9])AKIA[0-9A-Z]{16}(?:$|[^A-Za-z0-9])/],
  ["Google API key", /(?:^|[^A-Za-z0-9])AIza[0-9A-Za-z_-]{35}(?:$|[^A-Za-z0-9_-])/],
  ["GitHub token", /(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})/],
  ["GitLab token", /(?:^|[^A-Za-z0-9])glpat-[A-Za-z0-9_-]{20,}(?:$|[^A-Za-z0-9_-])/],
  ["npm token", /(?:^|[^A-Za-z0-9])npm_[A-Za-z0-9]{20,}(?:$|[^A-Za-z0-9])/],
  ["LLM API key", /(?:sk-or-v1-[A-Za-z0-9_-]{20,}|sk-cp-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{30,}|sk-ant-api03-[A-Za-z0-9_-]{30,}|(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9]{32,}(?:$|[^A-Za-z0-9]))/],
  ["Hugging Face token", /(?:^|[^A-Za-z0-9])hf_[A-Za-z0-9]{20,}(?:$|[^A-Za-z0-9])/],
  ["Stripe secret", /(?:^|[^A-Za-z0-9])(?:sk|rk)_live_[A-Za-z0-9]{16,}(?:$|[^A-Za-z0-9])/],
  ["Stripe webhook secret", /(?:^|[^A-Za-z0-9])whsec_[A-Za-z0-9]{16,}(?:$|[^A-Za-z0-9])/],
  ["Slack token", /(?:^|[^A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{20,}(?:$|[^A-Za-z0-9-])/],
  ["Slack webhook", /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{30,}/i],
  ["Discord webhook", /https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/[0-9]{16,20}\/[A-Za-z0-9_-]{40,}/i],
  ["Telegram bot token", /(?:^|[^0-9])[0-9]{8,10}:[A-Za-z0-9_-]{35}(?:$|[^A-Za-z0-9_-])/],
  ["JWT", /(?:^|[^A-Za-z0-9_-])eyJhbGciOi[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:$|[^A-Za-z0-9_-])/],
  ["credentialed database URL", /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^/\s:@]+:[^@\s/]+@/i],
  ["sensitive variable assignment", /(?:FRED_API_KEY|CLOUDFLARE_API_TOKEN|CF_API_TOKEN|OPENROUTER_API_KEY|MINIMAX_(?:API_KEY|TOKEN)|ANTHROPIC_API_KEY|OPENAI_API_KEY)\s*(?:=|:)\s*["']?(?!process\.env\b|env\.|your[_-]?|replace|example|placeholder|<)[A-Za-z0-9_./+\-=]{16,}/i],
];

function relative(file) {
  return path.relative(root, file) || ".";
}

function scanBuffer(buffer, file, labelSuffix = "") {
  const text = buffer.toString("latin1");
  for (const [label, pattern] of patterns) {
    if (pattern.test(text)) findings.push(`${label}${labelSuffix}: ${relative(file)}`);
  }
}

function uint16(buffer, offset, littleEndian) {
  return littleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
}

function uint32(buffer, offset, littleEndian) {
  return littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
}

function tiffHasGps(tiff) {
  if (tiff.length < 8) return false;
  const marker = tiff.toString("ascii", 0, 2);
  if (marker !== "II" && marker !== "MM") return false;
  const littleEndian = marker === "II";
  if (uint16(tiff, 2, littleEndian) !== 42) return false;
  const ifdOffset = uint32(tiff, 4, littleEndian);
  if (ifdOffset + 2 > tiff.length) return false;
  const count = uint16(tiff, ifdOffset, littleEndian);
  for (let index = 0; index < count; index += 1) {
    const entryOffset = ifdOffset + 2 + (index * 12);
    if (entryOffset + 12 > tiff.length) return false;
    if (uint16(tiff, entryOffset, littleEndian) === 0x8825) return true;
  }
  return false;
}

function imageHasGps(buffer, extension) {
  const exifMarker = Buffer.from("Exif\0\0", "binary");
  const exifIndex = buffer.indexOf(exifMarker);
  if (exifIndex >= 0 && tiffHasGps(buffer.subarray(exifIndex + exifMarker.length))) return true;

  if (extension === ".png") {
    let offset = 8;
    while (offset + 12 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString("ascii", offset + 4, offset + 8);
      if (offset + 12 + length > buffer.length) break;
      if (type === "eXIf" && tiffHasGps(buffer.subarray(offset + 8, offset + 8 + length))) return true;
      offset += 12 + length;
    }
  }

  return false;
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      let resolved;
      try {
        resolved = fs.realpathSync(file);
      } catch {
        findings.push(`broken symbolic link: ${relative(file)}`);
        continue;
      }
      if (resolved !== root && !resolved.startsWith(rootPrefix)) {
        findings.push(`symbolic link leaves release directory: ${relative(file)}`);
      }
      continue;
    }
    if (entry.isDirectory()) {
      walk(file);
      continue;
    }
    if (!entry.isFile()) continue;

    regularFiles += 1;
    const buffer = fs.readFileSync(file);
    scanBuffer(buffer, file);

    const extension = path.extname(entry.name).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".tif", ".tiff"].includes(extension)
      && imageHasGps(buffer, extension)) {
      findings.push(`image GPS metadata: ${relative(file)}`);
    }

    if (extension === ".br") {
      compressedFiles += 1;
      try {
        scanBuffer(zlib.brotliDecompressSync(buffer), file, " in Brotli payload");
      } catch {
        findings.push(`invalid Brotli payload: ${relative(file)}`);
      }
    } else if (extension === ".gz") {
      compressedFiles += 1;
      try {
        scanBuffer(zlib.gunzipSync(buffer), file, " in gzip payload");
      } catch {
        findings.push(`invalid gzip payload: ${relative(file)}`);
      }
    }
  }
}

walk(root);

if (findings.length > 0) {
  console.error("release safety scan failed:");
  for (const finding of [...new Set(findings)].sort()) console.error(`- ${finding}`);
  process.exit(68);
}

console.log(`release safety scan passed: ${regularFiles} files, ${compressedFiles} compressed payloads`);
