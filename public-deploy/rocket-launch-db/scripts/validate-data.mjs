#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = async name => JSON.parse(await readFile(resolve(root, 'data', name), 'utf8'));
const [launches, upcoming, stats] = await Promise.all([
  read('launches.json'), read('upcoming.json'), read('stats.json'),
]);
const errors = [];
const now = Date.now();
const terminal = new Set(['success', 'failure', 'partial_failure', 'cancelled']);

if (!Array.isArray(launches.records) || launches.records.length === 0) errors.push('launches.json has no records');
if (!Array.isArray(upcoming.records) || upcoming.records.length === 0) errors.push('upcoming.json has no future records');
for (const record of upcoming.records || []) {
  if (terminal.has(record.status)) errors.push(`${record.launch_id}: terminal status leaked into upcoming`);
  if (record.status !== 'in_flight' && Date.parse(record.net) < now) errors.push(`${record.launch_id}: elapsed window leaked into upcoming`);
}
if (Number(stats.total_launches) !== launches.records.length) errors.push('stats.total_launches does not match launches.json');
if (Number(upcoming.count) !== upcoming.records.length) errors.push('upcoming.count does not match records');
const ageMs = now - Date.parse(stats.generated_at);
if (!Number.isFinite(ageMs) || ageMs > 15 * 60_000 || ageMs < -5 * 60_000) errors.push('stats.generated_at is not fresh');

if (errors.length) {
  console.error(errors.map(error => `- ${error}`).join('\n'));
  process.exit(1);
}
console.log(JSON.stringify({
  generated_at: stats.generated_at,
  total: launches.records.length,
  upcoming: upcoming.records.length,
  pending_confirmation: upcoming.pending_confirmation_count,
}));

