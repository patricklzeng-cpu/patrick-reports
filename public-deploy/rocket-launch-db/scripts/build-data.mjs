#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = resolve(ROOT, 'data');
const LL2_BASE = 'https://ll.thespacedevs.com/2.3.0/launches';
const TERMINAL = new Set(['success', 'failure', 'partial_failure', 'cancelled']);
const HISTORICAL = new Set(['attempted', 'scratch']);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function imageUrl(value) {
  if (typeof value === 'string') return value;
  return value?.image_url || value?.thumbnail_url || null;
}

function countryName(record) {
  return record?.pad?.country?.name
    || record?.pad?.location?.country?.name
    || record?.launch_service_provider?.country?.[0]?.name
    || 'Unknown';
}

export function canonicalStatus(rawStatus) {
  const name = text(rawStatus?.name || rawStatus).toLowerCase();
  const abbrev = text(rawStatus?.abbrev).toLowerCase();
  const combined = `${name} ${abbrev}`;
  if (/partial/.test(combined) && /fail/.test(combined)) return 'partial_failure';
  if (/success/.test(combined)) return 'success';
  if (/fail/.test(combined)) return 'failure';
  if (/cancel/.test(combined)) return 'cancelled';
  if (/attempt/.test(combined)) return 'attempted';
  if (/scratch/.test(combined)) return 'scratch';
  if (/flight|liftoff|lift-off/.test(combined)) return 'in_flight';
  if (/hold/.test(combined)) return 'hold';
  if (/confirm|\btbc\b/.test(combined)) return 'tbc';
  if (/determin|\btbd\b/.test(combined)) return 'tbd';
  if (/\bgo\b|scheduled|upcoming/.test(combined)) return 'go';
  return 'upcoming';
}

export function applyLifecycle(record, now = new Date()) {
  const result = { ...record };
  const status = canonicalStatus(record.status_raw || record.status);
  const netMs = Date.parse(record.net || '');
  if (TERMINAL.has(status)) {
    result.status = status;
    result.lifecycle = 'history';
    result.confirmed_terminal = true;
  } else if (HISTORICAL.has(status)) {
    result.status = status;
    result.lifecycle = 'history';
    result.confirmed_terminal = false;
  } else if (status === 'in_flight') {
    result.status = 'in_flight';
    result.lifecycle = 'in_flight';
    result.confirmed_terminal = false;
  } else if (Number.isFinite(netMs) && netMs < now.getTime()) {
    result.status = 'window_elapsed';
    result.lifecycle = 'pending_confirmation';
    result.confirmed_terminal = false;
  } else {
    result.status = status === 'upcoming' ? 'upcoming' : status;
    result.lifecycle = 'upcoming';
    result.confirmed_terminal = false;
  }
  return result;
}

function prepareExisting(record) {
  if (!String(record?.launch_id || '').startsWith('gcat:')) return record;
  const orbpay = text(record.orbpay).toUpperCase();
  // Re-derive every run: earlier broken builds may have persisted window_elapsed.
  let status = null;
  if (['OS', 'MS', 'S'].includes(orbpay)) status = 'success';
  else if (['OF', 'MF', 'F'].includes(orbpay)) status = 'failure';
  else if (orbpay === 'PF') status = 'partial_failure';
  status = status || 'attempted';
  return { ...record, status, status_raw: status, status_source: 'GCAT' };
}

export function normalizeLl2(record, now = new Date()) {
  const configuration = record?.rocket?.configuration || {};
  const provider = record?.launch_service_provider || configuration?.manufacturer || {};
  const location = text(record?.pad?.location?.name);
  const pad = text(record?.pad?.name);
  const site = [location, pad].filter(Boolean).filter((value, index, values) => {
    return index === 0 || !values[0].includes(value);
  }).join(' · ') || 'Unknown';
  const statusRaw = record?.status?.name || record?.status || 'Upcoming';
  const normalized = {
    launch_id: `ll2:${record.id}`,
    name: record.name || configuration.full_name || configuration.name || record.id,
    provider: provider.name || 'Unknown',
    vehicle: configuration.full_name || configuration.name || 'Unknown',
    website: provider.info_url || configuration.info_url || null,
    country: countryName(record),
    site,
    net: record.net,
    status_raw: statusRaw,
    status_source: 'LL2',
    orbit: record?.mission?.orbit?.abbrev || record?.mission?.orbit?.name || 'Unknown',
    rocket_config_id: configuration.id || null,
    pad_id: record?.pad?.id || null,
    location_id: record?.pad?.location?.id || null,
    agency_id: provider.id || null,
    sources: ['LL2'],
    source_conflicts: [],
    verification: { celestrak: false, spacetrack: false, unoosa: false },
    objects: [],
    updated_at: record.last_updated || record.updated_at || null,
    image: imageUrl(record.image) || imageUrl(configuration.image),
    mission_description: record?.mission?.description || null,
    webcast_live: Boolean(record.webcast_live),
    vid_urls: record.vidURLs || record.vid_urls || record?.mission?.vid_urls || [],
    info_urls: record.infoURLs || record.info_urls || record?.mission?.info_urls || [],
    latitude: record?.pad?.latitude ?? record?.pad?.location?.latitude ?? null,
    longitude: record?.pad?.longitude ?? record?.pad?.location?.longitude ?? null,
    last_checked_at: now.toISOString(),
  };
  return applyLifecycle(normalized, now);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'rocket-launch-db/5.0 (+https://2017zyl.xyz/rocket-launch-db/)' },
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText} for ${url}`);
        error.retryAfter = Number(response.headers.get('retry-after')) || 0;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const waitMs = Math.min(30_000, Math.max(error.retryAfter * 1000 || 0, attempt * 2_000));
      await new Promise(resolvePromise => setTimeout(resolvePromise, waitMs));
    }
  }
  throw lastError;
}

async function fetchPages(endpoint, pageCount) {
  const records = [];
  for (let offsetPage = 0; offsetPage < pageCount; offsetPage += 1) {
    const url = `${LL2_BASE}/${endpoint}/?limit=100&offset=${offsetPage * 100}&mode=detailed`;
    const payload = await fetchJson(url);
    const pageRecords = Array.isArray(payload.results) ? payload.results : [];
    records.push(...pageRecords);
    if (!payload.next || pageRecords.length === 0) break;
  }
  return records;
}

function sourceCounts(records) {
  const counts = new Map();
  for (const record of records) {
    for (const source of record.sources || []) counts.set(source, (counts.get(source) || 0) + 1);
  }
  return [...counts].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);
}

export function buildOutputs({ existingLaunches = [], upcomingRaw = [], previousRaw = [], now = new Date() }) {
  const recordsById = new Map();
  for (const existing of existingLaunches) {
    if (!existing?.launch_id || !existing?.net) continue;
    recordsById.set(existing.launch_id, applyLifecycle(prepareExisting(existing), now));
  }
  for (const raw of [...previousRaw, ...upcomingRaw]) {
    if (!raw?.id || !raw?.net) continue;
    const normalized = normalizeLl2(raw, now);
    recordsById.set(normalized.launch_id, normalized);
  }

  const records = [...recordsById.values()].sort((a, b) => Date.parse(b.net) - Date.parse(a.net));
  const future = records.filter(record => record.lifecycle === 'upcoming' || record.lifecycle === 'in_flight')
    .sort((a, b) => Date.parse(a.net) - Date.parse(b.net));
  const pendingConfirmation = records.filter(record => record.lifecycle === 'pending_confirmation')
    .sort((a, b) => Date.parse(b.net) - Date.parse(a.net));
  const in30 = now.getTime() + 30 * 86_400_000;
  const statusCounts = {};
  for (const record of records) statusCounts[record.status] = (statusCounts[record.status] || 0) + 1;

  return {
    launches: {
      generated_at: now.toISOString(),
      schema_version: '3.0',
      source: 'GCAT preserved + LL2 upcoming/previous reconciliation',
      records,
    },
    upcoming: {
      generated_at: now.toISOString(),
      schema_version: '3.0',
      source: 'The Space Devs Launch Library 2',
      count: future.length,
      pending_confirmation_count: pendingConfirmation.length,
      records: future,
      pending_confirmation: pendingConfirmation.slice(0, 50),
    },
    stats: {
      generated_at: now.toISOString(),
      total_launches: records.length,
      upcoming_30d: future.filter(record => {
        const net = Date.parse(record.net);
        return net >= now.getTime() && net <= in30;
      }).length,
      pending_confirmation: pendingConfirmation.length,
      status_counts: statusCounts,
      source_contributions: sourceCounts(records),
      ll2_refreshed: upcomingRaw.length + previousRaw.length,
    },
  };
}

async function main() {
  const now = process.env.BUILD_NOW ? new Date(process.env.BUILD_NOW) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid BUILD_NOW: ${process.env.BUILD_NOW}`);
  const existing = await readJson(resolve(DATA_DIR, 'launches.json'), { records: [] });
  const offlineDir = process.env.LL2_FIXTURE_DIR;
  let upcomingRaw;
  let previousRaw;
  if (offlineDir) {
    const upcoming = await readJson(resolve(offlineDir, 'upcoming.json'), { results: [] });
    const previous = await readJson(resolve(offlineDir, 'previous.json'), { results: [] });
    upcomingRaw = upcoming.results || [];
    previousRaw = previous.results || [];
  } else {
    const upcomingPages = Math.max(1, Number(process.env.LL2_UPCOMING_PAGES || 2));
    const previousPages = Math.max(1, Number(process.env.LL2_PREVIOUS_PAGES || 1));
    [upcomingRaw, previousRaw] = await Promise.all([
      fetchPages('upcoming', upcomingPages),
      fetchPages('previous', previousPages),
    ]);
  }
  if (upcomingRaw.length === 0) throw new Error('LL2 returned zero upcoming launches; refusing to overwrite good data');

  const outputs = buildOutputs({
    existingLaunches: existing.records || [],
    upcomingRaw,
    previousRaw,
    now,
  });
  await Promise.all([
    atomicJson(resolve(DATA_DIR, 'launches.json'), outputs.launches),
    atomicJson(resolve(DATA_DIR, 'upcoming.json'), outputs.upcoming),
    atomicJson(resolve(DATA_DIR, 'stats.json'), outputs.stats),
  ]);
  console.log(JSON.stringify({
    generated_at: outputs.stats.generated_at,
    total: outputs.stats.total_launches,
    upcoming: outputs.upcoming.count,
    pending_confirmation: outputs.upcoming.pending_confirmation_count,
    ll2_refreshed: outputs.stats.ll2_refreshed,
  }));
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
